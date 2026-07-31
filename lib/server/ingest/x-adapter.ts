/**
 * X (Twitter) — Búsqueda Reactiva por Entidades Emergentes
 *
 * NO usa perfiles fijos de celebrities. En su lugar:
 *
 * 1. BÚSQUEDA REACTIVA: consulta /search?q=<tema> en xcancel.com usando
 *    términos que ya están acelerando en las otras 6 fuentes (Reddit,
 *    Bluesky, HN, RSS, GitHub). Si un cluster sobre "DeepSeek V4" está
 *    ganando tracción en HN+Reddit, X busca "DeepSeek V4" para ver si
 *    hay conversación social real.
 *
 * 2. POOL DINÁMICO DE CUENTAS: cuando una cuenta es citada repetidamente
 *    en Reddit/Bluesky en <30min, ingresa automáticamente al pool de
 *    rastreo en X por 2 horas. Las cuentas salen del pool automáticamente.
 *
 * 3. TRENDING: consulta /trending de xcancel para descubrir temas que
 *    están emergiendo en X mismo (no en otras fuentes).
 *
 * El éxito NO es recibir HTTP 200 de cuentas famosas — es descubrir
 * menciones de cuentas no preconcebidas que validen o disparen la
 * aceleración de un cluster en tiempo real.
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
  source: string // 'reddit' | 'bluesky' | etc — de dónde se descubrió
  mentions: number
}

const seedPool = new Map<string, SeedAccount>()
const SEED_POOL_TTL = 2 * 3600_000 // 2 horas
const SEED_POOL_MAX = 30 // máximo 30 cuentas dinámicas

/** Añade una cuenta al pool dinámico si fue citada en otra fuente. */
export function addSeedAccount(handle: string, source: string): void {
  const clean = handle.replace(/^@/, '').replace(/^u\//, '').trim()
  if (!clean || clean.length < 2) return

  const existing = seedPool.get(clean)
  if (existing) {
    existing.mentions++
    existing.addedAt = Date.now() // refresh TTL
    return
  }

  if (seedPool.size >= SEED_POOL_MAX) {
    // Eliminar la más vieja
    let oldest: string | null = null
    let oldestTime = Infinity
    for (const [k, v] of seedPool) {
      if (v.addedAt < oldestTime) { oldestTime = v.addedAt; oldest = k }
    }
    if (oldest) seedPool.delete(oldest)
  }

  seedPool.set(clean, { handle: clean, addedAt: Date.now(), source, mentions: 1 })
  logger.info('x seed pool: added', { handle: clean, source, poolSize: seedPool.size })
}

/** Limpia cuentas expiradas del pool. */
function cleanSeedPool(): void {
  const now = Date.now()
  for (const [k, v] of seedPool) {
    if (now - v.addedAt > SEED_POOL_TTL) {
      seedPool.delete(k)
    }
  }
}

// ---------------------------------------------------------------------------
// Reactive Search — buscar temas emergentes en X
// ---------------------------------------------------------------------------

/**
 * Extrae términos de búsqueda de los clusters activos del store.
 * Usa los títulos y entidades de los clusters que ya están trending
 * en las otras 6 fuentes para buscar conversación en X.
 */
function getReactiveSearchQueries(): string[] {
  const clusters = store.getTrending(10)
  const queries: string[] = []

  for (const cluster of clusters) {
    // Extraer keywords del título (palabras significativas)
    const titleWords = cluster.title
      .replace(/[^a-zA-Z0-9\sáéíóúñü]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !['this', 'that', 'with', 'from', 'have', 'they', 'will', 'been', 'what', 'about'].includes(w.toLowerCase()))
      .slice(0, 3)

    if (titleWords.length >= 2) {
      queries.push(titleWords.join(' '))
    }

    // Si hay entidades de marca/producto, buscarlas
    const brandEntities = cluster.entities
      .filter((e) => ['brand', 'product', 'cashtag'].includes(e.type))
      .slice(0, 2)
    for (const e of brandEntities) {
      if (e.type === 'cashtag') {
        queries.push(`$${e.value}`)
      } else {
        queries.push(e.value)
      }
    }

    if (queries.length >= 5) break
  }

  return queries.slice(0, 5)
}

/**
 * Extrae handles de X mencionados en posts de Reddit/Bluesky.
 * Si alguien en Reddit dice "check what @someuser said on twitter",
 * esa cuenta entra al pool dinámico.
 */
function extractXHandlesFromOtherSources(): void {
  const clusters = store.getAllClusters(20)
  for (const cluster of clusters) {
    const mentions = store.getClusterMentions(cluster.id, 5)
    for (const m of mentions) {
      if (m.source === 'reddit' || m.source === 'bluesky') {
        // Buscar patrones @username en el texto
        const handleMatches = m.text.match(/@([A-Za-z0-9_]{3,15})/g) ?? []
        for (const h of handleMatches) {
          const handle = h.slice(1) // quitar @
          // Filtrar handles que son claramente de otras plataformas
          if (!['reddit', 'bluesky', 'github', 'hacker', 'news'].includes(handle.toLowerCase())) {
            addSeedAccount(handle, m.source)
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// xcancel.com fetcher
// ---------------------------------------------------------------------------

async function fetchXcancelUrl(path: string): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  try {
    const resp = await fetch(`https://xcancel.com${path}`, {
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
    if (!resp.ok) return null
    const html = await resp.text()
    if (html.length < 500 || !html.includes('tweet-content')) return null
    return html
  } catch {
    clearTimeout(timeout)
    return null
  }
}

/**
 * Parsea HTML de xcancel y extrae tweets.
 * Estructura: <div class="tweet-content media-body">texto</div>
 * <a href="/username/status/123">...</a>
 */
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

  const count = Math.min(contents.length, statusLinks.length, 10)
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
// XAdapter — Búsqueda Reactiva + Dynamic Seed Pool
// ---------------------------------------------------------------------------

export class XAdapter implements Adapter {
  source: SourceKey = 'x'

  async fetch(): Promise<RawMention[]> {
    cleanSeedPool()
    extractXHandlesFromOtherSources()

    const out: RawMention[] = []
    const tasks: Promise<RawMention[]>[] = []

    // 1. BÚSQUEDA REACTIVA: usar temas emergentes de las otras 6 fuentes
    const searchQueries = getReactiveSearchQueries()
    for (const q of searchQueries.slice(0, 3)) {
      tasks.push(this.searchX(q))
    }

    // 2. POOL DINÁMICO: scrapear perfiles de cuentas descubiertas en otras fuentes
    // (NO hardcoded — emergen de la actividad real)
    const dynamicAccounts = Array.from(seedPool.values())
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 2)
    for (const acc of dynamicAccounts) {
      tasks.push(this.scrapeProfile(acc.handle))
    }

    // 3. TRENDING: descubrir lo que está emergiendo en X mismo
    tasks.push(this.scrapeTrending())

    const results = await Promise.allSettled(tasks)
    for (const r of results) {
      if (r.status === 'fulfilled') {
        out.push(...r.value)
      }
    }

    // Dedup por externalId
    const seen = new Set<string>()
    const deduped = out.filter((m) => {
      if (seen.has(m.externalId)) return false
      seen.add(m.externalId)
      return true
    })

    logger.info('x adapter: reactive fetch', {
      searchQueries,
      dynamicAccounts: dynamicAccounts.map((a) => a.handle),
      seedPoolSize: seedPool.size,
      tweetsFound: deduped.length,
      uniqueAccounts: new Set(deduped.map((m) => m.authorHandle)).size,
    })

    return deduped
  }

  /** Búsqueda reactiva: /search?q=<tema emergente de otras fuentes> */
  private async searchX(query: string): Promise<RawMention[]> {
    const html = await fetchXcancelUrl(`/search?q=${encodeURIComponent(query)}&f=tweets`)
    if (!html) {
      logger.warn('x search: no results', { query })
      return []
    }
    const tweets = parseTweetsFromHtml(html)
    logger.info('x search results', { query, tweets: tweets.length })
    return tweets
  }

  /** Scrapea perfil de cuenta del pool dinámico (NO hardcoded) */
  private async scrapeProfile(handle: string): Promise<RawMention[]> {
    const html = await fetchXcancelUrl(`/${handle}`)
    if (!html) return []
    return parseTweetsFromHtml(html)
  }

  /** Descubre trending topics de X mismo */
  private async scrapeTrending(): Promise<RawMention[]> {
    // xcancel tiene /trending con topics del momento
    const html = await fetchXcancelUrl('/trending')
    if (!html) return []

    // Extraer links a tweets de la página de trending
    const tweets = parseTweetsFromHtml(html)
    logger.info('x trending results', { tweets: tweets.length })
    return tweets
  }
}
