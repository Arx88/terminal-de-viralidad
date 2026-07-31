/**
 * GET /api/v1/reports — aggregate KPIs by range
 */
import { NextRequest } from 'next/server'
import { apiOk, parseZod, RangeKeySchema } from '@/lib/server/api/schemas'
import { store } from '@/lib/server/core/redis-store'
import { ALL_SOURCES } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<Response> {
  const sp = Object.fromEntries(req.nextUrl.searchParams)
  const q = parseZod(RangeKeySchema, sp.range ?? '6H')
  if (!q.ok) return apiOk({ range: '6H', totals: await buildReport('6H') })
  return apiOk({ range: q.value, totals: await buildReport(q.value) })
}

async function buildReport(range: string) {
  const clusters = await store.getAllClusters(200)
  const totalMentions = clusters.reduce((s, c) => s + c.mentionsCount, 0)
  const bySource = Object.fromEntries(ALL_SOURCES.map((s) => [s, 0])) as Record<string, number>
  for (const c of clusters) bySource[c.primarySource]++
  const byPhase = { forming: 0, rising: 0, peaked: 0, decaying: 0 }
  for (const c of clusters) byPhase[c.phase]++
  return {
    range,
    clusters: clusters.length,
    mentions: totalMentions,
    bySource,
    byPhase,
    topScore: clusters[0]?.score ?? 0,
    avgScore: clusters.length ? clusters.reduce((s, c) => s + c.score, 0) / clusters.length : 0,
  }
}
