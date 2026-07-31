'use client'

import { useMemo, useState } from 'react'
import {
  ArrowUpRight, ArrowRight, Bookmark, BookmarkCheck, Search,
  Flame, TrendingUp, Clock, Globe, Bell, Star, ChevronDown,
  MessageSquare, Share2, Users, Info, Zap, Sparkles,
  ArrowUp, Activity, FileText, GitCompare,
} from 'lucide-react'
import { useVirahub } from '@/components/virahub-provider'
import { SourceTile } from '@/components/source-icon'
import { MiniSpark } from '@/components/screens/screen-shell'
import { cn } from '@/lib/utils'
import { TRENDS, ENGINES, type Trend } from '@/lib/virahub-data'

const tabs = ['Resumen', 'Análisis IA', 'Conversaciones', 'Fuentes', 'Historial'] as const
type Tab = (typeof tabs)[number]

export function ExploreScreen() {
  const { trends, selected, select, step, saved, toggleSaved, alerts, toggleAlert, notify } = useVirahub()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('Resumen')
  const [openConv, setOpenConv] = useState<number | null>(0)

  const list = useMemo(
    () => trends.filter((t) => t.title.toLowerCase().includes(query.toLowerCase())),
    [trends, query],
  )

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5">
      {/* THEME HEADER */}
      <section className="grid grid-cols-1 gap-6 rounded-2xl border border-border bg-card p-6 lg:grid-cols-[1fr_auto] lg:gap-8">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hot)]/25 bg-[var(--hot)]/10 px-2.5 py-1 text-[11px] font-bold tracking-wide text-[var(--hot)]">
            <Flame className="size-3.5" /> CRECIENDO FUERTE <ArrowUpRight className="size-3.5" />
          </span>
          <h1 className="mt-3.5 text-3xl font-bold leading-tight tracking-tight lg:text-4xl">
            {selected.title}
          </h1>
          <p className="mt-2.5 max-w-[460px] text-[14px] text-muted-foreground">{selected.why}</p>
          <div className="mt-4 flex flex-wrap gap-4 text-[13px] text-muted-foreground">
            <span className="flex items-center gap-1.5 text-[var(--hot)]">
              <Flame className="size-3.5" /> {selected.heat}
            </span>
            <span className="flex items-center gap-1.5 text-primary">
              <Sparkles className="size-3.5" /> {selected.status}
            </span>
            <span className="flex items-center gap-1.5">
              <Globe className="size-3.5" /> {selected.source}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" /> {selected.time}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 lg:min-w-[280px]">
          <div className="flex items-baseline justify-between gap-6">
            <div>
              <span className="font-mono text-3xl font-bold tabular-nums">{selected.mentions}</span>
              <small className="mt-1 block text-[11px] text-muted-foreground">menciones/hora</small>
            </div>
            <div className="text-right">
              <span className="font-mono text-2xl font-bold text-[var(--hot)] tabular-nums">
                +{selected.delta}%
              </span>
              <small className="mt-1 block text-[11px] text-muted-foreground">vs ayer</small>
            </div>
          </div>
          <div className="mt-1.5">
            <MiniSpark trend={selected} step={step} className="h-[60px] w-full" />
          </div>
        </div>
      </section>

      {/* ACTIONS */}
      <div className="flex items-center justify-end gap-2 -mt-2">
        <button
          type="button"
          onClick={() => toggleSaved(selected.id)}
          className={cn(
            'flex items-center gap-2 rounded-[10px] border px-3.5 py-2 text-[13px] font-semibold transition-all',
            saved.includes(selected.id)
              ? 'border-primary bg-primary/20 text-primary'
              : 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20',
          )}
        >
          <Star className="size-4" fill={saved.includes(selected.id) ? 'currentColor' : 'none'} />
          {saved.includes(selected.id) ? 'Siguiendo' : 'Seguir tema'}
        </button>
        <button
          type="button"
          onClick={() => toggleAlert(selected.id)}
          className={cn(
            'flex items-center gap-2 rounded-[10px] border px-3.5 py-2 text-[13px] font-semibold transition-all',
            alerts.includes(selected.id)
              ? 'border-[var(--hot)]/50 bg-[var(--hot)]/10 text-[var(--hot)]'
              : 'border-border bg-white/[0.04] text-foreground hover:bg-white/[0.08]',
          )}
        >
          <Bell className="size-4" /> {alerts.includes(selected.id) ? 'Alerta activa' : 'Crear alerta'}
        </button>
      </div>

      {/* TABS */}
      <div className="flex gap-6 border-b border-border">
        {tabs.map((t, i) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'relative pb-3 text-[14px] font-medium transition-colors',
              tab === t ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t}
            {t === 'Fuentes' && (
              <span className="ml-1.5 rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {selected.evidence.length}
              </span>
            )}
            {tab === t && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* PANEL CONTENT */}
      <div className="flex flex-col gap-5">
        {tab === 'Resumen' && <ResumenPanel trend={selected} />}
        {tab === 'Análisis IA' && <AnalisisIAPanel trend={selected} />}
        {tab === 'Conversaciones' && <ConversacionesPanel trend={selected} openConv={openConv} setOpenConv={setOpenConv} />}
        {tab === 'Fuentes' && <FuentesPanel trend={selected} />}
        {tab === 'Historial' && <HistorialPanel trend={selected} />}
      </div>

      {/* SEARCH + FILTER ROW */}
      <div className="flex items-center gap-2 border-t border-border pt-4">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2">
          <Search className="size-4 text-muted-foreground" strokeWidth={1.9} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar tendencia…"
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
          />
        </div>
      </div>

      {/* TREND CARDS GRID */}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((t, i) => (
          <li key={t.id} className="animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: `${i * 60}ms` }}>
            <article
              className={cn(
                'group flex h-full cursor-pointer flex-col gap-3 rounded-xl border p-4 transition-all duration-300 hover:-translate-y-0.5',
                selected.id === t.id
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border bg-card hover:border-primary/30',
              )}
              onClick={() => { select(t.id); setTab('Resumen') }}
            >
              <div className="flex items-start gap-3">
                <SourceTile source={t.source} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[14px] font-semibold">{t.title}</h2>
                  <p className="text-[12px] text-muted-foreground">{t.status}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleSaved(t.id) }}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {saved.includes(t.id) ? (
                    <BookmarkCheck className="size-4 text-primary" strokeWidth={2} />
                  ) : (
                    <Bookmark className="size-4" strokeWidth={1.9} />
                  )}
                </button>
              </div>
              <MiniSpark trend={t} step={step} />
              <div className="flex items-end justify-between">
                <p className="flex items-baseline gap-1">
                  <span className="text-xl font-semibold tabular-nums">{t.mentions}</span>
                  <span className="text-[11px] text-muted-foreground">menc/h</span>
                </p>
                <p className={cn('text-[13px] font-semibold tabular-nums', t.delta > 0 ? 'text-[var(--mint)]' : 'text-muted-foreground')}>
                  {t.delta > 0 ? '+' : ''}{t.delta}%
                </p>
              </div>
            </article>
          </li>
        ))}
      </ul>

      {list.length === 0 && (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-[13px] text-muted-foreground">
          Sin resultados para "{query}".
        </p>
      )}
    </div>
  )
}

/* ═══ PANEL: RESUMEN ═══ */
function ResumenPanel({ trend }: { trend: Trend }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-3.5 flex items-center gap-2 text-[15px] font-semibold">
          <Info className="size-4 text-muted-foreground" /> ¿Por qué es tendencia?
        </h3>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">{trend.why}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {trend.evidence.map((e) => (
            <span key={e.label} className="rounded-lg border border-border bg-white/[0.03] px-3 py-1.5 text-[12px] text-muted-foreground">
              {e.label} <b className="ml-1 font-semibold text-foreground">{e.value}</b>
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-3.5 flex items-center gap-2 text-[15px] font-semibold">
          <Activity className="size-4 text-muted-foreground" /> Señal de Virahub
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2.5 text-[13px]">
            <span className="text-muted-foreground">Fuerza de la señal</span>
            <span className="font-semibold tabular-nums">{trend.confidence}/100</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full bg-primary transition-all duration-1000"
              style={{ width: `${trend.confidence}%`, boxShadow: '0 0 10px var(--primary)' }}
            />
          </div>
          <div className="flex items-center justify-between border-b border-border pb-2.5 text-[13px]">
            <span className="text-muted-foreground">Velocidad</span>
            <span className="flex items-center gap-1.5 font-semibold text-[var(--mint)]">
              <TrendingUp className="size-3.5" /> {trend.dir === 'up' ? 'Acelerando' : trend.dir === 'down' ? 'Frenando' : 'Estable'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted-foreground">Confiabilidad</span>
            <span className="flex items-center gap-1.5 font-semibold text-[var(--mint)]">
              <span className="size-2 rounded-full bg-[var(--mint)]" /> Alta
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══ PANEL: ANÁLISIS IA ═══ */
function AnalisisIAPanel({ trend }: { trend: Trend }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 to-transparent p-5 shadow-[0_0_0_1px_rgba(139,92,246,0.06)_inset,0_18px_50px_-28px_rgba(139,92,246,0.8)]">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[16px] font-semibold">
            <Sparkles className="size-4 text-primary" /> Resumen IA
          </h3>
          <span className="text-[11px] text-muted-foreground">Nemotron-3-Ultra · generado hace 2min</span>
        </div>
        <p className="mt-3.5 text-[13px] leading-relaxed text-foreground/80">
          {trend.why} La señal muestra una aceleración del {trend.delta > 0 ? '+' : ''}{trend.delta}% en las últimas horas,
          con una confiabilidad del {trend.confidence}%. Las menciones provienen principalmente de {trend.source},
          con una velocidad de {trend.mentions} menciones por hora. {trend.delta > 100 ? 'Este patrón coincide con tendencias que posteriormente alcanzaron cobertura mediática amplia.' : 'La tendencia aún no ha alcanzado el umbral de amplificación masiva.'}
        </p>
        <div className="mt-4 flex gap-2.5">
          <button className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-primary/50 bg-primary/15 px-3.5 py-2 text-[13px] font-semibold text-primary transition hover:bg-primary/25">
            <FileText className="size-4" /> Ver análisis completo
          </button>
          <button className="flex items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.04] px-3.5 py-2 text-[13px] font-semibold transition hover:bg-white/[0.08]">
            <Share2 className="size-4" />
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-3.5 text-[15px] font-semibold">Análisis detallado</h3>
        <div className="space-y-3.5">
          {trend.evidence.map((e) => (
            <div key={e.label}>
              <div className="mb-1.5 flex justify-between text-[12.5px]">
                <span className="text-muted-foreground">{e.label}</span>
                <b className="text-foreground">{e.value}</b>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, parseInt(e.value) * 10 || 50)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3.5 text-[12px] text-muted-foreground">
          <span className="rounded-md border border-border bg-white/[0.03] px-2 py-0.5 font-mono text-[11px]">Nemotron-3-Ultra-550B</span>
          <span>thinking:false · 312 tokens · 4.2s</span>
        </div>
      </div>
    </div>
  )
}

/* ═══ PANEL: CONVERSACIONES ═══ */
function ConversacionesPanel({ trend, openConv, setOpenConv }: { trend: Trend; openConv: number | null; setOpenConv: (v: number | null) => void }) {
  const convs = [
    { author: 'r/Artificial', handle: 'u/ia_policy_es', source: 'reddit', text: 'Borrador filtrado sobre IA general del artículo 7 es preocupante. Define "modelo de uso general" de forma demasiado amplia.', time: 'hace 54m', score: 342, comments: 128, reach: '4.2k', shares: 38 },
    { author: '@dev_es', handle: 'Bluesky', source: 'bluesky', text: 'Hilo sobre implicaciones del artículo 7 para devs independientes. Si se aprueba tal cual, cualquier dev que use modelos de +10B params tendría que registrar el uso.', time: 'hace 1h', score: 456, comments: 43, reach: '7.2k', shares: 112 },
    { author: 'u/tech_observer', handle: 'r/spain', source: 'reddit', text: '¿Alguien leyó el borrador de la UE? Lo subí a r/spain pero pasó desaparecido. Ahora está explotando en Bluesky.', time: 'hace 45m', score: 847, comments: 213, reach: '12k', shares: 89 },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {convs.map((c, i) => (
        <div
          key={i}
          onClick={() => setOpenConv(openConv === i ? null : i)}
          className={cn(
            'cursor-pointer rounded-xl border bg-card/60 p-4 transition-all duration-200',
            openConv === i ? 'border-primary/50' : 'border-border hover:border-primary/30 hover:-translate-y-0.5',
          )}
        >
          <div className="flex items-center gap-2.5">
            <SourceTile source={c.source as any} className="size-8 shrink-0 rounded-lg" />
            <div className="min-w-0">
              <b className="block text-[13.5px] font-semibold">{c.author}</b>
              <span className="text-[12px] text-muted-foreground">{c.handle}</span>
            </div>
            <span className="ml-auto text-[11.5px] text-muted-foreground">{c.time}</span>
          </div>
          <p className="my-3 text-[13px] leading-relaxed text-foreground/75">{c.text}</p>
          <div className="flex items-center gap-4 text-[12.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5 text-[var(--hot)]">
              <ArrowUp className="size-3.5" /> {c.score}
            </span>
            <span className="flex items-center gap-1.5">
              <MessageSquare className="size-3.5" /> {c.comments}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5" /> {c.reach}
            </span>
            <ChevronDown className={cn('ml-auto size-3.5 transition-transform', openConv === i && 'rotate-180 text-primary')} />
          </div>
          {openConv === i && (
            <div className="mt-3.5 border-t border-border pt-3 text-[12px] text-muted-foreground">
              <div className="flex flex-wrap gap-4">
                <span className="flex items-center gap-1.5"><Share2 className="size-3.5" /> {c.shares} compartidos</span>
                <span className="flex items-center gap-1.5"><Clock className="size-3.5" /> {c.time}</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ═══ PANEL: FUENTES ═══ */
function FuentesPanel({ trend }: { trend: Trend }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 text-[15px] font-semibold">Fuentes detectadas</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="pb-2.5 text-left font-semibold"></th>
              <th className="pb-2.5 text-left font-semibold">Fuente</th>
              <th className="pb-2.5 text-left font-semibold">Menciones</th>
              <th className="pb-2.5 text-left font-semibold">Crecimiento</th>
              <th className="pb-2.5 text-right font-semibold">Acción</th>
            </tr>
          </thead>
          <tbody>
            {ENGINES.map((e, i) => {
              const pct = [312, 128, 61, 18, 42, 96][i] || 0
              const menc = [14, 9, 3, 5, 8, 2][i] || 0
              return (
                <tr key={e.id} className="border-b border-border/50 transition-colors hover:bg-white/[0.02]">
                  <td className="py-3"><SourceTile source={e.id as any} className="size-8 rounded-lg" /></td>
                  <td className="py-3">
                    <div className="font-semibold text-[13.5px]">{e.name}</div>
                    <div className="text-[11.5px] text-muted-foreground">{e.verbs[0]}</div>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums text-[13px]">{menc}</span>
                      <div className="h-1 w-16 overflow-hidden rounded-full bg-white/[0.08]">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, menc * 8)}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="py-3">
                    <span className="flex items-center gap-1 font-semibold text-[var(--hot)] tabular-nums">
                      <ArrowUp className="size-3" /> +{pct}%
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      className="rounded-lg border border-border bg-white/[0.04] px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground transition hover:text-foreground"
                    >
                      Seguir
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ═══ PANEL: HISTORIAL ═══ */
function HistorialPanel({ trend }: { trend: Trend }) {
  const events = [
    { time: '12:32', text: 'Detección inicial por motor Reddit', tag: 'Detección', color: 'primary' },
    { time: '12:35', text: 'Bluesky confirma la señal con 3 posts', tag: 'Cross-source', color: 'primary' },
    { time: '12:40', text: 'Velocidad supera umbral (82 menc/h)', tag: 'Umbral', color: 'hot' },
    { time: '12:45', text: 'Análisis IA disponible', tag: 'IA', color: 'primary' },
    { time: '13:00', text: 'Hacker News empieza a discutir el tema', tag: 'Amplificación', color: 'hot' },
    { time: '13:15', text: 'Guardado en radar por usuario', tag: 'Usuario', color: 'primary' },
  ]
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 text-[15px] font-semibold">Historial de eventos</h3>
      <div className="relative pl-6">
        <div className="absolute left-1.5 top-1.5 bottom-1.5 w-0.5 bg-gradient-to-b from-primary via-[var(--hot)] to-transparent" />
        {events.map((e, i) => (
          <div key={i} className="relative pb-5 last:pb-0">
            <span
              className={cn(
                'absolute -left-[18px] top-1 size-3 rounded-full',
                e.color === 'primary' ? 'bg-primary' : 'bg-[var(--hot)]',
              )}
              style={{ boxShadow: `0 0 0 4px ${e.color === 'primary' ? 'rgba(139,92,246,0.18)' : 'rgba(249,115,22,0.18)'}` }}
            />
            <span className="font-mono text-[12px] text-muted-foreground tabular-nums">{e.time}</span>
            <p className="mt-0.5 text-[13.5px] text-foreground/85">{e.text}</p>
            <span className="mt-1.5 inline-block rounded-md border border-border bg-white/[0.03] px-2 py-0.5 text-[11px] text-muted-foreground">{e.tag}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
