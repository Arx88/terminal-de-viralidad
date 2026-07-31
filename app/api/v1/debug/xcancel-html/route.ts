/**
 * GET /api/v1/debug/xcancel-html — devuelve estructura de tweets de xcancel
 */
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(): Promise<Response> {
  const resp = await fetch('https://xcancel.com/elonmusk', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'text/html',
    },
    cache: 'no-store',
  })
  const html = await resp.text()
  const tweetMatches = html.match(/<div class="tweet[^"]*"[^>]*>[\s\S]*?(?=<div class="tweet|<\/div>\s*<\/div>\s*<\/div>)/g) ?? []
  return NextResponse.json({
    status: resp.status,
    htmlLength: html.length,
    tweetBlocks: tweetMatches.length,
    firstTweetBlock: tweetMatches[0]?.slice(0, 2000) ?? 'none',
    hasTweetContent: html.includes('tweet-content'),
    hasTweetBody: html.includes('tweet-body'),
    hasClassTweet: html.includes('class="tweet"'),
    hasStatusLink: html.includes('/status/'),
    sampleStatusLinks: (html.match(/href="\/[^\/"]+\/status\/\d+"/g) ?? []).slice(0, 5),
    sampleTweetContent: (html.match(/<div class="tweet-content[^"]*"[^>]*>[\s\S]*?<\/div>/g) ?? []).slice(0, 2).map((s: string) => s.slice(0, 500)),
  })
}
