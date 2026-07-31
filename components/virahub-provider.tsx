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
import { TRENDS, type RangeKey, type Trend } from '@/lib/virahub-data'

export type ScreenKey =
  | 'radar'
  | 'explorar'
  | 'alertas'
  | 'guardados'
  | 'motores'
  | 'informes'
  | 'ajustes'

type Ctx = {
  screen: ScreenKey
  setScreen: (s: ScreenKey) => void
  range: RangeKey
  setRange: (r: RangeKey) => void
  selectedId: string
  select: (id: string) => void
  selected: Trend
  trends: Trend[]
  /** increments every live refresh, drives series regeneration */
  step: number
  hiddenLanes: string[]
  toggleLane: (id: string) => void
  saved: string[]
  toggleSaved: (id: string) => void
  alerts: string[]
  toggleAlert: (id: string) => void
  cardOpen: boolean
  setCardOpen: (v: boolean) => void
  analyzed: number
  latency: number
  clock: string
  live: boolean
  setLive: (v: boolean) => void
  toast: string | null
  notify: (msg: string) => void
}

const VirahubContext = createContext<Ctx | null>(null)

export function useVirahub() {
  const ctx = useContext(VirahubContext)
  if (!ctx) throw new Error('useVirahub must be used inside VirahubProvider')
  return ctx
}

export function VirahubProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<ScreenKey>('radar')
  const [range, setRange] = useState<RangeKey>('6H')
  const [selectedId, setSelectedId] = useState('ia')
  const [step, setStep] = useState(0)
  const [hiddenLanes, setHiddenLanes] = useState<string[]>([])
  const [saved, setSaved] = useState<string[]>(['nvidia'])
  const [alerts, setAlerts] = useState<string[]>(['ia'])
  const [cardOpen, setCardOpen] = useState(true)
  const [analyzed, setAnalyzed] = useState(231421)
  const [latency, setLatency] = useState(1.2)
  const [clock, setClock] = useState('12:32')
  const [live, setLive] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  // live data heartbeat
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => setStep((s) => s + 1), 2600)
    return () => clearInterval(id)
  }, [live])

  // counters + clock (mounted only, avoids hydration drift)
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => {
      setAnalyzed((n) => n + 7 + Math.floor(Math.random() * 23))
      setLatency(() => Number((1 + Math.random() * 0.6).toFixed(1)))
    }, 1400)
    return () => clearInterval(id)
  }, [live])

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

  const select = useCallback((id: string) => {
    setSelectedId(id)
    setCardOpen(true)
  }, [])

  const toggleLane = useCallback((id: string) => {
    setHiddenLanes((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]))
  }, [])

  const toggleSaved = useCallback(
    (id: string) => {
      setSaved((s) => {
        const has = s.includes(id)
        notify(has ? 'Eliminado de guardados' : 'Guardado en tu radar')
        return has ? s.filter((x) => x !== id) : [...s, id]
      })
    },
    [notify],
  )

  const toggleAlert = useCallback(
    (id: string) => {
      setAlerts((a) => {
        const has = a.includes(id)
        notify(has ? 'Alerta desactivada' : 'Alerta creada correctamente')
        return has ? a.filter((x) => x !== id) : [...a, id]
      })
    },
    [notify],
  )

  const selected = useMemo(
    () => TRENDS.find((t) => t.id === selectedId) ?? TRENDS[0],
    [selectedId],
  )

  const value = useMemo<Ctx>(
    () => ({
      screen,
      setScreen,
      range,
      setRange,
      selectedId,
      select,
      selected,
      trends: TRENDS,
      step,
      hiddenLanes,
      toggleLane,
      saved,
      toggleSaved,
      alerts,
      toggleAlert,
      cardOpen,
      setCardOpen,
      analyzed,
      latency,
      clock,
      live,
      setLive,
      toast,
      notify,
    }),
    [
      screen,
      range,
      selectedId,
      selected,
      step,
      hiddenLanes,
      toggleLane,
      saved,
      toggleSaved,
      alerts,
      toggleAlert,
      cardOpen,
      analyzed,
      latency,
      clock,
      live,
      toast,
      notify,
      select,
    ],
  )

  return <VirahubContext.Provider value={value}>{children}</VirahubContext.Provider>
}
