'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  useTrends,
  useEngines,
  useAlerts,
  useSavedTrends,
  useSseStats,
  useTrendDetail,
} from '@/lib/hooks/use-virahub-api'
import type {
  Trend,
  EngineStatusDTO,
  AlertRuleDTO,
  SavedTrendDTO,
  AnalysisBriefing,
} from '@/lib/types'

export type ScreenKey =
  | 'radar'
  | 'explorar'
  | 'alertas'
  | 'guardados'
  | 'motores'
  | 'informes'
  | 'ajustes'

export type RangeKey = '1H' | '6H' | '24H' | '7D'

type Ctx = {
  // Navigation
  screen: ScreenKey
  setScreen: (s: ScreenKey) => void
  range: RangeKey
  setRange: (r: RangeKey) => void
  selectedId: string
  select: (id: string) => void
  selected: Trend
  selectedBriefing: AnalysisBriefing | null

  // Trends
  trends: Trend[]

  // Live scan
  step: number
  analyzed: number
  latency: number
  clock: string
  live: boolean
  setLive: (v: boolean) => void
  connected: boolean

  // Engines — exposed as string[] of enabled source ids (backward compat with screens)
  engines: string[]
  toggleEngine: (id: string) => Promise<void>
  // Full engine status DTOs for new screens
  engineStatuses: EngineStatusDTO[]

  // Saved — exposed as string[] of clusterIds (backward compat)
  saved: string[]
  toggleSaved: (id: string) => Promise<void>
  // Full saved DTOs for new screens
  savedTrends: SavedTrendDTO[]
  pinSaved: (id: string, pinned: boolean) => Promise<void>
  removeSaved: (id: string) => Promise<void>

  // Alerts — exposed as string[] of clusterIds (backward compat)
  alerts: string[]
  toggleAlert: (id: string) => Promise<void>
  // Full alert DTOs for new screens
  alertRules: AlertRuleDTO[]
  createAlert: (input: { clusterId?: string; label: string; condition: string; threshold: string; channel?: string }) => Promise<void>
  patchAlert: (id: string, p: { armed?: boolean; cooldownSec?: number }) => Promise<void>

  // UI
  hiddenLanes: string[]
  toggleLane: (id: string) => void
  cardOpen: boolean
  setCardOpen: (v: boolean) => void
  toast: string | null
  notify: (msg: string) => void
  dismissToast: () => void
}

const VirahubContext = createContext<Ctx | null>(null)

export function useVirahub() {
  const ctx = useContext(VirahubContext)
  if (!ctx) throw new Error('useVirahub must be used inside VirahubProvider')
  return ctx
}

// Fallback empty trend (used before real data arrives)
const EMPTY_TREND: Trend = {
  id: '_empty',
  title: 'Esperando datos en vivo…',
  source: 'hn',
  color: 'var(--muted)',
  status: 'Conectando con motores',
  tone: 'muted',
  dir: 'flat',
  time: '—',
  heat: '—',
  confidence: 0,
  mentions: 0,
  delta: 0,
  shape: 'flat',
  why: 'El pipeline está arrancando. En cuanto los motores completen el primer ciclo de ingesta (≤45s) verás tendencias reales aquí.',
  evidence: [],
  inTimeline: false,
}

export function VirahubProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<ScreenKey>('radar')
  const [range, setRange] = useState<RangeKey>('6H')
  const [selectedId, setSelectedId] = useState<string>('')
  const [hiddenLanes, setHiddenLanes] = useState<string[]>([])
  const [cardOpen, setCardOpen] = useState(true)
  const [live, setLive] = useState(true)
  const [clock, setClock] = useState('--:--')
  const [toast, setToast] = useState<string | null>(null)

  // Real backend hooks
  const { trends } = useTrends()
  const { engines: engineStatuses, toggle: toggleEngineApi } = useEngines()
  const { alerts: alertRules, create: createAlertApi, patch: patchAlertApi } = useAlerts()
  const { saved: savedTrends, save: saveApi, pin: pinApi, remove: removeApi } = useSavedTrends()
  const sseStats = useSseStats()
  const { trend: selectedTrend, briefing: selectedBriefing } = useTrendDetail(
    selectedId || null,
  )

  // Auto-select first trend when trends arrive
  useEffect(() => {
    if (!selectedId && trends.length > 0 && trends[0].id !== '_empty') {
      setSelectedId(trends[0].id)
    }
  }, [trends, selectedId])

  // Clock
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setClock(
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      )
    }
    tick()
    const id = setInterval(tick, 10000)
    return () => clearInterval(id)
  }, [])

  const notify = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600)
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

  const select = useCallback((id: string) => {
    setSelectedId(id)
    setCardOpen(true)
  }, [])

  const toggleLane = useCallback((id: string) => {
    setHiddenLanes((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]))
  }, [])

  // String[] of clusterIds for backward compat with screens
  const savedIds = useMemo(() => savedTrends.map((s) => s.clusterId), [savedTrends])
  const alertIds = useMemo(
    () => alertRules.map((a) => a.clusterId ?? '').filter(Boolean),
    [alertRules],
  )
  const enabledEngineIds = useMemo(
    () => engineStatuses.filter((e) => e.enabled).map((e) => e.source),
    [engineStatuses],
  )

  const toggleSaved = useCallback(
    async (clusterId: string) => {
      const existing = savedTrends.find((s) => s.clusterId === clusterId)
      if (existing) {
        await removeApi(existing.id)
        notify('Eliminado de guardados')
      } else {
        await saveApi(clusterId)
        notify('Guardado en tu radar')
      }
    },
    [savedTrends, saveApi, removeApi, notify],
  )

  const toggleAlert = useCallback(
    async (clusterId: string) => {
      const existing = alertRules.find((a) => a.clusterId === clusterId)
      if (existing) {
        await patchAlertApi(existing.id, { armed: !existing.armed })
        notify(existing.armed ? 'Alerta desactivada' : 'Alerta reactivada')
      } else {
        const trend = trends.find((t) => t.id === clusterId)
        await createAlertApi({
          clusterId,
          label: trend ? trend.title.slice(0, 60) : `Alert for ${clusterId}`,
          condition: 'score_gt',
          threshold: '50',
          channel: 'toast',
        })
        notify('Alerta creada correctamente')
      }
    },
    [alertRules, trends, createAlertApi, patchAlertApi, notify],
  )

  const pinSaved = useCallback(
    async (id: string, pinned: boolean) => {
      await pinApi(id, pinned)
      notify(pinned ? 'Fijado arriba' : 'Desfijado')
    },
    [pinApi, notify],
  )

  const removeSaved = useCallback(
    async (id: string) => {
      await removeApi(id)
      notify('Eliminado de guardados')
    },
    [removeApi, notify],
  )

  const createAlert = useCallback(
    async (input: { clusterId?: string; label: string; condition: string; threshold: string; channel?: string }) => {
      await createAlertApi(input)
      notify('Alerta creada correctamente')
    },
    [createAlertApi, notify],
  )

  const patchAlert = useCallback(
    async (id: string, p: { armed?: boolean; cooldownSec?: number }) => {
      await patchAlertApi(id, p)
      notify('Alerta actualizada')
    },
    [patchAlertApi, notify],
  )

  const toggleEngine = useCallback(
    async (source: string) => {
      const current = engineStatuses.find((e) => e.source === source)
      const next = !(current?.enabled ?? true)
      await toggleEngineApi(source, next)
      notify(next ? 'Motor reactivado' : 'Motor pausado')
    },
    [engineStatuses, toggleEngineApi, notify],
  )

  // The "selected" trend: prefer detail-loaded, fallback to trends array, fallback to EMPTY
  const selected = useMemo<Trend>(() => {
    if (selectedTrend) return selectedTrend
    if (trends.length > 0 && trends[0].id !== '_empty') {
      return trends.find((t) => t.id === selectedId) ?? trends[0] ?? EMPTY_TREND
    }
    return EMPTY_TREND
  }, [selectedTrend, trends, selectedId])

  const value = useMemo<Ctx>(
    () => ({
      screen,
      setScreen,
      range,
      setRange,
      selectedId,
      select,
      selected,
      selectedBriefing,
      trends: trends.length > 0 ? trends : [EMPTY_TREND],
      step: sseStats.step,
      analyzed: sseStats.analyzed,
      latency: sseStats.latency,
      clock,
      live,
      setLive,
      connected: sseStats.connected,
      engines: enabledEngineIds,
      engineStatuses,
      toggleEngine,
      saved: savedIds,
      savedTrends,
      toggleSaved,
      pinSaved,
      removeSaved,
      alerts: alertIds,
      alertRules,
      toggleAlert,
      createAlert,
      patchAlert,
      hiddenLanes,
      toggleLane,
      cardOpen,
      setCardOpen,
      toast,
      notify,
      dismissToast,
    }),
    [
      screen, range, selectedId, select, selected, selectedBriefing,
      trends, sseStats.step, sseStats.analyzed, sseStats.latency, sseStats.connected,
      clock, live,
      enabledEngineIds, engineStatuses, toggleEngine,
      savedIds, savedTrends, toggleSaved, pinSaved, removeSaved,
      alertIds, alertRules, toggleAlert, createAlert, patchAlert,
      hiddenLanes, toggleLane,
      cardOpen, toast, notify, dismissToast,
    ],
  )

  return <VirahubContext.Provider value={value}>{children}</VirahubContext.Provider>
}
