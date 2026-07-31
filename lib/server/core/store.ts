/**
 * FASE 2 — Agent-CoreEngine
 *
 * Deduplication (MinHash LSH) + Embedding fallback (TF-IDF char n-grams) +
 * NER (regex + dict, with optional LLM upgrade) + Rigid Veto + Clustering +
 * Scoring (Π pᵢ weighted) + EWMA velocity + Shape detection + Phase detection.
 *
 * In-memory state: clusters, mentions index, LSH buckets, embeddings cache.
 */

import type {
  Cluster,
  Entity,
  EntityType,
  Phase,
  RawMention,
  Shape,
  SourceKey,
  Trend,
  TrendTone,
  TrendDir,
} from '@/lib/types'
import { ALL_SOURCES } from '@/lib/types'
import { fnv1a64, normalizeText } from '@/lib/server/hash'
import { logger } from '@/lib/server/logger'

// ---------------------------------------------------------------------------
// MinHash LSH
// ---------------------------------------------------------------------------
const NUM_PERM = 128
const BANDS = 32
const ROWS = 4
const JACCARD_THRESHOLD = 0.85

function hashToken(token: string, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < token.length; i++) {
    h = (h ^ token.charCodeAt(i)) >>> 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

function minhashSignature(text: string): Uint32Array {
  const tokens = normalizeText(text).split(/\s+/).filter(Boolean)
  const sig = new Uint32Array(NUM_PERM)
  for (let i = 0; i < NUM_PERM; i++) {
    const a = (i + 1) >>> 0
    const b = ((i * 7919) % 2147483646 + 1) >>> 0
    let min = 0xffffffff
    for (const tok of tokens) {
      const h = (Math.imul(a, hashToken(tok, i + 1)) + b) >>> 0
      if (h < min) min = h
    }
    sig[i] = min
  }
  return sig
}

function lshBands(sig: Uint32Array): string[] {
  const bands: string[] = []
  for (let b = 0; b < BANDS; b++) {
    let s = ''
    for (let r = 0; r < ROWS; r++) {
      s += sig[b * ROWS + r].toString(36) + '-'
    }
    bands.push(fnv1a64(s))
  }
  return bands
}

function jaccardFromSignatures(a: Uint32Array, b: Uint32Array): number {
  let eq = 0
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) eq++
  return eq / a.length
}

// ---------------------------------------------------------------------------
// Embedding fallback — TF-IDF char n-gram 384-dim vector
// ---------------------------------------------------------------------------
const EMBED_DIM = 384
const NGRAM_SIZE = 3

function hashNgram(ngram: string): number {
  // FNV-1a 32-bit, then mod EMBED_DIM
  let h = 0x811c9dc5
  for (let i = 0; i < ngram.length; i++) {
    h ^= ngram.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) % EMBED_DIM
}

function embedText(text: string): Float32Array {
  const vec = new Float32Array(EMBED_DIM)
  const normalized = normalizeText(text)
  if (!normalized) return vec
  const chars = ` ${normalized} `
  for (let i = 0; i + NGRAM_SIZE <= chars.length; i++) {
    const ng = chars.slice(i, i + NGRAM_SIZE)
    vec[hashNgram(ng)] += 1
  }
  let norm = 0
  for (let i = 0; i < EMBED_DIM; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < EMBED_DIM; i++) vec[i] /= norm
  return vec
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}

const EMBED_THRESHOLD = 0.55

// ---------------------------------------------------------------------------
// NER — regex + dict
// ---------------------------------------------------------------------------
const BRAND_DICT = new Set([
  'Apple', 'Google', 'Microsoft', 'OpenAI', 'Anthropic', 'Nvidia', 'AMD',
  'Intel', 'Tesla', 'SpaceX', 'Meta', 'Amazon', 'Netflix', 'Disney',
  'Bitcoin', 'Ethereum', 'Solana', 'Ripple', 'Coinbase', 'Binance',
  'Figma', 'Notion', 'Linear', 'Vercel', 'Cloudflare', 'Stripe',
  'Samsung', 'Sony', 'Tencent', 'Alibaba', 'Huawei', 'Oracle', 'IBM',
])

const ORG_DICT = new Set([
  'FBI', 'CIA', 'EU', 'NASA', 'FDA', 'MIT', 'Stanford', 'Harvard',
  'UN', 'WHO', 'WTO', 'FTC', 'SEC', 'DOJ', 'NATO', 'CERN',
])

const RIGID_TYPES = new Set<EntityType>(['brand', 'product', 'model', 'cve', 'cashtag'])

function extractEntities(text: string): Entity[] {
  const entities: Entity[] = []
  const seen = new Set<string>()
  const add = (type: EntityType, value: string) => {
    if (!value) return
    const k = type + ':' + value.toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    entities.push({ type, value })
  }
  for (const m of text.matchAll(/https?:\/\/[^\s)]+/g)) add('url', m[0])
  for (const m of text.matchAll(/CVE-\d{4}-\d{4,7}/gi)) add('cve', m[0].toUpperCase())
  for (const m of text.matchAll(/#(\w+)/g)) add('hashtag', m[1])
  for (const m of text.matchAll(/\$([A-Z]{1,5})\b/g)) add('cashtag', m[1])
  for (const m of text.matchAll(/@(\w+)/g)) add('person', m[1])
  for (const m of text.matchAll(/\b[A-Z]{1,3}\d{2,4}\b/g)) add('model', m[0])
  for (const brand of BRAND_DICT) {
    if (new RegExp(`\\b${brand}\\b`).test(text)) add('brand', brand)
  }
  for (const org of ORG_DICT) {
    if (new RegExp(`\\b${org}\\b`).test(text)) add('org', org)
  }
  return entities.slice(0, 30)
}

function entitiesRigidVeto(a: Entity[], b: Entity[]): boolean {
  const aRigid = new Map<string, Set<string>>()
  for (const e of a) {
    if (!RIGID_TYPES.has(e.type)) continue
    if (!aRigid.has(e.type)) aRigid.set(e.type, new Set())
    aRigid.get(e.type)!.add(e.value.toLowerCase())
  }
  for (const e of b) {
    if (!RIGID_TYPES.has(e.type)) continue
    const aVals = aRigid.get(e.type)
    if (!aVals || aVals.size === 0) continue
    if (!aVals.has(e.value.toLowerCase())) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------
interface MentionRecord {
  raw: RawMention
  signature: Uint32Array
  embedding: Float32Array
  entities: Entity[]
  clusterId: string
}

interface ClusterState {
  cluster: Cluster
  mentions: MentionRecord[]
  scoreHistory: { ts: number; score: number }[]
  velocityHistory: { ts: number; count: number }[]
}

class ClusterStore {
  private mentions = new Map<string, MentionRecord>()
  private clusters = new Map<string, ClusterState>()
  private lshBuckets = new Map<string, Set<string>>()
  private seenExternalIds = new Set<string>()

  addMention(raw: RawMention): { isNew: boolean; clusterId: string | null } {
    const dedupKey = `${raw.source}:${raw.externalId}`
    if (this.seenExternalIds.has(dedupKey)) {
      return { isNew: false, clusterId: null }
    }
    if (this.mentions.has(raw.contentHash)) {
      this.seenExternalIds.add(dedupKey)
      return { isNew: false, clusterId: this.mentions.get(raw.contentHash)!.clusterId }
    }

    const signature = minhashSignature(raw.text)
    const embedding = embedText(raw.text)
    const entities = extractEntities(raw.text)

    const bands = lshBands(signature)
    const candidateClusterIds = new Set<string>()
    for (const band of bands) {
      const bucket = this.lshBuckets.get(band)
      if (bucket) for (const cid of bucket) candidateClusterIds.add(cid)
    }

    let bestClusterId: string | null = null
    let bestScore = 0
    for (const cid of candidateClusterIds) {
      const cstate = this.clusters.get(cid)
      if (!cstate || cstate.mentions.length === 0) continue
      const rep = cstate.mentions[0]
      const j = jaccardFromSignatures(signature, rep.signature)
      if (j < JACCARD_THRESHOLD) continue
      const cos = cosineSimilarity(embedding, rep.embedding)
      if (cos < EMBED_THRESHOLD) continue
      if (entitiesRigidVeto(entities, rep.entities)) continue
      const score = j * 0.5 + cos * 0.5
      if (score > bestScore) { bestScore = score; bestClusterId = cid }
    }

    if (!bestClusterId) {
      const clusterId = 'cl_' + fnv1a64(raw.text.slice(0, 80) + Date.now()).slice(0, 12)
      bestClusterId = clusterId
      for (const band of bands) {
        if (!this.lshBuckets.has(band)) this.lshBuckets.set(band, new Set())
        this.lshBuckets.get(band)!.add(clusterId)
      }
      this.clusters.set(clusterId, {
        cluster: this.buildCluster(clusterId, raw, entities),
        mentions: [],
        scoreHistory: [],
        velocityHistory: [],
      })
    }

    const record: MentionRecord = { raw, signature, embedding, entities, clusterId: bestClusterId }
    this.mentions.set(raw.contentHash, record)
    this.seenExternalIds.add(dedupKey)
    const cstate = this.clusters.get(bestClusterId)!
    cstate.mentions.push(record)
    this.updateClusterState(bestClusterId)
    return { isNew: true, clusterId: bestClusterId }
  }

  private buildCluster(clusterId: string, firstMention: RawMention, entities: Entity[]): Cluster {
    const title = firstMention.text.split('\n')[0].slice(0, 120) || 'Untitled'
    const sc = Object.fromEntries(ALL_SOURCES.map((s) => [s, 0])) as Record<SourceKey, number>
    return {
      id: clusterId,
      signatureHash: fnv1a64(firstMention.text.slice(0, 80)),
      title,
      summary: firstMention.text.slice(0, 200),
      primarySource: firstMention.source,
      sources: [firstMention.source],
      languages: [firstMention.language ?? 'und'],
      entities,
      firstSeen: firstMention.publishedAt,
      lastSeen: firstMention.publishedAt,
      mentionsCount: 0,
      uniqueAuthors: 0,
      shape: 'flat' as Shape,
      phase: 'forming' as Phase,
      velocity: 0,
      score: 0,
      originator: {
        source: firstMention.source,
        author: firstMention.authorHandle ?? firstMention.authorId,
        url: firstMention.url,
        lagSeconds: 0,
      },
      trashPenalty: 0,
      isTrending: false,
      sourceCounts: sc,
    }
  }

  private updateClusterState(clusterId: string): void {
    const cstate = this.clusters.get(clusterId)
    if (!cstate) return
    const mentions = cstate.mentions
    if (mentions.length === 0) return

    const now = Date.now()
    const hourAgo = now - 3600_000
    const dayAgo = now - 86400_000

    const sourceCounts = Object.fromEntries(ALL_SOURCES.map((s) => [s, 0])) as Record<SourceKey, number>
    const authors = new Set<string>()
    const sourcesSet = new Set<SourceKey>()
    const languagesSet = new Set<string>()
    const allEntities: Entity[] = []
    let firstSeen = Infinity
    let lastSeen = -Infinity
    for (const m of mentions) {
      sourceCounts[m.raw.source]++
      authors.add(m.raw.authorId)
      sourcesSet.add(m.raw.source)
      languagesSet.add(m.raw.language ?? 'und')
      allEntities.push(...m.entities)
      const t = Date.parse(m.raw.publishedAt)
      if (!isNaN(t)) {
        firstSeen = Math.min(firstSeen, t)
        lastSeen = Math.max(lastSeen, t)
      }
    }
    const entitySeen = new Set<string>()
    const dedupEntities: Entity[] = []
    for (const e of allEntities) {
      const k = e.type + ':' + e.value.toLowerCase()
      if (entitySeen.has(k)) continue
      entitySeen.add(k)
      dedupEntities.push(e)
      if (dedupEntities.length >= 20) break
    }

    let primarySource: SourceKey = cstate.cluster.primarySource
    let max = 0
    for (const [s, c] of Object.entries(sourceCounts)) {
      if (c > max) { max = c; primarySource = s as SourceKey }
    }

    const sorted = [...mentions].sort((a, b) => Date.parse(b.raw.publishedAt) - Date.parse(a.raw.publishedAt))
    const top3 = sorted.slice(0, 3)
    const titleMention = top3.reduce((a, b) => (a.raw.text.length < b.raw.text.length ? a : b))
    const title = titleMention.raw.text.split('\n')[0].slice(0, 120) || cstate.cluster.title
    const longest = mentions.reduce((a, b) => (a.raw.text.length > b.raw.text.length ? a : b))
    const summary = longest.raw.text.slice(0, 220)

    const recentMentions = mentions.filter((m) => Date.parse(m.raw.publishedAt) > hourAgo)
    const velocity = recentMentions.length / 60
    cstate.velocityHistory.push({ ts: now, count: recentMentions.length })
    if (cstate.velocityHistory.length > 60) cstate.velocityHistory.shift()

    let pSpam = 0
    const authorCounts = new Map<string, number>()
    for (const m of mentions) {
      if (Date.parse(m.raw.publishedAt) < hourAgo) continue
      authorCounts.set(m.raw.authorId, (authorCounts.get(m.raw.authorId) ?? 0) + 1)
    }
    for (const c of authorCounts.values()) if (c > 14) { pSpam = 0.4; break }
    const pBot = recentMentions.length > 0 && authors.size / recentMentions.length < 0.4 ? 0.3 : 0
    const oldRatio = mentions.filter((m) => Date.parse(m.raw.publishedAt) < dayAgo).length / Math.max(1, mentions.length)
    const pRecycle = oldRatio > 0.3 ? 0.3 : 0
    const trashPenalty = Math.min(1, pSpam + pBot + pRecycle)

    const shape = detectShape(cstate.velocityHistory)
    const ageHours = (now - firstSeen) / 3600_000
    const phase = detectPhase(velocity, mentions.length, shape, ageHours)

    const originQuality = originScoreForSource(primarySource)
    const spread = sourcesSet.size / ALL_SOURCES.length
    const entropy = shannonEntropy(Object.values(sourceCounts).filter((v) => v > 0))
    const authorQuality = recentMentions.length > 0
      ? Math.max(0, 1 - (recentMentions.length - authors.size) / Math.max(1, recentMentions.length))
      : 0.5
    const novelty = 1 - mentions.filter((m) => Date.parse(m.raw.publishedAt) < hourAgo * 6).length / Math.max(1, mentions.length)
    const trust = sourceTrustForCluster(mentions.map((m) => m.raw.source))

    const weighted =
      0.18 * originQuality +
      0.12 * spread +
      0.22 * Math.min(1, velocity / 2) +
      0.08 * entropy +
      0.15 * authorQuality +
      0.15 * novelty +
      0.10 * trust
    const score = Math.round(weighted * (1 - trashPenalty) * 100 * 100) / 100

    cstate.scoreHistory.push({ ts: now, score })
    if (cstate.scoreHistory.length > 120) cstate.scoreHistory.shift()

    const isTrending = score >= 35 && mentions.length >= 3

    cstate.cluster = {
      ...cstate.cluster,
      title,
      summary,
      primarySource,
      sources: Array.from(sourcesSet),
      sourceCounts,
      languages: Array.from(languagesSet),
      entities: dedupEntities,
      firstSeen: new Date(firstSeen).toISOString(),
      lastSeen: new Date(lastSeen).toISOString(),
      mentionsCount: mentions.length,
      uniqueAuthors: authors.size,
      shape,
      phase,
      velocity,
      score,
      trashPenalty,
      isTrending,
    }
  }

  getCluster(id: string): Cluster | undefined {
    return this.clusters.get(id)?.cluster
  }

  getTrending(limit = 20): Cluster[] {
    return Array.from(this.clusters.values())
      .map((c) => c.cluster)
      .filter((c) => c.mentionsCount >= 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  getAllClusters(limit = 50): Cluster[] {
    return Array.from(this.clusters.values())
      .map((c) => c.cluster)
      .sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen))
      .slice(0, limit)
  }

  getClusterMentions(clusterId: string, limit = 10): RawMention[] {
    const cstate = this.clusters.get(clusterId)
    if (!cstate) return []
    return [...cstate.mentions]
      .sort((a, b) => Date.parse(b.raw.publishedAt) - Date.parse(a.raw.publishedAt))
      .slice(0, limit)
      .map((m) => m.raw)
  }

  getClusterHistory(clusterId: string): { ts: string; score: number; mentions: number; velocity: number }[] {
    const cstate = this.clusters.get(clusterId)
    if (!cstate) return []
    return cstate.scoreHistory.map((s, i) => ({
      ts: new Date(s.ts).toISOString(),
      score: s.score,
      mentions: cstate.mentions.length,
      velocity: cstate.velocityHistory[i]?.count ?? 0,
    }))
  }

  totalMentions(): number {
    return this.mentions.size
  }

  totalClusters(): number {
    return this.clusters.size
  }

  gc(maxAgeMs = 6 * 3600_000): number {
    const cutoff = Date.now() - maxAgeMs
    let removed = 0
    for (const [id, cstate] of this.clusters) {
      if (Date.parse(cstate.cluster.lastSeen) < cutoff && cstate.mentions.length < 3) {
        const sig = cstate.mentions[0]?.signature
        if (sig) {
          for (const band of lshBands(sig)) {
            this.lshBuckets.get(band)?.delete(id)
          }
        }
        for (const m of cstate.mentions) this.mentions.delete(m.raw.contentHash)
        this.clusters.delete(id)
        removed++
      }
    }
    return removed
  }
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------
const SOURCE_ORIGIN: Record<SourceKey, number> = {
  hn: 0.95, gdelt: 0.88, rss: 0.82, github: 0.78, reddit: 0.7, bluesky: 0.6, x: 0.55,
}
const SOURCE_TRUST: Record<SourceKey, number> = {
  hn: 0.9, gdelt: 0.85, rss: 0.8, reddit: 0.7, github: 0.75, bluesky: 0.65, x: 0.55,
}

function originScoreForSource(s: SourceKey): number { return SOURCE_ORIGIN[s] ?? 0.5 }
function sourceTrustForCluster(sources: SourceKey[]): number {
  if (sources.length === 0) return 0.5
  let sum = 0
  for (const s of sources) sum += SOURCE_TRUST[s] ?? 0.5
  return sum / sources.length
}

function shannonEntropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  let h = 0
  for (const c of counts) {
    if (c === 0) continue
    const p = c / total
    h -= p * Math.log2(p)
  }
  return Math.min(1, h / Math.log2(counts.length || 1))
}

function detectShape(samples: { ts: number; count: number }[]): Shape {
  if (samples.length < 5) return 'flat'
  const y = samples.map((s) => s.count)
  const n = y.length
  const xs = Array.from({ length: n }, (_, i) => i)
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = y.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (y[i] - meanY)
    den += (xs[i] - meanX) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  const half = Math.floor(n / 2)
  const slopeFirst = avgSlope(y.slice(0, half))
  const slopeSecond = avgSlope(y.slice(half))
  const accel = slopeSecond - slopeFirst
  if (slope > 0.3 && accel > 0.1) return 'accel'
  if (slope > 0.2) return 'rise'
  if (slope < -0.2) return 'decay'
  const variance = y.reduce((s, v) => s + (v - meanY) ** 2, 0) / n
  const normVar = variance / (meanY * meanY + 1)
  if (Math.abs(slope) < 0.1 && normVar > 0.5) return 'wobble'
  return 'flat'
}

function avgSlope(y: number[]): number {
  if (y.length < 2) return 0
  return (y[y.length - 1] - y[0]) / (y.length - 1)
}

function detectPhase(velocity: number, mentions: number, shape: Shape, ageHours: number): Phase {
  if (ageHours < 2 && velocity < 0.5) return 'forming'
  if (velocity > 1 && mentions > 3) return 'rising'
  if (velocity > 0.5 && mentions > 10 && shape !== 'accel') return 'peaked'
  if (shape === 'decay') return 'decaying'
  return 'forming'
}

// ---------------------------------------------------------------------------
// Cluster → Trend projection
// ---------------------------------------------------------------------------
const TONE_BY_SOURCE: Record<SourceKey, TrendTone> = {
  reddit: 'hot', bluesky: 'cool', hn: 'cool', rss: 'muted', gdelt: 'mint', github: 'mint', x: 'hot',
}
const COLOR_BY_SOURCE: Record<SourceKey, string> = {
  reddit: 'var(--hot)',
  bluesky: 'oklch(0.72 0.21 300)',
  hn: 'oklch(0.78 0.12 285)',
  rss: 'oklch(0.66 0.02 285)',
  gdelt: 'oklch(0.65 0.18 265)',
  github: 'oklch(0.78 0.16 140)',
  x: 'var(--hot)',
}

export function clusterToTrend(cluster: Cluster): Trend {
  const score = cluster.score
  const delta = 0
  const dir: TrendDir = delta > 5 ? 'up' : delta < -5 ? 'down' : 'flat'
  const heat =
    score >= 70 ? 'Muy caliente' :
    score >= 50 ? 'Caliente' :
    score >= 30 ? 'Templado' :
    'Enfriándose'
  const status =
    cluster.phase === 'forming' ? 'Señal emergente' :
    cluster.phase === 'rising' ? 'Crecimiento acelerado' :
    cluster.phase === 'peaked' ? 'Actividad estable' :
    'Interés en descenso'
  const lastSeenDate = new Date(cluster.lastSeen)
  const time = `${String(lastSeenDate.getHours()).padStart(2, '0')}:${String(lastSeenDate.getMinutes()).padStart(2, '0')}`
  const why = cluster.summary.slice(0, 180) + (cluster.summary.length > 180 ? '…' : '')
  const ageMin = Math.max(1, Math.round((Date.now() - Date.parse(cluster.firstSeen)) / 60000))
  const evidence = [
    { label: 'Fuentes', value: String(cluster.sources.length) },
    { label: 'Autores', value: String(cluster.uniqueAuthors) },
    { label: 'Edad', value: `${ageMin}min` },
  ]
  const tags = cluster.entities
    .filter((e) => ['brand', 'cashtag', 'hashtag'].includes(e.type))
    .slice(0, 5)
    .map((e) => e.value)

  return {
    id: cluster.id,
    title: cluster.title,
    source: cluster.primarySource,
    color: COLOR_BY_SOURCE[cluster.primarySource],
    status, tone: TONE_BY_SOURCE[cluster.primarySource], dir, time, heat,
    confidence: Math.round(score),
    mentions: cluster.mentionsCount,
    delta, shape: cluster.shape, why, evidence,
    inTimeline: cluster.isTrending,
    phase: cluster.phase, velocity: cluster.velocity,
    uniqueAuthors: cluster.uniqueAuthors,
    firstSeen: cluster.firstSeen, lastSeen: cluster.lastSeen,
    originator: cluster.originator,
    sources: cluster.sources, sourceCounts: cluster.sourceCounts,
    tags, hasMedia: false, trashPenalty: cluster.trashPenalty,
  }
}

// ---------------------------------------------------------------------------
// Briefing — extractive (deterministic; no LLM needed)
// ---------------------------------------------------------------------------
export function generateExtractiveBriefing(cluster: Cluster, mentions: RawMention[]): {
  narrative: string
  keyPoints: string[]
  riskFlags: string[]
  confidence: number
} {
  const top = mentions.slice(0, 5)
  const sourcesList = Array.from(new Set(cluster.sources)).join(', ')
  const narrative = [
    `Narrativa detectada en ${cluster.sources.length} fuente(s): ${sourcesList}.`,
    `Se han identificado ${cluster.mentionsCount} menciones de ${cluster.uniqueAuthors} autores únicos, con una velocidad actual de ${cluster.velocity.toFixed(2)} menciones por minuto.`,
    `La fase del cluster es "${cluster.phase}" con forma "${cluster.shape}" y un score de ${cluster.score.toFixed(1)}/100.`,
    top[0] ? `Mención más reciente: "${top[0].text.slice(0, 200)}"` : '',
  ].filter(Boolean).join(' ')
  const keyPoints = [
    `Score actual: ${cluster.score.toFixed(1)}/100`,
    `${cluster.mentionsCount} menciones · ${cluster.uniqueAuthors} autores únicos`,
    `Velocidad EWMA: ${cluster.velocity.toFixed(2)} menc/min`,
    `Fuentes activas: ${cluster.sources.length}/${ALL_SOURCES.length}`,
    cluster.originator ? `Origen: ${cluster.originator.source} (${cluster.originator.author})` : '',
  ].filter(Boolean)
  const riskFlags: string[] = []
  if (cluster.trashPenalty > 0.4) riskFlags.push('Actividad sospechosa (alta concentración de autores)')
  if (cluster.trashPenalty >= 0.3 && cluster.trashPenalty < 0.4) riskFlags.push('Posible actividad bot')
  if (cluster.sources.length === 1) riskFlags.push('Narrativa de fuente única — baja corroboración')
  if (cluster.velocity > 5) riskFlags.push('Velocidad anómala — posible campaña coordinada')
  const confidence = Math.max(0.2, Math.min(0.95, cluster.score / 100))
  return { narrative, keyPoints, riskFlags, confidence }
}

// ---------------------------------------------------------------------------
// Singleton store + ingest cycle
// ---------------------------------------------------------------------------
export const store = new ClusterStore()

export interface IngestResult {
  ingested: number
  newClusters: number
  updatedClusters: Set<string>
}

export function ingestMentions(mentions: RawMention[]): IngestResult {
  let ingested = 0
  let newClusters = 0
  const updatedClusters = new Set<string>()
  for (const m of mentions) {
    const r = store.addMention(m)
    if (r.isNew) {
      ingested++
      if (r.clusterId) updatedClusters.add(r.clusterId)
    }
  }
  return { ingested, newClusters, updatedClusters }
}

let gcTimer: NodeJS.Timeout | null = null
export function startGcLoop(): void {
  if (gcTimer) return
  gcTimer = setInterval(() => {
    const removed = store.gc()
    if (removed > 0) logger.info('cluster gc', { removed })
  }, 5 * 60_000)
}
