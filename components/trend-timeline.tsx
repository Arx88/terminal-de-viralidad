'use client'

import { Fragment, useMemo, useRef, useState } from 'react'
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

const CHART_W = 1000
const LANE_H = 54
const LINE_AMP = 18 // vertical half-amplitude within lane (line spans center ± LINE_AMP)

function lanePath(values: number[]) {
  const pts: [number, number][] = values.map((v, i) => {
    const x = (i / (values.length - 1)) * CHART_W
    const y = LANE_H / 2 - (v - 0.5) * LINE_AMP * 2
    return [x, y]
  })
  return smoothPath(pts, 0.5)
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

const GRID_cls =
  'grid grid-cols-[170px_1fr] gap-x-2 sm:grid-cols-[210px_1fr] sm:gap-x-3 lg:grid-cols-[250px_1fr] lg:gap-x-4'

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

  const chartRef = useRef<HTMLDivElement>(null)
  const [hoverRatio, setHoverRatio] = useState<number | null>(null)

  const lanes = useMemo(() => trends.filter((t) => t.inTimeline), [trends])
  const labels = RANGE_CONFIG[range].labels

  const data = useMemo(
    () =>
      lanes.map((lane) => {
        const values = buildSeries(lane.id, lane.shape, range, step)
        return { lane, values, d: lanePath(values) }
      }),
    [lanes, range, step],
  )

  const n = data[0]?.values.length ?? 2
  const hoverIndex =
    hoverRatio === null
      ? null
      : Math.max(0, Math.min(n - 1, Math.round(hoverRatio * (n - 1))))

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = chartRef.current?.getBoundingClientRect()
    if (!rect) return
    setHoverRatio(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)))
  }

  return (
    <section className="relative rounded-2xl border border-border bg-card px-4 pt-5 pb-4 sm:px-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Línea de tiempo de tendencias
          </h2>
          <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground tabular-nums">
            {lanes.length} activas
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={cn(
                'cursor-pointer rounded-md px-2.5 py-1 text-[12px] font-medium transition-all duration-200',
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

      {/* TIME AXIS ROW */}
      <div className={`mt-4 ${GRID_cls}`}>
        <div className="flex items-end justify-end pr-1 pb-1 text-[10px] tracking-wide text-muted-foreground/70 uppercase">
          timeline
        </div>
        <div
          ref={chartRef}
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverRatio(null)}
          className="relative"
        >
          <div className="flex items-center justify-between pr-1 text-[10.5px] text-muted-foreground tabular-nums">
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

          {/* TOOLTIP — anchored to chart column, just below time axis */}
          {hoverIndex !== null && (
            <div
              className="pointer-events-none absolute top-full left-0 z-20 mt-2 w-full"
              aria-hidden="true"
            >
              <div
                className="absolute w-[176px] rounded-xl border border-border bg-popover/95 p-3 shadow-2xl backdrop-blur-sm"
                style={{
                  left: `${hoverRatio! * 100}%`,
                  transform: `translateX(${
                    hoverRatio! > 0.85
                      ? '-90%'
                      : hoverRatio! < 0.15
                        ? '-10%'
                        : '-50%'
                  })`,
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
            </div>
          )}
        </div>
      </div>

      {/* LANES */}
      <div className={`mt-1 ${GRID_cls}`}>
        {data.map(({ lane, values, d }) => {
          const hidden = hiddenLanes.includes(lane.id)
          const isSel = selectedId === lane.id
          const last = values[values.length - 1]
          const delta = lane.delta
          const lastY = LANE_H / 2 - (last - 0.5) * LINE_AMP * 2
          return (
            <Fragment key={lane.id}>
              {/* LABEL CELL */}
              <div
                className={cn(
                  'group flex items-center gap-2 rounded-l-lg border-r border-border/40 px-2 transition-colors',
                  isSel ? 'bg-white/[0.05]' : 'bg-white/[0.02] hover:bg-white/[0.04]',
                  hidden && 'opacity-45',
                )}
                style={{ height: LANE_H }}
              >
                <span
                  className="h-7 w-[3px] shrink-0 rounded-full transition-all duration-300"
                  style={{
                    background: lane.color,
                    boxShadow: isSel ? `0 0 12px ${lane.color}` : 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => select(lane.id)}
                  aria-pressed={isSel}
                  aria-label={`Seleccionar ${lane.title}`}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
                >
                  <SourceGlyph source={lane.source} className="size-3.5 shrink-0" />
                  <span className="truncate text-[12.5px] font-medium">{lane.title}</span>
                </button>
                <span
                  className={cn(
                    'shrink-0 text-[11px] font-semibold tabular-nums',
                    delta > 0
                      ? 'text-[var(--hot)]'
                      : delta < 0
                        ? 'text-muted-foreground/80'
                        : 'text-muted-foreground',
                  )}
                >
                  {delta > 0 ? '+' : ''}
                  {delta}%
                </span>
                <button
                  type="button"
                  onClick={() => toggleLane(lane.id)}
                  aria-pressed={!hidden}
                  aria-label={
                    hidden ? `Mostrar serie ${lane.title}` : `Ocultar serie ${lane.title}`
                  }
                  className="cursor-pointer text-muted-foreground/60 transition-colors hover:text-foreground"
                >
                  {hidden ? (
                    <EyeOff className="size-3.5" strokeWidth={1.8} />
                  ) : (
                    <Eye className="size-3.5" strokeWidth={1.8} />
                  )}
                </button>
              </div>

              {/* CHART CELL */}
              <div
                className={cn(
                  'relative rounded-r-lg transition-colors',
                  isSel ? 'bg-white/[0.05]' : 'bg-white/[0.02] hover:bg-white/[0.04]',
                  hidden && 'opacity-45',
                )}
                style={{ height: LANE_H }}
                onMouseMove={handleMove}
                onMouseLeave={() => setHoverRatio(null)}
              >
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox={`0 0 ${CHART_W} ${LANE_H}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id={`fill-${lane.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={lane.color} stopOpacity="0.22" />
                      <stop offset="100%" stopColor={lane.color} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* fill area */}
                  <path
                    d={`${d} L ${CHART_W} ${LANE_H} L 0 ${LANE_H} Z`}
                    fill={`url(#fill-${lane.id})`}
                    style={{
                      opacity: hidden ? 0.06 : isSel ? 0.95 : 0.55,
                      transition: 'opacity .35s ease',
                    }}
                  />
                  {/* line */}
                  <path
                    key={`${lane.id}-${range}`}
                    d={d}
                    fill="none"
                    stroke={lane.color}
                    strokeWidth={isSel ? 2.4 : 1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    style={{
                      opacity: hidden ? 0.12 : 1,
                      strokeDasharray: 3000,
                      animation: 'vh-draw 1s ease-out forwards',
                      transition: 'opacity .35s ease',
                    }}
                  />
                  {/* hover crosshair + dot inside this lane */}
                  {hoverIndex !== null && !hidden && (
                    <>
                      <line
                        x1={(hoverIndex / (n - 1)) * CHART_W}
                        y1={0}
                        x2={(hoverIndex / (n - 1)) * CHART_W}
                        y2={LANE_H}
                        stroke="oklch(1 0 0 / 22%)"
                        strokeWidth="1"
                        strokeDasharray="3 4"
                        vectorEffect="non-scaling-stroke"
                      />
                      <circle
                        cx={(hoverIndex / (n - 1)) * CHART_W}
                        cy={LANE_H / 2 - (values[hoverIndex] - 0.5) * LINE_AMP * 2}
                        r="4"
                        fill={lane.color}
                        stroke="var(--background)"
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                      />
                    </>
                  )}
                  {/* NOW marker */}
                  <line
                    x1={CHART_W}
                    y1={6}
                    x2={CHART_W}
                    y2={LANE_H - 6}
                    stroke={lane.color}
                    strokeWidth="1.5"
                    strokeOpacity="0.55"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={CHART_W}
                    cy={lastY}
                    r="4"
                    fill={lane.color}
                    stroke="var(--background)"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                  {live && !hidden && (
                    <circle
                      cx={CHART_W}
                      cy={lastY}
                      r="4"
                      fill="none"
                      stroke={lane.color}
                      strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke"
                      style={{
                        animation: 'vh-ripple 2.2s ease-out infinite',
                        transformOrigin: `${CHART_W}px ${lastY}px`,
                      }}
                    />
                  )}
                </svg>
              </div>
            </Fragment>
          )
        })}
      </div>

      <p className="mt-4 flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
        <MoveHorizontal className="size-3.5" strokeWidth={1.8} />
        Desliza para explorar más en el tiempo
      </p>
    </section>
  )
}
