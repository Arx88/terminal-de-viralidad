/**
 * POST /api/v1/engines/:id/toggle — toggle engine on/off
 */
import { NextRequest } from 'next/server'
import { getEngineStates, setEngineEnabled } from '@/lib/server/streaming/loop'
import { SOURCE_CONFIGS } from '@/lib/server/config/sources'
import { EngineIdParamsSchema, ToggleEngineBodySchema, apiOk, apiError, parseZod } from '@/lib/server/api/schemas'
import type { EngineStatusDTO, EngineLogDTO } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await ctx.params
  const p = parseZod(EngineIdParamsSchema, params)
  if (!p.ok) return p.response

  const body = await req.json().catch(() => ({}))
  const b = parseZod(ToggleEngineBodySchema, body)
  if (!b.ok) return b.response

  setEngineEnabled(p.value.id, b.value.enabled)

  const st = getEngineStates().find((s) => s.source === p.value.id)!
  const dto: EngineStatusDTO = {
    id: st.source,
    source: st.source,
    name: SOURCE_CONFIGS[st.source].name,
    enabled: st.enabled,
    health: st.health,
    circuitState: st.circuitState,
    lastRunAt: st.lastRunAt ? new Date(st.lastRunAt).toISOString() : null,
    itemsIngested: st.itemsIngested,
    itemsTotal: st.itemsTotal,
    errorsLast24h: st.errorsLast24h,
    latencyMs: st.latencyMs,
    pending: 0,
    recentLogs: [] as EngineLogDTO[],
  }
  return apiOk(dto)
}
