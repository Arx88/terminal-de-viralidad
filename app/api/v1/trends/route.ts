/**
 * GET /api/v1/trends — list trending clusters
 */
import { NextRequest } from 'next/server'
import { store, clusterToTrend } from '@/lib/server/core/store'
import { ListTrendsQuerySchema, apiOk, apiError, parseZod } from '@/lib/server/api/schemas'
import { startIngestLoop } from '@/lib/server/streaming/loop'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<Response> {
  // Trigger ingest loop start on first request (Vercel cold start)
  startIngestLoop()

  const sp = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = parseZod(ListTrendsQuerySchema, sp)
  if (!parsed.ok) return parsed.response

  const { source, phase, minScore, q, limit } = parsed.value

  let clusters = store.getTrending(100)
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

  const trends = clusters.slice(0, limit).map(clusterToTrend)
  return apiOk({ trends, nextCursor: null as string | null }, { total: trends.length })
}
