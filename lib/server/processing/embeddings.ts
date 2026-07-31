/**
 * AGENT 3 · Embedding similarity for semantic dedup.
 * ---------------------------------------------
 *
 * PRODUCTION NOTE — swap-in ONNX model
 * ------------------------------------
 * In production this module is replaced with `multilingual-e5-small`
 * (384-dim) loaded via ONNX Runtime (`onnxruntime-node`). The public
 * interface — `embedText(text): Float32Array` (384-dim, L2-normalized) and
 * `cosineSimilarity(a, b): number` — stays IDENTICAL. Only the body of
 * `embedText` changes: the ONNX tokenizer + inference call replaces the
 * character n-gram feature-hashing fallback implemented here.
 *
 * The sandbox fallback below is a deterministic char n-gram TF-IDF-style
 * vectorizer with signed feature hashing. It is:
 *   - Fast (microseconds per mention, no model load).
 *   - Deterministic (no Math.random).
 *   - Zero-dependency (no ONNX, no tokenizers, no wasm).
 *   - Same dimensionality (384) and contract as the production model,
 *     so cluster.ts can swap implementations without code changes.
 *
 * Threshold for "same cluster via embedding": cosine ≥ 0.78
 * (doc §6.4 — "si cosine(emb, centroid) ≥ 0.78 → asigna a cluster").
 *
 * Companion: doc_backend_extracted.md §6.3, §6.4.
 */
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const EMBED_DIM = 384
export const EMBEDDING_SIMILARITY_THRESHOLD = 0.78

// Character n-gram sizes. 3-grams catch typos and morphological variants;
// 4-grams add specificity for longer tokens.
const NGRAM_SIZES: readonly number[] = [3, 4]

// ---------------------------------------------------------------------------
// FNV-1a 32-bit (shared with minhash.ts; duplicated here to keep the module
// self-contained — production swap to ONNX will remove this entirely).
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
// Normalization (shared with minhash tokenizer — kept inline deliberately).
// ---------------------------------------------------------------------------
function normalize(text: string): string {
  return text.toLowerCase().replace(/https?:\/\/[^\s]+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// embedText — 384-dim L2-normalized char n-gram feature vector.
// ---------------------------------------------------------------------------
/**
 * Compute a 384-dimensional L2-normalized embedding of `text` using
 * character n-gram TF hashing with signed feature hashing (a.k.a. the
 * "hashing trick" with sign hashing to reduce collision bias).
 *
 * The vector is L2-normalized so that cosine similarity is a simple dot
 * product downstream.
 *
 * @param text  Input text. Lowercased; URLs stripped.
 * @returns     Float32Array of length 384, L2-normalized. Empty/whitespace
 *              input returns the zero vector (cosine will return 0 against
 *              any other vector — caller should drop empty mentions
 *              upstream).
 */
export function embedText(text: string): Float32Array {
  const vec = new Float32Array(EMBED_DIM)
  const normalized = normalize(text)
  if (normalized.length === 0) return vec

  // Build n-gram counts via signed feature hashing.
  for (const n of NGRAM_SIZES) {
    if (normalized.length < n) continue
    for (let i = 0; i <= normalized.length - n; i++) {
      const gram = normalized.substring(i, i + n)
      const h = fnv1a32(gram)
      const bucket = h % EMBED_DIM
      // Sign bit of the hash determines +1/−1 contribution. This is the
      // classic Weinberger et al. (2009) trick: it makes the expected
      // inner product of two unrelated vectors 0, so the only signal that
      // survives is genuine n-gram overlap.
      const sign = (h >>> 31) === 0 ? 1 : -1
      vec[bucket] += sign
    }
  }

  // L2 normalize. Guard against the (extremely unlikely) all-zero vector.
  let normSq = 0
  for (let i = 0; i < EMBED_DIM; i++) normSq += vec[i] * vec[i]
  if (normSq > 0) {
    const inv = 1 / Math.sqrt(normSq)
    for (let i = 0; i < EMBED_DIM; i++) vec[i] *= inv
  }
  return vec
}

// ---------------------------------------------------------------------------
// Cosine similarity — robust to non-normalized inputs (returns 0 if either
// vector has zero norm, never NaN).
// ---------------------------------------------------------------------------
/**
 * Cosine similarity between two Float32Array vectors. Handles non-normalized
 * inputs correctly; returns 0 when either vector is the zero vector.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < n; i++) {
    const av = a[i]
    const bv = b[i]
    dot += av * bv
    normA += av * av
    normB += bv * bv
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  if (denom === 0) return 0
  return dot / denom
}

// ---------------------------------------------------------------------------
// Batch helper — compute centroid of N embeddings (L2-normalized mean).
// ---------------------------------------------------------------------------
/**
 * Compute the L2-normalized mean of N embedding vectors. Used by cluster.ts
 * to maintain a running cluster centroid for fast second-pass similarity
 * against new candidate mentions.
 */
export function embeddingCentroid(vectors: readonly Float32Array[]): Float32Array {
  const out = new Float32Array(EMBED_DIM)
  if (vectors.length === 0) return out
  for (const v of vectors) {
    for (let i = 0; i < EMBED_DIM; i++) out[i] += v[i]
  }
  const inv = 1 / vectors.length
  let normSq = 0
  for (let i = 0; i < EMBED_DIM; i++) {
    out[i] *= inv
    normSq += out[i] * out[i]
  }
  if (normSq > 0) {
    const inv2 = 1 / Math.sqrt(normSq)
    for (let i = 0; i < EMBED_DIM; i++) out[i] *= inv2
  }
  return out
}
