# Contrato UI → Backend · VIRAHUB Terminal de Viralidad

> Generado por **Agent 1 — Auditor de Interfaz y Extracción de Contratos UI**.
> Fuente: lectura exhaustiva de `/home/z/my-project/components/`, `/home/z/my-project/lib/`, `/home/z/my-project/app/`.
>
> **Convención de fidelidad**: cada tipo/constante lleva la ruta `archivo:linea` y el código TS literal cuando aplica. Cuando un campo pedido en el brief *no existe* en el código real, se documenta explícitamente como `NO EXISTE` para que el backend no lo genere en vano. Cuando el campo existe con otro nombre, se hace explícito el mapeo.

---

## 0. Estado actual del frontend (consecuencia crítica para el backend)

**El frontend NO hace ningún `fetch` ni `EventSource`.** Todo el "live data" es simulado por `setInterval` + `Math.random` + un PRNG sembrado determinista. Concretamente:

| Lugar | Qué hace | Línea |
|---|---|---|
| `components/virahub-provider.tsx` | `setInterval(() => setStep((s) => s + 1), 2600)` heartbeat | L. 80–84 |
| `components/virahub-provider.tsx` | `setAnalyzed((n) => n + 7 + Math.floor(Math.random() * 23))` | L. 90 |
| `components/virahub-provider.tsx` | `setLatency(() => Number((1 + Math.random() * 0.6).toFixed(1)))` | L. 91 |
| `components/virahub-provider.tsx` | `setClock(...)` cada 10s | L. 96–106 |
| `lib/virahub-data.ts` `makeRng(seed)` | PRNG LCG determinista para series falsas | L. 176–183 |
| `lib/virahub-data.ts` `buildSeries(...)` | Genera series temporales normalizadas 0..1 por (id, shape, range, step) | L. 209–225 |
| `components/live-scan.tsx` | verbos rotatorios + `progress = 18 + ((step * 17 + i * 29) % 80)` | L. 16, 100 |
| `components/top-bar.tsx` `Waveform` | `Math.sin(i * 0.7)` | L. 41 |
| `components/screens/alerts-screen.tsx` | `INITIAL_RULES`, `TRIGGERED` hardcodeados | L. 145–232 |
| `components/screens/engines-screen.tsx` | `INITIAL_LOGS` hardcodeados | L. 130–141 |
| `components/screens/saved-screen.tsx` | `INITIAL_FOLDERS` + `notes` iniciales hardcodeados | L. 39–77 |
| `components/screens/reports-screen.tsx` | `PERIOD_DATA` hardcoded | L. 36–96 |
| `components/screens/settings-screen.tsx` | `INITIAL_API_KEYS` hardcoded | L. 72–97 |
| `lib/virahub-data.ts` `TRENDS` | 6 trends hardcodeadas | L. 35–165 |

**Implicación para el backend**: TODO es reemplazable. No hay que respetar ninguna llamada existente. El contrato abajo describe (a) qué tipos ya están definidos en TS y hay que respetar 1:1, y (b) qué tipos/eventos/endpoints hay que **añadir** para reemplazar las simulaciones.

---

## 1. Tipo `SourceKey` y Motores

### 1.1 `SourceKey` — definición literal

`lib/virahub-data.ts:5-14`:

```ts
export type SourceKey =
  | 'reddit'
  | 'bluesky'
  | 'hn'
  | 'rss'
  | 'gdelt'
  | 'github'
  | 'x'
  | 'nvidia'
  | 'crypto'
```

**9 valores totales.** Ojo: `nvidia` y `crypto` NO son motores de captura, son "temas" usados como `source` de algunos trends (p.ej. el trend "Nuevo chip de Nvidia" tiene `source: 'nvidia'`, y "Cripto se recupera" tiene `source: 'crypto'`). Solo 7 son motores activables.

### 1.2 Tabla maestra de sources

| `SourceKey` | Label humano | Color brand (CSS) | Icon component | Tile bg | ¿Es motor? | Datos que la UI muestra para este source |
|---|---|---|---|---|---|---|
| `reddit` | Reddit | `var(--hot)` / tile `bg-[#ff4500] text-white` | `RedditIcon` | `#ff4500` | ✅ | Trend: title, mentions/h, delta, why, evidence. Engine: intervalo scan, subreddits, OAuth, rate 60 req/min, rpm, latencia, lastSync, logs |
| `bluesky` | Bluesky | `oklch(0.72 0.21 300)` / tile `bg-[#0a7aff] text-white` | `BlueskyIcon` | `#0a7aff` | ✅ | Trend + Engine: firehose, filtros idioma/tema, OAuth, 5000 evt/min |
| `x` | X (Twitter) | `oklch(0.72 0.18 0)` / tile `bg-black text-white` | `XIcon` | `black` | ✅ | Trend + Engine: timeline pública, hashtags, OAuth, 450 req/15min |
| `hn` | Hacker News | `oklch(0.72 0.16 60)` / tile `bg-[#ff6600] text-white` | `HnIcon` (texto "HN") | `#ff6600` | ✅ | Trend + Engine: front page + comentarios, anónimo, sin límite |
| `rss` | RSS Feeds | `oklch(0.70 0.13 220)` / tile `bg-[#f26522] text-white` | `RssIcon` | `#f26522` | ✅ | Trend + Engine: feeds RSS/Atom, dedup, anónimo, 100 feeds |
| `gdelt` | GDELT | `oklch(0.65 0.18 265)` / tile `bg-[#3b4ee0] text-white` | `GdeltIcon` | `#3b4ee0` | ✅ | Trend + Engine: GDELT 2.0, eventos globales, API Key, 300 req/día |
| `github` | GitHub | `oklch(0.70 0.05 270)` / tile `bg-[#1c1c22] text-white` | `GithubIcon` | `#1c1c22` | ✅ | Trend + Engine: repos + changelogs, API Key, 5000 req/h |
| `nvidia` | Nvidia (tema) | `oklch(0.78 0.16 140)` / tile `bg-[#76b900] text-black` | `NvidiaIcon` | `#76b900` | ❌ | Trend únicamente (usado como origen temático, no como motor capturable) |
| `crypto` | Cripto (tema) | `var(--mint)` / tile `bg-[oklch(0.45_0.12_165)] text-white` | `CryptoIcon` | oklch | ❌ | Trend únicamente |

Mapa de colores centralizado en `lib/scoring.ts:768-778` (`SOURCE_COLOR: Record<SourceKey, string>`). Ícono `solo` (sin tile) y `tile` (con bg de marca) en `components/source-icon.tsx:15-29`.

### 1.3 `ENGINES` (constante, 7 motores)

`lib/virahub-data.ts:245-253`:

```ts
export const ENGINES = [
  { id: 'reddit',  name: 'Reddit',       verbs: ['Extrayendo…', 'Rastreando…', 'Leyendo hilos…'] },
  { id: 'bluesky', name: 'Bluesky',      verbs: ['Analizando…', 'Escuchando…', 'Midiendo señal…'] },
  { id: 'x',       name: 'X (Twitter)',  verbs: ['Escaneando…', 'Monitoreando…', 'Detectando…'] },
  { id: 'hn',      name: 'Hacker News',  verbs: ['Clasificando…', 'Puntuando…', 'Ordenando…'] },
  { id: 'rss',     name: 'RSS Feeds',    verbs: ['Indexando…', 'Sincronizando…', 'Deduplicando…'] },
  { id: 'gdelt',   name: 'GDELT',        verbs: ['Procesando…', 'Traduciendo…', 'Geolocalizando…'] },
  { id: 'github',  name: 'GitHub',       verbs: ['Verificando…', 'Comparando…', 'Vigilando repos…'] },
] as const
```

`name` y `verbs` son UI-only. El `verbs` se cicla en `LiveScan` cada 2400 ms (`live-scan.tsx:16`). El backend no necesita proveerlos, pero **sí** debe respetar los `id` exactos.

### 1.4 `ENGINE_META` (metadata extendida por motor, solo UI configuracional)

`components/screens/engines-screen.tsx:30-120`. Cada entrada:

```ts
type EngineMeta = {
  id: SourceKey
  description: string
  defaultInterval: number      // minutos
  intervalOptions: number[]    // opciones del selector
  queryLabel: string           // p.ej. "Subreddits"
  queryPlaceholder: string
  defaultQueries: string[]
  rateLimit: string            // p.ej. "60 req/min"
  auth: 'OAuth' | 'API Key' | 'Anónimo' | 'Webhook'
}
```

Esto es configuración estática. El backend debe persistir `interval` y `queries` por motor y por usuario.

---

## 2. Tipo `Trend` — contrato exacto consumido por la UI

`lib/virahub-data.ts:16-33`:

```ts
export type Shape = 'accel' | 'rise' | 'flat' | 'decay' | 'wobble'

export type Trend = {
  id: string
  title: string
  source: SourceKey
  color: string
  status: string
  tone: 'hot' | 'cool' | 'mint' | 'muted'
  dir: 'up' | 'down' | 'flat'
  time: string                 // formato "HH:MM" (agoMin desde lastSeen)
  heat: string                 // 'Muy caliente' | 'Caliente' | 'Templado' | 'Enfriándose'
  confidence: number           // 0..100  (UI lo llama "confianza")
  mentions: number             // UI muestra esto como "menciones/hora"
  delta: number                // signed %, capped ±999
  shape: Shape
  why: string                  // briefing 1-sentence
  evidence: { label: string; value: string }[]
  inTimeline?: boolean         // si se muestra en trend-timeline
}
```

### 2.1 Mapeo con el brief del task

| Campo pedido en el brief | Estado real | Notas |
|---|---|---|
| `id` | ✅ `id: string` | |
| `title` | ✅ `title: string` | |
| `summary` | ✅ se llama `why: string` | Es la frase "Por qué importa". |
| `source` | ✅ `source: SourceKey` | Origen principal del trend |
| `score` | ✅ se llama `confidence: number` (0..100) | UI lo muestra como "{confidence} confianza". |
| `velocity` | ✅ se llama `mentions: number` (menciones/hora) | En `scoring.ts:760` `mentions: m.velocity // UI shows menciones/hora`. |
| `phase` | ✅ se llama `shape: Shape` (`'accel'|'rise'|'flat'|'decay'|'wobble'`) | Equivale a las "4 fases" + `wobble` (ruido). |
| `mentions` | ✅ `mentions: number` | Atención: el valor DISPLAYED es la VELOCIDAD por hora, no el conteo absoluto de menciones. |
| `uniqueAuthors` | ❌ **NO EXISTE en `Trend`** | Existe solo en `NarrativeMetrics` (`lib/scoring.ts:96`) como valor intermedio, pero no se expone al UI directamente. |
| `firstSeen` | ❌ **NO EXISTE en `Trend`** | Existe en `NarrativeMetrics:111` (`firstSeen: number`, epoch ms). El backend debería exponerlo si lo quiere mostrar. |
| `lastSeen` | ❌ **NO EXISTE en `Trend`** | Existe en `NarrativeMetrics:111`. El campo `Trend.time` sí deriva de `lastSeen` (`scoring.ts:745-747`: `agoMin = (now - lastSeen) / 60_000`, formateado `HH:MM`). |
| `originator` | ❌ **NO EXISTE en `Trend`** | Existe como `originatorAuthorId?: string` en `NarrativeMetrics:113` y se expone dentro de `evidence` con label `'Origen'` (`scoring.ts:506-513`). |
| `sources` (array de SourceKey con per-source counts) | ❌ **NO EXISTE en `Trend`** | El `FuentesPanel` en `explore-screen.tsx:397-453` lo **simula localmente** con arrays hardcodeados `[312, 128, 244, 61, 18, 42, 96]` (pct) y `[14, 9, 11, 3, 5, 8, 2]` (menc). El backend debería añadir un campo `sources?: { source: SourceKey; mentions: number; pct: number }[]` a `Trend` o devolverlo en `GET /api/v1/trends/:id/sources`. |
| `brief` (string) | ✅ se llama `why: string` | La UI adicionalmente genera un párrafo IA-estilo en `explore-screen.tsx:296-300` concatenando `trend.why + trend.delta + trend.confidence + trend.source + trend.mentions`. |
| `tags` | ❌ **NO EXISTE en ninguna parte** | No implementado. |
| `hasMedia` | ❌ **NO EXISTE en `Trend`** | Existe `mediaSources: number` (conteo, no bool) en `NarrativeMetrics:112`. Se expone como `evidence` con label `'Medios'` (`scoring.ts:499-504`). |
| `history` (timeseries) | ❌ **NO EXISTE en `Trend`** | La UI **genera** la timeseries client-side vía `buildSeries(id, shape, range, step)` (`virahub-data.ts:209`), con un PRNG determinista. **No se pide al backend** porque el frontend ya la sintetiza — pero ver §9. |

### 2.2 Campos extra que el UI consume implícitamente

| Campo | Tipo | Origen | Uso |
|---|---|---|---|
| `color` | `string` (CSS color) | `SOURCE_COLOR` (`scoring.ts:768`) por `source`, o hardcodeado por trend en `TRENDS` | Stroke del sparkline, dot, fill del lane |
| `status` | `string` (frase ES) | `deriveStatus()` (`scoring.ts:420-438`) | Chip de estado en `analysis-panel.tsx:213-215`, hero de `explore-screen.tsx:47` |
| `tone` | `'hot'|'cool'|'mint'|'muted'` | `TONE_BY_HEAT[heat]` (`scoring.ts:780-785`) | Color semántico en paneles y badges |
| `dir` | `'up'|'down'|'flat'` | `detectDirection()` (`scoring.ts:386-391`) | Icono flecha en `DirIcon` (`analysis-panel.tsx:30-53`) |
| `heat` | `string` | `heatLabel(score)` (`scoring.ts:411-414`) sobre `HEAT_BANDS` (`scoring.ts:151-156`) | Badge "Muy caliente"/"Caliente"/"Templado"/"Enfriándose" |
| `time` | `string` "HH:MM" | `toTrend()` (`scoring.ts:744-747`) formatea `agoMin` | Texto del panel |
| `evidence` | `{label, value}[]` (max 3) | `buildEvidence()` (`scoring.ts:475-562`) | 3 chips en `analysis-panel.tsx:340-354`, tabla en `explore-screen.tsx:313-323` |

### 2.3 Strings de `status` válidos (UI los compara con igualdad estricta)

Producidos por `deriveStatus()` (`scoring.ts:420-438`):

```
'Crecimiento acelerado'
'Interés en descenso'
'Señal débil'
'Rumor en crecimiento'
'Señal emergente'
'Actividad estable'
'Actividad inestable'
```

`explore-screen.tsx:36` hardcodea también `"CRECIENDO FUERTE"` pero solo como badge decorativo del header.

### 2.4 Strings de `heat` válidos

`HEAT_BANDS` (`scoring.ts:151-156`):

```
'Muy caliente'  (score ≥ 0.85)
'Caliente'      (score ≥ 0.60)
'Templado'      (score ≥ 0.30)
'Enfriándose'   (score ≥ 0.00)
```

---

## 3. Tipo `AnalysisBriefing`

### 3.1 NO existe como tipo definido

La UI no define ni consume un objeto `AnalysisBriefing`. Lo que sí hace:

1. **`explore-screen.tsx:286-331` (`AnalisisIAPanel`)** genera el "resumen IA" **client-side** interpolando strings:
   ```tsx
   <span className="...">Nemotron-3-Ultra · generado hace 2min</span>
   <p>
     {trend.why} La señal muestra una aceleración del {trend.delta > 0 ? '+' : ''}{trend.delta}%
     en las últimas horas, con una confiabilidad del {trend.confidence}%.
     Las menciones provienen principalmente de {trend.source}, con una velocidad de
     {trend.mentions} menciones por hora. {trend.delta > 100
       ? 'Este patrón coincide con tendencias que posteriormente alcanzaron cobertura mediática amplia.'
       : 'La tendencia aún no ha alcanzado el umbral de amplificación masiva.'}
   </p>
   ```
   Y al pie: `Nemotron-3-Ultra-550B  thinking:false · 312 tokens · 4.2s` — todo hardcoded (`explore-screen.tsx:326-327`).

2. **`reports-screen.tsx:393-410`** ("Resumen ejecutivo") también genera texto IA-estilo concatenando `data.detected`, `data.confirmed`, etc., con badge `generado por Nemotron-3-Ultra`.

### 3.2 Contrato propuesto para el backend

Dado que el panel `Análisis IA` necesita datos reales, proponemos el siguiente tipo (a definir en `lib/virahub-data.ts`):

```ts
export type AnalysisBriefing = {
  trendId: string
  narrative: string                 // párrafo principal (>2 frases)
  keyPoints: string[]               // 3–5 bullets
  riskFlags: string[]               // p.ej. ["bot_score alto", "single-source", "recycled_30d"]
  confidence: number                // 0..100, confianza del briefing (no del trend)
  model: string                     // p.ej. "nemotron-3-ultra-550b"
  thinking: boolean                 // si se usó modo "thinking"
  tokensUsed: number                // total tokens (prompt + completion)
  latencyMs: number                 // tiempo de generación
  generatedAt: number               // epoch ms
}
```

El UI actual renderiza directamente `model`, `thinking`, `tokensUsed`, `latencyMs` (segundos). El campo `generatedAt` debe poder formatearse como "generado hace Xmin" relativo a `now`.

**Cache sugerido**: el briefing debería cachearse por `trendId` y regenerarse solo cuando `trend.delta` cambia >25% o cada 5 min.

---

## 4. Tipo `EngineStatus`

### 4.1 Lo que la UI realmente muestra por motor (engines-screen.tsx)

Cada card de motor muestra estos datos (todos derivados localmente salvo `engines[]` que es el toggle on/off):

| Campo mostrado | Tipo | Source real | Línea |
|---|---|---|---|
| `id` | `SourceKey` | `ENGINE_META.id` | 278 |
| `name` | `string` | `ENGINES.find(...).name` | 282 |
| `description` | `string` | `ENGINE_META.description` | 318 |
| `auth` | `'OAuth'\|'API Key'\|'Anónimo'\|'Webhook'` | `ENGINE_META.auth` | 315 |
| `isActive` | `boolean` | `engines.includes(meta.id)` (toggle del provider) | 279 |
| `interval` | `number` (min) | `configs[id].interval` (estado local) | 350 |
| `queries` | `string[]` | `configs[id].queries` (estado local) | 383 |
| `rateLimit` | `string` | `ENGINE_META.rateLimit` | 371 |
| `rpm` | `number` (menc/min) | **SIMULADO**: `8 + queries.length * 3` si activo, 0 si no | 283 |
| `latency` | `number` (s) | **SIMULADO**: `0.6 + queries.length * 0.18` | 284 |
| `lastSync` | `string` | **SIMULADO**: `'hace 1 min'` o `'—'` | 285 |

### 4.2 `LogEntry` (logs de actividad)

`engines-screen.tsx:122-128`:

```ts
type LogEntry = {
  id: string
  engine: SourceKey
  ts: string                      // formato "HH:MM:SS"
  level: 'info' | 'warn' | 'error'
  message: string
}
```

10 entradas hardcodeadas en `INITIAL_LOGS` (`engines-screen.tsx:130-141`).

### 4.3 Contrato propuesto `EngineStatus`

El brief pide `status: 'online'|'degraded'|'offline'`. La UI actual solo maneja activo/pausado (binario). Proponemos añadir el estado de salud del motor:

```ts
export type EngineStatus = {
  id: SourceKey
  name: string                    // puede derivarse de ENGINES en el cliente
  description: string             // puede derivarse de ENGINE_META en el cliente
  auth: 'OAuth' | 'API Key' | 'Anónimo' | 'Webhook'
  rateLimit: string               // display string
  active: boolean                 // toggle del usuario
  health: 'online' | 'degraded' | 'offline'
  interval: number                // min, configuración persistida
  queries: string[]               // configuración persistida
  lastRun: number                 // epoch ms
  itemsIngested: number           // menciones totales desde arranque
  errors: number                  // contador de errores en último 1h
  latencyMs: number               // latencia p50 de la última ronda
  rpm: number                     // menciones/min actuales
  logEntries: LogEntry[]          // últimos N logs
}
```

`health` mapearía al color del badge en UI: `online → mint`, `degraded → hot`, `offline → muted`.

### 4.4 Métricas agregadas que la UI calcula

`engines-screen.tsx:171-183`:

```ts
const totalRpm = active.length * 12 + 24           // SIMULADO
const avgLatency = active.length ? 1 + active.length * 0.18 : 0  // SIMULADO
const totalQueries = active.reduce((sum, m) => sum + (configs[m.id]?.queries.length ?? 0), 0)
```

`active.length` y `totalQueries` son reales (basados en `engines[]` y `configs`). `totalRpm` y `avgLatency` son simulados — el backend debería proveerlos.

---

## 5. Tipos `Alert`, `SavedTrend`, `UserProfile`, `NotificationSettings`, `ApiKey`

### 5.1 `AlertRule` (alertas)

`components/screens/alerts-screen.tsx:41-51`:

```ts
type ConditionKey = 'mentions' | 'velocity' | 'phase' | 'source_count' | 'sentiment'
type Channel = 'email' | 'push' | 'slack'

type AlertRule = {
  id: string
  trendId: string
  condition: ConditionKey
  threshold: number
  channels: Channel[]
  active: boolean
  lastTriggered: string | null     // "HH:MM" o null
  triggeredCount: number
  createdAt: string                // "hace 4 días" (string relativo ES)
}
```

### 5.2 `TriggeredEvent` (disparos de alertas)

`alerts-screen.tsx:53-62`:

```ts
type TriggeredEvent = {
  id: string
  time: string                     // "HH:MM"
  ruleId: string
  trendId: string
  title: string
  tone: Trend['tone']
  detail: string
  ack: boolean                     // acknowledged por usuario
}
```

### 5.3 `CONDITIONS` (metadata estática por condición)

`alerts-screen.tsx:64-130` — UI-only, no es data del backend. Define `label`, `description`, `Icon`, `unit`, `defaultThreshold`, `min`, `max`, `step` para el slider.

### 5.4 `SavedTrend` / `Note` / `Folder`

El provider solo guarda `saved: string[]` (array de trendIds) en `virahub-provider.tsx:36`. La `SavedScreen` extiende con metadatos locales:

`saved-screen.tsx:25-37`:

```ts
type Folder = {
  id: string
  name: string
  color: string                    // una de las CSS vars: 'var(--primary)' | 'var(--hot)' | 'var(--mint)' | 'var(--cool)'
}

type Note = {
  trendId: string
  folderId: string | null
  text: string
  pinned: boolean
  addedAt: string                  // "hace 2 días"
}
```

Carpetas iniciales hardcodeadas: Tecnología, Política, Mercados, Watchlist (`saved-screen.tsx:39-44`).

**Contrato propuesto `SavedTrend`** para el backend:

```ts
export type SavedTrend = {
  trendId: string
  userId: string
  folderId: string | null
  note: string
  pinned: boolean
  addedAt: number                  // epoch ms (UI formatea a "hace X")
}
```

### 5.5 `UserProfile`

No hay un tipo definido. La UI maneja campos sueltos en `settings-screen.tsx:150-154`:

```ts
displayName: string = 'Usuario Virahub'
email: string = 'user@virahub.io'
lang: string = 'es'                // código ISO: 'es' | 'en' | 'pt' | 'fr'
timezone: string = 'Europe/Madrid'
theme: 'dark' | 'light' | 'system' = 'dark'
```

**Contrato propuesto**:

```ts
export type UserProfile = {
  id: string
  displayName: string
  email: string
  lang: 'es' | 'en' | 'pt' | 'fr'
  timezone: string                 // IANA tz, p.ej. 'Europe/Madrid'
  theme: 'dark' | 'light' | 'system'
  avatarUrl?: string
  createdAt: number
}
```

### 5.6 `NotificationSettings`

`settings-screen.tsx:157-168`:

```ts
const [notifPrefs, setNotifPrefs] = useState({
  emailEnabled: boolean,
  pushEnabled: boolean,
  slackEnabled: boolean,
  slackWebhook: string,
  dailyDigest: boolean,
  weeklyDigest: boolean,
  mentionThreshold: number,        // 10..200 step 5
  velocityThreshold: number,       // 20..300 step 10
  quietHoursStart: string,         // "HH:MM"
  quietHoursEnd: string,           // "HH:MM"
})
```

### 5.7 `ApiKey`

`settings-screen.tsx:65-70`:

```ts
type ApiKeyState = {
  key: string                      // valor real (solo se muestra si visible=true)
  masked: string                   // p.ej. "nvapi-3f2a••••••••••••••••••••1c3b"
  visible: boolean                 // toggle mostrar/ocultar
  status: 'unset' | 'valid' | 'invalid'
}
```

Metadata estática `API_KEY_META` (`settings-screen.tsx:99-134`) con 4 entradas: `nvidia` (Nemotron), `upstash` (Redis), `reddit` (OAuth), `gdelt`. Cada una con `label`, `description`, `placeholder`, `docsUrl`.

> **Crítico para el backend**: el comentario en `settings-screen.tsx:638-640` dice *"Las claves se cifran en reposo y nunca se exponen al cliente. Solo se usan server-side."* El backend **nunca** debe devolver `key` en claro al cliente; solo `masked` + `status`. La UI actual rompe esta regla porque guarda el key en state local — hay que migrar a un endpoint server-side que valide y persista sin devolver el plaintext.

---

## 6. Tipo SSE Event

### 6.1 NO existe `EventSource` ni SSE en el código actual

Toda la "liveness" es por `setInterval` (ver §0). El provider no tiene `useEffect` que abra un stream. **El contrato siguiente es lo que la UI NECESITA** para eliminar las simulaciones:

### 6.2 Eventos SSE propuestos

```
GET /api/v1/stream
Content-Type: text/event-stream
```

Cada evento: `event: <name>\ndata: <JSON>\n\n`

| Event name | Cadencia esperada | Payload | Reemplaza a (en código actual) |
|---|---|---|---|
| `scan.tick` | ~1.4s | `{ analyzed: number, latency: number, clock: string }` | `setInterval` en `virahub-provider.tsx:89-94` |
| `trend.upserted` | on-change | `{ trend: Trend }` | step++ regenerando `buildSeries()` (`virahub-provider.tsx:82`) |
| `trend.velocity_spike` | event-driven | `{ trendId: string, delta: number, velocity: number, prevVelocity: number }` | no existe (futuro: triggers `notify()` toast) |
| `trend.phase_changed` | event-driven | `{ trendId: string, oldShape: Shape, newShape: Shape }` | no existe |
| `engine.status_changed` | on-change | `{ engine: EngineStatus }` | `engines[]` toggle local (`virahub-provider.tsx:71`) |
| `engine.log_appended` | on-event | `{ log: LogEntry }` | `INITIAL_LOGS` hardcodeado |
| `alert.triggered` | event-driven | `{ event: TriggeredEvent }` | `TRIGGERED` hardcodeado + `stats.unack` contador |
| `alert.acknowledged` | on-action | `{ eventId: string, userId: string }` | `ackEvent()` local (`alerts-screen.tsx:273-275`) |
| `briefing.generated` | on-demand / 5 min | `{ trendId: string, briefing: AnalysisBriefing }` | texto hardcoded en `explore-screen.tsx:296-300` |
| `report.updated` | on-aggregate | `{ period: 'today'|'week'|'month', data: ReportData }` | `PERIOD_DATA` hardcoded |
| `connection.heartbeat` | 30s | `{ ts: number }` | para detectar disconnects |
| `connection.lost` | server-side | `{ reason: string }` | para pausar `live` automáticamente |

### 6.3 Campo `step` — eliminable

`virahub-provider.tsx:67` mantiene `step: number` que se incrementa cada 2600 ms y se pasa a `buildSeries(id, shape, range, step)` para regenerar las series. Si el backend envía `trend.upserted` con arrays `history` ya pre-computados (ver §9), `step` deja de ser necesario. Si no, el cliente puede seguir derivándolo localmente del timestamp del último `scan.tick`.

---

## 7. Tipo `ScreenKey`

`components/virahub-provider.tsx:14-21`:

```ts
export type ScreenKey =
  | 'radar'
  | 'explorar'
  | 'alertas'
  | 'guardados'
  | 'motores'
  | 'informes'
  | 'ajustes'
```

7 pantallas. Router en `app/page.tsx:18-36` (`ScreenRouter`). Default: `'radar'`.

LeftRail (`left-rail.tsx:16-24`) mapea cada ScreenKey a icono + label:

| ScreenKey | Label | Icon |
|---|---|---|
| `radar` | Radar | `Target` |
| `explorar` | Explorar | `Search` |
| `alertas` | Alertas | `Bell` |
| `guardados` | Guardados | `Bookmark` |
| `motores` | Motores | `Layers` |
| `informes` | Informes | `ScrollText` |
| `ajustes` | Ajustes | `Settings` |

---

## 8. API endpoints que el frontend necesitará

> Ninguno existe hoy. Todos los datos son simulados. El backend debe implementar lo siguiente para reemplazar las simulaciones 1:1.

### 8.1 Trends

#### `GET /api/v1/trends`
Lista de trends activos. Reemplaza la constante `TRENDS` (`virahub-data.ts:35-165`).

**Query params**:
- `source?: SourceKey` — filtrar por fuente
- `phase?: Shape` — filtrar por `accel|rise|flat|decay|wobble` (UI lo llama `shape`)
- `minScore?: number` — mínimo `confidence` (0..100)
- `q?: string` — búsqueda full-text en `title` + `why` (ver `explore-screen.tsx:25-28` para el patrón)
- `cursor?: string` — paginación (keyset, no offset)
- `limit?: number` — default 50
- `range?: RangeKey` — `'1H'|'6H'|'24H'|'7D'` default `'6H'` (afecta el cálculo de `mentions`, `delta`, `shape`)

**Response 200**:
```ts
{
  trends: Trend[]
  nextCursor: string | null
  total: number
}
```

#### `GET /api/v1/trends/:id`
Un trend individual. Reemplaza `TRENDS.find(t => t.id === selectedId)` en `virahub-provider.tsx:157-160`.

**Response 200**: `Trend` (extender con `sources?: { source: SourceKey; mentions: number; pct: number }[]` para el FuentesPanel).

#### `GET /api/v1/trends/:id/briefing`
Briefing IA. Reemplaza la generación client-side en `explore-screen.tsx:296-300`.

**Query params**: `force?: boolean` (regenerar ignorando cache).

**Response 200**: `AnalysisBriefing` (ver §3.2).

**Response 202** (si la generación es async):
```ts
{ status: 'generating', estimatedMs: number }
```
El cliente recibe el resultado vía SSE `briefing.generated`.

#### `GET /api/v1/trends/:id/history`
Timeseries normalizada 0..1 para el sparkline. Reemplazaría `buildSeries()` (`virahub-data.ts:209`).

**Query params**: `range: RangeKey`, `points: number`.

**Response 200**:
```ts
{
  points: number[]              // 0..1, longitud = RANGE_CONFIG[range].points
  labels: string[]              // RANGE_CONFIG[range].labels
}
```
> **Alternativa**: el cliente puede seguir usando `buildSeries()` como fallback si el backend no responde, ya que el PRNG es determinista y produce curvas estéticamente válidas. Pero esto oculta la señal real. Recomendado: backend provee `history`, cliente degrada a `buildSeries()` solo si 404/timeout.

#### `POST /api/v1/trends/:id/save`
Añadir a guardados. Reemplaza `toggleSaved()` en `virahub-provider.tsx:124-133`.

**Request body** (opcional):
```ts
{ folderId?: string, note?: string, pinned?: boolean }
```
**Response 201**: `SavedTrend`.

#### `DELETE /api/v1/saved/:id`
Quitar de guardados. Reemplaza el `toggle` cuando `has === true`.

**Response 204**.

#### `POST /api/v1/saved/:id/pin`
Toggle pin. Reemplaza `setNote(t.id, { pinned: !note?.pinned })` en `saved-screen.tsx:420`.

**Request body**: `{ pinned: boolean }`.
**Response 200**: `SavedTrend`.

#### `PATCH /api/v1/saved/:id`
Actualizar nota/carpeta.

**Request body**: `{ folderId?: string | null, note?: string }`.
**Response 200**: `SavedTrend`.

### 8.2 Engines

#### `GET /api/v1/engines`
Estado de los 7 motores. Reemplaza el cálculo en `engines-screen.tsx:171-183` y `INITIAL_LOGS`.

**Response 200**:
```ts
{
  engines: EngineStatus[]        // ver §4.3
  aggregate: {
    activeCount: number
    totalCount: number           // = 7
    totalRpm: number
    avgLatency: number           // segundos
    totalQueries: number
  }
}
```

#### `POST /api/v1/engines/:id/toggle`
Toggle on/off. Reemplaza `toggleEngine()` en `virahub-provider.tsx:146-155`.

**Request body**: `{ active: boolean }`.
**Response 200**: `EngineStatus`.

#### `PATCH /api/v1/engines/:id/config`
Actualizar `interval` y `queries`. Reemplaza `saveConfig()` en `engines-screen.tsx:204-207`.

**Request body**: `{ interval?: number, queries?: string[] }`.
**Response 200**: `EngineStatus`.

#### `POST /api/v1/engines/:id/test`
Test de conexión. Reemplaza `notify(\`Test de conexión: ${engine?.name} OK\`)` en `engines-screen.tsx:446`.

**Response 200**: `{ ok: boolean, latencyMs: number, message: string }`.

#### `GET /api/v1/engines/:id/logs`
Logs paginados por motor. Reemplaza `INITIAL_LOGS` (actualmente global, no filtrado por motor).

**Query params**: `level?: 'info'|'warn'|'error'`, `cursor?: string`, `limit?: number` default 50.

**Response 200**:
```ts
{
  logs: LogEntry[]
  nextCursor: string | null
  retainedUntil: number          // epoch ms, actualmente UI muestra "Logs retenidos 7 días"
}
```

### 8.3 Alerts

#### `GET /api/v1/alerts`
Lista de reglas + eventos triggered. Reemplaza `INITIAL_RULES` + `TRIGGERED` (`alerts-screen.tsx:145-232`).

**Query params**: `active?: boolean`, `cursor?: string`.

**Response 200**:
```ts
{
  rules: AlertRule[]
  events: TriggeredEvent[]
  stats: {
    active: number
    triggeredToday: number
    unack: number
    totalTriggers: number
  }
}
```

#### `POST /api/v1/alerts`
Crear regla. Reemplaza `addRule()` en `alerts-screen.tsx:281-283` (que solo actualiza state local).

**Request body**:
```ts
{
  trendId: string
  condition: ConditionKey
  threshold: number
  channels: Channel[]
  active?: boolean               // default true
}
```
**Response 201**: `AlertRule`.

#### `PATCH /api/v1/alerts/:id`
Actualizar regla (toggle `active`, cambiar `threshold`, etc.). Reemplaza `toggleRuleActive()` (`alerts-screen.tsx:263-267`).

**Request body**: `Partial<AlertRule>`.
**Response 200**: `AlertRule`.

#### `DELETE /api/v1/alerts/:id`
Borrar regla. Reemplaza `deleteRule()` (`alerts-screen.tsx:269-271`).

**Response 204**.

#### `POST /api/v1/alerts/events/:id/ack`
Marcar evento como revisado. Reemplaza `ackEvent()` (`alerts-screen.tsx:273-275`).

**Response 200**: `TriggeredEvent` (con `ack: true`).

#### `POST /api/v1/alerts/events/ack-all`
Marcar todos como revisados. Reemplaza `ackAll()` (`alerts-screen.tsx:277-279`).

**Query params**: `?trendId=...` opcional para ack-all de un trend.

**Response 200**: `{ acked: number }`.

### 8.4 Saved

#### `GET /api/v1/saved`
Lista de guardados con notas y carpetas.

**Query params**: `folderId?: string`, `q?: string`, `sort?: 'recent'|'mentions'|'delta'|'confidence'`, `cursor?: string`.

**Response 200**:
```ts
{
  items: SavedTrend[]
  folders: Folder[]
  counts: {
    total: number
    pinned: number
    none: number
    byFolder: Record<string, number>
  }
  nextCursor: string | null
}
```

### 8.5 Reports

#### `GET /api/v1/reports?period=today|week|month`
Reemplaza `PERIOD_DATA` hardcoded (`reports-screen.tsx:36-96`).

**Response 200**:
```ts
{
  period: 'today' | 'week' | 'month'
  detected: number
  confirmed: number
  accuracy: number               // 0..100
  leadTime: number               // horas
  topTrendDelta: number          // %
  bySource: { source: SourceKey; count: number; pct: number }[]
  hourly: number[]               // longitud 16 (o configurable)
  topTrends: Trend[]             // ranking por delta
  executiveSummary: string       // texto IA generado
}
```

### 8.6 Settings

#### `GET /api/v1/profile` / `PATCH /api/v1/profile`
Reemplaza state local en `settings-screen.tsx:153-154`.

#### `GET /api/v1/notifications` / `PATCH /api/v1/notifications`
Reemplaza `notifPrefs` state (`settings-screen.tsx:157-168`).

#### `GET /api/v1/api-keys` / `PUT /api/v1/api-keys/:id` / `DELETE /api/v1/api-keys/:id`
Reemplaza `INITIAL_API_KEYS` (`settings-screen.tsx:72-97`).

**GET Response 200**:
```ts
{
  keys: {
    nvidia: { status: 'unset'|'valid'|'invalid', masked: string, lastValidatedAt: number }
    upstash: ...
    reddit: ...
    gdelt: ...
  }
}
```
> Nunca devolver `key` en claro.

**PUT Request**: `{ key: string }`.
**PUT Response 200**: `{ status: 'valid'|'invalid', masked: string }` (validación server-side).

#### `GET /api/v1/system/about`
Stats informativos. Reemplaza `ABOUT_STATS` hardcoded (`settings-screen.tsx:136-143`):

```ts
{
  version: string          // "1.4.2"
  build: string            // "2024.12.18"
  model: string            // "Nemotron-3-Ultra"
  activeSources: string    // "6 motores"
  avgLatency: string       // "1.2s"
  uptime30d: string        // "99.94%"
}
```

### 8.7 Stream

#### `GET /api/v1/stream` (SSE)

Ver §6. Query params sugeridos:
- `trendIds: string` (comma-separated, para `trend.upserted` selectivo)
- `engines: string` (comma-separated, para `engine.status_changed` selectivo)
- `lastEventId: string` (reanudación)

---

## 9. Valores computed/derived que el frontend calcula solo

### 9.1 Series temporales (sparklines + lanes)

`lib/virahub-data.ts:209-225` `buildSeries(id, shape, range, step)`:

- Usa `makeRng(hash(id+range) + step*7919)` (PRNG LCG, **no** `Math.random` pero sí determinista pseudo-aleatorio).
- Aplica `envelope(shape, t)` (`virahub-data.ts:194-207`) que define la curva teórica por shape.
- Añade ruido `(rand() - 0.5) * 0.12`.
- Devuelve `number[]` normalizado 0..1 con `RANGE_CONFIG[range].points` elementos.
- `RANGE_CONFIG` (`virahub-data.ts:169-174`):
  - `'1H'` → 26 puntos, labels `['12:00','12:10','12:20','12:30','12:40']`
  - `'6H'` → 34 puntos
  - `'24H'` → 42 puntos
  - `'7D'` → 48 puntos, labels `['Lun','Mar','Mié','Jue','Vie']`

**Implicación**: el backend **no necesita** enviar series si el cliente sigue usando `buildSeries()`. Pero esto hace que las gráficas no reflejen datos reales. **Recomendación**: añadir `history?: number[]` opcional a `Trend`, y el cliente lo usa si está presente; si no, cae a `buildSeries()`.

### 9.2 Path SVG suavizado

`virahub-data.ts:228-243` `smoothPath(pts, tension=0.5)` — Catmull-Rom → cubic bezier. UI-only, el backend no lo debe generar.

### 9.3 Count-up de números

`components/count-up.tsx` — animación ease-out cubic de 700 ms. Aplica a `confidence`, `mentions`, `delta`, `analyzed`, `latency`, KPI cards. El backend no debe enviar "valores animados", solo el target final.

### 9.4 Color de fase / tone

`scoring.ts:780-785` `TONE_BY_HEAT` mapea `heat` → `tone`. UI-only.

### 9.5 Status string

`scoring.ts:420-438` `deriveStatus(shape, heat, uniqueSources, mentions)` — 8 reglas. UI-only. El backend puede enviar `status` pre-computado o dejar que el cliente lo derive.

### 9.6 Why string

`scoring.ts:788-799` `buildWhy(m: NarrativeMetrics)` — 1 frase en ES concatenando `delta`, `mentions`, `uniqueAuthors`, `uniqueCommunities`, `mediaSources`. UI-only.

### 9.7 Evidence array

`scoring.ts:475-562` `buildEvidence(m, mentionsInEvidenceWindow, evidenceWindowLabel, peakAt)` — selecciona top-3 de 9 candidates con `priority`. UI-only.

### 9.8 Tooltip del timeline

`trend-timeline.tsx:41-47` `hoverLabel(range, t, clock)` — interpola label temporal. UI-only.

### 9.9 Formato "vs ayer" del delta

`analysis-panel.tsx:322-335` — el cliente añade el sufijo "% vs ayer" asumiendo que `delta` ya está normalizado a "vs mismo horario de ayer". El backend debe respetar esa semántica.

### 9.10 Mini-sparkline de `MiniSpark` y `Sparkline`

`screen-shell.tsx:38-66` y `analysis-panel.tsx:55-119` — ambos usan `buildSeries()` con range `'6H'` hardcoded. UI-only.

### 9.11 `agoMin` formatting

`scoring.ts:744-747` — `time: "HH:MM"` es `(now - lastSeen) / 60_000` redondeado. Si el backend envía `lastSeen: number` (epoch ms), el cliente puede calcular `time` solo. Si envía `time` ya formateado, también funciona.

### 9.12 Top KPI ribbon en Reports

`reports-screen.tsx:215` — `+${Math.round(data.detected * 0.18)}%` calcula "vs período anterior" localmente. El backend debería enviar `detectedPrevPeriod` para que el cálculo sea real.

### 9.13 Barra de progreso de LiveScan

`live-scan.tsx:100` — `progress = 18 + ((step * 17 + i * 29) % 80)`. **Simulado**. El backend debe enviar `progress` real por motor en `EngineStatus` (campo `progress?: number`).

### 9.14 Waveform del topbar

`top-bar.tsx:20-60` — `Math.sin(i * 0.7)` puramente decorativa. UI-only.

---

## 10. Contratos de comportamiento

### 10.1 Qué dispara un refetch

**Actualmente**: nada. El frontend no hace fetch. Cuando se migre a API real, los triggers serán:

| Acción UI | Endpoint refetched | Componente |
|---|---|---|
| Cambio de `range` (`setRange`) | `GET /trends?range=...` + `GET /trends/:id/history?range=...` | `trend-timeline.tsx:106-121` |
| Cambio de `screen` a `explorar` | `GET /trends?q=&source=&phase=&minScore=` | `page.tsx:21` |
| Cambio de `screen` a `alertas` | `GET /alerts` | `page.tsx:22` |
| Cambio de `screen` a `guardados` | `GET /saved` | `page.tsx:23` |
| Cambio de `screen` a `motores` | `GET /engines` + `GET /engines/:id/logs` | `page.tsx:24` |
| Cambio de `screen` a `informes` | `GET /reports?period=today` | `page.tsx:25` |
| Cambio de `screen` a `ajustes` | `GET /profile` + `GET /notifications` + `GET /api-keys` | `page.tsx:26` |
| `select(trendId)` (click en trend) | `GET /trends/:id` + `GET /trends/:id/briefing` | `virahub-provider.tsx:115-118` |
| Toggle `saved`/`alert`/`engine` | Mutación + invalidate local | `virahub-provider.tsx:124-155` |
| Búsqueda en `explorar`/`saved`/`alerts` | Debounce 250 ms + refetch | `explore-screen.tsx:25-28`, `saved-screen.tsx:78`, `alerts-screen.tsx:258-261` |
| Cambio de `period` en Reports | `GET /reports?period=...` | `reports-screen.tsx:177` |
| Click "Refrescar" en logs | `GET /engines/:id/logs?cursor=…` | `engines-screen.tsx:469-475` |

### 10.2 Qué dispara reconexión SSE

**Actualmente**: nada (no hay SSE). Cuando se implemente:

| Trigger | Comportamiento esperado |
|---|---|
| `live === true` | Abrir `EventSource('/api/v1/stream')` |
| `live === false` (botón Pause) | Cerrar `EventSource`, mantener último estado |
| `EventSource.onerror` | Backoff exponencial: 1s, 2s, 4s, 8s, 16s (cap 30s). Mostrar toast "Reconectando…". |
| `visibilitychange` hidden → visible | Si hace >60s que estaba oculto, forzar refetch + reabrir stream. |
| `connection.heartbeat` no llega en 45s | Cerrar y reconectar. |
| `connection.lost` event | Pausar `live`, mostrar toast con `reason`. |

### 10.3 Optimistic updates actuales

| Acción | Implementación actual | Línea |
|---|---|---|
| `toggleSaved(id)` | `setSaved((s) => has ? s.filter(x => x !== id) : [...s, id])` + toast inmediato | `virahub-provider.tsx:124-133` |
| `toggleAlert(id)` | `setAlerts((a) => has ? filter : [...a, id])` + toast | `virahub-provider.tsx:135-144` |
| `toggleEngine(id)` | `setEngines((arr) => has ? filter : [...arr, id])` + toast | `virahub-provider.tsx:146-155` |
| `toggleLane(id)` | `setHiddenLanes(...)` (UI-only, no persiste) | `virahub-provider.tsx:120-122` |
| `setCardOpen(false/true)` | State local | `virahub-provider.tsx:72` |
| `toggleRuleActive(id)` (alerts) | `setRules((arr) => arr.map(...))` local | `alerts-screen.tsx:263-267` |
| `deleteRule(id)` | `setRules((arr) => arr.filter(...))` local | `alerts-screen.tsx:269-271` |
| `ackEvent(id)` | `setEvents((arr) => arr.map(...))` local | `alerts-screen.tsx:273-275` |
| `ackAll()` | `setEvents((arr) => arr.map(e => ({...e, ack: true})))` local | `alerts-screen.tsx:277-279` |
| `addRule(rule)` | `setRules((arr) => [rule, ...arr])` local | `alerts-screen.tsx:281-283` |
| `setNote(trendId, patch)` (saved) | `setNotes((prev) => ({...prev, [trendId]: {...current, ...patch}}))` local | `saved-screen.tsx:123-134` |
| `updateConfig(id, patch)` (engines) | `setConfigs(...)` local | `engines-screen.tsx:185-190` |
| `addQuery`/`removeQuery` | Local | `engines-screen.tsx:192-202` |
| `saveApiKey(id)` | `setApiKeys(...)` local (inseguro: guarda plaintext en state) | `settings-screen.tsx:180-194` |
| `removeApiKey(id)` | `setApiKeys((prev) => ({...prev, [id]: {key:'', ...}}))` | `settings-screen.tsx:203-209` |
| `toggleKeyVisibility(id)` | Local UI | `settings-screen.tsx:196-201` |

**Regla para migrar a backend**: mantener todos los optimistic updates, hacer el fetch mutación en paralelo, y si falla, revertir + toast "Error: …". Esto es consistente con el patrón actual de `notify()` post-toggle.

### 10.4 Toasts esperados (already wired)

`notify(msg)` (`virahub-provider.tsx:108-111`) muestra toast por 2600 ms. Strings actuales usados como contract:

- `'Guardado en tu radar'`
- `'Eliminado de guardados'`
- `'Alerta creada correctamente'`
- `'Alerta desactivada'`
- `'Motor pausado'`
- `'Motor reactivado'`
- `'Configuración guardada'`
- `'Perfil guardado correctamente'`
- `'Preferencias de notificación guardadas'`
- `'API Key guardada para ${label}'`
- `'API Key eliminada'`
- `'Cambios descartados'`
- `'Informe Markdown exportado'`
- `'Abriendo diálogo de impresión…'`
- `'Exportado como JSON'` / `'Exportado como MARKDOWN'`
- `'Creador de carpetas próximamente'` (placeholder)
- `'Logs refrescados'`
- `'Test de conexión: ${name} OK'`

El backend no necesita reproducir estos strings, pero **sí** debe emitir eventos SSE que el cliente pueda mapear a toasts (p.ej. `alert.triggered` → toast "Alerta disparada: ${title}").

### 10.5 Persistencia que falta

Actualmente **nada se persiste** entre sesiones. El backend debe persistir:
- `saved[]` + `notes` (con carpetas)
- `alerts[]` reglas
- `engines[]` estado on/off + `configs` (interval, queries)
- `notifPrefs`
- `apiKeys`
- `profile` (displayName, email, lang, timezone, theme)
- `hiddenLanes[]` (preferencia UI por usuario, opcional)
- `focused` engine del topbar (`top-bar.tsx:195`)

### 10.6 Idioma y zona horaria

- Toda la UI está en Español por defecto (`<html lang="es">` en `app/layout.tsx:28`).
- `lang: 'es'|'en'|'pt'|'fr'` en settings — solo cambia el `lang` attr, no hay i18n real implementado. El backend puede ignorar este campo por ahora.
- `timezone` se aplica solo a formateo de fechas en informes/logs. El backend debe aceptar tz en `profile.timezone` y formatear `time`/`ts` strings en consecuencia.
- `toLocaleString('es-ES')` se usa en varios sitios (`hero-card.tsx`, `live-scan.tsx`, `top-bar.tsx`, `saved-screen.tsx`, `reports-screen.tsx`) — el cliente formatea números en es-ES.

---

## Apéndice A · Tipos compuestos para el backend (resumen)

```ts
// Re-exportar de lib/virahub-data.ts (contrato NO modificar):
export type RangeKey  = '1H' | '6H' | '24H' | '7D'
export type Shape     = 'accel' | 'rise' | 'flat' | 'decay' | 'wobble'
export type SourceKey = 'reddit'|'bluesky'|'hn'|'rss'|'gdelt'|'github'|'x'|'nvidia'|'crypto'
export type Trend     = { /* ver §2 */ }

// Nuevos tipos que el backend debe definir:
export type AnalysisBriefing    = { /* ver §3.2 */ }
export type EngineStatus        = { /* ver §4.3 */ }
export type LogEntry            = { id: string; engine: SourceKey; ts: string; level: 'info'|'warn'|'error'; message: string }
export type AlertRule           = { /* ver §5.1 */ }
export type TriggeredEvent      = { /* ver §5.2 */ }
export type SavedTrend          = { /* ver §5.4 */ }
export type Folder              = { id: string; name: string; color: string }
export type UserProfile         = { /* ver §5.5 */ }
export type NotificationSettings = { /* ver §5.6 */ }
export type ApiKeyState         = { /* ver §5.7 — SIN `key` en claro */ }
export type ReportData          = { /* ver §8.5 */ }
```

## Apéndice B · Archivos y responsabilidades

| Archivo | Líneas | Rol |
|---|---|---|
| `lib/virahub-data.ts` | 253 | Constantes + tipos + utilidades PRNG |
| `lib/scoring.ts` | 800 | Pipeline de scoring (Agent 3) — input `RawMention`, output `Trend` |
| `lib/utils.ts` | 6 | `cn()` helper |
| `components/virahub-provider.tsx` | 219 | Estado global (React Context) |
| `app/page.tsx` | 72 | Layout + ScreenRouter |
| `app/layout.tsx` | 35 | RootLayout + fonts + provider |
| `components/top-bar.tsx` | 341 | Header + waveform + engine focus menu |
| `components/left-rail.tsx` | 121 | Navegación principal |
| `components/hero-card.tsx` | 228 | Hero del radar |
| `components/live-scan.tsx` | 220 | Pipeline visual de motores |
| `components/trend-timeline.tsx` | 390 | Multi-lane chart con hover |
| `components/analysis-panel.tsx` | 439 | Panel derecho con detalle del trend seleccionado |
| `components/source-icon.tsx` | 59 | Glyph + Tile por SourceKey |
| `components/brand-icons.tsx` | 108 | SVGs de marca |
| `components/count-up.tsx` | 59 | Animación de números |
| `components/toast.tsx` | 74 | Toast global |
| `components/screens/screen-shell.tsx` | 96 | Shell + MiniSpark + Toggle |
| `components/screens/explore-screen.tsx` | 488 | Detalle de tendencia con 5 tabs |
| `components/screens/alerts-screen.tsx` | 1084 | Centro de alertas (reglas, crear, historial, feed) |
| `components/screens/saved-screen.tsx` | 593 | Guardados con carpetas + notas + export |
| `components/screens/reports-screen.tsx` | 496 | Informes con KPIs + ranking + export |
| `components/screens/engines-screen.tsx` | 583 | Gestión de motores + logs |
| `components/screens/settings-screen.tsx` | 856 | 4 tabs: profile, notifications, apikeys, about |
