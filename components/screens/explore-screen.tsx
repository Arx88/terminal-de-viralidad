'use client'

import { useMemo, useState } from 'react'
import { ArrowUpRight, Bookmark, BookmarkCheck, Search, SlidersHorizontal } from 'lucide-react'
import { MiniSpark, ScreenShell } from '@/components/screens/screen-shell'
import { SourceTile } from '@/components/source-icon'
import { useVirahub } from '@/components/virahub-provider'
import { cn } from '@/lib/utils'

const filters = [
  { id: 'todas', label: 'Todas' },
  { id: 'up', label: 'En alza' },
  { id: 'flat', label: 'Estables' },
  { id: 'down', label: 'Enfriándose' },
] as const

export function ExploreScreen() {
  const { trends, step, select, setScreen, saved, toggleSaved } = useVirahub()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<(typeof filters)[number]['id']>('todas')

  const list = useMemo(
    () =>
      trends.filter((t) => {
        const matchesQuery = t.title.toLowerCase().includes(query.toLowerCase())
        const matchesFilter = filter === 'todas' || t.dir === filter
        return matchesQuery && matchesFilter
      }),
    [trends, query, filter],
  )

  return (
    <ScreenShell
      eyebrow="Explorar"
      title="Todo el universo de señales"
      description="Filtra por momento, fuente o palabra clave. Cada tarjeta muestra la curva de las últimas 6 horas en vivo."
      actions={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2">
            <Search className="size-4 text-muted-foreground" strokeWidth={1.9} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar tendencia…"
              className="w-44 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
            />
          </div>
          <span className="flex items-center gap-1 rounded-xl border border-border bg-white/[0.03] p-1">
            <SlidersHorizontal className="mx-1.5 size-3.5 text-muted-foreground" strokeWidth={1.9} />
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  'cursor-pointer rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors',
                  filter === f.id
                    ? 'bg-white/[0.09] text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </span>
        </div>
      }
    >
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((t, i) => (
          <li
            key={t.id}
            className="animate-in fade-in slide-in-from-bottom-2"
            style={{ animationDelay: `${i * 60}ms`, animationDuration: '450ms' }}
          >
            <article className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40">
              <div className="flex items-start gap-3">
                <SourceTile source={t.source} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[14px] font-semibold">{t.title}</h2>
                  <p className="text-[12px] text-muted-foreground">{t.status}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSaved(t.id)}
                  className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                >
                  {saved.includes(t.id) ? (
                    <BookmarkCheck className="size-4 text-primary" strokeWidth={2} />
                  ) : (
                    <Bookmark className="size-4" strokeWidth={1.9} />
                  )}
                  <span className="sr-only">Guardar</span>
                </button>
              </div>

              <MiniSpark trend={t} step={step} />

              <div className="flex items-end justify-between">
                <p className="flex items-baseline gap-1">
                  <span className="text-xl font-semibold tabular-nums">{t.mentions}</span>
                  <span className="text-[11px] text-muted-foreground">menc/h</span>
                </p>
                <p
                  className={cn(
                    'text-[13px] font-semibold tabular-nums',
                    t.delta > 0 ? 'text-[var(--mint)]' : 'text-muted-foreground',
                  )}
                >
                  {t.delta > 0 ? '+' : ''}
                  {t.delta}%
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  select(t.id)
                  setScreen('radar')
                }}
                className="mt-auto flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-[12.5px] font-medium transition-colors hover:bg-white/[0.05]"
              >
                Abrir en el radar
                <ArrowUpRight
                  className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  strokeWidth={2}
                />
              </button>
            </article>
          </li>
        ))}
      </ul>

      {list.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-[13px] text-muted-foreground">
          Sin resultados para “{query}”.
        </p>
      )}
    </ScreenShell>
  )
}
