/**
 * POST /api/v1/saved/:id — save a cluster by id
 */
import { NextRequest } from 'next/server'
import { apiOk, apiError, parseZod, SaveTrendBodySchema } from '@/lib/server/api/schemas'
import { store, clusterToTrend } from '@/lib/server/core/store'
import type { SavedTrendDTO } from '@/lib/types'
import { saved } from '@/app/api/v1/saved/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await ctx.params
  const cluster = store.getCluster(params.id)
  if (!cluster) return apiError(404, 'Not found', `Cluster ${params.id} not found`)

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
  // Try by saved entry id first, then by clusterId
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
