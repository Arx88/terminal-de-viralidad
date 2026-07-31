'use client'

import { useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  ChevronDown,
  Clock,
  Database,
  Gauge,
  Layers,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Settings2,
  Terminal,
  Trash2,
  Zap,
} from 'lucide-react'
import { CountUp } from '@/components/count-up'
import { ScreenShell, Toggle } from '@/components/screens/screen-shell'
import { SourceTile } from '@/components/source-icon'
import { useVirahub } from '@/components/virahub-provider'
import { ENGINES, type SourceKey } from '@/lib/virahub-data'
import { cn } from '@/lib/utils'

type EngineMeta = {
  id: SourceKey
  description: string
  defaultInterval: number
  intervalOptions: number[]
  queryLabel: string
  queryPlaceholder: string
  defaultQueries: string[]
  rateLimit: string
  auth: 'OAuth' | 'API Key' | 'Anónimo' | 'Webhook'
}

const ENGINE_META: EngineMeta[] = [
  {
    id: 'reddit',
    description: 'Subreddits y conversaciones públicas de Reddit.',
    defaultInterval: 5,
    intervalOptions: [2, 5, 10, 15, 30],
    queryLabel: 'Subreddits',
    queryPlaceholder: 'r/technology, r/spain, r/MachineLearning',
    defaultQueries: ['r/technology', 'r/artificial', 'r/spain'],
    rateLimit: '60 req/min',
    auth: 'OAuth',
  },
  {
    id: 'bluesky',
    description: 'Firehose de Bluesky con filtros por idioma y tema.',
    defaultInterval: 3,
    intervalOptions: [1, 3, 5, 10, 15],
    queryLabel: 'Términos de búsqueda',
    queryPlaceholder: 'IA regulación, API, dev',
    defaultQueries: ['IA regulación', 'API Bluesky', 'policy'],
    rateLimit: '5000 evt/min',
    auth: 'OAuth',
  },
  {
    id: 'x',
    description: 'Timeline pública y conversaciones de X (Twitter).',
    defaultInterval: 4,
    intervalOptions: [1, 3, 5, 10, 15],
    queryLabel: 'Términos y hashtags',
    queryPlaceholder: '#IA, #regulación, OpenAI',
    defaultQueries: ['#IA', '#regulación', 'OpenAI'],
    rateLimit: '450 req/15min',
    auth: 'OAuth',
  },
  {
    id: 'hn',
    description: 'Front page y comentarios de Hacker News.',
    defaultInterval: 10,
    intervalOptions: [5, 10, 15, 30, 60],
    queryLabel: 'Keywords',
    queryPlaceholder: 'AI, OpenAI, regulation',
    defaultQueries: ['AI', 'startup', 'regulation'],
    rateLimit: 'Sin límite',
    auth: 'Anónimo',
  },
  {
    id: 'rss',
    description: 'Agregador de feeds RSS/Atom con deduplicación.',
    defaultInterval: 15,
    intervalOptions: [5, 15, 30, 60, 120],
    queryLabel: 'URLs de feeds',
    queryPlaceholder: 'https://blog.example.com/rss',
    defaultQueries: ['techcrunch.com/rss', 'theverge.com/rss/index.xml'],
    rateLimit: '100 feeds',
    auth: 'Anónimo',
  },
  {
    id: 'gdelt',
    description: 'GDELT 2.0 — eventos globales y monitoreo de medios.',
    defaultInterval: 30,
    intervalOptions: [15, 30, 60, 180],
    queryLabel: 'Consultas GDELT',
    queryPlaceholder: 'theme:ENV_GENERAL, sourcecountry:ESP',
    defaultQueries: ['theme:TECH', 'sourcecountry:ESP'],
    rateLimit: '300 req/día',
    auth: 'API Key',
  },
  {
    id: 'github',
    description: 'Repositorios y changelogs públicos de GitHub.',
    defaultInterval: 20,
    intervalOptions: [10, 20, 60, 180],
    queryLabel: 'Repos a vigilar',
    queryPlaceholder: 'owner/repo, bluesky-social/atproto',
    defaultQueries: ['bluesky-social/atproto', 'openai/openai-cookbook'],
    rateLimit: '5000 req/h',
    auth: 'API Key',
  },
]

type LogEntry = {
  id: string
  engine: SourceKey
  ts: string
  level: 'info' | 'warn' | 'error'
  message: string
}

const INITIAL_LOGS: LogEntry[] = [
  { id: 'l1', engine: 'reddit', ts: '12:32:14', level: 'info', message: 'Lote 1.4k posts procesado en 1.2s' },
  { id: 'l2', engine: 'bluesky', ts: '12:32:11', level: 'info', message: 'Firehose activa · 432 evt/min' },
  { id: 'l3', engine: 'x', ts: '12:32:07', level: 'info', message: 'Stream v2 conectado · 287 tweets/min' },
  { id: 'l4', engine: 'hn', ts: '12:31:58', level: 'warn', message: 'Rate limit cercano al 80%' },
  { id: 'l5', engine: 'rss', ts: '12:31:42', level: 'info', message: '24 feeds sincronizados · 0 nuevos' },
  { id: 'l6', engine: 'gdelt', ts: '12:31:30', level: 'error', message: 'Timeout en consulta theme:TECH' },
  { id: 'l7', engine: 'github', ts: '12:31:15', level: 'info', message: '12 repos verificados · 3 changelogs nuevos' },
  { id: 'l8', engine: 'reddit', ts: '12:30:55', level: 'info', message: 'OAuth token refrescado' },
  { id: 'l9', engine: 'x', ts: '12:30:38', level: 'warn', message: 'Hashtag #IA saturado · muestreo activado' },
  { id: 'l10', engine: 'bluesky', ts: '12:30:32', level: 'info', message: 'Deduplicación · 17 posts colisionados' },
]

type EngineConfigState = {
  interval: number
  queries: string[]
  draftQuery: string
}

const LEVEL_STYLES = {
  info: 'text-[var(--cool)]',
  warn: 'text-[var(--hot)]',
  error: 'text-destructive',
} as const

export function EnginesScreen() {
  const { engines, toggleEngine, live, notify } = useVirahub()
  const [openId, setOpenId] = useState<SourceKey | null>('reddit')
  const [configs, setConfigs] = useState<Record<string, EngineConfigState>>(() => {
    const map: Record<string, EngineConfigState> = {}
    for (const m of ENGINE_META) {
      map[m.id] = {
        interval: m.defaultInterval,
        queries: [...m.defaultQueries],
        draftQuery: '',
      }
    }
    return map
  })
  const [logs] = useState<LogEntry[]>(INITIAL_LOGS)

  const aggregate = useMemo(() => {
    const active = ENGINE_META.filter((m) => engines.includes(m.id))
    const totalRpm = active.length * 12 + 24
    const avgLatency = active.length ? 1 + active.length * 0.18 : 0
    const totalQueries = active.reduce((sum, m) => sum + (configs[m.id]?.queries.length ?? 0), 0)
    return {
      activeCount: active.length,
      totalCount: ENGINE_META.length,
      totalRpm,
      avgLatency,
      totalQueries,
    }
  }, [engines, configs])

  function updateConfig(id: SourceKey, patch: Partial<EngineConfigState>) {
    setConfigs((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }))
  }

  function addQuery(id: SourceKey) {
    const cfg = configs[id]
    if (!cfg || !cfg.draftQuery.trim()) return
    updateConfig(id, { queries: [...cfg.queries, cfg.draftQuery.trim()], draftQuery: '' })
  }

  function removeQuery(id: SourceKey, q: string) {
    const cfg = configs[id]
    if (!cfg) return
    updateConfig(id, { queries: cfg.queries.filter((x) => x !== q) })
  }

  function saveConfig(id: SourceKey) {
    void id
    notify('Configuración guardada')
  }

  return (
    <ScreenShell
      eyebrow="Motores"
      title="Gestión de motores de captura"
      description="Controla cada fuente de datos: intervalo de scan, consultas, subreddits y feeds. Métricas en vivo y logs de actividad por motor."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-[12.5px] text-muted-foreground">
            <Radio
              className={cn('size-3.5', live ? 'text-[var(--mint)]' : 'text-muted-foreground')}
              strokeWidth={2}
              style={live ? { animation: 'vh-pulse 1.6s ease-in-out infinite' } : undefined}
            />
            {aggregate.activeCount}/{aggregate.totalCount} motores activos
          </span>
          <button
            type="button"
            onClick={() => {
              const allActive = engines.length === ENGINE_META.length
              if (allActive) {
                ENGINE_META.forEach((m) => engines.includes(m.id) && toggleEngine(m.id))
                notify('Todos los motores pausados')
              } else {
                ENGINE_META.forEach((m) => !engines.includes(m.id) && toggleEngine(m.id))
                notify('Todos los motores reactivados')
              }
            }}
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-[12.5px] font-medium transition-colors hover:bg-white/[0.06]"
          >
            {engines.length === ENGINE_META.length ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {engines.length === ENGINE_META.length ? 'Pausar todos' : 'Activar todos'}
          </button>
        </div>
      }
    >
      {/* TOP METRICS */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Motores activos"
          value={aggregate.activeCount}
          suffix={`/${aggregate.totalCount}`}
          Icon={Layers}
          color="text-primary"
        />
        <MetricCard
          label="Menciones/min"
          value={aggregate.totalRpm}
          Icon={Zap}
          color="text-[var(--hot)]"
        />
        <MetricCard
          label="Latencia media"
          value={aggregate.avgLatency}
          decimals={1}
          suffix="s"
          Icon={Gauge}
          color="text-[var(--cool)]"
        />
        <MetricCard
          label="Queries totales"
          value={aggregate.totalQueries}
          Icon={Database}
          color="text-[var(--mint)]"
        />
      </ul>

      {/* ENGINE LIST + LOGS */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <ul className="flex flex-col gap-3">
          {ENGINE_META.map((meta) => {
            const isActive = engines.includes(meta.id)
            const isOpen = openId === meta.id
            const cfg = configs[meta.id]
            const engine = ENGINES.find((e) => e.id === meta.id)
            const rpm = isActive ? 8 + (cfg?.queries.length ?? 0) * 3 : 0
            const latency = isActive ? 0.6 + (cfg?.queries.length ?? 0) * 0.18 : 0
            const lastSync = isActive ? 'hace 1 min' : '—'
            return (
              <li
                key={meta.id}
                className={cn(
                  'rounded-2xl border bg-card transition-colors',
                  isOpen ? 'border-primary/40' : 'border-border hover:border-primary/30',
                )}
              >
                {/* HEADER ROW */}
                <div className="flex items-center gap-3 p-4">
                  <SourceTile source={meta.id} className={cn('size-10 transition-opacity', !isActive && 'opacity-50')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[14.5px] font-semibold">{engine?.name ?? meta.id}</h3>
                      <span
                        className={cn(
                          'flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                          isActive
                            ? 'border-[var(--mint)]/40 bg-[var(--mint)]/10 text-[var(--mint)]'
                            : 'border-border bg-white/[0.03] text-muted-foreground',
                        )}
                      >
                        <span
                          className={cn('size-1.5 rounded-full', isActive ? 'bg-[var(--mint)]' : 'bg-muted-foreground')}
                          style={isActive && live ? { animation: 'vh-pulse 1.6s ease-in-out infinite' } : undefined}
                        />
                        {isActive ? 'ACTIVO' : 'PAUSADO'}
                      </span>
                      <span className="rounded-md border border-border bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {meta.auth}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{meta.description}</p>
                  </div>
                  <div className="hidden items-center gap-5 sm:flex">
                    <MiniMetric label="menc/min" value={rpm} Icon={Zap} title="Menciones por minuto" />
                    <MiniMetric label="latencia" value={latency} decimals={1} suffix="s" Icon={Clock} title="Latencia de respuesta" />
                    <MiniMetric label="última sync" value={lastSync} Icon={RefreshCw} raw title="Tiempo desde la última sincronización" />
                  </div>
                  <Toggle on={isActive} onChange={() => toggleEngine(meta.id)} label={`Activar ${engine?.name}`} />
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : meta.id)}
                    className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
                    aria-label={isOpen ? `Contraer configuración de ${engine?.name}` : `Expandir configuración de ${engine?.name}`}
                    aria-expanded={isOpen}
                    title={isOpen ? 'Contraer' : 'Expandir'}
                  >
                    <ChevronDown className={cn('size-4 transition-transform', isOpen && 'rotate-180')} strokeWidth={2} />
                  </button>
                </div>

                {/* EXPANDED CONFIG */}
                {isOpen && cfg && (
                  <div className="animate-in fade-in slide-in-from-top-1 border-t border-border p-4 duration-300">
                    <div className="grid gap-4 lg:grid-cols-2">
                      {/* INTERVAL */}
                      <div>
                        <label className="mb-2 flex items-center justify-between text-[12px] font-semibold">
                          <span className="flex items-center gap-1.5">
                            <Clock className="size-3.5 text-muted-foreground" strokeWidth={2} />
                            Intervalo de scan
                          </span>
                          <span className="rounded-md border border-border bg-white/[0.03] px-2 py-0.5 text-[11.5px] tabular-nums">
                            {cfg.interval} min
                          </span>
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {meta.intervalOptions.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => updateConfig(meta.id, { interval: opt })}
                              className={cn(
                                'cursor-pointer rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors',
                                cfg.interval === opt
                                  ? 'border-primary/50 bg-primary/15 text-primary'
                                  : 'border-border text-muted-foreground hover:text-foreground',
                              )}
                            >
                              {opt}m
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Rate limit: <b className="font-medium text-foreground">{meta.rateLimit}</b>
                        </p>
                      </div>

                      {/* QUERIES */}
                      <div>
                        <label className="mb-2 flex items-center justify-between text-[12px] font-semibold">
                          <span className="flex items-center gap-1.5">
                            <Settings2 className="size-3.5 text-muted-foreground" strokeWidth={2} />
                            {meta.queryLabel}
                          </span>
                          <span className="rounded-md border border-border bg-white/[0.03] px-2 py-0.5 text-[11.5px] tabular-nums">
                            {cfg.queries.length}
                          </span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            value={cfg.draftQuery}
                            onChange={(e) => updateConfig(meta.id, { draftQuery: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                addQuery(meta.id)
                              }
                            }}
                            placeholder={meta.queryPlaceholder}
                            className="flex-1 rounded-lg border border-border bg-white/[0.03] px-2.5 py-1.5 text-[12px] outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/40"
                          />
                          <button
                            type="button"
                            onClick={() => addQuery(meta.id)}
                            disabled={!cfg.draftQuery.trim()}
                            className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`Añadir ${meta.queryLabel.toLowerCase()}`}
                            title="Añadir"
                          >
                            <Plus className="size-3.5" strokeWidth={2.2} />
                          </button>
                        </div>
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {cfg.queries.map((q) => (
                            <li
                              key={q}
                              className="flex items-center gap-1 rounded-md border border-border bg-white/[0.03] px-2 py-1 text-[11.5px] font-mono"
                            >
                              <span className="max-w-[180px] truncate">{q}</span>
                              <button
                                type="button"
                                onClick={() => removeQuery(meta.id, q)}
                                className="cursor-pointer text-muted-foreground transition-colors hover:text-destructive"
                                aria-label={`Eliminar ${q}`}
                                title="Eliminar"
                              >
                                <Trash2 className="size-3" strokeWidth={2} />
                              </button>
                            </li>
                          ))}
                          {cfg.queries.length === 0 && (
                            <li className="text-[11.5px] text-muted-foreground">Sin queries configuradas.</li>
                          )}
                        </ul>
                      </div>
                    </div>

                    {/* FOOTER ACTIONS */}
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                      <button
                        type="button"
                        onClick={() => saveConfig(meta.id)}
                        className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        <Save className="size-3.5" strokeWidth={2} /> Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => notify(`Test de conexión: ${engine?.name} OK`)}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-white/[0.06]"
                      >
                        <RefreshCw className="size-3.5" strokeWidth={2} /> Probar conexión
                      </button>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        Última sync: <b className="font-medium text-foreground">{lastSync}</b>
                      </span>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {/* LOGS */}
        <aside className="flex flex-col rounded-2xl border border-border bg-card p-4">
          <header className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              <Terminal className="size-3.5" strokeWidth={2} />
              Logs de actividad
            </h2>
            <button
              type="button"
              onClick={() => notify('Logs refrescados')}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-white/[0.03] px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <RefreshCw className="size-3" strokeWidth={2} /> Refrescar
            </button>
          </header>
          <ul className="mt-3 max-h-[460px] flex-1 space-y-1 overflow-y-auto scrollbar-thin font-mono text-[11.5px]">
            {logs.map((log) => {
              const engine = ENGINES.find((e) => e.id === log.engine)
              return (
                <li
                  key={log.id}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-white/[0.03]"
                >
                  <span className="shrink-0 text-muted-foreground tabular-nums">{log.ts}</span>
                  <span
                    className={cn(
                      'shrink-0 rounded px-1.5 text-[10px] font-bold uppercase',
                      log.level === 'info' && 'bg-[var(--cool)]/15 text-[var(--cool)]',
                      log.level === 'warn' && 'bg-[var(--hot)]/15 text-[var(--hot)]',
                      log.level === 'error' && 'bg-destructive/15 text-destructive',
                    )}
                  >
                    {log.level}
                  </span>
                  <span className="shrink-0 text-[var(--mint)]">{engine?.name ?? log.engine}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground/85">{log.message}</span>
                </li>
              )
            })}
          </ul>
          <footer className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <AlertCircle className="size-3" strokeWidth={2} />
              Logs retenidos 7 días · {logs.length} entradas recientes
            </span>
          </footer>
        </aside>
      </div>
    </ScreenShell>
  )
}

/* ═══════ HELPERS ═══════ */
function MetricCard({
  label,
  value,
  suffix,
  decimals = 0,
  Icon,
  color,
}: {
  label: string
  value: number
  suffix?: string
  decimals?: number
  Icon: typeof Activity
  color: string
}) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
      <span className={cn('flex size-9 items-center justify-center rounded-lg bg-white/[0.04]', color)}>
        <Icon className="size-4" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <CountUp
          value={value}
          decimals={decimals}
          suffix={suffix ?? ''}
          className="block text-xl font-bold tabular-nums"
        />
        <span className="block text-[11.5px] text-muted-foreground">{label}</span>
      </div>
    </li>
  )
}

function MiniMetric({
  label,
  value,
  suffix,
  decimals = 0,
  Icon,
  raw = false,
  title,
}: {
  label: string
  value: number | string
  suffix?: string
  decimals?: number
  Icon: typeof Activity
  raw?: boolean
  title?: string
}) {
  return (
    <div className="flex flex-col items-end gap-0.5 text-right" title={title}>
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="size-3" strokeWidth={2} />
        {label}
      </span>
      {raw ? (
        <span className="text-[12.5px] font-semibold tabular-nums">{value}</span>
      ) : (
        <CountUp
          value={value as number}
          decimals={decimals}
          suffix={suffix ?? ''}
          className="text-[12.5px] font-semibold tabular-nums"
        />
      )}
    </div>
  )
}
