/**
 * AGENT 3 · Clustering pipeline (RawMention[] → Cluster[]).
 * ---------------------------------------------
 * Maintains an in-memory LSH index that maps each LSH band hash to the
 * set of cluster ids sharing that band. New mentions are matched through
 * a 3-stage gate:
 *
 *   1. LSH band collision → candidate clusters.
 *   2. Exact Jaccard on MinHash signatures ≥ 0.85.
 *   3. Embedding cosine ≥ 0.78 against the cluster centroid.
 *   4. Rigid Entity Veto: if either side has conflicting brand/product/
 *      model/cve/cashtag entities, refuse the merge.
 *
 * If a mention survives all gates, it is assigned to the matching cluster
 * and the cluster centroid is updated. Otherwise a new cluster is created.
 *
 * State is in-memory. The cluster's `signatureHash` is a content-derived
 * stable identifier so clusters can be persisted & re-hydrated across
 * restarts and remain identifiable.
 *
 * Emits a `ClusterUpdated` event whenever a cluster's mention set changes,
 * so downstream subscribers (scoring pipeline, SSE broadcaster) can react.
 *
 * Companion: doc_backend_extracted.md §6, task spec.
 */
import type { Cluster, Entity, RawMention, SourceKey } from '@/lib/types'
import { ALL_SOURCES } from '@/lib/types'
import {
  DEFAULT_BANDS,
  DEFAULT_NUM_PERM,
  DEFAULT_ROWS,
  JACCARD_THRESHOLD,
  jaccardFromSignatures,
  lshBands,
  minhashSignature,
  signatureStableHash,
} from './minhash'
import {
  EMBEDDING_SIMILARITY_THRESHOLD,
  cosineSimilarity,
  embedText,
  embeddingCentroid,
} from './embeddings'
import { entitiesRigidVeto, extractEntities } from './ner'

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------
type MentionId = string

/** Mutable in-memory state for one cluster. */
export interface ClusterState {
  /** Stable content-derived id (prefix of signatureHash + monotonic suffix). */
  id: string
  /** Stable hash of the MinHash signature — survives restarts. */
  signatureHash: string
  /** Representative MinHash signature (from the originator mention). */
  signature: Uint32Array
  /** Cluster centroid embedding (L2-normalized). */
  embedding: Float32Array
  /** All embeddings for the cluster's mentions (for centroid recompute). */
  embeddings: Float32Array[]
  /** Distinct mention ids assigned to this cluster. */
  mentionIds: Set<MentionId>
  /** All mentions (in insertion order). */
  mentions: RawMention[]
  /** Union of entities across all mentions (dedup by type+value). */
  entities: Entity[]
}

/** Result of `clusterMentions`: per-cluster slice of mentions that were assigned. */
export interface ClusterResult {
  clusterId: string
  mentions: RawMention[]
}

// ---------------------------------------------------------------------------
// In-memory LSH index + cluster registry
// ---------------------------------------------------------------------------
/** LSH band hash → set of cluster ids sharing that band. */
const lshIndex = new Map<string, Set<string>>()
/** Cluster id → mutable state. */
const clusters = new Map<string, ClusterState>()

// Monotonic counter to break ties when two clusters happen to share the same
// signatureHash (rare but possible for empty / very-short mentions).
let clusterCounter = 0

// ---------------------------------------------------------------------------
// Event emitter — ClusterUpdated
// ---------------------------------------------------------------------------
export type ClusterUpdatedListener = (
  clusterId: string,
  mentions: RawMention[],
) => void

const listeners: ClusterUpdatedListener[] = []

/** Subscribe to ClusterUpdated events. Returns an unsubscribe function. */
export function onClusterUpdated(listener: ClusterUpdatedListener): () => void {
  listeners.push(listener)
  return () => {
    const idx = listeners.indexOf(listener)
    if (idx >= 0) listeners.splice(idx, 1)
  }
}

function emitClusterUpdated(clusterId: string, mentions: RawMention[]): void {
  for (const l of listeners) {
    try {
      l(clusterId, mentions)
    } catch {
      // Listener errors must not break the pipeline. Swallow.
    }
  }
}

// ---------------------------------------------------------------------------
// Public helpers — introspection & reset (mostly for tests + warm-restart).
// ---------------------------------------------------------------------------
/** Returns a snapshot of all known cluster ids. */
export function listClusterIds(): string[] {
  return Array.from(clusters.keys())
}

/** Returns the live state for a cluster id (read-only view). */
export function getClusterState(id: string): ClusterState | undefined {
  return clusters.get(id)
}

/** Clear all in-memory state. Used by tests and warm restarts. */
export function resetClusterIndex(): void {
  lshIndex.clear()
  clusters.clear()
  clusterCounter = 0
}

// ---------------------------------------------------------------------------
// Mention id helper
// ---------------------------------------------------------------------------
function mentionIdOf(m: RawMention): MentionId {
  return `${m.source}:${m.externalId}`
}

// ---------------------------------------------------------------------------
// Cluster creation
// ---------------------------------------------------------------------------
function createNewCluster(
  mention: RawMention,
  sig: Uint32Array,
  bands: string[],
  entities: Entity[],
): ClusterState {
  const sigHash = signatureStableHash(sig)
  clusterCounter++
  const id = `${sigHash}_${clusterCounter.toString(36)}`
  const emb = embedText(mention.text)
  const state: ClusterState = {
    id,
    signatureHash: sigHash,
    signature: sig,
    embedding: emb,
    embeddings: [emb],
    mentionIds: new Set<MentionId>(),
    mentions: [],
    entities,
  }
  clusters.set(id, state)
  // Insert into LSH index.
  for (const band of bands) {
    let bucket = lshIndex.get(band)
    if (!bucket) {
      bucket = new Set<string>()
      lshIndex.set(band, bucket)
    }
    bucket.add(id)
  }
  return state
}

// ---------------------------------------------------------------------------
// Cluster growth
// ---------------------------------------------------------------------------
function addMentionToCluster(
  state: ClusterState,
  mention: RawMention,
  mentionEntities: Entity[],
): void {
  const mid = mentionIdOf(mention)
  if (state.mentionIds.has(mid)) return
  state.mentionIds.add(mid)
  state.mentions.push(mention)
  // Merge entities (dedup by type+value).
  const seen = new Set<string>(state.entities.map((e) => `${e.type}:${e.value}`))
  for (const e of mentionEntities) {
    const key = `${e.type}:${e.value}`
    if (!seen.has(key)) {
      seen.add(key)
      state.entities.push(e)
    }
  }
  // Update embedding centroid. Recompute from scratch for determinism
  // (running average would depend on insertion order; recomputing from the
  // full set is O(n·d) which is fine for cluster sizes ≤ a few hundred).
  const emb = embedText(mention.text)
  state.embeddings.push(emb)
  state.embedding = embeddingCentroid(state.embeddings)
}

// ---------------------------------------------------------------------------
// clusterMentions — main entry point.
// ---------------------------------------------------------------------------
/**
 * Assign each mention in `mentions` to a cluster, creating new clusters
 * when no existing cluster matches.
 *
 * The function is deterministic given the input order: it processes
 * mentions in the order they appear in the input array, so callers that
 * want stable cluster ids across runs should pre-sort mentions by
 * publishedAt.
 *
 * @returns Array of { clusterId, mentions } for every cluster that received
 *          at least one new mention in this batch.
 */
export function clusterMentions(mentions: RawMention[]): ClusterResult[] {
  const results = new Map<string, RawMention[]>()

  for (const mention of mentions) {
    // 1. Compute MinHash signature + LSH bands.
    const sig = minhashSignature(mention.text, DEFAULT_NUM_PERM)
    const bands = lshBands(sig, DEFAULT_BANDS, DEFAULT_ROWS)
    const mentionEntities = extractEntities(mention.text)

    // 2. Collect candidate cluster ids from LSH buckets.
    const candidateIds = new Set<string>()
    for (const band of bands) {
      const bucket = lshIndex.get(band)
      if (bucket) for (const cid of bucket) candidateIds.add(cid)
    }

    // 3. For each candidate, run the 3-stage gate.
    let assigned: ClusterState | null = null
    for (const cid of candidateIds) {
      const cluster = clusters.get(cid)
      if (!cluster) continue

      // Stage A: exact Jaccard ≥ 0.85.
      const jac = jaccardFromSignatures(sig, cluster.signature)
      if (jac < JACCARD_THRESHOLD) continue

      // Stage B: embedding cosine ≥ 0.78.
      const mentionEmb = embedText(mention.text)
      const cos = cosineSimilarity(mentionEmb, cluster.embedding)
      if (cos < EMBEDDING_SIMILARITY_THRESHOLD) continue

      // Stage C: rigid entity veto.
      if (entitiesRigidVeto(mentionEntities, cluster.entities)) continue

      // All gates passed → assign.
      assigned = cluster
      break
    }

    // 4. Create a new cluster if nothing matched.
    if (!assigned) {
      assigned = createNewCluster(mention, sig, bands, mentionEntities)
    }

    // 5. Add the mention to the cluster.
    addMentionToCluster(assigned, mention, mentionEntities)

    // 6. Emit ClusterUpdated event.
    emitClusterUpdated(assigned.id, assigned.mentions)

    // 7. Record in results map.
    let bucket = results.get(assigned.id)
    if (!bucket) {
      bucket = []
      results.set(assigned.id, bucket)
    }
    bucket.push(mention)
  }

  return Array.from(results.entries()).map(([clusterId, ms]) => ({
    clusterId,
    mentions: ms,
  }))
}

// ---------------------------------------------------------------------------
// clusterToClusterDTO — ClusterState + mentions → Cluster (DB-shape).
// ---------------------------------------------------------------------------
/**
 * Build a Cluster DTO from internal cluster state + the slice of mentions
 * assigned to it. Score/shape/phase/velocity/trashPenalty/isTrending are
 * left as sensible defaults; the scoring module fills them in.
 *
 *  - title        : shortest non-empty text from the top-3 most-recent
 *                   mentions (extractive, preserves the user voice).
 *  - summary      : first 200 chars of the longest mention's text.
 *  - primarySource: most frequent source.
 *  - sources      : unique sources in order of first appearance.
 *  - sourceCounts : per-source counts (all 7 sources initialized to 0).
 *  - languages    : unique languages.
 *  - entities     : union across all mentions, deduped, first 20.
 *  - firstSeen    : min(publishedAt).
 *  - lastSeen     : max(publishedAt).
 *  - mentionsCount: total mentions assigned.
 *  - uniqueAuthors: distinct authorId count.
 *  - originator   : earliest mention's author.
 */
export function clusterToClusterDTO(
  cluster: ClusterState,
  mentions: RawMention[],
): Cluster {
  if (mentions.length === 0) {
    // Defensive: an empty cluster should never reach this point, but
    // produce a well-typed object if it does.
    return {
      id: cluster.id,
      signatureHash: cluster.signatureHash,
      title: '',
      summary: '',
      primarySource: 'hn',
      sources: [],
      languages: [],
      entities: [],
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      mentionsCount: 0,
      uniqueAuthors: 0,
      shape: 'flat',
      phase: 'forming',
      velocity: 0,
      score: 0,
      trashPenalty: 0,
      isTrending: false,
      sourceCounts: emptySourceCounts(),
    }
  }

  // Sort by publishedAt ascending (oldest first).
  const sorted = [...mentions].sort(
    (a, b) =>
      new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
  )

  // --- Title: shortest non-empty text from top-3 most-recent ---
  const top3 = sorted.slice(-3).reverse() // most recent first
  let title = ''
  let shortestLen = Infinity
  for (const m of top3) {
    const t = m.text.trim()
    if (t.length > 0 && t.length < shortestLen) {
      shortestLen = t.length
      title = t
    }
  }
  if (!title) title = sorted[0]?.text.trim().slice(0, 100) ?? ''
  if (title.length > 140) title = `${title.slice(0, 137)}...`

  // --- Summary: first 200 chars of the longest mention ---
  let longest = sorted[0]
  for (const m of sorted) {
    if (m.text.length > longest.text.length) longest = m
  }
  const summary = longest.text.slice(0, 200)

  // --- sourceCounts (all 7 sources initialized to 0) ---
  const sourceCounts = emptySourceCounts()
  for (const m of mentions) sourceCounts[m.source]++

  // --- primarySource: most frequent (ties broken by first-seen order) ---
  const sourceFirstSeen = new Map<SourceKey, number>()
  sorted.forEach((m, i) => {
    if (!sourceFirstSeen.has(m.source)) sourceFirstSeen.set(m.source, i)
  })
  let primarySource: SourceKey = sorted[0]!.source
  let maxCount = 0
  for (const k of ALL_SOURCES) {
    const c = sourceCounts[k]
    if (c > maxCount || (c === maxCount && c > 0 && primarySource === undefined)) {
      maxCount = c
      primarySource = k
    }
  }
  // Ensure primarySource is the most frequent (re-scan, ties → earliest).
  {
    const candidates = ALL_SOURCES.filter((k) => sourceCounts[k] === maxCount && maxCount > 0)
    if (candidates.length > 0) {
      candidates.sort(
        (a, b) =>
          (sourceFirstSeen.get(a) ?? Number.MAX_SAFE_INTEGER) -
          (sourceFirstSeen.get(b) ?? Number.MAX_SAFE_INTEGER),
      )
      primarySource = candidates[0]!
    }
  }

  // --- sources (unique, in first-seen order) ---
  const sources: SourceKey[] = []
  const srcSeen = new Set<SourceKey>()
  for (const m of sorted) {
    if (!srcSeen.has(m.source)) {
      srcSeen.add(m.source)
      sources.push(m.source)
    }
  }

  // --- languages (unique) ---
  const langSeen = new Set<string>()
  const languages: string[] = []
  for (const m of mentions) {
    const lang = m.language ?? 'unknown'
    if (!langSeen.has(lang)) {
      langSeen.add(lang)
      languages.push(lang)
    }
  }

  // --- entities (union across all mentions, dedup, first 20) ---
  const entSeen = new Set<string>()
  const entities: Entity[] = []
  for (const m of mentions) {
    const ents = extractEntities(m.text)
    for (const e of ents) {
      const key = `${e.type}:${e.value}`
      if (!entSeen.has(key)) {
        entSeen.add(key)
        entities.push(e)
        if (entities.length >= 20) break
      }
    }
    if (entities.length >= 20) break
  }

  // --- time bounds ---
  const firstSeen = sorted[0]!.publishedAt
  const lastSeen = sorted[sorted.length - 1]!.publishedAt

  // --- unique authors ---
  const authorSet = new Set<string>()
  for (const m of mentions) authorSet.add(m.authorId)

  // --- originator (earliest mention's author) ---
  const earliest = sorted[0]!
  const originator: Cluster['originator'] = {
    source: earliest.source,
    author: earliest.authorHandle ?? earliest.authorId,
    url: earliest.url,
    lagSeconds: 0,
  }

  return {
    id: cluster.id,
    signatureHash: cluster.signatureHash,
    title,
    summary,
    primarySource,
    sources,
    languages,
    entities,
    firstSeen,
    lastSeen,
    mentionsCount: mentions.length,
    uniqueAuthors: authorSet.size,
    shape: 'flat',
    phase: 'forming',
    velocity: 0,
    score: 0,
    originator,
    trashPenalty: 0,
    isTrending: false,
    sourceCounts,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function emptySourceCounts(): Record<SourceKey, number> {
  const out = {} as Record<SourceKey, number>
  for (const k of ALL_SOURCES) out[k] = 0
  return out
}
