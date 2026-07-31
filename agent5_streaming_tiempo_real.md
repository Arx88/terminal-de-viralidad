# AGENT 5 — Streaming y Comunicación en Tiempo Real (VIRAHUB)

> **Rol:** Ex-Principal Engineer @ Discord. Diseño del pipeline de push para el frontend VIRAHUB (Next.js 16 App Router + React 19). Reemplaza los `setInterval` actuales en `virahub-provider.tsx` por un canal único SSE con backpressure, replay y degradación graceful.

---

## 0. Mapeo de requisitos → eventos

Cada `setInterval` simulado hoy en `components/virahub-provider.tsx` y en `components/live-scan.tsx` se sustituye por un evento SSE tipado:

| Componente | Estado hoy (simulado) | Evento SSE | Cadencia objetivo |
|---|---|---|---|
| `TopBar` (analyzed count) | `setInterval` 1400ms | `metrics.vitals` | on-change (≤1.4s) |
| `TopBar` (latency) | `setInterval` 1400ms | `metrics.vitals` | on-change |
| `TopBar` (clock) | `setInterval` 10000ms | `clock.tick` | 10s servidor |
| `LiveScan` (verbos de motor) | `setInterval` 2400ms | `scan.engine.rotate` | 2.4s |
| `LiveScan` (progreso) | derivado de `step` | `scan.progress` | on-update |
| `TrendTimeline` (series) | `setInterval` 2600ms (`step`) | `series.tick` | 2.6s |
| `AnalysisPanel` (trends nuevos) | estático (`TRENDS`) | `trend.detected` | event-driven |
| `AnalysisPanel` (cambio de score) | — | `trend.score` | event-driven |
| `AlertsScreen` (notificaciones) | `notify()` local | `alert.fired` | event-driven |

**Regla de oro:** un único stream SSE por sesión, multiplexando todos los tipos. Reducir conexiones HTTP reduce TLS handshake, memoria en el edge y overhead de keepalive.

---

## 1. Protocolo: **SSE** (no WebSocket)

### Decisión: `text/event-stream` sobre WebSocket.

| Criterio | SSE | WebSocket | Veredicto |
|---|---|---|---|
| Dirección de tráfico VIRAHUB | server → client (95%) | bidireccional | SSE |
| Reconnect nativo | `EventSource` auto-reconnect + `Last-Event-ID` header gratis | manual, re-implementar | **SSE gana** |
| Replay por ID | estándar (`Last-Event-ID` → `id:` field) | no existe, custom | **SSE gana** |
| Passthrough proxies/CDN/CF | HTTP/1.1 + HTTP/2 ✅ | a veces roto (corporate) | **SSE gana** |
| Auth | cookie SameSite + CSRF token (ya existe sesión) | token en subprotocol, awkward | **SSE gana** |
| HTTP/2 multiplexing | 1 stream/TCP, sin head-of-line | frame-level, más complejo | SSE suficiente |
| Backpressure | TCP + `writable.writableLength` | mismo, pero más control | empate |
| Footprint por conexión (Node) | ~30 KB | ~50 KB (frame parser) | **SSE gana** |
| Bidireccional necesario | NO (mutaciones vía `fetch('/api/...')` REST) | — | SSE |
| Mensajes binarios | no | sí | no requerido |

VIRAHUB no necesita baja latencia cliente→servidor (las acciones del usuario son mutaciones REST: toggleEngine, toggleSaved, toggleAlert ya en el provider). El flujo crítico es **server→client**, donde SSE brilla. WebSocket sería sobre-ingeniería que paga coste de complejidad sin ROI.

**Server-Sent Events = unidireccional, HTTP, auto-reconnect, Last-Event-ID, multiplexable en HTTP/2.** Es lo que usa el dashboard de GitHub, Cloudflare, Vercel. Es lo correcto aquí.

---

## 2. Diagrama de arquitectura

```
 ┌────────────────────────────────────────────────────────────────────────────┐
 │                              PRODUCTORES                                   │
 │   ingest-reddit  ingest-bluesky  ingest-hn  ingest-gdelt  ingest-rss  …    │
 │        │              │              │           │            │            │
 │        └──────────────┴──────┬───────┴───────────┴────────────┘            │
 │                              ▼                                            │
 │                  ┌───────────────────────┐                                │
 │                  │  detector-pipeline    │ (score, shape, delta, why)     │
 │                  │  + rule-engine        │ → dispara alertas              │
 │                  └──────────┬────────────┘                                │
 │                             │                                             │
 │                             │   PUBLISH (JSON, 1 msg/event)               │
 └─────────────────────────────┼─────────────────────────────────────────────┘
                               ▼
 ╔═══════════════════════════════════════════════════════════════════════════╗
 ║                         REDIS (Cluster, 3 shards)                          ║
 ║                                                                            ║
 ║   Pub/Sub channels (hot path, fire-and-forget):                            ║
 ║     • virahub:ch:metrics      • virahub:ch:scan                            ║
 ║     • virahub:ch:trends       • virahub:ch:series                          ║
 ║     • virahub:ch:alerts       • virahub:ch:clock                           ║
 ║                                                                            ║
 ║   Streams (replay buffer, retención 5 min, MAXLEN ~10k):                   ║
 ║     • virahub:stream:metrics  • virahub:stream:trends                      ║
 ║     • virahub:stream:alerts   • virahub:stream:series                      ║
 ║                                                                            ║
 ║   Last-Value cache (KV):                                                   ║
 ║     • virahub:lvc:metrics    • virahub:lvc:clock                           ║
 ╚═══════════════════════════════╤═════════════════════════════════════════════╝
                                 │ SUBSCRIBE (1 sub por gateway pod)
                                 ▼
 ┌────────────────────────────────────────────────────────────────────────────┐
 │                      SSE GATEWAY (Next.js 16)                              │
 │   app/api/stream/route.ts  (runtime: nodejs)                               │
 │                                                                            │
 │   ┌────────────────┐   ┌──────────────────┐   ┌──────────────────────┐    │
 │   │ RedisSubscriber│──▶│  Demuxer         │──▶│ Per-conn Dispatcher  │    │
 │   │ (singleton,    │   │  (topic → type)  │   │ (filter by query     │    │
 │   │  shared pod)   │   │                  │   │  params + replay)    │    │
 │   └────────────────┘   └──────────────────┘   └──────────┬───────────┘    │
 │                                                          │                 │
 │   ┌──────────────────┐   ┌──────────────────────┐        │                 │
 │   │ Heartbeat 15s    │   │ Backpressure queue   │◀───────┘                 │
 │   │ (comment frame)  │   │ (bounded 256 evts)   │                          │
 │   └──────────────────┘   └──────────────────────┘                          │
 └──────────────────────────────┬─────────────────────────────────────────────┘
                                │ HTTP/2  text/event-stream
                                │ Headers: Content-Type, Cache-Control: no-cache,
                                │          X-Accel-Buffering: no, Connection: keep-alive,
                                │          Last-Event-ID (echo on reconnect)
                                ▼
 ┌────────────────────────────────────────────────────────────────────────────┐
 │                            BROWSER (Client)                                │
 │                                                                            │
 │   useVirahubStream()  →  EventSource('/api/stream?topics=…&engines=…')     │
 │        │                                                                   │
 │        ▼                                                                   │
 │   dispatcher(event)  →  VirahubProvider setters                            │
 │     · metrics.vitals   → setAnalyzed / setLatency                          │
 │     · clock.tick       → setClock                                          │
 │     · scan.engine.rotate→ LiveScan phase                                   │
 │     · series.tick       → setStep (regenera lanes)                         │
 │     · trend.detected    → setTrends([...t, nuevo])                         │
 │     · trend.score       → update trend delta/confidence                    │
 │     · alert.fired       → notify() + toast                                 │
 └────────────────────────────────────────────────────────────────────────────┘
```

**Flujo de un evento `trend.detected`:**

```
detector-pipeline
  └─ PUBLISH virahub:ch:trends '{"type":"trend.detected","data":{...},"id":"1719...","ts":1719...}'
        └─ Redis fan-out → todos los pods gateway que tienen SUBSCRIBE
              └─ Demuxer lee canal, parsea `type`
                    └─ Dispatcher recorre conexiones vivas del pod
                          ├─ filtra por `?topics=trends` (sí suscrito)
                          ├─ filtra por `?engines=reddit,bluesky` (match de source)
                          ├─ comprueba `lastEventId < event.id` (no replay duplicado)
                          └─ enqueue → writable stream → TCP → EventSource.onmessage
```

---

## 3. Formato de mensajes — TypeScript union type

`lib/stream/events.ts`

```ts
// ───────────────────────────────────────────────────────────────────────────
// VIRAHUB SSE event contract — source of truth, compartido cliente/servidor
// ───────────────────────────────────────────────────────────────────────────

/** ISO 8601 UTC string. `id` es monótono global (snowflake: <ms><pod><seq>). */
export type SseMeta = {
  /** monotónico, lexicográficamente ordenable. Echo en Last-Event-ID. */
  id: string
  /** epoch ms */
  ts: number
  /** canal Redis de origen (auditoría/debug) */
  ch: SseChannel
}

export type SseChannel =
  | 'virahub:ch:metrics'
  | 'virahub:ch:scan'
  | 'virahub:ch:trends'
  | 'virahub:ch:series'
  | 'virahub:ch:alerts'
  | 'virahub:ch:clock'

// ── TopBar: analyzed + latency en un único evento coalescido ────────────────
export type MetricsVitalsEvent = SseMeta & {
  type: 'metrics.vitals'
  data: {
    analyzed: number       // contador absoluto (monótono creciente)
    analyzedDelta: number  // incremento desde último evento (para animación)
    latency: number        // segundos, 1 decimal
    throughput: number     // signals/sec (derivada)
    queueDepth: number     // profundidad de cola interna del detector
    degraded: boolean      // true si backend en modo degradado
  }
}

// ── TopBar: clock (server-authoritative, evita drift de cliente) ────────────
export type ClockTickEvent = SseMeta & {
  type: 'clock.tick'
  data: {
    iso: string            // "2025-07-31T12:32:00Z"
    hhmm: string           // "12:32"  (UI label)
    tzOffsetMin: number    // offset del browser inferido, informativo
  }
}

// ── LiveScan: rotación de verbo de motor + progreso ─────────────────────────
export type ScanEngineRotateEvent = SseMeta & {
  type: 'scan.engine.rotate'
  data: {
    engine: string         // 'reddit' | 'bluesky' | 'hn' | ...
    verb: string           // 'indexando' | 'tokenizando' | 'scoring' | ...
    phase: number          // entero creciente, alimenta animación
  }
}

export type ScanProgressEvent = SseMeta & {
  type: 'scan.progress'
  data: {
    engine: string
    scanned: number        // documentos escaneados este ciclo
    matched: number        // señales que pasaron filtro
    progress: number       // 0..1 del ciclo actual
  }
}

// ── TrendTimeline: tick de series temporales ────────────────────────────────
export type SeriesTickEvent = SseMeta & {
  type: 'series.tick'
  data: {
    /** clave = trendId, valor = punto {t, v}. Solo deltas, no full series. */
    points: Record<string, { t: number; v: number }>
    /** step global, reemplaza al `step` actual del provider */
    step: number
    /** rango activo para que el cliente valide coherencia */
    range: '1H' | '6H' | '24H' | '7D'
  }
}

// ── AnalysisPanel: nuevo trend detectado ────────────────────────────────────
export type TrendDetectedEvent = SseMeta & {
  type: 'trend.detected'
  data: {
    trend: {
      id: string
      title: string
      source: import('@/lib/virahub-data').SourceKey
      color: string
      status: string
      tone: 'hot' | 'cool' | 'mint' | 'muted'
      dir: 'up' | 'down' | 'flat'
      time: string
      heat: string
      confidence: number
      mentions: number
      delta: number
      shape: 'accel' | 'rise' | 'flat' | 'decay' | 'wobble'
      why: string
      evidence: { label: string; value: string }[]
      inTimeline?: boolean
    }
    /** motores que contribuyeron (para resaltar en LiveScan) */
    contributedBy: string[]
  }
}

// ── AnalysisPanel: cambio de score/confidence en trend existente ────────────
export type TrendScoreEvent = SseMeta & {
  type: 'trend.score'
  data: {
    id: string
    confidence: number
    delta: number
    mentions: number
    dir: 'up' | 'down' | 'flat'
    /** cambio relativo para animar el hero card */
    confidenceDelta: number
  }
}

// ── AlertsScreen: notificación push cuando una regla dispara ────────────────
export type AlertFiredEvent = SseMeta & {
  type: 'alert.fired'
  data: {
    alertId: string
    trendId: string
    severity: 'info' | 'warn' | 'critical'
    rule: string            // 'confidence_gt_80' | 'delta_3x_15min' | ...
    message: string         // texto para toast
    cta?: { label: string; screen: import('@/components/virahub-provider').ScreenKey }
  }
}

// ── Sistema: heartbeat, degradación, backpressure signal ────────────────────
export type SystemHeartbeatEvent = SseMeta & {
  type: 'system.heartbeat'
  data: { serverTs: number; activeConns: number }
}

export type SystemPressureEvent = SseMeta & {
  type: 'system.pressure'
  data: { dropped: number; reason: 'slow_client' | 'queue_full'; recoverIn: number }
}

export type SystemDegradedEvent = SseMeta & {
  type: 'system.degraded'
  data: {
    reason: 'redis_down' | 'redis_partial' | 'detector_lag' | 'rate_limited'
    fallback: 'snapshot_poll' | 'last_value_cache' | 'none'
    retryAt: number
  }
}

// ── Union ───────────────────────────────────────────────────────────────────
export type SseEvent =
  | MetricsVitalsEvent
  | ClockTickEvent
  | ScanEngineRotateEvent
  | ScanProgressEvent
  | SeriesTickEvent
  | TrendDetectedEvent
  | TrendScoreEvent
  | AlertFiredEvent
  | SystemHeartbeatEvent
  | SystemPressureEvent
  | SystemDegradedEvent

/** Tipos que el cliente puede pedir en `?topics=`. */
export type SseTopic =
  | 'metrics' | 'clock' | 'scan' | 'series' | 'trends' | 'alerts' | 'system'

export const TOPIC_TO_CHANNEL: Record<SseTopic, SseChannel> = {
  metrics: 'virahub:ch:metrics',
  clock: 'virahub:ch:clock',
  scan: 'virahub:ch:scan',
  series: 'virahub:ch:series',
  trends: 'virahub:ch:trends',
  alerts: 'virahub:ch:alerts',
  system: 'virahub:ch:metrics', // system events piggyback en metrics channel
}
```

### Wire format SSE (RFC 8895)

```
id: 1719459120000-pod3-000123
event: trend.detected
data: {"id":"1719459120000-pod3-000123","ts":1719459120000,"ch":"virahub:ch:trends","type":"trend.detected","data":{"trend":{...},"contributedBy":["reddit","bluesky"]}}

```

- `id:` → replay key (echo en `Last-Event-ID` header al reconectar).
- `event:` → discrimina sin parsear `data` primero (perf en dispatcher).
- `\n\n` → separa frames.
- Heartbeat es un comentario: `: hb 1719459123000\n\n` (no dispara `onmessage`, pero resetea el timeout de inactividad del proxy y del browser).

---

## 4. Redis Pub/Sub — canales, formatos y replay

### 4.1 Canales y productores

| Canal | Productor | Cadencia típica | Payload |
|---|---|---|---|
| `virahub:ch:metrics` | `metrics-aggregator` | 1.4s | `MetricsVitalsEvent` |
| `virahub:ch:clock` | `clock-svc` (cron) | 10s | `ClockTickEvent` |
| `virahub:ch:scan` | cada `ingest-*` worker | 2.4s por motor (rotando) | `ScanEngineRotateEvent` / `ScanProgressEvent` |
| `virahub:ch:series` | `series-aggregator` | 2.6s | `SeriesTickEvent` |
| `virahub:ch:trends` | `detector-pipeline` | event-driven | `TrendDetectedEvent` / `TrendScoreEvent` |
| `virahub:ch:alerts` | `rule-engine` | event-driven | `AlertFiredEvent` |

### 4.2 Dual-channel pattern: Pub/Sub + Stream

```
PUBLISH  virahub:ch:trends  '<json>'     ← hot path, baja latencia
XADD     virahub:stream:trends MAXLEN ~ 10000 * '<json>'   ← replay buffer
SETEX    virahub:lvc:metrics 60 '<json>' ← last-value cache (degradación)
```

- **Pub/Sub** = 0 retención, fire-and-forget. Si un gateway pod está reiniciando, pierde el evento. Aceptable para `clock` y `metrics` (llegará el siguiente tick).
- **Stream** = retención 5 min (`MAXLEN ~ 10000`). El gateway usa `XRANGE` para servir **replay** cuando un cliente reconecta con `Last-Event-ID`.
- **LVC (KV)** = última versiónKnown de `metrics` y `clock`. Sirve como **fallback** cuando Redis Pub/Sub está caído pero el nodo Redis responde a `GET`.

### 4.3 Sharding (Redis 7.0+)

Para >5K msg/s usamos **Sharded Pub/Sub** (`SPUBLISH` / `SSUBSCRIBE`), que enruta por slot de clave en vez de fan-out a todos los nodos:

```
SPUBLISH  virahub:ch:trends  '<json>'    ← solo el shard dueño del slot lo recibe
SSUBSCRIBE virahub:ch:trends              ← gateway se suscribe al shard correcto
```

A 10K conexiones con ~200 msg/s agregados esto NO es necesario (Pub/Sub clásico aguanta ~50K msg/s en un nodo C6). Sharded Pub/Sub se activa cuando `redis_pubsub_input_bytes > 50 MB/s` sostenido.

### 4.4 Config Redis

```conf
# redis.conf (relevante para streaming)
maxmemory-policy allkeys-lru
notify-keyspace-events ""        # no usamos keyspace notifications (ruido)
client-output-buffer-limit pubsub 64mb 16mb 60   # protege subscribers lentos
repl-backlog-size 64mb
appendonly yes
appendfsync everysec
stream-node-max-bytes 4096
stream-node-max-entries 100
```

`client-output-buffer-limit pubsub` es **clave**: si un gateway pod deja de leer, Redis lo desconecta tras 60s en lugar de OOM. El gateway detecta la desconexión y re-suscribe.

---

## 5. Next.js API route — `app/api/stream/route.ts`

```ts
// app/api/stream/route.ts
import { NextRequest } from 'next/server'
import { createRedisSubscriber, SHARED_SUBSCRIBER } from '@/lib/stream/redis-subscriber'
import { TOPIC_TO_CHANNEL, type SseTopic, type SseEvent, type SseChannel } from '@/lib/stream/events'
import { replayFromStream } from '@/lib/stream/replay'
import { getLastValueCache } from '@/lib/stream/lvc'
import { backoff } from '@/lib/stream/backoff'
import { metrics } from '@/lib/stream/metrics'

// No meter en edge runtime: necesitamos sockets persistentes y Redis client.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const HEARTBEAT_MS = 15_000
const MAX_QUEUE = 256              // eventos encolados por conexión
const REPLAY_LIMIT = 500           // máx eventos a reenviar tras reconexión
const SESSION_COOKIE = 'vh_sess'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)

  // ── Auth: cookie SameSite=Strict ya válida para REST. SSE hereda. ─────────
  const session = req.cookies.get(SESSION_COOKIE)?.value
  if (!session) {
    return new Response('unauthorized', { status: 401 })
  }

  // ── Parse de filtros del cliente ──────────────────────────────────────────
  const topics = (url.searchParams.get('topics') ?? '')
    .split(',').filter(Boolean) as SseTopic[]
  const engines = (url.searchParams.get('engines') ?? '').split(',').filter(Boolean)
  const range = (url.searchParams.get('range') ?? '6H') as '1H' | '6H' | '24H' | '7D'
  const lastEventId = req.headers.get('last-event-id') ?? url.searchParams.get('lastEventId') ?? null

  if (topics.length === 0) {
    return new Response('missing topics', { status: 400 })
  }

  // ── Subscribe al singleton (1 sub Redis por pod, fan-out en memoria) ──────
  const subscriber = await SHARED_SUBSCRIBER.ensure(topics.map((t) => TOPIC_TO_CHANNEL[t]))

  // ── Encoder SSE con backpressure ──────────────────────────────────────────
  const encoder = new TextEncoder()
  let cancelled = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // cola por conexión; si se llena, dropeamos eventos no críticos
      const queue: SseEvent[] = []
      let dropped = 0
      let queueFullSince = 0

      const enqueue = (ev: SseEvent) => {
        // filtrado por topics (el tipo → topic)
        const topic = ev.type.split('.')[0] as SseTopic
        if (!topics.includes(topic) && topic !== 'system') return

        // filtrado por engines (solo eventos que llevan source/engine)
        const src = (ev as any).data?.trend?.source ?? (ev as any).data?.engine
        if (engines.length && src && !engines.includes(src)) return

        // dedupe tras replay: si el id <= lastEventId, skip
        if (lastEventId && ev.id <= lastEventId) return

        if (queue.length >= MAX_QUEUE) {
          // nunca dropear alert.fired ni system.degraded
          const critical = ev.type === 'alert.fired' || ev.type === 'system.degraded'
          if (!critical) {
            dropped++
            if (!queueFullSince) queueFullSince = Date.now()
            // señal al cliente: está perdiendo frames, que throttlee UI
            if (dropped % 10 === 0) {
              queue.push({
                type: 'system.pressure',
                id: ev.id,
                ts: ev.ts,
                ch: 'virahub:ch:metrics',
                data: { dropped, reason: 'queue_full', recoverIn: 1500 },
              })
            }
            return
          }
          // critical: encolar desplazando el más viejo no-crítico
          const idx = queue.findIndex((q) => q.type !== 'alert.fired' && q.type !== 'system.degraded')
          if (idx >= 0) queue.splice(idx, 1)
        }
        queue.push(ev)
      }

      // ── Suscripción al demuxer del pod ───────────────────────────────────
      const off = subscriber.on(enqueue)

      // ── Replay: si reconecta con Last-Event-ID, sirve lo perdido ─────────
      if (lastEventId) {
        try {
          const replayed = await replayFromStream(topics, lastEventId, REPLAY_LIMIT)
          for (const ev of replayed) enqueue(ev)
        } catch (err) {
          // Redis stream caído → servir LVC y seguir
          metrics.inc('replay_failed')
        }
      } else {
        // primera conexión: servir LVC de metrics+clock para evitar UI vacía
        const lvcMetrics = await getLastValueCache('virahub:lvc:metrics')
        const lvcClock = await getLastValueCache('virahub:lvc:clock')
        if (lvcMetrics && topics.includes('metrics')) enqueue(lvcMetrics)
        if (lvcClock && topics.includes('clock')) enqueue(lvcClock)
      }

      // ── Drainer: vacía la cola al socket respetando backpressure ─────────
      const drain = () => {
        if (cancelled) return
        // si el underlying writable está lleno, esperamos
        const desired = controller.desiredSize
        if (desired === null || desired <= 0) {
          metrics.inc('backpressure_wait')
          setTimeout(drain, 20)
          return
        }
        while (queue.length && (controller.desiredSize ?? 0) > 0) {
          const ev = queue.shift()!
          controller.enqueue(encoder.encode(serializeSse(ev)))
        }
        if (queueFullSince && queue.length < MAX_QUEUE * 0.5) {
          queueFullSince = 0
          dropped = 0
        }
      }
      const drainer = setInterval(drain, 16)   // ~60fps cap

      // ── Heartbeat: comment frame, no dispara onmessage ───────────────────
      const heartbeat = setInterval(() => {
        if (cancelled) return
        try {
          controller.enqueue(encoder.encode(`: hb ${Date.now()}\n\n`))
        } catch {
          // controller cerrado
        }
      }, HEARTBEAT_MS)

      metrics.inc('sse_connections_active')
      metrics.gauge('sse_queue_depth', queue.length)

      // ── Cleanup ─────────────────────────────────────────────────────────
      req.signal.addEventListener('abort', () => {
        cancelled = true
        off()
        clearInterval(drainer)
        clearInterval(heartbeat)
        metrics.dec('sse_connections_active')
        try { controller.close() } catch {}
      })
    },
    cancel() {
      cancelled = true
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // nginx/cloudflare: no bufferizar
      'X-Accel-Buffering': 'no',
      // el navegador guarda el último `id:` y lo manda en Last-Event-ID al reconectar
      'Access-Control-Allow-Origin': 'same-origin',
      'Access-Control-Allow-Credentials': 'true',
    },
  })
}

// ── Serializador SSE conforme a RFC 8895 ────────────────────────────────────
function serializeSse(ev: SseEvent): string {
  const lines = [
    `id: ${ev.id}`,
    `event: ${ev.type}`,
    `data: ${JSON.stringify(ev)}`,
    '',   // blank line = frame terminator
    '',
  ]
  return lines.join('\n')
}
```

### Singleton subscriber (1 por pod, fan-out en memoria)

```ts
// lib/stream/redis-subscriber.ts
import { createClient, type RedisClientType } from 'redis'
import type { SseChannel, SseEvent } from './events'

type Handler = (ev: SseEvent) => void

class SharedSubscriber {
  private client: RedisClientType | null = null
  private subscribed = new Set<SseChannel>()
  private handlers = new Map<SseChannel, Set<Handler>>()
  private reconnecting = false

  async ensure(channels: SseChannel[]): Promise<SharedSubscriber> {
    if (!this.client) {
      this.client = createClient({
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 100, 2000),
          keepAlive: 5000,
        },
      })
      this.client.on('error', (err) => {
        console.error('[sse] redis error', err)
      })
      this.client.on('reconnecting', () => this.onReconnect())
      await this.client.connect()
    }

    for (const ch of channels) {
      if (this.subscribed.has(ch)) continue
      await this.client.subscribe(ch, (msg) => this.dispatch(ch, msg))
      this.subscribed.add(ch)
    }
    return this
  }

  private dispatch(ch: SseChannel, raw: string) {
    let ev: SseEvent
    try {
      ev = JSON.parse(raw)
    } catch {
      return
    }
    const set = this.handlers.get(ch)
    if (set) for (const h of set) {
      try { h(ev) } catch (e) { /* handler no rompe el fan-out */ }
    }
  }

  on(handler: Handler): () => void {
    const chs = Array.from(this.subscribed)
    for (const ch of chs) {
      if (!this.handlers.has(ch)) this.handlers.set(ch, new Set())
      this.handlers.get(ch)!.add(handler)
    }
    return () => {
      for (const ch of chs) this.handlers.get(ch)?.delete(handler)
    }
  }

  private async onReconnect() {
    if (this.reconnecting) return
    this.reconnecting = true
    // re-subscribe a todo
    const chs = Array.from(this.subscribed)
    this.subscribed.clear()
    await this.ensure(chs)
    this.reconnecting = false
  }
}

export const SHARED_SUBSCRIBER = new SharedSubscriber()
export const createRedisSubscriber = () => SHARED_SUBSCRIBER
```

### Replay desde Redis Stream

```ts
// lib/stream/replay.ts
import type { SseEvent, SseTopic, SseChannel } from './events'
import { TOPIC_TO_CHANNEL } from './events'
import { getRedisClient } from './redis-client'

const TOPIC_TO_STREAM: Partial<Record<SseTopic, string>> = {
  trends: 'virahub:stream:trends',
  metrics: 'virahub:stream:metrics',
  series: 'virahub:stream:series',
  alerts: 'virahub:stream:alerts',
}

export async function replayFromStream(
  topics: SseTopic[],
  lastEventId: string,
  limit: number,
): Promise<SseEvent[]> {
  const client = await getRedisClient()
  const out: SseEvent[] = []

  for (const topic of topics) {
    const stream = TOPIC_TO_STREAM[topic]
    if (!stream) continue
    // XRANGE devuelve entradas posteriores al último ID visto
    const entries = await client.xRange(stream, `(${lastEventId}`, '+', { COUNT: limit })
    for (const e of entries) {
      try {
        const ev = JSON.parse(e.message) as SseEvent
        out.push(ev)
      } catch { /* skip corrupto */ }
    }
  }
  return out
}
```

---

## 6. Client hook — `useVirahubStream`

```ts
// lib/stream/use-virahub-stream.ts
'use client'

import { useEffect, useRef } from 'react'
import { useVirahub } from '@/components/virahub-provider'
import type { SseEvent, SseTopic } from './events'

type Opts = {
  topics: SseTopic[]
  engines?: string[]
  range?: '1H' | '6H' | '24H' | '7D'
  /** si false, no abre el stream (p.ej. cuando live=false) */
  enabled?: boolean
}

const STALE_MS = 45_000   // sin heartbeat 45s → forzar reconnect

export function useVirahubStream({ topics, engines, range, enabled = true }: Opts) {
  const {
    setAnalyzed, setLatency, setClock, setStep, notify, setTrends,
    setSelectedId, alerts, setLive,
  } = useVirahub()

  const esRef = useRef<EventSource | null>(null)
  const staleRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastMsgRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!enabled) return
    if (typeof EventSource === 'undefined') return // SSR guard

    const params = new URLSearchParams()
    params.set('topics', topics.join(','))
    if (engines?.length) params.set('engines', engines.join(','))
    if (range) params.set('range', range)

    let retry = 0
    const open = () => {
      const es = new EventSource(`/api/stream?${params}`, { withCredentials: true })
      esRef.current = es
      lastMsgRef.current = Date.now()

      // dispatcher único: usa `event.type` para ruteo O(1)
      const dispatch = (e: MessageEvent) => {
        lastMsgRef.current = Date.now()
        retry = 0   // cualquier mensaje cuenta como healthy
        let ev: SseEvent
        try { ev = JSON.parse(e.data) } catch { return }

        switch (ev.type) {
          case 'metrics.vitals':
            setAnalyzed(ev.data.analyzed)
            setLatency(ev.data.latency)
            if (ev.data.degraded) setLive(false)
            break
          case 'clock.tick':
            setClock(ev.data.hhmm)
            break
          case 'series.tick':
            // step ya viene del servidor; reemplaza al setInterval(2600ms)
            if (ev.data.range === range) setStep(ev.data.step)
            break
          case 'scan.engine.rotate':
            // LiveScan escucha vía subscriber interno o context
            window.dispatchEvent(new CustomEvent('vh:scan-rotate', { detail: ev.data }))
            break
          case 'trend.detected':
            setTrends((prev) => prev.some((t) => t.id === ev.data.trend.id)
              ? prev
              : [ev.data.trend, ...prev].slice(0, 50))
            notify(`Nuevo trend: ${ev.data.trend.title}`)
            break
          case 'trend.score':
            setTrends((prev) => prev.map((t) => t.id === ev.data.id
              ? { ...t, confidence: ev.data.confidence, delta: ev.data.delta,
                  mentions: ev.data.mentions, dir: ev.data.dir }
              : t))
            break
          case 'alert.fired':
            if (alerts.includes(ev.data.trendId)) {
              notify(ev.data.message)
              if (ev.data.cta) setSelectedId(ev.data.trendId)
            }
            break
          case 'system.pressure':
            // cliente frena animaciones pesadas para no empeorar backpressure
            document.documentElement.dataset.vhPressure = '1'
            setTimeout(() => {
              delete document.documentElement.dataset.vhPressure
            }, ev.data.recoverIn)
            break
          case 'system.degraded':
            notify(`Modo degradado: ${ev.data.reason}. Recuperando…`)
            break
          // system.heartbeat: no-op (sólo renueva lastMsgRef)
        }
      }

      // escuchamos cada event type explícitamente (mejor perf que onmessage genérico)
      const types = [
        'metrics.vitals', 'clock.tick', 'series.tick',
        'scan.engine.rotate', 'scan.progress',
        'trend.detected', 'trend.score',
        'alert.fired',
        'system.heartbeat', 'system.pressure', 'system.degraded',
      ]
      types.forEach((t) => es.addEventListener(t, dispatch as EventListener))

      es.onerror = () => {
        es.close()
        // EventSource auto-reconecta, pero respetamos nuestro circuit breaker
        retry++
        const delay = Math.min(1000 * 2 ** retry, 16_000)  // exp backoff, cap 16s
        setTimeout(open, delay)
      }
    }

    open()

    // watchdog: si no hay ningún mensaje (ni heartbeat) en 45s, reconectar
    staleRef.current = setInterval(() => {
      if (Date.now() - lastMsgRef.current > STALE_MS) {
        console.warn('[sse] stale, force reconnect')
        esRef.current?.close()
        open()
      }
    }, 10_000)

    return () => {
      esRef.current?.close()
      if (staleRef.current) clearInterval(staleRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, topics.join(','), engines?.join(','), range])
}
```

### Integración en el provider

Reemplaza los tres `setInterval` actuales en `components/virahub-provider.tsx` por una sola llamada:

```tsx
// dentro de VirahubProvider, al final antes del return:
useVirahubStream({
  topics: ['metrics', 'clock', 'scan', 'series', 'trends', 'alerts', 'system'],
  engines,                    // filtrado: solo lo que el usuario tiene activo
  range,
  enabled: live,
})
```

Los `setInterval` existentes (líneas 80–106 de `virahub-provider.tsx`) se eliminan: el stream ahora es la única fuente de verdad. Cuando `live === false` el stream se cierra y el UI queda congelado en el último estado (mismo comportamiento actual).

---

## 7. Backpressure, heartbeat, reconexión, filtrado, escalado

### 7.1 Backpressure (cliente lento)

**3 capas de defensa:**

1. **TCP**: el socket del cliente lento llena su `recv buffer` → el kernel deja de ACK → el `controller.desiredSize` del `WritableStream` baja. El drainer deja de encolar.
2. **Cola por conexión (256 eventos)**: si el drenaje no avanza, la cola se llena. Para eventos **no críticos** (`scan.*`, `series.tick`, `metrics.vitals`) se dropea el más viejo y se incrementa `dropped`. Para **críticos** (`alert.fired`, `system.degraded`) se desplaza un no-crítico y se encola el crítico.
3. **Señal al cliente**: cada 10 drops se envía `system.pressure`. El cliente setea `document.documentElement.dataset.vhPressure = '1'` y el CSS frena animaciones pesadas (waveform, transitions de 700ms → 0ms). Cuando el cliente se recupera, el drainer reduce la cola y `system.pressure` cesa.

**Nunca** bloqueamos el event loop del gateway esperando a un cliente lento: el drainer es no-bloqueante (`setTimeout(drain, 20)` si `desiredSize <= 0`). Un cliente lento NO degrada a otros.

**Saturación terminal**: si la cola lleva >30s llena, se cierra la conexión con `controller.error()` para forzar reconnect del cliente (que vendrá con `Last-Event-ID` y recibirá replay).

### 7.2 Heartbeat

- **Cadencia**: `: hb <ts>\n\n` cada **15s**. Es un *comment frame*: el navegador NO dispara `onmessage`, pero resetea el timer de inactividad de nginx/CF (que por defecto cortan a 60s sin bytes).
- **Watchdog cliente**: si 45s sin ningún byte (3 heartbeats perdidos), el hook fuerza `es.close()` + reopen.
- **Por qué no `event: system.heartbeat`**: los heartbeat deben pasar aunque el cliente no haya pedido topic `system`. Los comments pasan siempre.

### 7.3 Reconexión y replay

```
Cliente conecta la 1ra vez
  → sin Last-Event-ID
  → gateway: XRANGE skip, pero GET LVC(metrics), LVC(clock) → UI pinta al instante

Cliente pierde conexión 8s (wifi flaky)
  → EventSource auto-reconnect con header Last-Event-ID: <último id visto>
  → gateway: XRANGE virahub:stream:{trends,metrics,...} (>lastId, COUNT 500)
  → encola replayed events en orden
  → continua con live events

Cliente pierde conexión >5min
  → stream ya expiró (MAXLEN ~10000 ≈ 5min)
  → replay parcial: gateway manda `system.degraded` con reason='replay_truncated'
  → cliente pinta lo que hay + sigue escuchando live
```

- **Orden garantizado**: `id` es snowflake `<ms>-<pod>-<seq>`, lexicográfico. `XRANGE (lastId +` respeta orden cronológico.
- **Dedupe**: aún si el cliente recibe un evento dos veces (overlap replay/live), el dispatcher puede dedup por `ev.id` con un `Set` de últimos 100 IDs en el hook (omitido arriba por brevedad).

### 7.4 Filtrado

El cliente pasa **3 dimensiones** de filtro en query params:

| Param | Filtra | Implementación |
|---|---|---|
| `topics=metrics,clock,trends` | qué tipos de evento recibe | el gateway NO se suscribe a canales no pedidos (ahorra Redis带宽) |
| `engines=reddit,bluesky` | eventos con `source`/`engine` | filtro in-process en `enqueue` |
| `range=6H` | coherencia de series.tick | cliente valida `ev.data.range === range` antes de aplicar |

**Filtro a nivel Redis (no in-process)** cuando hay >2K conexiones: el gateway mantiene un contador por canal y solo hace `SUBSCRIBE` si ≥1 cliente lo pidió. Cuando el último cliente se va, `UNSUBSCRIBE`. Esto reduce el tráfico de Redis cuando la mayoría de usuarios están en pantalla `ajustes` (no necesitan `series` ni `scan`).

### 7.5 Escalado a 10K conexiones concurrentes

| Recurso | Cálculo | Resultado |
|---|---|---|
| Memoria por conexión (Node ReadableStream + cola 256 evts ~512B c/u) | 30 KB + 128 KB | **~160 KB** |
| 10K conexiones × 160 KB | — | **1.6 GB** |
| Pods gateway (Node 18, 2 vCPU, 1 GB c/u, 60% a conexiones) | 6K conn/pod | **2 pods** (3 con HA) |
| Suscriptores Redis (1 por pod) | — | **3 subscribers** |
| Throughput Redis Pub/Sub (200 msg/s × 6 canales) | 1.2K msg/s | **<5% CPU Redis** |
| File descriptors por pod (6K sockets + Redis) | — | ajustar `ulimit -n 65535` |

**Optimizaciones:**

- `runtime: 'nodejs'` + `--max-old-space-size=2048` por pod.
- 1 `RedisClient` **compartido** por pod (singleton `SHARED_SUBSCRIBER`). Evita 10K subscribers.
- HTTP/2 entre CF/edge y gateway → multiplexación, 1 TCP por cliente.
- **No usar Edge runtime**: cierra la conexión al final del request (stateless). SSE necesita socket persiste.
- Sticky sessions NO necesarias: el estado está en Redis, no en el pod. Cualquier pod sirve a cualquier cliente.
- **Auto-scaling**: HPA on `sse_connections_active > 5000` por pod → scale up. Scale down con `terminationGracePeriodSeconds: 60` para drenar conexiones (el cliente reconecta a otro pod con `Last-Event-ID`).

**Beyond 10K (50K+):** activar Sharded Pub/Sub + particionar canales por `trend.source` (`virahub:ch:trends:reddit`, etc.). El gateway enruta por hash del cliente. Esto se diseña pero **no se implementa** hasta que la métrica lo pida (YAGNI hoy).

---

## 8. Métricas de monitoreo

```ts
// lib/stream/metrics.ts — exporta a Prometheus vía /metrics
export const metrics = {
  inc(name: string, by = 1) { /* prom-client Counter */ },
  dec(name: string, by = 1) { /* prom-client Gauge */ },
  gauge(name: string, value: number) { /* prom-client Gauge */ },
}
```

| Métrica | Tipo | Descripción | Alerta |
|---|---|---|---|
| `sse_connections_active` | Gauge | conexiones abiertas por pod | >6000 → scale up |
| `sse_connections_total` | Counter | nuevas conexiones/min | pico >2x baseline → investigar |
| `sse_messages_sent_total{type}` | Counter | eventos enviados por tipo | throughput realtime |
| `sse_messages_dropped_total` | Counter | eventos dropeados por backpressure | >100/min sostenido → cliente roto |
| `sse_queue_depth` | Histogram | profundidad de cola por conexión | p99 > 200 → saturación |
| `sse_replay_total` | Counter | replays servidos | pico → red flaky |
| `sse_replay_failed_total` | Counter | replays fallidos (stream caído) | >0 → investigar Redis |
| `sse_heartbeat_missed_total` | Counter | heartbeats no enviados a tiempo | >0 → event loop bloqueado |
| `sse_connection_duration_seconds` | Histogram | duración de sesión | baja mediana → reconnects |
| `redis_pubsub_lag_seconds` | Gauge | ms entre PUBLISH y entrega a gateway | >500ms → Redis saturado |
| `redis_subscriber_disconnects_total` | Counter | desconexiones del subscriber singleton | >0 → reconectar Redis |
| `replay_stream_length` | Gauge | entradas en `virahub:stream:*` | cercano a MAXLEN → subir retención |

**Dashboard Grafana mínimo:** 4 paneles — (1) conns activas por pod, (2) msg/s por tipo, (3) drops + pressure events, (4) latencia Redis pubsub. **SLO**: P99 de `redis_pubsub_lag_seconds < 200ms` y `sse_messages_dropped_total < 0.1%` de sent.

---

## 9. Plan de degradación — qué pasa si Redis cae

### Escenarios y respuestas

```
┌──────────────────────────────┬──────────────────────────────────────────────┐
│ Escenario                    │ Respuesta automática                         │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ Redis Pub/Sub caído,         │ Gateway detecta disconnect del subscriber    │
│ nodo Stream/GET aún vivo     │ → sirve LVC (metrics, clock) a nuevas conns  │
│                              │ → emite system.degraded reason='redis_partial'│
│                              │ → cliente mantiene último UI + toast         │
│                              │ → reintento subscribe c/ backoff (100ms..2s) │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ Redis totalmente caído       │ Gateway no puede ni PUBLISH ni GET           │
│                              │ → circuit breaker abre tras 5 fallos/10s      │
│                              │ → emite system.degraded fallback='none'      │
│                              │ → cliente activa polling REST /api/snapshot   │
│                              │   cada 5s (useSnapshotPolling fallback hook) │
│                              │ → mantiene UI viva con datos stale            │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ Detector pipeline caído      │ Redis vive pero no llegan trends/series      │
│ (sin nuevos eventos)         │ → gateway cuenta silencio >30s               │
│                              │ → emite system.degraded reason='detector_lag'│
│                              │ → metrics.vitals.degraded=true (TopBar rojo) │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ Solo edge/CDN caído          │ Cliente EventSource.onerror → backoff retry  │
│                              │ → reconnect con Last-Event-ID                │
│                              │ → replay rellena el gap automáticamente     │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ Cliente en modo offline      │ EventSource encolaría, pero browser aborta   │
│                              │ → al volver online, reconnect + replay      │
│                              │ → si gap >5min: system.degraded reason=      │
│                              │   'replay_truncated' + refresh full snapshot │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

### Circuit breaker (gateway-side)

```ts
// lib/stream/circuit-breaker.ts
class RedisHealth {
  private failures = 0
  private lastFailure = 0
  state: 'closed' | 'open' | 'half_open' = 'closed'

  recordFailure() {
    this.failures++
    this.lastFailure = Date.now()
    if (this.failures >= 5) this.state = 'open'
  }
  recordSuccess() {
    this.failures = 0
    this.state = 'closed'
  }
  canTry(): boolean {
    if (this.state === 'closed') return true
    if (this.state === 'open' && Date.now() - this.lastFailure > 10_000) {
      this.state = 'half_open'
      return true
    }
    return this.state === 'half_open'
  }
}
export const redisHealth = new RedisHealth()
```

El subscriber llama `redisHealth.recordFailure()` en `client.on('error')` y `recordSuccess()` en cada mensaje recibido. Mientras `state === 'open'`, nuevas conexiones reciben `system.degraded` + LVC y NO intentan `XRANGE` (fallarían). Cada 10s permite un *half-open* probe.

### Fallback a polling REST

El hook `useVirahubStream` se complementa con:

```ts
// lib/stream/use-snapshot-polling.ts
'use client'
// Activa polling sólo si el stream lleva >20s sin mensajes Y hay system.degraded
export function useSnapshotPolling(active: boolean) {
  const { setAnalyzed, setLatency, setClock, setTrends } = useVirahub()
  useEffect(() => {
    if (!active) return
    const id = setInterval(async () => {
      try {
        const r = await fetch('/api/snapshot', { credentials: 'include' })
        if (!r.ok) return
        const snap = await r.json()
        setAnalyzed(snap.analyzed)
        setLatency(snap.latency)
        setClock(snap.clock)
        if (snap.trends?.length) setTrends(snap.trends)
      } catch { /* network sigue roto, reintentar */ }
    }, 5000)
    return () => clearInterval(id)
  }, [active])
}
```

`/api/snapshot` lee de Postgres (estado duradero) o de la LVC de Redis si Pub/Sub está caído pero el nodo responde. Nunca del Pub/Sub (que es lo roto).

**Regla de prioridad de fuentes:** `SSE live` > `SSE replay` > `LVC` > `REST snapshot` > `UI stale congelado`. El cliente siempre cae al siguiente nivel sin intervención manual.

---

## 10. Checklist de implementación (orden recomendado)

1. `lib/stream/events.ts` — contract TypeScript (compartido).
2. `lib/stream/redis-subscriber.ts` — singleton con re-subscribe.
3. `lib/stream/replay.ts` + `lib/stream/lvc.ts` — buffers.
4. `app/api/stream/route.ts` — endpoint SSE.
5. `lib/stream/use-virahub-stream.ts` — hook cliente.
6. Patch `components/virahub-provider.tsx`: eliminar 3 `setInterval`, llamar hook.
7. `lib/stream/metrics.ts` + endpoint `/metrics` Prometheus.
8. `app/api/snapshot/route.ts` — fallback REST.
9. Load test con `artillery` o `k6`: 5K conns, 200 msg/s, validar drops <0.1%.
10. Runbook de degradación (este doc §9) → wiki on-call.

**Notas para los demás agentes:**
- **Agente 1 (Frontend):** el contract `SseEvent` es la frontera. Cualquier UI nueva que necesite live data añade un caso al union type; no abre otro canal.
- **Agente 2 (Backend):** los productores (`detector-pipeline`, `rule-engine`, `metrics-aggregator`) sólo hacen `PUBLISH virahub:ch:<topic> <json>` + `XADD virahub:stream:<topic>`. No conocen SSE.
- **Agente 3 (Funcionalidad):** las alertas disparadas por reglas pasan por `virahub:ch:alerts` con `AlertFiredEvent`; el cliente sólo las muestra si el trend está en `alerts[]` del provider.
- **Agente 4 (Anti-gaming):** el `id` snowflake + `Last-Event-ID` evita que un cliente malintencionado pida replay infinito (CAP `REPLAY_LIMIT = 500`).

---

**Fin del diseño.** SSE + Redis Pub/Sub + Stream replay + LVC + circuit breaker = pipeline de push que sobrevive a caídas parciales, escala a 10K conns sin sharding, y degrada en silencio cuando Redis muere.
