'use client'

import type { ReactNode } from 'react'
import { buildSeries, smoothPath, type Trend } from '@/lib/virahub-data'

export function ScreenShell({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex animate-in flex-col gap-4 fade-in slide-in-from-bottom-2 duration-400">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-border bg-card px-6 py-5">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[oklch(0.72_0.16_300)] uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground text-pretty">
            {description}
          </p>
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}

export function MiniSpark({
  trend,
  step,
  className = 'h-10 w-full',
}: {
  trend: Trend
  step: number
  className?: string
}) {
  const values = buildSeries(trend.id, trend.shape, '6H', step)
  const pts = values.map(
    (v, i) => [(i / (values.length - 1)) * 120, 34 - v * 30] as [number, number],
  )
  const d = smoothPath(pts)
  return (
    <svg viewBox="0 0 120 40" className={className} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d} L 120 40 L 0 40 Z`} fill={trend.color} opacity="0.14" />
      <path
        d={d}
        fill="none"
        stroke={trend.color}
        strokeWidth="1.6"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        style={{ strokeDasharray: 600, animation: 'vh-draw .9s ease-out forwards' }}
      />
    </svg>
  )
}

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-300 ${
        on ? 'bg-primary' : 'bg-white/[0.12]'
      }`}
    >
      <span className="sr-only">{label}</span>
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-all duration-300 ${
          on ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}
