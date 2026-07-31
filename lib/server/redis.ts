/**
 * Upstash Redis client — estado compartido entre todas las lambdas de Vercel.
 *
 * Reemplaza el store in-memory. Cada lambda lee/escribe el mismo Redis,
 * así el estado (clusters, menciones, velocity, score) sobrevive cold starts
 * y es consistente entre lambas concurrentes.
 */

import { Redis } from '@upstash/redis'

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || 'https://novel-oarfish-127561.upstash.io'
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || 'gQAAAAAAAfJJAAIgcDFkMjY1NTRlMTNlZGM0MTQ0YmYyN2I5MTUyOWI4ZWE1OQ'

let _redis: Redis | null = null
let _useMemory = false

// Fallback in-memory para cuando Redis no está configurado (dev/local)
const memoryStore = new Map<string, string>()

export function getRedis(): Redis | null {
  if (_redis) return _redis
  if (_useMemory) return null
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    _redis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN })
    return _redis
  }
  _useMemory = true
  return null
}

export function isRedisAvailable(): boolean {
  return !_useMemory && !!getRedis()
}

// ---------------------------------------------------------------------------
// Helpers que funcionan con Redis O fallback a memoria
// ---------------------------------------------------------------------------

export async function rSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  const r = getRedis()
  if (r) {
    if (ttlSeconds) await r.set(key, value, { ex: ttlSeconds })
    else await r.set(key, value)
  } else {
    memoryStore.set(key, value)
  }
}

export async function rGet(key: string): Promise<string | null> {
  const r = getRedis()
  if (r) return await r.get(key) ?? null
  return memoryStore.get(key) ?? null
}

export async function rDel(key: string): Promise<void> {
  const r = getRedis()
  if (r) await r.del(key)
  else memoryStore.delete(key)
}

export async function rHSet(key: string, fields: Record<string, string>): Promise<void> {
  const r = getRedis()
  if (r) {
    await r.hset(key, fields)
  } else {
    // Memory: store as JSON
    const existing = memoryStore.get(key)
    const obj = existing ? JSON.parse(existing) : {}
    Object.assign(obj, fields)
    memoryStore.set(key, JSON.stringify(obj))
  }
}

export async function rHGetAll(key: string): Promise<Record<string, string> | null> {
  const r = getRedis()
  if (r) {
    const result = await r.hgetall(key)
    if (!result || Object.keys(result).length === 0) return null
    // Convert all values to strings (Upstash may return non-string types)
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(result)) {
      out[k] = typeof v === 'string' ? v : String(v)
    }
    return out
  }
  const val = memoryStore.get(key)
  if (!val) return null
  try { return JSON.parse(val) } catch { return null }
}

export async function rZAdd(key: string, score: number, member: string): Promise<void> {
  const r = getRedis()
  if (r) {
    await r.zadd(key, { score, member })
  } else {
    // Memory: sorted set as JSON array
    const k = `zset:${key}`
    const val = memoryStore.get(k)
    const arr: { s: number; m: string }[] = val ? JSON.parse(val) : []
    arr.push({ s: score, m: member })
    arr.sort((a, b) => a.s - b.s)
    memoryStore.set(k, JSON.stringify(arr.slice(-1000)))
  }
}

export async function rZRangeByScore(key: string, min: number, max: number): Promise<string[]> {
  const r = getRedis()
  if (r) {
    const result = await r.zrange(key, min, max, { byScore: true })
    // @upstash/redis may return strings or objects depending on what was stored
    return (result as unknown[]).map(item => typeof item === 'string' ? item : JSON.stringify(item))
  }
  const k = `zset:${key}`
  const val = memoryStore.get(k)
  if (!val) return []
  const arr: { s: number; m: string }[] = JSON.parse(val)
  return arr.filter(x => x.s >= min && x.s <= max).map(x => x.m)
}

export async function rZCard(key: string): Promise<number> {
  const r = getRedis()
  if (r) return await r.zcard(key)
  const k = `zset:${key}`
  const val = memoryStore.get(k)
  if (!val) return 0
  return JSON.parse(val).length
}

export async function rSAdd(key: string, member: string): Promise<void> {
  const r = getRedis()
  if (r) {
    await r.sadd(key, member)
  } else {
    const k = `set:${key}`
    const val = memoryStore.get(k)
    const arr: string[] = val ? JSON.parse(val) : []
    if (!arr.includes(member)) {
      arr.push(member)
      memoryStore.set(k, JSON.stringify(arr))
    }
  }
}

export async function rSMembers(key: string): Promise<string[]> {
  const r = getRedis()
  if (r) return await r.smembers(key) as string[]
  const k = `set:${key}`
  const val = memoryStore.get(k)
  if (!val) return []
  return JSON.parse(val)
}

export async function rIncr(key: string): Promise<number> {
  const r = getRedis()
  if (r) return await r.incr(key)
  const val = parseInt(memoryStore.get(key) || '0', 10) + 1
  memoryStore.set(key, String(val))
  return val
}

export async function rLPush(key: string, value: string): Promise<void> {
  const r = getRedis()
  if (r) {
    await r.lpush(key, value)
    // Trim to last 120 entries
    await r.ltrim(key, 0, 119)
  } else {
    const k = `list:${key}`
    const val = memoryStore.get(k)
    const arr: string[] = val ? JSON.parse(val) : []
    arr.unshift(value)
    memoryStore.set(k, JSON.stringify(arr.slice(0, 120)))
  }
}

export async function rLRange(key: string, start: number, stop: number): Promise<string[]> {
  const r = getRedis()
  if (r) return await r.lrange(key, start, stop) as string[]
  const k = `list:${key}`
  const val = memoryStore.get(k)
  if (!val) return []
  const arr: string[] = JSON.parse(val)
  return arr.slice(start, stop === -1 ? undefined : stop + 1)
}

/** Distributed lock via SET NX EX. Returns unlock function or null if locked. */
export async function acquireLock(key: string, ttlSeconds: number): Promise<(() => Promise<void>) | null> {
  const lockValue = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const r = getRedis()
  if (r) {
    const result = await r.set(key, lockValue, { nx: true, ex: ttlSeconds })
    if (!result) return null
    return async () => {
      // Only delete if we still own the lock
      const current = await r.get(key)
      if (current === lockValue) await r.del(key)
    }
  }
  // Memory fallback: no real locking
  const existing = memoryStore.get(`lock:${key}`)
  if (existing) return null
  memoryStore.set(`lock:${key}`, lockValue)
  return async () => { memoryStore.delete(`lock:${key}`) }
}
