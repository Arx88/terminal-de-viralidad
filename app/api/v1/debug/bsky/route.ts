/**
 * GET /api/v1/debug/bsky — prueba endpoints de Bluesky
 */
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

async function testUrl(url: string, headers: Record<string, string> = {}) {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0',
        'Accept': 'application/json',
        ...headers,
      },
      cache: 'no-store',
    })
    const body = await resp.text()
    return { url, status: resp.status, ok: resp.ok, bodyLength: body.length, preview: body.slice(0, 300) }
  } catch (err) {
    return { url, status: 0, ok: false, bodyLength: 0, preview: '', error: (err as Error).message }
  }
}

export async function GET(): Promise<Response> {
  const tests = []
  tests.push(await testUrl('https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=AI&limit=3'))
  tests.push(await testUrl('https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=AI&limit=3', {
    'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'cross-site',
    'Referer': 'https://bsky.app/',
  }))
  tests.push(await testUrl('https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=AI&limit=3', {
    'User-Agent': '',
  }))
  tests.push(await testUrl('https://bsky.social/xrpc/com.atproto.server.describeServer'))
  tests.push(await testUrl('https://public.api.bsky.app/xrpc/app.bsky.feed.getPopular?limit=3'))
  tests.push(await testUrl('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=bsky.app&limit=3'))
  tests.push(await testUrl('https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=AI&limit=3'))
  return NextResponse.json({ tests })
}
