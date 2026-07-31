'use client'

import { BellRing, Flame, Radio, TrendingUp } from 'lucide-react'
import { ScreenShell, Toggle } from '@/components/screens/screen-shell'
import { SourceTile } from '@/components/source-icon'
import { useVirahub } from '@/components/virahub-provider'
import { cn } from '@/lib/utils'

const feed = [
  {
    id: 'f1',
    time: '12:32',
    title: 'Regulación de IA en la UE superó 80 menciones/hora',
    tone: 'hot',
  },
  { id: 'f2', time: '12:19', title: 'Nueva API de Bluesky citada en 9 repos', tone: 'cool' },
  { id: 'f3', time: '11:54', title: 'Anomalía: pico de bots en r/technology', tone: 'hot' },
  { id: 'f4', time: '11:12', title: 'Cripto se recupera vuelve a umbral estable', tone: 'mint' },
]

export function AlertsScreen() {
  const { trends, alerts, toggleAlert, live } = useVirahub()

  return (
    <ScreenShell
      eyebrow="Alertas"
      title="Reglas y disparos recientes"
      description="Activa una regla por tendencia y recibe el aviso en el momento en que la aceleración cruza el umbral."
      actions={
        <span className="flex items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-[12.5px] text-muted-foreground">
          <Radio
            className={cn('size-3.5', live ? 'text-[var(--mint)]' : 'text-muted-foreground')}
            strokeWidth={2}
            style={live ? { animation: 'vh-pulse 1.6s ease-in-out infinite' } : undefined}
          />
          {alerts.length} reglas activas
        </span>
      }
    >
      <div className="grid gap-3 lg:grid-cols-[1.15fr_1fr]">
        <ul className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3">
          {trends.map((t) => {
            const on = alerts.includes(t.id)
            return (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.03]"
              >
                <SourceTile source={t.source} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{t.title}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    Umbral {t.confidence} · {on ? 'notificando' : 'sin regla'}
                  </span>
                </span>
                <Toggle
                  on={on}
                  onChange={() => toggleAlert(t.id)}
                  label={`Alerta para ${t.title}`}
                />
              </li>
            )
          })}
        </ul>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            <BellRing className="size-3.5" strokeWidth={2} />
            Disparos de hoy
          </h2>
          <ul className="mt-4 flex flex-col">
            {feed.map((f, i) => (
              <li key={f.id} className="relative flex gap-3 pb-5 pl-1 last:pb-0">
                {i < feed.length - 1 && (
                  <span className="absolute top-6 bottom-0 left-[13px] w-px bg-border" />
                )}
                <span
                  className={cn(
                    'z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border',
                    f.tone === 'hot'
                      ? 'border-[var(--hot)]/50 bg-[var(--hot)]/15 text-[var(--hot)]'
                      : f.tone === 'cool'
                        ? 'border-[var(--cool)]/50 bg-[var(--cool)]/15 text-[var(--cool)]'
                        : 'border-[var(--mint)]/50 bg-[var(--mint)]/15 text-[var(--mint)]',
                  )}
                >
                  {f.tone === 'hot' ? (
                    <Flame className="size-3" strokeWidth={2.2} />
                  ) : (
                    <TrendingUp className="size-3" strokeWidth={2.2} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-pretty">{f.title}</span>
                  <span className="mt-0.5 block text-[11.5px] text-muted-foreground tabular-nums">
                    {f.time}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ScreenShell>
  )
}
