/**
 * GET /api/v1/trends — list trending clusters
 *
 * On Vercel serverless each lambda is stateless. We trigger a one-shot
 * ingest if the store is empty or stale (>2min since last ingest), so
 * the user always gets fresh data on page load.
 */
import { NextRequest } from 'next/server'
import { store, clusterToTrend, ingestMentions } from '@/lib/server/core/redis-store'
import { ListTrendsQuerySchema, apiOk, apiError, parseZod } from '@/lib/server/api/schemas'
import { startIngestLoop, getIngestStats, updateEngineStatesFromIngest } from '@/lib/server/streaming/loop'
import { runIngestion } from '@/lib/server/ingest/adapters'
import { ALL_SOURCES } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30 // Vercel: allow up to 30s for one-shot ingest

let lastOneShotAt = 0
const ONE_SHOT_STALE_MS = 90_000 // re-run if last ingest >90s ago

export async function GET(req: NextRequest): Promise<Response> {
  // Trigger ingest loop start (for SSE-connected clients)
  startIngestLoop()

  // One-shot ingest if stale (covers Vercel stateless lambdas)
  const stats = await getIngestStats()
  const now = Date.now()
  if (stats.totalClusters === 0 || now - (stats.lastIngestAt || 0) > ONE_SHOT_STALE_MS) {
    if (now - lastOneShotAt > ONE_SHOT_STALE_MS) {
      lastOneShotAt = now
      try {
        const start = Date.now()
        const mentions = await runIngestion(ALL_SOURCES)
        await ingestMentions(mentions)
        updateEngineStatesFromIngest(mentions, Date.now() - start)
      } catch {
        // swallow — return whatever we have
      }
    }
  }

  const sp = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = parseZod(ListTrendsQuerySchema, sp)
  if (!parsed.ok) return parsed.response

  const { source, phase, minScore, q, limit } = parsed.value

  let clusters
  try {
    clusters = await store.getTrending(100)
  } catch (err) {
    console.error('trends: getTrending failed', err)
    clusters = []
  }
  if (source) clusters = clusters.filter((c) => c.primarySource === source)
  if (phase) clusters = clusters.filter((c) => c.phase === phase)
  if (typeof minScore === 'number') clusters = clusters.filter((c) => c.score >= minScore)
  if (q) {
    const ql = q.toLowerCase()
    clusters = clusters.filter((c) =>
      c.title.toLowerCase().includes(ql) ||
      c.summary.toLowerCase().includes(ql),
    )
  }

  try {
    const trends = clusters.slice(0, limit).map(clusterToTrend)
    return apiOk({ trends, nextCursor: null as string | null }, { total: trends.length })
  } catch (err) {
    console.error('trends: clusterToTrend failed', err)
    return apiOk({ trends: [], nextCursor: null }, { total: 0 })
  }
}
