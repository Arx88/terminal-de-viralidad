'use client'

import { Bookmark, Trash2 } from 'lucide-react'
import { MiniSpark, ScreenShell } from '@/components/screens/screen-shell'
import { SourceTile } from '@/components/source-icon'
import { useVirahub } from '@/components/virahub-provider'

export function SavedScreen() {
  const { trends, saved, toggleSaved, step, select, setScreen } = useVirahub()
  const list = trends.filter((t) => saved.includes(t.id))

  return (
    <ScreenShell
      eyebrow="Guardados"
      title="Tu colección de señales"
      description="Las tendencias que marcaste siguen actualizándose en segundo plano, incluso si salen del radar principal."
      actions={
        <span className="flex items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-[12.5px] text-muted-foreground">
          <Bookmark className="size-3.5" strokeWidth={2} />
          {list.length} guardadas
        </span>
      }
    >
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-14 text-center text-[13px] text-muted-foreground">
          Todavía no guardaste ninguna tendencia. Usa el marcador en el panel de análisis.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((t) => (
            <li key={t.id}>
              <article className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
                <SourceTile source={t.source} className="size-10" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[14.5px] font-semibold">{t.title}</h2>
                  <p className="text-[12px] text-muted-foreground">
                    {t.status} · confianza {t.confidence}
                  </p>
                </div>
                <MiniSpark trend={t} step={step} className="h-10 w-32" />
                <p className="text-right">
                  <span className="block text-lg font-semibold tabular-nums">{t.mentions}</span>
                  <span className="block text-[11px] text-muted-foreground">menc/h</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      select(t.id)
                      setScreen('radar')
                    }}
                    className="cursor-pointer rounded-lg bg-primary px-3 py-2 text-[12.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Ver en radar
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSaved(t.id)}
                    className="cursor-pointer rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
                  >
                    <Trash2 className="size-4" strokeWidth={1.9} />
                    <span className="sr-only">Quitar de guardados</span>
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </ScreenShell>
  )
}
