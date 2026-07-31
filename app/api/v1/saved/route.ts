/**
 * GET /api/v1/saved — list saved trends (in-memory)
 */
import { apiOk } from '@/lib/server/api/schemas'
import type { SavedTrendDTO } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const saved = new Map<string, SavedTrendDTO>()

export async function GET(): Promise<Response> {
  const list = Array.from(saved.values()).sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return Date.parse(b.createdAt) - Date.parse(a.createdAt)
  })
  return apiOk(list)
}
