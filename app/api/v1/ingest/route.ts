/**
 * POST /api/v1/ingest — acepta menciones externas (de un scraper local)
 *
 * Arquitectura híbrida:
 * - Tu PC corre Playwright/CloakBrowser → scrapea X sin JS challenge
 * - Los tweets se POSTean a este endpoint con una API key
 * - Vercel los ingesta en el store y aparecen en el dashboard
 *
 * Body: { apiKey: string, mentions: RawMention[] }
 */
import { NextRequest } from 'next/server'
import { ingestMentions, store, clusterToTrend } from '@/lib/server/core/redis-store'
import { sseBus } from '@/lib/server/streaming/bus'
import { apiOk, apiError } from '@/lib/server/api/schemas'
import type { RawMention, SourceKey } from '@/lib/types'
import { ALL_SOURCES } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const VALID_SOURCES = new Set<SourceKey>(ALL_SOURCES)

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return apiError(400, 'Invalid body', 'Expected JSON object with apiKey and mentions')
  }
  const { apiKey, mentions } = body as { apiKey?: string; mentions?: unknown }
  // API key: usa env var si está configurada, sino default (para que funcione out-of-the-box)
  const validKey = process.env.VIRAHUB_INGEST_API_KEY || 'virahub-local-2025'
  if (!apiKey || apiKey !== validKey) {
    return apiError(401, 'Unauthorized', 'Invalid or missing apiKey. Set VIRAHUB_INGEST_API_KEY env var or use "virahub-local-2025"')
  }
  if (!Array.isArray(mentions)) {
    return apiError(400, 'Invalid mentions', 'mentions must be an array')
  }
  const valid: RawMention[] = []
  for (const m of mentions) {
    if (!m || typeof m !== 'object') continue
    const r = m as Record<string, unknown>
    const source = r['source'] as SourceKey
    if (!VALID_SOURCES.has(source)) continue
    const text = String(r['text'] ?? '')
    if (!text || text.length < 5) continue
    const externalId = String(r['externalId'] ?? '')
    if (!externalId) continue
    valid.push({
      contentHash: String(r['contentHash'] ?? `${source}:${externalId}`),
      source, externalId,
      authorId: String(r['authorId'] ?? 'unknown'),
      authorHandle: String(r['authorHandle'] ?? undefined) || undefined,
      text,
      language: String(r['language'] ?? 'und'),
      publishedAt: String(r['publishedAt'] ?? new Date().toISOString()),
      url: String(r['url'] ?? undefined) || undefined,
      hasMedia: Boolean(r['hasMedia']),
      rawPayload: String(r['rawPayload'] ?? '{}'),
    })
  }
  if (valid.length === 0) {
    return apiOk({ ingested: 0, message: 'No valid mentions in payload' })
  }
  const result = await ingestMentions(valid)
  for (const clusterId of result.updatedClusters) {
    const cluster = await store.getCluster(clusterId)
    if (cluster) sseBus.publish('trend.upserted', clusterToTrend(cluster))
  }
  return apiOk({
    ingested: result.ingested,
    newClusters: result.newClusters,
    updatedClusters: result.updatedClusters.size,
    totalClusters: await store.totalClusters(),
  })
}
