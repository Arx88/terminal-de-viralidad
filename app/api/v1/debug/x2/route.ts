import { NextResponse } from 'next/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(): Promise<Response> {
  const tests = []
  const syndUrls = [
    'https://cdn.syndication.twimg.com/timeline/hashtag/AI?count=10&lang=en',
    'https://cdn.syndication.twimg.com/timeline/hashtag/OpenAI?count=10',
    'https://cdn.syndication.twimg.com/timeline/hashtag/Bitcoin?count=10',
    'https://cdn.syndication.twimg.com/timeline/hashtag/crypto?count=10',
    'https://cdn.syndication.twimg.com/timeline/hashtag/tech?count=10',
  ]
  for (const url of syndUrls) {
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(8000) })
      const body = await resp.text()
      tests.push({ url, status: resp.status, ok: resp.ok, bodyLength: body.length, bodyPreview: body.slice(0, 500), hasTweets: body.includes('"id_str"') || body.includes('"conversation_id"') })
    } catch (err) { tests.push({ url, status: 0, ok: false, bodyLength: 0, error: (err as Error).message }) }
  }
  const xcancelUrls = [
    'https://xcancel.com/search?q=AI&f=tweets',
    'https://xcancel.com/hashtag/AI',
    'https://xcancel.com/hashtag/OpenAI',
    'https://xcancel.com/hashtag/crypto',
  ]
  for (const url of xcancelUrls) {
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0', 'Accept': 'text/html' }, cache: 'no-store', signal: AbortSignal.timeout(8000) })
      const body = await resp.text()
      tests.push({ url, status: resp.status, ok: resp.ok, bodyLength: body.length, hasTweetContent: body.includes('tweet-content'), hasTweets: body.includes('/status/'), isChallenge: body.includes('Verifying your browser') || body.includes('challenge') })
    } catch (err) { tests.push({ url, status: 0, ok: false, bodyLength: 0, error: (err as Error).message }) }
  }
  return NextResponse.json({ tests })
}
