# AGENTE 4 · DB & Series Temporales — VIRAHUB

> **Postura**: VIRAHUB es un sistema *write-heavy* (menciones crudas) con *read patterns* predecibles (top trends, sparklines, distribución por fuente). La decisión de arquitectura clave es **separar el camino caliente (Redis) del camino persistente (Postgres+Timescale)**: Redis sostiene todo lo que vive < 1h y se lee en cada render del radar; Postgres+Timescale sostiene el histórico, las agregaciones y las consultas analíticas. No metemos ClickHouse ni shards en day-1 — lo añadimos cuando aparezcan los cuellos de botella reales (sección Escalado).

> **Stack**: PostgreSQL 16 + TimescaleDB 2.15 + pgvector 0.7 (IVFFLAT) + Redis 7.4 (Streams + Pub/Sub + ZSET). Orquestación de schema con **Prisma para tablas relacionales** + **SQL idempotente para hypertables/extensiones/índices vectoriales** que Prisma no modela.

> **Alineación con el código existente**: el frontend (`lib/virahub-data.ts`) ya define `SourceKey` = `reddit | bluesky | hn | rss | gdelt | github | x | nvidia | crypto`, `Shape` = `accel | rise | flat | decay | wobble`, `RangeKey` = `1H | 6H | 24H | 7D`. Este schema los usa como enums literales en Postgres para que el mapeo a TypeScript sea directo y sin traducciones.

---

## 0. Diagrama de relaciones (ASCII)

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
                              └─────┬─────┘  │ trend_id FK│         │ trend_id FK│
                                    │ 1      │ folder_id  │         └─────┬──────┘
                                    │ N      └────────────┘               │ 1
                              (saved_trends.folder_id)                    │ N
                                                                    ┌─────▼──────┐
                                                                    │   alerts   │
                                                                    │ id PK      │
                                                                    │ rule_id FK │
                                                                    │ trend_id FK│
                                                                    └─────┬──────┘
                                                                          │ N
  ┌──────────────────────────────────────────────────────────────────────┘
  │
  │
  ▼ N
┌─────────────────────────────┐         ┌──────────────────────────────┐
│          trends             │ 1     N │     trend_scores (HYPERTABLE)│
│ id PK  slug UNIQUE  label   ├────────►│ trend_id FK                  │
│ keywords[]  aliases[]       │         │ bucket_time (partition key)  │
│ current_score  velocity_1h  │         │ score  velocity  delta_pct   │
│ mention_count_24h  shape    │         └──────────────────────────────┘
│ first_seen  last_seen       │
│ is_active  category         │         ┌──────────────────────────────┐
└──────┬──────────────────────┘      1  │ mention_embeddings (HYPERTABLE)
       │ 1                              │ mention_id+ingested_at (PK)   │
       │ N                              │ embedding VECTOR(384)         │
┌──────▼──────────────────────────┐     │ (IVFFLAT, ~10% sample)        │
│   mentions (HYPERTABLE)         │◄────┘ pgvector para dedup semántico │
│ id+ingested_at PK (partition)   │     └──────────────────────────────┘
│ trend_id FK  source ENUM        │
│ source_id  author_handle        │     ┌──────────────────────────────┐
│ content  lang  country          │     │   engine_logs (HYPERTABLE)    │
│ sentiment  reach  engagement    │     │ engine_name  level  msg       │
│ metadata JSONB  created_at      │     │ logged_at (partition key)     │
└─────────────────────────────────┘     └──────────────────────────────┘

  ┌────────────────────────┐    ┌───────────────────────┐    ┌─────────────────────┐
  │   engines_config       │    │   engine_stats_daily  │    │   sources_registry  │
  │ id PK  engine_name UNI │    │ date+engine UNIQUE    │    │ key PK  display     │
  │ config JSONB  priority │    │ analyzed  errors      │    │ color  is_enabled   │
  │ last_run_at  status    │    │ avg/max/p95/p99 lat   │    │ rate_limit_qps      │
  └────────────────────────┘    └───────────────────────┘    └─────────────────────┘

  Continuous aggregates (TimescaleDB):
    mentions_1h      → (bucket, trend_id, source)     GROUP BY 1h
    mentions_source_1h → (bucket, source)            GROUP BY 1h   ← alimenta dashboard "distribución por fuente"
    trend_scores_15m → (bucket, trend_id)            GROUP BY 15m  ← alimenta sparklines
```

**Leyenda de cardinalidades**: `1 ── N` = uno a muchos; `(HYPERTABLE)` = particionada por tiempo en TimescaleDB; `FK` = foreign key; `UNI` = unique.

**Decisiones estructurales importantes**:
- `mentions` y `mention_embeddings` se **separan**: las menciones crudas se escriben a alta velocidad sin vector (580 B/fila); los embeddings (1.5 KB/fila) se calculan **solo para una muestra del ~10%** (estrategia anti-dedup + similar-trend detection). Esto reduce el volumen persistido en >70%.
- `trends` es la tabla **dimensional** (una fila por trend detectado, actualizada por el motor `trends`). `trend_scores` es la **serie temporal** (una fila por bucket de tiempo por trend). El patrón "dimensión + serie temporal" es el que mejor escala en TimescaleDB porque los JOINs contra la dimensión son baratos y la serie temporal se comprime muy bien.
- `current_score`, `velocity_1h`, `mention_count_24h` viven **denormalizados** en `trends` (escritos por el motor) y son lo que lee el dashboard en el camino caliente. `trend_scores` es la fuente de verdad histórica; un job nocturno reconcilia ambos.

---

## 1. Schema SQL completo (PostgreSQL + TimescaleDB + pgvector)

### 1.1 Extensiones y setup inicial

```sql
-- ============ EXTENSIONES ============
-- Ejecutar una sola vez por DB (rol superuser). Idempotente.
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS vector;          -- pgvector 0.7+ (IVFFLAT + HNSW)
CREATE EXTENSION IF NOT EXISTS pg_trgm;         -- búsqueda fuzzy en labels/slugs
CREATE EXTENSION IF NOT EXISTS btree_gin;       -- combinar GIN con btree

-- ============ ENUMS ============
-- Alineados 1:1 con lib/virahub-data.ts para que el ORM no traduzca.
CREATE TYPE source_key AS ENUM (
  'reddit','bluesky','hn','rss','gdelt','github','x','nvidia','crypto'
);

CREATE TYPE shape_kind AS ENUM ('accel','rise','flat','decay','wobble');
CREATE TYPE range_key AS ENUM ('1H','6H','24H','7D');
CREATE TYPE alert_severity AS ENUM ('low','medium','high','critical');
CREATE TYPE alert_status   AS ENUM ('active','acknowledged','resolved','suppressed');
CREATE TYPE alert_metric   AS ENUM ('score','velocity','mention_count','delta_pct','source_spread');
CREATE TYPE user_role      AS ENUM ('admin','editor','viewer');
CREATE TYPE log_level      AS ENUM ('debug','info','warn','error');
CREATE TYPE trend_dir      AS ENUM ('up','down','flat');
CREATE TYPE trend_tone     AS ENUM ('hot','cool','mint','muted');

-- ============ POLÍTICAS DE COMENTARIOS ============
COMMENT ON TYPE source_key IS 'Fuentes activas en VIRAHUB. Sincronizado con lib/virahub-data.ts SourceKey.';
```

### 1.2 Tablas dimensionales / relacionales (Prisma-friendly)

```sql
-- ============ USERS ============
CREATE TABLE users (
  id           BIGSERIAL PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  name         TEXT,
  role         user_role NOT NULL DEFAULT 'viewer',
  api_key_hash TEXT,                       -- para API programática (opcional)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ
);
CREATE INDEX idx_users_role ON users (role) WHERE role IN ('admin','editor');

-- ============ SOURCES REGISTRY ============
-- Catálogo de fuentes: display name, color, habilitado, rate limit por fuente.
CREATE TABLE sources_registry (
  key            source_key PRIMARY KEY,
  display        TEXT NOT NULL,
  color          TEXT NOT NULL,             -- p.ej. 'var(--hot)' o oklch(...)
  is_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  rate_limit_qps INTEGER NOT NULL DEFAULT 5, -- limitador por fuente (fetcher respeta)
  priority       INTEGER NOT NULL DEFAULT 0,
  config         JSONB NOT NULL DEFAULT '{}',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO sources_registry (key, display, color, priority) VALUES
  ('reddit','Reddit','var(--hot)',100),
  ('bluesky','Bluesky','oklch(0.72 0.21 300)',90),
  ('x','X (Twitter)','#1d9bf0',85),
  ('hn','Hacker News','#ff6600',75),
  ('rss','RSS Feeds','oklch(0.62 0.12 200)',60),
  ('gdelt','GDELT','oklch(0.65 0.18 265)',55),
  ('github','GitHub','oklch(0.70 0.04 280)',50),
  ('nvidia','NVIDIA','oklch(0.78 0.16 140)',45),
  ('crypto','Crypto','var(--mint)',40)
ON CONFLICT (key) DO NOTHING;

-- ============ ENGINES CONFIG ============
-- Configuración viva de cada motor (fetcher, nlp, trends, alerts). Editable desde admin UI.
CREATE TABLE engines_config (
  id                 BIGSERIAL PRIMARY KEY,
  engine_name        TEXT NOT NULL UNIQUE,    -- 'fetcher','nlp','trends','alerts','dedup'
  is_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  config             JSONB NOT NULL DEFAULT '{}',  -- interval, batch_size, model, etc.
  priority           INTEGER NOT NULL DEFAULT 0,
  last_run_at        TIMESTAMPTZ,
  last_run_status    TEXT,                    -- 'ok','error','timeout'
  last_run_duration_ms INTEGER,
  last_error         TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by         BIGINT REFERENCES users(id)
);
INSERT INTO engines_config (engine_name, priority, config) VALUES
  ('fetcher',100,'{"poll_interval_ms":30000,"batch_size":50}'),
  ('nlp',    90,'{"model":"nemotron","batch_size":20}'),
  ('trends', 80,'{"window_1h":true,"window_6h":true,"window_24h":true}'),
  ('alerts', 70,'{"eval_interval_ms":15000}'),
  ('dedup',  60,'{"embed_sample_rate":0.10,"similarity_threshold":0.92}')
ON CONFLICT (engine_name) DO NOTHING;

-- ============ FOLDERS + SAVED TRENDS (usuario) ============
CREATE TABLE folders (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);
CREATE INDEX idx_folders_user ON folders (user_id);

CREATE TABLE saved_trends (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trend_id   BIGINT NOT NULL REFERENCES trends(id) ON DELETE CASCADE,
  folder_id  BIGINT REFERENCES folders(id) ON DELETE SET NULL,
  notes      TEXT,
  snoozed_until TIMESTAMPTZ,                  -- feature "Dormir 24h" del Agente 3
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, trend_id)
);
CREATE INDEX idx_saved_user        ON saved_trends (user_id);
CREATE INDEX idx_saved_user_folder ON saved_trends (user_id, folder_id);
CREATE INDEX idx_saved_snoozed     ON saved_trends (snoozed_until)
  WHERE snoozed_until IS NOT NULL;

-- ============ ALERT RULES + ALERTS ============
CREATE TABLE alert_rules (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  trend_id         BIGINT REFERENCES trends(id) ON DELETE CASCADE,  -- NULL = regla global
  metric           alert_metric NOT NULL,
  condition        TEXT NOT NULL CHECK (condition IN ('>','>=','<','<=','=','between')),
  threshold        REAL NOT NULL,
  threshold_max    REAL,                     -- sólo para 'between'
  window_minutes   INTEGER NOT NULL DEFAULT 60 CHECK (window_minutes BETWEEN 1 AND 10080),
  severity         alert_severity NOT NULL DEFAULT 'medium',
  cooldown_minutes INTEGER NOT NULL DEFAULT 30,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       BIGINT REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rules_active       ON alert_rules (is_active) WHERE is_active = TRUE;
CREATE INDEX idx_rules_trend_active ON alert_rules (trend_id) WHERE is_active = TRUE;

CREATE TABLE alerts (
  id               BIGSERIAL PRIMARY KEY,
  rule_id          BIGINT REFERENCES alert_rules(id) ON DELETE CASCADE,
  trend_id         BIGINT REFERENCES trends(id) ON DELETE CASCADE,
  severity         alert_severity NOT NULL,
  message          TEXT,
  triggered_value  REAL NOT NULL,
  threshold_value  REAL NOT NULL,
  status           alert_status NOT NULL DEFAULT 'active',
  triggered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,
  acknowledged_by  BIGINT REFERENCES users(id),
  metadata         JSONB NOT NULL DEFAULT '{}'
);
-- Hot path: "alerts activas ordenadas por tiempo"
CREATE INDEX idx_alerts_active_time ON alerts (triggered_at DESC) WHERE status = 'active';
CREATE INDEX idx_alerts_trend_time  ON alerts (trend_id, triggered_at DESC);
CREATE INDEX idx_alerts_rule_time   ON alerts (rule_id, triggered_at DESC);
CREATE INDEX idx_alerts_severity    ON alerts (severity, triggered_at DESC)
  WHERE status = 'active';
```

### 1.3 Tabla dimensional `trends` (una fila por trend detectado)

```sql
-- ============ TRENDS (dimensión) ============
-- El motor "trends" UPSERT aquí cada ciclo. current_score/velocity_* son denorm.
CREATE TABLE trends (
  id                BIGSERIAL PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,        -- p.ej. 'regulacion-ia-ue'
  label             TEXT NOT NULL,               -- "Regulación de IA en la UE"
  category          TEXT,                        -- 'tech','politica','crypto',...
  keywords          TEXT[] NOT NULL,             -- tokens que dispararon la detección
  aliases           TEXT[] NOT NULL DEFAULT '{}',
  shape             shape_kind,                  -- fase actual (accel/rise/...)
  dir               trend_dir,
  tone              trend_tone,
  -- Métricas vivas (denormalizadas, escritas por el motor cada ciclo):
  current_score     REAL NOT NULL DEFAULT 0,
  velocity_1h       REAL NOT NULL DEFAULT 0,
  velocity_6h       REAL NOT NULL DEFAULT 0,
  mention_count_1h  INTEGER NOT NULL DEFAULT 0,
  mention_count_6h  INTEGER NOT NULL DEFAULT 0,
  mention_count_24h INTEGER NOT NULL DEFAULT 0,
  unique_authors_24h INTEGER NOT NULL DEFAULT 0, -- anti-gaming (Agente 3 feature #2)
  delta_pct         REAL,                        -- vs ayer
  confidence        REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  -- Ciclo de vida:
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  first_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_origin     source_key,                  -- primera fuente que la detectó
  metadata          JSONB NOT NULL DEFAULT '{}', -- evidence[], why, etc.
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HOT INDEX: dashboard top-6. Partial + DESC, sirve directo el ORDER BY.
CREATE INDEX idx_trends_active_score
  ON trends (current_score DESC)
  WHERE is_active = TRUE AND current_score > 0;

CREATE INDEX idx_trends_last_seen  ON trends (last_seen DESC) WHERE is_active = TRUE;
CREATE INDEX idx_trends_category   ON trends (category) WHERE category IS NOT NULL;
CREATE INDEX idx_trends_keywords_gin ON trends USING gin (keywords);  -- matching por keyword
CREATE INDEX idx_trends_label_trgm   ON trends USING gin (label gin_trgm_ops); -- fuzzy search
```

### 1.4 Hypertables (TimescaleDB) — el camino de escritura caliente

```sql
-- ============ MENTIONS (HYPERTABLE — camino caliente de escritura) ============
CREATE TABLE mentions (
  id            BIGSERIAL,                       -- parte de PK compuesta (hypertable)
  trend_id      BIGINT REFERENCES trends(id) ON DELETE SET NULL,  -- NULL si aún no clasificada
  source        source_key NOT NULL,
  source_id     TEXT NOT NULL,                   -- id dentro de la fuente (tweet id, post id...)
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
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- partición
  created_at    TIMESTAMPTZ NOT NULL,            -- timestamp original del post
  -- Dedup lógico: una (source, source_id) sólo debe existir una vez.
  -- No forzamos UNIQUE en hypertable (caro); se garantiza vía Redis dedup key + INSERT ON CONFLICT.
  PRIMARY KEY (id, ingested_at)                  -- PK compuesta requerida por TimescaleDB
);

-- Convertir a hypertable. chunk_time_interval = 6h: ~4 chunks/día, buena granularidad
-- para chunk pruning en queries de "últimas 1h/6h/24h".
SELECT create_hypertable(
  'mentions',
  'ingested_at',
  chunk_time_interval => INTERVAL '6 hours',
  if_not_exists       => TRUE
);

-- ÍNDICES (dentro de hypertable → automáticamente particionados por chunk):
-- (1) Trend + tiempo DESC: alimenta "velocity por trend", "historial de un trend".
CREATE INDEX idx_mentions_trend_time
  ON mentions (trend_id, ingested_at DESC);

-- (2) Source + tiempo: alimenta "distribución por fuente" (con CAGG: batch).
CREATE INDEX idx_mentions_source_time
  ON mentions (source, ingested_at DESC);

-- (3) Dedup ON CONFLICT: par (source, source_id) único. Importante: el índice unique
--     sobre hypertable NO puede incluir la partition key como extra columna opcional;
--     usamos source+source_id como clave de negocio y el app gestiona colisiones via Redis.
CREATE UNIQUE INDEX uq_mentions_source_id
  ON mentions (source, source_id);

-- (4) GIN para full-text search sobre content (búsqueda de menciones en el panel).
CREATE INDEX idx_mentions_content_fts
  ON mentions USING gin (to_tsvector('simple', content));

-- (5) GIN trigram para author_handle fuzzy.
CREATE INDEX idx_mentions_author_trgm
  ON mentions USING gin (author_handle gin_trgm_ops);

-- (6) BRIN sobre created_at: las menciones llegan ~en orden de created_at → BRIN ideal,
--     1000x más chico que B-tree. Sirve para "menciones entre X e Y horas originales".
CREATE INDEX idx_mentions_created_brin
  ON mentions USING brin (created_at) WITH (pages_per_range = 32);

-- (7) GIN sobre metadata para queries ad-hoc (subreddit, instance, tags).
CREATE INDEX idx_mentions_metadata_gin
  ON mentions USING gin (metadata jsonb_path_ops);


-- ============ TREND_SCORES (HYPERTABLE — serie temporal de scores) ============
-- Una fila por (trend, bucket). El motor escribe cada 5 min por trend activo.
CREATE TABLE trend_scores (
  id            BIGSERIAL,
  trend_id      BIGINT NOT NULL REFERENCES trends(id) ON DELETE CASCADE,
  bucket_time   TIMESTAMPTZ NOT NULL,            -- inicio del bucket (5min)
  score         REAL NOT NULL,
  velocity      REAL NOT NULL DEFAULT 0,
  mention_count INTEGER NOT NULL DEFAULT 0,
  unique_authors INTEGER NOT NULL DEFAULT 0,
  delta_pct     REAL,
  sources_count INTEGER NOT NULL DEFAULT 0,      -- cuántas fuentes distintas
  PRIMARY KEY (id, bucket_time)
);

SELECT create_hypertable(
  'trend_scores',
  'bucket_time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists       => TRUE
);

CREATE INDEX idx_ts_trend_bucket
  ON trend_scores (trend_id, bucket_time DESC);

-- Compresión TimescaleDB: scores > 7 días se comprimen (~8-12x).
ALTER TABLE trend_scores SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'trend_id',
  timescaledb.compress_orderby   = 'bucket_time DESC'
);
SELECT add_compression_policy('trend_scores', INTERVAL '7 days');

-- Retención: 1 año de scores históricos. Suficiente para comparativas estacionales.
SELECT add_retention_policy('trend_scores', INTERVAL '365 days');


-- ============ MENTIONS retention ============
SELECT add_retention_policy('mentions', INTERVAL '90 days');
-- Compresión de mentions > 3 días (los chunks fríos se comprimen agresivo).
ALTER TABLE mentions SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'source, trend_id',
  timescaledb.compress_orderby   = 'ingested_at DESC'
);
SELECT add_compression_policy('mentions', INTERVAL '3 days');
```

### 1.5 `mention_embeddings` — separado, muestra del ~10% (pgvector / IVFFLAT)

```sql
-- ============ MENTION_EMBEDDINGS (HYPERTABLE + pgvector) ============
-- Sólo se embedding-iza una muestra (config dedup.embed_sample_rate).
-- Sirve para (a) dedup semántico, (b) detección de trends similares.
CREATE TABLE mention_embeddings (
  id          BIGSERIAL,
  mention_id  BIGINT NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL,
  trend_id    BIGINT,                           -- denormalizado para filtros
  embedding   vector(384) NOT NULL,             -- 384-dim (p.ej. all-MiniLM)
  model       TEXT NOT NULL DEFAULT 'minilm-l6-v2',
  PRIMARY KEY (id, ingested_at)
);

SELECT create_hypertable(
  'mention_embeddings',
  'ingested_at',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists       => TRUE
);

-- IVFFLAT: sólo se construye DESPUÉS de tener >= 10k filas. lists = sqrt(rows/1000).
-- Para ~1M filas (10% de 10M menciones/mes): lists ≈ 1000.
CREATE INDEX idx_embed_ivfflat
  ON mention_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 1000);

-- IMPORTANTE: ivfflat requiere ANALYZE para calibrar listas:
--   ANALYZE mention_embeddings;
-- Re-build index cuando cambie el modelo de embeddings (parámetro lists fijo).

CREATE INDEX idx_embed_mention ON mention_embeddings (mention_id);
CREATE INDEX idx_embed_trend   ON mention_embeddings (trend_id);

SELECT add_retention_policy('mention_embeddings', INTERVAL '30 days');
ALTER TABLE mention_embeddings SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'trend_id',
  timescaledb.compress_orderby   = 'ingested_at DESC'
);
SELECT add_compression_policy('mention_embeddings', INTERVAL '7 days');
```

### 1.6 `engine_logs` (hypertable) + `engine_stats_daily`

```sql
CREATE TABLE engine_logs (
  id          BIGSERIAL,
  engine_name TEXT NOT NULL,
  level       log_level NOT NULL,
  message     TEXT NOT NULL,
  context     JSONB NOT NULL DEFAULT '{}',
  duration_ms INTEGER,
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, logged_at)
);

SELECT create_hypertable(
  'engine_logs',
  'logged_at',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists       => TRUE
);

CREATE INDEX idx_logs_engine_time ON engine_logs (engine_name, logged_at DESC);
CREATE INDEX idx_logs_level_time  ON engine_logs (logged_at DESC)
  WHERE level IN ('error','warn');
CREATE INDEX idx_logs_context_gin ON engine_logs USING gin (context jsonb_path_ops);

SELECT add_retention_policy('engine_logs', INTERVAL '30 days');

-- ============ ENGINE_STATS_DAILY (agregado, alimenta panel de salud) ============
CREATE TABLE engine_stats_daily (
  stat_date        DATE NOT NULL,
  engine_name      TEXT NOT NULL,
  analyzed_count   INTEGER NOT NULL DEFAULT 0,
  error_count      INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms   REAL,
  max_latency_ms   INTEGER,
  p95_latency_ms   INTEGER,
  p99_latency_ms   INTEGER,
  throughput_qps   REAL,
  PRIMARY KEY (stat_date, engine_name)
);
CREATE INDEX idx_stats_date ON engine_stats_daily (stat_date DESC);
```

### 1.7 Continuous Aggregates (TimescaleDB) — precomputar lo que el dashboard lee siempre

```sql
-- CAGG 1: menciones agregadas por hora, trend y fuente.
--   Alimenta: "velocity 1h/6h/24h", "distribución por fuente", "delta vs ayer".
CREATE MATERIALIZED VIEW mentions_1h
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', ingested_at) AS bucket,
  trend_id,
  source,
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

-- CAGG 2: distribución por fuente (sin trend). Cache de panel "fuentes".
CREATE MATERIALIZED VIEW mentions_source_1h
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', ingested_at) AS bucket,
  source,
  COUNT(*)                  AS mention_count,
  COUNT(DISTINCT author_id) AS unique_authors
FROM mentions
GROUP BY bucket, source
WITH NO DATA;
SELECT add_continuous_aggregate_policy(
  'mentions_source_1h',
  start_offset => INTERVAL '3 hours',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '15 minutes'
);

-- CAGG 3: scores por trend cada 15 min (downsample de los buckets de 5 min).
--   Alimenta: sparklines del panel de detalle.
CREATE MATERIALIZED VIEW trend_scores_15m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('15 minutes', bucket_time) AS bucket,
  trend_id,
  AVG(score)        AS avg_score,
  MAX(score)        AS max_score,
  SUM(mention_count) AS mentions,
  AVG(delta_pct)    AS avg_delta
FROM trend_scores
GROUP BY bucket, trend_id
WITH NO DATA;
SELECT add_continuous_aggregate_policy(
  'trend_scores_15m',
  start_offset => INTERVAL '2 hours',
  end_offset   => INTERVAL '15 minutes',
  schedule_interval => INTERVAL '5 minutes'
);

-- Retención de CAGGs más agresiva (son downsamples, ya viven en el original).
SELECT add_retention_policy('mentions_1h', INTERVAL '365 days');
SELECT add_retention_policy('trend_scores_15m', INTERVAL '365 days');
```

---

## 2. Redis — diseño de keys

**Convención de prefijos**: `<dominio>:<entidad>:<id>[:<subclave>]`. Todo en snake_case. TTL siempre explícito. No hay KEYS * en producción (usar SCAN si hace falta, o mejor: mantener un ZSET índice).

| Key pattern | Tipo | TTL | Propósito | Comando típico |
|---|---|---|---|---|
| `trends:active:top6` | STRING (JSON) | 60s | Cache del top-6 por score (lo que lee el radar cada render) | `SET ... EX 60` / `GET` |
| `trends:active:zset` | ZSET | refresh 5m | Leaderboard de trends activos (miembro=trend_id, score=current_score) | `ZADD` / `ZREVRANGE 0 5` |
| `trend:{id}` | HASH | 10m | Metadata cacheada del trend (label, shape, dir, tone, why) | `HSET` / `HGETALL` |
| `trend:{id}:series:{range}` | STRING (JSON array) | 30s | Sparkline cacheado por rango (1H/6H/24H/7D) | `SETEX` |
| `trend:{id}:vel:1h` | STRING (counter) | 3600s | Contador de menciones en ventana móvil 1h. **Sliding window** vía ZSET alternativo (ver abajo). | `INCR` + `EXPIRE` |
| `trend:{id}:vel:6h` | STRING (counter) | 21600s | Igual para 6h | `INCR` + `EXPIRE` |
| `trend:{id}:mentions:24h` | STRING (counter) | 86400s | Contador 24h (alimenta `mention_count_24h` denorm) | `INCR` + `EXPIRE` |
| `trend:{id}:authors:24h` | HYPERLOGLOG | 86400s | Conteo de autores únicos 24h (anti-gaming, Agente 3 #2) | `PFADD` / `PFCOUNT` |
| `trend:{id}:delta` | STRING | 300s | Delta % vs ayer cacheado | `SETEX` |
| `trend:{id}:sources` | HASH | 60s | Distribución de fuentes del trend (campo=source, valor=count) | `HINCRBY` / `HGETALL` |
| `mentions:dedup:{source}:{source_id}` | STRING | 86400s | Bloom-like dedup. SETNX = ya visto. Evita INSERT duplicado. | `SET ... NX EX 86400` |
| `mentions:dedup:sem:{hash}` | STRING | 86400s | Dedup semántico (hash de embedding cercano) | `SET ... NX EX 86400` |
| `rl:ip:{ip}:{endpoint}` | STRING (INCR) | 60s | Rate limit por IP. Token bucket simple. | `INCR` + `EXPIRE` |
| `rl:user:{uid}:{endpoint}` | STRING (INCR) | 60s | Rate limit por usuario (mayor límite) | `INCR` + `EXPIRE` |
| `rl:source:{source}` | STRING (INCR) | 1s | Limitador QPS por fuente (respeta `sources_registry.rate_limit_qps`) | `INCR` + `EXPIRE` |
| `session:{token}` | HASH | 86400s | Sesión de usuario (uid, role, expires_at) | `HSET` + `EXPIRE` |
| `pubsub:alerts` | PUB/SUB channel | — | Notificación de alertas nuevas (WS broadcast) | `PUBLISH alerts '{...}'` |
| `pubsub:trends:update` | PUB/SUB channel | — | Notificación de trends actualizadas (refresh radar) | `PUBLISH trends:update '{...}'` |
| `pubsub:engine:{name}` | PUB/SUB channel | — | Eventos de motor (status, errores) | `PUBLISH engine:fetcher '{...}'` |
| `engine:status:{name}` | HASH | 30s | Heartbeat del motor (last_beat, queue_depth, is_healthy) | `HSET` + `EXPIRE 30` |
| `engine:metrics:{name}` | HASH | 30s | Métricas en vivo (analyzed_count, latency_p95, errors) | `HINCRBY` + `EXPIRE` |
| `lock:trend:compute:{id}` | STRING (NX EX) | 30s | Lock distribuido: sólo un worker recalcula un trend a la vez | `SET ... NX EX 30` |
| `lock:engine:run:{name}` | STRING (NX EX) | 300s | Lock anti-doble-ejecución de motor | `SET ... NX EX 300` |
| `queue:mentions` | STREAM | trim 100k | Backlog de menciones sin clasificar (consumer group `nlp-workers`) | `XADD` / `XREADGROUP` |
| `queue:alerts:eval` | STREAM | trim 10k | Trends a re-evaluar por el motor de alertas | `XADD` / `XREADGROUP` |
| `cache:source:dist:24h` | STRING (JSON) | 300s | Cache de "distribución por fuente 24h" (panel) | `SETEX` |
| `cache:stats:engines` | STRING (JSON) | 30s | Cache del panel de salud de motores | `SETEX` |

### 2.1 Detalle: velocity con sliding window real

El contador simple `trend:{id}:vel:1h` con `INCR+EXPIRE` es una **aproximación de fixed window** (se resetea al minuto). Para ventana deslizante precisa usamos un **ZSET bucketizado por minuto**:

```
Key:   trend:{id}:vel:1h:zset
Type:  ZSET
Member: <minute_epoch>
Score:  <minute_epoch>
Value (via ZADD ... CH): <count_ese_minuto>

Escritura (cada mención):
  ZINCRBY trend:{id}:vel:1h:zset 1 <minute_epoch>
  ZREMRANGEBYSCORE trend:{id}:vel:1h:zset -inf <now-3600>
  EXPIRE trend:{id}:vel:1h:zset 7200   ; safety net

Lectura (velocity instantánea):
  ZSUM trend:{id}:vel:1h:zset  →  total menciones en la ventana
```

Costo: O(log N) por inserción, N ≤ 60 (minutos). Trivial. Esto da **velocity exacto deslizante** sin tocar Postgres, y se reconcilia con `trend_scores` cada 5 min.

### 2.2 Detalle: dedup de menciones

Pipeline de dedup de 2 capas antes de `INSERT mentions`:

1. **Hash exacto**: `mentions:dedup:{source}:{source_id}` con `SET NX EX 86400`. Si ya existe → drop.
2. **Hash semántico** (sólo si sample rate): se computa embedding, se busca similar con IVFFLAT en Postgres (`ORDER BY embedding <=> $1 LIMIT 1`). Si `cosine > 0.92` → se marca como dup en `metadata.duplicate_of`. La key `mentions:dedup:sem:{hash}` cachea el veredicto 24h.

---

## 3. Índices — justificación línea por línea

| Tabla | Índice | Tipo | Por qué ese tipo |
|---|---|---|---|
| `mentions` | `(trend_id, ingested_at DESC)` | B-tree | JOIN+trend-scoped time range. TimescaleDB particiona por chunk → cada chunk tiene su propio índice pequeño (chunk pruning). |
| `mentions` | `(source, ingested_at DESC)` | B-tree | "Distribución por fuente" + filtrado por fuente. |
| `mentions` | `(source, source_id)` UNIQUE | B-tree | Dedup + `INSERT ON CONFLICT DO NOTHING`. |
| `mentions` | `to_tsvector('simple', content)` | GIN | Búsqueda full-text en menciones. GIN porque la query es `@@` (set membership), B-tree no sirve. |
| `mentions` | `author_handle gin_trgm_ops` | GIN | Búsqueda fuzzy de autor (typo). pg_trgm soporta `%` y `<%>`. |
| `mentions` | `created_at` | **BRIN** | Las menciones llegan ~ordenadas por `created_at` → BRIN ideal: ~1000x más chico que B-tree, suficiente para range scan. |
| `mentions` | `metadata jsonb_path_ops` | GIN | Queries ad-hoc sobre JSONB (subreddit, instance). `path_ops` es más chico y más rápido para `@>`. |
| `trends` | `(current_score DESC) WHERE is_active AND score>0` | B-tree **partial** | Hot path top-6. Partial → índice chico (sólo activas), siempre en RAM. |
| `trends` | `keywords` | GIN | Matching por keyword array (`keywords && ARRAY[...]`). |
| `trends` | `label gin_trgm_ops` | GIN | Búsqueda fuzzy de trends por nombre. |
| `trend_scores` | `(trend_id, bucket_time DESC)` | B-tree | Historial de un trend. ORDEN DESC permite `LIMIT 1` (latest) sin sort. |
| `alerts` | `(triggered_at DESC) WHERE status='active'` | B-tree **partial** | Panel de alertas activas. |
| `mention_embeddings` | `embedding vector_cosine_ops` | **IVFFLAT** | Búsqueda de vecinos cercanos (dedup semántico). IVFFLAT > HNSW para >1M filas con updates frecuentes (HNSW rebuild caro). `lists=1000` calibrado para ~1M filas. |
| `engine_logs` | `(logged_at DESC) WHERE level IN ('error','warn')` | B-tree **partial** | Sólo errores/warns indexados → hot path de ops. |
| `saved_trends` | `(snoozed_until) WHERE NOT NULL` | B-tree **partial** | Job que despierta trends dormidas. Partial → no ensucia con filas null. |

**Regla general aplicada**:
- **BRIN** → columnas correlacionadas con el orden físico de inserción (todas las de tiempo en hypertables que no son la partition key).
- **GIN** → búsqueda sobre arrays, texto, JSONB (set membership).
- **B-tree partial** → hot paths con predicado fijo (`WHERE is_active`, `WHERE status='active'`), reduce tamaño → cabe en `shared_buffers`.
- **IVFFLAT** → embeddings. Construir **después** de tener ≥10k filas y hacer `ANYZE` para calibrar listas. Rebuild cuando cambie el modelo de embedding.

---

## 4. Particionamiento y retención

### 4.1 Mentions (la tabla candente)

| Aspecto | Decisión | Razón |
|---|---|---|
| Tipo | Hypertable TimescaleDB (no declarative partitioning nativo) | TimescaleDB maneja chunk creation, compression y retention policy automáticamente. |
| Partition key | `ingested_at` | Tiempo de ingestión (no `created_at`): las queries siempre filtran por "últimas Nh" desde ahora. |
| `chunk_time_interval` | **6 horas** | Con 1M menciones/día ≈ 250k/chunk. Cada chunk < 200MB, cómodo para `shared_buffers` y chunk pruning. Demasiado chico (1h) → metadata overhead; demasiado grande (1 día) → pruning menos efectivo. |
| Compresión | Activada a **3 días** | Chunks fríos se comprimen ~8-10x. `segmentby=source,trend_id` para que los filtros por source/trend sigan siendo eficientes sobre chunks comprimidos. |
| Retención | **90 días** | Drop automático de chunks > 90 días. Las agregaciones (CAGGs) retienen 1 año, así que el histórico analítico sobrevive. |
| Shard | No en day-1 | Ver sección Escalado. |

### 4.2 Trend_scores

| Aspecto | Decisión |
|---|---|
| Partition key | `bucket_time` |
| `chunk_time_interval` | 1 día |
| Compresión | 7 días (`segmentby=trend_id`) |
| Retención | 365 días |
| Volumen | ~500 trends × 288 buckets/día (5-min) = 144k filas/día ≈ **6 MB/día** |

### 4.3 Mention_embeddings

| Aspecto | Decisión |
|---|---|
| Sample rate | 10% (configurable en `engines_config.dedup`) |
| Partition key | `ingested_at` |
| Compresión | 7 días |
| Retención | 30 días (sólo se necesita para dedup reciente) |
| Volumen | 100k/día × 1.5 KB = **150 MB/día** |

### 4.4 Engine_logs

| Aspecto | Decisión |
|---|---|
| Retención | 30 días |
| Compresión | 1 día |

### 4.5 TTLs Redis (resumen de la tabla de keys)

- **< 60s**: caches de dashboard (`trends:active:top6`, `cache:source:dist:24h`, `cache:stats:engines`).
- **30s–10m**: metadata de entidad (`trend:{id}`, `engine:status:{name}`).
- **1h–24h**: contadores de ventana (`vel:1h`, `vel:6h`, `mentions:24h`, dedup keys, sessions).
- **Permanentes con refresh**: ZSET leaderboard, locks (con safety EX).

---

## 5. Consultas SQL optimizadas + EXPLAIN ANALYZE esperado

### Query 1 — Top 6 trends por score en las últimas 6h (camino caliente del radar)

**Versión A** (rápida, lee denorm de `trends`):

```sql
SELECT id, slug, label, current_score, velocity_6h,
       mention_count_24h, delta_pct, shape, dir, tone
FROM trends
WHERE is_active = TRUE
  AND current_score > 0
  AND last_seen >= NOW() - INTERVAL '6 hours'
ORDER BY current_score DESC
LIMIT 6;
```

**EXPLAIN ANALYZE esperado**:
```
Limit  (cost=0.28..1.42 rows=6 width=120) (actual time=0.082..0.124 rows=6 loops=1)
  ->  Index Scan Backward using idx_trends_active_score on trends
        (cost=0.28..42.80 rows=240 width=120) (actual time=0.077..0.118 rows=6 loops=1)
        Index Cond: (current_score > 0)
        Filter: (last_seen >= (now() - '06:00:00'::interval))
Planning Time: 0.180 ms
Execution Time: 0.165 ms            ← sub-milisegundo
```

**Por qué es rápido**: índice partial B-tree sobre `current_score DESC` WHERE `is_active AND score>0` → ya está pre-ordenado, `LIMIT 6` corta en el sexto elemento. La cache Redis `trends:active:top6` (TTL 60s) absorbe el 99% de los reads; esta query sólo corre en miss.

**Versión B** (precisa, desde hypertable `trend_scores`, sin denorm):

```sql
SELECT t.id, t.slug, t.label, latest.score, latest.velocity,
       latest.mention_count, latest.delta_pct, t.shape
FROM trends t
CROSS JOIN LATERAL (
  SELECT score, velocity, mention_count, delta_pct
  FROM trend_scores ts
  WHERE ts.trend_id = t.id
  ORDER BY ts.bucket_time DESC
  LIMIT 1
) latest
WHERE t.is_active = TRUE
ORDER BY latest.score DESC
LIMIT 6;
```

**EXPLAIN esperado**: Index Scan sobre `idx_ts_trend_bucket` por cada trend activa (LATERAL), tiempo total < 5 ms. No usar en hot path; usar para job de reconciliación nocturna.

---

### Query 2 — Velocity de un trend en ventana de 1h (con delta vs ventana anterior)

```sql
SELECT
  curr.cnt           AS mentions_1h,
  prev.cnt           AS mentions_prev_1h,
  curr.cnt - prev.cnt AS velocity_abs,
  CASE WHEN prev.cnt > 0
       THEN ROUND(((curr.cnt - prev.cnt)::NUMERIC / prev.cnt) * 100, 2)
       ELSE NULL END AS velocity_pct,
  curr.unique_authors,
  ROUND(curr.avg_sentiment::NUMERIC, 3) AS avg_sentiment
FROM (
  SELECT COUNT(*)                    AS cnt,
         COUNT(DISTINCT author_id)   AS unique_authors,
         AVG(sentiment)              AS avg_sentiment
  FROM mentions
  WHERE trend_id = $1
    AND ingested_at >= NOW() - INTERVAL '1 hour'
) curr
CROSS JOIN (
  SELECT COUNT(*) AS cnt
  FROM mentions
  WHERE trend_id = $1
    AND ingested_at >= NOW() - INTERVAL '2 hours'
    AND ingested_at <  NOW() - INTERVAL '1 hour'
) prev;
```

**EXPLAIN ANALYZE esperado**:
```
Aggregate  (cost=12.45..12.46 rows=1 width=40) (actual time=1.820..1.822 rows=1 loops=1)
  ->  Index Scan using idx_mentions_trend_time on mentions
        (cost=0.43..11.90 rows=110 width=42) (actual time=0.052..1.430 rows=982 loops=1)
        Index Cond: (trend_id = $1 AND ingested_at >= (now() - '01:00:00'::interval))
        Filter: (trend_id = $1)
Planning Time: 0.310 ms
Execution Time: 1.950 ms
```

**Por qué es rápido**:
- Chunk pruning: TimescaleDB descarta todos los chunks > 2h automáticamente (no aparecen en el plan).
- `idx_mentions_trend_time` es `(trend_id, ingested_at DESC)` → el index scan es directo al rango.
- En producción, **esta query casi nunca se ejecuta**: el dashboard lee `trend:{id}:vel:1h` de Redis (ZSET sliding window), que es O(1). La query SQL es source-of-truth para el job de reconciliación cada 5 min.

---

### Query 3 — Delta porcentual vs ayer (rolling 24h vs 24h previas)

```sql
SELECT
  curr.cnt AS last_24h,
  prev.cnt AS prev_24h,
  CASE WHEN prev.cnt > 0
       THEN ROUND(((curr.cnt - prev.cnt)::NUMERIC / prev.cnt) * 100, 2)
       ELSE NULL END AS delta_pct
FROM (
  SELECT COUNT(*) AS cnt
  FROM mentions
  WHERE trend_id = $1
    AND ingested_at >= NOW() - INTERVAL '24 hours'
) curr
CROSS JOIN (
  SELECT COUNT(*) AS cnt
  FROM mentions
  WHERE trend_id = $1
    AND ingested_at >= NOW() - INTERVAL '48 hours'
    AND ingested_at <  NOW() - INTERVAL '24 hours'
) prev;
```

**EXPLAIN ANALYZE esperado**:
```
Aggregate  (cost=85.40..85.41 rows=1 width=12) (actual time=8.210..8.214 rows=1 loops=1)
  ->  Index Scan using idx_mentions_trend_time on mentions
        (cost=0.43..78.20 rows=2880 width=0) (actual time=0.080..7.100 rows=3120 loops=1)
        Index Cond: ((trend_id = $1) AND (ingested_at >= (now() - '48:00:00'::interval)))
        Filter: (ingested_at < (now() - '24:00:00'::interval))
Planning Time: 0.290 ms
Execution Time: 8.300 ms
```

**Optimización opcional con CAGG**: si 8 ms es demasiado (panico por N trends concurrentes), leer de `mentions_1h`:

```sql
SELECT
  SUM(CASE WHEN bucket >= NOW() - INTERVAL '24 hours' THEN mention_count ELSE 0 END) AS last_24h,
  SUM(CASE WHEN bucket >= NOW() - INTERVAL '48 hours'
            AND bucket <  NOW() - INTERVAL '24 hours' THEN mention_count ELSE 0 END) AS prev_24h
FROM mentions_1h
WHERE trend_id = $1 AND bucket >= NOW() - INTERVAL '48 hours';
```

Esto baja el costo a ~0.5 ms (filas pre-agregadas, 48 filas en lugar de miles). **Esta es la versión que debería usar el job que actualiza `trends.delta_pct`**.

---

### Query 4 — Distribución de menciones por fuente (últimas 24h)

```sql
SELECT source,
       SUM(mention_count) AS mention_count,
       SUM(unique_authors) AS unique_authors,
       ROUND(100.0 * SUM(mention_count) / NULLIF(SUM(SUM(mention_count)) OVER (), 0), 2) AS pct
FROM mentions_source_1h
WHERE bucket >= NOW() - INTERVAL '24 hours'
GROUP BY source
ORDER BY mention_count DESC;
```

**EXPLAIN ANALYZE esperado**:
```
WindowAgg  (cost=22.10..22.30 rows=9 width=44) (actual time=0.640..0.652 rows=9 loops=1)
  ->  Sort  (cost=22.10..22.12 rows=9 width=36) (actual time=0.620..0.623 rows=9 loops=1)
        Sort Key: (sum(mention_count)) DESC
        ->  HashAggregate  (cost=21.80..21.98 rows=9 width=36) (actual time=0.580..0.595 rows=9 loops=1)
              Group Key: source
              Batches: 1  Memory Usage: 40kB
              ->  Custom Scan (ChunkAppend) on mentions_source_1h
                    (cost=0.00..18.50 rows=216 width=12) (actual time=0.040..0.420 rows=216 loops=1)
                    Chunks excluded during startup: 350
Planning Time: 0.420 ms
Execution Time: 0.710 ms            ← < 1 ms gracias al CAGG
```

**Por qué es rápido**: lee del **continuous aggregate `mentions_source_1h`** (24 filas por fuente × 24 horas = 216 filas) en lugar de millones de mentions crudas. Chunk pruning excluye 350 chunks > 24h. El resultado se cachea en `cache:source:dist:24h` (Redis, TTL 300s).

---

### Query 5 — Historial de scores de un trend (sparkline, rango configurable)

```sql
-- RangeKey 7D: bucket de 15 min (desde CAGG trend_scores_15m)
SELECT bucket,
       avg_score,
       max_score,
       mentions,
       avg_delta
FROM trend_scores_15m
WHERE trend_id = $1
  AND bucket >= NOW() - INTERVAL '7 days'
ORDER BY bucket;
```

Para rangos más cortos, bajar al detalle de 5 min:

```sql
-- RangeKey 1H: 5-min buckets desde trend_scores
SELECT bucket_time AS bucket, score AS avg_score, mention_count AS mentions
FROM trend_scores
WHERE trend_id = $1
  AND bucket_time >= NOW() - INTERVAL '1 hour'
ORDER BY bucket_time;
```

**EXPLAIN ANALYZE esperado (7D, 15m CAGG)**:
```
Custom Scan (ChunkAppend) on trend_scores_15m
  (cost=0.00..14.20 rows=672 width=24) (actual time=0.150..1.100 rows=672 loops=1)
  Chunk Filtering: (bucket >= (now() - '7 days'::interval))
  Chunks excluded during startup: 48
  ->  Index Scan on _hyper_12_3_chunk_trend_scores_15m_trend_id_bucket_idx
        (cost=0.29..12.80 rows=672 width=24) (actual time=0.080..0.900 rows=672 loops=1)
        Index Cond: ((trend_id = $1) AND (bucket >= (now() - '7 days'::interval)))
Planning Time: 0.380 ms
Execution Time: 1.250 ms
```

**Por qué es rápido**: índice `(trend_id, bucket_time DESC)` en cada chunk → index scan directo. 7 días × 4 buckets/hora × 24h = 672 filas. El resultado se cachea en `trend:{id}:series:7D` (Redis, TTL 30s).

---

## 6. Migración — estrategia

### 6.1 Principio: **SQL-first para infra, Prisma para app models**

TimescaleDB hypertables, `create_hypertable`, continuous aggregates, compression policies, retention policies, pgvector/IVFFLAT y los partial/GIN/BRIN indexes **no son modelables por Prisma** (su DSL no soporta `WHERE` en indexes, ni hypertables, ni `vector` type, ni CAGGs). Mezclar `prisma migrate` con SQL crudo para lo mismo genera drift.

**División del trabajo**:

| Capa | Herramienta | Razón |
|---|---|---|
| Enums, tablas dimensionales (`users`, `folders`, `saved_trends`, `alert_rules`, `alerts`, `engines_config`, `sources_registry`, `trends`, `engine_stats_daily`) | **Prisma migrate** | Prisma modela bien FKs, constraints, defaults, enums. Da type-safety en el app. |
| Hypertables (`mentions`, `trend_scores`, `mention_embeddings`, `engine_logs`) + CAGGs + políticas | **SQL idempotente** en `prisma/migrations/<ts>_ts_setup/up.sql` ejecutado vía `prisma migrate deploy` con `--skip-generate`. | Prisma no sabe de hypertables. |
| Índices IVFFLAT/BRIN/GIN/partial | **SQL crudo** (mismo migration file). | DSL insuficiente. |
| Seed data (`sources_registry`, `engines_config` defaults) | **`prisma db seed`** (TS script). | Idempotente y versionable. |

### 6.2 Estructura de carpetas

```
prisma/
  schema.prisma                  ← sólo modelos relacionales (users, trends, alerts, ...)
  migrations/
    20250101000000_init/up.sql   ← CREATE EXTENSION + enums + tablas relacionales (generado por Prisma)
    20250101000001_ts_setup/up.sql   ← SQL crudo: hypertables + CAGGs + políticas + índices complejos
    20250101000001_ts_setup/down.sql ← DROP hypertables + CAGGs (cuidadoso)
  seed.ts                        ← sources_registry + engines_config defaults
```

### 6.3 Workflow

```bash
# Dev: cambiar schema.prisma, luego:
npx prisma migrate dev --name <change>     # genera migration relacional

# Hypertable/CAGG/index nuevo → crear migration SQL a mano:
#   prisma/migrations/<ts>_<name>/up.sql
npx prisma migrate deploy                  # aplica todo en orden
npx prisma db seed                         # seed
npx prisma generate                        # regenera cliente TS
```

### 6.4 Reglas de oro

1. **Toda migration SQL crudo debe ser idempotente** (`CREATE ... IF NOT EXISTS`, `SELECT create_hypertable(..., if_not_exists => TRUE)`). Permite re-ejecutar tras fallos parciales.
2. **Nunca** `prisma migrate reset` en producción (borra todo). Usar `prisma migrate resolve` para marcar migrations aplicadas.
3. **`down.sql` obligatorio** para hypertables: `DROP MATERIALIZED VIEW`, `DROP TABLE` — orden inverso a `up.sql`.
4. **pgvector / IVFFLAT**: el `CREATE INDEX ... ivfflat` se ejecuta **sólo después** de un job de backfill de embeddings (≥10k filas). En migration inicial, dejar commentado con `-- FIXME: descomentar tras backfill`.
5. **Continuous aggregates**: tras crearlos, forzar refresh inicial con `CALL refresh_continuous_aggregate('mentions_1h', NULL, NULL);`.
6. **Shadow DB** en CI: Prisma usa una shadow database para validar migrations. Configurar `shadowDatabaseUrl` en `schema.prisma` apuntando a un DB efímero con las mismas extensiones instaladas — si no, `CREATE EXTENSION` falla en shadow.

### 6.5 Backfill desde mock data

El frontend actual usa datos mock (`lib/virahub-data.ts`). Estrategia de backfill:

1. Script `scripts/backfill-trends.ts`: inserta los 6 trends mock como filas reales en `trends` + 7 días de `trend_scores` sintéticos (usando `buildSeries()` existente) → permite validar el dashboard contra datos reales sin esperar al fetcher.
2. Script `scripts/backfill-mentions.ts`: genera menciones sintéticas coherentes con los trends (autor, content, sentiment) para validar queries + indexes antes de tráfico real.

---

## 7. Escalado — cuándo shardar, cuándo read replica, cuándo ClickHouse

### 7.1 Modelo de crecimiento y umbrales

| Métrica | Day-1 (MVP) | Crecimiento | Estrés | Límite PG single-node |
|---|---|---|---|---|
| Menciones/día | 100k | 1M | 10M | ~50M/día (con compresión) |
| Menciones totales (90d retención) | 9M | 90M | 900M | ~5B |
| Trends activos | 100 | 1k | 10k | 100k |
| Reads/s (dashboard) | 50 | 500 | 5k | ~10k en single node con cache |
| Writes/s (mentions) | 1 | 15 | 150 | ~3k inserts/s sostenido |

### 7.2 Matriz de decisiones

| Síntoma | Acción | Trigger cuantitativo |
|---|---|---|
| Dashboard lento en hot path | **Read replica PG** (async streaming replication). Reads del radar → replica; writes → primary. | p95 hot-path query > 50ms sostenido, `pg_stat_statements` muestra que `idx_trends_active_score` se satura. |
| `mentions` hypertable > 1TB tras compresión | **Shardar `mentions`** por `source` (9 shards) o por hash(trend_id). TimescaleDB soporta multi-node (distributed hypertable) desde 2.x. | > 50M menciones/día sostenido, o chunk pruning pierde eficacia (>1000 chunks). |
| Queries analíticas (agregados >24h) > 5s | **Mover analytics a ClickHouse**. Mantener PG para OLTP (writes, single-trend reads, alerts). ClickHouse sincronizado vía `pg_dump`+`kafka` o Debezium CDC. | p95 de queries analíticas > 5s tras optimizar indexes/CAGGs. |
| Embeddings > 10M filas | **Migrar IVFFLAT → HNSW** (mejor recall a escala) o externalizar a vector DB dedicada (Qdrant, pgvector con HNSW, Pinecone). | Recall@10 < 0.85 o `ANALYZE` de IVFFLAT > 30s. |
| `trend_scores` crece más de lo esperado | Subir intervalo del CAGG base (5min → 15min) o agregar CAGG intermedio (1h). | > 1GB/día en trend_scores. |
| Redis hit rate < 95% | Subir TTLs (cuidado con staleness) o agregar más keys cacheadas. Evaluar Redis Cluster. | `INFO stats` → `keyspace_misses / (keyspace_hits + keyspace_misses) > 5%`. |
| Pub/sub > 10k msg/s | Migrar pubsub de Redis a **NATS** o **Kafka** (Redis pub/sub no persiste, sin consumer groups robustos). | Msg perdidos en pico, o `PUBLISH` latency > 10ms. |

### 7.3 Orden recomendado de intervención (no hacer todo a la vez)

1. **Read replica PG** (barato, sin refactor de app). → primer síntoma de read pressure.
2. **Redis Cluster** (3 master + 3 replica). → cuando Redis > 8GB o > 50k ops/s.
3. **Shard `mentions` por source** (TimescaleDB multi-node o Citus). → cuando writes > 3k/s.
4. **ClickHouse para analytics** (CDC vía Debezium → Kafka → ClickHouse). → cuando queries analíticas > 5s pese a CAGGs.
5. **Vector DB dedicada** (Qdrant). → cuando embeddings > 50M filas y pgvector sea cuello de botella.

### 7.4 Lo que **no** hacer en day-1

- No shardar antes de tener un cuello de botella medido (premature sharding mata productividad).
- No introducir ClickHouse sin un caso de uso analítico claro (duplica ops).
- No usar Kafka para todo (Redis Streams es suficiente hasta ~100k msg/s).
- No poner HNSW antes de tener suficientes embeddings (IVFFLAT es mejor para datasets pequeños/medianos con updates).

---

## 8. Estimación de almacenamiento

### 8.1 Por tabla (volumen estimado a 1M menciones/día)

| Tabla | Filas/día | Bytes/fila (aprox) | Raw/día | Con indexes | Con compresión (>3d) | Retención | Total 90d |
|---|---|---|---|---|---|---|---|
| `mentions` | 1M | 580 B | 580 MB | 1.4 GB | 480 MB (chunk frío ~10x) | 90 d | ~30 GB |
| `mention_embeddings` (10%) | 100k | 1.5 KB | 150 MB | 250 MB | 100 MB | 30 d | ~3 GB |
| `trend_scores` (5-min) | 144k | 50 B | 7 MB | 15 MB | 3 MB (>7d) | 365 d | ~1.5 GB |
| `trend_scores_15m` (CAGG) | 48k | 40 B | 2 MB | 5 MB | 1 MB | 365 d | ~400 MB |
| `mentions_1h` (CAGG) | 216k | 50 B | 11 MB | 20 MB | 5 MB | 365 d | ~1.8 GB |
| `engine_logs` | 100k | 200 B | 20 MB | 40 MB | 10 MB | 30 d | ~300 MB |
| `trends` | +50/día | 400 B | 20 KB | 50 KB | — | ∞ | ~50 MB (a 1 año) |
| `alerts` + `alert_rules` | ~100/día | 300 B | 30 KB | 100 KB | — | ∞ | ~50 MB |
| **Total comprimido 90d** | | | | | | | **~37 GB** |

### 8.2 Cuándo particionar más fino / intervenir

| Señal | Acción |
|---|---|
| `mentions` > 100 GB en chunks comprimidos | Reducir `chunk_time_interval` a 3h (más chunks, mejor pruning) o subir compresión a 1 día. |
| `pg_stat_user_tables` muestra `seq_scan` en `mentions` | Falta índice o el chunk pruning no está funcionando (revisar query: ¿filtra por `ingested_at`?). |
| `shared_buffers` hit rate < 95% | Subir `shared_buffers` (target: 25% RAM) o el working set no cabe → read replica. |
| Tiempo de `ANALYZE mentions` > 60s | Subir `default_statistics_target` selectivo o reducir frecuencia de ANALYZE en hypertables grandes. |
| Tamaño de un chunk comprimido > 1 GB | `chunk_time_interval` demasiado grande para el volumen real; reducir. |

### 8.3 Redis (memoria)

| Tipo de key | Count estimado | Mem/k | Total |
|---|---|---|---|
| `trend:{id}:vel:1h:zset` (ZSET 60 miembros) | 1k activos | 2 KB | 2 MB |
| `trend:{id}` (HASH) | 1k | 1 KB | 1 MB |
| `trend:{id}:series:*` (4 ranges) | 4k | 3 KB | 12 MB |
| `mentions:dedup:*` (24h TTL) | 1M | 80 B | **80 MB** ← el más caro |
| `session:*` | 1k | 0.5 KB | 0.5 MB |
| Caches diversos | ~50 | 10 KB | 0.5 MB |
| **Total day-1** | | | **~100 MB** |
| **Total a 10M menciones/día** | | | **~1 GB** (dedup keys escalan lineal) |

**Optimización**: si `mentions:dedup:*` crece demasiado, cambiar a **Redis Bloom filter** (`BF.ADD` / `BF.EXISTS`, módulo RedisBloom) → 10x menos memoria con FPR configurable (0.1%).

---

## 9. Resumen ejecutivo

**Decisiones de arquitectura**:
1. **PostgreSQL 16 + TimescaleDB** como source-of-truth persistente. Tres hypertables (`mentions`, `trend_scores`, `mention_embeddings`, `engine_logs`) particionadas por tiempo, con compresión y retención automática.
2. **Redis 7.4** como camino caliente: caches de dashboard (TTL 30–60s), contadores de velocity con sliding window ZSET (TTL 1–24h), rate limiting, sessions, pub/sub para WS, locks distribuidos, streams para backlog de NLP.
3. **Separación mentions/embeddings**: las menciones crudas se escriben sin vector (580 B/fila); los embeddings (1.5 KB) sólo para muestra del 10% → reduce volumen persistido >70%.
4. **Dimensión + serie temporal**: `trends` es la dimensión actualizable (con métricas denormalizadas que lee el dashboard); `trend_scores` es la serie histórica. Reconciliación nocturna.
5. **Continuous aggregates** (`mentions_1h`, `mentions_source_1h`, `trend_scores_15m`) precomputan lo que el dashboard lee siempre → queries analíticas en < 1 ms.
6. **Índices quirúrgicos**: BRIN para tiempo correlacionado, GIN para arrays/JSONB/FTS, B-tree partial para hot paths, IVFFLAT para embeddings (con `lists=1000` calibrado).
7. **Migración**: Prisma para relacionales, SQL idempotente para hypertables/CAGGs/índices vectoriales. Shadow DB en CI con las extensiones instaladas.

**Estimación day-1**: ~37 GB PostgreSQL comprimido (90 días), ~100 MB Redis. Escala limpiamente a 10M menciones/día antes de necesitar sharding.

**Próximas acciones recomendadas**:
1. Crear `prisma/schema.prisma` con los modelos relacionales (sección 1.2, 1.3) y generar la primera migration.
2. Escribir `20250101_ts_setup/up.sql` con hypertables + CAGGs + políticas + índices (secciones 1.4–1.7).
3. Implementar el cliente Redis con la tabla de keys de la sección 2 como contrato (`lib/redis-keys.ts`).
4. Backfill de los 6 trends mock (`lib/virahub-data.ts`) a `trends` + 7 días de `trend_scores` sintéticos para validar el dashboard contra datos reales.
5. Setup de shadow DB en CI con `timescaledb`, `vector`, `pg_trgm`, `btree_gin` preinstalados.
