/**
 * POST /api/v1/saved/:id — save a cluster by id
 *
 * FIX (v2.0.2): one-shot ingest if cluster not in store (Vercel stateless).
 * Without this, POST /saved/cl_xxx returns 404 because the lambda handling
 * the POST doesn't have the cluster in its in-memory store.
 */
import { NextRequest } from 'next/server'
import { apiOk, apiError, parseZod, SaveTrendBodySchema } from '@/lib/server/api/schemas'
import { store, clusterToTrend, ingestMentions } from '@/lib/server/core/redis-store'
import type { SavedTrendDTO } from '@/lib/types'
import { saved } from '@/app/api/v1/saved/route'
import { runIngestion } from '@/lib/server/ingest/adapters'
import { ALL_SOURCES } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

let savedOneShotDone = false

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await ctx.params
  let cluster = await store.getCluster(params.id)

  // One-shot ingest if cluster not found (Vercel stateless cold-start)
  if (!cluster && !savedOneShotDone) {
    savedOneShotDone = true
    try {
      const mentions = await runIngestion(ALL_SOURCES)
      await ingestMentions(mentions)
      cluster = await store.getCluster(params.id)
    } catch {
      // swallow
    }
  }

  if (!cluster) return apiError(404, 'Not found', `Cluster ${params.id} not found after ingest`)

  const body = await req.json().catch(() => ({}))
  const b = parseZod(SaveTrendBodySchema, body)
  if (!b.ok) return b.response

  const id = 'sv_' + Math.random().toString(36).slice(2, 12)
  const now = new Date().toISOString()
  const dto: SavedTrendDTO = {
    id,
    clusterId: cluster.id,
    cluster: clusterToTrend(cluster),
    folder: b.value.folder ?? null,
    notes: b.value.notes ?? null,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  }
  saved.set(id, dto)
  return apiOk(dto)
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await ctx.params
  let deleted = false
  for (const [sid, sv] of saved.entries()) {
    if (sid === params.id || sv.clusterId === params.id) {
      saved.delete(sid)
      deleted = true
      break
    }
  }
  if (!deleted) return apiError(404, 'Not found', `Saved ${params.id} not found`)
  return apiOk({ id: params.id, deleted: true })
}
