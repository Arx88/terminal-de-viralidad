/**
 * POST /api/v1/tick — trigger externo para ingesta
 *
 * Llamado por GitHub Actions cron cada 5min. Adquiere lock en Redis,
 * ejecuta ingesta de todas las fuentes habilitadas, libera lock.
 * 25s maxDuration (Vercel Hobby = 10s en realidad, pero configuramos 25).
 */

import { NextRequest } from 'next/server'
import { runIngestion } from '@/lib/server/ingest/adapters'
import { ingestMentions, store, clusterToTrend } from '@/lib/server/core/redis-store'
import { updateEngineStatesFromIngest } from '@/lib/server/streaming/loop'
import { sseBus } from '@/lib/server/streaming/bus'
import { acquireLock, rIncr } from '@/lib/server/redis'
import { apiOk, apiError } from '@/lib/server/api/schemas'
import { ALL_SOURCES } from '@/lib/types'
import { logger } from '@/lib/server/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 25

export async function POST(req: NextRequest): Promise<Response> {
  // API key simple (igual que /ingest)
  const authHeader = req.headers.get('authorization')
  const apiKey = authHeader?.replace('Bearer ', '') || req.headers.get('x-tick-key')
  const validKey = process.env.VIRAHUB_INGEST_API_KEY || 'virahub-local-2025'
  if (apiKey !== validKey) {
    return apiError(401, 'Unauthorized', 'Invalid or missing API key')
  }

  // Distributed lock: solo 1 tick a la vez
  const unlock = await acquireLock('lock:tick', 25)
  if (!unlock) {
    return apiOk({ skipped: true, reason: 'Another tick is running' })
  }

  try {
    const start = Date.now()
    logger.info('tick: starting ingestion')

    // Incrementar contador de cold start
    await store.incrementColdStartCycle()

    // Ejecutar ingesta
    const mentions = await runIngestion(ALL_SOURCES)
    const result = await ingestMentions(mentions)
    await updateEngineStatesFromIngest(mentions, Date.now() - start)

    // Publicar eventos SSE
    sseBus.publish('scan.tick', {
      step: await rIncr('system:tick_count'),
      analyzed: result.ingested,
      latencyMs: Date.now() - start,
      ts: new Date().toISOString(),
    })

    for (const clusterId of result.updatedClusters) {
      const cluster = await store.getCluster(clusterId)
      if (cluster) {
        sseBus.publish('trend.upserted', clusterToTrend(cluster))
      }
    }

    logger.info('tick: done', {
      ingested: result.ingested,
      updatedClusters: result.updatedClusters.size,
      durationMs: Date.now() - start,
    })

    return apiOk({
      ingested: result.ingested,
      updatedClusters: result.updatedClusters.size,
      durationMs: Date.now() - start,
    })
  } catch (err) {
    logger.error('tick: failed', { err: (err as Error).message })
    return apiError(500, 'Tick failed', (err as Error).message)
  } finally {
    if (unlock) await unlock()
  }
}
