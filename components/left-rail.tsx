'use client'

import Image from 'next/image'
import {
  Bell,
  Bookmark,
  Layers,
  ScrollText,
  Search,
  Settings,
  Target,
} from 'lucide-react'
import { useVirahub, type ScreenKey } from '@/components/virahub-provider'
import { cn } from '@/lib/utils'

const items: { id: ScreenKey; label: string; Icon: typeof Target }[] = [
  { id: 'radar', label: 'Radar', Icon: Target },
  { id: 'explorar', label: 'Explorar', Icon: Search },
  { id: 'alertas', label: 'Alertas', Icon: Bell },
  { id: 'guardados', label: 'Guardados', Icon: Bookmark },
  { id: 'motores', label: 'Motores', Icon: Layers },
  { id: 'informes', label: 'Informes', Icon: ScrollText },
  { id: 'ajustes', label: 'Ajustes', Icon: Settings },
]

export function LeftRail() {
  const { screen, setScreen, alerts, saved } = useVirahub()

  return (
    <nav
      aria-label="Navegación principal"
      className="sticky top-0 flex h-svh w-[72px] shrink-0 flex-col items-center overflow-y-auto pt-3 pb-5 self-start scrollbar-thin sm:w-[84px] sm:pt-4 sm:pb-6 lg:w-[92px]"
    >
      <ul className="flex w-full flex-col items-center gap-1">
        {items.map(({ id, label, Icon }) => {
          const isActive = screen === id
          const badge =
            id === 'alertas' ? alerts.length : id === 'guardados' ? saved.length : 0
          return (
            <li key={id} className="w-full">
              <button
                type="button"
                onClick={() => setScreen(id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-2xl px-2 py-3 transition-colors',
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'relative flex size-10 items-center justify-center rounded-2xl border transition-all duration-300 lg:size-11',
                    isActive
                      ? 'border-primary/50 bg-primary/15 shadow-[0_0_24px_-4px_var(--primary)]'
                      : 'border-transparent group-hover:-translate-y-0.5 group-hover:border-border group-hover:bg-white/[0.04]',
                  )}
                >
                  {/* Pulsing glow behind the active Radar icon — a gentle
                      heartbeat that signals “this is the live screen”
                      (VLM issue #4: missing micro-interaction). */}
                  {isActive && id === 'radar' && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-2xl bg-primary/25 blur-md"
                      style={{ animation: 'vh-radar-pulse 2s ease-in-out infinite' }}
                    />
                  )}
                  <Icon
                    className={cn(
                      'relative size-[18px] transition-transform duration-300 lg:size-5',
                      isActive && 'text-primary',
                      !isActive && 'group-hover:scale-110',
                    )}
                    strokeWidth={1.7}
                  />
                  {isActive && (
                    <>
                      <span className="absolute inset-0 rounded-2xl ring-1 ring-primary/30" />
                      <span
                        className="absolute inset-0 rounded-2xl ring-1 ring-primary/40"
                        style={{ animation: 'vh-ripple 2.6s ease-out infinite' }}
                      />
                    </>
                  )}
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-[var(--hot)] text-[9px] font-bold text-black tabular-nums">
                      {badge}
                    </span>
                  )}
                </span>
                <span className="text-[10px] leading-none font-medium lg:text-[11px]">
                  {label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-auto flex flex-col items-center gap-1.5 pt-8">
        <button
          type="button"
          aria-label="Abrir menú de cuenta"
          className="group relative cursor-pointer"
        >
          <Image
            src="/avatar.png"
            alt="Foto de perfil del usuario"
            width={40}
            height={40}
            className="size-10 rounded-full border border-border object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-[var(--mint)] ring-2 ring-background" />
        </button>
        <span className="text-[11px] text-muted-foreground">Cuenta</span>
      </div>
    </nav>
  )
}
