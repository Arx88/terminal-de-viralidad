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
    // === AGENT 2 (DataInquisitor): publishedAt validation ===
    // Rechazar menciones con publishedAt inválido: futuro lejano (>5min) o
    // muy viejo (>7 días). Evita que repos antiguos o fechas parseadas mal
    // contaminen el detector de viralidad temprana.
    const pubMs = Date.parse(raw.publishedAt)
    if (isNaN(pubMs)) {
      return { isNew: false, clusterId: null } // fecha inválida → descartar
    }
    const now = Date.now()
    const FUTURE_TOLERANCE = 5 * 60_000 // 5 min
    const MAX_AGE = 7 * 86400_000        // 7 días
    if (pubMs > now + FUTURE_TOLERANCE) {
      return { isNew: false, clusterId: null } // fecha futura → descartar
    }
    if (pubMs < now - MAX_AGE) {
      return { isNew: false, clusterId: null } // muy vieja → descartar
    }

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
      // DETERMINISTIC clusterId: hash of normalized first-mention text.
      // Critical for Vercel stateless: two lambdas ingesting the same data
      // must produce the same clusterId, so /trends/:id can resolve across
      // invocations. Adding Date.now() broke this (random per call).
      const clusterId = 'cl_' + fnv1a64(normalizeText(raw.text).slice(0, 200)).slice(0, 12)
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
    // Ventanas temporales para detección de velocidad/aceleración temprana
    const MIN_15 = now - 15 * 60_000
    const MIN_30 = now - 30 * 60_000
    const MIN_60 = now - 60 * 60_000
    const HOUR_2 = now - 2 * 3600_000
    const HOUR_12 = now - 12 * 3600_000
    const HOUR_24 = now - 24 * 3600_000

    // === TIME-DECAY EXPONENTIAL WEIGHTING ===
    // λ = ln(2) / halfLifeHours. Half-life = 6h (mención pierde 50% de peso cada 6h).
    // Esta es la corrección central: las menciones viejas NO pesan igual que las nuevas.
    const LAMBDA = Math.LN2 / 6 // 0.1155 per hour
    const decayWeight = (publishedAtMs: number): number => {
      const ageHours = Math.max(0, (now - publishedAtMs) / 3600_000)
      return Math.exp(-LAMBDA * ageHours)
    }

    // Pre-compute weights + bucket by time window
    const sourceCounts = Object.fromEntries(ALL_SOURCES.map((s) => [s, 0])) as Record<SourceKey, number>
    const sourceCountsRecent15 = Object.fromEntries(ALL_SOURCES.map((s) => [s, 0])) as Record<SourceKey, number>
    const authors = new Set<string>()
    const authorsRecent60 = new Set<string>()
    const sourcesSet = new Set<SourceKey>()
    const sourcesRecent60 = new Set<SourceKey>()
    const sourcesRecent15 = new Set<SourceKey>()
    const languagesSet = new Set<string>()
    const allEntities: Entity[] = []
    let firstSeen = Infinity
    let lastSeen = -Infinity
    let weightedVolume = 0 // Sum of decay weights — replaces raw mentions.length in score
    let mentionsLast15 = 0
    let mentionsLast30 = 0
    let mentionsLast60 = 0
    let mentionsOlder24 = 0

    for (const m of mentions) {
      const t = Date.parse(m.raw.publishedAt)
      if (isNaN(t)) continue
      const w = decayWeight(t)
      weightedVolume += w
      sourceCounts[m.raw.source]++
      authors.add(m.raw.authorId)
      sourcesSet.add(m.raw.source)
      languagesSet.add(m.raw.language ?? 'und')
      allEntities.push(...m.entities)
      firstSeen = Math.min(firstSeen, t)
      lastSeen = Math.max(lastSeen, t)
      if (t > MIN_15) {
        mentionsLast15++
        sourceCountsRecent15[m.raw.source]++
        sourcesRecent15.add(m.raw.source)
      }
      if (t > MIN_30) mentionsLast30++
      if (t > MIN_60) {
        mentionsLast60++
        authorsRecent60.add(m.raw.authorId)
        sourcesRecent60.add(m.raw.source)
      }
      if (t < HOUR_24) mentionsOlder24++
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

    // Title/summary from most recent mention (anti-hallucination)
    const sorted = [...mentions].sort((a, b) => Date.parse(b.raw.publishedAt) - Date.parse(a.raw.publishedAt))
    const repMention = sorted[0]
    const title = (repMention?.raw.text.split('\n')[0].slice(0, 120)) || cstate.cluster.title || 'Untitled'
    const summary = (repMention?.raw.text.slice(0, 220)) || cstate.cluster.summary || title

    // === VELOCITY REAL: menciones en los últimos 15min (no promedio estático de 1h) ===
    // Un cluster con 0 menciones en los últimos 15min tiene velocity=0, sin importar
    // cuántas acumule en la última hora. Esto es la CORRECCIÓN CENTRAL.
    const velocity = mentionsLast15 / 15 // menciones por minuto en ventana 15min
    // Velocity en ventana 60min para referencia (pero NO se usa en score directamente)
    const velocity60 = mentionsLast60 / 60

    // === ACELERACIÓN REAL: ΔM/Δt entre ventanas 15min y 60min ===
    // acceleration = (tasa 15min) - (tasa 60min)
    // Si tasa 15min > tasa 60min → acelerando (narrativa ganando tracción)
    // Si tasa 15min < tasa 60min → desacelerando
    const acceleration = velocity - velocity60 // positivo = acelerando
    const accelerationRatio = velocity60 > 0 ? velocity / velocity60 : (velocity > 0 ? Infinity : 0)

    cstate.velocityHistory.push({ ts: now, count: mentionsLast15 })
    if (cstate.velocityHistory.length > 60) cstate.velocityHistory.shift()

    // === ANTI-SPAM/BOt (mejorado, con ventana 60min) ===
    let pSpam = 0
    const authorCounts60 = new Map<string, number>()
    for (const m of mentions) {
      const t = Date.parse(m.raw.publishedAt)
      if (isNaN(t) || t < MIN_60) continue
      authorCounts60.set(m.raw.authorId, (authorCounts60.get(m.raw.authorId) ?? 0) + 1)
    }
    for (const c of authorCounts60.values()) if (c > 14) { pSpam = 0.4; break }
    // Single-author dominance: si un solo autor genera >50% de menciones en 60min → bot
    let maxAuthorCount = 0
    for (const c of authorCounts60.values()) maxAuthorCount = Math.max(maxAuthorCount, c)
    const pBot = mentionsLast60 > 2 && maxAuthorCount / Math.max(1, mentionsLast60) > 0.5 ? 0.4 : 0
    // Recycle: mención vieja reciclada — si >30% de menciones son >24h viejas
    const pRecycle = mentionsOlder24 / Math.max(1, mentions.length) > 0.3 ? 0.3 : 0
    const trashPenalty = Math.min(1, pSpam + pBot + pRecycle)

    // === SHAPE detection basada en acceleration real ===
    const shape = detectShapeFromAcceleration(acceleration, accelerationRatio, cstate.velocityHistory)

    // === PHASE detection reformulada para detección temprana ===
    const ageHours = (now - firstSeen) / 3600_000
    const phase = detectPhaseEarly(velocity, acceleration, mentionsLast15, mentionsLast60, sourcesRecent15.size, shape, ageHours)

    // === SCORING REFORMULADO ===
    // Principio: VELOCIDAD + ACELERACIÓN dominan. Volumen absoluto = solo como soporte.
    // Time-decay ya aplicado via weightedVolume.

    // 1. velocityScore: velocidad real en 15min (normalizada a 5 menc/min = 1.0)
    const velocityScore = Math.min(1, velocity / 5)

    // 2. accelerationScore: aceleración positiva = bonus, negativa = penalty
    // accelerationRatio > 2 → fuerte aceleración (15min tiene 2x+ la tasa de 60min)
    // accelerationRatio < 0.5 → fuerte desaceleración
    let accelerationScore: number
    if (!isFinite(accelerationRatio) && velocity > 0) {
      accelerationScore = 1.0 // cluster nuevo con menciones solo en 15min = emergente puro
    } else if (accelerationRatio >= 2) {
      accelerationScore = 1.0
    } else if (accelerationRatio >= 1) {
      accelerationScore = 0.5 + (accelerationRatio - 1) * 0.5 // 0.5 → 1.0
    } else if (accelerationRatio >= 0.5) {
      accelerationScore = 0.2 + (accelerationRatio - 0.5) * 0.6 // 0.2 → 0.5
    } else {
      accelerationScore = Math.max(0, accelerationRatio * 0.4) // < 0.5 → casi 0
    }

    // 3. spreadScore: dispersión cross-platform EN los últimos 60min (no total)
    // Premia que la narrativa haya saltado de una fuente a otra recientemente
    const spreadScore = Math.min(1, sourcesRecent60.size / 3) // 3 fuentes = score 1.0

    // 4. entropyScore: entropía de distribución de fuentes en últimos 15min
    const entropyScore = shannonEntropy(Object.values(sourceCountsRecent15).filter((v) => v > 0))

    // 5. authorDiversityScore: autores únicos vs total en últimos 60min
    const authorDiversityScore = mentionsLast60 > 0
      ? Math.min(1, authorsRecent60.size / Math.max(1, mentionsLast60))
      : (mentionsLast15 > 0 ? 0.5 : 0)

    // 6. freshnessScore: novedad — qué tan recientes son las menciones (time-decay promedio)
    // Si todas las menciones son <2h → 1.0; si todas son >12h → 0.0
    const freshnessScore = mentions.length > 0
      ? Math.min(1, weightedVolume / mentions.length) // weightedVolume/total = promedio de decay weights
      : 0

    // 7. trustScore: confianza por fuente (igual que antes)
    const trust = sourceTrustForCluster(mentions.map((m) => m.raw.source))

    // Weighted sum — VELOCITY y ACCELERATION dominan (60% del peso total)
    const weighted =
      0.30 * velocityScore +       // ⬆️ 30% — velocidad real 15min
      0.25 * accelerationScore +   // ⬆️ 25% — aceleración (1ª y 2ª derivada)
      0.15 * spreadScore +         // dispersión cross-platform reciente
      0.08 * entropyScore +
      0.10 * authorDiversityScore +
      0.07 * freshnessScore +      // frescura temporal
      0.05 * trust

    const safeWeighted = Number.isFinite(weighted) ? weighted : 0
    const safePenalty = Number.isFinite(trashPenalty) ? trashPenalty : 0
    let score = Math.round(safeWeighted * (1 - safePenalty) * 100 * 100) / 100
    if (!Number.isFinite(score)) score = 0

    // === CRITICAL: TIME-DECAY DEL SCORE ===
    // Si un cluster no recibe menciones en los últimos 30min, su score DEBE caer.
    // Sin menciones en 60min → score = 0 (sin importar volumen histórico).
    if (mentionsLast30 === 0) score = Math.min(score, 5)  // casi muerto
    if (mentionsLast60 === 0) score = 0                    // muerto

    // Single-mention cluster: score bajo (no puede ser "tendencia viral")
    if (mentions.length === 1) score = Math.min(score, 15)

    // Gate: conf>=50 requiere velocidad real (menciones en 15min) + dispersión
    if (score >= 50 && (mentionsLast15 < 2 || sourcesRecent60.size < 2)) {
      score = Math.min(score, 49)
    }
    // Gate: conf>=70 requiere aceleración fuerte + 3+ fuentes recientes
    if (score >= 70 && (accelerationRatio < 1.5 || sourcesRecent60.size < 3)) {
      score = Math.min(score, 69)
    }

    cstate.scoreHistory.push({ ts: now, score })
    if (cstate.scoreHistory.length > 120) cstate.scoreHistory.shift()

    // isTrending: requiere actividad reciente real, no solo score
    const isTrending = score >= 35 && mentionsLast60 >= 2 && mentionsLast30 >= 1

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
      velocity,        // ahora es velocity 15min real (menc/min)
      score,
      trashPenalty,
      isTrending,
    }
  }

  getCluster(id: string): Cluster | undefined {
    return this.clusters.get(id)?.cluster
  }

  getTrending(limit = 20): Cluster[] {
    const now = Date.now()
    const HOUR_24 = now - 24 * 3600_000
    return Array.from(this.clusters.values())
      .map((c) => c.cluster)
      // FILTER 1: solo clusters con actividad en las últimas 24h (anti-acumulador)
      .filter((c) => Date.parse(c.lastSeen) > HOUR_24)
      // FILTER 2: excluir clusters muertos (score=0 por time-decay)
      .filter((c) => c.score > 0)
      // SORT: por score descendente (score ya incorpora velocity + acceleration + time-decay)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  getAllClusters(limit = 50): Cluster[] {
    const now = Date.now()
    const HOUR_24 = now - 24 * 3600_000
    return Array.from(this.clusters.values())
      .map((c) => c.cluster)
      // Solo clusters con actividad reciente (anti-acumulador)
      .filter((c) => Date.parse(c.lastSeen) > HOUR_24)
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
  // Guard against Math.log2(1)=0 → div by zero (single-source clusters)
  if (counts.length <= 1) return 0
  return Math.min(1, h / Math.log2(counts.length))
}

// === SHAPE detection basada en ACCELERATION REAL (no regresión estática) ===
// acceleration = velocity(15min) - velocity(60min)
// accelerationRatio = velocity(15min) / velocity(60min)
function detectShapeFromAcceleration(
  acceleration: number,
  accelerationRatio: number,
  samples: { ts: number; count: number }[],
): Shape {
  // Caso cluster nuevo: solo menciones en 15min, sin historial 60min
  if (!isFinite(accelerationRatio) && acceleration > 0) return 'accel'

  // Aceleración fuerte: ratio >= 2 (15min tiene 2x+ la tasa de 60min)
  if (accelerationRatio >= 2 && acceleration > 0) return 'accel'

  // Rise: tasa positiva y acelerando moderadamente
  if (acceleration > 0.05 && accelerationRatio >= 1.2) return 'rise'

  // Decay: desaceleración clara (15min mucho menor que 60min)
  if (acceleration < -0.05 || (accelerationRatio > 0 && accelerationRatio < 0.5)) return 'decay'

  // Wobble: varianza alta en velocityHistory sin tendencia clara
  if (samples.length >= 5) {
    const y = samples.map((s) => s.count)
    const meanY = y.reduce((a, b) => a + b, 0) / y.length
    const variance = y.reduce((s, v) => s + (v - meanY) ** 2, 0) / y.length
    const normVar = variance / (meanY * meanY + 1)
    if (Math.abs(acceleration) < 0.05 && normVar > 0.5) return 'wobble'
  }

  return 'flat'
}

// === PHASE detection reformulada para DETECCIÓN TEMPRANA ===
// Emergente: alta aceleración, bajo volumen total (t < 2h típico)
// Pico: alta aceleración + alto volumen reciente
// Decaimiento: bajo crecimiento + alto volumen acumulado
// Formando: todavía sin tracción clara
function detectPhaseEarly(
  velocity: number,          // menc/min en 15min
  acceleration: number,      // velocity(15min) - velocity(60min)
  mentionsLast15: number,
  mentionsLast60: number,
  sourcesRecent15: number,
  shape: Shape,
  ageHours: number,
): Phase {
  // Emergente: pocas menciones pero alta aceleración + multi-source
  if (ageHours < 2 && mentionsLast15 >= 2 && acceleration > 0 && sourcesRecent15 >= 2) {
    return 'rising' // emergente = subiendo rápidamente
  }
  // Pico: alta velocidad actual + volumen significativo
  if (velocity > 0.3 && mentionsLast60 >= 5 && shape !== 'decay') {
    return 'peaked'
  }
  // Decaimiento: sin actividad reciente
  if (shape === 'decay' || mentionsLast15 === 0) {
    return 'decaying'
  }
  // Formando: todavía ganando tracción
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
  // Hard guard: confidence must NEVER be null/NaN — DataSanity zero-tolerance.
  const rawScore = cluster.score
  const score = Number.isFinite(rawScore) ? rawScore : 0
  // delta: derivada del score — si phase es decaying, delta negativo; si rising, positivo
  // (mejorado: ahora refleja la dirección REAL del momentum, no siempre 0)
  const delta =
    cluster.phase === 'rising' ? Math.round(cluster.velocity * 10) :
    cluster.phase === 'decaying' ? -Math.round(cluster.velocity * 5) :
    cluster.phase === 'peaked' ? Math.round(cluster.velocity * 2) :
    0
  const dir: TrendDir = delta > 5 ? 'up' : delta < -5 ? 'down' : 'flat'
  const heat =
    score >= 70 ? 'Muy caliente' :
    score >= 50 ? 'Caliente' :
    score >= 30 ? 'Templado' :
    'Enfriándose'
  // Status mapeado a las 4 fases de detección temprana
  const status =
    cluster.phase === 'forming' ? 'Señal emergente' :        // formando tracción
    cluster.phase === 'rising' ? 'Crecimiento acelerado' :   // subiendo fuerte
    cluster.phase === 'peaked' ? 'En pico' :                  // máxima velocidad
    'En desaceleración'                                        // perdiendo tracción
  const lastSeenDate = new Date(cluster.lastSeen)
  const time = `${String(lastSeenDate.getHours()).padStart(2, '0')}:${String(lastSeenDate.getMinutes()).padStart(2, '0')}`
  const why = cluster.summary.slice(0, 180) + (cluster.summary.length > 180 ? '…' : '')
  const ageMin = Math.max(1, Math.round((Date.now() - Date.parse(cluster.firstSeen)) / 60000))
  // Evidence reformulado para mostrar VELOCIDAD, no solo volumen acumulado
  const velocityPerHour = Math.round(cluster.velocity * 60) // menc/hora
  const evidence = [
    { label: 'Velocidad', value: `${velocityPerHour}/h` },
    { label: 'Fuentes', value: String(cluster.sources.length) },
    { label: 'Edad', value: ageMin < 60 ? `${ageMin}min` : `${Math.round(ageMin / 60)}h` },
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
  evidenceMentionIds: string[]
} {
  // === AGENT 2 (DataInquisitor): evidence vector — anti-alucination ===
  // El briefing SOLO puede citar información presente en las menciones fuente.
  // evidenceMentionIds lista los IDs exactos de menciones en las que se basa.
  const top = mentions.slice(0, 5)
  const evidenceMentionIds = top.map((m) => `${m.source}:${m.externalId}`)
  const sourcesList = Array.from(new Set(cluster.sources)).join(', ')
  const velocityPerHour = Math.round(cluster.velocity * 60)
  // Narrative: cada claim debe ser verificable contra las menciones fuente
  const narrative = [
    `Narrativa detectada en ${cluster.sources.length} fuente(s): ${sourcesList}.`,
    `${cluster.mentionsCount} menciones de ${cluster.uniqueAuthors} autores únicos. Velocidad actual: ${velocityPerHour} menc/hora.`,
    `Fase: "${cluster.phase}", forma: "${cluster.shape}", score: ${cluster.score.toFixed(1)}/100.`,
    // Cita textual de la mención más reciente (verificable contra evidenceMentionIds[0])
    top[0] ? `Mención más reciente (${top[0].source}): "${top[0].text.slice(0, 180)}"` : '',
  ].filter(Boolean).join(' ')
  const keyPoints = [
    `Velocidad: ${velocityPerHour} menc/hora`,
    `${cluster.mentionsCount} menciones · ${cluster.uniqueAuthors} autores`,
    `Score: ${cluster.score.toFixed(1)}/100`,
    `Fuentes: ${cluster.sources.length}/${ALL_SOURCES.length}`,
    cluster.originator ? `Origen: ${cluster.originator.source}` : '',
  ].filter(Boolean)
  const riskFlags: string[] = []
  if (cluster.trashPenalty > 0.4) riskFlags.push('Actividad sospechosa (spam/bot)')
  if (cluster.trashPenalty >= 0.3 && cluster.trashPenalty < 0.4) riskFlags.push('Posible actividad bot')
  if (cluster.sources.length === 1) riskFlags.push('Fuente única — baja corroboración')
  if (cluster.velocity > 5) riskFlags.push('Velocidad anómala')
  // Nuevo risk flag: si el cluster está en desaceleración
  if (cluster.phase === 'decaying') riskFlags.push('En desaceleración — perdiendo tracción')
  const confidence = Math.max(0.2, Math.min(0.95, cluster.score / 100))
  return { narrative, keyPoints, riskFlags, confidence, evidenceMentionIds }
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
