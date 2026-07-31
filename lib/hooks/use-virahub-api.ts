/**
 * FASE 4 — Agent-UIAdapter
 *
 * React hooks that consume the real backend (REST + SSE) and replace
 * the setInterval+Math.random mocks in the old VirahubProvider.
 */

'use client'

import { useEffect, useRef, useState, useSyncExternalStore, useCallback } from 'react'
import type {
  Trend,
  EngineStatusDTO,
  AlertRuleDTO,
  SavedTrendDTO,
  AnalysisBriefing,
  SseEvent,
  SseEventType,
} from '@/lib/types'

// ---------------------------------------------------------------------------
// REST client
// ---------------------------------------------------------------------------
async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: 'no-store' })
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`)
  const json = (await r.json()) as { data: T }
  return json.data
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}`)
  const json = (await r.json()) as { data: T }
  return json.data
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}`)
  const json = (await r.json()) as { data: T }
  return json.data
}

async function apiDelete<T>(path: string): Promise<T> {
  const r = await fetch(path, { method: 'DELETE' })
  if (!r.ok) throw new Error(`DELETE ${path} → ${r.status}`)
  const json = (await r.json()) as { data: T }
  return json.data
}

// ---------------------------------------------------------------------------
// SSE bus singleton (client-side)
// ---------------------------------------------------------------------------
type SseListener = (event: SseEvent) => void

class SseClient {
  private es: EventSource | null = null
  private listeners = new Set<SseListener>()
  private lastEventId: string | null = null
  private reconnectTimer: number | null = null
  private reconnectDelay = 1000

  connect() {
    if (this.es) return
    try {
      const url = this.lastEventId
        ? `/api/v1/stream?lastEventId=${encodeURIComponent(this.lastEventId)}`
        : '/api/v1/stream'
      this.es = new EventSource(url)
      this.es.onopen = () => {
        this.reconnectDelay = 1000
      }
      this.es.onerror = () => {
        this.es?.close()
        this.es = null
        if (this.reconnectTimer) return
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = null
          this.reconnectDelay = Math.min(30000, this.reconnectDelay * 2)
          this.connect()
        }, this.reconnectDelay) as unknown as number
      }
      // Listen to all named events
      const handleEvent = (type: SseEventType) => (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data)
          const id = (ev as MessageEvent).lastEventId || ''
          if (id) this.lastEventId = id
          const event: SseEvent = { id, type, data, ts: new Date().toISOString() }
          for (const l of this.listeners) l(event)
        } catch {
          // ignore malformed
        }
      }
      const eventTypes: SseEventType[] = [
        'scan.tick',
        'trend.upserted',
        'trend.velocity_spike',
        'trend.phase_changed',
        'engine.status_changed',
        'engine.log_appended',
        'alert.triggered',
        'alert.acknowledged',
        'briefing.generated',
        'report.updated',
        'connection.heartbeat',
      ]
      for (const t of eventTypes) {
        this.es.addEventListener(t, handleEvent(t) as EventListener)
      }
    } catch {
      // EventSource not available
    }
  }

  disconnect() {
    if (this.es) {
      this.es.close()
      this.es = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  subscribe(listener: SseListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

const sseClient = new SseClient()

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** useTrends — fetches /api/v1/trends and updates via SSE trend.upserted events. */
export function useTrends(): {
  trends: Trend[]
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
} {
  const [trends, setTrends] = useState<Trend[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<{ trends: Trend[] }>('/api/v1/trends?limit=30')
      setTrends(data.trends)
      setError(null)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    // Subscribe to SSE for live updates
    const unsub = sseClient.subscribe((event) => {
      if (event.type === 'trend.upserted') {
        const t = event.data as Trend
        setTrends((prev) => {
          const idx = prev.findIndex((x) => x.id === t.id)
          if (idx === -1) return [t, ...prev].slice(0, 50)
          const next = [...prev]
          next[idx] = t
          return next.sort((a, b) => b.confidence - a.confidence)
        })
      }
    })
    sseClient.connect()
    return unsub
  }, [refresh])

  return { trends, loading, error, refresh }
}

/** useSseEvents — subscribe to all SSE events. */
export function useSseEvents(): SseEvent[] {
  const [events, setEvents] = useState<SseEvent[]>([])
  useEffect(() => {
    const unsub = sseClient.subscribe((event) => {
      setEvents((prev) => [event, ...prev].slice(0, 100))
    })
    sseClient.connect()
    return unsub
  }, [])
  return events
}

/** useSseStats — derived stats from scan.tick + heartbeat events. */
export function useSseStats(): {
  step: number
  analyzed: number
  latency: number
  connected: boolean
  lastTickAt: number
} {
  const [stats, setStats] = useState({
    step: 0,
    analyzed: 0,
    latency: 1.2,
    connected: false,
    lastTickAt: 0,
  })
  useEffect(() => {
    const unsub = sseClient.subscribe((event) => {
      if (event.type === 'scan.tick') {
        const d = event.data as { step: number; analyzed: number; latencyMs: number }
        setStats((s) => ({
          ...s,
          step: d.step,
          analyzed: d.analyzed,
          latency: d.latencyMs / 1000,
          connected: true,
          lastTickAt: Date.now(),
        }))
      } else if (event.type === 'connection.heartbeat') {
        setStats((s) => ({ ...s, connected: true, lastTickAt: Date.now() }))
      }
    })
    sseClient.connect()
    // Mark disconnected if no event for 30s
    const interval = setInterval(() => {
      setStats((s) => ({
        ...s,
        connected: Date.now() - s.lastTickAt < 30000,
      }))
    }, 5000)
    return () => {
      unsub()
      clearInterval(interval)
    }
  }, [])
  return stats
}

/** useEngines — fetches /api/v1/engines + listens to engine.status_changed. */
export function useEngines(): {
  engines: EngineStatusDTO[]
  loading: boolean
  toggle: (source: string, enabled: boolean) => Promise<void>
} {
  const [engines, setEngines] = useState<EngineStatusDTO[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<EngineStatusDTO[]>('/api/v1/engines')
      setEngines(data)
    } finally {
      setLoading(false)
    }
  }, [])

  const toggle = useCallback(async (source: string, enabled: boolean) => {
    await apiPost<EngineStatusDTO>(`/api/v1/engines/${source}/toggle`, { enabled })
    setEngines((prev) => prev.map((e) => (e.source === source ? { ...e, enabled } : e)))
  }, [])

  useEffect(() => {
    refresh()
    const unsub = sseClient.subscribe((event) => {
      if (event.type === 'engine.status_changed') {
        const d = event.data as Partial<EngineStatusDTO> & { source: string }
        setEngines((prev) => prev.map((e) =>
          e.source === d.source ? { ...e, ...d } as EngineStatusDTO : e,
        ))
      }
    })
    sseClient.connect()
    return unsub
  }, [refresh])

  return { engines, loading, toggle }
}

/** useTrendDetail — fetches detail + briefing for a cluster. */
export function useTrendDetail(clusterId: string | null): {
  trend: Trend | null
  briefing: AnalysisBriefing | null
  loading: boolean
} {
  const [trend, setTrend] = useState<Trend | null>(null)
  const [briefing, setBriefing] = useState<AnalysisBriefing | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!clusterId) {
      setTrend(null)
      setBriefing(null)
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all([
      apiGet<Trend>(`/api/v1/trends/${clusterId}`),
      apiGet<AnalysisBriefing>(`/api/v1/trends/${clusterId}/briefing`),
    ])
      .then(([t, b]) => {
        if (cancelled) return
        setTrend(t)
        setBriefing(b)
      })
      .catch(() => {
        if (cancelled) return
        setTrend(null)
        setBriefing(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clusterId])

  // Listen for briefing.generated for this cluster
  useEffect(() => {
    if (!clusterId) return
    const unsub = sseClient.subscribe((event) => {
      if (event.type === 'briefing.generated') {
        const b = event.data as AnalysisBriefing
        if (b.clusterId === clusterId) setBriefing(b)
      }
    })
    return unsub
  }, [clusterId])

  return { trend, briefing, loading }
}

/** useAlerts — fetches + creates + patches alerts. */
export function useAlerts(): {
  alerts: AlertRuleDTO[]
  loading: boolean
  create: (input: { clusterId?: string; label: string; condition: string; threshold: string; channel?: string }) => Promise<void>
  patch: (id: string, patch: { armed?: boolean; cooldownSec?: number }) => Promise<void>
} {
  const [alerts, setAlerts] = useState<AlertRuleDTO[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<AlertRuleDTO[]>('/api/v1/alerts')
      setAlerts(data)
    } finally {
      setLoading(false)
    }
  }, [])

  const create = useCallback(async (input: { clusterId?: string; label: string; condition: string; threshold: string; channel?: string }) => {
    const created = await apiPost<AlertRuleDTO>('/api/v1/alerts', input)
    setAlerts((prev) => [created, ...prev])
  }, [])

  const patch = useCallback(async (id: string, p: { armed?: boolean; cooldownSec?: number }) => {
    const updated = await apiPatch<AlertRuleDTO>(`/api/v1/alerts/${id}`, p)
    setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { alerts, loading, create, patch }
}

/** useSavedTrends — fetches + saves + pins + deletes. */
export function useSavedTrends(): {
  saved: SavedTrendDTO[]
  loading: boolean
  save: (clusterId: string, input?: { folder?: string; notes?: string }) => Promise<void>
  pin: (id: string, pinned: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
} {
  const [saved, setSaved] = useState<SavedTrendDTO[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<SavedTrendDTO[]>('/api/v1/saved')
      setSaved(data)
    } finally {
      setLoading(false)
    }
  }, [])

  const save = useCallback(async (clusterId: string, input?: { folder?: string; notes?: string }) => {
    const created = await apiPost<SavedTrendDTO>(`/api/v1/saved/${clusterId}`, input ?? {})
    setSaved((prev) => [created, ...prev])
  }, [])

  const pin = useCallback(async (id: string, pinned: boolean) => {
    const updated = await apiPost<SavedTrendDTO>(`/api/v1/saved/${id}/pin`, { pinned })
    setSaved((prev) => prev.map((s) => (s.id === id ? updated : s)))
  }, [])

  const remove = useCallback(async (id: string) => {
    await apiDelete<{ id: string }>(`/api/v1/saved/${id}`)
    setSaved((prev) => prev.filter((s) => s.id !== id))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { saved, loading, save, pin, remove }
}
