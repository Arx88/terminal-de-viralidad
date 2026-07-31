/**
 * PATCH /api/v1/alerts/:id
 */
import { NextRequest } from 'next/server'
import { apiOk, apiError, parseZod, PatchAlertBodySchema } from '@/lib/server/api/schemas'
import { alerts } from '@/app/api/v1/alerts/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await ctx.params
  const existing = alerts.get(params.id)
  if (!existing) return apiError(404, 'Not found', `Alert ${params.id} not found`)

  const body = await req.json().catch(() => ({}))
  const b = parseZod(PatchAlertBodySchema, body)
  if (!b.ok) return b.response

  const updated: typeof existing = {
    ...existing,
    armed: b.value.armed ?? existing.armed,
    cooldownSec: b.value.cooldownSec ?? existing.cooldownSec,
    updatedAt: new Date().toISOString(),
  }
  alerts.set(params.id, updated)
  return apiOk(updated)
}
