'use client'

import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { SourceTile } from '@/components/source-icon'
import { useVirahub } from '@/components/virahub-provider'
import { ENGINES, type SourceKey } from '@/lib/virahub-data'
import { cn } from '@/lib/utils'

function Ribbon({ live }: { live: boolean }) {
  return (
    <svg
      className="absolute inset-x-0 bottom-0 h-24 w-full"
      viewBox="0 0 1000 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="vh-ribbon-a" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="oklch(0.6 0.22 320)" stopOpacity="0.1" />
          <stop offset="35%" stopColor="oklch(0.7 0.2 300)" stopOpacity="0.75" />
          <stop offset="70%" stopColor="oklch(0.6 0.22 265)" stopOpacity="0.7" />
          <stop offset="100%" stopColor="oklch(0.55 0.2 280)" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="vh-ribbon-b" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="oklch(0.5 0.2 290)" stopOpacity="0.05" />
          <stop offset="50%" stopColor="oklch(0.65 0.22 275)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="oklch(0.6 0.2 320)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path
          key={i}
          d={`M0 ${58 + i * 5} C 120 ${30 + i * 6}, 220 ${86 - i * 3}, 340 ${62 + i * 4} S 560 ${28 + i * 5}, 700 ${64 + i * 3} S 880 ${92 - i * 4}, 1000 ${52 + i * 5}`}
          fill="none"
          stroke={i % 2 === 0 ? 'url(#vh-ribbon-a)' : 'url(#vh-ribbon-b)'}
          strokeWidth={i % 2 === 0 ? 1.4 : 0.9}
          style={{
            strokeDasharray: '160 40',
            animation: live ? `vh-flow ${7 + i * 1.3}s linear infinite` : undefined,
          }}
        />
      ))}
      {[
        [180, 62],
        [330, 70],
        [470, 52],
        [610, 66],
        [760, 74],
        [890, 60],
      ].map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r="1.8"
          fill="oklch(0.9 0.1 300)"
          opacity="0.9"
          style={{
            animation: live
              ? `vh-float ${3 + i * 0.6}s ease-in-out ${i * 0.35}s infinite`
              : undefined,
          }}
        />
      ))}
    </svg>
  )
}

export function LiveScan() {
  const { live, step, notify } = useVirahub()
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (!live) return
    const id = setInterval(() => setPhase((p) => p + 1), 2400)
    return () => clearInterval(id)
  }, [live])

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-[oklch(0.2_0.06_290)]/40" />
      <Ribbon live={live} />

      <div className="relative px-6 pt-5 pb-16">
        <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-[oklch(0.72_0.16_300)] uppercase">
          Escaneo en vivo
          {live && (
            <span
              className="size-1.5 rounded-full bg-[oklch(0.72_0.16_300)]"
              style={{ animation: 'vh-pulse 1.4s ease-in-out infinite' }}
            />
          )}
        </p>
        <ul className="mt-4 flex items-center gap-1 overflow-x-auto scrollbar-thin pb-1">
          {ENGINES.map(({ id, name, verbs }, i) => {
            const verb = live ? verbs[(phase + i) % verbs.length] : 'En pausa'
            const progress = live ? 20 + ((step * 17 + i * 29) % 80) : 4
            return (
              <li key={id} className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => notify(`${name}: ${progress}% del lote procesado`)}
                  aria-label={`Estado del motor ${name}: ${verb}, ${progress}% procesado`}
                  className="group flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 pr-2 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <SourceTile
                    source={id as SourceKey}
                    className={cn(
                      'transition-transform duration-300 group-hover:scale-105',
                      live && 'shadow-[0_0_0_0_oklch(0.72_0.16_300/40%)]',
                    )}
                  />
                  <span className="flex w-[84px] flex-col gap-1 leading-tight">
                    <span className="truncate text-[13px] font-semibold">{name}</span>
                    <span
                      key={verb}
                      className="animate-in fade-in slide-in-from-bottom-1 text-[11px] text-muted-foreground duration-300"
                    >
                      {verb}
                    </span>
                    <span className="h-[2px] w-full overflow-hidden rounded-full bg-white/[0.08]">
                      <span
                        className="block h-full rounded-full bg-[oklch(0.72_0.18_300)] transition-[width] duration-1000 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </span>
                  </span>
                </button>
                {i < ENGINES.length - 1 && (
                  <ArrowRight
                    className={cn(
                      'mx-1.5 size-3.5 shrink-0 text-muted-foreground/50',
                      live && 'text-muted-foreground/70',
                    )}
                    strokeWidth={2}
                    style={
                      live
                        ? { animation: `vh-nudge 2.4s ease-in-out ${i * 0.2}s infinite` }
                        : undefined
                    }
                  />
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
