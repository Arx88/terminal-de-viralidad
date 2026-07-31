#!/usr/bin/env node
/**
 * VIRAHUB — Scraper local de X/Twitter
 *
 * FUNCIONAMIENTO:
 * 1. Instala Playwright: npm install && npx playwright install chromium
 * 2. Configura tu API key y URL de Vercel en .env o variables de entorno
 * 3. Ejecuta: node scraper.js
 *
 * El scraper:
 * - Lee los temas emergentes de Vercel (GET /api/v1/trends)
 * - Busca cada tema en xcancel.com/search (Playwright pasa el JS challenge)
 * - Extrae tweets de cuentas REALES (no preconcebidas)
 * - Los POSTea a Vercel (POST /api/v1/ingest)
 * - Los tweets aparecen en el dashboard en <5 segundos via SSE
 *
 * También busca términos fijos configurables y trending topics.
 */

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

// ─── Config ───
const VERCEL_URL = process.env.VERCEL_URL || 'https://terminal-de-viralidad.vercel.app'
const API_KEY = process.env.VIRAHUB_INGEST_API_KEY || 'virahub-local-2025'
const POLL_INTERVAL = parseInt(process.env.SCRAP_INTERVAL || '60000', 10) // 60s
const XCANCEL_BASE = 'https://xcancel.com'

// Términos fijos de búsqueda (adicionales a los reactivos)
const FIXED_QUERIES = [
  'AI OR artificial intelligence',
  'crypto OR bitcoin OR ethereum',
  'OpenAI OR Anthropic OR Mistral',
  'GPU OR Nvidia OR chip',
  'regulation OR EU OR policy',
]

// ─── Main ───
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║  VIRAHUB — Scraper local de X/Twitter                   ║')
  console.log('║  Busca en X desde tu PC → aparece en Vercel             ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log(`  Vercel: ${VERCEL_URL}`)
  console.log(`  API Key: ${API_KEY.slice(0, 8)}...`)
  console.log(`  Interval: ${POLL_INTERVAL / 1000}s`)
  console.log('')

  // Lanzar Chromium
  console.log('[boot] Lanzando Chromium...')
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  })
  console.log('[boot] Chromium listo ✅')

  // Primer ciclo inmediato
  await scrapeCycle(browser)

  // Ciclos periódicos
  const once = process.argv.includes('--once')
  if (!once) {
    console.log(`\n[boot] Próximo ciclo en ${POLL_INTERVAL / 1000}s. Ctrl+C para parar.\n`)
    setInterval(() => scrapeCycle(browser).catch(console.error), POLL_INTERVAL)
  } else {
    await browser.close()
  }
}

// ─── Ciclo de scraping ───
async function scrapeCycle(browser) {
  const cycleStart = Date.now()
  console.log(`\n[${new Date().toISOString()}] ─── Ciclo de scraping ───`)

  // 1. Obtener temas emergentes de Vercel
  const reactiveQueries = await getReactiveQueries()
  console.log(`[reactive] Temas emergentes de Vercel: ${reactiveQueries.length}`)

  // 2. Combinar con queries fijas
  const allQueries = [...reactiveQueries.slice(0, 3), ...FIXED_QUERIES.slice(0, 2)]
  console.log(`[search] Queries a buscar: ${allQueries.length}`)

  // 3. Buscar cada query en xcancel con Playwright
  const allTweets = []
  for (const query of allQueries) {
    console.log(`  [search] "${query.slice(0, 50)}"`)
    const tweets = await searchX(browser, query)
    console.log(`    → ${tweets.length} tweets encontrados`)
    allTweets.push(...tweets)
  }

  // 4. Dedup por tweet ID
  const seen = new Set()
  const deduped = allTweets.filter((t) => {
    if (seen.has(t.externalId)) return false
    seen.add(t.externalId)
    return true
  })

  console.log(`[total] ${deduped.length} tweets únicos de ${new Set(deduped.map((t) => t.authorHandle)).size} cuentas`)

  // 5. Enviar a Vercel
  if (deduped.length > 0) {
    const result = await sendToVercel(deduped)
    console.log(`[vercel] Ingestados: ${result.ingested} | Clusters actualizados: ${result.updatedClusters}`)
  } else {
    console.log('[vercel] Sin tweets para enviar')
  }

  const elapsed = Date.now() - cycleStart
  console.log(`[done] Ciclo completado en ${elapsed}ms`)
}

// ─── Obtener temas emergentes de Vercel ───
async function getReactiveQueries() {
  try {
    const resp = await fetch(`${VERCEL_URL}/api/v1/trends?limit=10`)
    if (!resp.ok) return []
    const data = await resp.json()
    const trends = data.data?.trends ?? []

    // Extraer keywords de los títulos de trends activos
    const queries = []
    for (const t of trends) {
      if (t.id === '_empty') continue
      const words = t.title
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 3)
      if (words.length >= 2) {
        queries.push(words.join(' '))
      }
    }
    return queries
  } catch (err) {
    console.error('[reactive] Error obteniendo trends:', err.message)
    return []
  }
}

// ─── Buscar en X via xcancel con Playwright ───
async function searchX(browser, query) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1920, height: 1080 },
  })
  const page = await context.newPage()
  const tweets = []

  try {
    const url = `${XCANCEL_BASE}/search?q=${encodeURIComponent(query)}&f=tweets`
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })

    // Esperar a que carguen los tweets (xcancel sirve challenge JS primero)
    await page.waitForSelector('.tweet-content', { timeout: 10000 }).catch(() => {})

    // Extraer tweets del DOM renderizado
    const tweetData = await page.evaluate(() => {
      const results = []
      const tweetContents = document.querySelectorAll('.tweet-content')
      const statusLinks = document.querySelectorAll('a[href*="/status/"]')

      const contents = []
      tweetContents.forEach((el) => {
        const text = el.textContent?.trim()
        if (text && text.length > 20) contents.push(text)
      })

      const links = []
      statusLinks.forEach((el) => {
        const href = el.getAttribute('href') || ''
        const match = href.match(/^\/([^/]+)\/status\/(\d+)$/)
        if (match) links.push({ user: match[1], id: match[2] })
      })

      const count = Math.min(contents.length, links.length, 10)
      for (let i = 0; i < count; i++) {
        results.push({ text: contents[i], user: links[i].user, id: links[i].id })
      }
      return results
    })

    for (const t of tweetData) {
      tweets.push({
        contentHash: `${t.id}`,
        source: 'x',
        externalId: t.id,
        authorId: t.user,
        authorHandle: `@${t.user}`,
        text: t.text,
        language: 'und',
        publishedAt: new Date().toISOString(),
        url: `https://x.com/${t.user}/status/${t.id}`,
        hasMedia: false,
        rawPayload: JSON.stringify({ user: t.user, id: t.id, text: t.text.slice(0, 200) }),
      })
    }
  } catch (err) {
    console.error(`  [search] Error: ${err.message}`)
  } finally {
    await context.close()
  }

  return tweets
}

// ─── Enviar tweets a Vercel ───
async function sendToVercel(tweets) {
  try {
    const resp = await fetch(`${VERCEL_URL}/api/v1/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: API_KEY, mentions: tweets }),
    })
    if (!resp.ok) {
      console.error(`[vercel] Error ${resp.status}: ${await resp.text()}`)
      return { ingested: 0, updatedClusters: 0 }
    }
    return await resp.json().then((d) => d.data)
  } catch (err) {
    console.error('[vercel] Error:', err.message)
    return { ingested: 0, updatedClusters: 0 }
  }
}

// ─── Run ───
main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
