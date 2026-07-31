'use client'

import { useEffect, useRef, useState } from 'react'

export function useCountUp(target: number, duration = 700) {
  const safe = Number.isFinite(target) ? target : 0
  const [value, setValue] = useState(safe)
  const from = useRef(safe)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    const t = Number.isFinite(target) ? target : 0
    const start = performance.now()
    const initial = from.current
    const delta = t - initial
    if (delta === 0) return

    const loop = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(initial + delta * eased)
      if (p < 1) raf.current = requestAnimationFrame(loop)
      else from.current = t
    }
    raf.current = requestAnimationFrame(loop)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
      from.current = t
    }
  }, [target, duration])

  return value
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
  const safe = Number.isFinite(value as number) ? (value as number) : 0
  const animated = useCountUp(safe)
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
