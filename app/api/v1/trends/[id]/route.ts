/**
 * GET /api/v1/trends/:id — detail with history
 */
import { NextRequest } from 'next/server'
import { store, clusterToTrend } from '@/lib/server/core/store'
import { TrendIdParamsSchema, TrendDetailQuerySchema, apiOk, apiError, parseZod } from '@/lib/server/api/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await ctx.params
  const p = parseZod(TrendIdParamsSchema, params)
  if (!p.ok) return p.response

  const sp = Object.fromEntries(req.nextUrl.searchParams)
  const q = parseZod(TrendDetailQuerySchema, sp)
  if (!q.ok) return q.response

  const cluster = store.getCluster(p.value.id)
  if (!cluster) return apiError(404, 'Not found', `Cluster ${p.value.id} not found`)

  const trend = clusterToTrend(cluster)
  trend.history = store.getClusterHistory(p.value.id)
  return apiOk(trend)
}
