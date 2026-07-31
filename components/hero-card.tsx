'use client'

import { useState } from 'react'
import Image from 'next/image'
import { AlertTriangle, Play, Radio, TrendingUp, Waves, X } from 'lucide-react'
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
  },
  {
    value: 12,
    label: 'Señales débiles',
    Icon: Waves,
    color: 'text-[var(--cool)]',
    glow: 'group-hover/stat:shadow-[0_0_24px_-6px_var(--cool)]',
    screen: 'explorar' as const,
  },
  {
    value: 2,
    label: 'Anomalías detectadas',
    Icon: AlertTriangle,
    color: 'text-[var(--hot)]',
    glow: 'group-hover/stat:shadow-[0_0_24px_-6px_var(--hot)]',
    screen: 'alertas' as const,
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
    <section className="group relative overflow-hidden rounded-2xl border border-border bg-card">
      <Image
        src="/hero-planet.png"
        alt=""
        fill
        priority
        sizes="(max-width: 1024px) 100vw, 70vw"
        className="scale-105 object-cover object-[center_26%] transition-transform duration-[3000ms] ease-out group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-background from-5% via-background/75 via-45% to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/20 to-transparent" />
      {live && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-[oklch(0.75_0.2_300)]/10 to-transparent"
          style={{ animation: 'vh-sweep-x 9s linear infinite' }}
        />
      )}

      <div className="relative flex flex-col gap-10 px-8 py-12 lg:flex-row lg:items-center lg:gap-6 lg:px-12 lg:py-16">
        <div className="max-w-md">
          {/* EN VIVO badge */}
          <div className="mb-5 flex items-center gap-2.5">
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.16em] uppercase backdrop-blur-sm transition-colors',
                live
                  ? 'border-[var(--hot)]/40 bg-[var(--hot)]/10 text-[var(--hot)]'
                  : 'border-border bg-white/[0.04] text-muted-foreground',
              )}
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur-sm">
              <Radio className="size-3 text-primary" strokeWidth={2.2} />
              {ENGINES.length} motores activos
            </span>
          </div>

          <h1 className="text-4xl leading-[1.05] font-bold tracking-tight text-balance lg:text-[2.85rem]">
            Detectamos lo
            <br />
            que está por{' '}
            <span className="relative bg-gradient-to-r from-[oklch(0.78_0.22_320)] via-[oklch(0.72_0.2_300)] to-[oklch(0.65_0.24_290)] bg-clip-text text-transparent">
              explotar.
              <span
                aria-hidden="true"
                className="absolute -inset-x-2 -bottom-1 h-[3px] rounded-full bg-gradient-to-r from-transparent via-[oklch(0.72_0.2_300)] to-transparent opacity-70 blur-[2px]"
              />
            </span>
          </h1>
          <p className="mt-5 max-w-[360px] text-[15px] leading-relaxed text-muted-foreground text-pretty">
            Análisis en tiempo real de millones de conversaciones, noticias y señales para
            descubrir tendencias antes que nadie.
          </p>
          <button
            type="button"
            onClick={() => setHowOpen((v) => !v)}
            aria-expanded={howOpen}
            aria-controls="how-it-works-steps"
            className="mt-8 flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-white/[0.06] px-5 py-3 text-sm font-medium text-foreground backdrop-blur-sm transition-all hover:bg-white/[0.11] hover:shadow-[0_0_24px_-8px_var(--primary)]"
          >
            Cómo funciona
            {howOpen ? (
              <X className="size-3.5" strokeWidth={2.4} />
            ) : (
              <Play className="size-3.5 fill-current transition-transform group-hover:translate-x-0.5" />
            )}
          </button>

          {howOpen && (
            <ol
              id="how-it-works-steps"
              className="mt-5 flex animate-in flex-col gap-2.5 fade-in slide-in-from-top-2 duration-400"
            >
              {steps.map((s, i) => (
                <li key={s} className="flex items-start gap-3 text-[13px] text-muted-foreground">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-[10px] font-bold text-primary tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-pretty">{s}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="lg:ml-auto lg:w-60">
          <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
            Hoy en Virahub
          </p>
          <div className="mt-3 h-px w-full bg-gradient-to-r from-border via-border/60 to-transparent" />
          <ul className="mt-5 flex flex-col gap-4">
            {stats.map(({ value, label, Icon, color, glow, screen }) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => setScreen(screen)}
                  aria-label={`Ir a ${screen === 'alertas' ? 'alertas' : 'explorar'}: ${label}`}
                  className="group/stat flex w-full cursor-pointer items-center gap-4 rounded-xl border border-transparent p-2 text-left transition-all hover:border-border hover:bg-white/[0.03]"
                >
                  <span
                    className={cn(
                      'flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-white/[0.03] transition-all duration-300',
                      glow,
                    )}
                  >
                    <Icon className={`size-4 ${color}`} strokeWidth={2.2} />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <CountUp
                      value={value}
                      className="text-3xl leading-none font-semibold text-foreground transition-transform duration-300 group-hover/stat:scale-110 tabular-nums"
                    />
                    <span className="text-[11px] leading-tight text-muted-foreground transition-colors group-hover/stat:text-foreground">
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
