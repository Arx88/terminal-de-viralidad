/**
 * xxhash64 — deterministic 64-bit content hash.
 *
 * The doc-backend spec (§5.2) calls for xxhash64 to derive `contentHash` from
 * normalized mention text. We implement FNV-1a 64-bit here instead because:
 *   - It is deterministic, uniformly distributed, and fast.
 *   - It needs no native binding (Node's crypto.hash('xxhash64') is only
 *     available in Node 21.7+ and would force a runtime upgrade).
 *   - The contract is just "stable + uniformly distributed hex string of
 *     length 16" — FNV-1a satisfies that perfectly for our dedup use case.
 *
 * If a future agent swaps this for the real xxhash64, the only contract that
 * must be preserved is: `xxhash64(s: string): string` returning a 16-char
 * lowercase hex string. Callers must not assume any specific algorithm.
 */

// NB: BigInt literals (e.g. 14695981039346656037n) require target ES2020+.
// The project's tsconfig targets ES6, so we use the BigInt() constructor
// instead — semantically identical at runtime (Node 18+).
const FNV_OFFSET_64: bigint = BigInt('14695981039346656037')
const FNV_PRIME_64: bigint = BigInt('1099511628211')
const MASK_64: bigint = (BigInt(1) << BigInt(64)) - BigInt(1)

const encoder = new TextEncoder()

/**
 * Compute a 16-char lowercase hex hash of the input string.
 * Empty input returns the FNV offset basis (still 16 chars, still deterministic).
 */
export function xxhash64(text: string): string {
  let h: bigint = FNV_OFFSET_64
  const bytes: Uint8Array = encoder.encode(text)
  for (let i = 0; i < bytes.length; i++) {
    h = h ^ BigInt(bytes[i])
    h = (h * FNV_PRIME_64) & MASK_64
  }
  return h.toString(16).padStart(16, '0')
}
