import { NextResponse } from 'next/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(): Promise<Response> {
  const accounts = ['OpenAI', 'sama', 'karpathy']
  const results = []
  for (const acc of accounts) {
    const start = Date.now()
    try {
      const resp = await fetch(`https://xcancel.com/${acc}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })
      const html = await resp.text()
      results.push({
        account: acc,
        status: resp.status,
        ok: resp.ok,
        htmlLength: html.length,
        hasTweetContent: html.includes('tweet-content'),
        statusLinks: (html.match(/href="\/[^\/"]+\/status\/\d+"/g) ?? []).length,
        durationMs: Date.now() - start,
        preview: html.slice(0, 200),
      })
    } catch (err) {
      results.push({ account: acc, error: (err as Error).message, durationMs: Date.now() - start })
    }
  }
  return NextResponse.json({ results })
}
