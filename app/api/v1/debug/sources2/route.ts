/**
 * GET /api/v1/debug/sources2 — segunda ronda de tests con más mirrors
 */
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function testUrl(url: string, headers: Record<string, string> = {}, timeoutMs = 8000) {
  const start = Date.now()
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        ...headers,
      },
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'follow',
    })
    const body = await resp.text()
    clearTimeout(t)
    return {
      url,
      status: resp.status,
      ok: resp.ok,
      contentType: resp.headers.get('content-type') ?? '',
      bodyLength: body.length,
      durationMs: Date.now() - start,
      bodyPreview: body.slice(0, 400).replace(/\n/g, ' '),
      hasTweets: body.includes('tweet-content') || body.includes('tweet-body') || body.includes('class="tweet"') || body.includes('status/'),
    }
  } catch (err) {
    clearTimeout(t)
    return { url, status: 0, ok: false, contentType: '', bodyLength: 0, durationMs: Date.now() - start, bodyPreview: '', hasTweets: false, error: (err as Error).message }
  }
}

export async function GET(): Promise<Response> {
  const tests = []

  // X — syndication API (official, no auth, returns tweet JSON)
  const syndTests = [
    'https://cdn.syndication.twimg.com/timeline/hashtag/AI?count=20&lang=en',
    'https://cdn.syndication.twimg.com/timeline/trend?count=20',
    'https://cdn.syndication.twimg.com/timeline/profile/elonmusk?count=20',
    'https://cdn.syndication.twimg.com/timeline/replies/elonmusk?count=20',
    'https://publish.twitter.com/oembed?url=https%3A%2F%2Ftwitter.com%2Felonmusk&omit_script=true',
  ]
  for (const u of syndTests) {
    tests.push(await testUrl(u, { 'Accept': 'application/json' }))
  }

  // Nitter mirrors
  const nitterTests = [
    'https://xcancel.com/search?q=AI&f=tweets',
    'https://xcancel.com/elonmusk',
    'https://nitter.privacydev.net/search?q=AI&f=tweets',
    'https://nitter.1d4.us/search?q=AI&f=tweets',
    'https://nitter.kavin.rocks/search?q=AI&f=tweets',
    'https://nitter.unixfox.eu/search?q=AI&f=tweets',
    'https://nitter.fdn.fr/search?q=AI&f=tweets',
    'https://nitter.it/search?q=AI&f=tweets',
    'https://nitter.woodland.cafe/search?q=AI&f=tweets',
    'https://tweet.lambda.dance/search?q=AI&f=tweets',
  ]
  for (const u of nitterTests) {
    tests.push(await testUrl(u, { 'Accept': 'text/html' }))
  }

  // Reddit — RSS feeds
  const redditTests = [
    'https://www.reddit.com/r/technology/.rss',
    'https://www.reddit.com/r/technology/new/.rss',
    'https://www.reddit.com/r/technology/rising/.rss',
    'https://www.reddit.com/r/worldnews/.rss',
    'https://www.reddit.com/r/artificial/.rss',
  ]
  for (const u of redditTests) {
    tests.push(await testUrl(u, { 'Accept': 'application/atom+xml' }))
  }

  // Bluesky — alternatives
  const bskyTests = [
    'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=AI&limit=5',
    'https://bsky.social/xrpc/com.atproto.server.describeServer',
    'https://plc.directory/export',
  ]
  for (const u of bskyTests) {
    tests.push(await testUrl(u, { 'Accept': 'application/json' }))
  }

  return NextResponse.json({ tests, timestamp: new Date().toISOString() })
}
