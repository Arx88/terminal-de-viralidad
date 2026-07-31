import { NextResponse } from 'next/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
export async function GET(): Promise<Response> {
  const accounts = ['OpenAI', 'ylecun', 'karpathy', 'elonmusk', 'sama', 'balajis', 'vitalikbuterin', 'CathieDWood', 'AndrewYNg', 'fchollet', 'MistralAI', 'AnthropicAI', 'NvidiaAI', 'GoogleAI', 'AIatMeta', 'a16z', 'StabilityAI', 'DeepLearningAI', '3blue1brown', 'timberners_lee']
  const results = []
  for (let i = 0; i < accounts.length; i += 5) {
    const batch = accounts.slice(i, i + 5)
    const batchResults = await Promise.all(batch.map(async (acc) => {
      try {
        const resp = await fetch(`https://xcancel.com/${acc}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0', 'Accept': 'text/html' },
          cache: 'no-store', signal: AbortSignal.timeout(6000),
        })
        const html = await resp.text()
        return { account: acc, status: resp.status, htmlLength: html.length, hasTweetContent: html.includes('tweet-content'), statusLinks: (html.match(/\/status\/\d+/g) ?? []).length, isChallenge: html.includes('Verifying your browser') }
      } catch (err) { return { account: acc, error: (err as Error).message } }
    }))
    results.push(...batchResults)
  }
  return NextResponse.json({ results })
}
