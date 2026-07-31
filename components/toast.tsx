'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { useVirahub } from '@/components/virahub-provider'

/**
 * Global toast renderer.
 * Reads `toast` from the Virahub context and renders a single, non-blocking
 * notification anchored to the bottom-center of the viewport.
 *
 * Accessibility:
 *  - role="status" so screen readers announce the message
 *  - aria-live="polite" so updates don't interrupt the user
 *  - Esc dismisses; focus is not stolen (it's a passive notification)
 */
export function Toast() {
  const { toast, dismissToast } = useVirahub()
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Animate in when a new toast arrives, animate out before clearing.
  useEffect(() => {
    if (toast) {
      setMessage(toast)
      setVisible(true)
    } else {
      setVisible(false)
    }
  }, [toast])

  // Esc to dismiss
  useEffect(() => {
    if (!message) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dismissToast()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [message, dismissToast])

  if (!message) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
      aria-live="polite"
    >
      <div
        role="status"
        className={`pointer-events-auto flex max-w-sm items-center gap-3 rounded-xl border border-border bg-popover/95 px-4 py-3 shadow-2xl backdrop-blur-md transition-all duration-300 ${
          visible
            ? 'translate-y-0 opacity-100'
            : 'translate-y-3 opacity-0'
        }`}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--mint)]/15 text-[var(--mint)]">
          <CheckCircle2 className="size-4" strokeWidth={2.2} />
        </span>
        <p className="min-w-0 flex-1 text-[13px] font-medium text-foreground">
          {message}
        </p>
        <button
          type="button"
          onClick={dismissToast}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Cerrar notificación"
        >
          <X className="size-3.5" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  )
}
