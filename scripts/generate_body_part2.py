#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Contenido del body PDF — 11 secciones
"""

# This module is imported by generate_pdf.py — it exposes build_story() which returns
# the list of Flowables for the body PDF.

from generate_body_part1 import (
    # styles
    h1, h1_kicker, h2, h3, h4, body, body_indent, lead, bullet, code, caption,
    callout, th, th_c, td, td_c, td_mono, toc_h1, toc_h2,
    # palette
    BG_BASE, BG_ELEVATED, BG_PANEL, BG_HOVER, BG_ACTIVE, BG_INSET,
    BORDER_SUBTLE, BORDER_DEFAULT, BORDER_STRONG, BORDER_FOCUS,
    TEXT_PRIMARY, TEXT_SECONDARY, TEXT_TERTIARY, TEXT_DISABLED,
    ACC_FORMING, ACC_RISING, ACC_PEAKED, ACC_DECAY, ACC_LIVE,
    LINK_BLUE, WARN_AMBER, DANGER_RED,
    # geometry
    CONTENT_W, CONTENT_H, PAGE_W, PAGE_H, MARGIN_L, MARGIN_R, MARGIN_T, MARGIN_B,
    # helpers
    add_heading, chapter_header, section_header, subsection_header,
    body_p, lead_p, bullet_p, code_block, callout_box, make_table,
    ascii_diagram, safe_keep_together,
    # reportlab
    Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether,
    CondPageBreak, HRFlowable, Preformatted, TableOfContents,
)

def build_story():
    """Returns the story[] list for the body PDF (TOC + 11 chapters)."""
    story = []

    # ─────────────────────────────────────────────────────────────────────
    # TABLE OF CONTENTS
    # ─────────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 6))
    story.append(Paragraph('<font color="#5EEAD4" name="Mono-Bold">///</font>   <font name="Mono-Bold">TABLA DE CONTENIDOS</font>', h1))
    story.append(HRFlowable(width=CONTENT_W*0.18, thickness=1.2, color=ACC_RISING,
                            spaceBefore=2, spaceAfter=14))
    story.append(Paragraph(
        'Documento de arquitectura y estrategia para la Terminal de Viralidad. '
        'Las 11 secciones que siguen fueron consensuadas tras un debate entre cinco agentes especialistas '
        '(arquitectura, algoritmo, UX/UI, fuentes, anti-gaming).', lead))
    story.append(Spacer(1, 12))

    toc = TableOfContents()
    toc.levelStyles = [toc_h1, toc_h2]
    story.append(toc)
    story.append(PageBreak())

    # ─────────────────────────────────────────────────────────────────────
    # CHAPTER 1 — RESUMEN EJECUTIVO
    # ─────────────────────────────────────────────────────────────────────
    story.extend(chapter_header(1, 'Resumen Ejecutivo', kicker_text='CAPÍTULO 01 · VISIÓN GENERAL'))

    story.append(lead_p(
        'La <b>Terminal de Viralidad</b> es un sistema de inteligencia en tiempo real que detecta narrativas emergentes '
        'en Twitter y las confirma cruzando GDELT, Reddit, Hacker News y Google Trends. Su propósito no es mostrar '
        'tendencias ya formadas (eso ya hace Twitter Trending), sino <b>adelantarse 30 minutos a 48 horas</b> al burst '
        'público, dando a periodistas, traders, analistas de marca e investigadores OSINT una ventana accionable.'))

    story.append(subsection_header('1.1 · Qué es'))
    story.append(body_p(
        'La terminal se construye como un monolito modular en Next.js 16 con workers Python desacoplados para scraping, '
        'usando CloakBrowser 0.5.2 (wrapper de Playwright con stealth a nivel binario) como única vía de acceso a Twitter '
        'sin API oficial de pago. Las cinco fuentes (Twitter, GDELT 2.0, Reddit vía OAuth2, HN Algolia, Google Trends vía '
        'pytrends) se normalizan a un schema unificado <font name="Mono">NormalizedMention</font>, se deduplican con '
        'SimHash + MinHash + embeddings multilingües, se clusterizan en narrativas con un pipeline two-tier (TF-IDF '
        'instantáneo + HDBSCAN batch cada 30 segundos), y se puntúan con un algoritmo que desdobla velocidad y madurez.'))
    story.append(body_p(
        'El frontend es una terminal estilo Bloomberg con cinco paneles densos: ticker superior, lista de narrativas '
        'a la izquierda, detalle central, stream de menciones a la derecha con efecto typewriter (reactbytes), y '
        'strip de aceleración abajo. Toda la comunicación en tiempo real es vía SSE (Server-Sent Events), con '
        'throttle a 100ms vía requestAnimationFrame y cap de 50 menciones visibles. La estética es oscura profunda '
        '(<font name="Mono">#0A0E14</font>), mono-first (SarasaMonoSC / JetBrains Mono), color 100% semántico por fase.'))

    story.append(subsection_header('1.2 · Por qué existe'))
    story.append(body_p(
        'Twitter Trending Topics muestra lo <i>formado</i>. Para cuando una narrativa aparece ahí, ya tiene cientos de '
        'miles de menciones, la cobertura mediática la amplificó, y el momento accionable se cerró. Los casos canónicos '
        'son contundentes: <b>GameStop</b> estuvo creciendo en r/wallstreetbets durante diciembre 2020 antes del burst '
        'público de enero 2021 (lead time posible: 5-10 días). <b>Fyre Festival</b> tuvo señales en prensa local bahameña '
        'y Reddit 48 horas antes del desastre viral. <b>Cambridge Analytica</b> fue cubierta por GDELT desde diciembre '
        'de 2015, más de dos años antes del estallido en marzo 2018. Cada uno de estos casos tendría valor económico '
        'directo para un trader, un periodista, o un analista político si se hubiese detectado a tiempo.'))

    story.append(subsection_header('1.3 · Cómo funciona — pipeline en 7 etapas'))
    story.extend(ascii_diagram(
        "  ┌─────────┐   ┌──────────┐   ┌─────────┐   ┌────────────┐   ┌────────┐   ┌──────────┐   ┌──────┐\n"
        "  │ INGEST  │ → │ NORMALIZE│ → │  DEDUP  │ → │  CLUSTER   │ → │ SCORE  │ → │  PERSIST │ → │ SSE  │\n"
        "  │ Python  │   │ Node     │   │ SimHash │   │  Two-Tier  │   │ Vel×Mat│   │ Postgres │   │ UI   │\n"
        "  │ workers │   │ adapters │   │ + MinHsh│   │  TF-IDF +  │   │ ×Pen × │   │ + pgvec  │   │ React│\n"
        "  │         │   │          │   │ + Embed │   │  HDBSCAN   │   │ Decay  │   │ + Redis   │   │      │\n"
        "  └─────────┘   └──────────┘   └─────────┘   └────────────┘   └────────┘   └──────────┘   └──────┘\n"
        "   <30s/source     <5ms/evt      <2ms/evt       tier1<5ms           <10ms       <100ms       <50ms\n"
        "                                                   tier2 30s",
        caption_text='Diagrama 1.1 — Pipeline de 7 etapas: ingest → normalize → dedup → cluster two-tier → score → persist → stream SSE'
    ))

    story.append(subsection_header('1.4 · Diferenciadores'))
    story.append(body_p(
        'Cuatro killer features distinguen este producto de cualquier clon de Twitter Trending:'))
    story.append(bullet_p(
        '<b>Lead time accionable</b>: detección en estado "formándose" entre 30 minutos y 48 horas antes del burst público, '
        'combinando GDELT/Reddit/Google Trends como precursores débilmente acoplados.'))
    story.append(bullet_p(
        '<b>Legitimacy badge transparente</b>: cada narrativa se etiqueta como LEGIT, BOT_CAMPAIGN, TWITTER_NATIVE o '
        'PRE_BURST mediante cross-validation bayesiana entre las 5 fuentes. Twitter no dice cuándo un trending está manipulado.'))
    story.append(bullet_p(
        '<b>Cross-source attribution</b>: timeline que muestra dónde y cuándo apareció primero la narrativa (¿Twitter, '
        'GDELT, Reddit?), quién la originó, y cómo se amplificó.'))
    story.append(bullet_p(
        '<b>Workflow curado por rol</b>: cinco dashboards específicos para periodista, trader cripto, analista de marca, '
        'OSINT researcher y analista político, con filtros y métricas relevantes para cada uno.'))

    story.append(subsection_header('1.5 · Stack tecnológico'))
    story.append(make_table(
        ['Capa', 'Tecnología', 'Justificación'],
        [
            ['Frontend',     'Next.js 16 + React 19 + reactbytes + visx', 'SSR, SSE nativo, animaciones terminales, charts componibles'],
            ['Backend API',  'Next.js API Routes (Node)',                 'Co-located con frontend, SSE gateway unificado'],
            ['Scraping',     'Python 3.12 + CloakBrowser 0.5.2 + httpx',  'Stealth binario, rotación de proxies, sidecar aislado'],
            ['Event bus',    'Redis 7 Streams + BullMQ',                  'Consumer groups, replay, rate limiting distribuido'],
            ['Persistencia', 'PostgreSQL 16 + pgvector 0.7',              'Vector search nativo, particionado mensual, JSONB'],
            ['Clustering',   'Sidecar Python: HDBSCAN + UMAP + BGE-large','Densidad jerárquica, maneja ruido, multilingüe'],
            ['Real-time',    'SSE (Server-Sent Events)',                  'Unidireccional, auto-reconnect, atraviesa proxies'],
            ['Monitoreo',    'Prometheus + Grafana',                      'Métricas por fuente, circuit state, latencia p95'],
        ],
        col_widths=[80, 180, CONTENT_W - 260]
    ))

    story.append(subsection_header('1.6 · Métricas North Star'))
    story.append(body_p(
        'La métrica rectora del producto es el <b>lead time accionable medio</b>: tiempo entre nuestra alerta de '
        'narrativa emergente y el burst público en Twitter Trending, ponderado por precision. Si sube, ganamos. '
        'Si baja, somos un clon caro de Twitter Trending. Los targets por versión son:'))
    story.append(make_table(
        ['Métrica', 'MVP (4 sem)', 'v1 (3 meses)', 'v2 (6 meses)'],
        [
            ['Lead time accionable medio', '>1h en 50% casos', '>3h en 70% casos', '>6h en 80% casos'],
            ['Precision@k (LEGIT)',        '>0.80',             '>0.90',            '>0.93'],
            ['Recall (BOT_CAMPAIGN)',      'n/a',               '>0.60',            '>0.75'],
            ['False-positive bot rate',    '<5%',               '<2%',              '<1%'],
            ['NPS por rol',                '—',                 '>40',              '>55'],
            ['Daily Active Watchlists',    '—',                 '>500',             '>5000'],
        ],
        col_widths=[CONTENT_W*0.36, CONTENT_W*0.21, CONTENT_W*0.21, CONTENT_W*0.22],
        mono_cols=[1, 2, 3]
    ))

    story.append(Spacer(1, 14))
    story.extend(callout_box(
        'NORTE ESTRATÉGICO',
        'Sin la combinación de lead time + legitimacy badge + cross-source attribution, el producto es un clon caro '
        'de Twitter Trending. Con esos tres diferenciadores juntos, es una herramienta de intelligence con valor '
        'monetizable directo para cinco ICPs distintos.',
        color=ACC_RISING
    ))

    story.append(PageBreak())

    # ─────────────────────────────────────────────────────────────────────
    # CHAPTER 2 — CONTEXTO Y VISIONAMIENTO ESTRATÉGICO
    # ─────────────────────────────────────────────────────────────────────
    story.extend(chapter_header(2, 'Contexto y Visionamiento Estratégico', kicker_text='CAPÍTULO 02 · POR QUÉ EXISTE'))

    story.append(subsection_header('2.1 · El problema: Twitter Trending llega tarde'))
    story.append(body_p(
        'El producto más cercano al que aspiramos reemplazar o complementar es la pestaña "Trends" de Twitter/X. Esa '
        'lista se actualiza cada 5-10 minutos y refleja hashtags y tópicos con alto volumen <i>actual</i>. El problema '
        'operacional es que cuando un tópico llega a Trends, ya acumuló decenas de miles de menciones, fue amplificado '
        'por cuentas grandes, y muchas veces ya está siendo cubierto por medios tradicionales. El momento de '
        'oportunidad (publicar antes, invertir antes, alertar antes) se cerró.'))
    story.append(body_p(
        'Esto no es un defecto de implementación: es estructural. Twitter optimiza su Trending para mostrar lo que '
        'ya es socialmente significativo, no para anticipar lo que lo será. La métrica que usan es volumen bruto '
        'relativo, no velocidad de crecimiento ni calidad del originador ni cross-source amplification. Un sistema '
        'que se proponga adelantarse necesita operar con señales distintas, en ventanas temporales más cortas, y '
        'considerar fuentes externas que sirvan como precursores débilmente acoplados.'))

    story.append(subsection_header('2.2 · Casos canónicos donde lead time habría generado valor'))
    story.append(make_table(
        ['Evento', 'Período', 'Lead time posible', 'Señal precursora'],
        [
            ['GameStop / AMC',      'Dic 2020 → Ene 2021',  '5-10 días',
             'r/wallstreetbets, cuentas financieras indie en Twitter'],
            ['Fyre Festival',       'Abr 2017',              '48 horas',
             'GDELT prensa local bahameña + hilos Reddit'],
            ['Cambridge Analytica', 'Mar 2018',              '>2 años',
             'GDELT desde Dic 2015, Reddit esporádico 2016-17'],
            ['#MeToo',              'Oct 2017',              '6-12 horas',
             'Activación de cuentas canario, pickup inicial'],
            ['FTX collapse',        'Nov 2022',              '3-7 días',
             'Cohort de críticos en CryptoTwitter + CoinDesk'],
            ['SVB bank run',        'Mar 2023',              '12-24 horas',
             'Twitter de VCs + Reddit r/investing'],
        ],
        col_widths=[CONTENT_W*0.22, CONTENT_W*0.18, CONTENT_W*0.18, CONTENT_W*0.42]
    ))
    story.append(body_p(
        'Cada uno de estos eventos comparte un patrón: existieron señales débiles en fuentes periféricas (subreddits '
        'nichos, cuentas canario, cobertura de prensa local) que precedieron al estallido masivo en Twitter. Ninguna '
        'de esas señales fue detectada en tiempo real por las herramientas comerciales existentes, porque esas '
        'herramientas miran Twitter exclusivamente y solo después de que el volumen es alto. El lead time que se '
        'perdió en cada caso corresponde a valor monetario o periodístico directo: operaciones de trading rentables, '
        'exclusivas periodísticas, mitigación de crisis de marca, inteligencia política.'))

    story.append(subsection_header('2.3 · Landscape competitivo'))
    story.append(body_p(
        'Las herramientas existentes para monitoreo de tendencias se dividen en tres categorías, todas con limitaciones '
        'estructurales que la Terminal de Viralidad aborda:'))
    story.append(make_table(
        ['Categoría', 'Ejemplos', 'Limitaciones'],
        [
            ['Oficiales de plataforma', 'Twitter Trending, Reddit Popular, HN Front',
             'Muestran lo formado, no lo emergente; sin cross-source; sin scoring de legitimidad'],
            ['Social listening SaaS',   'Meltwater, Brandwatch, Sprinklr, Talkwalker',
             'Costo $500-5000/mes, latencia horaria, APIs cerradas, no detectan pre-burst'],
            ['Tools gratis / OSS',      'TweetDeck, Trends24, RSS scraping ad-hoc',
             'Sin algoritmo de viralidad, sin anti-gaming, sin clusterización narrativa'],
        ],
        col_widths=[CONTENT_W*0.25, CONTENT_W*0.35, CONTENT_W*0.40]
    ))
    story.append(body_p(
        'Ninguna combina las tres propiedades críticas: (a) fuentes múltiples con cross-validation, (b) detección '
        'temprana vía señales débilmente acopladas, (c) transparency sobre la legitimidad de cada narrativa. Ese '
        'espacio en blanco es el que ocupa la Terminal de Viralidad.'))

    story.append(subsection_header('2.4 · Cinco ICPs (Ideal Customer Profiles)'))
    story.append(body_p(
        'El producto no es horizontal: cada audiencia tiene un workflow distinto y métricas de éxito distintas. '
        'El MVP se enfoca en uno solo (OSINT), v1 agrega los cuatro restantes.'))
    story.append(make_table(
        ['ICP', 'Workflow principal', 'Métrica de valor'],
        [
            ['Periodista investigativo', 'Watchlist de tópicos + cuentas canario, busca exclusivas >24h antes que medios mainstream',
             '# artículos con exclusiva publicada antes que competencia'],
            ['Trader cripto',           'Filtra por cross-validation (requiere GDELT o Reddit match) + trash<0.4, opera con webhook',
             'Lead time antes del pump >2h, Sharpe ratio de operaciones'],
            ['Analista de marca',       'Detecta crisis tempranas con sentiment negativo + cross-pollination a comunidades nuevas',
             'MTTR (mean time to response) reducido >50%'],
            ['OSINT researcher',        'Cross-validation exige GDELT + Twitter/Reddit, exporta a Maltego/i2',
             'Detección de evento geopolítico antes de medios >2h'],
            ['Analista político',       'Detecta bot campaigns coordinadas, reporta narrativas inyectadas por redes coordinadas',
             '% bot campaigns detectadas antes de remoción por plataforma'],
        ],
        col_widths=[CONTENT_W*0.20, CONTENT_W*0.55, CONTENT_W*0.25]
    ))

    story.append(subsection_header('2.5 · Propuesta de valor única'))
    story.extend(callout_box(
        'KILLER FEATURE',
        'No es "ver tendencias más rápido". Es <b>ver tendencias que todavía no están en Twitter</b>, cuyos precursores '
        'ya están en GDELT o Reddit, con un badge de legitimidad bayesiano que dice si la narrativa es real, manipulada, '
        'o nativa de Twitter. Eso vende a cinco audiencias con workflows distintos.',
        color=ACC_LIVE
    ))
    story.append(body_p(
        'El modelo de negocio es B2B SaaS multi-ICP con tiers: free (5 alertas/día, 1 watchlist), pro ($49-199/mes, '
        'multi-rol, alertas ilimitadas), enterprise ($1000+/mes, white-label, API, SLA). El tier free funciona como '
        'lead magnet para capturar PMF antes de monetizar. El precio se justifica no por la cantidad de datos sino '
        'por el lead time accionable: si un trader promedio genera $500 por operación con 2h de anticipación, '
        'cualquier precio menor a eso es obvio.'))

    story.append(PageBreak())

    return story

# Test stub if run directly
if __name__ == '__main__':
    print("This module is imported by generate_pdf.py — use that script to build the PDF.")
