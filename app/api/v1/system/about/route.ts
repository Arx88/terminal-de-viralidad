/**
 * GET /api/v1/system/about — health check + one-shot ingest trigger
 */
import { apiOk } from '@/lib/server/api/schemas'
import { getIngestStats } from '@/lib/server/streaming/loop'
import { updateEngineStatesFromIngest } from '@/lib/server/streaming/loop'
import { store, ingestMentions } from '@/lib/server/core/store'
import { runIngestion } from '@/lib/server/ingest/adapters'
import { ALL_SOURCES } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

let aboutOneShotDone = false

export async function GET(): Promise<Response> {
  // One-shot ingest on cold start so /about returns real numbers
  if (!aboutOneShotDone) {
    aboutOneShotDone = true
    try {
      const start = Date.now()
      const mentions = await runIngestion(ALL_SOURCES)
      ingestMentions(mentions)
      updateEngineStatesFromIngest(mentions, Date.now() - start)
    } catch {
      // swallow
    }
  }

  const stats = getIngestStats()
  return apiOk({
    version: '2.0.0',
    uptime: process.uptime(),
    ingest: stats,
    clusters: store.totalClusters(),
    mentions: store.totalMentions(),
    ollama: 'not-configured-v2.0-local',
    postgres: 'in-memory',
    redis: 'in-memory',
  })
}
