'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Cpu, Database, Sparkles } from 'lucide-react'
import { SourceTile } from '@/components/source-icon'
import { useVirahub } from '@/components/virahub-provider'
import { ENGINES, type SourceKey } from '@/lib/virahub-data'
import { cn } from '@/lib/utils'

export function LiveScan() {
  const { live, step, notify, analyzed } = useVirahub()
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (!live) return
    const id = setInterval(() => setPhase((p) => p + 1), 2400)
    return () => clearInterval(id)
  }, [live])

  return (
    <section
      aria-label="Pipeline de captura y procesamiento en vivo"
      className="relative overflow-hidden rounded-2xl border border-border bg-card"
    >
      {/* top header band */}
      <header className="relative flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-lg border',
              live
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-white/[0.03] text-muted-foreground',
            )}
          >
            <Cpu className="size-4" strokeWidth={2} />
          </span>
          <div className="flex flex-col">
            <p className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.16em] text-foreground uppercase">
              Pipeline en vivo
              {live && (
                <span
                  className="size-1.5 rounded-full bg-[var(--mint)]"
                  style={{ animation: 'vh-pulse 1.4s ease-in-out infinite' }}
                />
              )}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {live
                ? `${ENGINES.length} motores capturando señales en paralelo`
                : 'Captura pausada — reanuda desde la barra superior'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Database className="size-3.5 text-[var(--cool)]" strokeWidth={2} />
            <span className="tabular-nums text-foreground/85">
              {(Number.isFinite(analyzed) ? analyzed : 0).toLocaleString('es-ES')}
            </span>
            posts/historiados
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <Sparkles className="size-3.5 text-primary" strokeWidth={2} />
            deduplicación + scoring activo
          </span>
        </div>
      </header>

      {/* pipeline track */}
      <div className="relative px-4 py-6 sm:px-6">
        {/* flowing dashed line behind nodes (desktop only) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-6 top-1/2 hidden h-px -translate-y-1/2 lg:block"
          style={{
            background:
              'repeating-linear-gradient(to right, oklch(0.7 0.18 295 / 0.55) 0 8px, transparent 8px 16px)',
            backgroundSize: '16px 1px',
            animation: live ? 'vh-flow-bg 1.4s linear infinite' : undefined,
          }}
        />

        {/* Direction legend — makes the input → output flow explicit. */}
        <div className="mb-3 flex items-center justify-between text-[9.5px] font-semibold tracking-[0.2em] text-muted-foreground/70 uppercase">
          <span>Entrada · {ENGINES.length} motores</span>
          <span className="hidden sm:inline">
            Procesamiento · deduplicación + scoring
          </span>
          <span>Salida · Radar</span>
        </div>

        <ul
          className="relative flex items-stretch gap-2 overflow-x-auto pb-1 scrollbar-thin sm:gap-1 lg:gap-0 lg:overflow-visible"
          aria-label={`Flujo del pipeline: ${ENGINES.length} motores de entrada convergen en el nodo Radar de salida`}
        >
          {ENGINES.map(({ id, name, verbs }, i) => {
            const verb = live ? verbs[(phase + i) % verbs.length] : 'En pausa'
            const progress = live ? 18 + ((step * 17 + i * 29) % 80) : 4
            return (
              <li
                key={id}
                className="flex shrink-0 items-stretch gap-1 lg:gap-0"
              >
                <button
                  type="button"
                  onClick={() => notify(`${name}: ${progress}% del lote procesado`)}
                  aria-label={`Estado del motor ${name}: ${verb}, ${progress}% procesado`}
                  className={cn(
                    'group relative flex w-[140px] cursor-pointer flex-col gap-2.5 rounded-xl border bg-card/80 p-3 text-left backdrop-blur-sm transition-all duration-300 lg:w-[112px]',
                    live
                      ? 'border-border hover:border-primary/50 hover:bg-white/[0.04] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_var(--primary)]'
                      : 'border-border/60 opacity-70',
                  )}
                >
                  {/* node index badge */}
                  <span className="absolute -top-1.5 -left-1.5 flex size-4 items-center justify-center rounded-full border border-border bg-background text-[9px] font-bold text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>

                  <div className="flex items-center gap-2">
                    <SourceTile
                      source={id as SourceKey}
                      className={cn(
                        'size-7 shrink-0 transition-transform duration-300',
                        live && 'group-hover:scale-110',
                      )}
                    />
                    <span className="flex flex-col leading-tight">
                      <span className="truncate text-[12px] font-semibold">{name}</span>
                      <span
                        className={cn(
                          'flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase',
                          live ? 'text-[var(--mint)]' : 'text-muted-foreground',
                        )}
                      >
                        <span
                          className={cn(
                            'size-1 rounded-full',
                            live ? 'bg-[var(--mint)]' : 'bg-muted-foreground',
                          )}
                          style={
                            live
                              ? { animation: 'vh-pulse 1.4s ease-in-out infinite' }
                              : undefined
                          }
                        />
                        {live ? 'ON' : 'OFF'}
                      </span>
                    </span>
                  </div>

                  <span
                    key={`${id}-${verb}`}
                    className="animate-in fade-in slide-in-from-bottom-1 truncate text-[11px] text-muted-foreground duration-300"
                  >
                    {verb}
                  </span>

                  {/* progress bar */}
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                      <div
                        className={cn(
                          'block h-full rounded-full transition-[width] duration-1000 ease-out',
                          live
                            ? 'bg-gradient-to-r from-[oklch(0.6_0.22_295)] to-[oklch(0.72_0.18_300)]'
                            : 'bg-muted-foreground/40',
                        )}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="w-7 text-right text-[10px] font-semibold text-muted-foreground tabular-nums">
                      {progress}
                    </span>
                  </div>
                </button>

                {/* arrow between nodes */}
                {i < ENGINES.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex shrink-0 items-center justify-center self-center px-0.5 text-muted-foreground/50 transition-colors lg:px-0',
                      live && 'text-[oklch(0.72_0.18_300)]/70',
                    )}
                  >
                    <ArrowRight
                      className="size-3.5 lg:my-0 lg:-mx-1"
                      strokeWidth={2.2}
                      style={
                        live
                          ? {
                              animation: `vh-nudge 2.4s ease-in-out ${i * 0.18}s infinite`,
                            }
                          : undefined
                      }
                    />
                  </span>
                )}
              </li>
            )
          })}

          {/* output node */}
          <li className="flex shrink-0 items-center pl-1 lg:pl-2">
            <div className="flex w-[120px] flex-col items-center gap-1.5 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-3 text-center lg:w-[112px]">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Sparkles className="size-4" strokeWidth={2.2} />
              </span>
              <span className="text-[11.5px] font-semibold text-primary">Radar</span>
              <span className="text-[10px] text-muted-foreground">señales listas</span>
            </div>
          </li>
        </ul>
      </div>
    </section>
  )
}
