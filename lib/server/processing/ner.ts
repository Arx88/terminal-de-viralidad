/**
 * AGENT 3 · Named Entity Recognition + Rigid Entity Veto.
 * ---------------------------------------------
 * Lightweight regex + dictionary NER. Catches the entity types that
 * matter for the dedup veto:
 *   url, cve, hashtag, cashtag, person (email/@mention),
 *   brand, product, model, org, location.
 *
 * The Rigid Entity Veto is the *safety net* that prevents two mentions
 * with high text similarity from being clustered together when they
 * actually refer to different concrete entities. Example:
 *   a) "Nvidia RTX4090 sales surge"   → model entity "RTX4090"
 *   b) "Nvidia RTX5090 leaks surface" → model entity "RTX5090"
 * Both texts share ~80% of tokens → MinHash + embedding will say "match".
 * The veto catches the model mismatch and refuses the merge.
 *
 * Pure functions only. Deterministic. No IO, no Math.random.
 *
 * Companion: doc_backend_extracted.md §6.5 (NER), task spec for veto rules.
 */
import type { Entity, EntityType } from '@/lib/types'

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------
const URL_RE = /(https?:\/\/[^\s]+)/g
const CVE_RE = /CVE-\d{4}-\d{4,7}/gi
const HASHTAG_RE = /#(\w+)/g
const CASHTAG_RE = /\$([A-Z]{1,5})\b/g
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const MENTION_RE = /@(\w+)/g
const MODEL_RE = /\b[A-Z]{1,3}\d{2,4}\b/g

// ---------------------------------------------------------------------------
// Dictionaries (kept small and high-precision by design).
// ---------------------------------------------------------------------------
const BRAND_DICTIONARY: readonly string[] = [
  'Apple', 'Google', 'Microsoft', 'OpenAI', 'Anthropic', 'Nvidia', 'AMD', 'Intel',
  'Tesla', 'SpaceX', 'Bitcoin', 'Ethereum', 'Meta', 'Amazon', 'Netflix', 'Samsung',
  'Sony', 'IBM', 'Oracle', 'Cisco', 'Qualcomm', 'Broadcom', 'TSMC', 'ASML',
  'Huawei', 'Tencent', 'Alibaba', 'Baidu', 'DeepMind', 'Mistral',
]

const ORG_DICTIONARY: readonly string[] = [
  'FBI', 'EU', 'NASA', 'FDA', 'MIT', 'CIA', 'NSA', 'UN', 'NATO', 'WHO',
  'CDC', 'SEC', 'CFTC', 'DOJ', 'DOD', 'ESA', 'IEEE', 'ACM', 'WTO', 'OECD',
]

const LOCATION_DICTIONARY: readonly string[] = [
  'USA', 'UK', 'China', 'Russia', 'India', 'Japan', 'Germany', 'France',
  'Spain', 'Mexico', 'Brazil', 'Canada', 'Australia', 'Korea', 'Taiwan', 'Israel',
  'Ukraine', 'California', 'Texas', 'New York', 'London', 'Paris', 'Berlin',
  'Tokyo', 'Beijing', 'Shanghai', 'Madrid', 'Barcelona', 'San Francisco', 'Seattle',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// extractEntities — main entry point.
// ---------------------------------------------------------------------------
/**
 * Extract entities from `text` using regex patterns + small dictionaries.
 * Returns a de-duplicated list of `{ type, value }` pairs.
 *
 *  - URLs          → type 'url'
 *  - CVEs          → type 'cve'   (normalized to uppercase)
 *  - Hashtags      → type 'hashtag' (without the #)
 *  - Cashtags      → type 'cashtag' (without the $)
 *  - Emails        → type 'person'
 *  - @mentions     → type 'person' (without the @)
 *  - Brands        → type 'brand'  (case-sensitive, word-boundary match)
 *  - Models        → type 'model'  (e.g. "RTX4090", "A100", "H100")
 *  - Orgs          → type 'org'
 *  - Locations     → type 'location'
 *
 * Duplicate (type, value) pairs are collapsed to the first occurrence.
 */
export function extractEntities(text: string): Entity[] {
  const entities: Entity[] = []
  const seen = new Set<string>()
  function add(type: EntityType, value: string): void {
    const key = `${type}:${value}`
    if (!seen.has(key)) {
      seen.add(key)
      entities.push({ type, value })
    }
  }

  // URLs
  for (const m of text.matchAll(URL_RE)) {
    const v = m[1]
    if (v) add('url', v)
  }
  // CVEs (normalize to uppercase)
  for (const m of text.matchAll(CVE_RE)) {
    if (m[0]) add('cve', m[0].toUpperCase())
  }
  // Hashtags (capture group = the word after #)
  for (const m of text.matchAll(HASHTAG_RE)) {
    const v = m[1]
    if (v) add('hashtag', v)
  }
  // Cashtags
  for (const m of text.matchAll(CASHTAG_RE)) {
    const v = m[1]
    if (v) add('cashtag', v)
  }
  // Emails (classified as 'person' per spec — they uniquely identify a user)
  for (const m of text.matchAll(EMAIL_RE)) {
    if (m[0]) add('person', m[0])
  }
  // @mentions (handle without the @)
  for (const m of text.matchAll(MENTION_RE)) {
    const v = m[1]
    if (v) add('person', v)
  }
  // Models — e.g. "RTX4090", "A100", "H100", "GPT4", "V100"
  for (const m of text.matchAll(MODEL_RE)) {
    if (m[0]) add('model', m[0])
  }
  // Brands — case-sensitive, whole-word match.
  for (const brand of BRAND_DICTIONARY) {
    const re = new RegExp(`\\b${escapeRegex(brand)}\\b`)
    if (re.test(text)) add('brand', brand)
  }
  // Orgs
  for (const org of ORG_DICTIONARY) {
    const re = new RegExp(`\\b${escapeRegex(org)}\\b`)
    if (re.test(text)) add('org', org)
  }
  // Locations
  for (const loc of LOCATION_DICTIONARY) {
    const re = new RegExp(`\\b${escapeRegex(loc)}\\b`)
    if (re.test(text)) add('location', loc)
  }
  return entities
}

// ---------------------------------------------------------------------------
// Rigid Entity Veto
// ---------------------------------------------------------------------------
/**
 * Entity types subject to the rigid veto. Two mentions with conflicting
 * entities of these types CANNOT be clustered together, even if their
 * text is highly similar.
 *
 *  - brand   : "Apple" vs "Google" → veto
 *  - product : (dictionary-driven, brand-vs-product distinction is moot here)
 *  - model   : "RTX4090" vs "RTX5090" → veto
 *  - cve     : "CVE-2024-1234" vs "CVE-2024-5678" → veto
 *  - cashtag : "$NVDA" vs "$AMD" → veto
 */
export const RIGID_ENTITY_TYPES: readonly EntityType[] = [
  'brand',
  'product',
  'model',
  'cve',
  'cashtag',
]

/**
 * Decide whether two mentions should be VETOED from clustering based on
 * their rigid entities.
 *
 * Returns TRUE (veto) iff, for some rigid type T, BOTH `a` and `b` contain
 * at least one entity of type T, AND the SETS of values of type T differ.
 *
 * Examples (per spec):
 *   a = [model:RTX4090], b = [model:RTX5090]   → TRUE  (different values, same type)
 *   a = [brand:Apple],   b = [brand:Apple]     → FALSE (identical values)
 *   a = [brand:Apple],   b = []                → FALSE (b has no brand → no conflict)
 *   a = [brand:Apple],   b = [brand:Google]    → TRUE  (different brands)
 */
export function entitiesRigidVeto(a: Entity[], b: Entity[]): boolean {
  for (const type of RIGID_ENTITY_TYPES) {
    const aVals = new Set<string>()
    const bVals = new Set<string>()
    for (const e of a) if (e.type === type) aVals.add(e.value)
    for (const e of b) if (e.type === type) bVals.add(e.value)
    if (aVals.size === 0 || bVals.size === 0) continue
    // Both sides have at least one entity of this rigid type. Veto iff sets
    // are not equal (i.e. one has a value the other doesn't).
    if (aVals.size !== bVals.size) return true
    for (const v of aVals) {
      if (!bVals.has(v)) return true
    }
  }
  return false
}
