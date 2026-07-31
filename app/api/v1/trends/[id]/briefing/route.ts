/**
 * GET /api/v1/trends/:id/briefing — generate or return cached briefing
 */
import { NextRequest } from 'next/server'
import { store, generateExtractiveBriefing } from '@/lib/server/core/store'
import { TrendIdParamsSchema, BriefingQuerySchema, apiOk, apiError, parseZod } from '@/lib/server/api/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await ctx.params
  const p = parseZod(TrendIdParamsSchema, params)
  if (!p.ok) return p.response

  const sp = Object.fromEntries(req.nextUrl.searchParams)
  const q = parseZod(BriefingQuerySchema, sp)
  if (!q.ok) return q.response

  const cluster = store.getCluster(p.value.id)
  if (!cluster) return apiError(404, 'Not found', `Cluster ${p.value.id} not found`)

  const mentions = store.getClusterMentions(p.value.id, 10)
  const { narrative, keyPoints, riskFlags, confidence } = generateExtractiveBriefing(cluster, mentions)

  return apiOk({
    clusterId: cluster.id,
    narrative,
    keyPoints,
    riskFlags,
    confidence,
    model: 'extractive-v1',
    tokensUsed: 0,
    latencyMs: 0,
    rangeKey: q.value.range,
    generatedAt: new Date().toISOString(),
  })
}
