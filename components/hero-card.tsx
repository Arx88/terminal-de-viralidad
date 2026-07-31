'use client'

import { useState } from 'react'
import Image from 'next/image'
import {
  AlertTriangle,
  ChevronRight,
  Play,
  Radio,
  TrendingUp,
  Waves,
  X,
} from 'lucide-react'
import { CountUp } from '@/components/count-up'
import { useVirahub } from '@/components/virahub-provider'
import { ENGINES } from '@/lib/virahub-data'
import { cn } from '@/lib/utils'

const stats = [
  {
    value: 3,
    label: 'Tendencias emergentes',
    Icon: TrendingUp,
    color: 'text-[var(--hot)]',
    glow: 'group-hover/stat:shadow-[0_0_24px_-6px_var(--hot)]',
    screen: 'explorar' as const,
    hint: 'Explorar',
  },
  {
    value: 12,
    label: 'Señales débiles',
    Icon: Waves,
    color: 'text-[var(--cool)]',
    glow: 'group-hover/stat:shadow-[0_0_24px_-6px_var(--cool)]',
    screen: 'explorar' as const,
    hint: 'Explorar',
  },
  {
    value: 2,
    label: 'Anomalías detectadas',
    Icon: AlertTriangle,
    color: 'text-[var(--hot)]',
    glow: 'group-hover/stat:shadow-[0_0_24px_-6px_var(--hot)]',
    screen: 'alertas' as const,
    hint: 'Alertas',
  },
]

const steps = [
  `Recolectamos señales de ${ENGINES.length} motores en paralelo, cada pocos segundos.`,
  'Normalizamos, deduplicamos y puntuamos la velocidad de cada tema.',
  'Cuando la aceleración supera el umbral, aparece en tu radar.',
]

export function HeroCard() {
  const { setScreen, live } = useVirahub()
  const [howOpen, setHowOpen] = useState(false)

  return (
    <section
      aria-label="Resumen ejecutivo del radar"
      className="group relative overflow-hidden rounded-2xl border border-border bg-card"
    >
      {/* Planet — opacity reduced + stronger overlays so it reads as ambient
          texture, not the focal point of an operational dashboard. */}
      <Image
        src="/hero-planet.png"
        alt=""
        fill
        priority
        sizes="(max-width: 1024px) 100vw, 70vw"
        className="scale-105 object-cover object-[center_26%] opacity-50 transition-transform duration-[3000ms] ease-out group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-background from-10% via-background/95 via-50% to-background/60" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/30" />
      {live && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-[oklch(0.75_0.2_300)]/8 to-transparent"
          style={{ animation: 'vh-sweep-x 9s linear infinite' }}
        />
      )}

      {/* Compact horizontal band: headline left, prominent stats right. */}
      <div className="relative flex flex-col gap-5 px-6 py-6 lg:flex-row lg:items-center lg:gap-8 lg:px-10 lg:py-8">
        {/* ── Left: compact headline ── */}
        <div className="flex-1 lg:max-w-md">
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.16em] uppercase backdrop-blur-sm transition-colors',
                live
                  ? 'border-[var(--hot)]/40 bg-[var(--hot)]/10 text-[var(--hot)]'
                  : 'border-border bg-white/[0.04] text-muted-foreground',
              )}
              style={
                live
                  ? { animation: 'vh-badge-glow 2.4s ease-in-out infinite' }
                  : undefined
              }
            >
              <span className="relative flex size-2">
                {live && (
                  <span
                    className="absolute inline-flex size-full rounded-full bg-[var(--hot)] opacity-75"
                    style={{ animation: 'vh-ripple 1.8s ease-out infinite' }}
                  />
                )}
                <span
                  className={cn(
                    'relative inline-flex size-2 rounded-full',
                    live ? 'bg-[var(--hot)]' : 'bg-muted-foreground',
                  )}
                />
              </span>
              {live ? 'En vivo' : 'En pausa'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur-sm">
              <Radio className="size-3 text-primary" strokeWidth={2.2} />
              {ENGINES.length} motores activos
            </span>
          </div>

          <h1 className="text-3xl leading-[1.08] font-bold tracking-tight text-balance lg:text-[2.35rem]">
            Detectamos lo que está por{' '}
            <span className="relative bg-gradient-to-r from-[oklch(0.78_0.22_320)] via-[oklch(0.72_0.2_300)] to-[oklch(0.65_0.24_290)] bg-clip-text text-transparent">
              explotar.
              <span
                aria-hidden="true"
                className="absolute -inset-x-2 -bottom-1 h-[3px] rounded-full bg-gradient-to-r from-transparent via-[oklch(0.72_0.2_300)] to-transparent opacity-70 blur-[2px]"
              />
            </span>
          </h1>
          <p className="mt-2.5 max-w-[380px] text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
            Análisis en tiempo real de millones de conversaciones, noticias y
            señales para descubrir tendencias antes que nadie.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setHowOpen((v) => !v)}
              aria-expanded={howOpen}
              aria-controls="how-it-works-steps"
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-white/[0.06] px-4 py-2 text-[13px] font-medium text-foreground backdrop-blur-sm transition-all hover:bg-white/[0.11] hover:shadow-[0_0_24px_-8px_var(--primary)]"
            >
              Cómo funciona
              {howOpen ? (
                <X className="size-3.5" strokeWidth={2.4} />
              ) : (
                <Play className="size-3 fill-current" />
              )}
            </button>

            {howOpen && (
              <ol
                id="how-it-works-steps"
                className="flex w-full animate-in flex-col gap-2 fade-in slide-in-from-top-2 duration-400"
              >
                {steps.map((s, i) => (
                  <li
                    key={s}
                    className="flex items-start gap-3 text-[12.5px] text-muted-foreground"
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-[10px] font-bold text-primary tabular-nums">
                      {i + 1}
                    </span>
                    <span className="text-pretty">{s}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* ── Right: prominent stats ──
            Numbers are the focal point of an operational dashboard, so they
            get the visual weight (bigger type, accent tiles, hover lift). */}
        <div className="lg:w-[320px] lg:shrink-0">
          <div className="mb-2.5 flex items-center gap-2">
            <p className="text-[10.5px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              Hoy en Virahub
            </p>
            <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
          </div>
          <ul className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-2.5">
            {stats.map(({ value, label, Icon, color, glow, screen, hint }) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => setScreen(screen)}
                  aria-label={`Ir a ${hint}: ${label}. Valor actual: ${value}.`}
                  title={`Ver ${label.toLowerCase()} en ${hint}`}
                  className="group/stat relative flex h-full w-full cursor-pointer flex-col gap-2 rounded-xl border border-border/60 bg-white/[0.02] p-2.5 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:bg-white/[0.05] lg:flex-row lg:items-center lg:gap-3 lg:p-3"
                >
                  {/* Always-visible arrow indicator — makes the card's
                      clickability explicit on every breakpoint (VLM issue
                      #6). Dim at rest, brightens + nudges on hover. */}
                  <ChevronRight
                    className="absolute right-2 top-2 size-3.5 text-muted-foreground opacity-40 transition-all duration-300 group-hover/stat:translate-x-0.5 group-hover/stat:opacity-100 group-hover/stat:text-foreground lg:right-3 lg:top-3"
                    strokeWidth={2.4}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-white/[0.04] transition-all duration-300 lg:size-10',
                      glow,
                    )}
                  >
                    <Icon className={`size-4 ${color}`} strokeWidth={2.2} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 lg:pr-5">
                    <CountUp
                      value={value}
                      className="text-xl leading-none font-semibold tabular-nums text-foreground transition-transform duration-300 group-hover/stat:scale-105 sm:text-2xl lg:text-[2rem]"
                    />
                    <span className="truncate text-[10px] leading-tight text-muted-foreground transition-colors group-hover/stat:text-foreground lg:text-[11px]">
                      {label}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
