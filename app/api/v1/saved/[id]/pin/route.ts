/**
 * POST /api/v1/saved/:id/pin — toggle pin
 *
 * FIX (v2.0.1): validate body FIRST (Zod), then check resource existence.
 * Avoids information leak where 404 vs 400 reveals which clusterIds exist.
 */
import { NextRequest } from 'next/server'
import { apiOk, apiError, parseZod, PinSavedBodySchema } from '@/lib/server/api/schemas'
import { saved } from '@/app/api/v1/saved/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  // 1. Validate body first
  const body = await req.json().catch(() => ({}))
  const b = parseZod(PinSavedBodySchema, body)
  if (!b.ok) return b.response

  // 2. Then check resource existence
  const params = await ctx.params
  const existing = saved.get(params.id)
  if (!existing) return apiError(404, 'Not found', `Saved ${params.id} not found`)

  const updated = { ...existing, pinned: b.value.pinned, updatedAt: new Date().toISOString() }
  saved.set(params.id, updated)
  return apiOk(updated)
}
