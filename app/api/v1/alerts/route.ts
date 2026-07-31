/**
 * GET /api/v1/alerts — list (in-memory)
 * POST /api/v1/alerts — create
 */

import { NextRequest } from 'next/server'
import { apiOk, apiError, parseZod, CreateAlertBodySchema } from '@/lib/server/api/schemas'
import type { AlertRuleDTO, AlertChannel } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const alerts = new Map<string, AlertRuleDTO>()

export async function GET(): Promise<Response> {
  return apiOk(Array.from(alerts.values()))
}

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.json().catch(() => ({}))
  const b = parseZod(CreateAlertBodySchema, body)
  if (!b.ok) return b.response

  const id = 'al_' + Math.random().toString(36).slice(2, 12)
  const now = new Date().toISOString()
  const dto: AlertRuleDTO = {
    id,
    clusterId: b.value.clusterId ?? null,
    label: b.value.label,
    condition: b.value.condition,
    threshold: b.value.threshold,
    channel: (b.value.channel ?? 'toast') as AlertChannel,
    armed: true,
    lastFiredAt: null,
    cooldownSec: 300,
    fireCount: 0,
    createdAt: now,
    updatedAt: now,
  }
  alerts.set(id, dto)
  return apiOk(dto)
}
