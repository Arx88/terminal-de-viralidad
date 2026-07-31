'use client'

import { useEffect, useRef, useState } from 'react'
import { BellRing, ChevronDown, Pause, Play, SlidersHorizontal } from 'lucide-react'
import { CountUp } from '@/components/count-up'
import { SourceTile } from '@/components/source-icon'
import { useVirahub } from '@/components/virahub-provider'
import { ENGINES, type SourceKey } from '@/lib/virahub-data'
import { cn } from '@/lib/utils'

const bars = Array.from({ length: 64 }, (_, i) => i)

/**
 * Waveform tied to system state — not decorative.
 *  · live + low latency  → mint, fast cadence  (healthy)
 *  · live + high latency → hot,  slow cadence  (stressed)
 *  · paused              → muted, flat line    (idle)
 * Exposes a role="img" + aria-label so screen readers announce state.
 */
function Waveform({ live, latency }: { live: boolean; latency: number }) {
  // Hard null/NaN guard — agent-browser cycle 2 found crashes when latency was null
  const safeLatency = Number.isFinite(latency) ? latency : 0
  const stressed = live && safeLatency > 1.5
  const barColor = !live
    ? 'bg-muted-foreground/50'
    : stressed
      ? 'bg-[var(--hot)]/80'
      : 'bg-[var(--mint)]/80'
  const label = !live
    ? 'Forma de onda del sistema: en pausa, sin captura de señales.'
    : stressed
      ? `Forma de onda del sistema: activa, latencia elevada (${safeLatency.toFixed(1)}s).`
      : `Forma de onda del sistema: activa, latencia nominal (${safeLatency.toFixed(1)}s).`

  return (
    <div
      className="hidden h-6 items-end gap-[3px] md:flex"
      role="img"
      aria-label={label}
      title={label}
    >
      {bars.map((i) => {
        const h = 6 + Math.abs(Math.sin(i * 0.7)) * 14 + (i % 5) * 1.5
        return (
          <span
            key={i}
            className={cn(
              'w-[2px] shrink-0 rounded-full transition-colors duration-500',
              barColor,
            )}
            style={{
              height: live ? `${h}px` : '3px',
              animation: live
                ? `vh-bars ${stressed ? 1.7 + (i % 7) * 0.16 : 1.1 + (i % 7) * 0.14}s ease-in-out ${i * 0.03}s infinite`
                : undefined,
            }}
          />
        )
      })}
    </div>
  )
}

/**
 * Engine focus dropdown — collapses the previous row of 7 inline
 * social/engine icons into a compact avatar-stack trigger with a popover
 * menu (VLM issue #1: "top bar doing too much"). Preserves the focus
 * toggle + toast notify behaviour, and is fully keyboard accessible
 * (Escape + click-outside to close, aria-haspopup/menu/itemradio).
 */
function EngineFocusMenu({
  focused,
  setFocused,
  notify,
}: {
  focused: SourceKey
  setFocused: (s: SourceKey) => void
  notify: (m: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const focusedEngine = ENGINES.find((e) => e.id === focused) ?? ENGINES[0]
  const preview = ENGINES.slice(0, 3)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Foco de motores. Seleccionado: ${focusedEngine.name}. Abrir menú con ${ENGINES.length} motores disponibles.`}
        title={`Foco de motores — ${focusedEngine.name}`}
        className={cn(
          'group/eng flex cursor-pointer items-center gap-2 rounded-full border border-border bg-white/[0.03] py-1 pr-2.5 pl-1 transition-all duration-200 hover:border-border hover:bg-white/[0.06]',
          open && 'border-border bg-white/[0.06]',
        )}
      >
        {/* avatar pile — first 3 engines overlapping */}
        <span className="flex -space-x-2">
          {preview.map((e, i) => (
            <span
              key={e.id}
              className="rounded-full ring-2 ring-background"
              style={{ zIndex: preview.length - i }}
            >
              <SourceTile source={e.id as SourceKey} className="size-7 rounded-full" />
            </span>
          ))}
        </span>
        <span className="flex flex-col items-start leading-none">
          <span className="text-[10px] text-muted-foreground">Foco</span>
          <span className="text-[12px] font-medium text-foreground">
            {focusedEngine.name}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'size-3.5 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Seleccionar motor para enfocar"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 animate-in fade-in slide-in-from-top-1 rounded-xl border border-border bg-popover p-1.5 shadow-xl duration-200"
        >
          <p className="px-2.5 py-1.5 text-[10.5px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Enfocar motor
          </p>
          <ul className="flex flex-col gap-0.5">
            {ENGINES.map(({ id, name }) => {
              const isFocused = focused === id
              return (
                <li key={id}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isFocused}
                    aria-label={`Enfocar motor ${name}${isFocused ? ' (seleccionado)' : ''}`}
                    onClick={() => {
                      setFocused(id as SourceKey)
                      notify(`Foco en ${name}`)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                      isFocused ? 'bg-primary/15' : 'hover:bg-white/[0.05]',
                    )}
                  >
                    <SourceTile source={id as SourceKey} className="size-7 rounded-full" />
                    <span
                      className={cn(
                        'flex-1 text-[13px] font-medium',
                        isFocused ? 'text-foreground' : 'text-foreground/90',
                      )}
                    >
                      {name}
                    </span>
                    {isFocused && <span className="text-[13px] text-primary">✓</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export function TopBar() {
  const { live, setLive, analyzed, latency, alerts, setScreen, screen, notify } =
    useVirahub()
  const [focused, setFocused] = useState<SourceKey>('reddit')

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:gap-x-8 sm:gap-y-4 sm:px-6 sm:py-4">
      <button
        type="button"
        onClick={() => setScreen('radar')}
        aria-label="Volver al radar — inicio VIRAHUB"
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
            aria-label={live ? 'Pausar escaneo en vivo' : 'Reanudar escaneo en vivo'}
            aria-pressed={live}
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
          <Waveform live={live} latency={latency} />
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
          <span>
            <span className="text-foreground/90">{ENGINES.length} motores</span> activos
          </span>
          {/* Bumped /40 → /70 (VLM issue #3: secondary text too dim) */}
          <span className="text-muted-foreground/70">•</span>
          <span>
            <CountUp
              value={analyzed}
              locale="es-ES"
              className="text-foreground/90 tabular-nums"
            />{' '}
            publicaciones analizadas
          </span>
          <span className="text-muted-foreground/70">•</span>
          <span>
            latencia{' '}
            <CountUp
              value={latency}
              decimals={1}
              suffix="s"
              className={cn(
                'tabular-nums',
                latency > 1.5 ? 'text-[var(--hot)]' : 'text-foreground/90',
              )}
            />
          </span>
        </p>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Social / engine focus — collapsed into a dropdown (VLM issue #1). */}
        <EngineFocusMenu
          focused={focused}
          setFocused={setFocused}
          notify={notify}
        />

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
            title={`Notificaciones${alerts.length > 0 ? `, ${alerts.length} sin revisar` : ''}`}
            aria-label={`Notificaciones${alerts.length > 0 ? `, ${alerts.length} sin revisar` : ''}`}
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
