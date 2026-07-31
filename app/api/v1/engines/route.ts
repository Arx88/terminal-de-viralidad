/**
 * GET /api/v1/engines — list all engine states
 *
 * Triggers a one-shot ingest on cold-start so engine states have real data.
 */
import { getEngineStates } from '@/lib/server/streaming/loop'
import { SOURCE_CONFIGS } from '@/lib/server/config/sources'
import { apiOk } from '@/lib/server/api/schemas'
import type { EngineStatusDTO, EngineLogDTO } from '@/lib/types'
import { runIngestion } from '@/lib/server/ingest/adapters'
import { ingestMentions } from '@/lib/server/core/store'
import { updateEngineStatesFromIngest } from '@/lib/server/streaming/loop'
import { ALL_SOURCES } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

let enginesOneShotDone = false

export async function GET(): Promise<Response> {
  // One-shot ingest on cold start
  if (!enginesOneShotDone) {
    enginesOneShotDone = true
    try {
      const start = Date.now()
      const mentions = await runIngestion(ALL_SOURCES)
      ingestMentions(mentions)
      updateEngineStatesFromIngest(mentions, Date.now() - start)
    } catch {
      // swallow
    }
  }

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
