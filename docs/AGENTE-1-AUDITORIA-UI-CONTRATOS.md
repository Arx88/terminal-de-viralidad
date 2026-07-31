# AGENTE 1 — AUDITORÍA UI Y CONTRATOS DE DATOS · VIRAHUB

> Frontend: `https://terminal-de-viralidad.vercel.app`
> Repo auditado: `/home/z/my-project/`
> Componentes leídos: 14 archivos · 7 pantallas · 1 provider central · 1 módulo de datos
> Estado del frontend: **TODO el estado vive en `VirahubProvider` (client-side, en memoria)**. No hay ni un solo `fetch()` ni `EventSource` ni WebSocket en todo el código fuente. Cada dato "en vivo" es actualmente generado por `setInterval` + `Math.random()`. **El backend debe reemplazar la totalidad de los mocks documentados abajo.**

---

## ARQUITECTURA DE ESTADO (single source of truth)

`components/virahub-provider.tsx` expone vía context:

| Campo | Tipo | Origen actual (MOCK) | Frecuencia mock |
|---|---|---|---|
| `screen` | `ScreenKey` (7 valores) | `useState('radar')` | on-demand |
| `range` | `RangeKey` (`'1H' \| '6H' \| '24H' \| '7D'`) | `useState('6H')` | on-demand |
| `selectedId` | `string` | `useState('ia')` | on-demand |
| `selected` | `Trend` (derivado) | `TRENDS.find(...)` | derivado |
| `trends` | `Trend[]` (constante 6) | `TRENDS` import | **estático** |
| `step` | `number` (heartbeat) | `setInterval(2600ms)` | **2.6s** |
| `hiddenLanes` | `string[]` | `useState([])` | on-demand |
| `saved` | `string[]` (trend IDs) | `useState(['nvidia'])` | on-demand |
| `alerts` | `string[]` (trend IDs) | `useState(['ia'])` | on-demand |
| `engines` | `string[]` (SourceKey) | `useState(ENGINES.map(e=>e.id))` | on-demand |
| `cardOpen` | `boolean` | `useState(true)` | on-demand |
| `analyzed` | `number` (count-up) | `setInterval(1400ms) + 7..29` | **1.4s** |
| `latency` | `number` (seg, 1 decimal) | `setInterval(1400ms) + 1..1.6` | **1.4s** |
| `clock` | `string` (`HH:MM`) | `setInterval(10000ms)` | **10s** |
| `live` | `boolean` | `useState(true)` | on-demand |
| `toast` | `string \| null` | `notify(msg)` + timeout 2600ms | on-demand |

**Tipos base** (`lib/virahub-data.ts`):

```ts
type SourceKey = 'reddit' | 'bluesky' | 'hn' | 'rss' | 'gdelt' | 'github' | 'x' | 'nvidia' | 'crypto'
type RangeKey  = '1H' | '6H' | '24H' | '7D'
type Shape     = 'accel' | 'rise' | 'flat' | 'decay' | 'wobble'

type Trend = {
  id: string
  title: string
  source: SourceKey
  color: string            // CSS color (var(--hot) | oklch() | hex)
  status: string           // frase corta de estado
  tone: 'hot' | 'cool' | 'mint' | 'muted'
  dir:  'up'   | 'down' | 'flat'
  time: string             // 'HH:MM' — última actualización
  heat: string             // 'Muy caliente' | 'Caliente' | 'Templado' | 'Enfriándose'
  confidence: number       // 0–100
  mentions: number         // menciones/hora
  delta: number            // % vs ayer (puede ser negativo)
  shape: Shape             // determina la curva generada
  why: string              // explicación narrativa
  evidence: { label: string; value: string }[]   // 3 evidencias
  inTimeline?: boolean     // aparece en la línea de tiempo multi-lane
}
```

`ENGINES` es un array constante de 7 motores con `{ id, name, verbs: string[3] }`.

---

## 1. TOPBAR (`components/top-bar.tsx`)

### Datos necesarios
- `live: boolean` — estado global del escaneo (entra/sale del provider)
- `analyzed: number` — total de publicaciones analizadas; **count-up animado**, formato `es-ES` (separador `.` de miles)
- `latency: number` — segundos con 1 decimal; si `> 1.5` se pinta en `var(--hot)` (rojo)
- `alerts: string[]` — IDs de tendencias con alerta rápida activa (afecta badge `BellRing`)
- `screen: ScreenKey` — pantalla activa (resalta "Gestión de motores" si `=== 'motores'`)
- `ENGINES.length: number` — cantidad de motores activos (etiqueta "N motores activos"). **Actualmente hardcodeado a 7; el contrato real debe ser `enginesActive: number` desde el backend.**
- `focused: SourceKey` — motor en foco (estado LOCAL del componente, no persistido). **Riesgo: si el usuario recarga, pierde el foco. Debe migrarse al provider o al backend como preferencia de usuario.**

### Sub-componentes
**Waveform** — decoración funcional basada en `live + latency`:
- `live=false` → muted, flat line
- `live=true && latency>1.5` → `var(--hot)`, cadencia lenta (1.7s)
- `live=true && latency<=1.5` → `var(--mint)`, cadencia rápida (1.1s)
- 64 barras, alturas predecibles vía `Math.sin(i*0.7)`. **No requiere datos del backend más allá de `live` y `latency`.**

**EngineFocusMenu** — dropdown con avatar pile de los primeros 3 motores + lista completa:
- Trigger: avatar stack + label "Foco: {focusedEngine.name}" + chevron
- Items: `ENGINES.map` con `role="menuitemradio"`, `aria-checked={isFocused}`
- Click → `setFocused(id) + notify('Foco en ${name}')`
- **Contrato backend implícito**: persistir `focusedEngine` por usuario.

### Frecuencia
- `analyzed` y `latency` → **real-time cada 1.4s** (hoy: `setInterval`). Backend: SSE o WS a esa cadencia.
- `live` → on-demand (toggle manual)
- `alerts.length` → on-demand (cambia al activar/desactivar alertas)
- `clock` → **cada 10s** (hoy: `setInterval`; debería ser cliente puro, no backend)

### Endpoints
| Acción | Método sugerido | Body / Query | Origen UI |
|---|---|---|---|
| Pausar/reanudar escaneo global | `POST /api/scan/toggle` | `{ live: boolean }` → `{ ok: true, live: boolean }` | botón "ESCANEANDO/EN PAUSA" |
| Cambiar motor en foco | `PATCH /api/user/preferences` | `{ focusedEngine: SourceKey }` | `EngineFocusMenu` item click |
| Navegar a "Motores" | n/a (routing client) | — | botón "Gestión de motores" |
| Navegar a "Alertas" | n/a | — | botón `BellRing` |
| Volver a Radar | n/a | — | click en logo VIRAHUB |

### Estados
- **success / live**: badge `ESCANEANDO` en primary, waveform animada en mint
- **paused**: badge `EN PAUSA` en muted-foreground, waveform flat
- **stressed** (latency > 1.5s): waveform en `var(--hot)`, latencia en rojo
- **alerts > 0**: badge rojo con número en `BellRing`
- **error / loading**: **NO IMPLEMENTADO**. Falta contrato para estado de error del escaneo (caída del motor, desconexión SSE). Sugerencia: `scanStatus: 'healthy' | 'degraded' | 'down'` + `errorMsg`.

---

## 2. LEFT RAIL (`components/left-rail.tsx`)

### Datos necesarios
- `screen: ScreenKey` (7 ítems: radar, explorar, alertas, guardados, motores, informes, ajustes)
- `alerts: string[]` — `length` pinta badge en "Alertas"
- `saved: string[]` — `length` pinta badge en "Guardados"
- Avatar del usuario: `<Image src="/avatar.png">` — **estático**. Contrato backend: `user.avatarUrl`.

### Estructura
- 7 botones verticales, cada uno con `{ id, label, Icon }`
- Badge rojo `var(--hot)` si `alerts.length > 0` o `saved.length > 0`
- "Radar" activo tiene glow pulsante (`vh-radar-pulse`) + ripple
- Indicador de presencia online (bolita verde `var(--mint)` en avatar) — **decorativo, sin contrato**

### Frecuencia
- on-demand (clicks del usuario)
- badges reaccionan al cambio de `alerts`/`saved` en cualquier pantalla

### Endpoints
Pura navegación client-side. No requiere endpoints. **Pero** el badge `alerts.length` debería sincronizar con un stream de alertas nuevas (SSE) para que aparezca en tiempo real aunque el usuario esté en otra pantalla.

### Estados
- **active**: ícono en `text-primary`, fondo `bg-primary/15`, glow shadow
- **inactive**: muted-foreground, hover lift
- **badge**: bolita roja `var(--hot)` con número en tabular-nums
- **error**: no implementado

---

## 3. HERO CARD (`components/hero-card.tsx`)

### Datos necesarios
**Stats (HOY hardcodeados, DEBEN ser dinámicos):**
```ts
const stats = [
  { value: 3,  label: 'Tendencias emergentes', screen: 'explorar', color: 'var(--hot)' },
  { value: 12, label: 'Señales débiles',        screen: 'explorar', color: 'var(--cool)' },
  { value: 2,  label: 'Anomalías detectadas',   screen: 'alertas',  color: 'var(--hot)' },
]
```
**Contrato backend sugerido:**
```ts
GET /api/hero/summary → {
  emergingTrends: number       // tendencias en fase emergente
  weakSignals: number          // señales con confidence < 50
  anomalies: number            // detección de patrones anómalos
  enginesActive: number        // override del hardcoded "ENGINES.length"
  headline?: string            // opcional, "Hoy en Virahub"
}
```

- `live: boolean` — activa sweep animado + badge "En vivo" vs "En pausa"
- `ENGINES.length` — "{n} motores activos" (en badge secundario y en `steps[0]`)

### Sub-secciones
1. **Badge live**: pill "EN VIVO" con ripple si `live`, sino "EN PAUSA"
2. **Badge motores**: "{n} motores activos"
3. **Headline**: "Detectamos lo que está por explotar." (estático, marketing)
4. **CTA "Cómo funciona"**: toggla un `<ol>` con 3 pasos (estáticos). **No requiere backend.**
5. **Stats grid**: 3 botones, cada uno navega a una pantalla (explorar/explorar/alertas)

### Frecuencia
- Stats: **polling cada 30s** sugerido (no es crítico el real-time estricto)
- `live` y `enginesActive`: on-demand + propagate de provider

### Endpoints
- `GET /api/hero/summary` (polling 30s)
- Clicks → navegación client-side

### Estados
- **success**: 3 tiles visibles con `CountUp` animado, hover lift + glow
- **live**: sweep animado lateral, badge pulsante
- **paused**: badges muted, sin animaciones
- **empty**: no contemplado (si `emergingTrends === 0`, el tile muestra `0`)
- **loading**: no contemplado. Sugerencia: skeleton de 3 placeholders.

---

## 4. LIVE SCAN (`components/live-scan.tsx`)

### Datos necesarios
- `live: boolean`
- `step: number` — heartbeat del provider (mueve el `verb` y el `progress`)
- `analyzed: number` — "posts/historiados" count en el header
- `ENGINES: EngineDef[]` — lista de motores con `verbs: string[3]`
- `notify: (msg: string) => void`

**Contrato backend sugerido** (uno por motor):
```ts
GET /api/engines/live → {
  engines: Array<{
    id: SourceKey
    name: string
    status: 'capturing' | 'idle' | 'error' | 'paused'
    currentVerb: string         // 'Extrayendo…' | 'Rastreando…' etc.
    progress: number            // 0–100 (% del lote actual)
    rpm: number                 // menciones/min capturadas ahora
    lastSync: string            // ISO timestamp | 'hace Xs'
  }>
}
```

### Renderizado
- Header: "PIPELINE EN VIVO" + bullet mint pulsante + "{n} motores capturando…"
- Track horizontal: 7 nodos de motor + 1 nodo final "Radar"
- Cada nodo: avatar SourceTile + nombre + ON/OFF + verb animado + barra de progreso
- Verb actual: `live ? verbs[(phase + i) % verbs.length] : 'En pausa'`
- Progreso: `live ? 18 + ((step * 17 + i * 29) % 80) : 4` — **fórmula determinista mock**
- Flechas `ArrowRight` entre nodos con animación `vh-nudge` staggered

### Frecuencia
- `phase` interno: `setInterval(2400ms)` — cambia los verbs
- `step`: proviene del provider (2600ms)
- `analyzed`: proviene del provider (1400ms)
- **Backend real**: SSE de progreso por motor cada 1–2s

### Endpoints
| Acción | Método | Payload |
|---|---|---|
| Click en nodo motor | n/a (hoy: `notify`) | Sugerencia: tooltip con detalles del lote actual |
| Stream de progreso | `GET /api/engines/live` (SSE) | `text/event-stream` |
| Pausar motor individual | `POST /api/engines/{id}/toggle` | `{ active: boolean }` |

### Estados
- **live**: verb animado (fade-in slide-up), progreso en gradient, flechas animadas
- **paused**: verb = "En pausa", progreso = 4%, opacidad 0.7, sin animaciones
- **error**: **no implementado**. Falta estado por motor (timeout, rate limit). Sugerencia: `status: 'error'` + tooltip rojo + mantener última métrica.
- **empty**: no aplica (siempre hay 7 nodos)

---

## 5. TREND TIMELINE (`components/trend-timeline.tsx`)

### Datos necesarios
- `range: RangeKey` — `'1H' | '6H' | '24H' | '7D'`
- `setRange`
- `trends: Trend[]` (filtrado por `inTimeline === true`)
- `selectedId` y `select(id)`
- `hiddenLanes: string[]` y `toggleLane(id)`
- `step: number` — regenera las series
- `clock: string` — 'HH:MM' para tooltip de hover
- `live: boolean` — activa bullet "AHORA" pulsante + ripple en último punto

**Contrato backend sugerido:**
```ts
GET /api/trends/timeline?range=6H → {
  lanes: Array<{
    id: string                  // trend id
    title: string
    source: SourceKey
    color: string               // CSS color
    delta: number               // %
    series: number[]            // 26–48 puntos normalizados 0..1
                             // (o raw: { t: ISO, v: number }[])
    last: number                // último valor real
  }>
  labels: string[]              // 5 etiquetas de eje X
}
```

### Constantes internas
```ts
CHART_W  = 1000
LANE_H   = 54
LINE_AMP = 18   // amplitud vertical pico-a-pico dentro de cada lane
```

### Rangos y configuración (de `virahub-data.ts`)
```ts
RANGE_CONFIG = {
  '1H':  { labels: ['12:00','12:10','12:20','12:30','12:40'], points: 26 },
  '6H':  { labels: ['08:00','09:00','10:00','11:00','12:00'], points: 34 },
  '24H': { labels: ['13:00','18:00','23:00','04:00','09:00'], points: 42 },
  '7D':  { labels: ['Lun','Mar','Mié','Jue','Vie'],            points: 48 },
}
```

### Tooltip de hover
- Se dispara al mover el mouse sobre el chart
- Muestra: label de tiempo interpolado + lista de lanes con `Math.round(values[idx] * 120)` (escala lineal a "volumen relativo")
- Para `7D` → label es día de la semana; para otros → hora interpolada entre `labels[0]` y `clock`

### Frecuencia
- `step` regenera las series cada 2.6s (hoy: `buildSeries` con seed determinista)
- **Backend real**: WebSocket que envíe nuevos puntos cada 2–5s por lane activa, o polling por range

### Endpoints
| Acción | Método | Payload |
|---|---|---|
| Cambiar rango | `GET /api/trends/timeline?range={range}` | query param |
| Seleccionar trend | `PATCH /api/user/selected` | `{ trendId: string }` |
| Ocultar/mostrar lane | `PATCH /api/user/hidden-lanes` | `{ laneId: string, hidden: boolean }` |
| Stream de serie | `WS /api/trends/stream` | `{ laneIds: string[] }` subscribe |

### Estados
- **success**: lanes visibles, paths dibujados con animación `vh-draw`, NOW marker con dot + ripple
- **hidden lane**: opacidad 0.12 en línea, 0.06 en área, eye icon toggled
- **selected lane**: bg `white/[0.05]`, stroke más grueso (2.4 vs 1.7), glow en barra lateral
- **live**: bullet mint "AHORA" + ripple en último punto
- **paused**: sin ripple, bullet estático
- **empty**: si `lanes.length === 0` → `data[0]?.values.length ?? 2` (debería mostrar empty state, **no implementado**)
- **error**: no implementado

---

## 6. ANALYSIS PANEL (`components/analysis-panel.tsx`)

> Panel lateral derecho, presente en todas las pantallas (excepto en las suyas propias de pantalla).

### Datos necesarios
**Lista compacta (todas las tendencias):**
```ts
trends: Trend[]  // 6 tendencias, cada una con:
  - id, title, source, tone, status, time, dir, delta
```

**Card de detalle (trend seleccionado):**
```ts
selected: Trend = {
  id, title, source, color, tone, dir
  status: string               // "Crecimiento acelerado"
  heat: string                 // "Muy caliente" — aparece como pill
  confidence: number           // 0–100, count-up
  mentions: number             // count-up grande (text-4xl)
  delta: number                // %, con prefix '+' si >0, rojo si >0
  why: string                  // párrafo explicativo
  evidence: { label, value }[] // 3 pills con label+valor
}
```

**Sparkline interno:** generado con `buildSeries(trend.id, trend.shape, '6H', step)` → 34 puntos. **El backend debe enviar la serie real; el `shape` es mock.**

- `step` — regenera sparkline
- `cardOpen` / `setCardOpen` — colapsa el card a un botón "Ver detalle de {title}"
- `saved` / `toggleSaved` — bookmark icon
- `alerts` / `toggleAlert` — bell icon
- `live` — activa `Flame` flicker + bullet "Actualizaciones en tiempo real"
- `setScreen('explorar')` — botón "Ver todo"
- `setScreen('informes')` — botón "Ver análisis completo"

### Renderizado del card
1. Header: tone label ("Creciendo"/"Enfriando") + Flame icon + close X
2. Title (text-[17px] semibold)
3. Heat pill + Confidence count-up + "/100 confianza"
4. Mentions/hora (text-4xl) + Delta vs ayer (rojo si >0)
5. Sparkline SVG con glow filter
6. Evidence grid 3-col (label arriba chiquito, value abajo grande)
7. "Por qué importa" + párrafo `{selected.why}`
8. Footer actions: "Ver análisis completo" (primary) + toggle alerta + toggle saved

### Frecuencia
- `selected` se actualiza al hacer click en un item → on-demand
- Sparkline regenera con cada `step` (2.6s) — debería ser stream SSE
- `trends` es estático en el mock — **debería refrescarse cada 30–60s** para detectar nuevas tendencias entrantes/salientes

### Endpoints
| Acción | Método | Payload |
|---|---|---|
| Toggle alerta rápida | `POST /api/alerts/quick` | `{ trendId: string, active: boolean }` |
| Toggle guardado | `POST /api/saved` | `{ trendId: string, action: 'save' \| 'remove' }` |
| Ver detalle | n/a (client state) | — |
| Ir a informes | n/a | — |
| Ir a explorar | n/a | — |

### Estados
- **success card open**: card completo visible, animación fade-in slide-up
- **success card closed**: botón dashed "Ver detalle de {title}"
- **loading**: no implementado (cuando se selecciona un trend nuevo debería haber skeleton)
- **empty trends**: no implementado (si `trends.length === 0` la lista está vacía sin mensaje)
- **error**: no implementado

---

## 7. EXPLORE SCREEN (`components/screens/explore-screen.tsx`)

### Datos necesarios
**Inherits del provider:**
- `trends: Trend[]` — array completo de 6 tendencias
- `selected: Trend` — tendencia activa (cabecera + tabs)
- `select(id)`, `step`, `saved`, `toggleSaved`, `alerts`, `toggleAlert`, `notify`

**Estado local:**
- `query: string` — search input (filtra por título)
- `tab: Tab` — `'Resumen' | 'Análisis IA' | 'Conversaciones' | 'Fuentes' | 'Historial'`
- `openConv: number | null` — conversación expandible

**Tabs y sus contratos:**

#### Tab: Resumen (`ResumenPanel`)
- `trend.why` (texto explicativo)
- `trend.evidence: { label, value }[]` (chips)
- `trend.confidence` (0–100, con barra de progreso)
- `trend.dir` ('up'→'Acelerando', 'down'→'Frenando', 'flat'→'Estable')
- "Confiabilidad: Alta" — **hardcodeado**. Debería derivarse de `confidence` (>70 Alta, 40-70 Media, <40 Baja).

#### Tab: Análisis IA (`AnalisisIAPanel`)
**MOCK COMPLETO**. El frontend hardcodea:
- "Nemotron-3-Ultra · generado hace 2min"
- Resumen generado textualmente con template string usando `trend.why + trend.delta + trend.confidence + trend.source + trend.mentions`
- "Nemotron-3-Ultra-550B · thinking:false · 312 tokens · 4.2s"

**Contrato backend sugerido:**
```ts
POST /api/ai/summarize → {
  trendId: string
} → {
  model: string              // 'nemotron-3-ultra'
  generatedAt: ISO timestamp
  summary: string            // resumen narrativo
  thinkingMode: boolean
  tokens: number
  latencyMs: number
  evidenceBreakdown: Array<{ label, value, pct }>  // para las barras
}
```

#### Tab: Conversaciones (`ConversacionesPanel`)
**MOCK 3 conversaciones hardcoded:**
```ts
convs = [
  { author: 'r/Artificial', handle: 'u/ia_policy_es', source: 'reddit',
    text: 'Borrador filtrado…', time: 'hace 54m',
    score: 342, comments: 128, reach: '4.2k', shares: 38 },
  { author: '@dev_es', handle: 'Bluesky', source: 'bluesky', ... },
  { author: 'u/tech_observer', handle: 'r/spain', source: 'reddit', ... },
]
```

**Contrato backend sugerido:**
```ts
GET /api/trends/{id}/conversations?limit=20 → {
  items: Array<{
    id: string
    author: string           // handle/comunidad
    handle: string           // plataforma/subreddit
    source: SourceKey
    text: string
    time: string             // 'hace 54m' o ISO
    score: number            // upvotes/likes
    comments: number
    reach: string            // '4.2k' — string formateado
    shares: number
    url: string              // enlace al post original
  }>
  total: number
}
```

#### Tab: Fuentes (`FuentesPanel`)
**MOCK**: tablita con `ENGINES` (7 motores), valores hardcodeados:
```ts
const pct  = [312, 128, 244, 61, 18, 42, 96][i] || 0  // crecimiento %
const menc = [14,   9,  11,  3,  5,  8,  2][i] || 0  // menciones absolutas
```

**Contrato backend:**
```ts
GET /api/trends/{id}/sources → {
  sources: Array<{
    source: SourceKey
    name: string
    mentions: number         // menciones desde esta fuente
    growthPct: number        // % crecimiento
    verb: string             // verbs[0] de ENGINES
  }>
  totalMentions: number
}
```

#### Tab: Historial (`HistorialPanel`)
**MOCK 6 eventos hardcoded:**
```ts
events = [
  { time: '12:32', text: 'Detección inicial por motor Reddit',         tag: 'Detección',     color: 'primary' },
  { time: '12:35', text: 'Bluesky confirma la señal con 3 posts',      tag: 'Cross-source',  color: 'primary' },
  { time: '12:40', text: 'Velocidad supera umbral (82 menc/h)',        tag: 'Umbral',        color: 'hot' },
  { time: '12:45', text: 'Análisis IA disponible',                     tag: 'IA',            color: 'primary' },
  { time: '13:00', text: 'Hacker News empieza a discutir el tema',     tag: 'Amplificación', color: 'hot' },
  { time: '13:15', text: 'Guardado en radar por usuario',              tag: 'Usuario',       color: 'primary' },
]
```

**Contrato backend:**
```ts
GET /api/trends/{id}/history → {
  events: Array<{
    id: string
    time: string            // 'HH:MM' o ISO
    text: string
    tag: string             // 'Detección' | 'Cross-source' | 'Umbral' | 'IA' | 'Amplificación' | 'Usuario' | ...
    color: 'primary' | 'hot' | 'cool' | 'mint'
  }>
}
```

### Cabecera
- Title `selected.title` (text-3xl/4xl bold)
- Subtitle `selected.why` (max-w 460px)
- 4 chips: `selected.heat` (Flame) + `selected.status` (Sparkles) + `selected.source` (Globe) + `selected.time` (Clock)
- Bloque métricas: `selected.mentions` menc/hora (mono text-3xl) + `+{selected.delta}%` vs ayer (rojo)
- MiniSpark `selected` con `step`

### Acciones
- "Seguir tema" / "Siguiendo" → `toggleSaved(selected.id)`
- "Crear alerta" / "Alerta activa" → `toggleAlert(selected.id)`

### Grid de tendencias (footer)
- Filtra `trends` por `query` (case-insensitive en title)
- Cards con: SourceTile + title + status + bookmark + MiniSpark + menc/h + delta%
- Click en card → `select(t.id) + setTab('Resumen')`

### Frecuencia
- on-demand para tabs y clicks
- `selected.mentions/delta/confidence` se actualizan con `step` (2.6s) — debería ser SSE
- Conversaciones y eventos: polling 30–60s

### Endpoints (consolidados)
| Acción | Método | Path |
|---|---|---|
| Buscar tendencias | `GET` | `/api/trends?q={query}` |
| Seleccionar trend | n/a | client state |
| Toggle saved | `POST` | `/api/saved` |
| Toggle alert | `POST` | `/api/alerts/quick` |
| Resumen IA | `POST` | `/api/ai/summarize` |
| Conversaciones | `GET` | `/api/trends/{id}/conversations` |
| Fuentes | `GET` | `/api/trends/{id}/sources` |
| Historial | `GET` | `/api/trends/{id}/history` |

### Estados
- **success**: tabs activas, cards con animación staggered (`animationDelay: i*60ms`)
- **empty search**: dashed box con icono Search + "Sin resultados para '{query}'" + botón "Limpiar búsqueda"
- **loading**: no implementado
- **error IA**: no implementado (si Nemotron falla, ¿qué se muestra?)

---

## 8. ALERTS SCREEN (`components/screens/alerts-screen.tsx`)

### Datos necesarios
**Estadísticas (4 KPIs en ribbon):**
- `stats.active` — reglas activas (count)
- `stats.triggeredToday` — disparos hoy (events.length)
- `stats.unack` — no revisados (count)
- `stats.totalTriggers` — histórico (suma de triggeredCount)

**Badge primario**: `${stats.unack} sin revisar` (rojo `var(--hot)`) o `Estás al día` (mint).

**Tipo `AlertRule`:**
```ts
type AlertRule = {
  id: string
  trendId: string
  condition: 'mentions' | 'velocity' | 'phase' | 'source_count' | 'sentiment'
  threshold: number
  channels: Array<'email' | 'push' | 'slack'>
  active: boolean
  lastTriggered: string | null   // 'HH:MM' o null
  triggeredCount: number
  createdAt: string              // 'hace 4 días'
}
```

**Tipo `TriggeredEvent`:**
```ts
type TriggeredEvent = {
  id: string
  time: string                   // 'HH:MM'
  ruleId: string
  trendId: string
  title: string                  // 'Regulación de IA en la UE superó 82 menciones/hora'
  tone: Trend['tone']
  detail: string                 // 'Velocidad +312% en 1h · 4 fuentes detectadas'
  ack: boolean                   // revisado
}
```

**Condiciones (`CONDITIONS`):**
| Key | Label | Unit | Min | Max | Step | Default |
|---|---|---|---|---|---|---|
| `mentions` | Umbral de menciones | menc/h | 5 | 500 | 5 | 50 |
| `velocity` | Pico de aceleración | % | 10 | 500 | 10 | 100 |
| `phase` | Cambio de fase | fase | 1 | 4 | 1 | 1 |
| `source_count` | Múltiples fuentes | fuentes | 2 | 6 | 1 | 3 |
| `sentiment` | Cambio de sentimiento | pts | 5 | 100 | 5 | 20 |

**Canales (`CHANNELS`):** `email` | `push` | `slack`

### Tabs (4)

#### Tab: Reglas activas (`RulesPanel`)
- Lista de `AlertRule[]` con: SourceTile + title + condition label + threshold + lastTriggered + triggeredCount + MiniSpark + channels icons + Toggle activar + Trash eliminar
- Warning si `rule.active && !trendAlertOn` → "La tendencia no tiene alerta rápida activa" + botón "Activar"
- **Empty**: dashed box + "No tienes reglas todavía" + CTA "Crear regla"

#### Tab: Crear regla (`CreateRulePanel`)
- Step 1: trend picker (grid de `trends`, uno seleccionable)
- Step 2: condition picker (5 opciones con descripción)
- Step 3: threshold slider (range input con min/max/step dinámicos según condición)
- Step 4: channels (3 toggles)
- Preview panel lateral con: trend + sparkline + condition + threshold + channels + "Lista para activar"
- CTA "Crear regla" → `addRule(rule) + setTab('rules')`

#### Tab: Historial (`HistoryPanel`)
- Header: "Historial de disparos" + CTA "Marcar todo como revisado" → `onAckAll`
- Search input para filtrar events
- Timeline vertical con: dot tonalizado + title + detail + "Ver tendencia" (navega a explorar) + time + "Revisado" (ack) o "Visto" badge
- **Empty**: dashed box + "No hay disparos registrados"

#### Tab: Feed / Notificaciones (`FeedPanel`)
- Layout 2 columnas (2fr inbox / 1fr revisadas)
- Inbox: cards de eventos no ack con tone styles, botón "Revisado"
- Sidebar: lista compacta de eventos acked con truncate
- **Empty inbox**: "Estás al día · Sin notificaciones pendientes"
- **Empty sidebar**: "Aún no has revisado ninguna alerta"

### Frecuencia
- on-demand para CRUD de reglas
- `unack` debería actualizar en tiempo real (SSE cuando una regla dispara)

### Endpoints
| Acción | Método | Path | Body |
|---|---|---|---|
| Listar reglas | `GET` | `/api/alerts/rules` | — |
| Crear regla | `POST` | `/api/alerts/rules` | `AlertRule` (sin id/lastTriggered/triggeredCount/createdAt) |
| Toggle activa | `PATCH` | `/api/alerts/rules/{id}` | `{ active: boolean }` |
| Eliminar regla | `DELETE` | `/api/alerts/rules/{id}` | — |
| Listar eventos | `GET` | `/api/alerts/events?ack=false` | — |
| Ack evento | `PATCH` | `/api/alerts/events/{id}` | `{ ack: true }` |
| Ack all | `POST` | `/api/alerts/events/ack-all` | — |
| Stream de nuevos disparos | `SSE` | `/api/alerts/stream` | `text/event-stream` |
| Quick alert (desde AnalysisPanel) | `POST` | `/api/alerts/quick` | `{ trendId }` |

### Estados
- **success**: 4 KPIs con CountUp, tabs con badges, listas animadas
- **unack > 0**: badge `BellRing` pulsante en `var(--hot)`
- **empty rules**: CTA crear regla
- **empty events**: mensaje motivacional
- **loading**: no implementado
- **error**: no implementado

---

## 9. ENGINES SCREEN (`components/screens/engines-screen.tsx`)

### Datos necesarios
**Provider:**
- `engines: string[]` (SourceKey activos)
- `toggleEngine(id)`
- `live: boolean`
- `notify(msg)`

**Estado local:**
- `openId: SourceKey | null` — cuál expansada
- `configs: Record<SourceKey, { interval, queries[], draftQuery }>`
- `logs: LogEntry[]` (10 entradas iniciales hardcoded)

**Metadata estática `ENGINE_META` (7 motores):**
| id | intervalOptions | defaultInterval | rateLimit | auth | defaultQueries |
|---|---|---|---|---|---|
| reddit | [2,5,10,15,30] | 5 | 60 req/min | OAuth | r/technology, r/artificial, r/spain |
| bluesky | [1,3,5,10,15] | 3 | 5000 evt/min | OAuth | IA regulación, API Bluesky, policy |
| x | [1,3,5,10,15] | 4 | 450 req/15min | OAuth | #IA, #regulación, OpenAI |
| hn | [5,10,15,30,60] | 10 | Sin límite | Anónimo | AI, startup, regulation |
| rss | [5,15,30,60,120] | 15 | 100 feeds | Anónimo | techcrunch, theverge |
| gdelt | [15,30,60,180] | 30 | 300 req/día | API Key | theme:TECH, sourcecountry:ESP |
| github | [10,20,60,180] | 20 | 5000 req/h | API Key | bluesky-social/atproto, openai/openai-cookbook |

**Tipo `LogEntry`:**
```ts
{ id: string, engine: SourceKey, ts: string, level: 'info'|'warn'|'error', message: string }
```

### KPIs agregados (`aggregate`)
Calculados en cliente a partir de `engines` activos + `configs`:
- `activeCount` / `totalCount` (X/7)
- `totalRpm` = `active.length * 12 + 24`
- `avgLatency` = `active.length ? 1 + active.length * 0.18 : 0` (segundos)
- `totalQueries` = suma de `configs[m.id].queries.length` para motores activos

**Estos son MOCK. Contrato backend:**
```ts
GET /api/engines/aggregate → {
  activeCount: number
  totalCount: number
  totalRpm: number
  avgLatency: number
  totalQueries: number
}
```

### Métricas por motor (en header row)
- `rpm` = `isActive ? 8 + queries.length * 3 : 0`
- `latency` = `isActive ? 0.6 + queries.length * 0.18 : 0` (segundos)
- `lastSync` = `isActive ? 'hace 1 min' : '—'`

**Contrato backend por motor:**
```ts
GET /api/engines → {
  engines: Array<{
    id: SourceKey
    name: string
    description: string
    auth: 'OAuth' | 'API Key' | 'Anónimo' | 'Webhook'
    rateLimit: string
    intervalOptions: number[]
    defaultInterval: number
    queryLabel: string
    queryPlaceholder: string
    defaultQueries: string[]
    active: boolean
    interval: number           // intervalo actual configurado (min)
    queries: string[]          // queries actuales
    rpm: number                // menciones/min actuales
    latency: number            // segundos
    lastSync: string           // ISO o 'hace Xs'
  }>
}
```

### Configuración expandida
- Interval picker (botones `[2m, 5m, 10m, 15m, 30m]`)
- Queries editor: input + botón "+" (Enter para añadir), lista de chips con Trash
- Footer: "Guardar" (notify) + "Probar conexión" (notify) + "Última sync: {lastSync}"

### Logs
- Lista monospace de `LogEntry[]` con timestamp, level badge (info/warn/error), nombre motor, mensaje
- Header: "LOGS DE ACTIVIDAD" + botón "Refrescar" (notify)
- Footer: "Logs retenidos 7 días · {n} entradas recientes"
- Scroll vertical max 460px

### Frecuencia
- KPIs y métricas por motor: **real-time cada 5–10s** (polling o SSE)
- Logs: stream SSE continuo

### Endpoints
| Acción | Método | Path | Body |
|---|---|---|---|
| Listar motores + config | `GET` | `/api/engines` | — |
| Toggle motor | `PATCH` | `/api/engines/{id}` | `{ active: boolean }` |
| Activar/pausar todos | `POST` | `/api/engines/bulk-toggle` | `{ active: boolean }` |
| Guardar config motor | `PUT` | `/api/engines/{id}/config` | `{ interval, queries }` |
| Test conexión | `POST` | `/api/engines/{id}/test` | — |
| Listar logs | `GET` | `/api/engines/logs?limit=100` | — |
| Stream logs | `SSE` | `/api/engines/logs/stream` | — |
| Aggregate metrics | `GET` | `/api/engines/aggregate` | — |

### Estados
- **active motor**: badge mint "ACTIVO" pulsante, opacidad 1, hover lift
- **paused motor**: badge muted "PAUSADO", opacidad 0.5
- **expanded**: chevron rotado, panel de config con fade-in
- **empty queries**: "Sin queries configuradas."
- **loading**: no implementado
- **error motor**: no implementado. Sug: badge rojo "ERROR" + tooltip con `errorMsg`.

---

## 10. REPORTS SCREEN (`components/screens/reports-screen.tsx`)

### Datos necesarios
**Period selector:** `today` | `week` | `month`

**Por periodo, el `PERIOD_DATA` (hoy hardcoded, debe ser dinámico):**
```ts
type PeriodData = {
  detected: number         // tendencias detectadas en el período
  confirmed: number        // confirmadas (cobertura mediática posterior)
  accuracy: number         // % confirmed/detected
  leadTime: number         // horas de adelanto medio
  topTrendDelta: number    // % delta máxima
  bySource: { source: SourceKey, count: number, pct: number }[]
  hourly: number[]         // 16 barras (detecciones por hora del día)
}
```

**Tres conjuntos MOCK completos** para `today`/`week`/`month`.

**Contrato backend:**
```ts
GET /api/reports?period={today|week|month} → {
  detected: number
  confirmed: number
  accuracy: number
  leadTime: number
  topTrendDelta: number
  bySource: Array<{ source: SourceKey, count: number, pct: number }>
  hourly: number[]              // 16 puntos (o N configurable)
  hourlyLabels: string[]        // ['00h','04h',...]
  topTrends: Trend[]            // ranking ordenado por delta
  executiveSummary: string      // generado por Nemotron
}
```

### KPI cards (4)
- "Tendencias detectadas" — `data.detected` + trend `+18% vs período anterior`
- "Accuracy" — `data.accuracy%` + `{confirmed} confirmadas de {detected}`
- "Lead time medio" — `data.leadTime h` + "tiempo medio en detectar antes que medios"
- "Mayor delta" — `data.topTrendDelta%` + "crecimiento máximo en 1h"

### Charts
1. **Detecciones por hora** — bar chart de 16 barras con gradient, pico en label
2. **Detecciones por fuente** — lista horizontal con SourceTile + nombre + count/pct + barra
3. **Top tendencias** — ranking con badge numerado (1=hot, 2=cool, 3=mint), SourceTile, title, MiniSpark, 3 stats (menc/h, delta%, confianza)

### Resumen ejecutivo
- Card con borde primary y gradiente
- Texto generado con template string usando `data.detected/confirmed/accuracy/leadTime + sortedTrends[0].title/delta + bySource[0].name`
- Atribución: "generado por Nemotron-3-Ultra"

### Exportación
- `exportReport('markdown')` → genera MD en cliente y descarga como `virahub-informe-{period}.md`
- `exportReport('pdf')` → abre ventana con `<pre>` HTML y dispara `window.print()`
- **Backend opcional**: `POST /api/reports/export` con `{ period, format }` para generar PDF server-side con mejor layout.

### Frecuencia
- on-demand al cambiar período
- No requiere real-time (es analítica retrospectiva)

### Endpoints
| Acción | Método | Path |
|---|---|---|
| Cargar período | `GET` | `/api/reports?period={period}` |
| Resumen IA | `POST` | `/api/ai/executive-summary` |
| Exportar MD | `POST` | `/api/reports/export` |
| Exportar PDF | `POST` | `/api/reports/export` |

### Estados
- **success**: 4 KPIs + charts + ranking + summary, todos animados
- **loading**: no implementado
- **empty**: no implementado (si `detected === 0`)
- **error**: no implementado

---

## 11. SETTINGS SCREEN (`components/screens/settings-screen.tsx`)

### Datos necesarios
**Provider:** `notify`, `engines`, `toggleEngine`, `live`

### Tabs (4)

#### Tab: Perfil
- `displayName: string` (input text, default 'Usuario Virahub')
- `email: string` (input email, default 'user@virahub.io', check verde si incluye '@')
- `lang: 'es'|'en'|'pt'|'fr'` (4 botones con bandera)
- `timezone: string` (select con 6 opciones: Europe/Madrid, Europe/London, America/New_York, America/Sao_Paulo, Asia/Tokyo, UTC)
- `theme: 'dark'|'light'|'system'` (3 botones con icon)
- Vista previa lateral con avatar inicial + datos
- CTAs: "Guardar cambios" + "Descartar"

**Contrato:**
```ts
GET /api/user/profile → { displayName, email, lang, timezone, theme }
PATCH /api/user/profile → { displayName?, email?, lang?, timezone?, theme? }
```

#### Tab: Notificaciones
- 3 toggles de canal: email (con detalle = email), push, slack (con detalle 'Configurado'|'Pendiente'|'Inactivo')
- Si slack on: input para webhook URL
- 2 toggles digest: diario (09:00), semanal (lunes)
- 2 sliders:
  - `mentionThreshold`: 10–200, step 5, default 50
  - `velocityThreshold`: 20–300, step 10, default 100
- 2 time inputs: `quietHoursStart` (default 22:00), `quietHoursEnd` (default 08:00)
- CTA "Guardar"

**Contrato:**
```ts
type NotificationPrefs = {
  emailEnabled: boolean
  pushEnabled: boolean
  slackEnabled: boolean
  slackWebhook: string
  dailyDigest: boolean
  weeklyDigest: boolean
  mentionThreshold: number    // 10–200
  velocityThreshold: number   // 20–300
  quietHoursStart: string     // 'HH:MM'
  quietHoursEnd: string       // 'HH:MM'
}
GET /api/user/notifications → NotificationPrefs
PATCH /api/user/notifications → NotificationPrefs
```

#### Tab: API Keys
4 providers:
| id | label | description | placeholder | docsUrl |
|---|---|---|---|---|
| nvidia | NVIDIA Nemotron | Modelo LLM | nvapi-XXXXXXXX | build.nvidia.com |
| upstash | Upstash Redis | Cache y rate limiting | XXXXXXXXXXXX | upstash.com |
| reddit | Reddit OAuth | Credenciales Reddit | client_id:client_secret | reddit.com/prefs/apps |
| gdelt | GDELT API Key | Consultas avanzadas | XXXXXXXXXXXX | gdeltproject.org |

**Tipo:**
```ts
type ApiKeyState = {
  key: string           // valor real (vacío si unset)
  masked: string        // 'nvapi-3f2a••••••••••••••••••••1c3b'
  visible: boolean      // toggle mostrar/ocultar
  status: 'valid' | 'invalid' | 'unset'
}
```

Por cada key:
- Card con icon, label, StatusBadge, descripción, link a docs
- Si `key` existe: monospace mostrando `visible ? key : masked` + botón ojo + botón reset
- Input para nueva key (password salvo reddit que es text) + botón "Guardar"

**Contrato:**
```ts
GET /api/user/api-keys → Array<{ id, label, description, status, docsUrl, placeholder, hasKey: boolean, masked?: string }>
POST /api/user/api-keys/{id} → { key: string } → { ok: true, masked: string, status: 'valid' | 'invalid' }
DELETE /api/user/api-keys/{id}
POST /api/user/api-keys/{id}/test → { valid: boolean, latencyMs: number }
```

#### Tab: Acerca de
**`ABOUT_STATS` (hardcoded):**
| label | value |
|---|---|
| Versión | 1.4.2 |
| Build | 2024.12.18 |
| Modelo IA | Nemotron-3-Ultra |
| Fuentes activas | 6 motores |
| Latencia media | 1.2s |
| Uptime 30d | 99.94% |

**Contrato backend:** `GET /api/system/info` → todos esos campos dinámicos.

Lista de 7 motores con toggle mini (Activar/Pausar texto). Card secundaria con:
- Logo + "VIRAHUB / Detector de tendencias virales"
- Descripción: "Plataforma… construida con Next.js 16, Tailwind CSS 4 y arquitectura serverless."
- 4 filas: Repositorio, Status, Soporte, Licencia
- CTAs: "Buscar actualizaciones" + "Diagnóstico"

### Frecuencia
- on-demand para guardar/cambiar
- ABOUT_STATS podría refrescarse cada 60s (uptime)

### Endpoints
| Acción | Método | Path |
|---|---|---|
| Cargar perfil | `GET` | `/api/user/profile` |
| Guardar perfil | `PATCH` | `/api/user/profile` |
| Cargar notif prefs | `GET` | `/api/user/notifications` |
| Guardar notif prefs | `PATCH` | `/api/user/notifications` |
| Listar API keys | `GET` | `/api/user/api-keys` |
| Guardar API key | `POST` | `/api/user/api-keys/{id}` |
| Eliminar API key | `DELETE` | `/api/user/api-keys/{id}` |
| Test API key | `POST` | `/api/user/api-keys/{id}/test` |
| System info | `GET` | `/api/system/info` |
| Toggle motor | `PATCH` | `/api/engines/{id}` |

### Estados
- **success**: tabs activas, vista previa lateral reactiva, badges de status
- **email inválido**: no check verde (pero no bloquea guardar)
- **API key invalid**: StatusBadge rojo "Inválida"
- **API key unset**: StatusBadge muted "Sin configurar"
- **loading**: no implementado
- **error guardado**: no implementado

---

## 12. SAVED SCREEN (`components/screens/saved-screen.tsx`)

### Datos necesarios
**Provider:** `trends`, `saved`, `toggleSaved`, `step`, `select`, `setScreen`, `notify`

**Estado local:**
- `folders: Folder[]` (4 inicializados: Tecnología, Política, Mercados, Watchlist)
- `notes: Record<trendId, Note>`
- `query`, `activeFolder: 'all'|'pinned'|'none'|folderId`, `sort: SortKey`, `expanded: trendId|null`

**Tipos:**
```ts
type Folder = { id: string, name: string, color: string }  // CSS color
type Note   = {
  trendId: string
  folderId: string | null
  text: string
  pinned: boolean
  addedAt: string          // 'hace 2 días' | 'ahora'
}
```

**Sorts disponibles:**
- `recent` — por addedAt
- `mentions` — por mentions/h descendente
- `delta` — por delta% descendente
- `confidence` — por confidence descendente

### Renderizado
1. **Header**: count de guardadas (`counts.total`)
2. **Empty state** (si `saved.length === 0`): dashed box + "Todavía no guardaste ninguna tendencia" + CTA "Explorar tendencias"
3. **Toolbar**:
   - Search input (busca en title, status o note text)
   - Sort toggle (4 opciones)
   - Export JSON / Markdown
4. **Folder chips**: Todas (total), Fijadas (pinned), Sin carpeta (none), divider, 4 folders, "+ Nueva" (notify)
5. **Section header**: label dinámico según `activeFolder` + count de resultados
6. **Grid de cards** (sm:2, xl:3 cols) con:
   - SourceTile + title + status + Pin button
   - Mentions/h (CountUp) + MiniSpark + delta badge (tone-styled)
   - Folder tag + nota preview (truncada)
   - Nota editor (textarea expandible)
   - CTAs: "Ver en radar" (primary), "Editar nota" (chevron), "Quitar" (trash)
   - Footer: `{addedAt}` + `· fijada` si pinned
7. **Empty filter**: dashed box + "Sin resultados para '{query}'"

### Exportación
- `exportData('json')` → `virahub-guardados.json` con estructura `{ exportedAt, count, items[] }`
- `exportData('markdown')` → `virahub-guardados.md` con headers `## {title}` + bullets

### Frecuencia
- on-demand para todo
- Las `addedAt` deberían actualizarse relativamente (polling cada 60s para refrescar "hace Xs/min")

### Endpoints
| Acción | Método | Path | Body |
|---|---|---|---|
| Listar guardados | `GET` | `/api/saved` | — |
| Guardar trend | `POST` | `/api/saved` | `{ trendId }` |
| Quitar guardado | `DELETE` | `/api/saved/{trendId}` | — |
| Listar folders | `GET` | `/api/folders` | — |
| Crear folder | `POST` | `/api/folders` | `{ name, color }` |
| Set folder de un trend | `PATCH` | `/api/saved/{trendId}` | `{ folderId }` |
| Toggle pin | `PATCH` | `/api/saved/{trendId}` | `{ pinned: boolean }` |
| Update nota | `PATCH` | `/api/saved/{trendId}` | `{ text: string }` |
| Exportar JSON | `GET` | `/api/saved/export?format=json` | — |
| Exportar MD | `GET` | `/api/saved/export?format=markdown` | — |

### Estados
- **success**: cards con animación staggered, toolbar con chips y sort
- **empty (no saved)**: estado motivacional con CTA
- **empty (filter no match)**: dashed box + botón "Ver todas las guardadas"
- **pinned**: borde `var(--hot)` en card + icon fill
- **expanded note**: textarea visible
- **loading**: no implementado
- **error**: no implementado

---

## MATRIZ CONSOLIDADA DE ENDPOINTS BACKEND

### Real-time (SSE / WebSocket)
| Stream | Cadencia | Origen | Destino UI |
|---|---|---|---|
| `/api/scan/stream` | 1.4s | TopBar (analyzed, latency, live) | TopBar waveform + counter |
| `/api/trends/stream` | 2.6s | TrendTimeline + AnalysisPanel + ExploreScreen | todas las series |
| `/api/engines/live` | 2s | LiveScan | verb + progress por motor |
| `/api/engines/logs/stream` | continuo | EnginesScreen | logs en vivo |
| `/api/alerts/stream` | on-event | AlertsScreen + LeftRail badge + TopBar bell | nuevos disparos |
| `/api/clock` | 10s | TopBar clock | (mejor cliente puro con `Date`) |

### REST on-demand
```
GET    /api/hero/summary
GET    /api/trends?q=
GET    /api/trends/{id}
GET    /api/trends/{id}/conversations
GET    /api/trends/{id}/sources
GET    /api/trends/{id}/history
GET    /api/trends/timeline?range=
POST   /api/ai/summarize             { trendId }
POST   /api/ai/executive-summary     { period }

GET    /api/engines
PATCH  /api/engines/{id}             { active }
POST   /api/engines/bulk-toggle      { active }
PUT    /api/engines/{id}/config      { interval, queries }
POST   /api/engines/{id}/test
GET    /api/engines/aggregate
GET    /api/engines/logs?limit=

GET    /api/alerts/rules
POST   /api/alerts/rules             { trendId, condition, threshold, channels }
PATCH  /api/alerts/rules/{id}        { active }
DELETE /api/alerts/rules/{id}
GET    /api/alerts/events?ack=
PATCH  /api/alerts/events/{id}       { ack }
POST   /api/alerts/events/ack-all
POST   /api/alerts/quick             { trendId }

GET    /api/saved
POST   /api/saved                    { trendId }
DELETE /api/saved/{trendId}
PATCH  /api/saved/{trendId}          { folderId?, pinned?, text? }
GET    /api/folders
POST   /api/folders                  { name, color }
GET    /api/saved/export?format=

GET    /api/reports?period=
POST   /api/reports/export           { period, format }

GET    /api/user/profile
PATCH  /api/user/profile
GET    /api/user/notifications
PATCH  /api/user/notifications
GET    /api/user/api-keys
POST   /api/user/api-keys/{id}       { key }
DELETE /api/user/api-keys/{id}
POST   /api/user/api-keys/{id}/test
GET    /api/system/info
PATCH  /api/user/preferences         { focusedEngine?, selectedTrendId?, ... }
```

---

## HALLAZGOS CRÍTICOS (riesgo de contrato)

### 1. **No existe capa de datos**
Cero `fetch`, cero `EventSource`, cero `WebSocket` en todo el código. Todo es `setInterval` + `Math.random()`. **El backend debe implementar desde cero la totalidad del streaming y la persistencia.**

### 2. **`step` es un heartbeat acoplado a 2.6s**
Hoy `step` es un entero que se incrementa y se pasa a `buildSeries(id, shape, range, step)` que usa un PRNG determinista (`makeRng(hash(id+range) + step*7919)`). El backend debe enviar **series reales** (`number[]` normalizadas 0–1 o valores absolutos) en lugar de delegar al cliente la generación.

### 3. **`shape` es un concepto cliente**
El `Trend.shape` (`accel | rise | flat | decay | wobble`) solo existe para alimentar `envelope()` que genera la curva. En un backend real, el `shape` se elimina y se reemplaza por `series: number[]`.

### 4. **Series normalizadas vs absolutas**
- TrendTimeline usa `values[i]` normalizado 0–1 y luego `Math.round(values[hoverIndex] * 120)` para el tooltip → **valor mock**. El backend debe enviar el valor real (menciones/hora) en cada punto.
- Sparkline de AnalysisPanel hace lo mismo (`62 - v * 56`).
- MiniSpark también.

**Recomendación**: el contrato de serie debe ser `Array<{ t: ISO, v: number }>` con `v` = menciones/hora reales. El frontend se encarga de normalizar para pintar.

### 5. **`color` y `tone` son responsabilidad de quién**
`Trend.color` (CSS string) y `Trend.tone` (`hot|cool|mint|muted`) están hoy en el mock. El backend debería enviar `tone` (calculado a partir de `confidence + delta`) y dejar `color` como constante client-side mapeada desde `tone`.

### 6. **Estados de error ausentes**
**Ningún componente implementa estado de error ni de loading**. Hay que añadir:
- TopBar: scanStatus degradado/caído
- TrendTimeline: skeleton de lanes
- AnalysisPanel: skeleton del card
- ExploreScreen: error del LLM (Nemotron)
- EnginesScreen: error por motor
- AlertsScreen: error de creación de regla

### 7. **`focusedEngine` (TopBar) no persiste**
Es `useState` local. Recargar la página pierde el foco. Debe ser preferencia de usuario (`PATCH /api/user/preferences`).

### 8. **`engines.length` vs `enginesActive.length`**
El HeroCard usa `ENGINES.length` (constante 7) para "motores activos". TopBar también. EnginesScreen usa `engines.length` (estado real del provider). **Inconsistencia**: el contrato debe ser siempre `activeEnginesCount` desde el backend.

### 9. **`analyzed` no tiene unidad clara**
TopBar dice "publicaciones analizadas". LiveScan dice "posts/historiados". **Unificar contrato**: `analyzedPosts: number` (total acumulado desde inicio de sesión del usuario o desde siempre).

### 10. **`time` en `Trend` es ambiguo**
Hoy es `'HH:MM'` (string). Debería ser ISO timestamp, y el cliente formatea con `Intl.RelativeTimeFormat` o similar.

### 11. **`evidence` con `value: string`**
Los valores pueden ser `'14'`, `'Lun 09:12'`, `'+0.3'`, `'No'`, `'bajo'`. **Tipado débil**. El contrato debería ser `{ label: string, value: string | number, type?: 'count' | 'datetime' | 'sentiment' | 'boolean' | 'enum' }`.

### 12. **`saved` y `alerts` (rápidas) vs `AlertRule`**
Hay dos sistemas de alertas paralelos:
- `alerts: string[]` (toggle rápido desde AnalysisPanel / ExploreScreen)
- `AlertRule[]` (sistema completo con condiciones, canales, thresholds en AlertsScreen)

**El backend debe unificar**. `alerts` (rápida) puede ser un shortcut que crea un `AlertRule` con defaults (`condition: 'mentions'`, `threshold: 50`, `channels: ['push']`). O eliminar `alerts` y solo exponer `AlertRule[]` con un flag `quick: boolean`.

### 13. **`Folder.color` acoplado a 4 valores CSS específicos**
`FOLDER_STYLES` solo mapea `var(--primary)`, `var(--hot)`, `var(--mint)`, `var(--cool)`. Si el backend permite folders arbitrarios con colores custom, hay que romper ese mapping. Sugerencia: limitar el backend a esos 4 colores o expandir el mapping.

### 14. **Exportación client-side vs server-side**
ReportsScreen y SavedScreen generan MD/PDF/JSON enteramente en el cliente. Esto significa que el backend debe enviar **todos los datos crudos** para que el cliente arme el reporte. Alternativa: `POST /api/reports/export` con layout server-side (PDF de mayor calidad).

### 15. **`ABOUT_STATS` hardcodeado**
`Versión 1.4.2`, `Build 2024.12.18`, `Uptime 99.94%` son literales. Deben venir de `GET /api/system/info`.

---

## PRÓXIMAS ACCIONES PARA EL BACKEND

1. **Definir el canal real-time primero**: SSE unificado vs WebSocket. Recomendado SSE por simplicidad y porque el frontend solo recibe (no envía eventos).
2. **Implementar los 6 streams de la matriz** con un único endpoint multiplexado: `GET /api/stream?channels=scan,trends,engines,alerts` → SSE con eventos tipados `{ channel, payload }`.
3. **Reemplazar mocks de `virahub-data.ts`**: `TRENDS`, `ENGINES`, `RANGE_CONFIG`, `buildSeries`, `smoothPath` (este último se queda, es cliente puro).
4. **Migrar `VirahubProvider`** a un wrapper que:
   - Hidrate estado inicial vía `GET /api/bootstrap` (trends, saved, alerts, engines, profile, prefs)
   - Abra el stream SSE en mount
   - Exponga acciones que llamen a los endpoints REST
5. **Añadir estados loading/error/empty** en cada componente (no están).
6. **Resolver la dualidad `alerts` vs `AlertRule[]`** antes de implementar.
7. **Definir esquema de `Trend.evidence`** con tipos fuertes.
8. **Persistir preferencias del usuario**: `focusedEngine`, `selectedTrendId`, `hiddenLanes`, `range`, `cardOpen` (hoy todo se pierde al recargar).
