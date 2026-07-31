'use client'

/**
 * X (Twitter) — xcancel.com scraper funcional desde Vercel
 *
 * xcancel.com/search tiene JS challenge, pero las páginas de perfil
 * devuelven HTML limpio con tweets. Scrapeamos cuentas de tech/AI/crypto
 * relevantes al detector de viralidad. El clustering agrupa tweets
 * similares de X con posts de Reddit/Bluesky/HN para corroboración
 * cross-platform.
 */

import type { RawMention, SourceKey } from '@/lib/types'
import { fnv1a64, normalizeText } from '@/lib/server/hash'
import { logger } from '@/lib/server/logger'
import type { Adapter } from '@/lib/server/ingest/types'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'

// Cuentas de tech/AI/crypto — relevantes al detector de viralidad temprana
const X_WATCH_ACCOUNTS = [
  'OpenAI', 'sama', 'ylecun', 'AndrewYNg', 'fchollet', 'karpathy',
  'balajis', 'vitalikbuterin', 'CathieDWood', 'a16z', 'DWainwright',
  'ai_revolution', 'TheAIGRID', 'tsaborisov', 'AIatMeta', 'GoogleAI',
  'NvidiaAI', 'AnthropicAI', 'MistralAI', 'StabilityAI',
]

export class XAdapter implements Adapter {
  source: SourceKey = 'x'

  async fetch(): Promise<RawMention[]> {
    const out: RawMention[] = []
    // Rotar 3 accounts por ciclo para diversificar y no saturar xcancel
    const accounts = [...X_WATCH_ACCOUNTS]
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)

    for (const account of accounts) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
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
          logger.warn('x adapter: xcancel failed', { account, status: resp.status })
          continue
        }
        const html = await resp.text()
        if (html.length < 1000) continue

        // Estructura confirmada de xcancel:
        // <div class="tweet-content media-body" dir="auto">texto</div>
        // <a href="/username/status/123456">...</a>
        const tweetContentRegex = /<div class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/g
        const statusLinkRegex = /href="\/([^\/"']+)\/status\/(\d+)"/g

        const contents: string[] = []
        let m: RegExpExecArray | null
        while ((m = tweetContentRegex.exec(html)) !== null) {
          const text = m[1]
            .replace(/<[^>]+>/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
          if (text.length > 20) contents.push(text)
        }

        const statusLinks: { user: string; id: string }[] = []
        while ((m = statusLinkRegex.exec(html)) !== null) {
          statusLinks.push({ user: m[1], id: m[2] })
        }

        // Emparejar contents con statusLinks (están en orden en el HTML)
        const count = Math.min(contents.length, statusLinks.length, 8)
        for (let i = 0; i < count; i++) {
          const text = contents[i]
          const { user, id: tweetId } = statusLinks[i]

          out.push({
            contentHash: fnv1a64(normalizeText(text + tweetId)),
            source: 'x',
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

        // Delay entre accounts para no saturar xcancel
        await new Promise((r) => setTimeout(r, 300))
      } catch (err) {
        clearTimeout(timeout)
        logger.warn('x adapter error', { account, err: (err as Error).message })
      }
    }
    return out
  }
}
