# VIRAHUB — Documento Técnico Maestro (Backend) · Extracción Estructurada

> **Source file:** `/home/z/my-project/download/VIRAHUB-Doc-Tecnico-Backend.html`
> **Document title (as printed inside the HTML):** "VIRAHUB — Documento Técnico de Arquitectura y Backend"
> **Printed version on the cover:** "Documento Técnico Maestro · v1.0" / "v1.0.0 · 2025-07-31" / Estado: Ready-to-build
> **Note on version:** The user request referenced "v1.1" but the HTML file actually self-identifies as **v1.0.0 / 2025-07-31**. Extraction is verbatim from that file.
> **Authorship declared in doc:** "Síntesis de 6 agentes especializados · 7,758 líneas de código fuente analizadas" · "Orquestado por Agente 00 · Síntesis Maestra".

---

## 1. Stack tecnológico obligatorio

Citas textuales del documento:

- `PostgreSQL 16 + TimescaleDB + pgvector` (cover / sección 05).
- `Redis 7.4` (cover / sección 05).
- `Next.js 16` (App Router, Route Handlers, runtime `nodejs` for SSE).
- `React 19`.
- `Auth.js v5` (JWT + DB sessions, DrizzleAdapter, providers GitHub + Google).
- `Drizzle ORM` + `@auth/drizzle-adapter` (Auth.js adapter).
- `Prisma` (only for relational/dimensional models — `prisma migrate`, `prisma db seed`).
- `BullMQ` (7 colas, 22 workers, DLQ).
- `Zod` (every boundary).
- `@asteasolutions/zod-to-openapi` (OpenAPI 3.1 auto-gen).
- `@upstash/ratelimit` + `@upstash/redis` (token bucket, 5 tiers L1–L5).
- `p-retry` (withRetry wrapper in adapters).
- `undici` (HTTP client).
- `iconv-lite`.
- `@atproto/api` (Bluesky).
- `firebase` (HN Firebase REST).
- `onnxruntime-node` (multilingual-e5-small, 384-dim, ONNX runtime).
- `fast-text` (fastText `lid.176` language detection).
- `prom-client` (Prometheus metrics).
- `pino` + `pino-transport` (structured logging).
- Dev: `drizzle-kit`, `@types/pg`, `artillery`, `k6`.

Extensiones Postgres requeridas (declaradas en Fase 1 — "Shadow DB en CI con `timescaledb`, `vector`, `pg_trgm`, `btree_gin` preinstalados"):

- `timescaledb`
- `vector` (pgvector)
- `pg_trgm`
- `btree_gin`

Block de dependencias npm (verbatim):

```bash
# Core
pnpm add next-auth@5 @auth/drizzle-adapter zod @asteasolutions/zod-to-openapi
pnpm add drizzle-orm pg ioredis bullmq @upstash/ratelimit @upstash/redis
pnpm add p-retry undici iconv-lite

# Sources
pnpm add @atproto/api firebase

# ML / embeddings
pnpm add onnxruntime-node fast-text  # multilingual-e5-small ONNX + lid.176

# Observability
pnpm add prom-client pino pino-transport

# Dev
pnpm add -D drizzle-kit @types/pg artillery k6
```

Otras tecnologías citadas en la arquitectura (uso discutido pero NO en `package.json` declarado): Kafka (`trends.scored` topic, consumers downstream para alerts/reports), ClickHouse (roadmap, no day-1), NATS (roadmap), Qdrant (roadmap), HNSW (roadmap), Citus (roadmap), Debezium (CDC roadmap).

Métricas declaradas: "7 motores · 22 workers", "30 endpoints REST · 6 SSE", "8 tablas + 4 hypertables", "~37GB PG · ~100MB Redis", "10K conns SSE / 2 pods", "$150/mes baseline", "12K/h throughput menciones sostenidas", "≤4s latencia P50 ingest→emit", "47min lead time vs Twitter TT (media)".

---

## 2. Esquema de base de datos

### 2.1 Diagrama de relaciones (verbatim ASCII del doc)

```
                                  ┌──────────────────────────────┐
                                  │           users              │
                                  │  id PK  email  role          │
                                  └──────────────┬───────────────┘
                                                 │ 1
                                   ┌─────────────┼─────────────────────┐
                                   │ N           │ N                    │ N
                             ┌─────▼─────┐  ┌─────▼──────┐         ┌─────▼──────┐
                             │  folders  │  │saved_trends│         │ alert_rules│
                             │ id PK     │  │ id PK      │         │ id PK      │
                             │ user_id FK│  │ user_id FK │         │ created_by │
                             └─────┬─────┘  │ trend_id FK│         └─────┬──────┘
                                   │ 1      └────────────┘               │ 1
                                   │ N                                  │ N
                                                             ┌─────▼──────┐
                                                             │   alerts    │
                                                             │ id PK      │
                                                             │ rule_id FK │
                                                             └─────┬──────┘

  ┌─────────────────────────────┐         ┌──────────────────────────────┐
  │          trends             │ 1     N │     trend_scores (HYPERTABLE)│
  │ id PK  slug UNIQUE  label   ├────────►│ trend_id FK                  │
  │ keywords[]  aliases[]       │         │ bucket_time (partition key)  │
  │ current_score  velocity_1h  │         │ score  velocity  delta_pct   │
  │ mention_count_24h  shape    │         └──────────────────────────────┘
  │ first_seen  last_seen       │
  │ is_active  category         │         ┌──────────────────────────────┐
  └──────┬──────────────────────┘      1  │ mention_embeddings (HYPERTABLE)
         │ 1                              │     │ mention_id+ingested_at (PK)   │
         │ N                              │     │ embedding VECTOR(384)         │
  ┌──────▼──────────────────────────┐     │     │ (IVFFLAT, ~10% sample)        │
  │   mentions (HYPERTABLE)         │◄────┘ pgvector para dedup semántico │
  │ id+ingested_at PK (partition)   │     └──────────────────────────────┘
  │ trend_id FK  source ENUM        │
  │ source_id  author_handle        │     ┌──────────────────────────────┐
  │ content  lang  country          │     │   engine_logs (HYPERTABLE)    │
  │ sentiment  reach  engagement    │     │ engine_name  level  msg       │
  │ metadata JSONB  created_at      │     │ logged_at (partition key)     │
  └─────────────────────────────────┘     └──────────────────────────────┘

  Continuous aggregates (TimescaleDB):
    mentions_1h        → (bucket, trend_id, source)     GROUP BY 1h
    mentions_source_1h → (bucket, source)              GROUP BY 1h   ← alimenta "distribución por fuente"
    trend_scores_15m   → (bucket, trend_id)            GROUP BY 15m  ← alimenta sparklines
```

Tablas declaradas (8 relacionales + 4 hypertables + 3 continuous aggregates):

**Relacionales (8):** `users`, `folders`, `saved_trends`, `alert_rules`, `alerts`, `trends`, `engines_config`, `sources_registry` (estas dos últimas citadas en Fase 1: *"Setup `prisma/schema.prisma` con modelos relacionales (users, trends, alerts, engines_config, sources_registry, saved_trends, alert_rules)"*).

**Hypertables (4):** `mentions`, `trend_scores`, `mention_embeddings`, `engine_logs`.

**Continuous aggregates (3):** `mentions_1h`, `mentions_source_1h`, `trend_scores_15m`.

### 2.2 SQL verbatim de la hypertable `mentions`

```sql
CREATE TABLE mentions (
  id            BIGSERIAL,
  trend_id      BIGINT REFERENCES trends(id) ON DELETE SET NULL,
  source        source_key NOT NULL,
  source_id     TEXT NOT NULL,
  author_id     TEXT,
  author_handle TEXT,
  content       TEXT NOT NULL,
  lang          TEXT,
  country       TEXT,
  sentiment     REAL CHECK (sentiment BETWEEN -1 AND 1),
  reach         INTEGER,
  engagement    INTEGER,
  url           TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}',
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id, ingested_at)
);

SELECT create_hypertable('mentions', 'ingested_at',
  chunk_time_interval => INTERVAL '6 hours',
  if_not_exists       => TRUE);

-- Índices quirúrgicos (particionados por chunk automáticamente)
CREATE INDEX idx_mentions_trend_time   ON mentions (trend_id, ingested_at DESC);
CREATE INDEX idx_mentions_source_time ON mentions (source, ingested_at DESC);
CREATE UNIQUE INDEX uq_mentions_source_id ON mentions (source, source_id);
CREATE INDEX idx_mentions_content_fts ON mentions USING gin (to_tsvector('simple', content));
CREATE INDEX idx_mentions_author_trgm ON mentions USING gin (author_handle gin_trgm_ops);
CREATE INDEX idx_mentions_created_brin ON mentions USING brin (created_at) WITH (pages_per_range = 32);
CREATE INDEX idx_mentions_metadata_gin ON mentions USING gin (metadata jsonb_path_ops);

-- Compresión + retención automáticas
ALTER TABLE mentions SET (timescaledb.compress,
  timescaledb.compress_segmentby = 'source, trend_id',
  timescaledb.compress_orderby   = 'ingested_at DESC');
SELECT add_compression_policy('mentions', INTERVAL '3 days');
SELECT add_retention_policy('mentions', INTERVAL '90 days');
```

Columnas de `mentions` (tipo, índices): ver SQL arriba. Hipertable partition key = `ingested_at`, `chunk_time_interval = 6 hours`.

### 2.3 SQL verbatim del continuous aggregate `mentions_1h`

```sql
-- CAGG 1: menciones agregadas por hora, trend y fuente
CREATE MATERIALIZED VIEW mentions_1h
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', ingested_at) AS bucket,
  trend_id, source,
  COUNT(*)                            AS mention_count,
  COUNT(DISTINCT author_id)           AS unique_authors,
  AVG(sentiment)                      AS avg_sentiment,
  SUM(COALESCE(reach,0))              AS total_reach
FROM mentions
GROUP BY bucket, trend_id, source
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
  'mentions_1h',
  start_offset      => INTERVAL '3 hours',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '15 minutes'
);
```

### 2.4 Tablas/hypertables sin DDL completo (declaradas en diagrama o narrativa)

- **`trends`** (relacional) — columnas declaradas en diagrama: `id PK`, `slug UNIQUE`, `label`, `keywords[]`, `aliases[]`, `current_score`, `velocity_1h` (y `velocity_6h` referenciado en Query 1), `mention_count_24h`, `shape`, `first_seen`, `last_seen`, `is_active`, `category`, `dir`, `tone`, `cursorKey` (referenciado en endpoint GET /v1/trends), `visible` (referenciado en endpoint). DDL completo: **NOT SPECIFIED** (sólo se cita "Prisma migrate" para relacionales).
- **`trend_scores`** (hypertable) — columnas en diagrama: `trend_id FK`, `bucket_time` (partition key), `score`, `velocity`, `delta_pct`. Tabla de almacenamiento declara 144k filas/día, 50 B/fila, retención 365d.
- **`mention_embeddings`** (hypertable) — `mention_id+ingested_at (PK)`, `embedding VECTOR(384)` con índice IVFFLAT, ~10% sample, retención 30d.
- **`engine_logs`** (hypertable) — `engine_name`, `level`, `msg`, `logged_at` (partition key), retención 30d.
- **`trend_scores_15m`** (CAGG) — `(bucket, trend_id) GROUP BY 15m`, alimenta sparklines. DDL: NOT SPECIFIED.
- **`mentions_source_1h`** (CAGG) — `(bucket, source) GROUP BY 1h`, alimenta distribución por fuente. DDL: NOT SPECIFIED.
- **`users`** — `id PK`, `email`, `role`. Otras columnas: NOT SPECIFIED.
- **`folders`** — `id PK`, `user_id FK`.
- **`saved_trends`** — `id PK`, `user_id FK`, `trend_id FK`.
- **`alert_rules`** — `id PK`, `created_by` (FK user).
- **`alerts`** — `id PK`, `rule_id FK`.
- **`engines_config`**, **`sources_registry`** — citadas en Fase 1, schema: NOT SPECIFIED.

### 2.5 Enum `source_key`

TypeScript (Sección 2): `type SourceKey = 'reddit' | 'bluesky' | 'hn' | 'rss' | 'gdelt' | 'github' | 'x' | 'nvidia' | 'crypto'` → enum PG `source_key` con esos 9 valores. DDL del enum: NOT SPECIFIED (implícito en Prisma).

### 2.6 Top 5 consultas SQL optimizadas (verbatim de las mostradas)

**Query 1 — Top 6 trends por score (radar) · 0.165ms:**

```sql
SELECT id, slug, label, current_score, velocity_6h,
       mention_count_24h, delta_pct, shape, dir, tone
FROM trends
WHERE is_active = TRUE
  AND current_score > 0
  AND last_seen >= NOW() - INTERVAL '6 hours'
ORDER BY current_score DESC
LIMIT 6;

-- EXPLAIN ANALYZE: Index Scan Backward using idx_trends_active_score
-- Execution Time: 0.165 ms  (sub-milisegundo, partial B-tree DESC)
```

**Query 4 — Distribución por fuente (24h) · 0.710ms:**

```sql
SELECT source,
       SUM(mention_count) AS mention_count,
       SUM(unique_authors) AS unique_authors,
       ROUND(100.0 * SUM(mention_count) / NULLIF(SUM(SUM(mention_count)) OVER (), 0), 2) AS pct
FROM mentions_source_1h
WHERE bucket >= NOW() - INTERVAL '24 hours'
GROUP BY source
ORDER BY mention_count DESC;

-- EXPLAIN: lee del continuous aggregate mentions_source_1h
-- Chunks excluded during startup: 350  (chunk pruning)
-- Execution Time: 0.710 ms  (<1ms gracias al CAGG)
```

Queries 2, 3 y 5: NOT SPECIFIED (el doc menciona "5 consultas SQL optimizadas (0.16ms — 8ms)" pero sólo muestra explícitamente las número 1 y 4).

### 2.7 Estimación de almacenamiento (verbatim)

| Tabla | Filas/día | Bytes/fila | Raw/día | Con compresión | Retención | Total 90d |
|---|---|---|---|---|---|---|
| mentions | 1M | 580 B | 580 MB | 480 MB | 90d | ~30 GB |
| mention_embeddings (10%) | 100k | 1.5 KB | 150 MB | 100 MB | 30d | ~3 GB |
| trend_scores (5-min) | 144k | 50 B | 7 MB | 3 MB | 365d | ~1.5 GB |
| trend_scores_15m (CAGG) | 48k | 40 B | 2 MB | 1 MB | 365d | ~400 MB |
| mentions_1h (CAGG) | 216k | 50 B | 11 MB | 5 MB | 365d | ~1.8 GB |
| engine_logs | 100k | 200 B | 20 MB | 10 MB | 30d | ~300 MB |
| trends + alerts | +50/día | 400 B | 20 KB | — | ∞ | ~100 MB |
| **Total comprimido (90 días)** | | | | | | **~37 GB** |

### 2.8 Redis — diseño de keys (~25 keys con prefijo)

| Key pattern | Tipo | TTL | Propósito |
|---|---|---|---|
| `trends:active:top6` | STRING (JSON) | 60s | Cache top-6 por score (radar) |
| `trends:active:zset` | ZSET | refresh 5m | Leaderboard trends activos |
| `trend:{id}` | HASH | 10m | Metadata cacheada del trend |
| `trend:{id}:series:{range}` | STRING (JSON array) | 30s | Sparkline por rango (1H/6H/24H/7D) |
| `trend:{id}:vel:1h:zset` | ZSET | 7200s | Sliding window velocity (ZINCRBY por minuto) |
| `trend:{id}:authors:24h` | HYPERLOGLOG | 86400s | uniqueAuthors 24h (anti-gaming) |
| `mentions:dedup:{source}:{source_id}` | STRING | 86400s | Dedup exacto (SETNX) |
| `rl:ip:{ip}:{endpoint}` | STRING (INCR) | 60s | Rate limit por IP |
| `rl:user:{uid}:{endpoint}` | STRING (INCR) | 60s | Rate limit por usuario |
| `rl:source:{source}` | STRING (INCR) | 1s | Limitador QPS por fuente |
| `session:{token}` | HASH | 86400s | Sesión de usuario |
| `pubsub:alerts` | PUB/SUB channel | — | Notificación alertas nuevas (WS broadcast) |
| `pubsub:trends:update` | PUB/SUB channel | — | Notificación trends actualizadas |
| `engine:status:{name}` | HASH | 30s | Heartbeat del motor |
| `lock:trend:compute:{id}` | STRING (NX EX) | 30s | Lock distribuido (single-flight) |
| `queue:mentions` | STREAM | trim 100k | Backlog menciones sin clasificar |
| `cache:source:dist:24h` | STRING (JSON) | 300s | Cache distribución por fuente 24h |

Plus Pub/Sub channels / Streams / LVC (sección 06):
- Pub/Sub: `virahub:ch:metrics`, `virahub:ch:scan`, `virahub:ch:trends`, `virahub:ch:series`, `virahub:ch:alerts`, `virahub:ch:clock`.
- Streams (replay 5 min, `MAXLEN ~10k`): `virahub:stream:metrics`, `virahub:stream:trends`, `virahub:stream:alerts`, `virahub:stream:series`.
- LVC (KV): `virahub:lvc:metrics`, `virahub:lvc:clock`.
- Embedding cache: `vh:mention:embed:{id}` TTL 7d.
- Exact dedup: `vh:mention:dedup:{key}` where `key = sha1(normalized_text)`, `SET 1 EX 21600` (6h TTL).
- Hot trends ZSET: `trends:hot:{range}` (e.g. `trends:hot:1H`) — `ZADD` score=heat_score, frontend `ZREVRANGE 0 5`.

Velocity sliding window verbatim:

```
-- Escritura (cada mención):
ZINCRBY trend:{id}:vel:1h:zset 1 <minute_epoch>
ZREMRANGEBYSCORE trend:{id}:vel:1h:zset -inf <now-3600>
EXPIRE trend:{id}:vel:1h:zset 7200

-- Lectura (velocity instantánea):
ZSUM trend:{id}:vel:1h:zset  →  total menciones en la ventana
```

"Costo: O(log N) por inserción, N ≤ 60 (minutos). Da velocity exacto deslizante sin tocar Postgres, reconciliado con `trend_scores` cada 5 min."

---

## 3. Tipos TypeScript del dominio

### 3.1 `SourceKey`, `RangeKey`, `Shape` (alias literales)

```ts
type SourceKey = 'reddit' | 'bluesky' | 'hn' | 'rss' | 'gdelt' | 'github' | 'x' | 'nvidia' | 'crypto'
type RangeKey  = '1H' | '6H' | '24H' | '7D'
type Shape     = 'accel' | 'rise' | 'flat' | 'decay' | 'wobble'
```

### 3.2 `Trend` (UI base contract)

```ts
type Trend = {
  id: string
  title: string
  source: SourceKey
  color: string            // CSS color (var(--hot) | oklch() | hex)
  status: string           // frase corta: "Crecimiento acelerado"
  tone: 'hot' | 'cool' | 'mint' | 'muted'
  dir:  'up'   | 'down' | 'flat'
  time: string             // 'HH:MM' — última actualización
  heat: string             // 'Muy caliente' | 'Caliente' | 'Templado' | 'Enfriándose'
  confidence: number       // 0–100
  mentions: number         // menciones/hora (v_raw, no v_ewma)
  delta: number            // % vs ayer (puede ser negativo)
  shape: Shape             // determina la curva generada
  why: string              // explicación narrativa
  evidence: { label: string; value: string }[]   // 3 evidencias
  inTimeline?: boolean     // aparece en la línea multi-lane
}
```

Extended Zod schema (`packages/contracts/src/trends.ts`) añade: `followed?: boolean`, `saved?: boolean`.

### 3.3 `RawMention`

```ts
export interface RawMention {
  /** ID determinista: `${source}:${sourceId}` — único global */
  id: string;
  source: SourceKey;
  /** ID original en la fuente (Reddit 't3_abc123', HN '3921083', GitHub repo#issue#42) */
  sourceId: string;
  url: string;                          // URL canónica pública

  author: {
    id: string;                     // ID nativo (ej. 't2_user' Reddit)
    username: string;               // handle visible (@alice.bsky.social)
    displayName: string | null;
    followersCount: number | null;
    verified: boolean | null;
    profileUrl: string | null;
  };

  content: string;                    // texto plano, sin HTML
  lang: string;                       // ISO-639-1 ('es', 'en', 'und')

  publishedAt: number;                // Unix epoch ms (upstream)
  fetchedAt: number;                  // Unix epoch ms (VIRAHUB)

  engagement: {
    score: number | null;          // upvotes / likes / points
    comments: number | null;
    reposts: number | null;
    shares: number | null;
    views: number | null;
    extras: Record<string, number>;  // upvote_ratio, gilded, karma
  };

  entities: {
    hashtags: string[];
    urls: string[];
    mentions: string[];                 // handles referenciados
    cashtags: string[];                 // $TSLA, $BTC
    persons: string[];
    orgs: string[];
    places: string[];
  };

  raw: unknown;                        // payload original crudo (debug, replay)
}

export const buildMentionId = (source: SourceKey, sourceId: string): string =>
  `${source}:${sourceId}`;
```

Invariantes validados en runtime por `validateMention()` (verbatim):

- `id === buildMentionId(source, sourceId)` (recomputable) ·
- `publishedAt <= fetchedAt <= Date.now() + 60_000` (clock skew tolerable 1 min) ·
- `content.length > 0` (los posts vacíos se dropean antes) ·
- `lang` siempre presente aunque sea `'und'`.

### 3.4 `computeScore` signature (tipo de inputs del scoring)

```ts
export function computeScore(
  mentions: RawMention[],
  window: TimeWindow,
  ctx: Ctx,
  opts: { narrativeId: string; title: string; source: SourceKey;
          vEwmaHistory?: number[]; peakAt?: number },
): Trend
```

Tipos `TimeWindow` y `Ctx`: NOT SPECIFIED (no se declaran explícitamente, se infieren). `Ctx` se referencia con campos: `ctx.now`, `ctx.baselineVelocity`, `ctx.totalSourcesTracked ?? 9`, `ctx.recycled30d`, `ctx.sigmaV`. `TimeWindow` se infiere de la tabla temporal: campos `W`, `K`, `Δ`, `α`.

### 3.5 SSE types (Sección 06)

```ts
export type SseMeta = {
  id: string;          // monótono, lexicográficamente ordenable (snowflake)
  ts: number;          // epoch ms
  ch: SseChannel;      // canal Redis de origen
}

export type SseEvent =
  | MetricsVitalsEvent          // analyzed + latency + throughput + degraded
  | ClockTickEvent              // server-authoritative hh:mm
  | ScanEngineRotateEvent      // verb + phase por motor
  | ScanProgressEvent          // scanned/matched/progress por motor
  | SeriesTickEvent            // puntos delta por trend (no full series)
  | TrendDetectedEvent         // nuevo trend al radar (con contributedBy[])
  | TrendScoreEvent            // cambio de confidence/delta/mentions
  | AlertFiredEvent            // notificación push con cta opcional
  | SystemHeartbeatEvent       // serverTs + activeConns
  | SystemPressureEvent        // dropped + reason + recoverIn
  | SystemDegradedEvent        // reason + fallback + retryAt

export const TOPIC_TO_CHANNEL: Record<SseTopic, SseChannel> = {
  metrics: 'virahub:ch:metrics',
  clock:   'virahub:ch:clock',
  scan:    'virahub:ch:scan',
  series:  'virahub:ch:series',
  trends:  'virahub:ch:trends',
  alerts:  'virahub:ch:alerts',
  system:  'virahub:ch:metrics',   // piggyback en metrics channel
}
```

Definición de cada `*Event` (payload fields): NOT SPECIFIED — el doc sólo da el comentario inline (`// analyzed + latency + throughput + degraded`, etc.) como descripción del payload. Ver sección 7 para detalle.

### 3.6 Tipos NO declarados explícitamente en el doc

- `Cluster` — NOT SPECIFIED (sólo se menciona "clusters narrativos" en narrativa; clustering greedy con `cosine(emb, centroid) ≥ 0.78`).
- `ScoringInputs` — NOT SPECIFIED (no existe como tipo; el scoring toma `mentions: RawMention[]`, `window: TimeWindow`, `ctx: Ctx`, `opts: {...}`).
- `CircuitConfig`, `CircuitState` — implícitos en `DEFAULT_CB` (ver sección 11).
- `ListTrendsQuerySchema`, `ListTrendsResponse`, `ListTrendsResponseSchema` — Zod schemas, ver sección 8.

---

## 4. Fórmulas de scoring

### 4.1 Velocity (EWMA con ventana deslizante)

Discretización: ventana `W` se parte en `K` buckets de ancho `Δ = W/K`. Para 1H, `K=12, Δ=5min`. Para 7D, `K=28, Δ=6h`.

```
v_raw(n, t, W)  = |{ m ∈ n : t - W ≤ publishedAt(m) ≤ t }| / (W / 3600000)     # UI display "82 menc/h"
v_ewma(t)      = α · (c_k / Δ_hours)  +  (1 - α) · v_ewma(t - Δ)                # estabilizadora interna
```

"La UI necesita `v_raw` (interpretable), pero los cálculos de slope y shape detection necesitan `v_ewma` (estabilidad)."

### 4.2 Subscores de Confidence (0-100) — tabla verbatim

| Símbolo | Fórmula | Significado |
|---|---|---|
| `s_volume` | `clamp01(log10(1+M) / log10(101))` | Satura a 100 menciones. Log-scale: 1000 ≠ 10× más signal que 100. |
| `s_velocity` | `clamp01(v_ewma / v_p95_global)` | Normalizado contra p95 global (refresh cada 5min en Redis). |
| `s_breadth` | `clamp01(uniqueAuthors / 14)` | Necesita ≥14 autores para max. 14 = umbral anti "un solo pibe + sus bots". |
| `s_crosssrc` | `clamp01(uniqueSources / max(totalSourcesTracked, 3))` | Diversidad de plataformas. 1 fuente = sospechoso. |
| `s_origin` | `mean(authorQuality over earliest 5 authors)` | Calidad de quién lo originó. |
| `s_temporal` | `1 - H(buckets) / log2(K)` | Concentración temporal (Shannon). Picos marcados = alta. |
| `s_baseline` | `clamp01(|delta| / 500)` | Delta grande vs baseline = más confianza en novedad real. |

`H(buckets)` es la entropía de Shannon sobre la distribución de menciones en los K buckets. `log2(K)` es la entropía máxima (distribución uniforme). `s_temporal = 1` cuando toda la actividad se concentra en 1 bucket.

### 4.3 Pesos calibrados (suma 1) — `base`

```
base = 0.22·s_velocity + 0.20·s_breadth + 0.18·s_origin + 0.15·s_crosssrc
     + 0.10·s_baseline + 0.10·s_volume  + 0.05·s_temporal
```

Pesos surgidos de "backtesting sobre 90 días de GDELT+Reddit+Twitter, maximizando lead-time sobre Trending Topics de Twitter (media: 47 min)."

### 4.4 Penalty multiplicativo (anti-gaming)

```
penalty  =  p_spam · p_bot · p_recycle

p_spam    = (uniqueAuthors / M) < 0.4  ?  (uniqueAuthors/M)/0.4  :  1     # pocas cuentas hablan mucho
p_bot     = 1 - avg(botScore over mentions)                                # botScore ∈ [0,1]
p_recycle = recycled30d  ?  0.3  :  1                                      # ya visto en 30d → -70%

confidence = round(100 · base · penalty)
```

Ejemplo del doc: "una bot campaign con `p_bot = 0.05` y todo lo demás perfecto da `confidence = round(100 · 0.85 · 0.05) = 4`. En una suma aditiva, daría `~75`."

### 4.5 Shape detection — 5 fases

```
slope_short   = ( v_ewma(t)       - v_ewma(t - W/4) ) / (W/4 hours)     # 1ª derivada, último cuarto
slope_long    = ( v_ewma(t - W/4) - v_ewma(t - W/2) ) / (W/4 hours)     # 1ª derivada, cuarto previo
accel         = slope_short - slope_long                                # 2ª derivada
σ_v           = stdev( v_ewma over last 7d )                            # noise floor del cluster
variance_ratio = var(last 6 buckets) / mean(last 6 buckets)             # CV² aproximado

if  variance_ratio > 1.5  AND  |slope_short| < 0.15·σ_v  →  wobble    # oscila sin tendencia
if  accel > 0.3·σ_v         AND  slope_short > 0          →  accel     # 2ª derivada positiva
if  slope_short > 0.2·σ_v   AND  accel ≥ -0.1·σ_v         →  rise      # crecimiento lineal
if  slope_short < -0.3·σ_v                                →  decay     # cayendo
else                                                       →  flat
```

| VIRAHUB shape | Estado UI | Heat band | Descripción |
|---|---|---|---|
| accel | "Crecimiento acelerado" / "Señal emergente" | ≥ 0.85 → Muy caliente | Aceleración anómala, lead time óptimo |
| rise | "Señal emergente" / "Rumor en crecimiento" | 0.60-0.85 → Caliente | Crecimiento lineal, ya visible pero no peak |
| flat | "Actividad estable" | 0.30-0.60 → Templado | Estabilizada en plateau |
| decay | "Interés en descenso" | < 0.30 → Enfriándose | Pendiente negativa sostenida |
| wobble | "Actividad inestable" / "Señal débil" | variable | Oscilación, signal ruidosa |

### 4.6 Delta vs baseline

`delta = round(100·(v_raw - baseline) / baseline)` donde baseline excluye últimas 24h (verbatim Sección 08 etapa 6).

### 4.7 Author quality (caché 24h por autor)

```
authorQuality = 0.5 + 0.2·verified_bonus + 0.2·tenure_bonus + 0.1·follower_bonus - 0.5·bot_penalty
```

Clampado a `[0,1]`. Para GDELT (no hay autor) → `0.6` fijo (medio institucional). Bot score: tercero (Botometer) en MVP, propio (XGBoost sobre features de coordinación) en roadmap.

### 4.8 Configuración de ventanas temporales (verbatim)

| Range | W | K (buckets) | Δ (ancho) | α (EWMA) | N_eff | Caso de uso |
|---|---|---|---|---|---|---|
| 1H | 1h | 12 | 5 min | 0.30 | ~5.7 (~28 min) | Burst detection tiempo real |
| 6H | 6h | 12 | 30 min | 0.25 | ~7 (~3.5 h) | Forma intra-día |
| 24H | 24h | 24 | 1 h | 0.20 | ~9 (~9 h) | Trend diario |
| 7D | 7d | 28 | 6 h | 0.15 | ~12.3 (~3 d) | Baseline semanal |

`α=0.25` se usa para 6H window en el ejemplo end-to-end.

---

## 5. 7 motores de captura

### 5.1 Tabla comparativa — 7 motores (verbatim)

| # | Motor | Método | Auth | Rate limit real | Workers | Costo USD/mes |
|---|---|---|---|---|---|---|
| 1 | Reddit | REST OAuth2 | client_credentials | 60 req/min OAuth · headers X-Ratelimit-* | 4 | $0 |
| 2 | Bluesky | Firehose WS + REST fallback | Anónimo firehose / sesión PDS | REST 3000 pts/h · firehose sin límite | 1 stream + 2 REST | $0 |
| 3 | Hacker News | Firebase REST | None | No documentado · autorregulado 100 req/min | 3 | $0 |
| 4 | RSS | HTTP GET condicional | None / Basic Auth | Respeta `<ttl>`, ETag, If-Modified-Since | 6 | $0 |
| 5 | GDELT | REST DOC 2.0 + GEO 2.0 | None | ~1 req/5s recomendado · 1 req/s factible | 2 | $0 |
| 6 | GitHub | REST v3 + GraphQL v4 | PAT fine-grained / GitHub App | 5000 req/h core · 30 req/min Search | 4 | $0 |
| 7 | X (Twitter) | API v2 filtered stream + search recent | Bearer token / OAuth 1.0a | Free: inútil · Basic $100/mes: 10K posts/mes, 60 req/15min | 2 | $100 |

### 5.2 Detalle por motor (campos extraídos y reglas de transformación)

El doc NO provee un bloque "API endpoint exacto a llamar + mapping campo-a-campo" por cada uno de los 7 motores. Lo que sí declara verbatim:

**Reddit** (ver Sección 08, etapa 1-2): El adapter descarga el post, valida User-Agent (Reddit banea defaults), respeta `X-Ratelimit-Remaining`, aplica exponential backoff con jitter ±25% si recibe 429. Normaliza el payload crudo a `RawMention` con ID determinista `'reddit:t3_abc123'`. El payload original se preserva en `raw: unknown` para replay y debugging. Cadencia polling 60s. Ejemplo: post en r/MachineLearning con `source_id='t3_abc123'`, `publishedAt=1719459120000`, `author='u/ia_policy_es'`, `ups=342`. Endpoint específico REST: NOT SPECIFIED (sólo "REST OAuth2 client_credentials").

**Bluesky**: Firehose WS (Jetstream URL declarada en `.env`: `BLUESKY_JETSTREAM_URL=wss://jetstream1.us-east.bsky.network/subscribe`). PDS URL: `BLUESKY_PDS_URL=https://bsky.social`. Auth: anónimo firehose o sesión PDS. REST fallback: 3000 pts/h. Concurrency=1 (long-lived WS). Adapter package: `@atproto/api`.

**Hacker News**: Firebase REST. Auth: None. Autorregulado 100 req/min. Adapter package: `firebase`. Endpoint específico: NOT SPECIFIED.

**RSS**: HTTP GET condicional. Auth: None / Basic Auth. Respeta `<ttl>`, `ETag`, `If-Modified-Since`. 304 Not Modified → skip, no contar como fetch (ver matriz de errores).

**GDELT**: REST DOC 2.0 + GEO 2.0. Auth: None. ~1 req/5s recomendado (1 req/s factible). Cadencia 5min. Endpoint: NOT SPECIFIED.

**GitHub**: REST v3 + GraphQL v4. Auth: PAT fine-grained / GitHub App. 5000 req/h core · 30 req/min Search. Env var: `GITHUB_TOKEN=ghp_xxx` (PAT con read:public). Cadencia 2min. Endpoints: NOT SPECIFIED.

**X (Twitter)**: API v2 filtered stream + search recent. Auth: Bearer token / OAuth 1.0a. Free tier inútil. Basic $100/mes: 10K posts/mes, 60 req/15min. Env vars: `X_BEARER_TOKEN`, `X_API_KEY`, `X_API_KEY_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`. Hard cap declarado en riesgos: "2 concurrentes, 100 jobs/h".

**Campos a extraer** (comunes a todos — normalización a `RawMention`): `id`, `source`, `sourceId`, `url`, `author.{id,username,displayName,followersCount,verified,profileUrl}`, `content`, `lang`, `publishedAt`, `fetchedAt`, `engagement.{score,comments,reposts,shares,views,extras}`, `entities.{hashtags,urls,mentions,cashtags,persons,orgs,places}`, `raw`.

**Reglas de transformación comunes** (Sección 08 etapa 5): Unicode NFKC, lowercase, URL canonicalization, entity extraction, language detection (fastText lid.176). `buildMentionId(source, sourceId) = ${source}:${sourceId}`. Validación runtime por `validateMention()` (4 invariantes — ver sección 3.3).

### 5.3 Topología de colas BullMQ (verbatim)

| Cola | Cadencia | Concurrency | Workers | Timeout | Attempts | Priority |
|---|---|---|---|---|---|---|
| `q:reddit` | 60s | 4 | 4 | 120s | 5 | 5 |
| `q:bluesky` | 5s | 1 (stream) | 1 | 30s | 3 | 1 (máxima) |
| `q:hn` | 30s | 3 | 3 | 60s | 5 | 7 |
| `q:rss` | 5min | 6 | 6 | 180s | 8 | 8 |
| `q:gdelt` | 5min | 2 | 2 | 180s | 3 | 6 |
| `q:github` | 2min | 4 | 4 | 90s | 5 | 4 |
| `q:x` | 60s | 2 | 2 | 60s | 4 | 3 |
| **TOTAL** | — | **22 workers** | — | | | |

### 5.4 Matriz de errores → acción (verbatim)

| Error HTTP | Acción | Retries |
|---|---|---|
| 200 OK | Procesar normalmente | — |
| 304 Not Modified (RSS) | Skip, no contar como fetch | — |
| 429 Too Many Requests | Sleep Retry-After + re-enqueue | ilimitado (cap) |
| 401/403 | No retry — alerta ops (token expirado) | No |
| 404 Not Found | No retry — item gone | No |
| 500/502/503/504 | Exponential backoff | hasta 5 |
| ECONNRESET / ENOTFOUND | Backoff corto | hasta 3 |
| Timeout (AbortSignal) | Backoff medio | hasta 3 |

---

## 6. Pipeline de deduplicación

### 6.1 Doble capa Redis (Sección 03 — `dedupe()`)

```ts
/**
 * 1. Redis SET `seen:{source}:{sourceId}` con TTL 7 días — dedup exacto
 * 2. Redis HyperLogLog `hll:content:{source}` — dedup aproximado por simhash
 */
export async function dedupe(mentions: RawMention[]): Promise<RawMention[]> {
  const out: RawMention[] = [];
  const pipeline = redisConnection.pipeline();

  for (const m of mentions) {
    pipeline.setnx(`seen:${m.source}:${m.sourceId}`, '1');
    pipeline.expire(`seen:${m.source}:${m.sourceId}`, 7 * 86400);
  }

  const results = await pipeline.exec();
  mentions.forEach((m, i) => {
    // results[i*2] = [err, reply] del setnx; reply === 1 → nuevo
    if (results![i * 2][1] === 1) out.push(m);
  });

  return out;
}
```

### 6.2 Stage 3 — Dedup semántico multicapa

**① Exact dedup (O(1) lookup)**

- `key = sha1(normalized_text)` · `EXISTS vh:mention:dedup:{key}`
- Si hit: DROP, incrementar `dedup_exact_hits`.
- Si miss: `SET 1 EX 21600` (6h TTL).
- Descarta reposts literales, copy-paste y cross-postings exactos <6h.

**② MinHash + LSH**

- 128 funciones hash permutadas (seed fija).
- k-shingles `k=5`.
- LSH banding: **32 bands × 4 rows**.
- Para `Jaccard=0.85` → ~100% recall.
- Verificación fina: par candidato → Jaccard exacto, umbral `≥ 0.85` confirma dup.
- Costo: ~0.6ms/mención.

**Fórmula de probabilidad de colisión LSH (verbatim):**

```
P(collision) = 1 - (1 - J^r)^b    con r=4, b=32, J=0.85 → ≈ 1.000 (recall ~100%)
Para J=0.5 → 1 - (1 - 0.5^4)^32 ≈ 0.872 (falsos positivos altos → verificación fina)
```

### 6.3 Embedding model

- Modelo: **`multilingual-e5-small`**.
- Dimensión: **384**.
- Runtime: **ONNX** (`onnxruntime-node`).
- Cache: `vh:mention:embed:{id}` TTL 7d en Redis.
- Storage PG: `mention_embeddings.embedding VECTOR(384)` con índice IVFFLAT, ~10% sample, retención 30d.

### 6.4 Similarity threshold (clustering greedy)

"si `cosine(emb, centroid) ≥ 0.78` → asigna a cluster existente y actualiza centroid (`α=0.1`); si no → nuevo cluster."

### 6.5 NER entity-rigid-veto rules

**NOT SPECIFIED.** El doc declara entidades (`hashtags`, `urls`, `mentions`, `cashtags`, `persons`, `orgs`, `places`) en `RawMention.entities` y menciona "entity extraction" en la etapa de normalización, pero **no define reglas explícitas de veto rígido por entidad NER** (e.g. "dos menciones no pueden mergearse si tienen cashtags distintos"). El pipeline de clustering descrito es greedy por similitud coseno + MinHash Jaccard, sin veto por entidad.

---

## 7. 11 tipos de eventos SSE

Declaración verbatim (Sección 06):

```ts
export type SseEvent =
  | MetricsVitalsEvent          // analyzed + latency + throughput + degraded
  | ClockTickEvent              // server-authoritative hh:mm
  | ScanEngineRotateEvent      // verb + phase por motor
  | ScanProgressEvent          // scanned/matched/progress por motor
  | SeriesTickEvent            // puntos delta por trend (no full series)
  | TrendDetectedEvent         // nuevo trend al radar (con contributedBy[])
  | TrendScoreEvent            // cambio de confidence/delta/mentions
  | AlertFiredEvent            // notificación push con cta opcional
  | SystemHeartbeatEvent       // serverTs + activeConns
  | SystemPressureEvent        // dropped + reason + recoverIn
  | SystemDegradedEvent        // reason + fallback + retryAt
```

Mapeo a canales Redis (`TOPIC_TO_CHANNEL`):

| SseTopic | SseChannel |
|---|---|
| metrics | `virahub:ch:metrics` |
| clock | `virahub:ch:clock` |
| scan | `virahub:ch:scan` |
| series | `virahub:ch:series` |
| trends | `virahub:ch:trends` |
| alerts | `virahub:ch:alerts` |
| system | `virahub:ch:metrics` (piggyback) |

**Payload detallado por evento** — el doc NO provee un bloque `interface MetricsVitalsEvent {...}` explícito. Los payloads se infieren de los comentarios inline y de la narrativa Sección 06:

| # | Event type (`event:` field SSE) | Canal | Payload (inferido del comentario / narrativa) |
|---|---|---|---|
| 1 | `metrics.vitals` | `virahub:ch:metrics` | `{ analyzed, latency, throughput, degraded }` — alimenta `setAnalyzed` / `setLatency` en TopBar. |
| 2 | `clock.tick` | `virahub:ch:clock` | `{ hh: 'HH:MM' }` server-authoritative — `setClock`. |
| 3 | `scan.engine.rotate` | `virahub:ch:scan` | `{ engine, verb, phase }` — LiveScan phase rotation. |
| 4 | `scan.progress` | `virahub:ch:scan` | `{ engine, scanned, matched, progress }` por motor. |
| 5 | `series.tick` | `virahub:ch:series` | `{ trendId, deltaPoints[] }` — puntos delta por trend (no full series) — `setStep` (regenera lanes). |
| 6 | `trend.detected` | `virahub:ch:trends` | `{ trend: Trend, contributedBy: SourceKey[] }` — nuevo trend al radar. Ejemplo wire: `{"id":"1719459120000-pod3-000123","ts":1719459120000,"ch":"virahub:ch:trends","type":"trend.detected","data":{"trend":{...},"contributedBy":["reddit","bluesky"]}}`. |
| 7 | `trend.score` | `virahub:ch:trends` | `{ trendId, confidence, delta, mentions }` — update de un trend existente. |
| 8 | `alert.fired` | `virahub:ch:alerts` | `{ alert, cta? }` — notificación push con CTA opcional → `notify()` + toast. |
| 9 | `system.heartbeat` | `virahub:ch:metrics` | `{ serverTs, activeConns }` — heartbeat comentado (`: hb <ts>`) cada 15s. |
| 10 | `system.pressure` | `virahub:ch:metrics` | `{ dropped, reason, recoverIn }` — cada 10 drops. Cliente setea `data-vh-pressure='1'` en `<html>`. |
| 11 | `system.degraded` | `virahub:ch:metrics` | `{ reason, fallback, retryAt }` — razones declaradas: `redis_partial`, `redis_total`, `detector_lag`, `replay_truncated`. |

Wire format SSE (RFC 8895) — verbatim:

```
id: 1719459120000-pod3-000123
event: trend.detected
data: {"id":"1719459120000-pod3-000123","ts":1719459120000,"ch":"virahub:ch:trends","type":"trend.detected","data":{"trend":{...},"contributedBy":["reddit","bluesky"]}}

-- Heartbeat es comentario (no dispara onmessage, resetea timeout proxy):
: hb 1719459123000
```

Estructura del envelope SSE (común a los 11 eventos): `{ id, ts, ch, type, data }` (los 4 primeros = `SseMeta`, `type` = event name, `data` = payload específico).

**Discrepancia:** la portada del doc declara "**6 SSE streams**" (catálogo consolidado Sección 02 lista 6 endpoints SSE: `/api/stream`, `/api/scan/stream`, `/api/trends/stream`, `/api/engines/live`, `/api/engines/logs/stream`, `/api/alerts/stream`) pero la narrativa Sección 01 y Sección 06 declara "**11 tipos de evento**" en un único stream multiplexado (`GET /api/stream?topics=…`). Ambos cuentan cosas distintas (streams vs tipos-de-evento) y conviven en el doc.

---

## 8. API endpoints

### 8.1 Catálogo consolidado Sección 02 (40 REST + 6 SSE) — endpoints UI heredados

**SSE · 6 streams:**

```
GET /api/stream             # unificado multiplexado
GET /api/scan/stream         # 1.4s TopBar
GET /api/trends/stream       # 2.6s timeline
GET /api/engines/live        # 2s LiveScan
GET /api/engines/logs/stream # continuo logs
GET /api/alerts/stream       # on-event alerts
```

**REST · 40 endpoints** (ver submenu abajo — el catálogo consolidado de la Sección 02 sólo lista 16 explícitamente; el resto se delega al "Agente 1"):

```
# Trends (8)
GET    /api/hero/summary
GET    /api/trends?q=
GET    /api/trends/{id}
GET    /api/trends/{id}/conversations
GET    /api/trends/{id}/sources
GET    /api/trends/{id}/history
GET    /api/trends/timeline?range=
POST   /api/ai/summarize          { trendId }

# Engines (8)
GET    /api/engines
PATCH  /api/engines/{id}
POST   /api/engines/bulk-toggle
PUT    /api/engines/{id}/config
POST   /api/engines/{id}/test
GET    /api/engines/aggregate
GET    /api/engines/logs?limit=

# Alerts (9) · Saved (10) · Reports (4) · User (10)
# ... ver Agente 1 para catálogo completo
```

Endpoints UI adicionales referenciados en la matriz componente → endpoint (Sección 02):
- `POST /api/scan/toggle`
- `PATCH /api/user/preferences`
- `GET /api/hero/summary`
- `POST /api/engines/{id}/toggle`
- `POST /api/alerts/quick`
- `POST /api/saved`
- `POST /api/ai/summarize`
- `GET /api/trends/{id}/conversations`
- `GET /api/trends/{id}/sources`
- `GET /api/trends/{id}/history`
- `GET /api/trends/timeline?range=`
- CRUD `/api/alerts/rules`
- `/api/alerts/events`
- `SSE /api/alerts/stream`
- `GET /api/engines`
- `PATCH /api/engines/{id}`
- `PUT /api/engines/{id}/config`
- `POST /api/engines/{id}/test`
- `SSE /api/engines/logs/stream`
- `GET /api/reports?period=`
- `POST /api/ai/executive-summary`
- `POST /api/reports/export`
- `GET/PATCH /api/user/profile`
- `GET/PATCH /api/user/notifications`
- `GET/POST/DELETE /api/user/api-keys/{id}`
- `GET /api/system/info`
- `GET /api/saved`
- `POST/DELETE /api/saved/{trendId}`
- `GET/POST /api/folders`
- `GET /api/saved/export?format=`
- `GET /api/health/ingestion`

### 8.2 Catálogo Sección 07 — 30 endpoints `/v1/*` (versionado OpenAPI 3.1)

| Método | Ruta | Auth | Rate limit | Descripción |
|---|---|---|---|---|
| **Trends (7 endpoints)** | | | | |
| GET | `/v1/trends` | ✅ | L1 / 1 | Lista trends activos. Filtros: `?source=`, `?tone=`, `?shape=`, `?dir=`, `?cursor=&limit=` |
| GET | `/v1/trends/:id` | ✅ | L1 / 1 | Detalle de un trend (incluye why, evidence) |
| POST | `/v1/trends/:id/follow` | ✅ | L3 / 2 | Seguir trend (idempotente) |
| DELETE | `/v1/trends/:id/follow` | ✅ | L3 / 1 | Dejar de seguir |
| GET | `/v1/trends/:id/timeline` | ✅ | L2 / 2 | Serie temporal. `?range=1H\|6H\|24H\|7D&step=` |
| GET | `/v1/trends/:id/conversations` | ✅ | L2 / 2 | Menciones agrupadas por hilo |
| GET | `/v1/trends/:id/sources` | ✅ | L1 / 1 | Distribución por fuente (pie data) |
| **Alerts (6 endpoints)** | | | | |
| GET | `/v1/alerts` | ✅ | L1 / 1 | Reglas activas del usuario |
| POST | `/v1/alerts` | ✅ | L3 / 3 | Crear regla. Body: `trendId, condition, threshold, channel` |
| PATCH | `/v1/alerts/:id` | ✅ | L3 / 2 | Toggle enabled o modificar threshold |
| DELETE | `/v1/alerts/:id` | ✅ | L3 / 1 | Eliminar regla |
| GET | `/v1/alerts/history` | ✅ | L2 / 2 | Historial de disparos |
| GET | `/v1/alerts/feed` | ✅ | L2 / 1 | Bandeja notificaciones no leídas |
| **Saved (5) · Engines (4) · Reports (2) · Settings (3) · Stream + Auth (3)** | | | | |
| GET | `/v1/saved` | ✅ | L1 / 1 | Guardados del usuario. `?folder=&pinned=` |
| POST | `/v1/saved/:trendId` | ✅ | L3 / 2 | Guardar trend. Body opcional: `folder, note` |
| GET | `/v1/saved/export` | ✅ | L4 / 10 | Exportar guardados. `?format=json\|md` |
| GET | `/v1/engines` | ✅ | L1 / 1 | Estado de motores (id, name, status, lastRun, health) |
| PATCH | `/v1/engines/:id` | ✅+ | L3 / 3 | Toggle enabled o actualizar config (admin) |
| POST | `/v1/engines/:id/test` | ✅+ | L4 / 25 | Test de conexión (1 shot costoso) |
| GET | `/v1/reports` | ✅ | L2 / 2 | Informe agregado. `?period=today\|week\|month` |
| GET | `/v1/settings` | ✅ | L1 / 1 | Preferencias del usuario |
| PATCH | `/v1/settings` | ✅ | L3 / 1 | Actualizar preferencias |
| PUT | `/v1/settings/api-keys/:service` | ✅ | L3 / 3 | Guardar API key externa (cifrada at-rest) |
| GET | `/v1/stream` (SSE) | ✅ | L4 / 5 | SSE gateway. `?topics=trends,alerts` |
| POST | `/auth/signin` | ❌ | L5 / 1 | Login (delegado a Auth.js) |
| POST | `/auth/signout` | ✅ | L5 / 1 | Logout |

`✅+` = requiere rol admin.

**Discrepancia numérica del doc:** la portada y Sección 02 declaran "**40 REST + 6 SSE**" y "**30 endpoints REST · 6 SSE**" simultáneamente. La Sección 07 titulariza "30 endpoints" pero la tabla suma 22 filas explícitas (7 Trends + 6 Alerts + 1 Saved-list + 1 Saved-create + 1 Saved-export + 1 Engines-list + 1 Engines-patch + 1 Engines-test + 1 Reports + 1 Settings-GET + 1 Settings-PATCH + 1 Settings-API-keys-PUT + 1 SSE-stream + 1 signin + 1 signout = 22). Los 8 endpoints faltantes para llegar a 30 son NOT SPECIFIED explícitamente (el doc los delega a "Agente 1").

### 8.3 Endpoint de referencia `GET /v1/trends` (código verbatim)

```ts
export const GET = apiHandler<ListTrendsResponse>(
  async (ctx) => {
    const query = (ctx as any).query as ListTrendsResponse

    // Consulta con cursor pagination (keyset) — O(log n), estable
    const conditions = [eq(trends.visible, true)]
    if (query.source) conditions.push(eq(trends.source, query.source))
    if (query.tone)   conditions.push(eq(trends.tone, query.tone))
    if (query.shape)  conditions.push(eq(trends.shape, query.shape))
    if (query.cursor) conditions.push(lt(trends.cursorKey, query.cursor))

    const rows = await db.select({ ... })
      .from(trends)
      .where(and(...conditions))
      .orderBy(desc(trends.cursorKey))
      .limit(query.limit + 1)   // +1 row trick para detectar siguiente página

    const hasMore = rows.length > query.limit
    const items = hasMore ? rows.slice(0, query.limit) : rows
    const nextCursor = hasMore ? items[items.length - 1]?.id : null

    // Validación de SALIDA — nunca confíes en tu DB
    const payload: ListTrendsResponse = { items, nextCursor, total: items.length }
    const validated = ListTrendsResponseSchema.safeParse(payload)
    if (!validated.success) throw ApiError.internal()

    const etag = await computeEtag(query, ctx.user.id)
    if (ctx.req.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } })
    }

    return NextResponse.json(validated.data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        ETag: etag,
        Vary: 'Cookie',
      },
    })
  },
  {
    auth: true,
    rateLimit: { tier: 'L1', cost: 1 },
    query: ListTrendsQuerySchema,
  },
)
```

### 8.4 Status codes / catálogo de 13 códigos de error (RFC 7807 + `code` + `traceId`)

Ejemplo verbatim de respuesta de error:

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json
Content-Language: en

{
  "type":      "https://docs.virahub.io/errors/validation",
  "title":     "Validation failed",
  "status":    422,
  "code":      "VALIDATION_ERROR",
  "detail":    "2 fields failed validation",
  "traceId":   "trc_01HQ2XK7F8...",
  "instance":  "/v1/alerts",
  "errors": [
    { "path": "threshold", "message": "Expected number, received string", "code": "invalid_type" },
    { "path": "condition", "message": "Invalid enum value. Expected 'gt'|'lt'|'delta_pct', received 'greater'" }
  ]
}
```

Catálogo de 13 códigos (verbatim):

| code | HTTP | Cuándo |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No hay sesión o JWT expirado |
| `TOKEN_EXPIRED` | 401 | JWT expirado (cliente puede refresh) |
| `FORBIDDEN` | 403 | Sesión válida pero sin permiso (role) |
| `NOT_FOUND` | 404 | Recurso inexistente o no visible |
| `VALIDATION_ERROR` | 422 | Zod safeParse falla |
| `CONFLICT` | 409 | Follow duplicado, alerta ya existe |
| `RATE_LIMITED` | 429 | Rate limit excedido |
| `PAYLOAD_TOO_LARGE` | 413 | Body > 1MB |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Content-Type no JSON |
| `METHOD_NOT_ALLOWED` | 405 | Verb no soportado en ruta |
| `UPSTREAM_ERROR` | 502 | Motor externo caído (Reddit, GDELT…) |
| `INTERNAL_ERROR` | 500 | Catch-all. Nunca filtra detalles |
| `SERVICE_UNAVAILABLE` | 503 | Maintenance / dependencia degradada |

Status codes exitosos declarados: `200 OK`, `304 Not Modified` (ETag match).

### 8.5 Contratos compartidos `@virahub/contracts` (Zod) — verbatim

```ts
// packages/contracts/src/trends.ts
import { z } from 'zod'

export const SourceKeySchema = z.enum([
  'reddit', 'bluesky', 'hn', 'rss', 'gdelt', 'github', 'x', 'nvidia', 'crypto',
])
export const ShapeSchema = z.enum(['accel', 'rise', 'flat', 'decay', 'wobble'])
export const RangeKeySchema = z.enum(['1H', '6H', '24H', '7D'])

export const TrendSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  source: SourceKeySchema,
  color: z.string(),
  status: z.string(),
  tone: z.enum(['hot', 'cool', 'mint', 'muted']),
  dir: z.enum(['up', 'down', 'flat']),
  time: z.string(),
  heat: z.string(),
  confidence: z.number().min(0).max(100),
  mentions: z.number().int().min(0),
  delta: z.number().int(),
  shape: ShapeSchema,
  why: z.string(),
  evidence: z.array(z.object({ label: z.string(), value: z.string() })),
  inTimeline: z.boolean().optional(),
  followed: z.boolean().optional(),
  saved: z.boolean().optional(),
})

export const ListTrendsQuerySchema = z.object({
  source: SourceKeySchema.optional(),
  tone: z.enum(['hot', 'cool', 'mint', 'muted']).optional(),
  shape: ShapeSchema.optional(),
  dir: z.enum(['up', 'down', 'flat']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
```

### 8.6 Health check `GET /api/health/ingestion` (código verbatim)

```ts
// app/api/health/ingestion/route.ts
export async function GET() {
  const report: Record<string, unknown> = {};

  for (const [name, queueName] of Object.entries(QUEUES)) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      redisConnection.llen(`${queueName}:wait`),
      redisConnection.llen(`${queueName}:active`),
      redisConnection.zcard(`${queueName}:completed`),
      redisConnection.zcard(`${queueName}:failed`),
      redisConnection.zcard(`${queueName}:delayed`),
    ]);
    report[name] = {
      queue: { waiting, active, completed, failed, delayed },
      concurrency: POOL[name].concurrency,
      circuit: getMetrics(name).circuit,
      lastSuccess: getMetrics(name).lastSuccessAt,
      errorRate: getMetrics(name).errorRate5min,
    };
  }

  const healthy = Object.values(report).every(
    (r: any) => r.circuit.state !== 'OPEN' && r.errorRate < 0.3,
  );

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', latencyMs: Date.now() - start, ts: Date.now(), engines: report },
    { status: healthy ? 200 : 503 },
  );
}
```

### 8.7 Middleware pipeline (13 pasos, orden verbatim)

```
Edge Runtime (middleware.ts):
  1. CORS preflight
  2. Origin allowlist
  3. Path match
  4. Auth gate (JWT verify) — 401 si expirado, pinta req.user en hdr

Route Handler (Node Runtime) — apiHandler(handler, { auth, rateLimit, query }):
  5.  Trace ID (uuid)
  6.  Auth (DB-back)
  7.  Rate limit (Upstash)
  8.  Zod query parse
  9.  Zod body parse
  10. Logic (DB / stream)
  11. Zod response validation (defensa en profundidad)
  12. ETag / Cache-Control / Vary
  13. Attach X-Trace-Id + X-RateLimit-* headers
```

Response headers (GitHub-style): `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`, `X-Trace-Id`, `ETag`, `Cache-Control: private, max-age=30, stale-while-revalidate=60`, `Vary: Cookie`.

---

## 9. Alertas

### 9.1 Endpoints de alertas (ver Sección 8)

REST: `GET /v1/alerts`, `POST /v1/alerts`, `PATCH /v1/alerts/:id`, `DELETE /v1/alerts/:id`, `GET /v1/alerts/history`, `GET /v1/alerts/feed`. SSE: `GET /api/alerts/stream` y `GET /v1/stream?topics=alerts`.

### 9.2 Rule schema

**NOT SPECIFIED** — el doc NO declara un Zod schema o SQL DDL explícito para `alert_rules`. Lo único declarado:

- Tabla PG `alert_rules` (relacional): columnas `id PK`, `created_by FK user`. Otras columnas: NOT SPECIFIED.
- Tabla PG `alerts` (eventos disparados): `id PK`, `rule_id FK`.
- Body del POST `/v1/alerts` (verbatim): `trendId, condition, threshold, channel`.
- `condition` enum (deducido del ejemplo RFC 7807): `'gt' | 'lt' | 'delta_pct'` (literal: `"Invalid enum value. Expected 'gt'|'lt'|'delta_pct', received 'greater'"`).
- `channel`: NOT SPECIFIED (valores enum no declarados; implícito "notificación push" por `AlertFiredEvent`).
- UI: `AlertRule[]`, `TriggeredEvent[]`, 4 KPIs (active / triggeredToday / unack / totalTriggers).
- `PATCH /v1/alerts/:id` permite "Toggle enabled o modificar threshold" → campo `enabled: boolean` implícito.

### 9.3 Trigger conditions

**NOT SPECIFIED** explícitamente. Sólo se infiere que un `AlertFiredEvent` se dispara cuando `condition` (`gt`/`lt`/`delta_pct`) sobre `threshold` se cumple para un `trendId` dado. Narrativa Sección 06 etapa pipeline: "detector-pipeline + rule-engine → dispara alertas" → PUBLISH en `virahub:ch:alerts` + `XADD virahub:stream:alerts`.

### 9.4 Anti-fatigue logic

**NOT SPECIFIED.** El doc no declara lógica de cooldown, dedup de disparos, ni supresión por ventana deslizante para alertas. La única mención relacionada es el campo `unack` en los KPIs de AlertsScreen (notificaciones no acknowledgeadas) y `TriggeredEvent[]` para historial.

---

## 10. Anti-gaming

### 10.1 Features usadas (subscores + penalties)

**Subscores contribuyentes (ver sección 4.2):**
- `s_breadth = clamp01(uniqueAuthors / 14)` — umbral 14 autores para max.
- `s_crosssrc = clamp01(uniqueSources / max(totalSourcesTracked, 3))` — 1 fuente = sospechoso.
- `s_origin = mean(authorQuality over earliest 5 authors)` — calidad del originador.

**Penalty multiplicativo:**

```
penalty  =  p_spam · p_bot · p_recycle

p_spam    = (uniqueAuthors / M) < 0.4  ?  (uniqueAuthors/M)/0.4  :  1     # pocas cuentas hablan mucho
p_bot     = 1 - avg(botScore over mentions)                                # botScore ∈ [0,1]
p_recycle = recycled30d  ?  0.3  :  1                                      # ya visto en 30d → -70%

confidence = round(100 · base · penalty)
```

### 10.2 Threshold values (verbatim)

| Feature / Threshold | Valor | Efecto |
|---|---|---|
| `s_breadth` saturación | `uniqueAuthors ≥ 14` | Máximo `s_breadth = 1.0` |
| `p_spam` umbral | `uniqueAuthors / M < 0.4` | Penalty activo; `p_spam = (uniqueAuthors/M)/0.4` |
| `p_recycle` factor | `0.3` si `recycled30d = true` | -70% del score |
| `p_bot` factor | `1 - avg(botScore)` | botScore ∈ [0,1] |
| `s_volume` saturación | `M ≥ 100` menciones | `s_volume = 1.0` (log10(101)/log10(101)) |
| `s_crosssrc` | `uniqueSources / max(totalSourcesTracked, 3)` | min 3 fuentes para no penalizar |
| `s_baseline` | `|delta| / 500` | saturación a delta=500% |
| Bot score source | Botometer (3rd party) MVP / XGBoost propio roadmap | botScore ∈ [0,1] |
| `authorQuality` fórmula | `0.5 + 0.2·verified + 0.2·tenure + 0.1·follower - 0.5·bot_penalty` (clamp [0,1]) | GDELT → 0.6 fijo |

### 10.3 Penalty multipliers

- `p_spam ∈ [0, 1]` — multiplicador continuo, proporcional a `(uniqueAuthors/M)/0.4` cuando `uniqueAuthors/M < 0.4`, sino `1`.
- `p_bot ∈ [0, 1]` — `1 - avg(botScore)`.
- `p_recycle ∈ {0.3, 1}` — binario: visto en 30d → `0.3`, sino `1`.

Producto `penalty = p_spam · p_bot · p_recycle` — cualquier `p_i = 0` mata el score. Ejemplo verbatim: "una bot campaign con `p_bot = 0.05` y todo lo demás perfecto da `confidence = round(100 · 0.85 · 0.05) = 4`."

### 10.4 Hook en pipeline

"Hook en `onMentions()` antes de publish → scoring de spam/astroturfing" (Fase 3, plan implementación).

---

## 11. Resilience patterns

### 11.1 Rate limiter (token bucket Upstash, 5 tiers)

**Tiers (verbatim):**

| Tier | Burst | Sustained (/min) | Aplica a |
|---|---|---|---|
| L1 | 60 | 120 | Reads ligeros (GET /trends, GET /alerts) |
| L2 | 30 | 60 | Reads medios (timeline, conversations, history) |
| L3 | 20 | 40 | Mutaciones (POST, PATCH, DELETE) |
| L4 | 10 | 20 | Export / SSE / test de motor |
| L5 | 5 | 10 | Auth (anti brute-force) |

Implementación verbatim:

```ts
// Identifier: `user:{userId}` si autenticado, si no `ip:{ip}`.
// Nunca rate-limit sólo por IP en usuarios logueados (NAT/CGNAT rompe UX).
const limiters = {
  L1: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, '1 m'), prefix: 'rl:L1' }),
  L2: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60,  '1 m'), prefix: 'rl:L2' }),
  L3: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(40,  '1 m'), prefix: 'rl:L3' }),
  L4: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20,  '1 m'), prefix: 'rl:L4' }),
  L5: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10,  '1 m'), prefix: 'rl:L5' }),
} as const

// Override por plan: pro × 2, team × 5 (factor multiplicativo en el coste).
// Response headers (GitHub-style): X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After.
```

Nota: la portada/sección 07 dice "token bucket Upstash" pero el código usa `Ratelimit.slidingWindow` (sliding window, no token bucket puro). La disonancia está en el doc original.

Rate limit por fuente (ingesta): `rl:source:{source}` STRING INCR TTL 1s (QPS cap por fuente).

### 11.2 Circuit Breaker por motor (verbatim)

```ts
export const DEFAULT_CB: Record<string, CircuitConfig> = {
  reddit:  { failureThreshold: 10, cooldownMs: 60_000,  halfOpenProbes: 2, successThreshold: 3 },
  bluesky: { failureThreshold: 5,  cooldownMs: 30_000,  halfOpenProbes: 2, successThreshold: 3 },
  hn:      { failureThreshold: 8,  cooldownMs: 30_000,  halfOpenProbes: 2, successThreshold: 3 },
  rss:     { failureThreshold: 15, cooldownMs: 120_000, halfOpenProbes: 3, successThreshold: 5 },
  gdelt:   { failureThreshold: 5,  cooldownMs: 300_000, halfOpenProbes: 1, successThreshold: 3 },
  github:  { failureThreshold: 8,  cooldownMs: 60_000,  halfOpenProbes: 2, successThreshold: 3 },
  x:       { failureThreshold: 5,  cooldownMs: 120_000, halfOpenProbes: 1, successThreshold: 3 },
};

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private openedAt = 0;

  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeRecover();
    if (this.state === 'OPEN') {
      throw new CircuitOpenError(this.source, this.openedAt);
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }
}
```

Resumen de parámetros por motor:

| Motor | failureThreshold | cooldownMs (reset timeout) | halfOpenProbes | successThreshold |
|---|---|---|---|---|
| reddit | 10 | 60_000 (60s) | 2 | 3 |
| bluesky | 5 | 30_000 (30s) | 2 | 3 |
| hn | 8 | 30_000 (30s) | 2 | 3 |
| rss | 15 | 120_000 (120s) | 3 | 5 |
| gdelt | 5 | 300_000 (300s) | 1 | 3 |
| github | 8 | 60_000 (60s) | 2 | 3 |
| x | 5 | 120_000 (120s) | 1 | 3 |

Estados: `CLOSED` → `OPEN` (tras `failureThreshold` fallos consecutivos) → `HALF_OPEN` (tras `cooldownMs`, deja pasar `halfOpenProbes` probes) → `CLOSED` (tras `successThreshold` éxitos consecutivos en HALF_OPEN).

Circuit breaker SSE gateway (Sección 06, plan de degradación): "Redis totalmente caído → circuit breaker abre tras **5 fallos/10s** → emite `system.degraded` `fallback='none'`."

### 11.3 Retry strategy

**Adapter con `withRetry`** (Sección 01 diagrama + Sección 08 etapa 2): "aplica exponential backoff con jitter **±25%** si recibe 429" (Reddit; patrón general a todos los adapters).

**Matriz de retries por error HTTP** (ver sección 5.4):
- 429: sleep `Retry-After` + re-enqueue, ilimitado (cap)
- 500/502/503/504: exponential backoff, hasta 5
- ECONNRESET/ENOTFOUND: backoff corto, hasta 3
- Timeout (AbortSignal): backoff medio, hasta 3
- 401/403/404: no retry

**Attemps por cola BullMQ** (ver sección 5.3): reddit=5, bluesky=3, hn=5, rss=8, gdelt=3, github=5, x=4. DLQ con `cap 3 retries` (declarado en Fase 2: "DLQ con cap 3 retries").

**Backoff base / fórmula de backoff**: NOT SPECIFIED explícitamente. Sólo se declara "exponential backoff con jitter ±25%" y "backoff corto / medio" cualitativamente. La librería usada es `p-retry`.

**Cliente SSE backoff**: "reintento subscribe c/ backoff (100ms..2s)" (plan de degradación Redis Pub/Sub caído).

### 11.4 Health & degradation matrix (Sección 06)

| Escenario | Respuesta automática |
|---|---|
| Redis Pub/Sub caído, nodo Stream/GET aún vivo | Gateway detecta disconnect del subscriber → sirve LVC (metrics, clock) a nuevas conns → emite `system.degraded reason='redis_partial'` → cliente mantiene último UI + toast → reintento subscribe c/ backoff (100ms..2s) |
| Redis totalmente caído | Gateway no puede ni PUBLISH ni GET → circuit breaker abre tras 5 fallos/10s → emite `system.degraded fallback='none'` → cliente activa polling REST `/api/snapshot` cada 5s → mantiene UI viva con datos stale |
| Detector pipeline caído (sin nuevos eventos) | Redis vive pero no llegan trends/series → gateway cuenta silencio >30s → emite `system.degraded reason='detector_lag'` → `metrics.vitals.degraded=true` (TopBar rojo) |
| Solo edge/CDN caído | Cliente `EventSource.onerror` → backoff retry → reconnect con `Last-Event-ID` → replay rellena el gap automáticamente |
| Cliente offline >5min | Stream ya expiró (`MAXLEN ~10000` ≈ 5min) → replay parcial: gateway manda `system.degraded reason='replay_truncated'` → cliente pinta lo que hay + sigue escuchando live |

Prioridad de fuentes: `SSE live` > `SSE replay` > `LVC` > `REST snapshot` > `UI stale congelado`.

### 11.5 Backpressure SSE (3 capas)

1. **TCP** — Socket del cliente lento llena `recv buffer` → kernel deja de ACK → `controller.desiredSize` del `WritableStream` baja. El drainer deja de encolar.
2. **Cola por conexión (256 evts)** — Para eventos no críticos (`scan.*`, `series.tick`, `metrics.vitals`) se dropea el más viejo. Para críticos (`alert.fired`, `system.degraded`) se desplaza un no-crítico.
3. **Señal al cliente** — Cada 10 drops se envía `system.pressure`. El cliente setea `data-vh-pressure='1'` en `<html>` y el CSS frena animaciones pesadas.

Drainer no-bloqueante: `setTimeout(drain, 20)` si `desiredSize ≤ 0`. Saturación terminal: si la cola lleva >30s llena → `controller.error()` para forzar reconnect del cliente (vendrá con `Last-Event-ID` y recibirá replay).

---

## 12. Observabilidad

El doc **NO dedica una sección explícita a observabilidad**. Lo que se declara, disperso:

### 12.1 Logs

- Librería: `pino` + `pino-transport` (declarado en `pnpm add`).
- "Logging estructurado" (checklist del endpoint de referencia Sección 07).
- Redacción: "logger redacta campos `key`, `token`, `authorization`" (matriz de riesgos Sección 09).
- `engine_logs` hypertable (Postgres): columnas `engine_name`, `level`, `msg`, `logged_at` (partition key). Retención 30d. ~100k filas/día, 200 B/fila, ~300 MB total 30d.
- Endpoint SSE dedicado: `GET /api/engines/logs/stream` (continuo logs) y `GET /api/engines/logs?limit=`.
- **Formato exacto del log (schema pino, levels, fields)**: NOT SPECIFIED.

### 12.2 Métricas

- Librería: `prom-client` (Prometheus).
- Endpoint declarado implícitamente: Fase 2 "Entrega: 22 workers + health endpoint + métricas Prometheus". M2: "métricas Prometheus visibles".
- Métricas expuestas por el health endpoint `GET /api/health/ingestion` (derivadas, no dump Prometheus directo): por motor — `queue.{waiting, active, completed, failed, delayed}`, `concurrency`, `circuit`, `lastSuccessAt`, `errorRate5min`. Healthy si `circuit.state !== 'OPEN' AND errorRate < 0.3`.
- Métricas del adapter: `getMetrics(name).circuit`, `getMetrics(name).lastSuccessAt`, `getMetrics(name).errorRate5min`, `dedup_exact_hits`.
- SSE gateway: `dropped` (contador de drops, emite `system.pressure` cada 10), `activeConns` (en `system.heartbeat`).
- Redis info: `keyspace_misses / (hits + misses)` (trigger escalado si >5%), `redis_pubsub_input_bytes` (trigger Sharded Pub/Sub si >50 MB/s sostenido).
- **Lista exhaustiva de métricas Prometheus (names, types, labels)**: NOT SPECIFIED.

### 12.3 Traces

- `X-Trace-Id` header en toda respuesta (paso 5 y 13 del middleware pipeline).
- `traceId` campo en errores RFC 7807 (`"traceId": "trc_01HQ2XK7F8..."`).
- Generación: `uuid` (paso 5 middleware).
- **Distributed tracing backend (OpenTelemetry, Jaeger, etc.)**: NOT SPECIFIED. No se menciona OTel, spans, ni exportador de traces.

### 12.4 Dashboard / SLOs declarados

- Latencia end-to-end: P50 ~3.5s, P95 ~12s, P99 ~30s (tabla "Latencia por etapa").
- Latencia por etapa (P50/P95/P99): verbatim Sección 08:

| Etapa | P50 | P95 | P99 |
|---|---|---|---|
| 1. Fuente emite | 0ms | 0ms | 0ms |
| 2. Adapter normaliza | 50ms | 200ms | 1s (con retry) |
| 3. BullMQ + circuit breaker | 20ms | 100ms | 500ms |
| 4. Dedup + INSERT | 10ms | 30ms | 100ms |
| 5. Normalize + MinHash + cluster | 800ms | 3s | 8s |
| 6. Scoring | 50ms | 200ms | 500ms |
| 7. EMIT (3 canales paralelos) | 5ms | 20ms | 100ms |
| 8. SSE Gateway fan-out | 20ms | 100ms | 500ms |
| 9. Browser dispatch | 5ms | 20ms | 50ms |
| 10. React render | 16ms (1 frame) | 50ms | 100ms |
| **TOTAL end-to-end** | **~3.5s** | **~12s** | **~30s** |

- Query latency PG: Query 1 (radar top6) 0.165ms; Query 4 (source dist 24h) 0.710ms. Rango declarado: "0.16ms — 8ms".
- Load test target (Fase 5): "5K conns SSE, 200 msg/s, validar drops < 0.1%".

---

## Anexo A — Variables de entorno requeridas (verbatim)

```bash
# .env (no commitear — solo referencia)
REDIS_URL=redis://localhost:6379

# Reddit
REDDIT_CLIENT_ID=xxx
REDDIT_CLIENT_SECRET=xxx
REDDIT_USER_AGENT="virahub:0.1.0 (by /u/your_username)"

# Bluesky
BLUESKY_PDS_URL=https://bsky.social
BLUESKY_JETSTREAM_URL=wss://jetstream1.us-east.bsky.network/subscribe

# GitHub
GITHUB_TOKEN=ghp_xxx  # PAT con read:public

# X (Basic $100/mes mínimo)
X_BEARER_TOKEN=xxx
X_API_KEY=xxx
X_API_KEY_SECRET=xxx
X_ACCESS_TOKEN=xxx
X_ACCESS_TOKEN_SECRET=xxx

# Auth.js v5
AUTH_SECRET=<256-bit secret>
GITHUB_ID=xxx
GITHUB_SECRET=xxx
GOOGLE_ID=xxx
GOOGLE_SECRET=xxx

# Rate limiting
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Ingest config
INGEST_SINCE_HOURS=1
INGEST_DLQ_MAX_RETRIES=3
INGEST_DEDUP_TTL_DAYS=7

# Feature flags
USE_LIVE_SCORING=false  # migración gradual por usuario
```

## Anexo B — Plan de implementación (5 fases, 12-14 semanas)

| Fase | Semanas | Entrega |
|---|---|---|
| 1 — Fundaciones de datos y contratos | 1-2 | schema PG + Redis keys + paquete `@virahub/contracts` |
| 2 — Ingesta de 7 motores | 3-5 | 22 workers + health endpoint + métricas Prometheus |
| 3 — Motor de scoring y pipeline | 6-8 | `lib/pipeline.ts` + `lib/scoring.ts` integrado + 6 trends reales |
| 4 — API Gateway + SSE streaming | 9-11 | 30 endpoints REST + SSE multiplexado + Auth.js v5 |
| 5 — Migración frontend y hardening | 12-14 | frontend sin mocks + load test 10K conns |

Milestones: M1 (sem 2) schema listo · M2 (sem 5) ingesta viva · M3 (sem 8) scoring funcional · M4 (sem 11) API+SSE listos · M5 (sem 14) frontend migrado.

## Anexo C — Auth.js v5 config (verbatim)

```ts
import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },  // 30 días
  providers: [
    GitHub({ clientId: process.env.GITHUB_ID!, clientSecret: process.env.GITHUB_SECRET! }),
    Google({ clientId: process.env.GOOGLE_ID!, clientSecret: process.env.GOOGLE_SECRET! }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id   = user.id
        token.role = (user as any).role ?? 'user'
        token.plan = (user as any).plan ?? 'free'
      }
      return token
    },
    async session({ session, token }) {
      session.user.id   = token.id as string
      session.user.role = token.role as UserRole
      session.user.plan = token.plan as Plan
      return session
    },
  },
  pages: { signIn: '/login', error: '/auth/error' },
})
```

Cookie: `httpOnly + Secure + SameSite=Lax` (Fase 4). Session JWT maxAge 30 días.

## Anexo D — Open questions declaradas por el doc (Agente 6)

1. ¿Redis gestionado por Upstash o self-hosted? ¿Postgres para Auth.js sessions o DynamoDB?
2. ¿El `confidence` (0-100) viene ya calculado del pipeline o lo infiere el gateway?
3. ¿React 19 Suspense + fetch en server components para `GET /trends`?
4. ¿Audit logging obligatorio para `PUT /settings/api-keys/:service` y `POST /engines/:id/test`?
5. ¿API pública (3rd-party developers) en roadmap? Si sí, añadir `POST /v1/oauth/token` + scopes antes de v1 freeze.
