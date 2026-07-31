'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * CountUp — animates from previous value to target.
 *
 * HARDENED (v2.0.2 — QA Cycle 3): handles null/undefined/NaN inputs at every
 * boundary. The previous version still crashed when `value` arrived as `null`
 * from a failed API call (the type says `number` but runtime can violate it).
 */
export function useCountUp(target: number, duration = 700): number {
  const safe = Number.isFinite(target) ? target : 0
  const [value, setValue] = useState<number>(safe)
  const from = useRef<number>(safe)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    const t = Number.isFinite(target) ? target : 0
    const start = performance.now()
    const initial = Number.isFinite(from.current) ? from.current : 0
    const delta = t - initial
    if (delta === 0) {
      setValue(t)
      return
    }

    const loop = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const next = initial + delta * eased
      // Hard NaN/Infinity guard on setValue
      setValue(Number.isFinite(next) ? next : t)
      if (p < 1) raf.current = requestAnimationFrame(loop)
      else from.current = t
    }
    raf.current = requestAnimationFrame(loop)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
      from.current = t
    }
  }, [target, duration])

  // Final guard: value must ALWAYS be a finite number
  return Number.isFinite(value) ? value : 0
}

export function CountUp({
  value,
  decimals = 0,
  className,
  prefix = '',
  suffix = '',
  locale,
}: {
  value: number | null | undefined
  decimals?: number
  className?: string
  prefix?: string
  suffix?: string
  locale?: string
}) {
  // Triple-guard: null → 0, undefined → 0, NaN → 0, Infinity → 0
  const safe = Number.isFinite(value as number) ? (value as number) : 0
  const animated = useCountUp(safe)
  // Final render guard
  const text = Number.isFinite(animated)
    ? locale
      ? Math.round(animated).toLocaleString(locale)
      : animated.toFixed(decimals)
    : '—'
  return (
    <span className={className}>
      {prefix}
      {text}
      {suffix}
    </span>
  )
}
