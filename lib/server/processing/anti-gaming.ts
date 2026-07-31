/**
 * AGENT 3 · Anti-gaming feature extraction.
 * ---------------------------------------------
 * TrashPenalty is the multiplicative hit applied to the base score
 * to discount spam, bot-driven, and recycled narratives.
 *
 *   penalty = min(1, p_spam + p_bot + p_recycle)
 *
 * Features:
 *   p_spam    : +0.4 if any single author contributed >14 mentions in the
 *               last hour. (Astroturfing / flooding.)
 *   p_bot     : +0.3 if (uniqueAuthors / totalMentions) < 0.4. (Few voices
 *               repeating the same narrative = bot or coordinated campaign.)
 *   p_recycle : +0.3 if (mentions older than 24h / total) > 0.3. (Old news
 *               being re-surfaced — narrative is recycled, not new.)
 *
 * Notes:
 *   - The additive form `p_spam + p_bot + p_recycle` (capped at 1) was
 *     chosen over the multiplicative form `p_spam · p_bot · p_recycle`
 *     used in the EXISTING frontend `lib/scoring.ts` because the task
 *     spec explicitly mandates additive. The two formulations agree in
 *     the limit (a single feature saturating kills the score); they differ
 *     in how they combine partial evidence. Additive is more forgiving to
 *     borderline cases and matches the spec.
 *   - Pure function. Deterministic given `mentions` and a clock.
 *   - `now` is injected (not Date.now) so callers can replay historical
 *     data deterministically. Defaults to Date.now() for live use.
 *
 * Companion: doc_backend_extracted.md §10, task spec.
 */
import type { RawMention } from '@/lib/types'

export interface AntiGamingFeatures {
  /** Spam component ∈ {0, 0.4}. */
  p_spam: number
  /** Bot component ∈ {0, 0.3}. */
  p_bot: number
  /** Recycle component ∈ {0, 0.3}. */
  p_recycle: number
  /** Combined penalty = min(1, p_spam + p_bot + p_recycle). ∈ [0, 1]. */
  combined: number
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** Spam threshold: any single author >14 mentions in last hour → +0.4. */
export const SPAM_AUTHOR_THRESHOLD = 14
export const SPAM_PENALTY = 0.4
/** Bot threshold: uniqueAuthors/total < 0.4 → +0.3. */
export const BOT_RATIO_THRESHOLD = 0.4
export const BOT_PENALTY = 0.3
/** Recycle threshold: old/total > 0.3 → +0.3. */
export const RECYCLE_RATIO_THRESHOLD = 0.3
export const RECYCLE_PENALTY = 0.3

/**
 * Extract the three anti-gaming penalty components and their combined
 * penalty from a slice of mentions belonging to ONE cluster.
 *
 * @param mentions  All deduped mentions assigned to this cluster.
 * @param now       Reference timestamp (epoch ms). Default: Date.now().
 *                  Injected for deterministic backtests.
 */
export function extractAntiGamingFeatures(
  mentions: RawMention[],
  now: number = Date.now(),
): AntiGamingFeatures {
  if (mentions.length === 0) {
    return { p_spam: 0, p_bot: 0, p_recycle: 0, combined: 0 }
  }

  const oneHourAgo = now - HOUR_MS
  const oneDayAgo = now - DAY_MS

  // --- p_spam: per-author count in the last hour ---
  const authorCountsLastHour = new Map<string, number>()
  for (const m of mentions) {
    const t = new Date(m.publishedAt).getTime()
    if (t >= oneHourAgo) {
      authorCountsLastHour.set(m.authorId, (authorCountsLastHour.get(m.authorId) ?? 0) + 1)
    }
  }
  let pSpam = 0
  for (const c of authorCountsLastHour.values()) {
    if (c > SPAM_AUTHOR_THRESHOLD) {
      pSpam = SPAM_PENALTY
      break
    }
  }

  // --- p_bot: unique authors / total mentions ---
  const total = mentions.length
  const uniqueAuthors = new Set(mentions.map((m) => m.authorId)).size
  let pBot = 0
  if (total > 0 && uniqueAuthors / total < BOT_RATIO_THRESHOLD) {
    pBot = BOT_PENALTY
  }

  // --- p_recycle: mentions older than 24h / total ---
  let oldCount = 0
  for (const m of mentions) {
    const t = new Date(m.publishedAt).getTime()
    if (t < oneDayAgo) oldCount++
  }
  let pRecycle = 0
  if (total > 0 && oldCount / total > RECYCLE_RATIO_THRESHOLD) {
    pRecycle = RECYCLE_PENALTY
  }

  const combined = Math.min(1, pSpam + pBot + pRecycle)
  return { p_spam: pSpam, p_bot: pBot, p_recycle: pRecycle, combined }
}
