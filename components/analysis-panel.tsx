'use client'

import { useMemo } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BellRing,
  Bookmark,
  BookmarkCheck,
  Equal,
  Flame,
  Plus,
  Sparkles,
  X,
} from 'lucide-react'
import { CountUp } from '@/components/count-up'
import { SourceGlyph } from '@/components/source-icon'
import { useVirahub } from '@/components/virahub-provider'
import { buildSeries, smoothPath, type Trend } from '@/lib/virahub-data'
import { cn } from '@/lib/utils'

const TONE: Record<Trend['tone'], string> = {
  hot: 'text-[var(--hot)]',
  cool: 'text-[#5aa9f8]',
  mint: 'text-[var(--mint)]',
  muted: 'text-muted-foreground',
}

function DirIcon({ dir }: { dir: Trend['dir'] }) {
  const label =
    dir === 'up'
      ? 'Tendencia al alza: acelerándose'
      : dir === 'down'
        ? 'Tendencia a la baja: perdiendo tracción'
        : 'Tendencia estable: sin variación significativa'
  const Icon =
    dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Equal
  const color =
    dir === 'up'
      ? 'text-[var(--mint)]'
      : 'text-muted-foreground'
  return (
    <span title={label} className="flex items-center">
      <Icon
        className={cn('size-3.5', color)}
        strokeWidth={2.2}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}

function Sparkline({ trend, step }: { trend: Trend; step: number }) {
  const { d, area, last } = useMemo(() => {
    const values = buildSeries(trend.id, trend.shape, '6H', step)
    const pts = values.map(
      (v, i) =>
        [2 + (i / (values.length - 1)) * 336, 62 - v * 56] as [number, number],
    )
    const line = smoothPath(pts)
    return {
      d: line,
      area: `${line} L 338 70 L 2 70 Z`,
      last: pts[pts.length - 1],
    }
  }, [trend.id, trend.shape, step])

  return (
    <svg
      viewBox="0 0 340 70"
      className="mt-4 h-[70px] w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="vh-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={trend.color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={trend.color} stopOpacity="0" />
        </linearGradient>
        <filter id="vh-spark-glow" x="-20%" y="-60%" width="140%" height="240%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d={area} fill="url(#vh-spark-fill)" />
      <path
        key={trend.id}
        d={d}
        fill="none"
        stroke={trend.color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        filter="url(#vh-spark-glow)"
        style={{ strokeDasharray: 1200, animation: 'vh-draw .9s ease-out forwards' }}
      />
      <circle cx={last[0]} cy={last[1]} r="3" fill={trend.color} />
      <circle
        cx={last[0]}
        cy={last[1]}
        r="3"
        fill="none"
        stroke={trend.color}
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
        style={{
          animation: 'vh-ripple 2s ease-out infinite',
          transformOrigin: `${last[0]}px ${last[1]}px`,
        }}
      />
    </svg>
  )
}

export function AnalysisPanel() {
  const {
    trends,
    selectedId,
    select,
    selected,
    step,
    cardOpen,
    setCardOpen,
    saved,
    toggleSaved,
    alerts,
    toggleAlert,
    setScreen,
    live,
    selectedBriefing,
  } = useVirahub()

  const isSaved = saved.includes(selected.id)
  const hasAlert = alerts.includes(selected.id)

  return (
    <aside className="flex w-full flex-col gap-4 rounded-2xl border border-border bg-[var(--panel)] p-4 lg:w-[420px] lg:shrink-0">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          En análisis
          <span className="flex items-center gap-1.5 rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
            {live && (
              <span
                className="size-1.5 rounded-full bg-[var(--mint)]"
                style={{ animation: 'vh-pulse 1.4s ease-in-out infinite' }}
              />
            )}
            {trends.length}
          </span>
        </h2>
        <button
          type="button"
          onClick={() => setScreen('explorar')}
          aria-label="Ver todas las tendencias en la pantalla Explorar"
          title="Ir a Explorar — ver todas las tendencias"
          className="group/all flex cursor-pointer items-center gap-1 text-[12px] text-[oklch(0.72_0.16_300)] transition-opacity hover:underline hover:opacity-80"
        >
          Ver todo
          <ArrowRight
            className="size-3 transition-transform duration-200 group-hover/all:translate-x-0.5"
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </button>
      </div>

      <ul className="flex flex-col gap-0.5">
        {trends.map((t, idx) => {
          const active = selectedId === t.id
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => select(t.id)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'group relative flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-left transition-all duration-200',
                  active
                    ? 'bg-[var(--hot)]/8'
                    : cn(
                        'hover:translate-x-0.5 hover:bg-white/[0.04]',
                        // Zebra striping on alternating rows for visual
                        // breathing room (VLM issue #2).
                        idx % 2 === 1 && 'bg-white/[0.018]',
                      ),
                )}
              >
                {active && (
                  <span className="absolute inset-y-1.5 left-0 w-[3px] animate-in fade-in slide-in-from-left-1 rounded-full bg-[var(--hot)] duration-300" />
                )}
                {active && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-r from-[var(--hot)]/[0.06] to-transparent"
                  />
                )}
                <span className="flex size-6 shrink-0 items-center justify-center">
                  {t.id === 'ia' ? (
                    <Flame className="size-4 text-[var(--hot)]" strokeWidth={2} />
                  ) : (
                    <SourceGlyph source={t.source} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">
                    {t.title}
                  </span>
                  <span className={cn('block truncate text-[12px]', TONE[t.tone])}>
                    {t.status}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {alerts.includes(t.id) && (
                    <span
                      title={`Alerta activa: recibirás notificaciones cuando ${t.title} cambie de ritmo`}
                      className="flex items-center text-[oklch(0.72_0.16_300)]"
                    >
                      <BellRing
                        className="size-3"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                      <span className="sr-only">
                        Alerta activa para {t.title}
                      </span>
                    </span>
                  )}
                  <span
                    className="text-[12px] text-muted-foreground tabular-nums"
                    title={`Última actualización: ${t.time}`}
                  >
                    {t.time}
                  </span>
                  <DirIcon dir={t.dir} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {cardOpen ? (
        <article
          key={selected.id}
          className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-border bg-card p-4 duration-400"
        >
          <div className="flex items-start justify-between gap-3">
            <span
              className={cn(
                'flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase',
                TONE[selected.tone],
              )}
            >
              <Flame
                className="size-3.5"
                strokeWidth={2.2}
                style={live ? { animation: 'vh-flicker 2.4s ease-in-out infinite' } : undefined}
              />
              {selected.dir === 'down' ? 'Enfriando' : 'Creciendo'}
            </span>
            <button
              type="button"
              onClick={() => setCardOpen(false)}
              aria-label="Cerrar panel de detalle"
              className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" strokeWidth={2} />
              <span className="sr-only">Cerrar</span>
            </button>
          </div>

          <h3 className="mt-3 text-[17px] font-semibold text-balance">{selected.title}</h3>

          <div className="mt-2.5 flex items-center gap-3">
            <span
              className={cn(
                'rounded-md px-2 py-0.5 text-[11px] font-medium',
                TONE[selected.tone],
              )}
              style={{ background: 'oklch(1 0 0 / 7%)' }}
              role="img"
              aria-label={`Nivel de actividad: ${selected.heat}`}
              title={`Nivel de actividad de la tendencia: ${selected.heat}`}
            >
              {selected.heat}
            </span>
            <span
              className="text-[12px] text-muted-foreground"
              role="img"
              aria-label={`Confianza del modelo: ${selected.confidence} de 100`}
              title="Puntuación de confianza del modelo (0–100). Más alto = más fiable."
            >
              <CountUp
                value={selected.confidence}
                className="font-semibold text-foreground tabular-nums"
              />{' '}
              confianza
            </span>
          </div>

          <div className="mt-4 flex items-end justify-between">
            <p
              className="flex items-baseline gap-1.5"
              role="img"
              aria-label={`Velocidad: ${Math.round((selected.velocity ?? 0) * 60)} menciones por hora en los últimos 15 minutos`}
              title="Velocidad real: menciones por hora en ventana de 15 minutos."
            >
              <CountUp
                value={Math.round((selected.velocity ?? 0) * 60)}
                className="text-4xl font-semibold tracking-tight tabular-nums"
              />
              <span className="text-[12px] text-muted-foreground">menc/hora · 15min</span>
            </p>
            <p
              className="text-right"
              role="img"
              aria-label={`Cambio de momentum: ${selected.delta > 0 ? '+' : ''}${selected.delta}. Positivo = acelerando.`}
              title="Delta de momentum. Positivo = acelerando, negativo = desacelerando."
            >
              <CountUp
                value={selected.delta}
                prefix={selected.delta > 0 ? '+' : ''}
                className={cn(
                  'block text-[15px] font-semibold tabular-nums',
                  selected.delta > 5 ? 'text-[var(--mint)]' :
                  selected.delta < -5 ? 'text-[var(--hot)]' : 'text-muted-foreground',
                )}
              />
              <span className="block text-[11px] text-muted-foreground">
                {selected.phase === 'rising' ? 'acelerando' :
                 selected.phase === 'decaying' ? 'frenando' :
                 selected.phase === 'peaked' ? 'en pico' : 'estable'}
              </span>
            </p>
          </div>

          <Sparkline trend={selected} step={step} />

          <ul className="mt-3 grid grid-cols-3 gap-2">
            {selected.evidence.map((e) => (
              <li
                key={e.label}
                className="rounded-lg bg-white/[0.03] px-2 py-1.5 text-center"
              >
                <span className="block text-[13px] font-semibold tabular-nums">
                  {e.value}
                </span>
                <span className="block text-[10.5px] text-muted-foreground">
                  {e.label}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-border pt-4">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Por qué importa
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground text-pretty">
              {selected.why}
            </p>
          </div>

          {/* Briefing IA — render narrative + keyPoints + riskFlags */}
          {selectedBriefing && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-[oklch(0.78_0.16_300)] uppercase">
                <Sparkles className="size-3" strokeWidth={2.2} aria-hidden="true" />
                Análisis IA
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/85 text-pretty">
                {selectedBriefing.narrative}
              </p>
              {selectedBriefing.keyPoints.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {selectedBriefing.keyPoints.map((kp, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12px] text-muted-foreground">
                      <span className="mt-0.5 size-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      <span className="text-pretty">{kp}</span>
                    </li>
                  ))}
                </ul>
              )}
              {selectedBriefing.riskFlags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selectedBriefing.riskFlags.map((rf, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--hot)]/30 bg-[var(--hot)]/10 px-2 py-1 text-[10.5px] font-medium text-[var(--hot)]"
                    >
                      <AlertTriangle className="size-2.5" strokeWidth={2.4} aria-hidden="true" />
                      {rf}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[10px] text-muted-foreground/70">
                {selectedBriefing.model} · {selectedBriefing.confidence.toFixed(2)} confianza · {selectedBriefing.tokensUsed} tokens
              </p>
            </div>
          )}

          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScreen('informes')}
              className="group flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap text-primary-foreground transition-all hover:opacity-90 hover:shadow-[0_0_20px_-4px_var(--primary)] active:translate-y-px"
            >
              Ver análisis completo
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2.2}
              />
            </button>
            <button
              type="button"
              onClick={() => toggleAlert(selected.id)}
              aria-pressed={hasAlert}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                hasAlert
                  ? 'border-primary/50 bg-primary/12 text-foreground'
                  : 'border-border text-foreground/90 hover:bg-white/[0.04]',
              )}
            >
              {hasAlert ? (
                <BellRing className="size-4" strokeWidth={1.9} />
              ) : (
                <Bell className="size-4" strokeWidth={1.9} />
              )}
              {hasAlert ? 'Alerta activa' : 'Crear alerta'}
            </button>
            <button
              type="button"
              onClick={() => toggleSaved(selected.id)}
              aria-pressed={isSaved}
              aria-label={isSaved ? `Quitar ${selected.title} de guardados` : `Guardar ${selected.title}`}
              title={isSaved ? 'Quitar de guardados' : 'Guardar en mi radar'}
              className={cn(
                'flex cursor-pointer items-center justify-center rounded-lg border p-2.5 transition-colors',
                isSaved
                  ? 'border-primary/50 bg-primary/12 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
              )}
            >
              {isSaved ? (
                <BookmarkCheck className="size-4" strokeWidth={1.9} />
              ) : (
                <Bookmark className="size-4" strokeWidth={1.9} />
              )}
              <span className="sr-only">Guardar</span>
            </button>
          </div>
        </article>
      ) : (
        <button
          type="button"
          onClick={() => setCardOpen(true)}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border py-6 text-[13px] text-muted-foreground transition-colors hover:bg-white/[0.03] hover:text-foreground"
        >
          <Plus className="size-4" strokeWidth={2} />
          Ver detalle de {selected.title}
        </button>
      )}

      <p className="flex items-center justify-center gap-2 pb-1 text-center text-[11px] text-muted-foreground/85">
        {live && (
          <span
            className="size-1.5 rounded-full bg-[var(--mint)]"
            style={{ animation: 'vh-pulse 1.6s ease-in-out infinite' }}
          />
        )}
        {live ? 'Actualizaciones en tiempo real' : 'Actualizaciones en pausa'}
      </p>
    </aside>
  )
}
