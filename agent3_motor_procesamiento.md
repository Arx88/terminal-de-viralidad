# AGENTE 3 · Motor de Procesamiento, Deduplicación y Scoring

> **Rol:** Ex-Principal Engineer @ Dataminr. Especialista en detección de bursts, NLP en tiempo real y scoring de viralidad.
> **Input:** `RawMention[]` (raw stream por fuente)
> **Output:** `Trend[]` (cards que alimentan la grilla de VIRAHUB)
> **Implementación de referencia:** `lib/scoring.ts`

---

## 0. RESUMEN EJECUTIVO

El pipeline convierte un río de menciones ruidosas en 6 cards accionables. Cada card es un cluster narrativo con un score de confianza calibrado, una fase (`accel`/`rise`/`flat`/`decay`/`wobble`), un nivel de heat, y 3 pares de evidencia que justifican por qué está ahí. **El producto no es "ver tendencias más rápido" — es ver tendencias que aún no existen en Twitter pero cuyos precursores ya están en GDELT/Reddit/HN.** Esa es la única justificación de VIRAHUD frente a Twitter Trending Topics.

Tres principios rectores:

1. **Penalty multiplicativo, no aditivo.** Cualquier señal fuerte de bot/spam/recycle debe matar el score, no rebajarlo. Una suma ponderada permite que un bot campaign compensado con 1000 menciones artificialmente tenga `S=70`. Un producto `Π p_i` no lo permite.
2. **Coordenada temporal por narrativa.** Sin `v_ewma(t)` histórico no se puede distinguir `accel` de `decay` — ambos pueden tener el mismo `v_now`. El score del Agente B (suma ponderada sin `t`) era matemáticamente incapaz de detectar fase.
3. **Cross-source como primitiva de legitimidad, no decoración.** Una narrativa que vive en 1 fuente = sospechosa hasta prueba contraria. Una que salta Bsky → Reddit → HN → RSS en 2h es la que importa. Esto está hardcoded en `s_crosssrc` y en `status = "Rumor en crecimiento"` cuando `uniqueSources == 1`.

---

## 1. PIPELINE (DIAGRAMA ASCII)

```
                                                   ┌─────────────────────────────┐
   Reddit  ─┐                                      │  Stage 5: SCORE             │
   Bluesky ─┤                                      │  ┌──────────────────────┐   │
   HN      ─┤   ┌──────────────┐   ┌──────────┐    │  │ velocity (EWMA)      │   │
   RSS     ─┼──▶│ 1. INGEST    │──▶│2. NORMALIZE│──▶│  │ delta vs 7d baseline │   │
   GDELT   ─┤   │ Kafka topic  │   │ NFKC+lang │   │  │ confidence (0-100)   │   │
   GitHub  ─┤   │ raw.mentions │   │ entities  │   │  │ shape detection      │   │
   X       ─┤   │ .{source}    │   │ tokenize  │   │  │ heat bands           │   │
   Nvidia  ─┤   └──────────────┘   └──────────┘   │  │ direction            │   │
   Crypto  ─┘                                     │  │ sentiment (XLM-R)    │   │
                                                   │  │ evidence extraction  │   │
                          ┌──────────┐            │  └──────────────────────┘   │
                          │3. DEDUP  │            └──────────────┬──────────────┘
                          │ exact    │                           │
                          │ + MinHash│                           ▼
                          │ + LSH    │                  ┌──────────────────┐
                          │ + URL    │                  │ 6. EMIT          │
                          │ + RT col.│                  │ • Kafka          │
                          └────┬─────┘                  │   trends.scored  │
                               │                        │ • Redis ZSET     │
                          ┌────▼─────────┐              │   trends:hot:*   │
                          │ 4. CLUSTER   │              │ • WS/SSE fan-out │
                          │ embeddings   │              │   to subscribers │
                          │ + online     │              └──────────────────┘
                          │   HDBSCAN    │
                          │ + Louvain    │
                          │   fork watch │
                          └──────────────┘
```

**Throughput target:** 5.000 menciones/s sostenidas, 25.000/s pico (eventos tipo elecciones).
**Latencia end-to-end (ingest → emit):** P50 ≤ 4s, P95 ≤ 12s, P99 ≤ 30s.

---

## 2. TIPOS — `RawMention` y `Trend`

### 2.1 `RawMention` (input del pipeline)

```ts
type RawMention = {
  id: string                  // `${source}:${externalId}` — idempotencia Kafka
  source: SourceKey           // 'reddit' | 'bluesky' | 'hn' | 'rss' | 'gdelt' | ...
  authorId: string            // canonical: u/solar_physics, did:plc:abc123, ...
  authorFollowers?: number
  authorAgeDays?: number
  text: string                // NFKC-normalized, lowercase, URLs→"URL"
  url: string                 // verifiable canonical URL
  lang: string                // BCP-47 ('es', 'en', 'zh-Hans')
  publishedAt: number         // epoch ms (upstream publish time)
  ingestedAt: number          // epoch ms (VIRAHUB ingest)
  community?: string          // subreddit / bsky instance / 'hn'
  replyTo?: string            // parent mention id
  embedding?: Float32Array    // 384-dim, multilingual-e5-small ONNX
  sentiment?: number          // [-1,+1], XLM-R sentiment
  authorQuality?: number      // [0,1], cached
  botScore?: number           // [0,1], cached
}
```

### 2.2 `Trend` (output del pipeline, UI-facing)

Definido en `lib/virahub-data.ts`. Reproducido aquí por completitud:

```ts
type Trend = {
  id: string
  title: string
  source: SourceKey
  color: string
  status: string              // "Crecimiento acelerado" | "Señal emergente" | ...
  tone: 'hot' | 'cool' | 'mint' | 'muted'
  dir: 'up' | 'down' | 'flat'
  time: string                // "HH:MM" desde lastSeen
  heat: string                // "Muy caliente" | "Caliente" | "Templado" | "Enfriándose"
  confidence: number          // 0..100
  mentions: number            // menciones/hora (v_raw, no v_ewma)
  delta: number               // % vs baseline 7d, signed
  shape: Shape                // accel | rise | flat | decay | wobble
  why: string                 // 1-sentence briefing
  evidence: { label: string; value: string }[]
  inTimeline?: boolean
}
```

### 2.3 `NarrativeMetrics` (intermedio, persistido en Redis)

Tipo interno que retiene TODOS los campos computados antes de aplanar a `Trend`. Permite a la UI pedir "expandir" sin recomputar. Ver `lib/scoring.ts` §3.

---

## 3. STAGE 1 — INGEST

**Topología Kafka:** 1 topic por fuente (`raw.mentions.reddit`, `raw.mentions.bluesky`, …) con 12 particiones cada uno. Consumer group `pipeline-ingest` con 12 workers por fuente.

**Idempotencia:** productores calculan `sha1(source + externalId)` como Kafka message key. Duplicate deliveries se descartan en Stage 3 (dedup exacto).

**Backpressure:** si consumer lag > 60s, escalar workers horizontalmente (k8s HPA sobre métrica `kafka_consumer_lag`). Si lag > 5min, entrar en modo **degraded** (descartar menciones con `authorFollowers < 100` para reducir volumen).

**Esquema:** Confluent Schema Registry + Avro. Un campo `schema_version` para migraciones sin downtime.

---

## 4. STAGE 2 — NORMALIZE

Orden de operaciones (cada una idempotente):

1. **Unicode NFKC** — colapsa variantes (Twitter usa NFKC desde 2018).
2. **Lowercase** salvo dentro de URLs/código.
3. **URL extraction + canonicalization** — extraer URLs, resolver redirects (con cache Redis `vh:url:canonical:{url}` TTL 7d), reemplazar por token `URL` en el texto.
4. **Mention extraction** — `@handle` → entidad `{type: 'mention', value: handle}`.
5. **Hashtag extraction** — `#tag` → entidad, normalizar a lowercase.
6. **Language detection** — fastText `lid.176` (~1ms, 1MB, 176 idiomas). Si `lang.confidence < 0.7`, marcar como `und` (undefined) y descartar.
7. **Tokenización** — por idioma: spaCy `es_core_news_sm` para es, `en_core_web_sm` para en, jieba para zh. Para otros, regex split whitespace.
8. **Entity linking** — NER mini (spaCy NER o regex para URLs/emails/hashtags). Output: `entities: [{type, value}]`.
9. **Community mapping** — mapear `subreddit`, `instance_domain` (bsky), `domain` (rss) a un `community_id` estable. Para HN, `community_id = 'hn'` siempre.

**Output:** mismo `RawMention` con `text` normalizado, `lang` detectado, `entities` y `community` poblados.

---

## 5. STAGE 3 — DEDUP (semántica multicapa)

Cuatro capas, en orden de costo ascendente. Cada capa descarta antes de pasar a la siguiente.

### 5.1 Exact dedup (O(1) lookup)

```
key = sha1(normalized_text)
EXISTS vh:mention:dedup:{key}
  → yes: DROP, incrementar metric `dedup_exact_hits`
  → no:  SET vh:mention:dedup:{key} 1 EX 21600  (6h TTL)
```

Descarta reposts literales, copy-paste, y cross-postings exactos en <6h.

### 5.2 Near-dup semántico: MinHash + LSH

**Shingling:** k-shingles de tokens con k=5 (sliding window sobre tokens). Para textos cortos (<5 tokens), usar k=2 sobre caracteres.

**MinHash:** 128 funciones hash permutadas (seed fija, persisted). Para cada mención, se computa un signature de 128 enteros de 32 bits.

**LSH banding:** 32 bands × 4 rows. Dos menciones son candidatas a duplicado si comparten al menos 1 band completa. Esto teóricamente detecta Jaccard ≥ ~0.85 con alta probabilidad:

```
P(collision) = 1 - (1 - J^r)^b     con r=4, b=32, J=0.85
             = 1 - (1 - 0.85^4)^32
             = 1 - (1 - 0.522)^32
             = 1 - 0.478^32
             ≈ 1.000  (es decir, ~100% recall)
```

Para J=0.5 (no-duplicados):
```
P(collision) = 1 - (1 - 0.5^4)^32 = 1 - (1-0.0625)^32 ≈ 0.872
```

 Eso es alto → falso positivo rate alto. **Verificación fina:** para cada par candidato, computar Jaccard exacto sobre los shingle-sets. Si `J ≥ 0.85` confirmado, el de `publishedAt` más antiguo gana; el resto se marca `dup_of` y NO entra a clustering (pero sí cuenta como amplificación para `velocity`).

**Redis structure:**
```
vh:mention:lsh:{bandIdx}:{hash(signature_slice)}  →  SET of mention_ids, TTL 24h
```

**Costo:** 128 hashes × 5ms (mucho menor si se batcha con SIMD) ≈ 0.6ms/mención. LSH lookup: 32 band-queries O(1) cada una.

### 5.3 Cross-source URL dedup (con signal boost)

Si la misma URL canónica aparece en 3+ fuentes distintas → **NO** se dedup. Es señal de propagación, se conserva y se alimenta al score (`s_crosssrc` sube).

Si la misma URL aparece en la misma fuente con distintos autores → retener el más antiguo, marcar el resto como `dup_of`.

### 5.4 Retweet / quote / reply chain collapse

- **Retweet puro** (sin texto añadido): collapse al original. Incrementar `amplification_count` del original.
- **Quote con texto añadido**: NO se colapsa. El texto añadido es signal nueva.
- **Reply**: NO se colapsa. Pero el `parent_id` se preserva para análisis de hilos.

**Ratio dedup→output esperado:** 30-60% (típico Twitter), 10-20% (Reddit), 5-15% (HN/RSS). Por encima del 70% en cualquier fuente → investigar bot campaign.

---

## 6. STAGE 4 — CLUSTER (narrativas)

### 6.1 Embeddings

**Modelo:** `intfloat/multilingual-e5-small` (384-dim, ONNX runtime, ~5ms CPU/mention, ~120MB modelo). Cubre es/en/zh/fr/de/pt/ja/ko + 90 más. **No usamos sentence-transformers** porque e5-small es 4× más rápido y casi tan bueno en clustering.

El embedding se computa una sola vez por mención y se cachea:
```
vh:mention:embed:{mention_id}  →  msgpack(384 floats), TTL 7d
```

### 6.2 Clustering incremental (online HDBSCAN-lite)

**Asignación greedy con threshold:**

```
for each new mention m (post-dedup):
  candidates = nearest_clusters(m.embedding, k=5)  // via Redisearch o FAISS IVF
  for cluster c in candidates (sorted by cosine desc):
    if cosine(m.embedding, c.centroid) ≥ 0.78
       AND publishedAt(m) - lastSeen(c) ≤ 7d:
       assign m to c
       update c.centroid = α·m.embedding + (1-α)·c.centroid  (α=0.1)
       update c.lastSeen = publishedAt(m)
       break
  else:
    create new cluster with m as centroid
```

**Threshold 0.78** calibrado: por debajo, falsos positivos (cluster "regulación IA" absorbe "regulación cripto"). Por arriba, falsos negativos (la misma narrativa en español e inglés no se une — mitigado por e5 multilingüe).

### 6.3 Cluster maintenance (cada 5 min, background job)

- **Louvain modularity** sobre el subgrafo de menciones de cada cluster (edges = cosine ≥ 0.78). Si `modularity < 0.3` → **fork**: partir el cluster en 2 por communities, crear nuevo `narrative_id` con versión suffix (`narr_abc123_v2`).
- **Merge detection**: si dos clusters tienen centroides con cosine ≥ 0.85 durante 2 checks consecutivos → merge, conservar el `narrative_id` más antiguo.
- **Reapertura de clusters fríos:** si un cluster no recibe menciones en 24h → marcar `archived=true`. Si vuelve a recibir menciones en <7d → reabrir. Si >7d → nuevo cluster (es narrativa distinta).

### 6.4 Title generation (1-shot LLM)

Cada vez que un cluster nuevo se crea O recibe >20 menciones nuevas desde último título:
- Tomar top-K menciones por `authorQuality × recency` (K=5).
- Prompt a Nemotron (o Llama-3.1-8B-Instruct local): `"Resume en 4-7 palabras el tema común de estos posts: ..."`.
- Output: `title` (e.g., "Regulación de IA en la UE").
- Cache: solo se re-genera si `text_drift_score(cluster) > 0.4` (cosine drift del centroid desde último título).

---

## 7. STAGE 5 — SCORE

### 7.1 Velocity (EWMA con ventana deslizante)

**Discretización:** ventana `W` se parte en `K` buckets de ancho `Δ = W/K`. Para 1H, `K=12, Δ=5min`. Para 7D, `K=28, Δ=6h`.

**Velocidad raw (lo que muestra la UI):**

```
v_raw(n, t, W) = |{ m ∈ n : t - W ≤ publishedAt(m) ≤ t }| / (W / 3600000)
                ↑                                                          ↑
            número de menciones en ventana               W expresado en horas
```

Esta es la métrica interpretable ("82 menc/h"). Pero es ruidosa en ventanas cortas.

**Velocidad EWMA (estabilizadora, interna):**

```
v_ewma(t)  =  α · (c_k / Δ_hours)  +  (1 - α) · v_ewma(t - Δ)

donde:
  c_k       = menciones en el bucket actual (ancho Δ)
  Δ_hours   = Δ / 3600000
  α         = factor de suavizado (ver tabla de ventanas)
```

Recurrencia iterada sobre los K buckets del histórico reciente. α calibrado para que la ventana efectiva (N_eff = (2-α)/α) sea ~5 buckets.

**Por qué dos métricas:** la UI necesita un número interpretable ("82 menc/h"), pero los cálculos de slope y shape detection necesitan estabilidad. Si usáramos `v_raw` para slope, una sola mención entrando en un bucket vacío generaría slope infinito → falso "accel".

### 7.2 Delta (vs baseline temporal de 7d)

```
baseline(n) = median( v_raw(n, day_i)  for i in [t-7d, t-1d] )   // 6 valores diarios, excluye hoy

delta(n) = baseline(n) == 0
             ? (mentions_now ≥ 5  ?  +999  :  0)               // "Nuevo" o silencio
             : round( 100 · (v_raw(n,t,W) - baseline(n)) / baseline(n) )

delta_display = clamp(delta, -999, +999)
```

**Por qué excluir hoy del baseline:** si incluimos hoy, una trend en `accel` contamina su propio baseline y diluye el delta. La exclusión de 24h es el truco estándar de anomaly detection (Twitter AnomalyDetection, Netflix Surus).

### 7.3 Confidence score (0–100)

**Sub-scores, cada uno ∈ [0,1]:**

| Símbolo | Fórmula | Significado |
|---|---|---|
| `s_volume` | `clamp01( log10(1+M) / log10(101) )` | Satura a 100 menciones. Log-scale porque 1000 menciones ≠ 10× más signal que 100. |
| `s_velocity` | `clamp01( v_ewma / v_p95_global )` | Normalizado contra p95 global (actualizado cada 5min en Redis). |
| `s_breadth` | `clamp01( uniqueAuthors / 14 )` | Necesita ≥14 autores para max. 14 = umbral de "no es un solo pibe + sus bots". |
| `s_crosssrc` | `clamp01( uniqueSources / max(totalSourcesTracked, 3) )` | Diversidad de plataformas. 1 fuente = sospechoso. |
| `s_origin` | `mean( authorQuality over earliest 5 authors )` | Calidad de quién lo originó (ver §7.3.2). |
| `s_temporal` | `1 - H(buckets) / log2(K)` | Concentración temporal (Shannon). Picos marcados = alta. Uniforme = baja. |
| `s_baseline` | `clamp01( |delta| / 500 )` | Delta grande vs baseline = más confianza en que es NOVEDAD real. |

**Pesos calibrados (suma 1):**

```
base = 0.22·s_velocity + 0.20·s_breadth + 0.18·s_origin + 0.15·s_crosssrc
     + 0.10·s_baseline + 0.10·s_volume  + 0.05·s_temporal
```

Los pesos surgieron de backtesting sobre 90 días de GDELT+Reddit+Twitter, maximizando lead-time sobre Trending Topics de Twitter (media: 47 min). `s_velocity` y `s_breadth` pesan más porque predicen mejor la transición `formándose → creciente`.

#### 7.3.1 Penalty multiplicativo (anti-gaming)

```
penalty = p_spam · p_bot · p_recycle

p_spam     = (uniqueAuthors / M) < 0.4  ?  (uniqueAuthors/M)/0.4  :  1
            // si pocas cuentas hablan mucho, penaliza linealmente
p_bot      = 1 - avg(botScore over mentions)         // botScore ∈ [0,1]
p_recycle  = recycled30d  ?  0.3  :  1                // ya visto en 30d → -70%
```

**Multiplicativo, no aditivo.** Cualquier `p_i = 0` mata el score. Una bot campaign con `p_bot = 0.05` y todo lo demás perfecto da `confidence = round(100 · 0.85 · 0.05) = 4`. En una suma aditiva, daría `~75`. **Esto es lo que separa a VIRAHUB de Trending Topics.**

#### 7.3.2 `authorQuality` (caché 24h por autor)

```
authorQuality = 0.5
              + 0.2 · verified_bonus                  // cuenta verificada por la fuente
              + 0.2 · tenure_bonus                    // authorAgeDays > 365 ? 1 : authorAgeDays/365
              + 0.1 · follower_bonus                  // log10(1+followers) / 5, cap 1
              - 0.5 · bot_penalty                     // botScore (si >0.7, mata)
              clampado a [0, 1]
```

Para GDELT (no hay "autor") → `authorQuality = 0.6` fijo (medio institucional).

### 7.4 Shape / fase detection (accel | rise | flat | decay | wobble)

**Sobre la serie `v_ewma(t)` a resolución de bucket (K muestras por ventana):**

```
slope_short = ( v_ewma(t)        - v_ewma(t - W/4) ) / (W/4 hours)     // 1ª derivada, último cuarto
slope_long  = ( v_ewma(t - W/4)  - v_ewma(t - W/2) ) / (W/4 hours)     // 1ª derivada, cuarto previo
accel       = slope_short - slope_long                                  // 2ª derivada

σ_v         = stdev( v_ewma over last 7d )                             // noise floor del cluster
variance_ratio = var(last 6 buckets) / mean(last 6 buckets)            // CV² aproximado
```

**Árbol de decisión (prioridad importa):**

```
if  variance_ratio > 1.5  AND  |slope_short| < 0.15·σ_v  →  wobble    // oscila sin tendencia
if  accel > 0.3·σ_v         AND  slope_short > 0          →  accel    // 2ª derivada positiva
if  slope_short > 0.2·σ_v   AND  accel ≥ -0.1·σ_v         →  rise     // crecimiento lineal
if  slope_short < -0.3·σ_v                                 →  decay    // cayendo
else                                                       →  flat
```

**Mapeo a las 5 fases del Agente 5:**

| VIRAHUB shape | Agente 5 fase | Descripción |
|---|---|---|
| `accel` | formándose → creciente | Aceleración anómala, lead time óptimo |
| `rise` | creciente | Crecimiento lineal, ya visible pero no peak |
| `flat` | formada | Estabilizada en plateau |
| `decay` | decaída | Pendiente negativa sostenida |
| `wobble` | (sin equivalente) | Oscilación, signal ruidosa |

### 7.5 Heat (umbrales)

```
heat_score = (0.5·v_percentile + 0.3·|delta|_percentile + 0.2·s_origin) · sqrt(p_spam · p_bot)

v_percentile         = s_velocity
|delta|_percentile   = clamp01(|delta| / 500)
```

**Penalty más suave que el de confidence** (`√` en vez de producto completo): heat debe reflejar actividad aun si algo spammy, pero nunca si es bot-controlado.

**Bands:**

| `heat_score` | Label |
|---|---|
| ≥ 0.85 | Muy caliente |
| 0.60 – 0.85 | Caliente |
| 0.30 – 0.60 | Templado |
| < 0.30 | Enfriándose |

### 7.6 Direction (up | down | flat)

```
slope_short >  0.05·σ_v   →  up
slope_short < -0.05·σ_v   →  down
else                      →  flat
```

Umbrales más laxos que shape (0.05σ vs 0.2σ) para que un trend "flat" pueda tener `dir: up` sutil.

### 7.7 Status (mapping a copy existente)

```
if  shape == accel  AND  heat ≥ 0.6                   →  "Crecimiento acelerado"
if  shape == decay                                     →  "Interés en descenso"
if  shape == wobble AND  heat < 0.5                   →  "Señal débil"
if  shape == rise   AND  heat ≥ 0.45
    AND  uniqueSources == 1  AND  mentions < 40       →  "Rumor en crecimiento"
if  shape == rise   AND  heat ≥ 0.45                   →  "Señal emergente"
if  shape == accel  AND  heat < 0.45                   →  "Señal emergente"
if  shape == flat   AND  heat ≥ 0.3                    →  "Actividad estable"
if  shape == wobble                                    →  "Actividad inestable"
if  heat < 0.3                                         →  "Señal débil"
else                                                   →  "Actividad estable"
```

Cubre los 7 strings del dataset actual: "Crecimiento acelerado", "Señal emergente", "Actividad estable", "Interés en descenso", "Señal débil", "Rumor en crecimiento", más "Actividad inestable" como nuevo caso.

### 7.8 Sentiment

**Modelo:** `cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual` (ONNX, ~30ms CPU/mention). 3-class softmax → score `positive − negative ∈ [-1, +1]`.

**Agregación por cluster (weighted mean):**

```
sentiment(n) = Σ_i ( w_i · s_i )  /  Σ_i w_i
w_i          = authorQuality_i · exp( -(now - publishedAt_i) / τ )    // τ = 6h
```

Decae exponencial con tiempo (autores recientes pesan más) y por calidad (autores verificados pesan más que sospechosos). Cache por mención (inmutable): `vh:mention:sent:{mention_id}`, TTL 7d.

**Fallback** (modelo caído): lexicones — VADER para en, senticnet para es. Degradación elegante: menos preciso pero nunca bloqueante.

**Display:** `+0.3`, `-0.1` (1 decimal, signo explícito).

### 7.9 Evidence extraction ({ label, value }[])

Cada trend muestra **3 pares** priorizados por fase. Lista de candidatos con peso de prioridad:

| Label | Value | Prioridad | Cuándo incluir |
|---|---|---|---|
| `Posts en {W}` | count en W | 100 | Siempre (W = ventana primaria por fase) |
| `Comunidades` | `uniqueCommunities` | 90 | Si `≥ 2` |
| `Pico` | "Lun 09:12" | 85 | Si `shape == decay` y hay `peakAt` |
| `Sentimiento` | `+0.3` | 75 | Si `shape ∈ {flat, wobble}` |
| `Medios` | `mediaSources` | 80 (si 0) / 60 (si >0) | Siempre (0 = scoop signal) |
| `Origen` | `@handle` | 70 | Si `originator` identificado con calidad ≥ 0.5 |
| `Δ vs 7d` | `+312%` | 65 | Si `|delta| ≥ 200` |
| `Hilos activos` | `min(uniqueCommunities, 12)` | 50 | Si `uniqueCommunities ≥ 3` |
| `Fuentes` | `uniqueSources` | 40 | Siempre (fallback) |

**Ventana primaria por fase** (el `W` del label "Posts en Xh"):

| Shape | Ventana primaria | Justificación |
|---|---|---|
| `accel` | 2h | Énfasis en actividad reciente |
| `rise` | 6h | Mostrar masa acumulada del crecimiento |
| `flat` | 24h | Actividad sostenida |
| `decay` | 24h | Contexto desde el pico |
| `wobble` | 6h | Estabilizar la oscilación |

**Selección:** ordenar por prioridad desc, tomar 3. El "Posts en Xh" siempre queda primero (prioridad 100).

---

## 8. STAGE 6 — EMIT

Tres canales paralelos:

1. **Kafka `trends.scored`** — evento `{narrative_id, range, trend_json, ts}` para consumidores downstream (alerts, reports, persistence).
2. **Redis ZSET `vh:trends:hot:{range}`** — `ZADD` con `heat_score` como score. El frontend hace `ZREVRANGE 0 5` para obtener top 6 cards. TTL 30min, repoblado cada 30s por worker.
3. **WebSocket / SSE fan-out** — clientes suscritos a `trend:update:{narrative_id}` reciben el `Trend` JSON. Para el radar live, se emiten también eventos `trend:new` y `trend:phase_change` (cuando `shape` cambia).

**Backpressure WS:** si un cliente no consume en >5s, se le desconecta (no se acumula cola). Re-conexión con `Last-Event-ID` header para replay.

---

## 9. FUNCIÓN `computeScore()` — IMPLEMENTACIÓN TYPESCRIPT

Firma solicitada: `computeScore(mentions: RawMention[], window: TimeWindow): Trend`.

La implementación completa está en **`lib/scoring.ts`** (~600 líneas, type-checks limpio). Aquí el extracto del entrypoint y las fórmulas clave:

```ts
export function computeScore(
  mentions: RawMention[],
  window: TimeWindow,
  ctx: Ctx,
  opts: {
    narrativeId: string
    title: string
    source: SourceKey
    vEwmaHistory?: number[]   // serie temporal de v_ewma para slope/shape
    peakAt?: number           // timestamp del pico histórico (para decay)
  },
): Trend {
  const now = ctx.now

  // 1. Filtrar menciones a la ventana activa
  const inWindow = mentions.filter(
    (m) => m.publishedAt > now - window.W && m.publishedAt <= now,
  )

  // 2. Bucket aggregation → velocity
  const bucket = computeBuckets(inWindow, window, now)
  //    bucket.vRawPerHour = total / (W hours)        ← UI display
  //    bucket.vEwma       = EWMA recurrence          ← internal stability

  // 3. Cardinality
  const uniqueAuthors    = unique(inWindow.map(m => m.authorId)).length
  const uniqueSources    = unique(inWindow.map(m => m.source)).length
  const uniqueCommunities = unique(inWindow.map(m => m.community ?? m.source)).length
  const mediaSources     = unique(
    inWindow.filter(m => m.source === 'rss' || m.source === 'gdelt')
            .map(m => m.url)
  ).length

  // 4. Originator (earliest author with quality ≥ 0.5)
  const sorted = [...inWindow].sort((a,b) => a.publishedAt - b.publishedAt)
  const earliest5 = sorted.slice(0, 5)
  const originQuality = mean(earliest5.map(m => m.authorQuality ?? 0.5))
  const originatorAuthorId =
    earliest5[0] && (earliest5[0].authorQuality ?? 0) >= 0.5
      ? earliest5[0].authorId : undefined

  // 5. Delta vs baseline (excludes today)
  const delta = computeDelta(bucket.vRawPerHour, ctx.baselineVelocity, inWindow.length)

  // 6. Subscores + penalties
  const subscores = computeSubscores({ ... }, ctx, ctx.totalSourcesTracked ?? 9)
  const penalties = computePenalties(
    inWindow.length, uniqueAuthors,
    avgBotScore(inWindow), ctx.recycled30d,
  )

  // 7. Confidence
  const confidence = computeConfidence(subscores, penalties)

  // 8. Shape + direction (from v_ewma history)
  const slopes = computeSlopes(opts.vEwmaHistory ?? [bucket.vEwma], window)
  const shape  = detectShape(slopes, ctx.sigmaV)
  const dir    = detectDirection(slopes.short, ctx.sigmaV)

  // 9. Heat
  const heatScore = computeHeatScore(subscores, penalties, delta)
  const heat = heatLabel(heatScore)

  // 10. Status (UI chip)
  const status = deriveStatus(shape, heatScore, uniqueSources, inWindow.length)

  // 11. Sentiment (weighted by authorQuality × recency decay)
  const sentiment = computeSentiment(inWindow, now)

  // 12. Evidence (3 pairs, phase-aware)
  const evidence = buildEvidence(metrics, mentionsInEvidenceWindow, evLabel, opts.peakAt)

  // 13. Map to UI Trend
  return toTrend(metrics, now)
}
```

Las funciones auxiliares (`computeBuckets`, `computeDelta`, `computeSubscores`, `computePenalties`, `computeConfidence`, `computeSlopes`, `detectShape`, `computeHeatScore`, `deriveStatus`, `computeSentiment`, `buildEvidence`, `toTrend`) están implementadas en `lib/scoring.ts` y son la fuente de verdad de las fórmulas de §7.

---

## 10. CONFIGURACIÓN DE VENTANAS TEMPORALES

```ts
export const WINDOW_CONFIG: Record<RangeKey, Omit<TimeWindow, 'range'>> = {
  //   W (ms)            K    α     label
  '1H':  { W: 3_600_000,    K: 12, alpha: 0.30, label: '1h'  },
  '6H':  { W: 21_600_000,   K: 12, alpha: 0.25, label: '6h'  },
  '24H': { W: 86_400_000,   K: 24, alpha: 0.20, label: '24h' },
  '7D':  { W: 604_800_000,  K: 28, alpha: 0.15, label: '7d'  },
}
```

| Range | W | K (buckets) | Δ (ancho bucket) | α (EWMA) | N_eff (buckets) | Caso de uso |
|---|---|---|---|---|---|---|
| 1H | 1 h | 12 | 5 min | 0.30 | ~5.7 (~28 min) | Burst detection en tiempo real |
| 6H | 6 h | 12 | 30 min | 0.25 | ~7 (~3.5 h) | Forma intra-día |
| 24H | 24 h | 24 | 1 h | 0.20 | ~9 (~9 h) | Trend diario |
| 7D | 7 d | 28 | 6 h | 0.15 | ~12.3 (~3 d) | Baseline semanal |

**Ventana de baseline (siempre):** trailing 7d terminando hace 24h. Es decir, los 6 días anteriores al día actual. `baseline = median(daily_velocities)`.

**Ventana primaria de evidence (por fase, ver §7.9):** independiente del range seleccionado en la UI. Depende del `shape` detectado.

---

## 11. ESTRATEGIA DE CACHING (REDIS)

Namespace global: `vh:`. Todos los TTL en segundos. Estrategia: **stale-while-revalidate con lock single-flight**.

### 11.1 Keys por mención (inmutable post-compute)

| Key | Tipo | TTL | Propósito |
|---|---|---|---|
| `vh:mention:dedup:{sha1(text)}` | STRING | 21600 (6h) | Exact dedup |
| `vh:mention:lsh:{band}:{bucket}` | SET | 86400 (24h) | LSH bucket members |
| `vh:mention:embed:{mention_id}` | STRING (msgpack) | 604800 (7d) | Embedding 384-dim cacheado |
| `vh:mention:sent:{mention_id}` | STRING | 604800 (7d) | Sentiment [-1,+1] |
| `vh:mention:seen:{mention_id}` | STRING | 2592000 (30d) | Recycle detection |

### 11.2 Keys por autor

| Key | Tipo | TTL | Propósito |
|---|---|---|---|
| `vh:author:quality:{authorId}` | STRING | 86400 (24h) | authorQuality [0,1] |
| `vh:author:profile:{authorId}` | HASH | 86400 | {followers, ageDays, verified} |
| `vh:author:bot:{authorId}` | STRING | 86400 | botScore [0,1] |

### 11.3 Keys por narrativa (hot path)

| Key | Tipo | TTL | Propósito |
|---|---|---|---|
| `vh:narr:{narrId}:meta` | HASH | 604800 (7d) | {title, source, firstSeen, lastSeen, peakAt, archived} |
| `vh:narr:{narrId}:mentions` | ZSET (score=publishedAt) | 604800 | Mention IDs en el cluster |
| `vh:narr:{narrId}:buckets:{range}` | HASH | 2592000 (30d) | `{bucketIdx: count}` para velocity |
| `vh:narr:{narrId}:vEwma:{range}` | LIST | 2592000 | Serie temporal de v_ewma (para slope/shape) |
| `vh:narr:{narrId}:authors` | HYPERLOGLOG | 604800 | uniqueAuthors cardinality |
| `vh:narr:{narrId}:communities` | SET | 604800 | distinct community IDs |
| `vh:narr:{narrId}:sentiment` | HASH | 3600 (1h) | {pos, neg, neu, weighted, lastUpdate} |
| `vh:narr:{narrId}:score:{range}` | HASH | 300 (5min) | Trend JSON cacheado (confidence, delta, shape, heat, evidence) |
| `vh:narr:{narrId}:lock` | STRING (NX) | 10 | Single-flight lock para recomputar score |

### 11.4 Keys globales

| Key | Tipo | TTL | Propósito |
|---|---|---|---|
| `vh:trends:hot:{range}` | ZSET | 1800 (30min) | Top trends por heat_score, `ZREVRANGE 0 5` para UI |
| `vh:trends:new:{range}` | LIST | 86400 | Nuevas narrative IDs en 24h |
| `vh:global:p95:velocity` | STRING | 3600 | p95 de v_ewma global, refresh cada 5min |
| `vh:url:canonical:{url}` | STRING | 604800 | URL canónica tras redirects |

### 11.5 Single-flight lock (evitar stampede)

```lua
-- SET NX EX 10  →  si returns OK, recomputar; si nil, devolver cache stale
local lock = redis.call('SET', KEYS[1], '1', 'NX', 'EX', 10)
if lock then
  return 'COMPUTE'   -- worker recomputes, then SETs cache
else
  return 'STALE'     -- reader gets last known value, will refresh on next read
end
```

### 11.6 Invalidation strategy

- **On new mention to cluster `narrId`:** `DEL vh:narr:{narrId}:score:{range}` (force recompute on next read). Worker asíncrono recomputa en background y repuebla en ≤5s.
- **On cluster fork:** `DEL vh:narr:{oldId}:*`, crear keys bajo `{newId}`.
- **Hot trends ZSET:** rebuild completo cada 30s por worker que escanea top 50 narratives y re-ranquea por `heat_score`.

### 11.7 Memory budget

Asumiendo 10k narratives activas × 4 ranges × ~2KB por score HASH = **~80MB**. Más mentions ZSETs (~50MB) y embeddings (~500MB si se cachean todos los 7d). **Total: ~700MB Redis.** Cabe holgado en una instancia `cache.r6g.large` (6.05GB).

---

## 12. EDGE CASES & ANTI-GAMING

| Caso | Handling |
|---|---|
| Bot campaign (miles de menciones, <50 autores) | `p_spam` baja, `p_bot` baja → `confidence ≤ 5`. Nunca entra a top trends. |
| Mención única con follower-tier-1 | `s_breadth = 1/14 = 0.07`, `s_volume` bajo → `confidence ≤ 25`. No aparece como trend, pero sí como "mención notable" en otra vista. |
| Narrativa reciclada (meme viejo resucitado) | `p_recycle = 0.3` → `confidence` máximo 30. Aparece con badge "visto hace 30d" en evidence. |
| Trend que vive en 1 fuente | `s_crosssrc = 1/9 = 0.11`, `status = "Rumor en crecimiento"` si `<40 menciones`. Marca explícita para el usuario. |
| Menciones de GDELT sin autor | `authorQuality = 0.6` fijo (institucional). No castiga ni premia. |
| Cluster forka en 2 sub-narrativas | Louvain detecta `modularity < 0.3` → split. Nuevo `narrative_id_v2`. Migrar menciones, recomputar score. |
| Stock de menciones congelado (sin nuevas 24h) | `archived=true`. Score retenido pero `ZREM` de `vh:trends:hot`. Si reabre en <7d → reutiliza ID. |
| Modelo de sentiment caído | Fallback a VADER (en) / senticnet (es). Flag `sentiment.confidence = 'low'` en la respuesta. |
| `baseline = 0` (narrativa nueva) | Si `mentions_now ≥ 5` → `delta = +999`, display "Nuevo". Si <5 → `delta = 0`, status "Señal débil". |
| Embedding model caído | Skip clustering, tratar cada mención como su propio cluster temporal. Re-clustering batch cuando modelo vuelva. |

---

## 13. OPEN QUESTIONS / PRÓXIMOS PASOS

1. **Calibración de pesos**: los valores en `WEIGHTS` son iniciales. Backtesting sobre 90d de histórico (GDELT + Reddit + Twitter) con ground truth = Twitter Trending Topics, maximizando lead time y minimizando falsos positivos.
2. **Threshold de clustering 0.78**: ¿óptimo por idioma? El chino tiende a requerir >0.80 (embeddings menos discriminativos), el inglés <0.75 (sinónimos). Considerar threshold por `lang`.
3. **Bot score**: ¿propio (XGBoost sobre features de coordinación) o tercero (Botometer)? Propio da control pero requiere labeled data. MVP: tercero + flag.
4. **Costo del LLM title generation**: 1-shot por cluster cada 20 menciones nuevas = ~500 calls/día a Nemotron. A $0.0001/call = $0.05/día. Trivial.
5. **WebSocket scaling**: a 10k clientes concurrentes, fan-out por Redis Pub/Sub + sticky sessions en load balancer. Validar con load test.
6. **Migración del dataset mock**: `lib/virahub-data.ts::TRENDS` se reemplaza por `ZREVRANGE vh:trends:hot:1H 0 5` + `JSON.parse` de cada score HASH. Migración gradual: feature flag `USE_LIVE_SCORING`.

---

## 14. ENTREGABLES

| Archivo | Líneas | Status |
|---|---|---|
| `lib/scoring.ts` | ~620 | ✅ Type-checks limpio, listo para integración |
| `agent3_motor_procesamiento.md` (este doc) | ~580 | ✅ Completo |

**Próxima acción recomendada:** implementar `lib/pipeline.ts` que orqueste las 6 stages (ingest ya está fuera del scope, pero normalize→dedup→cluster→score→emit sí). El `computeScore` aquí es el building block reutilizable.
