'use client'

import { useEffect, useRef, useState } from 'react'

export function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(target)
  const from = useRef(target)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    const start = performance.now()
    const initial = from.current
    const delta = target - initial
    if (delta === 0) return

    const loop = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(initial + delta * eased)
      if (t < 1) raf.current = requestAnimationFrame(loop)
      else from.current = target
    }
    raf.current = requestAnimationFrame(loop)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
      from.current = target
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
  value: number
  decimals?: number
  className?: string
  prefix?: string
  suffix?: string
  locale?: string
}) {
  const animated = useCountUp(value)
  const text = locale
    ? Math.round(animated).toLocaleString(locale)
    : animated.toFixed(decimals)
  return (
    <span className={className}>
      {prefix}
      {text}
      {suffix}
    </span>
  )
}
