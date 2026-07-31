/**
 * GET /api/v1/engines — list all engine states
 */
import { getEngineStates } from '@/lib/server/streaming/loop'
import { SOURCE_CONFIGS } from '@/lib/server/config/sources'
import { apiOk } from '@/lib/server/api/schemas'
import type { EngineStatusDTO, EngineLogDTO } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const states = getEngineStates()
  const dtos: EngineStatusDTO[] = states.map((s) => ({
    id: s.source,
    source: s.source,
    name: SOURCE_CONFIGS[s.source].name,
    enabled: s.enabled,
    health: s.health,
    circuitState: s.circuitState,
    lastRunAt: s.lastRunAt ? new Date(s.lastRunAt).toISOString() : null,
    itemsIngested: s.itemsIngested,
    itemsTotal: s.itemsTotal,
    errorsLast24h: s.errorsLast24h,
    latencyMs: s.latencyMs,
    pending: 0,
    recentLogs: [] as EngineLogDTO[],
  }))
  return apiOk(dtos)
}
