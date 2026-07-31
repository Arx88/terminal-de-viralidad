'use client'

import { useMemo, useRef, useState } from 'react'
import { Eye, EyeOff, MoveHorizontal } from 'lucide-react'
import { useVirahub } from '@/components/virahub-provider'
import { SourceGlyph } from '@/components/source-icon'
import {
  RANGES,
  RANGE_CONFIG,
  buildSeries,
  smoothPath,
  type RangeKey,
} from '@/lib/virahub-data'
import { cn } from '@/lib/utils'

const X0 = 24
const X1 = 942
const LANE_H = 44
const LANE_GAP = 12
const AMP = 34

function laneCenter(i: number) {
  return LANE_H / 2 + i * (LANE_H + LANE_GAP)
}

function toMinutes(label: string) {
  const [h, m] = label.split(':').map(Number)
  return h * 60 + m
}

function fmt(min: number) {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`
}

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function hoverLabel(range: RangeKey, t: number, clock: string) {
  if (range === '7D') return DAYS[Math.min(6, Math.floor(t * 6.99))]
  const start = toMinutes(RANGE_CONFIG[range].labels[0])
  let end = toMinutes(clock)
  while (end <= start) end += 1440
  return fmt(start + t * (end - start))
}

export function TrendTimeline() {
  const {
    range,
    setRange,
    trends,
    selectedId,
    select,
    hiddenLanes,
    toggleLane,
    step,
    clock,
    live,
  } = useVirahub()

  const wrapRef = useRef<HTMLDivElement>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)

  const lanes = useMemo(() => trends.filter((t) => t.inTimeline), [trends])
  const labels = RANGE_CONFIG[range].labels

  const data = useMemo(
    () =>
      lanes.map((lane, i) => {
        const values = buildSeries(lane.id, lane.shape, range, step)
        const pts = values.map(
          (v, idx) =>
            [
              X0 + (idx / (values.length - 1)) * (X1 - X0),
              laneCenter(i) - (v - 0.5) * AMP,
            ] as [number, number],
        )
        return { lane, values, pts, d: smoothPath(pts) }
      }),
    [lanes, range, step],
  )

  const n = data[0]?.values.length ?? 2
  const hoverIndex =
    hoverX === null
      ? null
      : Math.max(
          0,
          Math.min(n - 1, Math.round(((hoverX - X0) / (X1 - X0)) * (n - 1))),
        )

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    setHoverX(((e.clientX - rect.left) / rect.width) * 1000)
  }

  return (
    <section className="rounded-2xl border border-border bg-card px-6 pt-5 pb-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Línea de tiempo de tendencias
        </h2>
        <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1 text-[12px] font-medium transition-all duration-200',
                range === r
                  ? 'bg-white/[0.09] text-foreground shadow-[inset_0_0_0_1px_var(--border)]'
                  : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between pr-1 text-[11px] text-muted-foreground tabular-nums">
        {labels.map((h) => (
          <span key={h} className="animate-in fade-in duration-500">
            {h}
          </span>
        ))}
        <span className="flex items-center gap-1.5 font-semibold tracking-wide text-foreground/90">
          {live && (
            <span
              className="size-1.5 rounded-full bg-primary"
              style={{ animation: 'vh-pulse 1.4s ease-in-out infinite' }}
            />
          )}
          AHORA
        </span>
      </div>

      <div
        ref={wrapRef}
        className="relative mt-3 h-[210px]"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverX(null)}
      >
        {/* lane rows */}
        <div className="absolute inset-x-0 top-0 flex flex-col" style={{ gap: LANE_GAP }}>
          {data.map(({ lane, values }, i) => {
            const hidden = hiddenLanes.includes(lane.id)
            const isSel = selectedId === lane.id
            const last = values[values.length - 1]
            return (
              <div
                key={lane.id}
                className={cn(
                  'group relative flex items-center rounded-lg transition-colors duration-300',
                  isSel ? 'bg-white/[0.05]' : 'bg-white/[0.025] hover:bg-white/[0.04]',
                  hidden && 'opacity-45',
                )}
                style={{ height: LANE_H }}
              >
                <span
                  className="absolute inset-y-0 left-0 w-[3px] rounded-l-lg transition-all duration-300"
                  style={{
                    background: lane.color,
                    opacity: hidden ? 0.3 : 0.95,
                    boxShadow: isSel ? `0 0 12px ${lane.color}` : 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => select(lane.id)}
                  aria-label={`Seleccionar ${lane.title}`}
                  aria-pressed={isSel}
                  className="flex cursor-pointer items-center gap-2 pl-4 text-left"
                >
                  <SourceGlyph source={lane.source} className="size-3.5" />
                  <span className="text-[13px] font-medium">{lane.title}</span>
                </button>

                <span className="ml-auto flex items-center gap-3 pr-3">
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    style={{ color: lane.color, background: 'oklch(1 0 0 / 6%)' }}
                  >
                    {Math.round(last * 120)}/h
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleLane(lane.id)}
                    title={hidden ? 'Mostrar serie' : 'Ocultar serie'}
                    aria-label={hidden ? `Mostrar serie ${lane.title}` : `Ocultar serie ${lane.title}`}
                    aria-pressed={!hidden}
                    className="cursor-pointer text-muted-foreground/60 transition-colors hover:text-foreground"
                  >
                    {hidden ? (
                      <EyeOff className="size-3.5" strokeWidth={1.8} />
                    ) : (
                      <Eye className="size-3.5" strokeWidth={1.8} />
                    )}
                    <span className="sr-only">
                      {hidden ? 'Mostrar serie' : 'Ocultar serie'}
                    </span>
                  </button>
                </span>
              </div>
            )
          })}
        </div>

        {/* chart overlay */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 1000 210"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id="vh-now"
              gradientUnits="userSpaceOnUse"
              x1="942"
              y1="0"
              x2="942"
              y2="210"
            >
              <stop offset="0%" stopColor="oklch(0.72 0.2 300)" stopOpacity="0.1" />
              <stop offset="45%" stopColor="oklch(0.65 0.24 295)" stopOpacity="1" />
              <stop offset="100%" stopColor="oklch(0.55 0.24 285)" stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="vh-sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="oklch(0.75 0.2 300)" stopOpacity="0" />
              <stop offset="50%" stopColor="oklch(0.75 0.2 300)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="oklch(0.75 0.2 300)" stopOpacity="0" />
            </linearGradient>
            <filter id="vh-glow" x="-40%" y="-60%" width="180%" height="220%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {live && (
            <rect
              x="0"
              y="0"
              width="120"
              height="210"
              fill="url(#vh-sweep)"
              style={{ animation: 'vh-sweep 6s linear infinite' }}
            />
          )}

          {data.map(({ lane, d, pts }) => {
            const hidden = hiddenLanes.includes(lane.id)
            const isSel = selectedId === lane.id
            return (
              <g
                key={lane.id}
                style={{
                  opacity: hidden ? 0.12 : isSel ? 1 : 0.6,
                  transition: 'opacity .35s ease',
                }}
              >
                <path
                  key={`${lane.id}-${range}`}
                  d={d}
                  fill="none"
                  stroke={lane.color}
                  strokeWidth={isSel ? 2.4 : 1.7}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  filter="url(#vh-glow)"
                  style={{
                    strokeDasharray: 3000,
                    animation: 'vh-draw 1s ease-out forwards',
                  }}
                />
                {!hidden &&
                  pts
                    .filter((_, i) => i % 6 === 3)
                    .map(([x, y]) => (
                      <circle
                        key={`${x.toFixed(0)}-${y.toFixed(0)}`}
                        cx={x}
                        cy={y}
                        r="3.4"
                        fill="var(--background)"
                        stroke={lane.color}
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
              </g>
            )
          })}

          {/* crosshair */}
          {hoverIndex !== null && (
            <line
              x1={data[0].pts[hoverIndex][0]}
              y1="0"
              x2={data[0].pts[hoverIndex][0]}
              y2="210"
              stroke="oklch(1 0 0 / 22%)"
              strokeWidth="1"
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {hoverIndex !== null &&
            data.map(({ lane, pts }) =>
              hiddenLanes.includes(lane.id) ? null : (
                <circle
                  key={`h-${lane.id}`}
                  cx={pts[hoverIndex][0]}
                  cy={pts[hoverIndex][1]}
                  r="5"
                  fill={lane.color}
                  filter="url(#vh-glow)"
                />
              ),
            )}

          <line
            x1="942"
            y1="4"
            x2="942"
            y2="206"
            stroke="url(#vh-now)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          {data.map(({ lane, pts }) =>
            hiddenLanes.includes(lane.id) ? null : (
              <g key={`now-${lane.id}`}>
                <circle
                  cx={942}
                  cy={pts[pts.length - 1][1]}
                  r="4.5"
                  fill={lane.color}
                  filter="url(#vh-glow)"
                />
                {live && (
                  <circle
                    cx={942}
                    cy={pts[pts.length - 1][1]}
                    r="4.5"
                    fill="none"
                    stroke={lane.color}
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                    style={{
                      animation: 'vh-ripple 2.2s ease-out infinite',
                      transformOrigin: `942px ${pts[pts.length - 1][1]}px`,
                    }}
                  />
                )}
              </g>
            ),
          )}
        </svg>

        {/* tooltip */}
        {hoverIndex !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-[176px] -translate-x-1/2 rounded-xl border border-border bg-popover/95 p-3 shadow-2xl backdrop-blur-sm"
            style={{
              left: `${Math.min(88, Math.max(12, (data[0].pts[hoverIndex][0] / 1000) * 100))}%`,
            }}
          >
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground tabular-nums">
              {hoverLabel(range, hoverIndex / (n - 1), clock)}
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {data.map(({ lane, values }) => (
                <li
                  key={`tt-${lane.id}`}
                  className={cn(
                    'flex items-center gap-2 text-[11.5px]',
                    hiddenLanes.includes(lane.id) && 'opacity-40',
                  )}
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: lane.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {lane.title}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {Math.round(values[hoverIndex] * 120)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p className="mt-4 flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
        <MoveHorizontal className="size-3.5" strokeWidth={1.8} />
        Desliza para explorar más en el tiempo
      </p>
    </section>
  )
}
