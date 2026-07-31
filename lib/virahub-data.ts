export type RangeKey = '1H' | '6H' | '24H' | '7D'

export type Shape = 'accel' | 'rise' | 'flat' | 'decay' | 'wobble'

export type SourceKey =
  | 'reddit'
  | 'bluesky'
  | 'hn'
  | 'rss'
  | 'gdelt'
  | 'github'
  | 'nvidia'
  | 'crypto'

export type Trend = {
  id: string
  title: string
  source: SourceKey
  color: string
  status: string
  tone: 'hot' | 'cool' | 'mint' | 'muted'
  dir: 'up' | 'down' | 'flat'
  time: string
  heat: string
  confidence: number
  mentions: number
  delta: number
  shape: Shape
  why: string
  evidence: { label: string; value: string }[]
  inTimeline?: boolean
}

export const TRENDS: Trend[] = [
  {
    id: 'ia',
    title: 'Regulación de IA en la UE',
    source: 'reddit',
    color: 'var(--hot)',
    status: 'Crecimiento acelerado',
    tone: 'hot',
    dir: 'up',
    time: '12:32',
    heat: 'Muy caliente',
    confidence: 82,
    mentions: 82,
    delta: 312,
    shape: 'accel',
    why: 'Borrador filtrado de la Comisión Europea genera debate en Bluesky y r/spain. 14 posts en 2h, sin cobertura en medios tradicionales aún.',
    evidence: [
      { label: 'Posts en 2h', value: '14' },
      { label: 'Comunidades', value: '6' },
      { label: 'Medios', value: '0' },
    ],
    inTimeline: true,
  },
  {
    id: 'bluesky',
    title: 'Nueva API de Bluesky',
    source: 'bluesky',
    color: 'oklch(0.72 0.21 300)',
    status: 'Señal emergente',
    tone: 'cool',
    dir: 'up',
    time: '12:31',
    heat: 'Caliente',
    confidence: 64,
    mentions: 47,
    delta: 128,
    shape: 'rise',
    why: 'Un changelog no anunciado aparece en el repositorio oficial. Desarrolladores comparten pruebas del nuevo endpoint de feeds personalizados.',
    evidence: [
      { label: 'Repos citando', value: '9' },
      { label: 'Hilos activos', value: '11' },
      { label: 'Medios', value: '1' },
    ],
    inTimeline: true,
  },
  {
    id: 'cripto',
    title: 'Cripto se recupera',
    source: 'crypto',
    color: 'var(--mint)',
    status: 'Actividad estable',
    tone: 'mint',
    dir: 'flat',
    time: '12:30',
    heat: 'Templado',
    confidence: 51,
    mentions: 33,
    delta: 18,
    shape: 'flat',
    why: 'Volumen constante de menciones sin picos. El sentimiento mejora lentamente tras tres días de caída, sin catalizador claro todavía.',
    evidence: [
      { label: 'Sentimiento', value: '+0.3' },
      { label: 'Fuentes', value: '22' },
      { label: 'Picos', value: '0' },
    ],
    inTimeline: true,
  },
  {
    id: 'despidos',
    title: 'Despidos en tech',
    source: 'reddit',
    color: 'oklch(0.66 0.02 285)',
    status: 'Interés en descenso',
    tone: 'muted',
    dir: 'down',
    time: '12:28',
    heat: 'Enfriándose',
    confidence: 38,
    mentions: 21,
    delta: -42,
    shape: 'decay',
    why: 'La conversación pierde tracción tras el pico del lunes. Sigue viva en r/cscareerquestions pero sin nuevas señales de amplificación.',
    evidence: [
      { label: 'Pico', value: 'Lun 09:12' },
      { label: 'Hilos activos', value: '4' },
      { label: 'Medios', value: '7' },
    ],
  },
  {
    id: 'fusion',
    title: 'Avances en fusión nuclear',
    source: 'gdelt',
    color: 'oklch(0.65 0.18 265)',
    status: 'Señal débil',
    tone: 'muted',
    dir: 'up',
    time: '12:26',
    heat: 'Templado',
    confidence: 44,
    mentions: 17,
    delta: 61,
    shape: 'wobble',
    why: 'Tres papers y una nota de prensa institucional en la última hora. Aún sin discusión social relevante: señal temprana de laboratorio.',
    evidence: [
      { label: 'Papers', value: '3' },
      { label: 'Países', value: '5' },
      { label: 'Social', value: 'bajo' },
    ],
  },
  {
    id: 'nvidia',
    title: 'Nuevo chip de Nvidia',
    source: 'nvidia',
    color: 'oklch(0.78 0.16 140)',
    status: 'Rumor en crecimiento',
    tone: 'mint',
    dir: 'up',
    time: '12:24',
    heat: 'Caliente',
    confidence: 58,
    mentions: 29,
    delta: 96,
    shape: 'rise',
    why: 'Filtración de especificaciones en un foro asiático replicada en Hacker News. Sin confirmación oficial, pero el patrón coincide con lanzamientos previos.',
    evidence: [
      { label: 'Réplicas', value: '18' },
      { label: 'Fuente origen', value: 'Foro' },
      { label: 'Confirmado', value: 'No' },
    ],
  },
]

export const RANGES: RangeKey[] = ['1H', '6H', '24H', '7D']

export const RANGE_CONFIG: Record<RangeKey, { labels: string[]; points: number }> = {
  '1H': { labels: ['12:00', '12:10', '12:20', '12:30', '12:40'], points: 26 },
  '6H': { labels: ['08:00', '09:00', '10:00', '11:00', '12:00'], points: 34 },
  '24H': { labels: ['13:00', '18:00', '23:00', '04:00', '09:00'], points: 42 },
  '7D': { labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'], points: 48 },
}

function makeRng(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function hash(str: string) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

function envelope(shape: Shape, t: number) {
  switch (shape) {
    case 'accel':
      return 0.3 + Math.pow(t, 2.4) * 0.72 + Math.sin(t * 7) * 0.05
    case 'rise':
      return 0.24 + t * 0.6 + Math.sin(t * 4) * 0.06
    case 'flat':
      return 0.42 + Math.sin(t * 5.5) * 0.09 + t * 0.12
    case 'decay':
      return 0.82 - Math.pow(t, 1.3) * 0.55 + Math.sin(t * 6) * 0.05
    case 'wobble':
      return 0.4 + Math.sin(t * 9) * 0.16 + t * 0.22
  }
}

/** Deterministic normalized (0..1) series for a trend + range + live step. */
export function buildSeries(
  id: string,
  shape: Shape,
  range: RangeKey,
  step = 0,
): number[] {
  const { points } = RANGE_CONFIG[range]
  const rand = makeRng(hash(id + range) + step * 7919)
  const out: number[] = []
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1)
    const noise = (rand() - 0.5) * 0.12
    out.push(Math.min(0.98, Math.max(0.02, envelope(shape, t) + noise)))
  }
  return out
}

/** Catmull-Rom → cubic bezier smoothing. */
export function smoothPath(pts: [number, number][], tension = 0.5) {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
  }
  return d
}

export const ENGINES = [
  { id: 'reddit', name: 'Reddit', verbs: ['Extrayendo…', 'Rastreando…', 'Leyendo hilos…'] },
  { id: 'bluesky', name: 'Bluesky', verbs: ['Analizando…', 'Escuchando…', 'Midiendo señal…'] },
  { id: 'hn', name: 'Hacker News', verbs: ['Clasificando…', 'Puntuando…', 'Ordenando…'] },
  { id: 'rss', name: 'RSS Feeds', verbs: ['Indexando…', 'Sincronizando…', 'Deduplicando…'] },
  { id: 'gdelt', name: 'GDELT', verbs: ['Procesando…', 'Traduciendo…', 'Geolocalizando…'] },
  { id: 'github', name: 'GitHub', verbs: ['Verificando…', 'Comparando…', 'Vigilando repos…'] },
] as const
