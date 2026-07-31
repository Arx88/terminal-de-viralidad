/**
 * FASE 2 — Redis-backed ClusterStore
 *
 * TODO el estado vive en Upstash Redis. Cada lambda lee/escribe el mismo
 * Redis, así el estado (clusters, menciones, velocity, score) sobrevive
 * cold starts y es consistente entre lambdas concurrentes.
 *
 * Estructura en Redis:
 * - cluster:{id} → HASH con metadata (title, score, phase, velocity, etc.)
 * - cluster:{id}:mentions → SORTED SET por timestamp (member = mention JSON)
 * - cluster:{id}:scores → LIST de score history (últimos 120)
 * - clusters:trending → SORTED SET por score (para getTrending rápido)
 * - clusters:all → SORTED SET por lastSeen timestamp
 * - lsh:{bandHash} → SET de clusterIds (para deduplicación LSH)
 * - dedup:{source}:{externalId} → string "1" con TTL 7 días
 * - engine:{source} → HASH con estado del motor
 * - system:cold_start_cycles → contador de ciclos tras cold start
 */

import type {
  Cluster, Entity, EntityType, Phase, RawMention, Shape, SourceKey, Trend, TrendDir, TrendTone,
} from '@/lib/types'
import { ALL_SOURCES } from '@/lib/types'
import { fnv1a64, normalizeText } from '@/lib/server/hash'
import { logger } from '@/lib/server/logger'
import {
  rHSet, rHGetAll, rZAdd, rZRangeByScore, rZCard, rSAdd, rSMembers,
  rIncr, rLPush, rLRange, rSet, rGet, rDel, acquireLock,
} from '@/lib/server/redis'

// ---------------------------------------------------------------------------
// MinHash LSH (igual que antes, sin cambios)
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
    for (let r = 0; r < ROWS; r++) s += sig[b * ROWS + r].toString(36) + '-'
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
// Embeddings (igual que antes)
// ---------------------------------------------------------------------------
const EMBED_DIM = 384
const NGRAM_SIZE = 3

function hashNgram(ngram: string): number {
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
    vec[hashNgram(chars.slice(i, i + NGRAM_SIZE))] += 1
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
// NER (igual que antes)
// ---------------------------------------------------------------------------
const BRAND_DICT = new Set([
  'Apple','Google','Microsoft','OpenAI','Anthropic','Nvidia','AMD','Intel','Tesla','SpaceX',
  'Meta','Amazon','Netflix','Disney','Bitcoin','Ethereum','Solana','Ripple','Coinbase','Binance',
  'Figma','Notion','Linear','Vercel','Cloudflare','Stripe','Samsung','Sony','Tencent','Alibaba',
  'Huawei','Oracle','IBM',
])
const ORG_DICT = new Set(['FBI','CIA','EU','NASA','FDA','MIT','Stanford','Harvard','UN','WHO','WTO','FTC','SEC','DOJ','NATO','CERN'])
const RIGID_TYPES = new Set<EntityType>(['brand','product','model','cve','cashtag'])

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
  for (const brand of BRAND_DICT) if (new RegExp(`\\b${brand}\\b`).test(text)) add('brand', brand)
  for (const org of ORG_DICT) if (new RegExp(`\\b${org}\\b`).test(text)) add('org', org)
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
// Scoring helpers (igual que antes)
// ---------------------------------------------------------------------------
const SOURCE_ORIGIN: Record<SourceKey, number> = { hn:0.95, gdelt:0.88, rss:0.82, github:0.78, reddit:0.7, bluesky:0.6, x:0.55 }
const SOURCE_TRUST: Record<SourceKey, number> = { hn:0.9, gdelt:0.85, rss:0.8, reddit:0.7, github:0.75, bluesky:0.65, x:0.55 }

function originScoreForSource(s: SourceKey): number { return SOURCE_ORIGIN[s] ?? 0.5 }
function sourceTrustForCluster(sources: SourceKey[]): number {
  if (!sources.length) return 0.5
  return sources.reduce((s, src) => s + (SOURCE_TRUST[src] ?? 0.5), 0) / sources.length
}
function shannonEntropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  let h = 0
  for (const c of counts) { if (c === 0) continue; const p = c / total; h -= p * Math.log2(p) }
  if (counts.length <= 1) return 0
  return Math.min(1, h / Math.log2(counts.length))
}
function detectShapeFromAcceleration(accel: number, ratio: number, samples: {ts:number;count:number}[]): Shape {
  if (!isFinite(ratio) && accel > 0) return 'accel'
  if (ratio >= 2 && accel > 0) return 'accel'
  if (accel > 0.05 && ratio >= 1.2) return 'rise'
  if (accel < -0.05 || (ratio > 0 && ratio < 0.5)) return 'decay'
  if (samples.length >= 5) {
    const y = samples.map(s => s.count)
    const meanY = y.reduce((a,b)=>a+b,0)/y.length
    const variance = y.reduce((s,v)=>s+(v-meanY)**2,0)/y.length
    if (Math.abs(accel) < 0.05 && variance/(meanY*meanY+1) > 0.5) return 'wobble'
  }
  return 'flat'
}
function detectPhaseEarly(vel:number, accel:number, m15:number, m60:number, src15:number, shape:Shape, ageH:number): Phase {
  if (ageH < 2 && m15 >= 2 && accel > 0 && src15 >= 2) return 'rising'
  if (vel > 0.3 && m60 >= 5 && shape !== 'decay') return 'peaked'
  if (shape === 'decay' || m15 === 0) return 'decaying'
  return 'forming'
}

// ---------------------------------------------------------------------------
// Redis-backed ClusterStore
// ---------------------------------------------------------------------------

export interface IngestResult { ingested: number; newClusters: number; updatedClusters: Set<string> }

class RedisClusterStore {
  // -----------------------------------------------------------------------
  // addMention — la función central. Escribe en Redis.
  // -----------------------------------------------------------------------
  async addMention(raw: RawMention): Promise<{ isNew: boolean; clusterId: string | null }> {
    // 1. publishedAt validation
    const pubMs = Date.parse(raw.publishedAt)
    if (isNaN(pubMs)) return { isNew: false, clusterId: null }
    const now = Date.now()
    if (pubMs > now + 5 * 60_000) return { isNew: false, clusterId: null }
    if (pubMs < now - 7 * 86400_000) return { isNew: false, clusterId: null }

    // 2. Dedup exacto por source:externalId (Redis SET con TTL 7 días)
    const dedupKey = `dedup:${raw.source}:${raw.externalId}`
    const existing = await rGet(dedupKey)
    if (existing) return { isNew: false, clusterId: existing }

    // 3. MinHash signature + LSH bands
    const sig = minhashSignature(raw.text)
    const bands = lshBands(sig)
    const embedding = embedText(raw.text)
    const entities = extractEntities(raw.text)

    // 4. Buscar candidatos en LSH buckets (Redis SETs)
    const candidateIds = new Set<string>()
    for (const band of bands) {
      const members = await rSMembers(`lsh:${band}`)
      for (const cid of members) candidateIds.add(cid)
    }

    // 5. Verificar cada candidato
    let bestClusterId: string | null = null
    let bestScore = 0
    for (const cid of candidateIds) {
      const clusterData = await rHGetAll(`cluster:${cid}`)
      if (!clusterData) continue
      // Cargar mención representativa del cluster
      const mentionMembers = await rZRangeByScore(`cluster:${cid}:mentions`, 0, now)
      if (!mentionMembers.length) continue
      const repMention = JSON.parse(mentionMembers[mentionMembers.length - 1]) as RawMention
      const repSig = minhashSignature(repMention.text)
      const j = jaccardFromSignatures(sig, repSig)
      if (j < JACCARD_THRESHOLD) continue
      const repEmbed = embedText(repMention.text)
      const cos = cosineSimilarity(embedding, repEmbed)
      if (cos < EMBED_THRESHOLD) continue
      const repEntities = extractEntities(repMention.text)
      if (entitiesRigidVeto(entities, repEntities)) continue
      const score = j * 0.5 + cos * 0.5
      if (score > bestScore) { bestScore = score; bestClusterId = cid }
    }

    // 6. Crear cluster nuevo si no hay match
    let newCluster = false
    if (!bestClusterId) {
      const clusterId = 'cl_' + fnv1a64(normalizeText(raw.text).slice(0, 200)).slice(0, 12)
      bestClusterId = clusterId
      newCluster = true
      // Insertar en LSH buckets
      for (const band of bands) {
        await rSAdd(`lsh:${band}`, clusterId)
      }
      // Crear cluster metadata inicial en Redis
      const title = raw.text.split('\n')[0].slice(0, 120) || 'Untitled'
      await rHSet(`cluster:${clusterId}`, {
        id: clusterId,
        title,
        summary: raw.text.slice(0, 220),
        primarySource: raw.source,
        sources: JSON.stringify([raw.source]),
        sourceCounts: JSON.stringify(Object.fromEntries(ALL_SOURCES.map(s => [s, 0]))),
        entities: JSON.stringify(entities),
        firstSeen: raw.publishedAt,
        lastSeen: raw.publishedAt,
        mentionsCount: '0',
        uniqueAuthors: '0',
        shape: 'flat',
        phase: 'forming',
        velocity: '0',
        score: '0',
        trashPenalty: '0',
        isTrending: 'false',
        originatorSource: raw.source,
        originatorAuthor: raw.authorHandle ?? raw.authorId,
        originatorUrl: raw.url ?? '',
      })
    }

    // 7. Guardar mención en sorted set por timestamp
    const mentionJson = JSON.stringify(raw)
    await rZAdd(`cluster:${bestClusterId}:mentions`, pubMs, mentionJson)

    // 8. Marcar dedup
    await rSet(dedupKey, bestClusterId, 7 * 86400)

    // 9. Actualizar estado del cluster (scoring, velocity, etc.)
    await this.updateClusterState(bestClusterId)

    return { isNew: true, clusterId: bestClusterId }
  }

  // -----------------------------------------------------------------------
  // updateClusterState — lee menciones de Redis, calcula score, escribe de vuelta
  // -----------------------------------------------------------------------
  private async updateClusterState(clusterId: string): Promise<void> {
    const now = Date.now()
    const MIN_15 = now - 15 * 60_000
    const MIN_30 = now - 30 * 60_000
    const MIN_60 = now - 60 * 60_000
    const HOUR_24 = now - 24 * 3600_000

    // Cargar todas las menciones del cluster (últimas 24h)
    const mentionJsons = await rZRangeByScore(`cluster:${clusterId}:mentions`, HOUR_24, now)
    if (!mentionJsons.length) return

    const mentions: RawMention[] = mentionJsons.map(j => JSON.parse(j) as RawMention)

    // Calcular métricas
    const sourceCounts = Object.fromEntries(ALL_SOURCES.map(s => [s, 0])) as Record<SourceKey, number>
    const authors = new Set<string>()
    const authorsRecent60 = new Set<string>()
    const sourcesSet = new Set<SourceKey>()
    const sourcesRecent60 = new Set<SourceKey>()
    const sourcesRecent15 = new Set<SourceKey>()
    let firstSeen = Infinity
    let lastSeen = -Infinity
    let m15 = 0, m30 = 0, m60 = 0

    for (const m of mentions) {
      const t = Date.parse(m.publishedAt)
      if (isNaN(t)) continue
      sourceCounts[m.source]++
      authors.add(m.authorId)
      sourcesSet.add(m.source)
      firstSeen = Math.min(firstSeen, t)
      lastSeen = Math.max(lastSeen, t)
      if (t > MIN_15) { m15++; sourcesRecent15.add(m.source) }
      if (t > MIN_30) m30++
      if (t > MIN_60) { m60++; authorsRecent60.add(m.authorId); sourcesRecent60.add(m.source) }
    }

    // Velocity real: menciones en 15min / 15
    const velocity = m15 / 15
    const velocity60 = m60 / 60
    const acceleration = velocity - velocity60
    const accelerationRatio = velocity60 > 0 ? velocity / velocity60 : (velocity > 0 ? Infinity : 0)

    // Cold start gate fix: si no hay historial previo (pocas menciones totales),
    // estimar velocity en vez de usar 0
    let effectiveVelocity = velocity
    let effectiveAccelRatio = accelerationRatio
    const coldStartCycles = parseInt(await rGet('system:cold_start_cycles') || '0', 10)
    if (coldStartCycles < 3 && mentions.length > 0) {
      // Estimar velocity basado en el batch actual
      const estimatedVel = mentions.length / Math.max(5, (now - firstSeen) / 60000)
      if (velocity < estimatedVel) {
        effectiveVelocity = Math.max(velocity, estimatedVel * 0.5)
        effectiveAccelRatio = 1.5 // asumir aceleración moderada durante warmup
      }
    }

    // Anti-gaming
    const authorCounts = new Map<string, number>()
    for (const m of mentions) {
      const t = Date.parse(m.publishedAt)
      if (isNaN(t) || t < MIN_60) continue
      authorCounts.set(m.authorId, (authorCounts.get(m.authorId) ?? 0) + 1)
    }
    let pSpam = 0
    let maxAuthorCount = 0
    for (const c of authorCounts.values()) { if (c > 14) { pSpam = 0.4; break }; maxAuthorCount = Math.max(maxAuthorCount, c) }
    const pBot = m60 > 2 && maxAuthorCount / Math.max(1, m60) > 0.5 ? 0.4 : 0
    const oldRatio = mentions.filter(m => Date.parse(m.publishedAt) < now - 86400_000).length / Math.max(1, mentions.length)
    const pRecycle = oldRatio > 0.3 ? 0.3 : 0
    const trashPenalty = Math.min(1, pSpam + pBot + pRecycle)

    // Shape + phase
    const shape = detectShapeFromAcceleration(acceleration, accelerationRatio, [{ ts: now, count: m15 }])
    const ageHours = (now - firstSeen) / 3600_000
    const phase = detectPhaseEarly(effectiveVelocity, acceleration, m15, m60, sourcesRecent15.size, shape, ageHours)

    // Scoring
    const velocityScore = Math.min(1, effectiveVelocity / 5)
    let accelScore: number
    if (!isFinite(effectiveAccelRatio) && effectiveVelocity > 0) accelScore = 1.0
    else if (effectiveAccelRatio >= 2) accelScore = 1.0
    else if (effectiveAccelRatio >= 1) accelScore = 0.5 + (effectiveAccelRatio - 1) * 0.5
    else if (effectiveAccelRatio >= 0.5) accelScore = 0.2 + (effectiveAccelRatio - 0.5) * 0.6
    else accelScore = Math.max(0, effectiveAccelRatio * 0.4)

    const spreadScore = Math.min(1, sourcesRecent60.size / 3)
    const entropyScore = shannonEntropy(Object.values(sourceCounts).filter(v => v > 0))
    const authorDivScore = m60 > 0 ? Math.min(1, authorsRecent60.size / Math.max(1, m60)) : (m15 > 0 ? 0.5 : 0)
    const freshnessScore = mentions.length > 0 ? Math.min(1, Math.exp(-(now - lastSeen) / (6 * 3600_000))) : 0
    const trust = sourceTrustForCluster(mentions.map(m => m.source))

    const weighted =
      0.30 * velocityScore +
      0.25 * accelScore +
      0.15 * spreadScore +
      0.08 * entropyScore +
      0.10 * authorDivScore +
      0.07 * freshnessScore +
      0.05 * trust

    const safeWeighted = Number.isFinite(weighted) ? weighted : 0
    const safePenalty = Number.isFinite(trashPenalty) ? trashPenalty : 0
    let score = Math.round(safeWeighted * (1 - safePenalty) * 100 * 100) / 100
    if (!Number.isFinite(score)) score = 0

    // Time-decay del score
    if (m30 === 0) score = Math.min(score, 5)
    if (m60 === 0) score = 0
    if (mentions.length === 1) score = Math.min(score, 15)

    // Gates (relajados durante cold start)
    const gateThreshold = coldStartCycles < 3 ? 30 : 50
    if (score >= gateThreshold && (m15 < 2 || sourcesRecent60.size < 2)) {
      score = Math.min(score, gateThreshold - 1)
    }
    if (score >= 70 && (effectiveAccelRatio < 1.5 || sourcesRecent60.size < 3)) {
      score = Math.min(score, 69)
    }

    // Source quota
    const SOCIAL_SOURCES: SourceKey[] = ['x', 'reddit', 'bluesky']
    const hasSocial = mentions.some(m => SOCIAL_SOURCES.includes(m.source) && Date.parse(m.publishedAt) > MIN_60)
    let maxSourceShare = 0
    for (const c of Object.values(sourceCounts)) {
      if (c > 0 && m60 > 0) maxSourceShare = Math.max(maxSourceShare, c / m60)
    }
    if (maxSourceShare > 0.35 && !hasSocial) {
      score = Math.round(score * (1 - Math.min(0.5, (maxSourceShare - 0.35) * 1.5)) * 100) / 100
    }

    const isTrending = score >= 35 && m60 >= 2 && m30 >= 1 && (hasSocial || maxSourceShare <= 0.5)

    // Score history
    await rLPush(`cluster:${clusterId}:scores`, JSON.stringify({ ts: now, score }))

    // Title/summary from most recent mention
    const sorted = [...mentions].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    const rep = sorted[0]
    const title = rep?.text.split('\n')[0].slice(0, 120) || 'Untitled'
    const summary = rep?.text.slice(0, 220) || title

    // Escribir cluster actualizado en Redis
    await rHSet(`cluster:${clusterId}`, {
      title,
      summary,
      primarySource: Object.entries(sourceCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || mentions[0].source,
      sources: JSON.stringify(Array.from(sourcesSet)),
      sourceCounts: JSON.stringify(sourceCounts),
      entities: JSON.stringify(extractEntities(rep?.text ?? '')),
      firstSeen: new Date(firstSeen).toISOString(),
      lastSeen: new Date(lastSeen).toISOString(),
      mentionsCount: String(mentions.length),
      uniqueAuthors: String(authors.size),
      shape,
      phase,
      velocity: String(velocity),
      score: String(score),
      trashPenalty: String(trashPenalty),
      isTrending: String(isTrending),
    })

    // Actualizar índices de trending y all
    if (score > 0) {
      await rZAdd('clusters:trending', score, clusterId)
    }
    await rZAdd('clusters:all', lastSeen, clusterId)
  }

  // -----------------------------------------------------------------------
  // Getters — leen de Redis
  // -----------------------------------------------------------------------
  async getCluster(id: string): Promise<Cluster | null> {
    const data = await rHGetAll(`cluster:${id}`)
    if (!data) return null
    return this.parseCluster(data)
  }

  private parseCluster(data: Record<string, string>): Cluster {
    return {
      id: data.id,
      signatureHash: data.signatureHash || '',
      title: data.title || 'Untitled',
      summary: data.summary || '',
      primarySource: data.primarySource as SourceKey,
      sources: JSON.parse(data.sources || '[]'),
      languages: JSON.parse(data.languages || '["und"]'),
      entities: JSON.parse(data.entities || '[]'),
      firstSeen: data.firstSeen,
      lastSeen: data.lastSeen,
      mentionsCount: parseInt(data.mentionsCount || '0', 10),
      uniqueAuthors: parseInt(data.uniqueAuthors || '0', 10),
      shape: data.shape as Shape,
      phase: data.phase as Phase,
      velocity: parseFloat(data.velocity || '0'),
      score: parseFloat(data.score || '0'),
      originator: data.originatorSource ? {
        source: data.originatorSource as SourceKey,
        author: data.originatorAuthor,
        url: data.originatorUrl || undefined,
      } : undefined,
      trashPenalty: parseFloat(data.trashPenalty || '0'),
      isTrending: data.isTrending === 'true',
      sourceCounts: JSON.parse(data.sourceCounts || '{}'),
    }
  }

  async getTrending(limit = 20): Promise<Cluster[]> {
    const now = Date.now()
    const HOUR_24 = now - 24 * 3600_000
    // Redis sorted set tiene clusterIds ordenados por score
    // Filtramos por lastSeen > 24h y score > 0
    const allMembers = await rZRangeByScore('clusters:trending', 1, 9999999999999)
    // Reverse para score desc
    const reversed = allMembers.reverse()
    const clusters: Cluster[] = []
    for (const cid of reversed) {
      if (clusters.length >= limit) break
      const cluster = await this.getCluster(cid)
      if (!cluster) continue
      if (Date.parse(cluster.lastSeen) < HOUR_24) continue
      if (cluster.score <= 0) continue
      clusters.push(cluster)
    }
    return clusters
  }

  async getAllClusters(limit = 50): Promise<Cluster[]> {
    const now = Date.now()
    const HOUR_24 = now - 24 * 3600_000
    const allMembers = await rZRangeByScore('clusters:all', HOUR_24, now)
    const reversed = allMembers.reverse()
    const clusters: Cluster[] = []
    for (const cid of reversed) {
      if (clusters.length >= limit) break
      const cluster = await this.getCluster(cid)
      if (!cluster) continue
      clusters.push(cluster)
    }
    return clusters
  }

  async getClusterMentions(clusterId: string, limit = 10): Promise<RawMention[]> {
    const now = Date.now()
    const HOUR_24 = now - 24 * 3600_000
    const members = await rZRangeByScore(`cluster:${clusterId}:mentions`, HOUR_24, now)
    const parsed = members.map(m => JSON.parse(m) as RawMention)
    return parsed.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, limit)
  }

  async getClusterHistory(clusterId: string): Promise<{ ts: string; score: number; mentions: number; velocity: number }[]> {
    const raw = await rLRange(`cluster:${clusterId}:scores`, 0, -1)
    return raw.map(s => {
      const parsed = JSON.parse(s)
      return { ts: new Date(parsed.ts).toISOString(), score: parsed.score, mentions: 0, velocity: 0 }
    })
  }

  async totalMentions(): Promise<number> {
    // Approximación: contar dedup keys es caro. Usar un contador global.
    return parseInt(await rGet('system:total_mentions') || '0', 10)
  }

  async totalClusters(): Promise<number> {
    return await rZCard('clusters:all')
  }

  async gc(): Promise<number> {
    // GC en Redis: eliminar clusters con lastSeen > 6h y < 3 menciones
    const now = Date.now()
    const cutoff = now - 6 * 3600_000
    const allMembers = await rZRangeByScore('clusters:all', 0, cutoff)
    let removed = 0
    for (const cid of allMembers) {
      const cluster = await this.getCluster(cid)
      if (!cluster || cluster.mentionsCount < 3) {
        await rDel(`cluster:${cid}`)
        await rDel(`cluster:${cid}:mentions`)
        await rDel(`cluster:${cid}:scores`)
        removed++
      }
    }
    return removed
  }

  async incrementColdStartCycle(): Promise<number> {
    const cycles = await rIncr('system:cold_start_cycles')
    if (cycles > 100) {
      // Reset para evitar overflow
      await rSet('system:cold_start_cycles', '3', 86400)
      return 3
    }
    return cycles
  }

  async incrementTotalMentions(count: number): Promise<void> {
    const current = parseInt(await rGet('system:total_mentions') || '0', 10)
    await rSet('system:total_mentions', String(current + count))
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
export const store = new RedisClusterStore()

export async function ingestMentions(mentions: RawMention[]): Promise<IngestResult> {
  let ingested = 0
  let newClusters = 0
  const updatedClusters = new Set<string>()
  for (const m of mentions) {
    const r = await store.addMention(m)
    if (r.isNew) {
      ingested++
      if (r.clusterId) updatedClusters.add(r.clusterId)
    }
  }
  await store.incrementTotalMentions(ingested)
  return { ingested, newClusters, updatedClusters }
}

// ---------------------------------------------------------------------------
// clusterToTrend + briefing (igual que antes, sin cambios)
// ---------------------------------------------------------------------------
const TONE_BY_SOURCE: Record<SourceKey, TrendTone> = {
  reddit: 'hot', bluesky: 'cool', hn: 'cool', rss: 'muted', gdelt: 'mint', github: 'mint', x: 'hot',
}
const COLOR_BY_SOURCE: Record<SourceKey, string> = {
  reddit: 'var(--hot)', bluesky: 'oklch(0.72 0.21 300)', hn: 'oklch(0.78 0.12 285)',
  rss: 'oklch(0.66 0.02 285)', gdelt: 'oklch(0.65 0.18 265)', github: 'oklch(0.78 0.16 140)', x: 'var(--hot)',
}

export function clusterToTrend(cluster: Cluster): Trend {
  const score = Number.isFinite(cluster.score) ? cluster.score : 0
  const delta = cluster.phase === 'rising' ? Math.round(cluster.velocity * 10) :
    cluster.phase === 'decaying' ? -Math.round(cluster.velocity * 5) :
    cluster.phase === 'peaked' ? Math.round(cluster.velocity * 2) : 0
  const dir: TrendDir = delta > 5 ? 'up' : delta < -5 ? 'down' : 'flat'
  const heat = score >= 70 ? 'Muy caliente' : score >= 50 ? 'Caliente' : score >= 30 ? 'Templado' : 'Enfriándose'
  const isGithubOnly = cluster.sources.length === 1 && cluster.sources[0] === 'github'
  const isTechnicalOnly = cluster.sources.every(s => s === 'github' || s === 'hn')
  const techLabel = isGithubOnly ? 'Tendencia técnica · Desarrollo' : isTechnicalOnly ? 'Tendencia técnica' : ''
  const phaseLabel = cluster.phase === 'forming' ? 'Señal emergente' : cluster.phase === 'rising' ? 'Crecimiento acelerado' : cluster.phase === 'peaked' ? 'En pico' : 'En desaceleración'
  const status = techLabel ? `${techLabel} · ${phaseLabel}` : phaseLabel
  const lastSeenDate = new Date(cluster.lastSeen)
  const time = `${String(lastSeenDate.getHours()).padStart(2, '0')}:${String(lastSeenDate.getMinutes()).padStart(2, '0')}`
  const why = cluster.summary.slice(0, 180) + (cluster.summary.length > 180 ? '…' : '')
  const ageMin = Math.max(1, Math.round((Date.now() - Date.parse(cluster.firstSeen)) / 60000))
  const velocityPerHour = Math.round(cluster.velocity * 60)
  const evidence = [
    { label: 'Velocidad', value: `${velocityPerHour}/h` },
    { label: 'Fuentes', value: String(cluster.sources.length) },
    { label: 'Edad', value: ageMin < 60 ? `${ageMin}min` : `${Math.round(ageMin / 60)}h` },
  ]
  const tags = cluster.entities.filter(e => ['brand', 'cashtag', 'hashtag'].includes(e.type)).slice(0, 5).map(e => e.value)
  return {
    id: cluster.id, title: cluster.title, source: cluster.primarySource,
    color: COLOR_BY_SOURCE[cluster.primarySource], status, tone: TONE_BY_SOURCE[cluster.primarySource],
    dir, time, heat, confidence: Math.round(score), mentions: cluster.mentionsCount, delta,
    shape: cluster.shape, why, evidence, inTimeline: cluster.isTrending, phase: cluster.phase,
    velocity: cluster.velocity, uniqueAuthors: cluster.uniqueAuthors, firstSeen: cluster.firstSeen,
    lastSeen: cluster.lastSeen, originator: cluster.originator, sources: cluster.sources,
    sourceCounts: cluster.sourceCounts, tags, hasMedia: false, trashPenalty: cluster.trashPenalty,
  }
}

export function generateExtractiveBriefing(cluster: Cluster, mentions: RawMention[]) {
  const top = mentions.slice(0, 5)
  const evidenceMentionIds = top.map(m => `${m.source}:${m.externalId}`)
  const sourcesList = Array.from(new Set(cluster.sources)).join(', ')
  const velocityPerHour = Math.round(cluster.velocity * 60)
  const sanitize = (s: string) => s.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  const recentText = top[0] ? sanitize(top[0].text).slice(0, 200) : ''
  const isGithubOnly = cluster.sources.length === 1 && cluster.sources[0] === 'github'
  const isTechnicalOnly = cluster.sources.every(s => s === 'github' || s === 'hn')
  const whatHappened = isGithubOnly ? `Actividad de desarrollo en GitHub: ${cluster.title}.` : isTechnicalOnly ? `Señal técnica en ${sourcesList}: ${cluster.title}.` : `Narrativa en ${sourcesList}: ${cluster.title}.`
  const whyItMatters = `${velocityPerHour} menc/hora (15min). ${cluster.mentionsCount} menciones de ${cluster.uniqueAuthors} autores. Fase: ${cluster.phase}.`
  const evidence = recentText ? `Fuente (${top[0].source}): "${recentText}"` : 'Sin menciones recientes.'
  const narrative = `${whatHappened} ${whyItMatters} ${evidence}`
  const keyPoints = [`${velocityPerHour} menc/hora`, `${cluster.mentionsCount} menc · ${cluster.uniqueAuthors} autores`, `Fuentes: ${sourcesList}`, `Score: ${cluster.score.toFixed(1)}/100`, isTechnicalOnly ? 'Tendencia técnica' : 'Respaldado por redes sociales'].filter(Boolean)
  const riskFlags: string[] = []
  if (cluster.trashPenalty > 0.4) riskFlags.push('Spam/bot')
  if (cluster.trashPenalty >= 0.3 && cluster.trashPenalty < 0.4) riskFlags.push('Posible bot')
  if (cluster.sources.length === 1 && cluster.sources[0] === 'github') riskFlags.push('Solo GitHub')
  if (cluster.velocity > 5) riskFlags.push('Velocidad anómala')
  if (cluster.phase === 'decaying') riskFlags.push('En desaceleración')
  const confidence = Math.max(0.2, Math.min(0.95, cluster.score / 100))
  return { narrative, keyPoints, riskFlags, confidence, evidenceMentionIds }
}
