/**
 * Stable hash — FNV-1a 32-bit (deterministic, uniformly distributed).
 * Returns 8-char hex string.
 * Avoids BigInt for ES6 compatibility.
 */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    // h * 16777619 mod 2^32 — use Math.imul for 32-bit precision
    h = Math.imul(h, 0x01000193)
  }
  // Ensure unsigned
  h = h >>> 0
  return h.toString(16).padStart(8, '0')
}

/** For 64-bit shape, concatenate two 32-bit hashes with different seeds. */
export function fnv1a64(input: string): string {
  return fnv1a('a:' + input) + fnv1a('b:' + input)
}

/** Normalize text for content hashing. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/[^\s)]+/g, ' url ')
    .replace(/@[A-Za-z0-9_]+/g, ' $1 ')
    .replace(/#[A-Za-z0-9_]+/g, ' $1 ')
    .replace(/[\u1F000-\u1FAFF\u2600-\u27BF]/g, ' ') // emoji
    .replace(/[^\p{L}\p{N}\s.\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Cuid-compatible ID generator. */
let cuidCounter = 0
export function cuid(prefix = 'c'): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 10)
  const counter = (cuidCounter++).toString(36).padStart(4, '0')
  return `${prefix}${ts}${rand}${counter}`
}
