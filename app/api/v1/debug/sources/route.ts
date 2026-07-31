/**
 * GET /api/v1/debug/sources — prueba cada fuente DESDE Vercel
 * Devuelve el status real de cada adapter con diagnóstico detallado.
 */
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface SourceTest {
  source: string
  url: string
  status: number
  ok: boolean
  contentType: string
  bodyPreview: string
  bodyLength: number
  durationMs: number
  error?: string
}

async function testUrl(url: string, headers: Record<string, string> = {}, timeoutMs = 8000): Promise<SourceTest> {
  const start = Date.now()
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/html,*/*',
        ...headers,
      },
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'follow',
    })
    const body = await resp.text()
    clearTimeout(t)
    return {
      source: '',
      url,
      status: resp.status,
      ok: resp.ok,
      contentType: resp.headers.get('content-type') ?? '',
      bodyPreview: body.slice(0, 300).replace(/\n/g, ' '),
      bodyLength: body.length,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    clearTimeout(t)
    return {
      source: '',
      url,
      status: 0,
      ok: false,
      contentType: '',
      bodyPreview: '',
      bodyLength: 0,
      durationMs: Date.now() - start,
      error: (err as Error).message,
    }
  }
}

export async function GET(): Promise<Response> {
  const tests: SourceTest[] = []

  // Reddit — múltiples endpoints
  const redditTests = [
    { source: 'reddit', url: 'https://www.reddit.com/r/technology/hot.json?limit=3&raw_json=1' },
    { source: 'reddit', url: 'https://old.reddit.com/r/technology/hot.json?limit=3' },
    { source: 'reddit', url: 'https://www.reddit.com/r/technology/.rss' },
    { source: 'reddit', url: 'https://www.reddit.com/search.json?q=AI&limit=3&raw_json=1' },
  ]
  for (const t of redditTests) {
    const r = await testUrl(t.url, { 'Accept': 'application/json' })
    r.source = t.source
    tests.push(r)
  }

  // Bluesky — múltiples endpoints
  const bskyTests = [
    { source: 'bluesky', url: 'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=AI&limit=3&sort=latest' },
    { source: 'bluesky', url: 'https://bsky.social/xrpc/app.bsky.feed.searchPosts?q=AI&limit=3' },
    { source: 'bluesky', url: 'https://plc.directory/health' },
  ]
  for (const t of bskyTests) {
    const r = await testUrl(t.url, { 'Accept': 'application/json' })
    r.source = t.source
    tests.push(r)
  }

  // X / Nitter mirrors + syndication API
  const xTests = [
    { source: 'x', url: 'https://xcancel.com/search?q=AI&f=tweets' },
    { source: 'x', url: 'https://nitter.poast.org/search?q=AI&f=tweets' },
    { source: 'x', url: 'https://nitter.net/search?q=AI&f=tweets' },
    { source: 'x', url: 'https://birdsite.xanny.family/search?q=AI&f=tweets' },
    { source: 'x', url: 'https://publish.twitter.com/oembed?url=https://twitter.com/elonmusk/status/123' },
    { source: 'x', url: 'https://cdn.syndication.twimg.com/timeline/profile/elonmusk' },
    { source: 'x', url: 'https://cdn.syndication.twimg.com/timeline/hashtag/AI' },
  ]
  for (const t of xTests) {
    const r = await testUrl(t.url, { 'Accept': 'text/html,application/json' })
    r.source = t.source
    tests.push(r)
  }

  // Control — sources que sí funcionan
  const controlTests = [
    { source: 'hn', url: 'https://hacker-news.firebaseio.com/v0/topstories.json' },
    { source: 'rss', url: 'https://feeds.arstechnica.com/arstechnica/index.xml' },
    { source: 'github', url: 'https://api.github.com/search/repositories?q=stars:>500+pushed:>2025-07-24&per_page=1' },
    { source: 'gdelt', url: 'https://api.gdeltproject.org/api/v2/doc/doc?query=AI&mode=ArtList&maxrecords=1&format=json' },
  ]
  for (const t of controlTests) {
    const r = await testUrl(t.url)
    r.source = t.source
    tests.push(r)
  }

  return NextResponse.json({ tests, timestamp: new Date().toISOString() })
}
