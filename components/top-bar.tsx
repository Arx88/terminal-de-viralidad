'use client'

import { useState } from 'react'
import { BellRing, Pause, Play, SlidersHorizontal } from 'lucide-react'
import { CountUp } from '@/components/count-up'
import { SourceTile } from '@/components/source-icon'
import { useVirahub } from '@/components/virahub-provider'
import { ENGINES, type SourceKey } from '@/lib/virahub-data'
import { cn } from '@/lib/utils'

const bars = Array.from({ length: 64 }, (_, i) => i)

function Waveform({ live }: { live: boolean }) {
  return (
    <div className="hidden h-6 items-end gap-[3px] md:flex" aria-hidden="true">
      {bars.map((i) => {
        const h = 6 + Math.abs(Math.sin(i * 0.7)) * 14 + (i % 5) * 1.5
        return (
          <span
            key={i}
            className="w-[2px] shrink-0 rounded-full bg-[var(--cool)]/70 transition-all duration-500"
            style={{
              height: live ? `${h}px` : '3px',
              animation: live
                ? `vh-bars ${1.1 + (i % 7) * 0.14}s ease-in-out ${i * 0.03}s infinite`
                : undefined,
            }}
          />
        )
      })}
    </div>
  )
}

export function TopBar() {
  const { live, setLive, analyzed, latency, alerts, setScreen, screen, notify } =
    useVirahub()
  const [focused, setFocused] = useState<SourceKey>('reddit')

  return (
    <header className="flex flex-wrap items-center gap-x-8 gap-y-4 px-6 py-4">
      <button
        type="button"
        onClick={() => setScreen('radar')}
        className="flex cursor-pointer items-center gap-2.5"
      >
        <span className="relative flex size-8 items-center justify-center">
          <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
            <defs>
              <linearGradient id="vh-logo" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="oklch(0.72 0.2 300)" />
                <stop offset="100%" stopColor="oklch(0.55 0.24 275)" />
              </linearGradient>
            </defs>
            <path
              d="M4 5h24L16 28 4 5Z"
              fill="none"
              stroke="url(#vh-logo)"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <path
              d="M11 11h10l-5 9-5-9Z"
              fill="url(#vh-logo)"
              opacity="0.9"
              style={live ? { animation: 'vh-flicker 3s ease-in-out infinite' } : undefined}
            />
          </svg>
        </span>
        <span className="text-lg font-bold tracking-[0.14em] text-foreground">
          VIRAHUB
        </span>
      </button>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] tracking-wide text-muted-foreground">
          Estado del sistema
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLive(!live)}
            title={live ? 'Pausar escaneo' : 'Reanudar escaneo'}
            className="group flex cursor-pointer items-center gap-2"
          >
            <span
              className={cn(
                'size-2 rounded-full',
                live ? 'bg-primary' : 'bg-muted-foreground',
              )}
              style={live ? { animation: 'vh-pulse 1.6s ease-in-out infinite' } : undefined}
            />
            <span
              className={cn(
                'text-sm font-semibold tracking-[0.12em]',
                live ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {live ? 'ESCANEANDO' : 'EN PAUSA'}
            </span>
            <span className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
              {live ? (
                <Pause className="size-3.5" strokeWidth={2} />
              ) : (
                <Play className="size-3.5" strokeWidth={2} />
              )}
            </span>
          </button>
          <Waveform live={live} />
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
          <span>
            <span className="text-foreground/85">6 motores</span> activos
          </span>
          <span className="text-muted-foreground/40">•</span>
          <span>
            <CountUp value={analyzed} locale="es-ES" className="text-foreground/85 tabular-nums" />{' '}
            publicaciones analizadas
          </span>
          <span className="text-muted-foreground/40">•</span>
          <span>
            latencia{' '}
            <CountUp
              value={latency}
              decimals={1}
              suffix="s"
              className="text-foreground/85 tabular-nums"
            />
          </span>
        </p>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <ul className="flex items-center gap-2.5">
          {ENGINES.map(({ id, name }) => (
            <li key={id}>
              <button
                type="button"
                title={name}
                onClick={() => {
                  setFocused(id as SourceKey)
                  notify(`Foco en ${name}`)
                }}
                className={cn(
                  'cursor-pointer rounded-full transition-transform duration-200 hover:scale-110',
                  focused === id &&
                    'ring-2 ring-primary/80 ring-offset-3 ring-offset-background',
                )}
              >
                <SourceTile source={id as SourceKey} className="size-9 rounded-full" />
                <span className="sr-only">{name}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1 rounded-full border border-border bg-white/[0.03] p-1 pl-3">
          <SlidersHorizontal className="size-4 text-muted-foreground" strokeWidth={1.8} />
          <button
            type="button"
            onClick={() => setScreen('motores')}
            className={cn(
              'cursor-pointer px-2 text-[13px] font-medium transition-colors',
              screen === 'motores' ? 'text-primary' : 'text-foreground/90 hover:text-primary',
            )}
          >
            Gestión de motores
          </button>
          <span className="mx-1 h-5 w-px bg-border" />
          <button
            type="button"
            onClick={() => setScreen('alertas')}
            className="relative flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          >
            <BellRing className="size-4" strokeWidth={1.8} />
            {alerts.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-[var(--hot)] text-[9px] font-bold text-black tabular-nums">
                {alerts.length}
              </span>
            )}
            <span className="sr-only">Notificaciones</span>
          </button>
        </div>
      </div>
    </header>
  )
}
