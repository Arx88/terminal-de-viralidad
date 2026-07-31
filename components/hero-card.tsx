'use client'

import { useState } from 'react'
import Image from 'next/image'
import { AlertTriangle, Play, TrendingUp, Waves, X } from 'lucide-react'
import { CountUp } from '@/components/count-up'
import { useVirahub } from '@/components/virahub-provider'

const stats = [
  {
    value: 3,
    label: 'Tendencias emergentes',
    Icon: TrendingUp,
    color: 'text-[var(--hot)]',
    screen: 'explorar' as const,
  },
  {
    value: 12,
    label: 'Señales débiles',
    Icon: Waves,
    color: 'text-[var(--cool)]',
    screen: 'explorar' as const,
  },
  {
    value: 2,
    label: 'Anomalías detectadas',
    Icon: AlertTriangle,
    color: 'text-[var(--hot)]',
    screen: 'alertas' as const,
  },
]

const steps = [
  'Recolectamos señales de 6 motores en paralelo, cada pocos segundos.',
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
      <div className="absolute inset-0 bg-gradient-to-t from-background/75 to-transparent" />
      {live && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-[oklch(0.75_0.2_300)]/8 to-transparent"
          style={{ animation: 'vh-sweep-x 9s linear infinite' }}
        />
      )}

      <div className="relative flex flex-col gap-10 px-8 py-12 lg:flex-row lg:items-center lg:gap-6 lg:px-12 lg:py-16">
        <div className="max-w-md">
          <h1 className="text-4xl leading-[1.1] font-bold tracking-tight text-balance lg:text-[2.7rem]">
            Detectamos lo
            <br />
            que está por{' '}
            <span className="bg-gradient-to-r from-[oklch(0.75_0.2_320)] to-[oklch(0.65_0.24_290)] bg-clip-text text-transparent">
              explotar.
            </span>
          </h1>
          <p className="mt-5 max-w-[350px] text-[15px] leading-relaxed text-muted-foreground text-pretty">
            Análisis en tiempo real de millones de conversaciones, noticias y señales para
            descubrir tendencias antes que nadie.
          </p>
          <button
            type="button"
            onClick={() => setHowOpen((v) => !v)}
            aria-expanded={howOpen}
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
            <ol className="mt-5 flex animate-in flex-col gap-2.5 fade-in slide-in-from-top-2 duration-400">
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

        <div className="lg:ml-auto lg:w-52">
          <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
            Hoy en Virahub
          </p>
          <div className="mt-3 h-px w-full bg-border" />
          <ul className="mt-4 flex flex-col gap-5">
            {stats.map(({ value, label, Icon, color, screen }) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => setScreen(screen)}
                  className="group/stat flex w-full cursor-pointer items-start gap-3 text-left"
                >
                  <CountUp
                    value={value}
                    className="w-9 shrink-0 text-right text-3xl font-semibold text-[var(--hot)] transition-transform duration-300 group-hover/stat:scale-110 tabular-nums"
                  />
                  <span className="flex flex-col gap-1 pt-1">
                    <Icon className={`size-3.5 ${color}`} strokeWidth={2} />
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
