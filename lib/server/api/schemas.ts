/**
 * RFC 7807 error helper + Zod schemas shared across API routes.
 */
import { z } from 'zod'
import { NextResponse } from 'next/server'

export const SourceKeySchema = z.enum(['reddit', 'bluesky', 'hn', 'rss', 'gdelt', 'github', 'x'])
export const PhaseSchema = z.enum(['forming', 'rising', 'peaked', 'decaying'])
export const ShapeSchema = z.enum(['accel', 'rise', 'flat', 'decay', 'wobble'])
export const RangeKeySchema = z.enum(['1H', '6H', '24H', '7D'])

export const ListTrendsQuerySchema = z.object({
  source: SourceKeySchema.optional(),
  phase: PhaseSchema.optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  q: z.string().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})

export const TrendIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const TrendDetailQuerySchema = z.object({
  range: RangeKeySchema.default('6H'),
})

export const BriefingQuerySchema = z.object({
  range: RangeKeySchema.default('6H'),
  force: z.coerce.boolean().default(false),
})

export const EngineIdParamsSchema = z.object({
  id: SourceKeySchema,
})

export const ToggleEngineBodySchema = z.object({
  enabled: z.boolean(),
})

export const EngineLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  level: z.enum(['info', 'warn', 'error']).optional(),
})

export const CreateAlertBodySchema = z.object({
  clusterId: z.string().optional(),
  label: z.string().min(3).max(80),
  condition: z.enum(['score_gt', 'velocity_gt', 'mentions_gt', 'phase_is', 'delta_pct_gt']),
  threshold: z.string(),
  channel: z.enum(['toast', 'email', 'webhook']).default('toast'),
})

export const PatchAlertBodySchema = z.object({
  armed: z.boolean().optional(),
  cooldownSec: z.number().int().min(0).max(86400).optional(),
})

export const SaveTrendBodySchema = z.object({
  folder: z.string().max(60).optional(),
  notes: z.string().max(2000).optional(),
})

export const PinSavedBodySchema = z.object({
  pinned: z.boolean(),
})

export function apiError(status: number, title: string, detail: string, issues?: Array<{ path: string; message: string }>): NextResponse {
  return NextResponse.json(
    {
      error: {
        type: 'https://virahub.local/errors/' + title.toLowerCase().replace(/\s+/g, '-'),
        title,
        status,
        detail,
        instance: '',
        traceId: Math.random().toString(36).slice(2, 12),
        issues,
      },
    },
    { status },
  )
}

export function apiOk<T>(data: T, meta?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ data, ...(meta ? { meta } : {}) })
}

export function parseZod<T>(schema: z.ZodSchema<T>, value: unknown): { ok: true; value: T } | { ok: false; response: NextResponse } {
  const r = schema.safeParse(value)
  if (r.success) return { ok: true, value: r.data }
  return {
    ok: false,
    response: apiError(400, 'Invalid input', 'Validation failed', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))),
  }
}
