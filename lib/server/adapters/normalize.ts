/**
 * Text normalization used to compute deterministic contentHash values.
 *
 * The goal is to make the contentHash invariant under cosmetic differences
 * (URLs, mentions, hashtags, emoji, punctuation, casing, whitespace) so that
 * reposts / cross-posts / quote-tweets of the same idea collapse to the same
 * hash for dedup purposes.
 *
 * This is NOT the same as the full NFKC + entity-extraction pipeline described
 * in doc_backend_extracted.md §5.2 — that runs downstream in the scoring layer.
 * Here we just produce a stable pre-image for xxhash64.
 */

// Control-char sentinels used to protect intra-word dots/hyphens before the
// punctuation sweep. These chars are never produced by user input.
const DOT = '\u0000'
const DASH = '\u0001'

/**
 * Normalize free-form text for contentHash computation.
 * Returns a lowercase, whitespace-collapsed, punctuation-stripped string
 * with URLs / mentions / hashtags / emoji replaced or unwrapped.
 */
export function normalizeText(text: string): string {
  if (!text) return ''

  let s: string = text

  // 1. Strip URLs (http/https/www) — replace with the literal token ' URL ' so
  //    that two posts differing only in the link they cite hash the same.
  s = s.replace(/https?:\/\/\S+/gi, ' URL ')
  s = s.replace(/\bwww\.\S+/gi, ' URL ')

  // 2. Unwrap @mentions — keep the handle without the leading '@'.
  s = s.replace(/(^|\s)@([A-Za-z0-9_]+)/g, '$1$2')

  // 3. Unwrap #hashtags — keep the tag word without the leading '#'.
  s = s.replace(/(^|\s)#([A-Za-z0-9_]+)/g, '$1$2')

  // 4. Strip emoji. Covers the common Unicode ranges:
  //    - Emoticons & pictographs (U+1F300–U+1FAFF)
  //    - Dingbats / misc symbols (U+2600–U+27BF)
  //    - Arrows (U+2190–U+21FF)
  //    - Misc symbols & pictographs alt range (U+2B00–U+2BFF)
  //    - Regional indicator pairs (flag emoji, U+1F1E6–U+1F1FF)
  //    - Variation selectors (U+FE00–U+FE0F)
  //    - Zero-width joiner (U+200D) — keeps emoji components together
  s = s.replace(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}]/gu,
    '',
  )

  // 5. Protect dots/hyphens that sit BETWEEN word chars (e.g. "gpt-4", "node.js")
  //    by replacing them with sentinels. All other punctuation gets stripped.
  s = s.replace(/(\w)\.(\w)/g, `$1${DOT}$2`)
  s = s.replace(/(\w)-(\w)/g, `$1${DASH}$2`)

  // 6. Strip all remaining punctuation + symbols.
  s = s.replace(/[\p{P}\p{S}]/gu, ' ')

  // 7. Restore protected intra-word dots/hyphens.
  s = s.split(DOT).join('.')
  s = s.split(DASH).join('-')

  // 8. Lowercase + collapse whitespace.
  s = s.toLowerCase()
  s = s.replace(/\s+/g, ' ').trim()

  return s
}
