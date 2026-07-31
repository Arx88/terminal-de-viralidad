/**
 * GET /api/v1/system/about — health check
 */
import { apiOk } from '@/lib/server/api/schemas'
import { getIngestStats } from '@/lib/server/streaming/loop'
import { store } from '@/lib/server/core/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
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
