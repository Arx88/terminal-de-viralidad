/**
 * Ingest loop — kicks off the periodic ingest cycle.
 *
 * On Vercel, the loop runs INSIDE the long-lived SSE connection's lambda.
 * When a client connects to /api/v1/stream, the loop starts (if not already
 * running) and keeps running until the lambda is killed.
 *
 * On local v2.0, this would run as a separate worker process.
 */

import { ALL_SOURCES, type SourceKey, type RawMention } from '@/lib/types'
import { runIngestion, getAdapterLatency } from '@/lib/server/ingest/adapters'
import { ingestMentions, store, startGcLoop } from '@/lib/server/core/store'
import { sseBus } from '@/lib/server/streaming/bus'
import { clusterToTrend, generateExtractiveBriefing } from '@/lib/server/core/store'
import { logger } from '@/lib/server/logger'

let loopRunning = false
let loopTimer: NodeJS.Timeout | null = null
let tickCount = 0
let lastIngestAt = 0
let lastIngestDurationMs = 0
let totalIngested = 0

const ENABLED_SOURCES: SourceKey[] = [...ALL_SOURCES]
const POLL_INTERVAL_MS = 45_000 // 45 seconds

export interface EngineRuntimeState {
  source: SourceKey
  enabled: boolean
  health: 'online' | 'degraded' | 'offline'
  lastRunAt: number | null
  itemsIngested: number
  itemsTotal: number
  errorsLast24h: number
  latencyMs: number
  circuitState: 'closed' | 'open' | 'half_open'
}

const engineStates = new Map<SourceKey, EngineRuntimeState>()
for (const s of ALL_SOURCES) {
  engineStates.set(s, {
    source: s,
    enabled: true,
    health: 'online',
    lastRunAt: null,
    itemsIngested: 0,
    itemsTotal: 0,
    errorsLast24h: 0,
    latencyMs: 0,
    circuitState: 'closed',
  })
}

export function getEngineStates(): EngineRuntimeState[] {
  return ALL_SOURCES.map((s) => engineStates.get(s)!)
}

export function setEngineEnabled(source: SourceKey, enabled: boolean): void {
  const st = engineStates.get(source)
  if (st) {
    st.enabled = enabled
    sseBus.publish('engine.status_changed', {
      source,
      enabled,
      health: st.health,
      circuitState: st.circuitState,
    })
  }
}

/** Update engine states from a fresh batch of mentions. Shared by tick() and one-shot ingests. */
export function updateEngineStatesFromIngest(mentions: RawMention[], durationMs: number): void {
  const startTs = Date.now() - durationMs
  const bySource = new Map<SourceKey, number>()
  for (const m of mentions) bySource.set(m.source, (bySource.get(m.source) ?? 0) + 1)
  for (const s of ALL_SOURCES) {
    const st = engineStates.get(s)
    if (!st) continue
    const ingested = bySource.get(s) ?? 0
    // Per-adapter latency (real, not uniform) — FIX from DataSanity audit
    const adapterLatency = getAdapterLatency(s)
    st.lastRunAt = startTs
    st.itemsIngested = ingested
    st.itemsTotal += ingested
    st.latencyMs = adapterLatency || durationMs
    st.health = ingested > 0 ? 'online' : (st.enabled ? 'degraded' : 'offline')
  }
  lastIngestAt = startTs
  lastIngestDurationMs = durationMs
  const uniqueHashes = new Set<string>()
  for (const m of mentions) uniqueHashes.add(m.contentHash)
  totalIngested += uniqueHashes.size
  tickCount++
}

async function tick(): Promise<void> {
  const startTs = Date.now()
  const activeSources = ENABLED_SOURCES.filter((s) => engineStates.get(s)?.enabled)
  if (activeSources.length === 0) {
    scheduleNext()
    return
  }

  try {
    const mentions = await runIngestion(activeSources)
    const result = ingestMentions(mentions)
    totalIngested += result.ingested
    lastIngestAt = startTs
    lastIngestDurationMs = Date.now() - startTs

    // Update engine states per source
    const bySource = new Map<SourceKey, number>()
    for (const m of mentions) bySource.set(m.source, (bySource.get(m.source) ?? 0) + 1)
    for (const s of activeSources) {
      const st = engineStates.get(s)!
      const ingested = bySource.get(s) ?? 0
      st.lastRunAt = startTs
      st.itemsIngested = ingested
      st.itemsTotal += ingested
      st.latencyMs = lastIngestDurationMs
      st.health = ingested > 0 ? 'online' : 'degraded'
    }

    // Publish scan.tick
    sseBus.publish('scan.tick', {
      step: tickCount,
      analyzed: totalIngested,
      latencyMs: lastIngestDurationMs,
      ts: new Date().toISOString(),
    })

    // Publish trend upserts for updated clusters
    for (const clusterId of result.updatedClusters) {
      const cluster = store.getCluster(clusterId)
      if (!cluster) continue
      const trend = clusterToTrend(cluster)
      sseBus.publish('trend.upserted', trend)
    }

    // Publish engine status changes
    for (const s of activeSources) {
      const st = engineStates.get(s)!
      sseBus.publish('engine.status_changed', {
        source: s,
        enabled: st.enabled,
        health: st.health,
        circuitState: st.circuitState,
        lastRunAt: st.lastRunAt,
        itemsIngested: st.itemsIngested,
        itemsTotal: st.itemsTotal,
        latencyMs: st.latencyMs,
      })
    }

    logger.info('ingest tick', {
      tick: tickCount,
      ingested: result.ingested,
      updatedClusters: result.updatedClusters.size,
      totalClusters: store.totalClusters(),
      durationMs: lastIngestDurationMs,
    })
  } catch (err) {
    logger.error('ingest tick failed', { err: (err as Error).message })
  }

  scheduleNext()
}

function scheduleNext(): void {
  if (!loopRunning) return
  loopTimer = setTimeout(() => {
    tick().catch(() => {})
  }, POLL_INTERVAL_MS)
}

export function startIngestLoop(): void {
  if (loopRunning) return
  loopRunning = true
  startGcLoop()
  // Kick off first tick immediately
  tick().catch(() => {})
  logger.info('ingest loop started', { intervalMs: POLL_INTERVAL_MS })
}

export function stopIngestLoop(): void {
  loopRunning = false
  if (loopTimer) clearTimeout(loopTimer)
  loopTimer = null
}

export function getIngestStats(): {
  tickCount: number
  totalIngested: number
  lastIngestAt: number
  lastIngestDurationMs: number
  totalClusters: number
} {
  return {
    tickCount,
    totalIngested,
    lastIngestAt,
    lastIngestDurationMs,
    totalClusters: store.totalClusters(),
  }
}

/** Generate briefing for a cluster, publishing the result via SSE. */
export function generateAndPublishBriefing(clusterId: string, range: string = '6H'): void {
  const cluster = store.getCluster(clusterId)
  if (!cluster) return
  const mentions = store.getClusterMentions(clusterId, 10)
  const { narrative, keyPoints, riskFlags, confidence } = generateExtractiveBriefing(cluster, mentions)
  sseBus.publish('briefing.generated', {
    clusterId,
    narrative,
    keyPoints,
    riskFlags,
    confidence,
    model: 'extractive-v1',
    tokensUsed: 0,
    latencyMs: 0,
    rangeKey: range,
    generatedAt: new Date().toISOString(),
  })
}
