/**
 * GET /api/v1/trends/:id/briefing — generate or return cached briefing
 *
 * FIX (v2.0.1): one-shot ingest if cluster not in store (Vercel stateless).
 * ClusterIds are now deterministic (hash of normalized first-mention text),
 * so a re-ingest will produce the same id and the briefing will resolve.
 */
import { NextRequest } from 'next/server'
import { store, generateExtractiveBriefing, ingestMentions } from '@/lib/server/core/redis-store'
import { TrendIdParamsSchema, BriefingQuerySchema, apiOk, apiError, parseZod } from '@/lib/server/api/schemas'
import { runIngestion } from '@/lib/server/ingest/adapters'
import { ALL_SOURCES } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

let briefingOneShotDone = false

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await ctx.params
  const p = parseZod(TrendIdParamsSchema, params)
  if (!p.ok) return p.response

  const sp = Object.fromEntries(req.nextUrl.searchParams)
  const q = parseZod(BriefingQuerySchema, sp)
  if (!q.ok) return q.response

  let cluster = await store.getCluster(p.value.id)

  // One-shot ingest if cluster not found (Vercel stateless cold-start)
  if (!cluster && !briefingOneShotDone) {
    briefingOneShotDone = true
    try {
      const mentions = await runIngestion(ALL_SOURCES)
      ingestMentions(mentions)
      cluster = await store.getCluster(p.value.id)
    } catch {
      // swallow
    }
  }

  if (!cluster) return apiError(404, 'Not found', `Cluster ${p.value.id} not found after ingest`)

  const mentions = await store.getClusterMentions(p.value.id, 10)
  const { narrative, keyPoints, riskFlags, confidence, evidenceMentionIds } = generateExtractiveBriefing(cluster, mentions)

  return apiOk({
    clusterId: cluster.id,
    narrative,
    keyPoints,
    riskFlags,
    confidence,
    evidenceMentionIds,
    model: 'extractive-v1',
    tokensUsed: 0,
    latencyMs: 0,
    rangeKey: q.value.range,
    generatedAt: new Date().toISOString(),
  })
}
