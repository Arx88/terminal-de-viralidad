#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Contenido del body PDF — Capítulos 8 a 11
"""

from generate_body_part1 import (
    h1, h1_kicker, h2, h3, h4, body, body_indent, lead, bullet, code, caption,
    callout, th, th_c, td, td_c, td_mono, toc_h1, toc_h2,
    BG_BASE, BG_ELEVATED, BG_PANEL, BG_HOVER, BG_ACTIVE, BG_INSET,
    BORDER_SUBTLE, BORDER_DEFAULT, BORDER_STRONG, BORDER_FOCUS,
    TEXT_PRIMARY, TEXT_SECONDARY, TEXT_TERTIARY, TEXT_DISABLED,
    ACC_FORMING, ACC_RISING, ACC_PEAKED, ACC_DECAY, ACC_LIVE,
    LINK_BLUE, WARN_AMBER, DANGER_RED,
    CONTENT_W, CONTENT_H, PAGE_W, PAGE_H, MARGIN_L, MARGIN_R, MARGIN_T, MARGIN_B,
    add_heading, chapter_header, section_header, subsection_header,
    body_p, lead_p, bullet_p, code_block, callout_box, make_table,
    ascii_diagram, safe_keep_together,
    Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether,
    CondPageBreak, HRFlowable, Preformatted,
)


def build_chapters_8_to_11():
    story = []

    # ═══════════════════════════════════════════════════════════════════════
    # CHAPTER 8 — FUENTES Y SCRAPING
    # ═══════════════════════════════════════════════════════════════════════
    story.extend(chapter_header(8, 'Fuentes y Scraping', kicker_text='CAPÍTULO 08 · INGESTA MULTI-FUENTE'))

    story.append(lead_p(
        'Cinco fuentes asimétricas con un patrón SourceAdapter común. CloakBrowser 0.5.2 (wrapper de Playwright '
        'con stealth a nivel binario) es la base exclusiva para Twitter. GDELT 2.0 impone 1 req/5s verificado. '
        'Reddit requiere OAuth2 obligatorio (el .json sin auth está degradado). HN Algolia funciona perfecto sin '
        'key. Google Trends necesita pytrends. Deduplicación cross-fuente en 3 capas.'))

    story.append(subsection_header('8.1 · CloakBrowser 0.5.2 — qué es y cómo extenderlo'))
    story.append(body_p(
        'CloakBrowser es un package npm mantenido por cloakhq, licencia MIT. Latest publicada: 0.5.3 (se recomienda '
        'actualizar desde 0.5.2). Peer-deps: playwright-core ^1.40 y puppeteer-core ^21. Tamaño unpacked ~37KB '
        '(wrapper liviano; el binario Chromium es de Playwright). Descripción oficial: "Stealth Chromium that passes '
        'every bot detection test. Drop-in Playwright/Puppeteer replacement with source-level fingerprint patches."'))
    story.append(body_p(
        'A diferencia de puppeteer-extra-plugin-stealth (que inyecta JS para evadir detección), CloakBrowser '
        'modifica el binario compilado de Chromium. Esto evita navigator.webdriver, leaks de chrome.runtime, '
        'permissions.query, WebGL vendor/renderer, canvas noise, AudioContext fingerprint, font enumeration, '
        'hardware concurrency, device memory. Es drop-in replacement: misma API que Playwright '
        '(browser.newPage(), page.goto()).'))
    story.append(body_p(
        '<b>Limitaciones verificadas</b>: (1) no incluye proxies — hay que pasarlos vía --proxy-server; (2) no rota '
        'user agents automáticamente; (3) no resuelve CAPTCHAs (integrar 2captcha/CapMonster externo); (4) no tiene '
        'modo "human behavior" built-in — scroll, hover, mouse movement hay que programarlos encima; (5) binario '
        'pesado ~200MB por versión; (6) no evade login wall de Twitter; (7) update lag — dependés del maintainer '
        'para releasear patches cuando Twitter cambia detección.'))

    story.append(subsection_header('8.2 · Tabla de las 5 fuentes'))
    story.append(make_table(
        ['Fuente', 'Endpoint', 'Frecuencia', 'Latencia', 'Rate limit', 'Reliability'],
        [
            ['Twitter/X',     'x.com/search?q=...&f=live (HTML)', '30s-1min por query',  '3-8s',   'Variable, soft-ban risk', 'Media'],
            ['GDELT DOC 2.0', 'api.gdeltproject.org/api/v2/doc',  '15 min',               '0.5-2s', '1 req/5s por IP',         'Alta'],
            ['Reddit OAuth2', 'oauth.reddit.com/r/{sub}/hot',     '5 min por sub',        '0.3-1s', '60 req/min con OAuth',    'Alta'],
            ['HN Algolia',    'hn.algolia.com/api/v1/search',     '10 min',               '0.2-0.8s','Sin límite documentado', 'Muy alta'],
            ['Google Trends', 'trends.google.com/trends/api/...', '1 hora',               '2-5s',   '~1 req/10s recomendado',  'Baja (429 frecuente)'],
        ],
        col_widths=[CONTENT_W*0.13, CONTENT_W*0.30, CONTENT_W*0.16, CONTENT_W*0.10, CONTENT_W*0.18, CONTENT_W*0.13]
    ))
    story.extend(callout_box(
        'NOTAS CRÍTICAS VERIFICADAS EN RUNTIME',
        'Reddit .json sin auth ahora devuelve HTML aunque el UA sea correcto formato "linux:app:ver (by /u/user)". '
        'OAuth2 obligatorio desde v1. GDELT devuelve texto plano "Please limit requests to one every 5 seconds..." '
        'si se viola el rate. Google Trends raw curl devuelve 404 — solo funciona con pytrends que replica '
        'headers/tokens internos.',
        color=WARN_AMBER
    ))

    story.append(subsection_header('8.3 · Schema unificado NormalizedMention'))
    story.append(body_p(
        'Cada fuente implementa un adapter que normaliza a un schema común. El campo raw es el escape hatch que '
        'evita migrar el schema cada vez que una fuente añade campos:'))
    story.extend(code_block(
        "export type SourceType = 'twitter' | 'gdelt' | 'reddit' | 'hackernews' | 'googletrends';\n"
        "export type MentionType = 'post' | 'article' | 'story' | 'comment' | 'trend_signal';\n"
        "\n"
        "export interface NormalizedMention {\n"
        "  // Identidad\n"
        "  id: string;                    // UUID interno\n"
        "  source: SourceType;\n"
        "  source_id: string;             // ID nativo (tweet_id, objectID, reddit fullname)\n"
        "  url: string;                   // URL canónica\n"
        "  fetched_at: number;            // epoch ms\n"
        "  published_at: number | null;   // epoch ms (cuándo se publicó)\n"
        "\n"
        "  // Contenido\n"
        "  type: MentionType;\n"
        "  title: string | null;          // null para tweets\n"
        "  body: string;                  // texto principal\n"
        "  lang: string | null;           // ISO 639-1\n"
        "  entities: {\n"
        "    hashtags?: string[];\n"
        "    cashtags?: string[];\n"
        "    mentions?: string[];\n"
        "    urls?: string[];\n"
        "    domains?: string[];          // gdelt\n"
        "  };\n"
        "  media?: { type: 'image'|'video'|'none'; urls: string[] }[];\n"
        "\n"
        "  // Autor\n"
        "  author: {\n"
        "    id: string | null;\n"
        "    handle: string | null;\n"
        "    name: string | null;\n"
        "    followers?: number;          // solo twitter\n"
        "    karma?: number;              // reddit/hn\n"
        "  };\n"
        "\n"
        "  // Engagement (no comparable cross-fuente)\n"
        "  engagement: {\n"
        "    likes?: number; retweets?: number; replies?: number;\n"
        "    score?: number;              // reddit/hn upvotes\n"
        "    comments?: number;\n"
        "    views?: number;              // twitter impressions\n"
        "  };\n"
        "\n"
        "  // Geo (GDELT lo da, twitter rara vez)\n"
        "  geo?: { country?: string; state?: string; city?: string; lat?: number; lon?: number };\n"
        "\n"
        "  // GDELT themes\n"
        "  themes?: string[];             // 'ENV_CLIMATE', 'TAX_FNCACT', ...\n"
        "  tone?: number;                 // GDELT tone -100..+100\n"
        "\n"
        "  // Dedup\n"
        "  content_hash?: string;         // SimHash 64-bit hex\n"
        "  embedding?: number[];          // vector 384-d (MiniLM) lazy\n"
        "\n"
        "  // Escape hatch\n"
        "  raw: Record<string, unknown>;  // payload original sin normalizar\n"
        "}",
        lang='typescript'))

    story.append(subsection_header('8.4 · Twitter Adapter con CloakBrowser'))
    story.append(body_p(
        'El adapter de Twitter es el más complejo por el login wall y el anti-bot. Estrategia: cookies exportadas '
        'manualmente de 3-5 cuentas, rotación round-robin, humanización encima de CloakBrowser (scroll + hover + '
        'pausas randomizadas). Paginación incremental con since_id (el tweet_id más alto) agregado al query.')),
    story.extend(code_block(
        "import { connect, type Browser } from 'cloakbrowser';\n"
        "import type { NormalizedMention, SourceAdapter } from '../types';\n"
        "\n"
        "export class TwitterAdapter implements SourceAdapter {\n"
        "  private browser: Browser | null = null;\n"
        "\n"
        "  constructor(private cookies: any[], private proxyPool: ProxyPool) {}\n"
        "\n"
        "  async fetch(params: { query: string; maxTweets?: number; sinceId?: string }): Promise<NormalizedMention[]> {\n"
        "    if (!this.browser) {\n"
        "      this.browser = await connect({\n"
        "        headless: true,\n"
        "        proxy: this.proxyPool.next(),\n"
        "        args: ['--disable-blink-features=AutomationControlled'],\n"
        "      });\n"
        "    }\n"
        "    const ctx = await this.browser.newContext({\n"
        "      userAgent: uaPool.next(),\n"
        "      viewport: { width: 1920, height: 1080 },\n"
        "      locale: 'en-US',\n"
        "      timezoneId: 'America/New_York',\n"
        "    });\n"
        "    await ctx.addCookies(this.cookies);\n"
        "    const page = await ctx.newPage();\n"
        "\n"
        "    const query = params.sinceId ? `${params.query} since:${params.sinceId}` : params.query;\n"
        "    await page.goto(`https://x.com/search?q=${encodeURIComponent(query)}&f=live`,\n"
        "                    { waitUntil: 'networkidle', timeout: 30000 });\n"
        "    await this.humanize(page);  // scroll + hover + pausas\n"
        "    await page.waitForSelector('article[data-testid=\"tweet\"]', { timeout: 15000 });\n"
        "\n"
        "    // Scroll incremental hasta coleccionar maxTweets\n"
        "    const collected: NormalizedMention[] = [];\n"
        "    let lastHeight = 0;\n"
        "    while (collected.length < (params.maxTweets ?? 50)) {\n"
        "      const tweets = await this.extractTweets(page);\n"
        "      for (const t of tweets) {\n"
        "        if (!collected.find(c => c.source_id === t.source_id)) {\n"
        "          collected.push(t);\n"
        "          if (collected.length >= (params.maxTweets ?? 50)) break;\n"
        "        }\n"
        "      }\n"
        "      await page.evaluate(() => window.scrollBy(0, 1500));\n"
        "      await sleep(1500 + Math.random() * 2000);\n"
        "      const h = await page.evaluate(() => document.body.scrollHeight);\n"
        "      if (h === lastHeight) break;\n"
        "      lastHeight = h;\n"
        "    }\n"
        "    await ctx.close();\n"
        "    return collected;\n"
        "  }",
        lang='typescript · TwitterAdapter (parte 1/2 — fetch principal)'))
    story.extend(code_block(
        "  // Humanización: scroll + hover + pausas randomizadas sobre CloakBrowser\n"
        "  private async humanize(page: Page) {\n"
        "    const rand = (min: number, max: number) => min + Math.random() * (max - min);\n"
        "    await page.mouse.move(rand(100, 1500), rand(100, 800));\n"
        "    await sleep(rand(200, 600));\n"
        "    for (let i = 0; i < rand(3, 7); i++) {\n"
        "      await page.mouse.wheel(0, rand(200, 800));\n"
        "      await sleep(rand(700, 2000));\n"
        "      if (Math.random() < 0.2) {\n"
        "        const els = await page.$$('a, article, [role=\"button\"]');\n"
        "        if (els.length) await els[Math.floor(Math.random() * els.length)].hover();\n"
        "        await sleep(rand(300, 900));\n"
        "      }\n"
        "    }\n"
        "  }\n"
        "\n"
        "  // Extracción de tweets desde el DOM via $$eval\n"
        "  private async extractTweets(page): Promise<NormalizedMention[]> {\n"
        "    return await page.$$eval('article[data-testid=\"tweet\"]', (arts) => {\n"
        "      return arts.map((a) => {\n"
        "        const link = a.querySelector('a[href*=\"/status/\"]') as HTMLAnchorElement;\n"
        "        const href = link?.href ?? '';\n"
        "        const idMatch = href.match(/status\\/(\\d+)/);\n"
        "        const text = a.querySelector('[data-testid=\"tweetText\"]')?.textContent ?? '';\n"
        "        const handle = a.querySelector('a[role=\"link\"] span')?.textContent ?? '';\n"
        "        const nums = (sel: string) => parseInt(\n"
        "          a.querySelector(sel)?.getAttribute('aria-label')?.replace(/\\D/g, '') ?? '0', 10);\n"
        "        return {\n"
        "          id: crypto.randomUUID(), source: 'twitter' as const,\n"
        "          source_id: idMatch?.[1] ?? '', url: href,\n"
        "          fetched_at: Date.now(), published_at: null,\n"
        "          type: 'post' as const, title: null, body: text, lang: null,\n"
        "          entities: {},\n"
        "          author: { handle: handle.replace('@', ''), name: null, id: null },\n"
        "          engagement: {\n"
        "            replies: nums('[data-testid=\"reply\"]'),\n"
        "            retweets: nums('[data-testid=\"retweet\"]'),\n"
        "            likes: nums('[data-testid=\"like\"]'),\n"
        "          },\n"
        "          raw: { html: a.outerHTML.slice(0, 5000) },\n"
        "        } as NormalizedMention;\n"
        "      });\n"
        "    });\n"
        "  }\n"
        "}",
        lang='typescript · TwitterAdapter (parte 2/2 — humanize + extractTweets)'))

    story.append(subsection_header('8.5 · GDELT Adapter — rate limit 1 req/5s'))
    story.append(body_p(
        'GDELT DOC 2.0 API devuelve artículos. Modo artlist para mentions, mode=timelinevol para volumen temporal. '
        'Sintaxis de query: ("climate change" OR "global warming") sourcecountry:US. Operadores: AND, OR, NOT, '
        'sourcecountry:, sourcelang:, domain:.'))
    story.extend(code_block(
        "const GDELT_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';\n"
        "\n"
        "export class GdeltAdapter implements SourceAdapter {\n"
        "  constructor(private rl: TokenBucket) {}  // rate limit 1 req / 5s\n"
        "\n"
        "  async fetch(params: { query: string; maxrecords?: number }): Promise<NormalizedMention[]> {\n"
        "    await this.rl.take('gdelt', 5000);  // VERIFICADO: 1 req/5s por IP\n"
        "    const u = new URL(GDELT_URL);\n"
        "    u.searchParams.set('query', params.query);\n"
        "    u.searchParams.set('mode', 'artlist');\n"
        "    u.searchParams.set('format', 'json');\n"
        "    u.searchParams.set('maxrecords', String(params.maxrecords ?? 250));\n"
        "    u.searchParams.set('sort', 'datedesc');\n"
        "\n"
        "    const res = await fetch(u.toString(), {\n"
        "      headers: { 'User-Agent': 'TerminalDeViralidad/0.1 (research)' },\n"
        "    });\n"
        "    if (!res.ok) throw new Error(`GDELT ${res.status}`);\n"
        "    const data = await res.json();\n"
        "\n"
        "    return (data.articles ?? []).map((a: any): NormalizedMention => ({\n"
        "      id: crypto.randomUUID(),\n"
        "      source: 'gdelt',\n"
        "      source_id: a.url,            // GDELT no tiene ID propio\n"
        "      url: a.url,\n"
        "      fetched_at: Date.now(),\n"
        "      published_at: parseGdeltDate(a.seendate),\n"
        "      type: 'article',\n"
        "      title: a.title,\n"
        "      body: a.title,               // GDELT DOC no da body\n"
        "      lang: a.language ?? null,\n"
        "      entities: { domains: [a.domain], urls: [a.url] },\n"
        "      author: { handle: null, name: a.domain, id: null },\n"
        "      geo: a.country ? { country: a.country } : undefined,\n"
        "      raw: a,\n"
        "    }));\n"
        "  }\n"
        "}",
        lang='typescript'))

    story.append(subsection_header('8.6 · Anti-ban strategy en 3 fases'))
    story.append(make_table(
        ['Capa', 'Gratis', 'Pago', 'Cuándo pagar'],
        [
            ['User-Agent rotation',         '✅ Libs: user-agents, fake-useragent',                '—',                              'Nunca'],
            ['Browser fingerprint rotation','✅ CloakBrowser ya lo hace',                          '—',                              'Nunca'],
            ['Human behavior (scroll/hover)','✅ Custom impl',                                     '—',                              'Nunca'],
            ['Request delays randomizados', '✅ Custom + jitter',                                  '—',                              'Nunca'],
            ['Proxies datacenter',          '✅ Listas gratis (frágiles)',                          '$50-100/mes BrightData',         'Casi nunca — datacenter no sirve para Twitter'],
            ['Proxies residenciales',       '❌ No hay gratis buenos',                              '$100-500/mes',                   'Cuando X/Reddit bloquean >5% de requests o escala >10K req/día'],
            ['Proxies mobile (4G/5G)',      '❌',                                                   '$300-1000/mes',                  'Solo si Twitter soft-banea sistemáticamente'],
            ['CAPTCHA solver',              '2captcha ~$1.5/1000',                                 'hCaptcha/Turnstile más caro',    'Cuando login flow ocasional requiere CAPTCHA'],
            ['Cookie/session farm',         '✅ Manual con 3-5 cuentas',                            'Agencias $20/cuenta',            'Cuando 1 sola cuenta se satura'],
        ],
        col_widths=[CONTENT_W*0.22, CONTENT_W*0.30, CONTENT_W*0.22, CONTENT_W*0.26]
    ))
    story.append(body_p(
        '<b>Fase 1 (MVP, gratis)</b>: CloakBrowser + UA rotation + 3 cookies exportadas manualmente + delays 3-8s '
        'random entre scrolls + sin proxies. Objetivo: ~500 tweets/día sin ban. <b>Fase 2 (producción baja)</b>: '
        'añadir proxies residenciales (BrightData pay-as-you-go ~$10/GB ≈ 10K requests) + cookie farm 10-20 cuentas '
        '+ circuit breaker que desactive cuenta ante 3 errores 429/403. Objetivo: 10K-50K tweets/día. <b>Fase 3 '
        '(escala)</b>: proxies mobile 4G rotating + cookie farm 50+ cuentas con perfiles distintos + solver externo. '
        'Objetivo: 100K+ tweets/día.'))

    story.append(subsection_header('8.7 · Deduplicación cross-fuente — 3 capas'))
    story.append(body_p(
        'Una misma noticia aparece en Twitter, Reddit, HN, GDELT con URLs distintas. Hay que dedup por contenido '
        'semántico, no por URL. Tres capas: SimHash (cheap blocking) → MinHash (confirmación Jaccard) → embeddings '
        'multilingües (cross-idioma y cross-dominio). Las capas son jerárquicas: solo se corre la capa N si la N-1 '
        'produjo candidatos.'))
    story.extend(code_block(
        "// Capa 1: SimHash 64-bit (cheap blocking, O(1) con LSH bucketing)\n"
        "// Umbral: Hamming distance ≤ 3 bits → candidato\n"
        "function simhash64(text: string): bigint {\n"
        "  const tokens = tokenize(text);  // lowercase, sin URLs/mentions/hashtags\n"
        "  const v = new Int32Array(64);   // weighted sum per bit\n"
        "  for (const tok of tokens) {\n"
        "    const h = fnv1a64(tok);\n"
        "    for (let i = 0; i < 64; i++) {\n"
        "      if (((h >> BigInt(i)) & 1n) === 1n) v[i]++;\n"
        "      else v[i]--;\n"
        "    }\n"
        "  }\n"
        "  let out = 0n;\n"
        "  for (let i = 0; i < 64; i++) if (v[i] > 0) out |= (1n << BigInt(i));\n"
        "  return out;\n"
        "}\n"
        "\n"
        "// Capa 2: MinHash + LSH (Jaccard similarity ≥ 0.6)\n"
        "// Sobre shingles de 3 caracteres o tokens. 128 perms, ~2KB por mention.\n"
        "\n"
        "// Capa 3: Embeddings multilingües (cross-idioma, cross-dominio)\n"
        "// Modelo: paraphrase-multilingual-MiniLM-L12-v2 (384-d, ~120MB, CPU <15ms)\n"
        "// Cosine similarity ≥ 0.78 → mismo tema aunque tweet en español y GDELT en inglés\n"
        "// Solo se corre para candidatos que pasaron capa 1 o 2 (lazy).",
        lang='typescript'))
    story.append(make_table(
        ['Parámetro', 'Valor recomendado', 'Justificación'],
        [
            ['SimHash Hamming threshold', '3',                  '99.6% sim, ~0.04% false positives'],
            ['Embedding cosine threshold','0.78 multilingüe',   '0.85 si todo es inglés'],
            ['MinHash Jaccard',           '0.6',                'Balance precision/recall para near-dup'],
            ['Longitud mínima de texto',  '40 caracteres',      'Evitar matches sobre "RT @user:"'],
        ],
        col_widths=[CONTENT_W*0.30, CONTENT_W*0.25, CONTENT_W*0.45]
    ))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════
    # CHAPTER 9 — ANTI-GAMING Y CROSS-VALIDATION
    # ═══════════════════════════════════════════════════════════════════════
    story.extend(chapter_header(9, 'Anti-Gaming y Cross-Validation', kicker_text='CAPÍTULO 09 · DETECCIÓN DE MANIPULACIÓN'))

    story.append(lead_p(
        'El penalty(trash) es el componente más importante del algoritmo. Sin él, el sistema replica manipulación de '
        'bots. Tres capas: heurísticas deterministas + Isolation Forest + GNN GraphSAGE (v1). Cross-validation '
        'bayesiana entre 5 fuentes con 5 categorías de legitimacy.'))

    story.append(subsection_header('9.1 · Taxonomía de amenazas'))
    story.append(make_table(
        ['Amenaza', 'Caso real', 'Detección'],
        [
            ['Bot campaign coordinado',         'Macedonios en 2016 US election',           'Isolation Forest + graph features'],
            ['Astroturfing',                    'Russia IRA, #WalkAway',                    'GNN GraphSAGE sobre grafo de interacción'],
            ['Manipulación pagada',             'Fyre Festival promo, influencers pagos',   'origin_quality bajo + sentiment uniformity'],
            ['Spam promocional',                'Crypto shill accounts',                    'URL ratio + hashtag stuffing classifier'],
            ['Recycled content',                'Fake news elections',                      'MinHash duplicate_ratio + media hash'],
            ['Hashtag hijacking',               '#MeToo hijack attempts',                   'Sentiment shift + comunidad outlier'],
            ['Coordinated inauthentic behavior','Twitter integrity reports',               'Cross-correlation temporal + clustering espectral'],
        ],
        col_widths=[CONTENT_W*0.28, CONTENT_W*0.32, CONTENT_W*0.40]
    ))

    story.append(subsection_header('9.2 · Penalty model en 3 capas'))
    story.append(body_p(
        'El penalty es un stack de tres capas que se combinan en un producto. Cada capa captura distintos modos de '
        'ataque, así evadir una no evada las otras.'))
    story.append(make_table(
        ['Capa', 'Método', 'Latencia', 'Re-entrenamiento', 'Precisión esperada'],
        [
            ['1 — Heurísticas',    '8 reglas deterministas sobre 21 features', '<5ms', 'Manual, on-demand', 'Alta (alta precision, baja recall)'],
            ['2 — Isolation Forest','Anomalía no supervisada sobre 21 features','<50ms','Semanal sobre narrativas legítimas','Media (captura outliers)'],
            ['3 — GNN GraphSAGE',  'Sobre grafo de interacción (cuentas+RT)',  '<200ms','Quincenal con labels de Twitter integrity','Alta (captura coordinación)'],
        ],
        col_widths=[CONTENT_W*0.18, CONTENT_W*0.34, CONTENT_W*0.13, CONTENT_W*0.18, CONTENT_W*0.17]
    ))
    story.append(body_p('<b>Capa 1 — Heurísticas deterministas</b> (rápidas, alta precision):'))
    story.extend(code_block(
        "def heuristic_trash_score(features):\n"
        "    flags = []\n"
        "    if features['new_account_ratio'] > 0.4: flags.append(('new_accounts', 0.3))\n"
        "    if features['synchronized_posting_ratio'] > 0.2: flags.append(('sync_posting', 0.4))\n"
        "    if features['duplicate_content_ratio'] > 0.3: flags.append(('dup_content', 0.4))\n"
        "    if features['network_density_among_posters'] > 0.7 \\\n"
        "       and features['louvain_cluster_concentration'] > 0.85:\n"
        "        flags.append(('coordinated_cluster', 0.5))\n"
        "    if features['sentiment_uniformity'] < 0.05 \\\n"
        "       and features['hashtag_jaccard_mean'] > 0.7:\n"
        "        flags.append(('copy_paste_campaign', 0.4))\n"
        "    if features['hour_of_day_uniformity'] < 0.1: flags.append(('non_human_cadence', 0.3))\n"
        "    if features['url_shortener_ratio'] > 0.5: flags.append(('spammy_urls', 0.2))\n"
        "    if features['media_hash_duplicate_ratio'] > 0.4: flags.append(('media_recycle', 0.3))\n"
        "    score = 1 - prod(1 - w for _, w in flags)  # 0=limpio, 1=basura\n"
        "    return min(score, 1.0), flags",
        lang='python'))
    story.append(body_p(
        '<b>Capa 2 — Isolation Forest</b>: anomalía no supervisada, ~50ms inference. Entrenado por semana sobre '
        'narrativas etiquetadas como legítimas. Score >0.7 → trash. Captura outliers que las heurísticas no codifican '
        'explícitamente. Requiere re-entrenamiento semanal porque los bots evolucionan.'))
    story.append(body_p(
        '<b>Capa 3 — GNN GraphSAGE</b> (v1): sobre grafo de interacción. Nodos = accounts, edges = menciones/retweets '
        'en ventana 6h. Etiquetas: cuentas confirmadas como bots por Twitter integrity reports (dataset público). '
        'Agregación a nivel narrativa. Re-entrenamiento quincenal. La combinación final:'))
    story.extend(code_block(
        "trash(n) = 0.4·heuristic + 0.3·isolation_forest + 0.3·gnn_aggregate",
        lang='formula'))
    story.append(make_table(
        ['trash score', 'Acción'],
        [
            ['< 0.3', 'Narrativa legítima, sin penalty'],
            ['0.3 - 0.6', 'Flag de atención (badge "anómalo" en UI)'],
            ['≥ 0.6',  'Ocultar del feed principal, cola de revisión'],
        ],
        col_widths=[CONTENT_W*0.30, CONTENT_W*0.70],
        mono_cols=[0]
    ))

    story.append(subsection_header('9.3 · Cross-validation matrix'))
    story.append(body_p(
        'Cada fuente tiene una latencia distinta respecto a Twitter y un nivel de confianza base distinto. La '
        'cross-validation bayesiana combina estas señales:'))
    story.append(make_table(
        ['Fuente', 'Latencia vs Twitter', 'Señal detectable', 'Confianza base', 'Peso Bayesian'],
        [
            ['Twitter API',     '0 (referencia)',          'Volumen, autores, sentimiento',           '0.5 (contaminable)', '0.3'],
            ['GDELT 2.0',       '1-24h antes',             'Prensa local/global, eventos geopol',     '0.85',               '0.3'],
            ['Reddit (nichos)', '2-48h antes',             'Discusión profunda, filtraciones',        '0.75',               '0.2'],
            ['Hacker News',     '6-48h antes',             'Tech, startups, seguridad',               '0.8',                '0.1'],
            ['Google Trends',   '1-12h antes',             'Interés de búsqueda general',             '0.6',                '0.1'],
        ],
        col_widths=[CONTENT_W*0.18, CONTENT_W*0.16, CONTENT_W*0.30, CONTENT_W*0.18, CONTENT_W*0.18]
    ))

    story.append(subsection_header('9.4 · Reglas de legitimacy'))
    story.append(body_p(
        'La combinación de fuentes detectadas + trash score produce 5 categorías de legitimacy. Estas categorías '
        'son la killer feature del producto: Twitter no te dice cuándo un trending está manipulado.'))
    story.extend(code_block(
        "def legitimacy(narrative):\n"
        "    s = sources_detected    # {twitter, gdelt, reddit, hn, g_trends}\n"
        "    trash = compute_trash(narrative)\n"
        "\n"
        "    if s.twitter and (s.gdelt or s.reddit) and trash < 0.4:\n"
        "        return 'LEGIT', 0.92           # Confirmado multi-fuente, alta confianza\n"
        "    if s.twitter and not (s.gdelt or s.reddit) and trash > 0.5:\n"
        "        return 'BOT_CAMPAIGN', 0.85    # Solo Twitter + alto trash = bots\n"
        "    if s.twitter and not (s.gdelt or s.reddit) and trash < 0.4:\n"
        "        return 'TWITTER_NATIVE', 0.55  # Solo Twitter pero limpio = rumor/meme\n"
        "    if (s.gdelt or s.reddit) and not s.twitter:\n"
        "        return 'PRE_BURST', 0.70       # GDELT/Reddit sin Twitter = PRE-BURST\n"
        "                                       # ★ esto es lo que queremos detectar ★\n"
        "    if not s.twitter and not s.gdelt and not s.reddit:\n"
        "        return 'NOISE', 0.2\n"
        "    return 'UNCERTAIN', 0.5",
        lang='python'))
    story.extend(callout_box(
        'CASO REAL — CAMBRIDGE ANALYTICA',
        'GDELT pickup desde diciembre 2015. Reddit esporádico 2016-2017. Twitter burst sólo en marzo 2018 tras '
        'Channel 4. Con cross-validation, el sistema habría detectado esto como PRE_BURST desde diciembre 2015 — '
        '<b>lead time posible >2 años</b>. Ninguna herramienta comercial detectó esto en tiempo real.',
        color=ACC_LIVE
    ))

    story.append(subsection_header('9.5 · Adversarial robustness'))
    story.append(body_p(
        'Los bots evolucionan para evadir las capas del penalty. Mitigaciones:'))
    story.append(bullet_p('<b>Randomizar ligeramente los umbrales τ por hora</b> — no dar información exacta a un atacante sobre qué lo dispara.'))
    story.append(bullet_p('<b>Auditoría periódica</b> — re-entrenar p<sub>1</sub> (bot_score) y p<sub>4</sub> (coordinated_behavior) cada 7 días para seguir el drift de tactics bot.'))
    story.append(bullet_p('<b>Ensemble diverso</b> — combinar Isolation Forest + Botometer + heurísticas. Evadir una capa no evada las otras.'))
    story.append(bullet_p('<b>PSI (Population Stability Index)</b> por feature, alerta si >0.25. KL divergence entre distribución de scores histórica vs rolling 24h. Re-entrenar cuando PSI >0.25 en ≥2 features.'))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════
    # CHAPTER 10 — UX/UI — TERMINAL DE BLOOMBERG MEETS LINEAR
    # ═══════════════════════════════════════════════════════════════════════
    story.extend(chapter_header(10, 'UX/UI — Terminal de Bloomberg meets Linear', kicker_text='CAPÍTULO 10 · SISTEMA DE DISEÑO'))

    story.append(lead_p(
        'Estética Bloomberg Terminal (densidad, multi-panel, mono-first) cruzada con Linear (cuidado tipográfico, '
        'microinteracciones sutiles, keyboard-first). Fondo #0A0E14, color 100% semántico por fase, reactbytes '
        'reservado para momentos cognitivos. Keyboard-first con shortcuts vim (j/k/enter/g/s/c/f/r/m/?).'))

    story.append(subsection_header('10.1 · Sistema de diseño — paleta completa'))
    story.append(body_p(
        'Veinticuatro tokens de color con hex exactos. Backgrounds, borders, texto, acentos por fase, funcionales. '
        'Cada color tiene un rol semántico, no estético. Jamás usar #2DD4BF para un estado que no sea rising.'))
    story.append(make_table(
        ['Token', 'Hex', 'Uso'],
        [
            ['bg.base',       '#0A0E14', 'Fondo raíz'],
            ['bg.elevated',   '#0D1117', 'Paneles nivel 1'],
            ['bg.panel',      '#11161D', 'Paneles nivel 2'],
            ['bg.hover',      '#161B22', 'Hover de fila/celda'],
            ['bg.active',     '#1C2128', 'Selección, table header'],
            ['bg.inset',      '#070A0F', 'Inputs, code blocks'],
            ['border.subtle', '#1F2937', 'Bordes pasivos'],
            ['border.default','#21262D', 'Separadores entre paneles'],
            ['border.strong', '#30363D', 'Bordes de panel activo'],
            ['border.focus',  '#5EEAD4', 'Focus ring (con alpha 40%)'],
            ['text.primary',  '#E6EDF3', 'Títulos, números clave (15.4:1 AAA)'],
            ['text.secondary','#94A3B8', 'Labels, metadata (5.1:1 AA)'],
            ['text.tertiary', '#7D8590', 'Hints, placeholders'],
            ['text.disabled', '#484F58', 'Disabled'],
        ],
        col_widths=[CONTENT_W*0.25, CONTENT_W*0.20, CONTENT_W*0.55],
        mono_cols=[0, 1]
    ))
    story.append(make_table(
        ['Fase / Función', 'Token', 'Hex primario', 'Glow (con alpha)'],
        [
            ['Formándose',   'amber',  '#FBBF24', '#FBBF2433'],
            ['Creciente',    'teal',   '#2DD4BF', '#5EEAD440'],
            ['Formada',      'slate',  '#94A3B8', '—'],
            ['Decaída',      'rose',   '#F87171', '#F8717130'],
            ['Live',         'live',   '#00FF9F', '#00FF9F66'],
            ['Link',         'link',   '#58A6FF', '—'],
            ['Warning',      'warn',   '#F59E0B', '—'],
            ['Danger',       'danger', '#EF4444', '—'],
        ],
        col_widths=[CONTENT_W*0.22, CONTENT_W*0.18, CONTENT_W*0.30, CONTENT_W*0.30],
        mono_cols=[1, 2, 3]
    ))

    story.append(subsection_header('10.2 · Tipografía'))
    story.append(body_p(
        'Dos familias: mono para datos, sans para prosa. Nunca mezcladas en la misma jerarquía. Mono para scores, '
        'timestamps, IDs, ticker, code. Sans para descripciones, captions, copy de UI.'))
    story.append(make_table(
        ['Familia', 'Uso', 'Escala'],
        [
            ['Mono (JetBrains Mono / IBM Plex Mono fallback)',
             'Datos, scores, IDs, timestamps, ticker, code',
             'xs 10 / sm 11 / base 12 / md 13 / lg 15 / xl 18 / 2xl 24 px'],
            ['Sans (Inter / Geist Sans fallback)',
             'Descripciones, captions, copy UI, prosa',
             'xs 11 / sm 12 / base 13 / md 14 / lg 16 / xl 20 px'],
        ],
        col_widths=[CONTENT_W*0.30, CONTENT_W*0.35, CONTENT_W*0.35]
    ))
    story.append(body_p(
        'Letter-spacing: mono en -0.01em para datos tabulares (alinea mejor); sans en 0 default, -0.011em para '
        'títulos grandes. Spacing grid de 4px. Padding interno de paneles: 12px (densidad Bloomberg). Radius pequeño '
        'deliberado (default 4px) — refuerza el feel terminal, evita parecer SaaS genérico.'))

    story.append(subsection_header('10.3 · Layout de 5 paneles'))
    story.extend(ascii_diagram(
        "┌───────────────────────────────────────────────────────────────────────────┐\n"
        "│ ▮ LIVE  ●TAYLOR-SWIFT 8,432 ▲2.3%  ◆AI-LAWS 4,118 ▲0.4%  ▽FTX-2.0 ...   │ 36px ticker\n"
        "├─────────────────┬─────────────────────────────────────────┬───────────────┤\n"
        "│ NARRATIVES  ⌕ / │  #TAYLOR-SWIFT-ERAS              ▲ RISING│ LIVE MENTIONS│\n"
        "│ sort: sigma ▾   │  score 8,432  vel 142/min  σ 1.8       │ ▮ stream  142 │\n"
        "│ ─────────────── │  ─────────────────────────────────────  │ ────────────  │\n"
        "│ ▲▲ TAYLOR-SWIFT │  TIMELINE  24h                          │ @musiccrtx    │\n"
        "│    8,432  ▲2.3% │   ▁▂▃▅▇█▇▆▄▃▂▁▁▂▃▄▅▆▇▇█▆▅▄▃▂▁         │ \"...\"  2s 142♥│\n"
        "│ ─────────────── │   00  06  12  18  24                   │ ────────────  │\n"
        "│ ▲  ETH-MERGE    │                                         │ @billboard    │\n"
        "│    6,221  ▲8.1% │  KEY ACCOUNTS   KEY TWEETS              │ \"...\"  5s  89♥│\n"
        "│ ─────────────── │  @musiccrtx 92  [orig] \"Taylor annou…\"  │ ────────────  │\n"
        "│ ◆  AI-LAWS      │  @billboard  88  [ampl] \"@musiccrtx …\"  │ @rollingstd   │\n"
        "│    4,118  ◇0.4% │  @rollingstd 85  [deriv] meme thread    │ ▮typing...    │\n"
        "│ ─────────────── │                                         │               │\n"
        "│ ▽  FTX-2.0      │  PEAK 2024-11-04 14:32 UTC              │               │\n"
        "│    1,902  ▽3.2% │  DECAY PROJ  +6h  LIVED 4h12m           │               │\n"
        "├─────────────────┴─────────────────────────────────────────┴───────────────┤\n"
        "│ ACCEL ▮▮▮▮▮▮▮▮░░░░  top-10 velocity strip  ▁▂▃▅▇▆▄▃  ▁▂▅▇█▇▅  ▁▃▅▇▆▄▂▁  │ 80px\n"
        "├───────────────────────────────────────────────────────────────────────────┤\n"
        "│  j/k navigate · /search · enter open · s star · g graph · c compare · ?   │ 24px\n"
        "└───────────────────────────────────────────────────────────────────────────┘\n"
        "   320px (22%)        flex (≈56%)                          360px (25%)",
        caption_text='Wireframe 10.1 — Terminal default con 5 paneles (1440×900)'
    ))
    story.append(body_p(
        'Jerarquía visual para evitar abrumar: (1) fila activa tiene borde teal 2px + glow sutil — es el foco '
        'atencional; (2) ticker tiene opacidad 0.85 por defecto, full opacity solo al hover — periférico; (3) stream '
        'derecho usa tipografía 11px y opacidad 0.9 → baja prioridad atencional; (4) accel strip decorativo-periférico '
        'con opacidad 0.7; (5) hint bar opacidad 0.5 — casi invisible hasta que el usuario lo necesita.'))

    story.append(subsection_header('10.4 · Visualización de las 4 fases'))
    story.append(make_table(
        ['Fase',         'Color',  'Icono', 'Animación',                                                  'Badge'],
        [
            ['Formándose', '#FBBF24','◇',    'Pulse lento 2.4s ease-in-out; glow tenue borde izq',         '◇ FORMING σ0.9'],
            ['Creciente',  '#2DD4BF','▲',    'Score glitch 1 frame al cambio >5%; byte-stream en burst',  '▲ RISING +1.8σ'],
            ['Formada',    '#94A3B8','●',    'Sin animación (quieto); marca temporal de pico fija',         '● PEAKED 14:32'],
            ['Decaída',    '#F87171','▽',    'Opacidad 1→0.85; borde dashed 1px; strike-through sutil',     '▽ DECAYING -3.2%/h'],
        ],
        col_widths=[CONTENT_W*0.16, CONTENT_W*0.12, CONTENT_W*0.08, CONTENT_W*0.40, CONTENT_W*0.24],
        mono_cols=[1, 2]
    ))
    story.append(body_p(
        'Regla semántica de color: jamás usar #2DD4BF para un estado que no sea rising. Jamás usar #F87171 para algo '
        'que no sea decay. Los funcionales (error, warning, info) usan hex distintos (#EF4444, #F59E0B, #38BDF8) para '
        'no contaminar el significado de fase. Transiciones de fase animadas con framer-motion cross-fade 240ms.'))

    story.append(subsection_header('10.5 · Real-time UX — reglas de actualización'))
    story.append(make_table(
        ['Evento', 'Cadencia', 'Acción UI'],
        [
            ['Nueva mención individual',  'push SSE',     'Inserta al top del right panel con typewriter 60cps; si panel lleno (>50 items), elimina último con fade-out 180ms'],
            ['Cambio de score ≤5%',       'push SSE',     'Count-up animado del número (200ms ease-out), tinte efímero teal/rose'],
            ['Cambio de score >5%',       'push SSE',     'Count-up + glitch 1 frame (reactbytes) en el número'],
            ['Burst event (>20% / CUSUM)','push SSE',     'Byte-stream particle burst 800ms sobre la fila + sonido blip (si activo)'],
            ['Cambio de fase',            'push SSE',     'Cross-fade del PhaseBadge 240ms + borde izquierdo recolorea'],
            ['Nuevo narrative (top-K)',   'push SSE',     'Inserta al top de left panel con slide-down 12px + fade-in'],
            ['Ticker refresh',            'throttle 1s',  'Reordena y actualiza deltas'],
        ],
        col_widths=[CONTENT_W*0.26, CONTENT_W*0.16, CONTENT_W*0.58]
    ))
    story.append(body_p(
        'Throttle y debounce: right panel menciones batch en ventanas de 100ms vía requestAnimationFrame (si llegan '
        '30 menciones en 100ms, se insertan como bloque con stagger 16ms entre cada una — evita el "tsunami" visual). '
        'Left panel re-sort throttle 1s con reordenamiento animado via framer-motion layout (spring stiffness 300, '
        'damping 30). Ticker throttle 1s. Charts re-render throttle 500ms. Pausa inteligente con visibilitychange: '
        'si document.hidden, stream.pause() + buffer.accumulate(); al volver, pinta los últimos 50 items sin animación.'))

    story.append(subsection_header('10.6 · reactbytes y typewriter — dónde usar y dónde NO'))
    story.append(make_table(
        ['Momento', 'Lib/reactbytes API', 'Intensidad', 'Duración'],
        [
            ['Boot sequence',                          '<Typewriter text={welcomeSeq} speed={12} />',  'alta',   '3-5s'],
            ['Nueva mención en stream',                '<Typewriter text={mention.text} speed={60} />','media',  '0.4-1.2s'],
            ['Score glitch en burst >5%',              '<Glitch text={score} intensity="subtle" />',   'baja',   '120ms'],
            ['Byte-stream en burst >20%',              '<ByteStream particles={32} />',                'alta',   '800ms'],
            ['Search overlay placeholder',             '<Typewriter text="search narratives…" />',     'baja',   'cíclico'],
            ['Connection lost retry',                  '<Typewriter text="retrying in 3…2…1" />',      'media',  '3s'],
            ['Fase resurrection (rose→teal)',          '<ByteStream particles={48} accent="teal" />',  'alta',   '1000ms'],
        ],
        col_widths=[CONTENT_W*0.30, CONTENT_W*0.40, CONTENT_W*0.13, CONTENT_W*0.17]
    ))
    story.append(body_p(
        '<b>Anti-patrones — dónde NO usar reactbytes</b>: (1) hover states — rompe el feel de "instrumento serio"; '
        '(2) charts/sparklines — compite con la data; (3) panel headers, ticker, left list rows — son scanneables, no '
        'narrativos; (4) cada keystroke en inputs — performance killer; (5) más de 2 instancias simultáneas — mata el '
        'efecto (cognitivamente saturante); (6) tooltips — deben aparecer instantáneamente; (7) empty states — mejor '
        'ASCII art estático que typewriter lento.'))

    story.append(subsection_header('10.7 · Charts y visualizaciones'))
    story.append(make_table(
        ['Chart', 'Dónde', 'Librería', 'Notas'],
        [
            ['Sparkline (60×16px)',           'fila de narrative list',    'custom SVG',        'Sin librería, path stroke 1.5px, área fill alpha 0.1'],
            ['Velocity area chart',           'detail timeline',           'visx @visx/shape',  'Brush para zoom, marcadores de burst (CUSUM) y dips'],
            ['Lifecycle track',               'detail top',                'custom SVG',        '4 nodos (◇●○○) con línea conectora, marca temporal animada'],
            ['Heatmap (24h × 7d)',            'detail activity by time',   'custom SVG grid',   'Celdas 12×12px, color ramp slate→teal→amber según densidad'],
            ['Network graph',                 'graph view (g)',            'react-force-graph-2d','Nodos=accounts, edges=retweets. Cluster coloreado'],
            ['Phase transition matrix',       'compare view',              'custom SVG',        'Tracks horizontales con 4 nodos por narrative'],
            ['Overlaid velocity curves',      'compare view',              'visx',              '4 series con stroke dashed/solid/dotted'],
            ['Acceleration strip',            'bottom bar (80px)',         'custom SVG',        '10 sparklines en fila, una por top-10 narrative'],
        ],
        col_widths=[CONTENT_W*0.22, CONTENT_W*0.22, CONTENT_W*0.22, CONTENT_W*0.34]
    ))
    story.append(body_p(
        'Por qué visx y no Recharts/Nivo/D3 puro: visx (Airbnb) es componible, primitives low-level, no asume layout '
        '→ encaja con filosofía multi-panel custom. Tree-shakeable. React-first. Recharts asume layout de chart '
        'standalone (con padding, legend) — no encaja en paneles densos de 320px. Nivo bundle grande, estética default '
        'muy "SaaS". D3 puro demasiado imperative, sucio en React 19 con effects.'))

    story.append(subsection_header('10.8 · Cuatro flujos de usuario principales'))
    story.append(body_p('<b>Flujo 1 — Descubrir narrativa emergente</b> (objetivo: encontrar una narrativa antes del burst):'))
    story.extend(code_block(
        "[boot 3s] → [terminal default]\n"
        "   ↓ user mira left panel sorted by σ(burst)\n"
        "[ve ◇ FORMING con σ saltando 0.4→0.9]\n"
        "   ↓ j/k para navegar, hover muestra mini-sparkline\n"
        "[enter] → [detail expandido en center]\n"
        "   ↓ ve timeline mostrando inflection point en últimos 30min\n"
        "[confirmado early signal]\n"
        "   ↓ s (star/subscribe)\n"
        "[recibe alerta futura cuando phase → rising]\n"
        "   ↓ g (graph view)\n"
        "[ve network graph, identifica amplificadores clave]\n"
        "   ↓ opcional: c (compare con narrativa similar pasada)\n"
        "[ve overlaid curves, decide si actuar]",
        lang='flow'))
    story.append(body_p('<b>Flujo 2 — Monitorear narrativa activa</b> (tracking en vivo de narrativa starred):'))
    story.extend(code_block(
        "[user tiene 3 narrativas starred, visibles en ticker]\n"
        "   ↓ tab para ciclar entre starred en center panel\n"
        "[ve detail de narrativa activa, stream derecho fluye]\n"
        "   ↓ score cambia >5%\n"
        "[glitch en el número, byte-stream si >20%]\n"
        "   ↓ user hace click en burst moment en timeline\n"
        "[chart rewind a ese instante, muestra tweets del burst]\n"
        "   ↓ hover sobre tweet → tooltip con full context\n"
        "[opcional: click → abre original en nueva tab]",
        lang='flow'))
    story.append(body_p('<b>Flujo 3 — Explorar narrativa decaída</b> (entender por qué decayó, detectar resurrection):'))
    story.extend(code_block(
        "[f para abrir filter overlay]\n"
        "   ↓ selecciona phase=decaying, sort by peak_time desc\n"
        "[lista reordena, muestra narrativas decayed recientes]\n"
        "   ↓ enter en una\n"
        "[ve detail con lifecycle track completo + decay projection]\n"
        "   ↓ r (resurrection probability)\n"
        "[badge \"RESURRECTION 12% (σ re-emerging 0.3)\"]\n"
        "   ↓ si probabilidad >20%, banner sutil \"watch this\"",
        lang='flow'))
    story.append(body_p('<b>Flujo 4 — Comparar narrativas</b> (benchmarking entre 2-4 narrativas):'))
    story.extend(code_block(
        "[desde cualquier narrative, presiona c]\n"
        "[narrative añadida a compare tray (max 4)]\n"
        "   ↓ repite con 2-3 más\n"
        "[enter sobre el tray]\n"
        "   ↓ [vista 3: comparativa full screen]\n"
        "[ve tabla lado a lado + overlaid curves + phase matrix + cross-correlation]\n"
        "   ↓ descubre ρ alta con lag → \"ETH follows TAYLOR by 12min\"\n"
        "[insight accionable: usar TAYLOR como leading indicator para ETH]",
        lang='flow'))

    story.append(subsection_header('10.9 · Keyboard-first — shortcuts vim'))
    story.append(make_table(
        ['Key',       'Acción',                                'Key',          'Acción'],
        [
            ['j / ↓',     'siguiente narrative',                  's',            'star/subscribe'],
            ['k / ↑',     'anterior narrative',                   'g',            'graph view'],
            ['enter',     'abrir detail',                         'c',            'add to compare'],
            ['esc',       'cerrar overlay / detail',              'f',            'filter overlay'],
            ['/',         'abrir search (cmdk)',                  'r',            'resurrection probability (en decaying)'],
            ['tab',       'ciclar starred narratives',            'm',            'toggle sound'],
            ['Shift+Tab', 'reverse cycle',                        '?',            'help overlay'],
        ],
        col_widths=[CONTENT_W*0.15, CONTENT_W*0.35, CONTENT_W*0.15, CONTENT_W*0.35],
        mono_cols=[0, 2]
    ))

    story.append(subsection_header('10.10 · Anti-patrones (lo que NO haremos)'))
    story.append(bullet_p('<b>No glassmorphism ni blur</b>. La terminal es opaca. El blur consume GPU, resta contraste y comunica "SaaS genérico". Bordes de 1px sólidos dan toda la jerarquía.'))
    story.append(bullet_p('<b>No card-based dashboard genérico</b>. Prohibido el grid de cards flotantes con shadow. Los paneles comparten bordes (1px #21262D), no hay padding alrededor del layout. Es Bloomberg, no Notion.'))
    story.append(bullet_p('<b>No gradientes decorativos</b>. El único gradiente permitido es el área fill de un chart (alpha 0.1 del accent). Prohibido gradientes en backgrounds, botones, badges.'))
    story.append(bullet_p('<b>No animaciones de carga largas (>1s)</b>. Skeleton inmediato desde el primer frame. El boot typewriter es la única excepción (3-5s) y es opcional (skip con cualquier tecla).'))
    story.append(bullet_p('<b>No modales centrados intrusivos</b>. Los overlays son laterales (slide from right) o inline expansion. Único modal centrado: search cmdk.'))
    story.append(bullet_p('<b>No dark/light toggle</b>. La terminal es dark-only por definición conceptual. Agregar un toggle rompe la metáfora.'))
    story.append(bullet_p('<b>No emoji como iconos</b>. Los iconos son símbolos mono: ▲ ▽ ◇ ● ◆ ▮. Unicode puro, render consistente.'))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════
    # CHAPTER 11 — ROADMAP, MÉTRICAS Y RIESGOS
    # ═══════════════════════════════════════════════════════════════════════
    story.extend(chapter_header(11, 'Roadmap, Métricas y Riesgos', kicker_text='CAPÍTULO 11 · EJECUCIÓN Y GOBERNANZA'))

    story.append(lead_p(
        'Roadmap en 3 fases: MVP 4 semanas (demostrar lead time), v1 3 meses (anti-gaming serio y multi-rol), '
        'v2 6 meses (intelligence platform). North Star metric: lead time accionable medio. Tabla de riesgos con '
        'mitigaciones. Compliance posture: hashing SHA-256 con salt rotatorio, opt-out, bot badge con disclaimer.'))

    story.append(subsection_header('11.1 · Roadmap — 3 fases'))
    story.append(make_table(
        ['Fase', 'Timeline', 'Objetivo', 'Features clave', 'No entra'],
        [
            ['MVP',  'Semanas 1-4',
             'Demostrar lead time',
             'Ingest 3 fuentes (Twitter+GDELT+Reddit), scoring simple (v,a,H), 4 fases, heurísticas anti-gaming capa 1 (8 reglas), dashboard web, 1 workflow (OSINT), alertas email+webhook',
             'GNN, multi-rol, integraciones exchange, multi-idioma profundo'],
            ['v1',   'Meses 2-3',
             'Anti-gaming serio + multi-rol',
             'Isolation Forest + GNN GraphSAGE, cross-validation bayesiana completa (5 fuentes), 5 dashboards multi-rol, origin quality completo, alertas multi-canal (Slack/Teams/Discord/SMS), API pública, pricing tiers',
             'Multi-idioma profundo, predictive modeling'],
            ['v2',   'Meses 4-6',
             'Intelligence platform',
             'Multi-idioma (ES/EN/PT/FR/DE/RU/ZH), Telegram/BlueSky/Mastodon ingestion, predictive modeling LSTM/Transformer, anomaly discovery sobre embedding space, graph exploration UI (Maltego-like), marketplace de watchlists, white-label para agencias',
             '—'],
        ],
        col_widths=[CONTENT_W*0.07, CONTENT_W*0.13, CONTENT_W*0.20, CONTENT_W*0.40, CONTENT_W*0.20]
    ))

    story.append(subsection_header('11.2 · Métricas North Star y KPIs por versión'))
    story.append(body_p(
        'La métrica rectora del producto es el <b>lead time accionable medio</b>: tiempo entre nuestra alerta de '
        'narrativa emergente y el burst público en Twitter Trending, ponderado por precision. Si sube, ganamos. '
        'Si baja, somos un clon caro de Twitter Trending.'))
    story.append(make_table(
        ['Métrica', 'Definición', 'Target MVP', 'Target v1', 'Target v2'],
        [
            ['Lead time accionable medio',
             'Tiempo entre detección forming y peak público, ponderado por precision',
             '>1h en 50% casos', '>3h en 70%', '>6h en 80%'],
            ['Precision@k (LEGIT)',
             'De LEGIT, cuántas reales',
             '>0.80', '>0.90', '>0.93'],
            ['Recall (BOT_CAMPAIGN)',
             'De bots removidos por Twitter, cuántos detectamos antes',
             'n/a', '>0.60', '>0.75'],
            ['False-positive bot rate',
             'Cuentas legítimas marcadas como bot',
             '<5%', '<2%', '<1%'],
            ['NPS por rol',
             'Net promoter score (periodista, trader, marca, OSINT, político)',
             '—', '>40', '>55'],
            ['Daily Active Watchlists',
             'Watchlists activas/día',
             '—', '>500', '>5000'],
            ['Time-to-insight',
             'Tiempo desde abrir dashboard hasta acción',
             '<5 min', '<2 min', '<1 min'],
            ['Conversion free → pro',
             '% que pasa a pro',
             '—', '>5%', '>10%'],
            ['Churn mensual',
             '% pro que cancelan',
             '—', '<5%', '<3%'],
        ],
        col_widths=[CONTENT_W*0.22, CONTENT_W*0.38, CONTENT_W*0.13, CONTENT_W*0.13, CONTENT_W*0.14],
        mono_cols=[2, 3, 4]
    ))

    story.append(subsection_header('11.3 · Tabla de riesgos y mitigaciones'))
    story.append(make_table(
        ['#', 'Riesgo', 'Prob', 'Impacto', 'Mitigación'],
        [
            ['1', 'Ban masivo de Twitter por detección de patrón de scraping',
             'Alta', 'Crítico',
             'Rotación proxies residenciales, 10 sesiones con fingerprints distintos (CloakBrowser stealth=2), delays jitter 5-15s, max 20 req/min, circuit breaker 5 fails → 60s cooldown. Fallback a Nitter si Twitter cae'],
            ['2', 'Cluster spam: campaña coordinada genera narrativa falsa de alto score',
             'Media', 'Alto',
             'trash_penalty con 5 sub-factores multiplicativos: ratio autores nuevos >70% en 1h → -0.3; bot_score >0.6 → -0.4; cosine >0.95 (copypasta) → -0.5. Validación humana opcional con flag_for_review cuando score >70 pero trash_penalty <0.6'],
            ['3', 'Latencia de embeddings dispara watermark >35s',
             'Media', 'Medio',
             'Sidecar Python con modelo ONNX-quantizado, batch de 50, GPU opcional (T4). Cache LRU de embeddings por hash de contenido. Si p95 >3s → reducir ventana tier-2 a 200 mentions o activar modo GPU'],
            ['4', 'Drift del modelo de clustering: embeddings pierden relevancia con nueva jerga',
             'Baja', 'Medio',
             'Re-entrenar/re-evaluar quarterly con dataset etiquetado (200 narrativas/mes muestreo humano). Métrica: ARI entre clusters viejos vs nuevos >0.7. Swap a bge-m3 si drift >30%'],
            ['5', 'Límite de conexiones SSE en single Node process',
             'Media', 'Medio',
             'Default Node = 1K sockets. Con keepAliveTimeout + maxConnections tuneado llegamos a 2-3K. Si >5K usuarios concurrentes → sticky sessions + N instancias detrás de LB (Redis Streams fan-out)'],
            ['6', 'Postgres bloat por alta inserción en mentions',
             'Media', 'Alto',
             'Particionado mensual + DROP PARTITION para retención 90d. Autovacuum agresivo (scale_factor=0.05). BRIN en vez de B-tree para timestamps. mentions no se UPDATEA. pg_repack mensual'],
            ['7', 'GDELT lag: actualiza cada 15min, a veces tarda 2h',
             'Alta', 'Bajo',
             'No bloquear pipeline por GDELT. Marcar menciones GDELT con freshness_penalty. UI muestra "delayed source" badge para GDELT vs Twitter/Reddit real-time'],
            ['8', 'CloakBrowser 0.5.2 desactualizado o cambios en DOM de Twitter',
             'Media', 'Alto',
             'Pin en Dockerfile, tests E2E nightly que validan selector article[data-testid="tweet"]. Circuit breaker detecta 0 resultados en N requests → alerta PagerDuty → fallback a API no-oficial o Nitter'],
            ['9', 'Reddit OAuth2 cambia pricing (estilo 2023)',
             'Media', 'Alto',
             'Abstracción lista para swap a pushshift.io alternatives (rar.md, arctic-shift), RSS como último recurso'],
            ['10', 'GDPR / privacy concerns por author data',
             'Media', 'Alto',
             'Hashing SHA-256 con salt rotatorio mensual (no reversible, no PII bajo GDPR Art.4). Author handle solo 30d en Redis. Opt-out público. Documento compliance posture'],
        ],
        col_widths=[CONTENT_W*0.04, CONTENT_W*0.26, CONTENT_W*0.08, CONTENT_W*0.10, CONTENT_W*0.52],
        mono_cols=[0, 2, 3]
    ))

    story.append(subsection_header('11.4 · Ética y legalidad'))
    story.append(body_p(
        'El scraping de Twitter está prohibido por los ToS de X Corp. La Terminal de Viralidad lo hace igual porque: '
        '(a) no redistribuye contenido, solo métricas y links; (b) no compite con la API oficial (caso de uso '
        'distinto); (c) el scraping de datos públicos para análisis ha sido sostenido en hiQ Labs vs LinkedIn (US 9th '
        'Circuit 2022). Sin embargo, el riesgo legal existe y se documenta en el "compliance posture" interno.'))
    story.append(body_p(
        'GDPR: los datos de cuentas de usuario son personales en UE. Mitigaciones: hashing SHA-256 con salt rotatorio '
        'mensual (no reversible, no es PII bajo Art. 4); author handle display solo 30 días en Redis (no en Postgres); '
        'opt-out público via página dedicada; reputation se computa agregado, no se guarda per-author PII. Bot badge '
        'con disclaimer explícito: "modelo probabilístico, no afirmación de hecho" — para evitar demandas por '
        'difamación en false-positives.'))
    story.append(body_p(
        'TOS restrictivos contra surveillance estatal no-democrática. Auditoría de sesgos trimestral por idioma y '
        'tipo de cuenta (el modelo anti-gaming puede tener falsos positivos contra cuentas minoritarias o no-inglés). '
        'Rate-limit + human-in-the-loop: ninguna acción automática contra cuentas. Transparencia metodológica: paper '
        'técnico público. DPA/DPIA GDPR + DPO si >UE users.'))

    story.append(subsection_header('11.5 · Modelo de negocio'))
    story.append(make_table(
        ['Tier', 'Precio', 'Features', 'Target'],
        [
            ['Free',      '$0',           '5 alertas/día, 1 watchlist, dashboard básico, solo Twitter+GDELT', 'Lead magnet, capturar PMF'],
            ['Pro',       '$49-199/mes',  'Multi-rol (5 dashboards), alertas ilimitadas, 5 fuentes, Slack/Teams webhook, API read-only', 'Periodistas, traders indie, OSINT freelance'],
            ['Team',      '$499-999/mes', '5 seats pro, watchlists compartidas, API read-write, SSO, export CSV/JSON', 'Boutiques de inteligencia, newsrooms pequeños'],
            ['Enterprise','$1000+/mes',   'White-label, SLA 99.9%, on-prem option, custom sources, dedicated support, DPA', 'Agencias, gobiernos democráticos, enterprises'],
        ],
        col_widths=[CONTENT_W*0.15, CONTENT_W*0.17, CONTENT_W*0.45, CONTENT_W*0.23]
    ))
    story.append(body_p(
        'El precio se justifica no por la cantidad de datos sino por el lead time accionable: si un trader promedio '
        'genera $500 por operación con 2h de anticipación, cualquier precio menor a eso es obvio. Si un periodista '
        'publica una exclusiva 24h antes que la competencia, el valor generado supera cualquier suscripción mensual. '
        'Si una marca detecta una crisis 6h antes y reduce MTTR 50%, el ahorro supera $10K. La pricing está alineada '
        'con valor entregado, no con costo de provisión.'))

    story.append(subsection_header('11.6 · Cierre'))
    story.extend(callout_box(
        'NORTE ESTRATÉGICO FINAL',
        'Sin la combinación de <b>lead time + legitimacy badge + cross-source attribution</b>, el producto es un clon '
        'caro de Twitter Trending. Con esos tres diferenciadores juntos, es una herramienta de intelligence con lead '
        'time accionable para cinco ICPs distintos. El algoritmo desdoblado Vel×Mat×Pen×Decay con HMM de 4 fases y '
        'CUSUM+Kleinberg para bursts, combinado con cross-validation bayesiana entre 5 fuentes y penalty multiplicativo '
        'de 5 sub-factores, es la receta técnica que sostiene esa promesa de valor. El MVP en 4 semanas demuestra el '
        'lead time; v1 en 3 meses cierra anti-gaming y multi-rol; v2 en 6 meses es intelligence platform.',
        color=ACC_RISING
    ))
    story.append(body_p(
        'La terminal se construye ahora. Los cinco agentes especialistas alinearon arquitectura, algoritmo, UX/UI, '
        'fuentes y estrategia. El siguiente paso es el MVP: 4 semanas, 3 fuentes, 1 ICP (OSINT), demostrar que '
        'detectamos narrativas emergentes 1+ hora antes que Twitter Trending. Si lo logramos, el resto del roadmap '
        'se ejecuta con data real, no con hipótesis.'))

    return story


if __name__ == '__main__':
    print("This module is imported by generate_pdf.py — use that script to build the PDF.")
