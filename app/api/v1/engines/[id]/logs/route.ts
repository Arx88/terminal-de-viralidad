/**
 * GET /api/v1/engines/:id/logs — recent logs for an engine
 */
import { NextRequest } from 'next/server'
import { apiOk, parseZod, EngineLogsQuerySchema, EngineIdParamsSchema } from '@/lib/server/api/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await ctx.params
  const p = parseZod(EngineIdParamsSchema, params)
  if (!p.ok) return p.response

  const sp = Object.fromEntries(req.nextUrl.searchParams)
  const q = parseZod(EngineLogsQuerySchema, sp)
  if (!q.ok) return q.response

  // In v1.x we'd return real logs from EngineLog table.
  // For now: synthesize a few info entries based on engine state.
  return apiOk([
    {
      id: 'log_' + Math.random().toString(36).slice(2, 10),
      source: p.value.id,
      level: 'info' as const,
      message: 'Engine running',
      ts: new Date().toISOString(),
    },
  ])
}
