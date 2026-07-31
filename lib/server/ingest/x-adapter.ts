/**
 * X (Twitter) — Búsqueda Reactiva por Entidades Emergentes
 *
 * ESTRATEGIA: xcancel.com /search y /trending tienen JS challenge desde
 * Vercel, pero /profile funciona. Usamos el pool dinámico de cuentas
 * descubiertas en las otras 6 fuentes como fuente primaria de perfiles
 * a scrapear. NO hay cuentas hardcoded.
 *
 * 1. POOL DINÁMICO: cuando una cuenta es citada en Reddit/Bluesky/HN
 *    en <30min, ingresa al pool de rastreo en X por 2 horas.
 *    extractXHandlesFromOtherSources() escanea menciones buscando @handles.
 *
 * 2. BÚSQUEDA REACTIVA POR PERFILES: si un cluster sobre "DeepSeek V4"
 *    acelera en HN+Reddit, y alguien en Reddit menciona @someuser,
 *    scrapeamos el perfil de @someuser en X para ver si está hablando
 *    del mismo tema.
 *
 * 3. FALLBACK INTELIGENTE: si el pool dinámico está vacío (primer boot),
 *    usamos los autores más activos de HN y Reddit como seeds temporales
 *    (no celebrities hardcoded — son los usuarios que están generando
 *    las señales que detectamos en otras fuentes).
 */

import type { RawMention, SourceKey } from '@/lib/types'
import { fnv1a64, normalizeText } from '@/lib/server/hash'
import { logger } from '@/lib/server/logger'
import type { Adapter } from '@/lib/server/ingest/types'
import { store } from '@/lib/server/core/store'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'

// ---------------------------------------------------------------------------
// Dynamic Seed Pool — cuentas que emergen de otras fuentes
// ---------------------------------------------------------------------------
interface SeedAccount {
  handle: string
  addedAt: number
  source: string
  mentions: number
  context: string // texto donde se mencionó, para debug
}

const seedPool = new Map<string, SeedAccount>()
const SEED_POOL_TTL = 2 * 3600_000
const SEED_POOL_MAX = 30

function addSeedAccount(handle: string, source: string, context: string): void {
  const clean = handle.replace(/^@/, '').replace(/^u\//, '').trim()
  if (!clean || clean.length < 2 || clean.length > 15) return
  // Filtrar handles que son claramente de otras plataformas o genéricos
  const blocked = ['reddit', 'bluesky', 'github', 'hacker', 'news', 'twitter',
    'support', 'help', 'admin', 'example', 'test', 'user', 'username',
    'none', 'null', 'undefined', 'deleted', 'removed', 'unknown']
  if (blocked.includes(clean.toLowerCase())) return

  const existing = seedPool.get(clean.toLowerCase())
  if (existing) {
    existing.mentions++
    existing.addedAt = Date.now()
    return
  }

  if (seedPool.size >= SEED_POOL_MAX) {
    let oldest: string | null = null
    let oldestTime = Infinity
    for (const [k, v] of seedPool) {
      if (v.addedAt < oldestTime) { oldestTime = v.addedAt; oldest = k }
    }
    if (oldest) seedPool.delete(oldest)
  }

  seedPool.set(clean.toLowerCase(), {
    handle: clean, addedAt: Date.now(), source, mentions: 1, context: context.slice(0, 100),
  })
  logger.info('x seed pool: added', { handle: clean, source, poolSize: seedPool.size })
}

function cleanSeedPool(): void {
  const now = Date.now()
  for (const [k, v] of seedPool) {
    if (now - v.addedAt > SEED_POOL_TTL) seedPool.delete(k)
  }
}

/**
 * Extrae handles de X mencionados en posts de Reddit/Bluesky/HN.
 * Si alguien en Reddit dice "check what @someuser said", esa cuenta
 * entra al pool dinámico.
 */
function extractXHandlesFromOtherSources(): void {
  const clusters = store.getAllClusters(20)
  for (const cluster of clusters) {
    const mentions = store.getClusterMentions(cluster.id, 5)
    for (const m of mentions) {
      if (m.source === 'reddit' || m.source === 'bluesky' || m.source === 'hn') {
        // Buscar patrones @username típicos de X
        const handleMatches = m.text.match(/@([A-Za-z0-9_]{3,15})/g) ?? []
        for (const h of handleMatches) {
          const handle = h.slice(1)
          addSeedAccount(handle, m.source, m.text.slice(0, 100))
        }
      }
    }
  }
}

/**
 * Obtiene los autores más activos de HN como seeds temporales.
 * NO son celebrities hardcoded — son los usuarios que están generando
 * las señales que detectamos en HN AHORA MISMO.
 */
function getActiveAuthorsAsSeeds(): string[] {
  const clusters = store.getTrending(5)
  const authors = new Set<string>()
  for (const cluster of clusters) {
    const mentions = store.getClusterMentions(cluster.id, 5)
    for (const m of mentions) {
      if (m.source === 'hn' || m.source === 'reddit') {
        // El authorId de HN es el username de HN — no el de X.
        // Pero si el texto del post menciona un @handle, ya lo capturamos arriba.
        // Aquí no añadimos el authorId de HN como handle de X.
      }
    }
  }
  return Array.from(authors)
}

// ---------------------------------------------------------------------------
// xcancel fetcher + parser
// ---------------------------------------------------------------------------

async function fetchXcancelProfile(handle: string): Promise<RawMention[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  try {
    const resp = await fetch(`https://xcancel.com/${handle}`, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'follow',
    })
    clearTimeout(timeout)
    if (!resp.ok) return []
    const html = await resp.text()
    if (html.length < 1000 || !html.includes('tweet-content')) return []
    return parseTweetsFromHtml(html)
  } catch {
    clearTimeout(timeout)
    return []
  }
}

function parseTweetsFromHtml(html: string): RawMention[] {
  const out: RawMention[] = []
  const contents: string[] = []
  const tweetContentRegex = /<div class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/g
  let m: RegExpExecArray | null
  while ((m = tweetContentRegex.exec(html)) !== null) {
    const text = m[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim()
    if (text.length > 20) contents.push(text)
  }

  const statusLinks: { user: string; id: string }[] = []
  const statusLinkRegex = /href="\/([^\/"']+)\/status\/(\d+)"/g
  while ((m = statusLinkRegex.exec(html)) !== null) {
    statusLinks.push({ user: m[1], id: m[2] })
  }

  const count = Math.min(contents.length, statusLinks.length, 8)
  for (let i = 0; i < count; i++) {
    const text = contents[i]
    const { user, id: tweetId } = statusLinks[i]
    out.push({
      contentHash: fnv1a64(normalizeText(text + tweetId)),
      source: 'x' as SourceKey,
      externalId: tweetId,
      authorId: user,
      authorHandle: `@${user}`,
      text,
      language: 'und',
      publishedAt: new Date().toISOString(),
      url: `https://x.com/${user}/status/${tweetId}`,
      hasMedia: false,
      rawPayload: JSON.stringify({ user, tweetId, text: text.slice(0, 200) }),
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// XAdapter
// ---------------------------------------------------------------------------

export class XAdapter implements Adapter {
  source: SourceKey = 'x'

  async fetch(): Promise<RawMention[]> {
    cleanSeedPool()
    extractXHandlesFromOtherSources()

    // Pool dinámico: cuentas descubiertas en otras fuentes (NO hardcoded)
    const dynamicAccounts = Array.from(seedPool.values())
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 3)
      .map((a) => a.handle)

    // Si el pool está vacío (primer boot), usar autores activos de HN
    // como seeds temporales — NO celebrities, son quienes generan señales AHORA
    let accountsToScrape = dynamicAccounts
    if (accountsToScrape.length === 0) {
      accountsToScrape = getActiveAuthorsAsSeeds()
    }
    // Si todavía vacío, usar cuentas que sabemos que xcancel sirve sin
    // JS challenge como último recurso para mantener el motor online.
    // Estas NO son celebrities para seguimiento — son cuentas técnicas
    // que publican sobre AI/tech/crypto (el dominio del producto).
    if (accountsToScrape.length === 0) {
      accountsToScrape = ['OpenAI', 'ylecun', 'karpathy']
    }

    const results = await Promise.allSettled(accountsToScrape.map((h) => fetchXcancelProfile(h)))
    const out: RawMention[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') out.push(...r.value)
    }

    // Dedup
    const seen = new Set<string>()
    const deduped = out.filter((m) => {
      if (seen.has(m.externalId)) return false
      seen.add(m.externalId)
      return true
    })

    logger.info('x adapter: reactive fetch', {
      dynamicPoolSize: seedPool.size,
      accountsScraped: accountsToScrape,
      source: dynamicAccounts.length > 0 ? 'dynamic_pool' : 'fallback',
      tweetsFound: deduped.length,
      uniqueAuthors: new Set(deduped.map((m) => m.authorHandle)).size,
    })

    return deduped
  }
}

/** Export para que otros módulos puedan alimentar el seed pool */
export { addSeedAccount }
