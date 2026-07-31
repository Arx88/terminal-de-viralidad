/**
 * AGENT 3 · MinHash LSH for fast near-duplicate detection.
 * ---------------------------------------------
 * Contract (verbatim from doc_backend_extracted.md §6.2):
 *   - 128 hash functions (permutation family).
 *   - Universal hash family h_i(x) = (a_i·x + b_i) mod p,
 *     with p = 2^31 − 1 (Mersenne prime) and (a_i, b_i) drawn
 *     deterministically from a fixed seed → signatures stable
 *     across runs and across restarts.
 *   - LSH banding: 32 bands × 4 rows  → ~100% recall at Jaccard 0.85.
 *   - Fine verification: exact Jaccard on the MinHash signature,
 *     threshold ≥ 0.85 confirms a duplicate.
 *
 * All math is deterministic. NO Math.random anywhere. Pure functions
 * only — no IO, no side effects, no module-level mutable state (the
 * coefficient cache is a memoization, not stateful mutation).
 *
 * Companion: agent3_motor_procesamiento.md, doc §6.2.
 */
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Mersenne prime p = 2^31 − 1. */
const MERSENNE_P = 0x7fffffff
const MERSENNE_P_BIG = BigInt(MERSENNE_P)
/** Default number of permutations (hash functions). */
export const DEFAULT_NUM_PERM = 128
/** Default LSH banding: 32 bands × 4 rows = 128 rows total. */
export const DEFAULT_BANDS = 32
export const DEFAULT_ROWS = 4
/** Jaccard threshold for "same cluster" after LSH bucket hit. */
export const JACCARD_THRESHOLD = 0.85

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32). Seeded once → identical output every run.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface HashCoeff {
  a: number
  b: number
}

// Memoized per-numPerm coefficient table.
const COEFFICIENT_CACHE = new Map<number, HashCoeff[]>()

/**
 * Generate `numPerm` deterministic (a, b) pairs.
 * a ∈ [1, p−1], b ∈ [0, p−1]. Seed is fixed → identical across runs.
 */
function getCoefficients(numPerm: number): HashCoeff[] {
  const cached = COEFFICIENT_CACHE.get(numPerm)
  if (cached) return cached
  // Fixed seed (0xC0FFEE) → stable across restarts.
  const rng = mulberry32(0xc0ffee)
  const out: HashCoeff[] = new Array(numPerm)
  for (let i = 0; i < numPerm; i++) {
    const a = 1 + Math.floor(rng() * (MERSENNE_P - 1))
    const b = Math.floor(rng() * MERSENNE_P)
    out[i] = { a, b }
  }
  COEFFICIENT_CACHE.set(numPerm, out)
  return out
}

// ---------------------------------------------------------------------------
// Tokenizer: lowercase, strip URLs, split on whitespace.
// ---------------------------------------------------------------------------
/**
 * Tokenize text for MinHash shingling. URLs are collapsed to a single
 * sentinel token so that the same link shared across two mentions does
 * not by itself dominate the Jaccard estimate.
 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase()
  const stripped = lower.replace(/https?:\/\/[^\s]+/g, ' ')
  return stripped.split(/\s+/).filter((t) => t.length > 0)
}

// ---------------------------------------------------------------------------
// FNV-1a 32-bit (used to derive a stable 32-bit integer for each token).
// ---------------------------------------------------------------------------
function fnv1a32(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// ---------------------------------------------------------------------------
// Universal hash h_i(x) = (a_i·x + b_i) mod p   (p = 2^31 − 1)
// ---------------------------------------------------------------------------
function universalHash(x: number, a: number, b: number): number {
  // BigInt is required because a·x can overflow 2^53.
  // The cost is acceptable: 128 hash fns × ~50 tokens/mention ≈ 6.4k BigInt ops.
  const result = (BigInt(a) * BigInt(x >>> 0) + BigInt(b)) % MERSENNE_P_BIG
  return Number(result)
}

// ---------------------------------------------------------------------------
// MinHash signature
// ---------------------------------------------------------------------------
/**
 * Compute the MinHash signature of `text`.
 *
 * @param text     Input text (will be lowercased + URL-stripped).
 * @param numPerm  Number of permutations. Default 128.
 * @returns        Uint32Array of length `numPerm`. Each entry is the min
 *                 of h_i(token) over all tokens.
 *
 * Empty text returns a sentinel signature filled with 0xFFFFFFFF so that
 * two empty mentions don't spuriously match (their Jaccard will be 1.0,
 * but callers should drop empty mentions upstream anyway).
 */
export function minhashSignature(
  text: string,
  numPerm: number = DEFAULT_NUM_PERM,
): Uint32Array {
  const tokens = tokenize(text)
  const sig = new Uint32Array(numPerm)

  if (tokens.length === 0) {
    sig.fill(0xffffffff)
    return sig
  }

  // Pre-hash tokens once (FNV-1a 32-bit).
  const tokenHashes = new Uint32Array(tokens.length)
  for (let i = 0; i < tokens.length; i++) {
    tokenHashes[i] = fnv1a32(tokens[i])
  }

  const coeffs = getCoefficients(numPerm)
  for (let i = 0; i < numPerm; i++) {
    const { a, b } = coeffs[i]
    let min = Infinity
    for (let j = 0; j < tokenHashes.length; j++) {
      const h = universalHash(tokenHashes[j], a, b)
      if (h < min) min = h
    }
    sig[i] = min
  }
  return sig
}

// ---------------------------------------------------------------------------
// LSH banding — split signature into `bands` chunks of `rows` integers,
// hash each chunk to a deterministic string key.
// ---------------------------------------------------------------------------
/**
 * Split a MinHash signature into `bands` chunks of `rows` integers each
 * and hash each chunk into a stable string key. These keys are the LSH
 * bucket identifiers used by the clustering index.
 *
 * Precondition: `sig.length >= bands * rows`. Throws otherwise.
 */
export function lshBands(
  sig: Uint32Array,
  bands: number = DEFAULT_BANDS,
  rows: number = DEFAULT_ROWS,
): string[] {
  if (sig.length < bands * rows) {
    throw new Error(
      `minhash.lshBands: signature length ${sig.length} < bands*rows = ${bands * rows}`,
    )
  }
  const out: string[] = new Array(bands)
  for (let b = 0; b < bands; b++) {
    const start = b * rows
    // FNV-1a over the 4·sizeof(uint32) bytes of this band.
    let h = 0x811c9dc5
    for (let r = 0; r < rows; r++) {
      const v = sig[start + r]
      h ^= v & 0xff
      h = Math.imul(h, 0x01000193)
      h ^= (v >>> 8) & 0xff
      h = Math.imul(h, 0x01000193)
      h ^= (v >>> 16) & 0xff
      h = Math.imul(h, 0x01000193)
      h ^= (v >>> 24) & 0xff
      h = Math.imul(h, 0x01000193)
    }
    // Prefix with band index so different bands never collide on key.
    out[b] = `b${b}:${(h >>> 0).toString(16).padStart(8, '0')}`
  }
  return out
}

// ---------------------------------------------------------------------------
// Exact Jaccard from two MinHash signatures.
// ---------------------------------------------------------------------------
/**
 * Estimate Jaccard similarity between two MinHash signatures as the fraction
 * of positions where the signatures agree. This is an unbiased estimator of
 * the true Jaccard of the underlying token sets; with numPerm=128 the standard
 * error is ≈ 0.04.
 */
export function jaccardFromSignatures(a: Uint32Array, b: Uint32Array): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 0
  let matches = 0
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) matches++
  }
  return matches / n
}

// ---------------------------------------------------------------------------
// Stable signature hash — used as cluster identity across restarts.
// ---------------------------------------------------------------------------
/**
 * Hash a MinHash signature into a stable hex string. Sorting the signature
 * before hashing means the same set of tokens (modulo LSH collisions) always
 * produces the same hash regardless of the order in which permutations were
 * applied. Used as the persistent identity of a cluster.
 */
export function signatureStableHash(sig: Uint32Array): string {
  // Copy + sort. Signature is already a fixed-size array indexed by permutation,
  // but sorting makes the hash robust to permutation-order changes (e.g. if a
  // future agent swaps the hash family).
  const sorted = Array.from(sig).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))
  let h = 0x811c9dc5
  for (const v of sorted) {
    h ^= v & 0xff
    h = Math.imul(h, 0x01000193)
    h ^= (v >>> 8) & 0xff
    h = Math.imul(h, 0x01000193)
    h ^= (v >>> 16) & 0xff
    h = Math.imul(h, 0x01000193)
    h ^= (v >>> 24) & 0xff
    h = Math.imul(h, 0x01000193)
  }
  return `c_${(h >>> 0).toString(16).padStart(8, '0')}`
}
