/**
 * AGENT 3 · Processing, Dedup & Scoring Engine
 * ---------------------------------------------
 * Transforms a RawMention[] slice (already clustered into one narrative)
 * into a fully-scored Trend ready for the UI.
 *
 * This module is the single source of truth for every formula used by the
 * scoring pipeline. Keep it pure: no IO, no side effects, deterministic
 * given the same inputs. Anything non-deterministic (embeddings, model
 * calls, Redis lookups) is injected via the `Ctx` argument.
 *
 * Companion doc: agent3_motor_procesamiento.md
 */

import type { RangeKey, Shape, SourceKey, Trend } from './virahub-data'

// ---------------------------------------------------------------------------
// 1. INPUT TYPES
// ---------------------------------------------------------------------------

/** A single mention as it enters the pipeline after normalization. */
export type RawMention = {
  /** Globally unique id: `${source}:${externalId}` (e.g. `reddit:t3_abc123`). */
  id: string
  source: SourceKey
  /** Canonical author id within the source (e.g. `u/solar_physics`, `did:plc:...`). */
  authorId: string
  authorFollowers?: number
  authorAgeDays?: number
  /** Normalized text (NFKC, lowercase, URLs collapsed to `URL`). */
  text: string
  /** Verifiable canonical URL (post/article). */
  url: string
  /** BCP-47 language tag (e.g. `es`, `en`, `zh-Hans`). */
  lang: string
  /** Epoch ms when the mention was published upstream. */
  publishedAt: number
  /** Epoch ms when VIRAHUB ingested it. */
  ingestedAt: number
  /** Community bucket: subreddit, bsky instance domain, HN (always `hn`), etc. */
  community?: string
  /** Parent mention id if this is a reply/quote. */
  replyTo?: string
  /** 384-dim embedding from multilingual-e5-small (ONNX). Injected upstream. */
  embedding?: Float32Array
  /** Per-mention sentiment in [-1, +1] (positive − negative). */
  sentiment?: number
  /** Author quality ∈ [0,1]. Cached upstream in Redis. */
  authorQuality?: number
  /** Bot probability ∈ [0,1]. Cached upstream in Redis. */
  botScore?: number
}

/** Resolved time window configuration. See WINDOW_CONFIG below. */
export type TimeWindow = {
  range: RangeKey
  /** Window size in ms (e.g., 3_600_000 for 1H). */
  W: number
  /** Number of buckets to discretize the window into. */
  K: number
  /** EWMA smoothing factor α ∈ (0,1]. */
  alpha: number
  /** Display label used in evidence (e.g. `2h`, `6h`). */
  label: string
}

// ---------------------------------------------------------------------------
// 2. CONTEXT  (injected collaborators — IO & model boundaries)
// ---------------------------------------------------------------------------

export type Ctx = {
  now: number
  /** Trailing 7d baseline (median daily velocity), excluding last 24h. 0 if unknown. */
  baselineVelocity: number
  /** Global 95th percentile velocity across all active narratives (for normalization). */
  globalP95Velocity: number
  /** σ of velocity for THIS narrative over last 7d (noise floor). */
  sigmaV: number
  /** Has this narrative been seen in the last 30d (recycle flag)? */
  recycled30d: boolean
  /** Author quality scores keyed by authorId (fallback when not in mention). */
  authorQualityIndex?: Record<string, number>
  /** Number of total source platforms tracked (denominator for cross-source score). */
  totalSourcesTracked?: number
}

// ---------------------------------------------------------------------------
// 3. INTERNAL METRICS  (intermediate, before flattening to UI Trend)
// ---------------------------------------------------------------------------

export type NarrativeMetrics = {
  narrativeId: string
  title: string
  source: SourceKey
  mentions: number
  uniqueAuthors: number
  uniqueSources: number
  uniqueCommunities: number
  velocity: number           // v_raw, mentions/hour, the displayed value
  velocityEwma: number       // v_ewma, internally used for stability
  delta: number              // signed percent vs baseline
  confidence: number         // 0..100
  heatScore: number          // 0..1
  heat: string               // "Muy caliente" | "Caliente" | "Templado" | "Enfriándose"
  shape: Shape               // accel | rise | flat | decay | wobble
  dir: 'up' | 'down' | 'flat'
  status: string             // "Crecimiento acelerado" | ...
  sentiment: number          // weighted mean, [-1, +1]
  evidence: { label: string; value: string }[]
  firstSeen: number
  lastSeen: number
  mediaSources: number       // distinct RSS/GDELT mentions
  originatorAuthorId?: string
}

// ---------------------------------------------------------------------------
// 4. WINDOW CONFIGURATION
// ---------------------------------------------------------------------------

export const WINDOW_CONFIG: Record<RangeKey, Omit<TimeWindow, 'range'>> = {
  //  W (ms)         K    α     label
  '1H':  { W: 3_600_000,      K: 12, alpha: 0.30, label: '1h'  },
  '6H':  { W: 21_600_000,     K: 12, alpha: 0.25, label: '6h'  },
  '24H': { W: 86_400_000,     K: 24, alpha: 0.20, label: '24h' },
  '7D':  { W: 604_800_000,    K: 28, alpha: 0.15, label: '7d'  },
}

/** Window used to compute the "Posts en Xh" evidence label, by phase. */
const EVIDENCE_WINDOW_BY_PHASE: Record<Shape, { hours: number; label: string }> = {
  accel:  { hours: 2,  label: '2h'  },
  rise:   { hours: 6,  label: '6h'  },
  flat:   { hours: 24, label: '24h' },
  decay:  { hours: 24, label: '24h' },
  wobble: { hours: 6,  label: '6h'  },
}

// ---------------------------------------------------------------------------
// 5. SCORING WEIGHTS & BANDS  (calibrated by backtesting, see doc §7.3)
// ---------------------------------------------------------------------------

const WEIGHTS = {
  velocity:   0.22,
  breadth:    0.20,
  origin:     0.18,
  crosssrc:   0.15,
  baseline:   0.10,
  volume:     0.10,
  temporal:   0.05,
} as const

const HEAT_BANDS = [
  { min: 0.85, label: 'Muy caliente' },
  { min: 0.60, label: 'Caliente' },
  { min: 0.30, label: 'Templado' },
  { min: 0.00, label: 'Enfriándose' },
] as const

// ---------------------------------------------------------------------------
// 6. SMALL HELPERS
// ---------------------------------------------------------------------------

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function shannonEntropyNormalized(probs: number[]): number {
  // Returns H/log2(K) ∈ [0,1]; uniform distribution → 1, single bucket → 0.
  const total = probs.reduce((a, b) => a + b, 0)
  if (total === 0) return 1
  const K = probs.length
  let H = 0
  for (const p of probs) {
    if (p === 0) continue
    const q = p / total
    H -= q * Math.log2(q)
  }
  return H / Math.log2(K)
}

// ---------------------------------------------------------------------------
// 7. VELOCITY  (raw count + EWMA across K buckets)
// ---------------------------------------------------------------------------

type BucketSerie = {
  counts: number[]        // length K
  total: number           // Σ counts
  vRawPerHour: number     // total / (W hours)
  vEwma: number           // exponentially weighted, last bucket emphasis
}

function computeBuckets(
  mentions: RawMention[],
  window: TimeWindow,
  now: number,
): BucketSerie {
  const { W, K } = window
  const delta = W / K
  const windowStart = now - W
  const counts = new Array<number>(K).fill(0)
  let total = 0

  for (const m of mentions) {
    if (m.publishedAt < windowStart || m.publishedAt > now) continue
    const idx = clamp(
      Math.floor((m.publishedAt - windowStart) / delta),
      0,
      K - 1,
    )
    counts[idx]++
    total++
  }

  const hours = W / 3_600_000
  const vRawPerHour = total / hours

  // EWMA across buckets, last bucket is "now". Standard EWMA recurrence:
  //   v_k = α · (c_k / Δ_hours) + (1-α) · v_{k-1}
  const deltaHours = delta / 3_600_000
  let vEwma = 0
  for (let k = 0; k < K; k++) {
    const rateK = counts[k] / deltaHours
    vEwma = window.alpha * rateK + (1 - window.alpha) * vEwma
  }

  return { counts, total, vRawPerHour, vEwma }
}

// ---------------------------------------------------------------------------
// 8. DELTA  (vs 7d baseline, signed)
// ---------------------------------------------------------------------------

function computeDelta(vNow: number, baseline: number, mentions: number): number {
  if (baseline <= 0) {
    // Brand-new narrative: signal only if it has minimum mass.
    return mentions >= 5 ? 999 : 0
  }
  const raw = (100 * (vNow - baseline)) / baseline
  // Cap to ±999 for display sanity.
  return clamp(Math.round(raw), -999, 999)
}

// ---------------------------------------------------------------------------
// 9. CONFIDENCE  (weighted blend × multiplicative anti-gaming penalty)
// ---------------------------------------------------------------------------

type Subscores = {
  volume: number
  velocity: number
  breadth: number
  crosssrc: number
  origin: number
  temporal: number
  baseline: number
}

function computeSubscores(
  m: { mentions: number; uniqueAuthors: number; uniqueSources: number; vEwma: number; counts: number[]; delta: number; originQuality: number },
  ctx: Ctx,
  totalSourcesTracked: number,
): Subscores {
  const sVolume = clamp01(Math.log10(1 + m.mentions) / Math.log10(101)) // saturates at 100 mentions
  const sVelocity = clamp01(m.vEwma / Math.max(ctx.globalP95Velocity, 1e-6))
  const sBreadth = clamp01(m.uniqueAuthors / 14) // need ≥14 authors to max
  const sCrosssrc = clamp01(m.uniqueSources / Math.max(totalSourcesTracked, 3))
  const sOrigin = clamp01(m.originQuality)
  const sTemporal = 1 - shannonEntropyNormalized(m.counts)
  const sBaseline = clamp01(Math.abs(m.delta) / 500)

  return {
    volume: sVolume,
    velocity: sVelocity,
    breadth: sBreadth,
    crosssrc: sCrosssrc,
    origin: sOrigin,
    temporal: sTemporal,
    baseline: sBaseline,
  }
}

type Penalties = {
  spam: number
  bot: number
  recycle: number
  product: number
}

function computePenalties(
  mentions: number,
  uniqueAuthors: number,
  avgBotScore: number,
  recycled: boolean,
): Penalties {
  // Spam: penalize author/mention ratio below 0.4 (high repetition = few voices).
  const authorRatio = mentions > 0 ? uniqueAuthors / mentions : 1
  const pSpam = authorRatio < 0.4 ? authorRatio / 0.4 : 1
  // Bot: linear in average bot_score.
  const pBot = 1 - clamp01(avgBotScore)
  // Recycle: heavy multiplicative hit if the narrative was already seen in 30d.
  const pRecycle = recycled ? 0.3 : 1
  return { spam: pSpam, bot: pBot, recycle: pRecycle, product: pSpam * pBot * pRecycle }
}

function computeConfidence(s: Subscores, p: Penalties): number {
  const base =
    WEIGHTS.velocity   * s.velocity +
    WEIGHTS.breadth    * s.breadth +
    WEIGHTS.origin     * s.origin +
    WEIGHTS.crosssrc   * s.crosssrc +
    WEIGHTS.baseline   * s.baseline +
    WEIGHTS.volume     * s.volume +
    WEIGHTS.temporal   * s.temporal
  return Math.round(100 * clamp01(base) * p.product)
}

// ---------------------------------------------------------------------------
// 10. SHAPE / DIRECTION  (slope + second derivative on v_ewma)
// ---------------------------------------------------------------------------

type Slopes = {
  short: number      // slope over last W/4
  long: number       // slope over previous W/4
  accel: number      // second derivative: short - long
  varianceRatio: number
}

function computeSlopes(vEwmaSerie: number[], window: TimeWindow): Slopes {
  // vEwmaSerie is a chronologically ordered list of v_ewma samples
  // taken at bucket resolution. We expect at least 2K samples for stability;
  // if shorter, we degrade to whatever is available.
  const n = vEwmaSerie.length
  if (n < 4) {
    return { short: 0, long: 0, accel: 0, varianceRatio: 0 }
  }
  const quarter = Math.max(1, Math.floor(n / 4))
  const vNow = vEwmaSerie[n - 1]
  const vShortAgo = vEwmaSerie[n - 1 - quarter]
  const vLongAgo = vEwmaSerie[n - 1 - 2 * quarter]

  const dtHours = (window.W / 4) / 3_600_000
  const slopeShort = (vNow - vShortAgo) / dtHours
  const slopeLong = (vShortAgo - vLongAgo) / dtHours
  const accel = slopeShort - slopeLong

  // variance/mean over last 6 buckets (or fewer) — coefficient of variation²
  const recent = vEwmaSerie.slice(-Math.min(6, n))
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length
  const variance =
    recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length
  const varianceRatio = mean > 0 ? variance / mean : 0

  return { short: slopeShort, long: slopeLong, accel, varianceRatio }
}

function detectShape(
  slopes: Slopes,
  sigmaV: number,
): Shape {
  const σ = Math.max(sigmaV, 1e-6)
  // Priority order matters: wobble first (it's a noise pattern, not a trend).
  if (slopes.varianceRatio > 1.5 && Math.abs(slopes.short) < 0.15 * σ) {
    return 'wobble'
  }
  if (slopes.accel > 0.3 * σ && slopes.short > 0) {
    return 'accel'
  }
  if (slopes.short > 0.2 * σ && slopes.accel >= -0.1 * σ) {
    return 'rise'
  }
  if (slopes.short < -0.3 * σ) {
    return 'decay'
  }
  return 'flat'
}

function detectDirection(slopeShort: number, sigmaV: number): 'up' | 'down' | 'flat' {
  const σ = Math.max(sigmaV, 1e-6)
  if (slopeShort > 0.05 * σ) return 'up'
  if (slopeShort < -0.05 * σ) return 'down'
  return 'flat'
}

// ---------------------------------------------------------------------------
// 11. HEAT  (activity intensity bands)
// ---------------------------------------------------------------------------

function computeHeatScore(
  s: Subscores,
  p: Penalties,
  delta: number,
): number {
  const vPct = s.velocity
  const deltaPct = clamp01(Math.abs(delta) / 500)
  const originQ = s.origin
  // Gentler penalty than confidence: heat reflects activity even when mildly spammy,
  // but bot-controlled narratives should never read "Muy caliente".
  const soft = Math.sqrt(p.spam * p.bot)
  return clamp01(0.5 * vPct + 0.3 * deltaPct + 0.2 * originQ) * soft
}

function heatLabel(score: number): string {
  for (const band of HEAT_BANDS) if (score >= band.min) return band.label
  return HEAT_BANDS[HEAT_BANDS.length - 1].label
}

// ---------------------------------------------------------------------------
// 12. STATUS  (UI chip mapping — matches existing copy strings)
// ---------------------------------------------------------------------------

function deriveStatus(
  shape: Shape,
  heat: number,
  uniqueSources: number,
  mentions: number,
): string {
  if (shape === 'accel' && heat >= 0.6) return 'Crecimiento acelerado'
  if (shape === 'decay') return 'Interés en descenso'
  if (shape === 'wobble' && heat < 0.5) return 'Señal débil'
  if (shape === 'rise' && heat >= 0.45 && uniqueSources === 1 && mentions < 40) {
    return 'Rumor en crecimiento'
  }
  if (shape === 'rise' && heat >= 0.45) return 'Señal emergente'
  if (shape === 'accel' && heat < 0.45) return 'Señal emergente'
  if (shape === 'flat' && heat >= 0.3) return 'Actividad estable'
  if (shape === 'wobble') return 'Actividad inestable'
  if (heat < 0.3) return 'Señal débil'
  return 'Actividad estable'
}

// ---------------------------------------------------------------------------
// 13. SENTIMENT  (weighted mean by author quality × recency decay)
// ---------------------------------------------------------------------------

function computeSentiment(mentions: RawMention[], now: number): number {
  const TAU = 6 * 3_600_000 // 6h
  let num = 0
  let den = 0
  for (const m of mentions) {
    if (typeof m.sentiment !== 'number') continue
    const age = now - m.publishedAt
    const recency = Math.exp(-age / TAU)
    const quality = m.authorQuality ?? 0.5
    const w = quality * recency
    num += w * m.sentiment
    den += w
  }
  if (den === 0) return 0
  return num / den
}

function formatSentiment(s: number): string {
  const v = Math.round(s * 10) / 10
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}`
}

// ---------------------------------------------------------------------------
// 14. EVIDENCE EXTRACTION  ({ label, value }[])
// ---------------------------------------------------------------------------

/**
 * Build the 3 most decision-relevant evidence pairs for a trend.
 * Selection rules are phase-aware so each shape surfaces different signals.
 */
function buildEvidence(
  m: NarrativeMetrics,
  mentionsInEvidenceWindow: number,
  evidenceWindowLabel: string,
  peakAt?: number,
): { label: string; value: string }[] {
  const candidates: { label: string; value: string; priority: number }[] = []

  // Always include absolute post count in the phase's primary window.
  candidates.push({
    label: `Posts en ${evidenceWindowLabel}`,
    value: String(mentionsInEvidenceWindow),
    priority: 100,
  })

  // Communities (only meaningful if ≥2)
  if (m.uniqueCommunities >= 2) {
    candidates.push({
      label: 'Comunidades',
      value: String(m.uniqueCommunities),
      priority: 90,
    })
  }

  // Media sources — the "scoop" signal. Always show, 0 is informative.
  candidates.push({
    label: 'Medios',
    value: String(m.mediaSources),
    priority: m.mediaSources === 0 ? 80 : 60,
  })

  // Originator (if identified & verified)
  if (m.originatorAuthorId) {
    candidates.push({
      label: 'Origen',
      value: m.originatorAuthorId,
      priority: 70,
    })
  }

  // Sentiment (for stable/flat trends)
  if (m.shape === 'flat' || m.shape === 'wobble') {
    candidates.push({
      label: 'Sentimiento',
      value: formatSentiment(m.sentiment),
      priority: 75,
    })
  }

  // Peak time (for decay trends)
  if (m.shape === 'decay' && peakAt) {
    candidates.push({
      label: 'Pico',
      value: formatPeakTime(peakAt, m.lastSeen),
      priority: 85,
    })
  }

  // Active threads (communities with >3 mentions)
  if (m.uniqueCommunities >= 3) {
    candidates.push({
      label: 'Hilos activos',
      value: String(Math.min(m.uniqueCommunities, 12)),
      priority: 50,
    })
  }

  // Delta vs 7d baseline — only if dramatic
  if (Math.abs(m.delta) >= 200) {
    candidates.push({
      label: 'Δ vs 7d',
      value: `${m.delta >= 0 ? '+' : ''}${m.delta}%`,
      priority: 65,
    })
  }

  // Sources count
  candidates.push({
    label: 'Fuentes',
    value: String(m.uniqueSources),
    priority: 40,
  })

  return candidates
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3)
    .map(({ label, value }) => ({ label, value }))
}

function formatPeakTime(peakAt: number, lastSeen: number): string {
  const d = new Date(peakAt)
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  // If peak within 24h, just show time; otherwise show weekday + time
  if (lastSeen - peakAt < 24 * 3_600_000) return `${hh}:${mm}`
  return `${days[d.getDay()]} ${hh}:${mm}`
}

// ---------------------------------------------------------------------------
// 15. MAIN ENTRY POINT
// ---------------------------------------------------------------------------

/**
 * Compute a fully-scored Trend from a slice of mentions belonging to ONE
 * narrative cluster, observed through a single time window.
 *
 * Pure & deterministic. IO (embeddings, sentiment model, Redis lookups) is
 * injected via the mention fields and the `Ctx` argument.
 *
 * @param mentions  All deduped mentions assigned to this narrative.
 * @param window    Time window configuration (1H / 6H / 24H / 7D).
 * @param ctx       External context: baseline, globalP95, σ_v, recycle flag.
 * @param opts      Optional: cluster title, narrative id, v_ewma history for slope.
 */
export function computeScore(
  mentions: RawMention[],
  window: TimeWindow,
  ctx: Ctx,
  opts: {
    narrativeId: string
    title: string
    source: SourceKey
    /** Chronological v_ewma samples (for slope/shape detection). Optional but recommended. */
    vEwmaHistory?: number[]
    /** Timestamp of historical peak velocity (for decay evidence). */
    peakAt?: number
  },
): Trend {
  const now = ctx.now

  // --- Filter mentions to the active window ---
  const inWindow = mentions.filter(
    (m) => m.publishedAt > now - window.W && m.publishedAt <= now,
  )

  // --- Bucket aggregation → velocity ---
  const bucket = computeBuckets(inWindow, window, now)

  // --- Cardinality ---
  const uniqueAuthors = unique(inWindow.map((m) => m.authorId)).length
  const uniqueSources = unique(inWindow.map((m) => m.source)).length
  const uniqueCommunities = unique(
    inWindow.map((m) => m.community ?? m.source),
  ).length
  const mediaSources = unique(
    inWindow.filter((m) => m.source === 'rss' || m.source === 'gdelt').map(
      (m) => m.url,
    ),
  ).length

  // --- Originator: earliest author by publishedAt, with quality ≥ 0.5 ---
  const sortedByTime = [...inWindow].sort((a, b) => a.publishedAt - b.publishedAt)
  const earliest = sortedByTime[0]
  const originatorAuthorId =
    earliest && (earliest.authorQuality ?? 0) >= 0.5
      ? earliest.authorId
      : undefined

  // --- Origin quality: mean over earliest 5 authors ---
  const earliest5 = sortedByTime.slice(0, 5)
  const originQuality =
    earliest5.length > 0
      ? earliest5.reduce((a, m) => a + (m.authorQuality ?? 0.5), 0) /
        earliest5.length
      : 0.5

  // --- Average bot score ---
  const botScores = inWindow
    .map((m) => m.botScore ?? 0)
    .filter((x): x is number => typeof x === 'number')
  const avgBotScore =
    botScores.length > 0
      ? botScores.reduce((a, b) => a + b, 0) / botScores.length
      : 0

  // --- Delta vs baseline ---
  const delta = computeDelta(bucket.vRawPerHour, ctx.baselineVelocity, inWindow.length)

  // --- Subscores & penalties ---
  const totalSourcesTracked = ctx.totalSourcesTracked ?? 9
  const subscores = computeSubscores(
    {
      mentions: inWindow.length,
      uniqueAuthors,
      uniqueSources,
      vEwma: bucket.vEwma,
      counts: bucket.counts,
      delta,
      originQuality,
    },
    ctx,
    totalSourcesTracked,
  )
  const penalties = computePenalties(
    inWindow.length,
    uniqueAuthors,
    avgBotScore,
    ctx.recycled30d,
  )

  // --- Confidence ---
  const confidence = computeConfidence(subscores, penalties)

  // --- Shape / direction ---
  const vEwmaHistory = opts.vEwmaHistory ?? [bucket.vEwma]
  const slopes = computeSlopes(vEwmaHistory, window)
  const shape = detectShape(slopes, ctx.sigmaV)
  const dir = detectDirection(slopes.short, ctx.sigmaV)

  // --- Heat ---
  const heatScore = computeHeatScore(subscores, penalties, delta)
  const heat = heatLabel(heatScore)

  // --- Status ---
  const status = deriveStatus(shape, heatScore, uniqueSources, inWindow.length)

  // --- Sentiment ---
  const sentiment = computeSentiment(inWindow, now)

  // --- Evidence window (phase-dependent) ---
  const evWin = EVIDENCE_WINDOW_BY_PHASE[shape]
  const mentionsInEvidenceWindow = mentions.filter(
    (m) => m.publishedAt > now - evWin.hours * 3_600_000 && m.publishedAt <= now,
  ).length

  // --- Build intermediate metrics ---
  const firstSeen = sortedByTime[0]?.publishedAt ?? now
  const lastSeen = sortedByTime[sortedByTime.length - 1]?.publishedAt ?? now

  const metrics: NarrativeMetrics = {
    narrativeId: opts.narrativeId,
    title: opts.title,
    source: opts.source,
    mentions: inWindow.length,
    uniqueAuthors,
    uniqueSources,
    uniqueCommunities,
    velocity: Math.round(bucket.vRawPerHour),
    velocityEwma: bucket.vEwma,
    delta,
    confidence,
    heatScore,
    heat,
    shape,
    dir,
    status,
    sentiment,
    evidence: [], // filled below (needs metrics itself, so build then assign)
    firstSeen,
    lastSeen,
    mediaSources,
    originatorAuthorId,
  }
  metrics.evidence = buildEvidence(
    metrics,
    mentionsInEvidenceWindow,
    evWin.label,
    opts.peakAt,
  )

  // --- Map to UI Trend ---
  return toTrend(metrics, now)
}

// ---------------------------------------------------------------------------
// 16. UI MAPPING  (NarrativeMetrics → Trend)
// ---------------------------------------------------------------------------

function toTrend(m: NarrativeMetrics, now: number): Trend {
  const agoMin = Math.max(0, Math.round((now - m.lastSeen) / 60_000))
  const hh = String(Math.floor(agoMin / 60)).padStart(2, '0')
  const mm = String(agoMin % 60).padStart(2, '0')

  return {
    id: m.narrativeId,
    title: m.title,
    source: m.source,
    color: SOURCE_COLOR[m.source] ?? 'var(--mint)',
    status: m.status,
    tone: TONE_BY_HEAT[m.heat] ?? 'mint',
    dir: m.dir,
    time: `${hh}:${mm}`,
    heat: m.heat,
    confidence: m.confidence,
    mentions: m.velocity, // UI shows menciones/hora
    delta: m.delta,
    shape: m.shape,
    why: buildWhy(m),
    evidence: m.evidence,
  }
}

const SOURCE_COLOR: Record<SourceKey, string> = {
  reddit:  'var(--hot)',
  bluesky: 'oklch(0.72 0.21 300)',
  hn:      'oklch(0.72 0.16 60)',
  rss:     'oklch(0.70 0.13 220)',
  gdelt:   'oklch(0.65 0.18 265)',
  github:  'oklch(0.70 0.05 270)',
  x:       'oklch(0.72 0.18 0)',
  nvidia:  'oklch(0.78 0.16 140)',
  crypto:  'var(--mint)',
}

const TONE_BY_HEAT: Record<string, Trend['tone']> = {
  'Muy caliente': 'hot',
  'Caliente': 'hot',
  'Templado': 'cool',
  'Enfriándose': 'muted',
}

/** Generate the 1-sentence "why this is here" briefing. */
function buildWhy(m: NarrativeMetrics): string {
  const parts: string[] = []
  if (m.delta >= 100) {
    parts.push(`+${m.delta}% en la última ventana`)
  } else if (m.delta <= -20) {
    parts.push(`${m.delta}% (perdiendo tracción)`)
  }
  parts.push(`${m.mentions} menciones/h, ${m.uniqueAuthors} autores únicos`)
  if (m.uniqueCommunities >= 3) parts.push(`en ${m.uniqueCommunities} comunidades`)
  if (m.mediaSources === 0) parts.push('sin cobertura mediática aún')
  else if (m.mediaSources >= 1) parts.push(`${m.mediaSources} medio(s) recogiendo`)
  return parts.join(', ') + '.'
}
