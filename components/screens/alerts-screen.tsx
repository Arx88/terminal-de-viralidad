'use client'

import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  Bell,
  BellOff,
  BellPlus,
  BellRing,
  Check,
  CircleDot,
  Clock,
  Filter,
  Flame,
  Hash,
  Mail,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { CountUp } from '@/components/count-up'
import { MiniSpark, ScreenShell, Toggle } from '@/components/screens/screen-shell'
import { SourceTile } from '@/components/source-icon'
import { useVirahub } from '@/components/virahub-provider'
import { TRENDS, type Trend } from '@/lib/virahub-data'
import { cn } from '@/lib/utils'

type ConditionKey =
  | 'mentions'
  | 'velocity'
  | 'phase'
  | 'source_count'
  | 'sentiment'

type Channel = 'email' | 'push' | 'slack'

type AlertRule = {
  id: string
  trendId: string
  condition: ConditionKey
  threshold: number
  channels: Channel[]
  active: boolean
  lastTriggered: string | null
  triggeredCount: number
  createdAt: string
}

type TriggeredEvent = {
  id: string
  time: string
  ruleId: string
  trendId: string
  title: string
  tone: Trend['tone']
  detail: string
  ack: boolean
}

const CONDITIONS: {
  key: ConditionKey
  label: string
  description: string
  Icon: typeof Activity
  unit: string
  defaultThreshold: number
  min: number
  max: number
  step: number
}[] = [
  {
    key: 'mentions',
    label: 'Umbral de menciones',
    description: 'Dispara cuando las menciones/hora superan el valor.',
    Icon: Hash,
    unit: 'menc/h',
    defaultThreshold: 50,
    min: 5,
    max: 500,
    step: 5,
  },
  {
    key: 'velocity',
    label: 'Pico de aceleración',
    description: 'Dispara cuando la velocidad crece más de X% en 1h.',
    Icon: Zap,
    unit: '%',
    defaultThreshold: 100,
    min: 10,
    max: 500,
    step: 10,
  },
  {
    key: 'phase',
    label: 'Cambio de fase',
    description: 'Dispara cuando el trend cambia de fase (emergente → caliente).',
    Icon: Sparkles,
    unit: 'fase',
    defaultThreshold: 1,
    min: 1,
    max: 4,
    step: 1,
  },
  {
    key: 'source_count',
    label: 'Múltiples fuentes',
    description: 'Dispara cuando el tema aparece en N fuentes distintas.',
    Icon: Filter,
    unit: 'fuentes',
    defaultThreshold: 3,
    min: 2,
    max: 6,
    step: 1,
  },
  {
    key: 'sentiment',
    label: 'Cambio de sentimiento',
    description: 'Dispara cuando el sentimiento cambia más de X puntos.',
    Icon: TrendingUp,
    unit: 'pts',
    defaultThreshold: 20,
    min: 5,
    max: 100,
    step: 5,
  },
]

const CHANNELS: { key: Channel; label: string; Icon: typeof Mail }[] = [
  { key: 'email', label: 'Email', Icon: Mail },
  { key: 'push', label: 'Push', Icon: BellRing },
  { key: 'slack', label: 'Slack', Icon: Hash },
]

const TONE_STYLES: Record<Trend['tone'], string> = {
  hot: 'border-[var(--hot)]/40 bg-[var(--hot)]/12 text-[var(--hot)]',
  cool: 'border-[var(--cool)]/40 bg-[var(--cool)]/12 text-[var(--cool)]',
  mint: 'border-[var(--mint)]/40 bg-[var(--mint)]/12 text-[var(--mint)]',
  muted: 'border-border bg-white/[0.04] text-muted-foreground',
}

const INITIAL_RULES: AlertRule[] = [
  {
    id: 'r1',
    trendId: 'ia',
    condition: 'velocity',
    threshold: 100,
    channels: ['push', 'slack'],
    active: true,
    lastTriggered: '12:32',
    triggeredCount: 3,
    createdAt: 'hace 4 días',
  },
  {
    id: 'r2',
    trendId: 'nvidia',
    condition: 'mentions',
    threshold: 25,
    channels: ['email', 'push'],
    active: true,
    lastTriggered: '11:58',
    triggeredCount: 1,
    createdAt: 'hace 2 días',
  },
  {
    id: 'r3',
    trendId: 'bluesky',
    condition: 'phase',
    threshold: 1,
    channels: ['slack'],
    active: false,
    lastTriggered: null,
    triggeredCount: 0,
    createdAt: 'hace 6 días',
  },
]

const TRIGGERED: TriggeredEvent[] = [
  {
    id: 'e1',
    time: '12:32',
    ruleId: 'r1',
    trendId: 'ia',
    title: 'Regulación de IA en la UE superó 82 menciones/hora',
    tone: 'hot',
    detail: 'Velocidad +312% en 1h · 4 fuentes detectadas',
    ack: false,
  },
  {
    id: 'e2',
    time: '11:58',
    ruleId: 'r2',
    trendId: 'nvidia',
    title: 'Nuevo chip de Nvidia cruzó umbral de menciones',
    tone: 'mint',
    detail: '29 menciones/hora · 18 réplicas en foros asiáticos',
    ack: false,
  },
  {
    id: 'e3',
    time: '11:12',
    ruleId: 'r1',
    trendId: 'ia',
    title: 'Anomalía: pico de bots en r/technology',
    tone: 'hot',
    detail: '41 cuentas sospechosas · sentimiento −0.4',
    ack: true,
  },
  {
    id: 'e4',
    time: '10:24',
    ruleId: 'r3',
    trendId: 'bluesky',
    title: 'Nueva API de Bluesky entró en fase caliente',
    tone: 'cool',
    detail: 'Cambio de fase · 9 repos citando el changelog',
    ack: true,
  },
  {
    id: 'e5',
    time: '09:47',
    ruleId: 'r2',
    trendId: 'nvidia',
    title: 'Nuevo chip de Nvidia superó sentimiento +20pts',
    tone: 'mint',
    detail: 'Sentimiento +0.34 → +0.61 · 5 fuentes',
    ack: true,
  },
]

type TabKey = 'rules' | 'create' | 'history' | 'feed'

const TABS: { key: TabKey; label: string; Icon: typeof Bell }[] = [
  { key: 'rules', label: 'Reglas activas', Icon: Bell },
  { key: 'create', label: 'Crear regla', Icon: BellPlus },
  { key: 'history', label: 'Historial', Icon: Clock },
  { key: 'feed', label: 'Notificaciones', Icon: BellRing },
]

export function AlertsScreen() {
  const { trends, alerts, toggleAlert, live, step, select, setScreen } = useVirahub()
  const [tab, setTab] = useState<TabKey>('rules')
  const [rules, setRules] = useState<AlertRule[]>(INITIAL_RULES)
  const [events, setEvents] = useState<TriggeredEvent[]>(TRIGGERED)
  const [query, setQuery] = useState('')

  const stats = useMemo(() => {
    const active = rules.filter((r) => r.active).length
    const triggeredToday = events.length
    const unack = events.filter((e) => !e.ack).length
    const totalTriggers = rules.reduce((sum, r) => sum + r.triggeredCount, 0)
    return { active, triggeredToday, unack, totalTriggers }
  }, [rules, events])

  const filteredEvents = useMemo(
    () => events.filter((e) => e.title.toLowerCase().includes(query.toLowerCase())),
    [events, query],
  )

  function toggleRuleActive(id: string) {
    setRules((arr) =>
      arr.map((r) => (r.id === id ? { ...r, active: !r.active } : r)),
    )
  }

  function deleteRule(id: string) {
    setRules((arr) => arr.filter((r) => r.id !== id))
  }

  function ackEvent(id: string) {
    setEvents((arr) => arr.map((e) => (e.id === id ? { ...e, ack: true } : e)))
  }

  function ackAll() {
    setEvents((arr) => arr.map((e) => ({ ...e, ack: true })))
  }

  function addRule(rule: AlertRule) {
    setRules((arr) => [rule, ...arr])
  }

  return (
    <ScreenShell
      eyebrow="Alertas"
      title="Centro de monitoreo y notificaciones"
      description="Define reglas precisas por tendencia, condición y canal. Recibe el aviso en el momento exacto en que la señal cruza tu umbral."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3 py-2 text-[12.5px] font-medium',
              stats.unack > 0
                ? 'border-[var(--hot)]/40 bg-[var(--hot)]/10 text-[var(--hot)]'
                : 'border-border bg-white/[0.03] text-muted-foreground',
            )}
          >
            <BellRing
              className={cn('size-3.5', stats.unack > 0 && live)}
              strokeWidth={2}
              style={stats.unack > 0 && live ? { animation: 'vh-pulse 1.6s ease-in-out infinite' } : undefined}
            />
            {stats.unack} sin revisar
          </span>
          <span className="flex items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-[12.5px] text-muted-foreground">
            <Activity className="size-3.5 text-[var(--mint)]" strokeWidth={2} />
            {stats.active} reglas activas
          </span>
        </div>
      }
    >
      {/* TOP STATS */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Reglas activas', value: stats.active, Icon: Bell, color: 'text-primary' },
          { label: 'Disparos hoy', value: stats.triggeredToday, Icon: Zap, color: 'text-[var(--hot)]' },
          { label: 'Sin revisar', value: stats.unack, Icon: BellRing, color: 'text-[var(--cool)]' },
          { label: 'Total histórico', value: stats.totalTriggers, Icon: TrendingUp, color: 'text-[var(--mint)]' },
        ].map(({ label, value, Icon, color }) => (
          <li
            key={label}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
          >
            <span className={cn('flex size-9 items-center justify-center rounded-lg bg-white/[0.04]', color)}>
              <Icon className="size-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <CountUp
                value={value}
                className="block text-xl font-bold tabular-nums"
              />
              <span className="block text-[11.5px] text-muted-foreground">{label}</span>
            </div>
          </li>
        ))}
      </ul>

      {/* TABS */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'relative flex cursor-pointer items-center gap-2 px-3 py-2.5 text-[13.5px] font-medium transition-colors',
              tab === key ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" strokeWidth={2} />
            {label}
            {key === 'history' && events.length > 0 && (
              <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                {events.length}
              </span>
            )}
            {tab === key && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* PANELS */}
      {tab === 'rules' && (
        <RulesPanel
          rules={rules}
          trends={trends}
          alertsActive={alerts}
          onToggleActive={toggleRuleActive}
          onDelete={deleteRule}
          onToggleTrendAlert={toggleAlert}
          step={step}
          onEdit={() => setTab('create')}
        />
      )}
      {tab === 'create' && (
        <CreateRulePanel
          trends={trends}
          onCreate={(rule) => {
            addRule(rule)
            setTab('rules')
          }}
        />
      )}
      {tab === 'history' && (
        <HistoryPanel
          events={filteredEvents}
          trends={trends}
          query={query}
          setQuery={setQuery}
          onAck={ackEvent}
          onAckAll={ackAll}
          onSelectTrend={(id) => {
            select(id)
            setScreen('explorar')
          }}
        />
      )}
      {tab === 'feed' && <FeedPanel events={events} trends={trends} onAck={ackEvent} />}
    </ScreenShell>
  )
}

/* ═══════ PANEL: RULES ═══════ */
function RulesPanel({
  rules,
  trends,
  alertsActive,
  onToggleActive,
  onDelete,
  onToggleTrendAlert,
  step,
  onEdit,
}: {
  rules: AlertRule[]
  trends: Trend[]
  alertsActive: string[]
  onToggleActive: (id: string) => void
  onDelete: (id: string) => void
  onToggleTrendAlert: (id: string) => void
  step: number
  onEdit: () => void
}) {
  if (rules.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-16 text-center">
        <BellOff className="mx-auto size-6 text-muted-foreground" strokeWidth={1.8} />
        <p className="mt-3 text-[14px] font-medium">No tienes reglas todavía</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Crea tu primera regla para recibir alertas automáticas.
        </p>
        <button
          type="button"
          onClick={onEdit}
          className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" strokeWidth={2.2} /> Crear regla
        </button>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {rules.map((rule) => {
        const trend = trends.find((t) => t.id === rule.trendId)
        const cond = CONDITIONS.find((c) => c.key === rule.condition)
        if (!trend || !cond) return null
        const trendAlertOn = alertsActive.includes(trend.id)
        return (
          <li
            key={rule.id}
            className={cn(
              'group rounded-2xl border bg-card p-4 transition-all duration-300',
              rule.active
                ? 'border-border hover:border-primary/40'
                : 'border-border/60 opacity-70',
            )}
          >
            <div className="flex flex-wrap items-center gap-4">
              <SourceTile source={trend.source} className="size-10" />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[14.5px] font-semibold">{trend.title}</h3>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <cond.Icon className="size-3.5 text-primary" strokeWidth={2} />
                    {cond.label}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CircleDot className="size-3" strokeWidth={2} />
                    umbral <b className="font-semibold text-foreground tabular-nums">{rule.threshold}</b> {cond.unit}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-3" strokeWidth={2} />
                    {rule.lastTriggered ? `último disparo ${rule.lastTriggered}` : 'sin disparos'}
                  </span>
                  <span className="rounded-md border border-border bg-white/[0.03] px-1.5 py-0.5 text-[10.5px] tabular-nums">
                    {rule.triggeredCount} disparos
                  </span>
                </p>
              </div>
              <MiniSpark trend={trend} step={step} className="hidden h-9 w-28 sm:block" />
              <div className="flex items-center gap-1.5">
                {rule.channels.map((ch) => {
                  const cfg = CHANNELS.find((c) => c.key === ch)
                  if (!cfg) return null
                  return (
                    <span
                      key={ch}
                      className="flex size-7 items-center justify-center rounded-lg border border-border bg-white/[0.03] text-muted-foreground"
                      title={cfg.label}
                    >
                      <cfg.Icon className="size-3.5" strokeWidth={2} />
                    </span>
                  )
                })}
              </div>
              <Toggle
                on={rule.active}
                onChange={() => onToggleActive(rule.id)}
                label={`Activar regla ${trend.title}`}
              />
              <button
                type="button"
                onClick={() => onDelete(rule.id)}
                className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label="Eliminar regla"
              >
                <Trash2 className="size-4" strokeWidth={1.9} />
              </button>
            </div>
            {!trendAlertOn && rule.active && (
              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-[12px] text-[var(--hot)]">
                <BellOff className="size-3.5" strokeWidth={2} />
                La tendencia no tiene alerta rápida activa en el panel de análisis.
                <button
                  type="button"
                  onClick={() => onToggleTrendAlert(trend.id)}
                  className="cursor-pointer rounded-md border border-[var(--hot)]/40 px-2 py-0.5 text-[11px] font-semibold text-[var(--hot)] transition-colors hover:bg-[var(--hot)]/10"
                >
                  Activar
                </button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/* ═══════ PANEL: CREATE RULE ═══════ */
function CreateRulePanel({
  trends,
  onCreate,
}: {
  trends: Trend[]
  onCreate: (rule: AlertRule) => void
}) {
  const [trendId, setTrendId] = useState(trends[0]?.id ?? '')
  const [condition, setCondition] = useState<ConditionKey>('velocity')
  const [threshold, setThreshold] = useState(100)
  const [channels, setChannels] = useState<Channel[]>(['push'])

  const cond = CONDITIONS.find((c) => c.key === condition)!

  function toggleChannel(ch: Channel) {
    setChannels((arr) =>
      arr.includes(ch) ? arr.filter((x) => x !== ch) : [...arr, ch],
    )
  }

  function handleCreate() {
    if (!trendId || channels.length === 0) return
    const rule: AlertRule = {
      id: `r${Date.now()}`,
      trendId,
      condition,
      threshold,
      channels,
      active: true,
      lastTriggered: null,
      triggeredCount: 0,
      createdAt: 'ahora',
    }
    onCreate(rule)
  }

  const selectedTrend = trends.find((t) => t.id === trendId)

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <BellPlus className="size-4 text-primary" strokeWidth={2} />
          Configuración de la regla
        </h2>

        {/* Step 1: trend */}
        <Field label="1 · Tendencia a vigilar" hint="Selecciona el tema que quieres monitorear.">
          <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto scrollbar-thin sm:grid-cols-2">
            {trends.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTrendId(t.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-all',
                  trendId === t.id
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-border hover:border-primary/30 hover:bg-white/[0.03]',
                )}
              >
                <SourceTile source={t.source} className="size-7" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium">{t.title}</span>
                  <span className="block text-[11px] text-muted-foreground">{t.mentions} menc/h</span>
                </span>
                {trendId === t.id && <Check className="size-3.5 text-primary" strokeWidth={2.4} />}
              </button>
            ))}
          </div>
        </Field>

        {/* Step 2: condition */}
        <Field
          label="2 · Condición"
          hint="Elige qué tipo de cambio dispara la alerta."
          className="mt-5"
        >
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {CONDITIONS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setCondition(c.key)
                  setThreshold(c.defaultThreshold)
                }}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all',
                  condition === c.key
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-border hover:border-primary/30 hover:bg-white/[0.03]',
                )}
              >
                <c.Icon
                  className={cn('mt-0.5 size-4', condition === c.key ? 'text-primary' : 'text-muted-foreground')}
                  strokeWidth={2}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold">{c.label}</span>
                  <span className="block text-[11.5px] leading-snug text-muted-foreground">{c.description}</span>
                </span>
              </button>
            ))}
          </div>
        </Field>

        {/* Step 3: threshold */}
        <Field
          label={`3 · Umbral (${cond.unit})`}
          hint={cond.description}
          className="mt-5"
        >
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={cond.min}
              max={cond.max}
              step={cond.step}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/[0.08] accent-primary"
              aria-label={`Umbral ${cond.label}`}
            />
            <span className="flex w-20 items-center justify-end gap-1 rounded-lg border border-border bg-white/[0.03] px-2.5 py-1.5 text-[13px] font-semibold tabular-nums">
              {threshold}
              <span className="text-[10.5px] font-normal text-muted-foreground">{cond.unit}</span>
            </span>
          </div>
          <div className="mt-1.5 flex justify-between text-[10.5px] text-muted-foreground">
            <span>{cond.min}</span>
            <span>{cond.max}</span>
          </div>
        </Field>

        {/* Step 4: channels */}
        <Field
          label="4 · Canales de notificación"
          hint="Recibe el aviso por los canales que elijas."
          className="mt-5"
        >
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map(({ key, label, Icon }) => {
              const on = channels.includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleChannel(key)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-all',
                    on
                      ? 'border-primary/50 bg-primary/12 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" strokeWidth={2} />
                  {label}
                  {on && <Check className="size-3" strokeWidth={2.4} />}
                </button>
              )
            })}
          </div>
        </Field>

        <div className="mt-6 flex items-center gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={handleCreate}
            disabled={!trendId || channels.length === 0}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-all hover:shadow-[0_0_20px_-4px_var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-4" strokeWidth={2.2} /> Crear regla
          </button>
          <p className="text-[11.5px] text-muted-foreground">
            Se activará inmediatamente y comenzará a vigilar.
          </p>
        </div>
      </div>

      {/* PREVIEW */}
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/8 to-transparent p-5">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">
          Vista previa
        </p>
        {selectedTrend && (
          <>
            <div className="mt-3 flex items-center gap-2.5">
              <SourceTile source={selectedTrend.source} className="size-9" />
              <div className="min-w-0">
                <h3 className="truncate text-[14px] font-semibold">{selectedTrend.title}</h3>
                <p className="text-[11.5px] text-muted-foreground">{selectedTrend.status}</p>
              </div>
            </div>
            <MiniSpark trend={selectedTrend} step={0} className="mt-3 h-12 w-full" />
            <dl className="mt-4 space-y-2 text-[12.5px]">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <dt className="text-muted-foreground">Condición</dt>
                <dd className="font-medium">{cond.label}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-2">
                <dt className="text-muted-foreground">Umbral</dt>
                <dd className="font-semibold tabular-nums">
                  {threshold} <span className="text-muted-foreground">{cond.unit}</span>
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-2">
                <dt className="text-muted-foreground">Canales</dt>
                <dd className="flex items-center gap-1">
                  {channels.length === 0 ? (
                    <span className="text-[var(--hot)]">Ninguno</span>
                  ) : (
                    channels.map((ch) => {
                      const cfg = CHANNELS.find((c) => c.key === ch)!
                      return (
                        <span
                          key={ch}
                          className="flex size-6 items-center justify-center rounded-md border border-border bg-white/[0.04]"
                          title={cfg.label}
                        >
                          <cfg.Icon className="size-3" strokeWidth={2} />
                        </span>
                      )
                    })
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Estado</dt>
                <dd className="flex items-center gap-1.5 font-medium text-[var(--mint)]">
                  <span className="size-1.5 rounded-full bg-[var(--mint)]" style={{ animation: 'vh-pulse 1.6s ease-in-out infinite' }} />
                  Lista para activar
                </dd>
              </div>
            </dl>
          </>
        )}
      </div>
    </div>
  )
}

/* ═══════ PANEL: HISTORY ═══════ */
function HistoryPanel({
  events,
  trends,
  query,
  setQuery,
  onAck,
  onAckAll,
  onSelectTrend,
}: {
  events: TriggeredEvent[]
  trends: Trend[]
  query: string
  setQuery: (q: string) => void
  onAck: (id: string) => void
  onAckAll: () => void
  onSelectTrend: (id: string) => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2">
          <Search className="size-4 text-muted-foreground" strokeWidth={1.9} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en el historial…"
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
          />
        </div>
        <button
          type="button"
          onClick={onAckAll}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-[12.5px] font-medium transition-colors hover:bg-white/[0.06]"
        >
          <Check className="size-3.5" strokeWidth={2} />
          Marcar todo como revisado
        </button>
      </div>

      {events.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border py-10 text-center text-[13px] text-muted-foreground">
          No hay disparos que coincidan con "{query}".
        </p>
      ) : (
        <ul className="mt-4 flex flex-col">
          {events.map((e, i) => {
            const trend = trends.find((t) => t.id === e.trendId)
            return (
              <li
                key={e.id}
                className="relative flex gap-3 pb-5 pl-1 last:pb-0"
              >
                {i < events.length - 1 && (
                  <span className="absolute top-7 bottom-0 left-[13px] w-px bg-border" />
                )}
                <span
                  className={cn(
                    'z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border',
                    TONE_STYLES[e.tone],
                  )}
                >
                  {e.tone === 'hot' ? (
                    <Flame className="size-3" strokeWidth={2.2} />
                  ) : (
                    <TrendingUp className="size-3" strokeWidth={2.2} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] leading-snug text-pretty">{e.title}</p>
                      <p className="mt-1 text-[12px] text-muted-foreground">{e.detail}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {trend && (
                          <button
                            type="button"
                            onClick={() => onSelectTrend(trend.id)}
                            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-white/[0.03] px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <ArrowUpRight className="size-3" strokeWidth={2} />
                            Ver tendencia
                          </button>
                        )}
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {e.time}
                        </span>
                      </div>
                    </div>
                    {!e.ack && (
                      <button
                        type="button"
                        onClick={() => onAck(e.id)}
                        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-white/[0.03] px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <Check className="size-3" strokeWidth={2} /> Revisado
                      </button>
                    )}
                    {e.ack && (
                      <span className="flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--mint)]/30 bg-[var(--mint)]/8 px-2 py-1 text-[11px] font-medium text-[var(--mint)]">
                        <Check className="size-3" strokeWidth={2} /> Visto
                      </span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/* ═══════ PANEL: FEED ═══════ */
function FeedPanel({
  events,
  trends,
  onAck,
}: {
  events: TriggeredEvent[]
  trends: Trend[]
  onAck: (id: string) => void
}) {
  const unack = events.filter((e) => !e.ack)
  const acked = events.filter((e) => e.ack)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          <BellRing className="size-3.5 text-[var(--hot)]" strokeWidth={2} />
          Bandeja de entrada
          {unack.length > 0 && (
            <span className="rounded-full bg-[var(--hot)]/15 px-2 py-0.5 text-[10.5px] font-bold text-[var(--hot)] tabular-nums">
              {unack.length}
            </span>
          )}
        </h2>
        {unack.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border py-10 text-center text-[13px] text-muted-foreground">
            <Check className="mx-auto size-5 text-[var(--mint)]" strokeWidth={2} />
            Estás al día. Sin notificaciones pendientes.
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {unack.map((e) => {
              const trend = trends.find((t) => t.id === e.trendId)
              return (
                <li
                  key={e.id}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.04]',
                    TONE_STYLES[e.tone],
                  )}
                >
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-current">
                    {e.tone === 'hot' ? (
                      <Flame className="size-3" strokeWidth={2.2} />
                    ) : (
                      <TrendingUp className="size-3" strokeWidth={2.2} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-pretty text-foreground">{e.title}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">{e.detail}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground tabular-nums">{e.time}</span>
                      {trend && (
                        <span className="text-[11px] text-muted-foreground">· {trend.title}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAck(e.id)}
                    className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border bg-white/[0.04] px-2 py-1 text-[10.5px] font-medium transition-colors hover:text-foreground"
                  >
                    <Check className="size-3" strokeWidth={2} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          <Check className="size-3.5 text-[var(--mint)]" strokeWidth={2} />
          Revisadas
        </h2>
        {acked.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-border py-10 text-center text-[13px] text-muted-foreground">
            Aún no has revisado ninguna alerta.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-1">
            {acked.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2 opacity-70 transition-opacity hover:opacity-100"
              >
                <span className={cn('flex size-6 items-center justify-center rounded-full border', TONE_STYLES[e.tone])}>
                  {e.tone === 'hot' ? <Flame className="size-3" strokeWidth={2.2} /> : <TrendingUp className="size-3" strokeWidth={2.2} />}
                </span>
                <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">{e.title}</p>
                <span className="text-[11px] text-muted-foreground tabular-nums">{e.time}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ═══════ HELPERS ═══════ */
function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between">
        <label className="text-[12px] font-semibold tracking-wide text-foreground">{label}</label>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
