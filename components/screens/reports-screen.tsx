'use client'

import { useMemo, useState } from 'react'
import {
  Award,
  BarChart3,
  Calendar,
  Clock,
  Download,
  FileDown,
  FileText,
  Gauge,
  Hourglass,
  ScrollText,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react'
import { CountUp } from '@/components/count-up'
import { MiniSpark, ScreenShell } from '@/components/screens/screen-shell'
import { SourceTile } from '@/components/source-icon'
import { useVirahub } from '@/components/virahub-provider'
import { ENGINES, type SourceKey } from '@/lib/virahub-data'
import { cn } from '@/lib/utils'

type Period = 'today' | 'week' | 'month'

const PERIODS: { key: Period; label: string; Icon: typeof Calendar }[] = [
  { key: 'today', label: 'Hoy', Icon: Clock },
  { key: 'week', label: 'Esta semana', Icon: Calendar },
  { key: 'month', label: 'Este mes', Icon: Hourglass },
]

const PERIOD_DATA: Record<Period, {
  detected: number
  confirmed: number
  accuracy: number
  leadTime: number
  topTrendDelta: number
  bySource: { source: SourceKey; count: number; pct: number }[]
  hourly: number[]
}> = {
  today: {
    detected: 12,
    confirmed: 8,
    accuracy: 67,
    leadTime: 4.2,
    topTrendDelta: 312,
    bySource: [
      { source: 'reddit', count: 38, pct: 32 },
      { source: 'bluesky', count: 24, pct: 20 },
      { source: 'hn', count: 18, pct: 15 },
      { source: 'gdelt', count: 16, pct: 13 },
      { source: 'rss', count: 14, pct: 12 },
      { source: 'github', count: 9, pct: 8 },
    ],
    hourly: [2, 1, 0, 1, 2, 3, 5, 4, 6, 8, 7, 12, 9, 6, 4, 3],
  },
  week: {
    detected: 84,
    confirmed: 61,
    accuracy: 73,
    leadTime: 6.8,
    topTrendDelta: 542,
    bySource: [
      { source: 'reddit', count: 142, pct: 30 },
      { source: 'bluesky', count: 96, pct: 20 },
      { source: 'hn', count: 78, pct: 16 },
      { source: 'gdelt', count: 62, pct: 13 },
      { source: 'rss', count: 58, pct: 12 },
      { source: 'github', count: 39, pct: 9 },
    ],
    hourly: [3, 5, 4, 6, 8, 10, 14, 12, 16, 18, 22, 19, 15, 11, 8, 6],
  },
  month: {
    detected: 348,
    confirmed: 271,
    accuracy: 78,
    leadTime: 8.4,
    topTrendDelta: 1240,
    bySource: [
      { source: 'reddit', count: 612, pct: 33 },
      { source: 'bluesky', count: 384, pct: 21 },
      { source: 'hn', count: 298, pct: 16 },
      { source: 'gdelt', count: 234, pct: 13 },
      { source: 'rss', count: 198, pct: 11 },
      { source: 'github', count: 112, pct: 6 },
    ],
    hourly: [12, 18, 15, 22, 28, 32, 42, 38, 48, 56, 62, 58, 44, 38, 28, 22],
  },
}

export function ReportsScreen() {
  const { trends, step, setScreen, select, notify } = useVirahub()
  const [period, setPeriod] = useState<Period>('today')

  const data = PERIOD_DATA[period]

  const sortedTrends = useMemo(
    () => [...trends].sort((a, b) => b.delta - a.delta),
    [trends],
  )

  const maxHourly = Math.max(...data.hourly)

  function exportReport(format: 'markdown' | 'pdf') {
    const lines = [
      `# Informe VIRAHUB — ${PERIODS.find((p) => p.key === period)?.label}`,
      '',
      `> Generado ${new Date().toLocaleString('es-ES')}`,
      '',
      '## Resumen ejecutivo',
      '',
      `- **Tendencias detectadas:** ${data.detected}`,
      `- **Confirmadas:** ${data.confirmed} (${data.accuracy}% accuracy)`,
      `- **Lead time medio:** ${data.leadTime}h`,
      `- **Mayor delta:** +${data.topTrendDelta}%`,
      '',
      '## Top tendencias del período',
      '',
      '| # | Tendencia | Fuente | Menciones/h | Delta | Confianza |',
      '|---|-----------|--------|-------------|-------|-----------|',
    ]
    sortedTrends.forEach((t, i) => {
      lines.push(
        `| ${i + 1} | ${t.title} | ${t.source} | ${t.mentions} | ${t.delta > 0 ? '+' : ''}${t.delta}% | ${t.confidence}/100 |`,
      )
    })
    lines.push('', '## Distribución por fuente', '')
    for (const s of data.bySource) {
      const e = ENGINES.find((x) => x.id === s.source)
      lines.push(`- **${e?.name ?? s.source}:** ${s.count} (${s.pct}%)`)
    }

    if (format === 'markdown') {
      const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `virahub-informe-${period}.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      notify('Informe Markdown exportado')
    } else {
      // PDF fallback: open print dialog with markdown rendered as HTML
      const html = `<pre style="font-family: -apple-system, system-ui, sans-serif; padding: 24px; white-space: pre-wrap;">${lines.join('\n')}</pre>`
      const w = window.open('', '_blank')
      if (w) {
        w.document.write(html)
        w.document.close()
        w.print()
      }
      notify('Abriendo diálogo de impresión…')
    }
  }

  return (
    <ScreenShell
      eyebrow="Informes"
      title="Resumen de detección y rendimiento"
      description="Análisis agregado por período: tendencias detectadas, accuracy, lead time y ranking. Exporta el informe cuando quieras compartirlo."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-border bg-white/[0.03] p-1">
            {PERIODS.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                  period === key
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" strokeWidth={2} />
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => exportReport('markdown')}
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-[12.5px] font-medium transition-colors hover:bg-white/[0.06]"
          >
            <FileText className="size-3.5 text-[var(--mint)]" strokeWidth={2} />
            Markdown
          </button>
          <button
            type="button"
            onClick={() => exportReport('pdf')}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 text-[12.5px] font-semibold text-primary-foreground transition-all hover:shadow-[0_0_20px_-4px_var(--primary)] active:translate-y-px"
          >
            <FileDown className="size-3.5" strokeWidth={2} />
            PDF
          </button>
        </div>
      }
    >
      {/* KPI CARDS */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Tendencias detectadas"
          value={data.detected}
          Icon={Target}
          color="text-primary"
          trend={`+${Math.round(data.detected * 0.18)}% vs período anterior`}
        />
        <KpiCard
          label="Accuracy"
          value={data.accuracy}
          suffix="%"
          Icon={Award}
          color="text-[var(--mint)]"
          trend={`${data.confirmed} confirmadas de ${data.detected}`}
        />
        <KpiCard
          label="Lead time medio"
          value={data.leadTime}
          decimals={1}
          suffix="h"
          Icon={Gauge}
          color="text-[var(--cool)]"
          trend="tiempo medio en detectar antes que medios"
        />
        <KpiCard
          label="Mayor delta"
          value={data.topTrendDelta}
          suffix="%"
          Icon={TrendingUp}
          color="text-[var(--hot)]"
          trend="crecimiento máximo en 1h"
        />
      </ul>

      {/* MAIN GRID */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* HOURLY ACTIVITY */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <BarChart3 className="size-4 text-primary" strokeWidth={2} />
                Detecciones por hora
              </h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Distribución de tendencias detectadas a lo largo del día.
              </p>
            </div>
            <span className="rounded-md border border-border bg-white/[0.03] px-2 py-1 text-[11.5px] text-muted-foreground tabular-nums">
              pico: {maxHourly} detecciones
            </span>
          </header>
          <div className="mt-5 flex h-44 items-end justify-between gap-1">
            {data.hourly.map((v, i) => (
              <div
                key={i}
                role="img"
                aria-label={`${v} detecciones a las ${i + 1}ª hora del período`}
                className="group/bar flex flex-1 flex-col items-center justify-end gap-1.5"
                title={`${v} detecciones en esta hora`}
              >
                <span className="text-[10px] font-semibold tabular-nums opacity-0 transition-opacity group-hover/bar:opacity-100">
                  {v}
                </span>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-primary/30 to-primary transition-all duration-300 group-hover/bar:from-primary/50 group-hover/bar:to-primary"
                  style={{ height: `${(v / maxHourly) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10.5px] text-muted-foreground">
            {['00h', '04h', '08h', '12h', '16h', '20h', '24h'].map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        </section>

        {/* BY SOURCE */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Sparkles className="size-4 text-[var(--cool)]" strokeWidth={2} />
            Detecciones por fuente
          </h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">¿De dónde vienen las señales?</p>
          <ul className="mt-4 flex flex-col gap-3">
            {data.bySource.map((s) => {
              const engine = ENGINES.find((e) => e.id === s.source)
              return (
                <li key={s.source} className="flex items-center gap-3">
                  <SourceTile source={s.source} className="size-7" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="font-medium">{engine?.name ?? s.source}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {s.count} · {s.pct}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-700"
                        style={{ width: `${s.pct}%` }}
                      />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      {/* TOP TRENDS RANKING */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <Trophy className="size-4 text-[var(--hot)]" strokeWidth={2} />
              Top tendencias del período
            </h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Ranking por crecimiento (delta) en {PERIODS.find((p) => p.key === period)?.label.toLowerCase()}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setScreen('explorar')}
            className="cursor-pointer text-[12px] text-primary transition-opacity hover:opacity-80 hover:underline"
          >
            Ver todas en Explorar →
          </button>
        </header>

        <ul className="mt-4 flex flex-col gap-2">
          {sortedTrends.map((t, i) => (
            <li
              key={t.id}
              className="group flex flex-wrap items-center gap-4 rounded-xl border border-transparent px-3 py-3 transition-all hover:border-border hover:bg-white/[0.02]"
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-lg text-[12.5px] font-bold tabular-nums',
                  i === 0
                    ? 'bg-[var(--hot)]/15 text-[var(--hot)]'
                    : i === 1
                      ? 'bg-[var(--cool)]/15 text-[var(--cool)]'
                      : i === 2
                        ? 'bg-[var(--mint)]/15 text-[var(--mint)]'
                        : 'bg-white/[0.04] text-muted-foreground',
                )}
              >
                {i + 1}
              </span>
              <SourceTile source={t.source} className="size-8" />
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => {
                    select(t.id)
                    setScreen('explorar')
                  }}
                  className="block max-w-full cursor-pointer truncate text-left text-[14px] font-semibold transition-colors hover:text-primary"
                >
                  {t.title}
                </button>
                <p className="truncate text-[12px] text-muted-foreground">{t.status}</p>
              </div>
              <MiniSpark trend={t} step={step} className="hidden h-9 w-28 sm:block" />
              <div className="flex items-center gap-5">
                <Stat label="menc/h" value={t.mentions} title="Menciones por hora" />
                <Stat
                  label="delta"
                  value={`${t.delta > 0 ? '+' : ''}${t.delta}%`}
                  tone={t.delta > 0 ? 'hot' : 'muted'}
                  title="Crecimiento vs ayer"
                />
                <Stat label="confianza" value={`${t.confidence}`} tone="cool" title="Confianza del modelo (0-100)" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* EXECUTIVE SUMMARY */}
      <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/8 to-transparent p-5">
        <header className="flex items-center gap-2">
          <ScrollText className="size-4 text-primary" strokeWidth={2} />
          <h2 className="text-[15px] font-semibold">Resumen ejecutivo</h2>
          <span className="ml-auto text-[11px] text-muted-foreground">generado por Nemotron-3-Ultra</span>
        </header>
        <p className="mt-3 text-[13.5px] leading-relaxed text-foreground/85 text-pretty">
          Durante <b className="text-foreground">{PERIODS.find((p) => p.key === period)?.label.toLowerCase()}</b>, el
          sistema detectó <b className="text-primary">{data.detected} tendencias</b>, de las cuales{' '}
          <b className="text-[var(--mint)]">{data.confirmed} fueron confirmadas</b> (accuracy del {data.accuracy}%).
          El lead time medio fue de <b className="text-foreground">{data.leadTime}h</b>, lo que significa que Virahub
          identificó las señales antes que la cobertura mediática tradicional. La tendencia de mayor crecimiento fue{' '}
          <b className="text-foreground">{sortedTrends[0]?.title}</b> con un delta de{' '}
          <b className="text-[var(--hot)]">+{sortedTrends[0]?.delta}%</b>. La fuente más productiva fue{' '}
          <b className="text-foreground">{ENGINES.find((e) => e.id === data.bySource[0].source)?.name}</b> con{' '}
          {data.bySource[0].count} detecciones.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportReport('markdown')}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-[12.5px] font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            <Download className="size-3.5" strokeWidth={2} />
            Exportar resumen
          </button>
          <button
            type="button"
            onClick={() => setScreen('explorar')}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white/[0.04] px-3 py-2 text-[12.5px] font-medium transition-colors hover:bg-white/[0.08]"
          >
            <Zap className="size-3.5" strokeWidth={2} />
            Profundizar en Explorar
          </button>
        </div>
      </section>
    </ScreenShell>
  )
}

/* ═══════ HELPERS ═══════ */
function KpiCard({
  label,
  value,
  suffix,
  decimals = 0,
  Icon,
  color,
  trend,
}: {
  label: string
  value: number
  suffix?: string
  decimals?: number
  Icon: typeof Target
  color: string
  trend: string
}) {
  return (
    <li className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
      <div className="flex items-center justify-between">
        <span className={cn('flex size-9 items-center justify-center rounded-lg bg-white/[0.04]', color)}>
          <Icon className="size-4" strokeWidth={2} />
        </span>
      </div>
      <CountUp
        value={value}
        decimals={decimals}
        suffix={suffix ?? ''}
        className="mt-3 block text-2xl font-bold tabular-nums"
      />
      <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{label}</span>
      <p className="mt-1.5 text-[11px] text-muted-foreground/80">{trend}</p>
    </li>
  )
}

function Stat({
  label,
  value,
  tone,
  title,
}: {
  label: string
  value: number | string
  tone?: 'hot' | 'cool' | 'mint' | 'muted'
  title?: string
}) {
  const toneClass = {
    hot: 'text-[var(--hot)]',
    cool: 'text-[var(--cool)]',
    mint: 'text-[var(--mint)]',
    muted: 'text-muted-foreground',
  } as const
  return (
    <div className="flex flex-col items-end" title={title}>
      <span className={cn('text-[14px] font-semibold tabular-nums', tone ? toneClass[tone] : '')}>
        {value}
      </span>
      <span className="text-[10.5px] text-muted-foreground">{label}</span>
    </div>
  )
}