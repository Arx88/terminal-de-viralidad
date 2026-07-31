/**
 * X (Twitter) — xcancel.com scraper funcional desde Vercel
 *
 * Scrapea perfiles de cuentas tech/AI/crypto de xcancel.com (Nitter mirror).
 * Fetches en paralelo con AbortController manual para evitar timeouts.
 */

import type { RawMention, SourceKey } from '@/lib/types'
import { fnv1a64, normalizeText } from '@/lib/server/hash'
import { logger } from '@/lib/server/logger'
import type { Adapter } from '@/lib/server/ingest/types'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'

// Cuentas que devuelven HTML con tweets desde Vercel (no challenge JS).
// xcancel.com sirve challenge JS a algunas cuentas pero no a otras —
// estas están verificadas como funcionales.
const X_WATCH_ACCOUNTS = [
  'elonmusk', 'OpenAI', 'sama', 'ylecun', 'AndrewYNg', 'karpathy',
  'balajis', 'vitalikbuterin', 'CathieDWood',
]

async function fetchXcancelProfile(account: string): Promise<RawMention[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  try {
    const resp = await fetch(`https://xcancel.com/${account}`, {
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
    if (!resp.ok) {
      logger.warn('x adapter: xcancel non-ok', { account, status: resp.status })
      return []
    }

    const html = await resp.text()
    const hasTweets = html.includes('tweet-content')
    logger.info('x adapter: xcancel response', {
      account,
      htmlLength: html.length,
      hasTweets,
      statusLinks: (html.match(/\/status\/\d+/g) ?? []).length,
    })
    if (html.length < 1000 || !hasTweets) return []

    // Estructura xcancel: <div class="tweet-content media-body" dir="auto">texto</div>
    // <a href="/username/status/123456">...</a>
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

    const out: RawMention[] = []
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
  } catch {
    clearTimeout(timeout)
    return []
  }
}

export class XAdapter implements Adapter {
  source: SourceKey = 'x'

  async fetch(): Promise<RawMention[]> {
    // Rotar 3 accounts aleatorias de la lista verificada
    const accounts = [...X_WATCH_ACCOUNTS]
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
    const results = await Promise.allSettled(accounts.map((a) => fetchXcancelProfile(a)))
    const out: RawMention[] = []
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.length > 0) {
        out.push(...r.value)
      }
    }
    if (out.length === 0) {
      logger.warn('x adapter: no tweets from any account', {
        accounts,
        results: results.map((r, i) => ({
          account: accounts[i],
          status: r.status,
          count: r.status === 'fulfilled' ? r.value.length : 0,
          reason: r.status === 'rejected' ? String(r.reason) : undefined,
        })),
      })
    }
    return out
  }
}
