/**
 * GET /api/v1/trends/:id — detail with history
 *
 * FIX (v2.0.1): one-shot ingest if cluster not in store (Vercel stateless).
 * ClusterIds are deterministic (hash of normalized first-mention text), so
 * a re-ingest will produce the same id and the detail will resolve.
 */
import { NextRequest } from 'next/server'
import { store, clusterToTrend, ingestMentions } from '@/lib/server/core/store'
import { TrendIdParamsSchema, TrendDetailQuerySchema, apiOk, apiError, parseZod } from '@/lib/server/api/schemas'
import { runIngestion } from '@/lib/server/ingest/adapters'
import { ALL_SOURCES } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

let detailOneShotDone = false

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await ctx.params
  const p = parseZod(TrendIdParamsSchema, params)
  if (!p.ok) return p.response

  const sp = Object.fromEntries(req.nextUrl.searchParams)
  const q = parseZod(TrendDetailQuerySchema, sp)
  if (!q.ok) return q.response

  let cluster = store.getCluster(p.value.id)

  // One-shot ingest if cluster not found
  if (!cluster && !detailOneShotDone) {
    detailOneShotDone = true
    try {
      const mentions = await runIngestion(ALL_SOURCES)
      ingestMentions(mentions)
      cluster = store.getCluster(p.value.id)
    } catch {
      // swallow
    }
  }

  if (!cluster) return apiError(404, 'Not found', `Cluster ${p.value.id} not found after ingest`)

  const trend = clusterToTrend(cluster)
  trend.history = store.getClusterHistory(p.value.id)
  return apiOk(trend)
}
