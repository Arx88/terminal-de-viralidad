'use client'

import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  Bookmark,
  ChevronDown,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pin,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { CountUp } from '@/components/count-up'
import { MiniSpark, ScreenShell } from '@/components/screens/screen-shell'
import { SourceTile } from '@/components/source-icon'
import { useVirahub } from '@/components/virahub-provider'
import type { Trend } from '@/lib/virahub-data'
import { cn } from '@/lib/utils'

type Folder = {
  id: string
  name: string
  color: string
}

type Note = {
  trendId: string
  folderId: string | null
  text: string
  pinned: boolean
  addedAt: string
}

const INITIAL_FOLDERS: Folder[] = [
  { id: 'f1', name: 'Tecnología', color: 'var(--primary)' },
  { id: 'f2', name: 'Política', color: 'var(--hot)' },
  { id: 'f3', name: 'Mercados', color: 'var(--mint)' },
  { id: 'f4', name: 'Watchlist', color: 'var(--cool)' },
]

const FOLDER_STYLES: Record<string, string> = {
  'var(--primary)': 'border-primary/40 bg-primary/12 text-primary',
  'var(--hot)': 'border-[var(--hot)]/40 bg-[var(--hot)]/12 text-[var(--hot)]',
  'var(--mint)': 'border-[var(--mint)]/40 bg-[var(--mint)]/12 text-[var(--mint)]',
  'var(--cool)': 'border-[var(--cool)]/40 bg-[var(--cool)]/12 text-[var(--cool)]',
}

const TONE_DELTAS: Record<Trend['tone'], string> = {
  hot: 'text-[var(--hot)]',
  cool: 'text-[var(--cool)]',
  mint: 'text-[var(--mint)]',
  muted: 'text-muted-foreground',
}

const SORTS = [
  { key: 'recent', label: 'Recientes' },
  { key: 'mentions', label: 'Más menciones' },
  { key: 'delta', label: 'Mayor crecimiento' },
  { key: 'confidence', label: 'Confianza' },
] as const
type SortKey = (typeof SORTS)[number]['key']

export function SavedScreen() {
  const { trends, saved, toggleSaved, step, select, setScreen, notify } = useVirahub()
  const [folders] = useState<Folder[]>(INITIAL_FOLDERS)
  const [notes, setNotes] = useState<Record<string, Note>>(() => {
    const n: Record<string, Note> = {
      ia: { trendId: 'ia', folderId: 'f2', text: 'Borrador UE — vigilar artículo 7', pinned: true, addedAt: 'hace 2 días' },
      nvidia: { trendId: 'nvidia', folderId: 'f3', text: 'Confirmar specs con fuente oficial', pinned: false, addedAt: 'hace 4 días' },
    }
    return n
  })
  const [query, setQuery] = useState('')
  const [activeFolder, setActiveFolder] = useState<string | 'all' | 'pinned' | 'none'>('all')
  const [sort, setSort] = useState<SortKey>('recent')
  const [expanded, setExpanded] = useState<string | null>(null)

  const list = useMemo(() => {
    let arr = trends.filter((t) => saved.includes(t.id))
    if (activeFolder === 'pinned') {
      arr = arr.filter((t) => notes[t.id]?.pinned)
    } else if (activeFolder === 'none') {
      arr = arr.filter((t) => !notes[t.id]?.folderId)
    } else if (activeFolder !== 'all') {
      arr = arr.filter((t) => notes[t.id]?.folderId === activeFolder)
    }
    if (query) {
      const q = query.toLowerCase()
      arr = arr.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.status.toLowerCase().includes(q) ||
          notes[t.id]?.text.toLowerCase().includes(q),
      )
    }
    const sortFn: Record<SortKey, (a: Trend, b: Trend) => number> = {
      recent: (a, b) => (notes[b.id]?.addedAt ?? '').localeCompare(notes[a.id]?.addedAt ?? ''),
      mentions: (a, b) => b.mentions - a.mentions,
      delta: (a, b) => b.delta - a.delta,
      confidence: (a, b) => b.confidence - a.confidence,
    }
    return [...arr].sort(sortFn[sort])
  }, [trends, saved, activeFolder, query, notes, sort])

  const counts = useMemo(() => {
    const byFolder: Record<string, number> = {}
    let pinned = 0
    let none = 0
    for (const t of trends.filter((x) => saved.includes(x.id))) {
      const n = notes[t.id]
      if (n?.pinned) pinned++
      if (!n?.folderId) none++
      if (n?.folderId) byFolder[n.folderId] = (byFolder[n.folderId] ?? 0) + 1
    }
    return { byFolder, pinned, none, total: saved.length }
  }, [trends, saved, notes])

  function setNote(trendId: string, patch: Partial<Note>) {
    setNotes((prev) => {
      const current = prev[trendId] ?? {
        trendId,
        folderId: null,
        text: '',
        pinned: false,
        addedAt: 'ahora',
      }
      return { ...prev, [trendId]: { ...current, ...patch } }
    })
  }

  function exportData(format: 'json' | 'markdown') {
    const items = list.map((t) => {
      const n = notes[t.id]
      const folder = folders.find((f) => f.id === n?.folderId)
      return {
        title: t.title,
        source: t.source,
        status: t.status,
        mentions: t.mentions,
        delta: t.delta,
        confidence: t.confidence,
        folder: folder?.name ?? null,
        note: n?.text ?? '',
        pinned: n?.pinned ?? false,
      }
    })
    let content: string
    let filename: string
    let mime: string
    if (format === 'json') {
      content = JSON.stringify({ exportedAt: new Date().toISOString(), count: items.length, items }, null, 2)
      filename = 'virahub-guardados.json'
      mime = 'application/json'
    } else {
      const lines = [
        '# Guardados de VIRAHUB',
        '',
        `> Exportado ${new Date().toLocaleString('es-ES')} · ${items.length} tendencias`,
        '',
        '---',
        '',
      ]
      for (const it of items) {
        lines.push(`## ${it.title}${it.pinned ? ' 📌' : ''}`)
        lines.push('')
        if (it.folder) lines.push(`- **Carpeta:** ${it.folder}`)
        lines.push(`- **Fuente:** ${it.source}`)
        lines.push(`- **Estado:** ${it.status}`)
        lines.push(`- **Menciones/hora:** ${it.mentions}`)
        lines.push(`- **Delta:** ${it.delta > 0 ? '+' : ''}${it.delta}%`)
        lines.push(`- **Confianza:** ${it.confidence}/100`)
        if (it.note) lines.push(`- **Nota:** ${it.note}`)
        lines.push('')
      }
      content = lines.join('\n')
      filename = 'virahub-guardados.md'
      mime = 'text/markdown'
    }
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    notify(`Exportado como ${format.toUpperCase()}`)
  }

  return (
    <ScreenShell
      eyebrow="Guardados"
      title="Tu colección de señales"
      description="Las tendencias que marcaste siguen actualizándose en segundo plano, incluso si salen del radar principal. Organízalas, anótalas y expórtalas cuando quieras."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportData('json')}
            disabled={list.length === 0}
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-[12.5px] font-medium transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileJson className="size-3.5 text-primary" strokeWidth={2} />
            JSON
          </button>
          <button
            type="button"
            onClick={() => exportData('markdown')}
            disabled={list.length === 0}
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-[12.5px] font-medium transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileText className="size-3.5 text-[var(--mint)]" strokeWidth={2} />
            Markdown
          </button>
          <span className="flex items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-[12.5px] text-muted-foreground">
            <Bookmark className="size-3.5" strokeWidth={2} />
            <CountUp value={counts.total} className="font-semibold tabular-nums text-foreground" /> guardadas
          </span>
        </div>
      }
    >
      {saved.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <Bookmark className="mx-auto size-6 text-muted-foreground" strokeWidth={1.8} />
          <p className="mt-3 text-[14px] font-medium">Todavía no guardaste ninguna tendencia</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Usa el marcador en el panel de análisis para empezar tu colección.
          </p>
          <button
            type="button"
            onClick={() => setScreen('explorar')}
            className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Sparkles className="size-4" strokeWidth={2.2} /> Explorar tendencias
          </button>
        </div>
      ) : (
        <>
          {/* TOOLBAR */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2">
              <Search className="size-4 text-muted-foreground" strokeWidth={1.9} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por título, estado o nota…"
                className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Limpiar
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-white/[0.03] p-1">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSort(s.key)}
                  className={cn(
                    'cursor-pointer rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors',
                    sort === s.key ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* FOLDER PILLS */}
          <div className="flex flex-wrap items-center gap-2">
            <FolderPill
              active={activeFolder === 'all'}
              onClick={() => setActiveFolder('all')}
              Icon={Folder}
              label="Todas"
              count={counts.total}
            />
            <FolderPill
              active={activeFolder === 'pinned'}
              onClick={() => setActiveFolder('pinned')}
              Icon={Pin}
              label="Fijadas"
              count={counts.pinned}
              color="var(--hot)"
            />
            <FolderPill
              active={activeFolder === 'none'}
              onClick={() => setActiveFolder('none')}
              Icon={FolderOpen}
              label="Sin carpeta"
              count={counts.none}
              color="var(--muted-foreground)"
            />
            <span className="mx-1 h-5 w-px bg-border" />
            {folders.map((f) => (
              <FolderPill
                key={f.id}
                active={activeFolder === f.id}
                onClick={() => setActiveFolder(f.id)}
                Icon={Folder}
                label={f.name}
                count={counts.byFolder[f.id] ?? 0}
                color={f.color}
              />
            ))}
            <button
              type="button"
              onClick={() => notify('Creador de carpetas próximamente')}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <FolderPlus className="size-3.5" strokeWidth={2} />
              Nueva carpeta
            </button>
          </div>

          {/* GRID */}
          {list.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-12 text-center text-[13px] text-muted-foreground">
              {query ? `Sin resultados para "${query}".` : 'No hay tendencias en esta vista.'}
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((t, i) => {
                const note = notes[t.id]
                const folder = folders.find((f) => f.id === note?.folderId)
                const isOpen = expanded === t.id
                return (
                  <li
                    key={t.id}
                    className="animate-in fade-in slide-in-from-bottom-2"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <article
                      className={cn(
                        'group flex h-full flex-col gap-3 rounded-2xl border bg-card p-4 transition-all duration-300 hover:-translate-y-0.5',
                        note?.pinned ? 'border-[var(--hot)]/30' : 'border-border hover:border-primary/40',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <SourceTile source={t.source} className="size-10 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-[14px] font-semibold">{t.title}</h3>
                          <p className="truncate text-[12px] text-muted-foreground">{t.status}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNote(t.id, { pinned: !note?.pinned })}
                          className={cn(
                            'flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors',
                            note?.pinned
                              ? 'text-[var(--hot)]'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                          aria-label="Fijar"
                          title={note?.pinned ? 'Desfijar' : 'Fijar'}
                        >
                          <Pin className={cn('size-3.5', note?.pinned && 'fill-current')} strokeWidth={2} />
                        </button>
                      </div>

                      <MiniSpark trend={t} step={step} className="h-12 w-full" />

                      <div className="flex items-end justify-between">
                        <p className="flex items-baseline gap-1">
                          <CountUp
                            value={t.mentions}
                            className="text-xl font-semibold tabular-nums"
                          />
                          <span className="text-[11px] text-muted-foreground">menc/h</span>
                        </p>
                        <p className={cn('text-[13px] font-semibold tabular-nums', TONE_DELTAS[t.tone])}>
                          {t.delta > 0 ? '+' : ''}{t.delta}%
                        </p>
                      </div>

                      {folder && (
                        <span
                          className={cn(
                            'inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium',
                            FOLDER_STYLES[folder.color] ?? FOLDER_STYLES['var(--primary)'],
                          )}
                        >
                          <Folder className="size-3" strokeWidth={2} />
                          {folder.name}
                        </span>
                      )}

                      {/* NOTE / ACTIONS */}
                      <div className="mt-auto border-t border-border pt-3">
                        {note?.text && !isOpen ? (
                          <p className="mb-2 line-clamp-1 text-[11.5px] italic text-muted-foreground">
                            "{note.text}"
                          </p>
                        ) : null}
                        {isOpen && (
                          <textarea
                            value={note?.text ?? ''}
                            onChange={(e) => setNote(t.id, { text: e.target.value })}
                            placeholder="Añade una nota…"
                            rows={2}
                            className="mb-2 w-full resize-none rounded-lg border border-border bg-white/[0.03] px-2.5 py-2 text-[12px] outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/40"
                          />
                        )}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              select(t.id)
                              setScreen('radar')
                            }}
                            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                          >
                            Ver en radar
                            <ArrowUpRight className="size-3" strokeWidth={2.2} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : t.id)}
                            className={cn(
                              'flex cursor-pointer items-center justify-center rounded-lg border p-1.5 transition-colors',
                              isOpen
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:text-foreground',
                            )}
                            aria-label="Editar nota"
                            title="Editar nota"
                          >
                            <ChevronDown className={cn('size-3.5 transition-transform', isOpen && 'rotate-180')} strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleSaved(t.id)}
                            className="flex cursor-pointer items-center justify-center rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Quitar de guardados"
                            title="Quitar"
                          >
                            <Trash2 className="size-3.5" strokeWidth={2} />
                          </button>
                        </div>
                        <p className="mt-2 text-[10.5px] text-muted-foreground">
                          {note?.addedAt ?? 'recién añadida'}
                          {note?.pinned ? ' · fijada' : ''}
                        </p>
                      </div>
                    </article>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </ScreenShell>
  )
}

/* ═══════ HELPERS ═══════ */
function FolderPill({
  active,
  onClick,
  Icon,
  label,
  count,
  color = 'var(--primary)',
}: {
  active: boolean
  onClick: () => void
  Icon: typeof Folder
  label: string
  count: number
  color?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11.5px] font-medium transition-all',
        active
          ? cn('border-current', FOLDER_STYLES[color] ?? FOLDER_STYLES['var(--primary)'])
          : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground',
      )}
    >
      <Icon className="size-3" strokeWidth={2} />
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 text-[10px] font-bold tabular-nums',
          active ? 'bg-current/15' : 'bg-white/[0.08]',
        )}
      >
        {count}
      </span>
    </button>
  )
}
