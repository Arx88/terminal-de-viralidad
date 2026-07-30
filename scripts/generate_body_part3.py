#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Contenido del body PDF — Capítulos 3 a 7
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


def build_chapters_3_to_7():
    story = []

    # ═══════════════════════════════════════════════════════════════════════
    # CHAPTER 3 — SÍNTESIS DEL DEBATE MULTI-AGENTE
    # ═══════════════════════════════════════════════════════════════════════
    story.extend(chapter_header(3, 'Síntesis del Debate Multi-Agente', kicker_text='CAPÍTULO 03 · CONSENSO Y DISCREPANCIAS'))

    story.append(lead_p(
        'Cinco agentes especialistas debatieron en paralelo sobre arquitectura, algoritmo, UX/UI, fuentes y estrategia. '
        'Cada uno defendió una postura inicial y propuso mejoras concretas. Este capítulo sintetiza el consenso final '
        'y documenta las discrepancias resueltas, para que las decisiones arquitectónicas tengan trazabilidad.'))

    story.append(subsection_header('3.1 · Los cinco agentes y sus posturas iniciales'))
    story.append(make_table(
        ['Agente', 'Rol', 'Postura inicial defendida'],
        [
            ['#1 Arquitecto',
             'Diseño de sistemas',
             'Monolito modular Next.js + workers Python sidecar; Redis Streams; SSE no WebSocket; cluster two-tier con watermark 35s'],
            ['#2 Científico de datos',
             'Algoritmos / ML',
             'Score desdoblado Vel×Mat (no mono-score); penalty multiplicativo de 5; HMM para 4 fases; CUSUM online + Kleinberg offline'],
            ['#3 Designer UX/UI',
             'Sistema de diseño',
             '"Bloomberg Terminal meets Linear": 5 paneles densos, mono-first, color 100% semántico, keyboard-first vim'],
            ['#4 Ingeniero de fuentes',
             'Scraping / anti-ban',
             'CloakBrowser 0.5.2 + 5 adapters con schema común; dedup 3 capas SimHash+MinHash+embeddings; circuit breakers por fuente'],
            ['#5 Estratega anti-gaming',
             'Producto / modelo de negocio',
             'El algoritmo original es ingenuo; cross-validation bayesiana con 5 categorías de legitimacy; killer feature = lead time'],
        ],
        col_widths=[CONTENT_W*0.22, CONTENT_W*0.20, CONTENT_W*0.58]
    ))

    story.append(subsection_header('3.2 · Consenso alcanzado'))
    story.append(body_p(
        'Tras el debate, los cinco agentes convergieron en un conjunto de decisiones que ningún agente había propuesto '
        'íntegramente al inicio. La síntesis supera a cada postura individual porque integra las preocupaciones de '
        'robustez estadística del agente #2, las restricciones operacionales del #1, los requisitos de UX del #3, '
        'las limitaciones reales de las fuentes del #4, y la visión estratégica del #5. Los puntos de consenso son:'))
    story.append(bullet_p(
        '<b>Arquitectura monolito modular</b> con sidecars Python (no microservicios en MVP). Next.js 16 aloja '
        'frontend + API routes + SSE gateway en un proceso. Workers Python aislados para CloakBrowser y clustering.'))
    story.append(bullet_p(
        '<b>Pipeline two-tier con watermark explícito de 35 segundos</b>: tier-1 TF-IDF asigna menciones a narrativas '
        'en menos de 5ms (provisional); tier-2 HDBSCAN cada 30 segundos reasigna y merguea con confianza.'))
    story.append(bullet_p(
        '<b>Score desdoblado Vel(n,t) × Mat(n,t)^γ × Pen(n,t) × Decay(t)</b>. La separación de velocidad y madurez '
        'es crítica: un solo score escalar no puede distinguir las 4 fases. γ se aprende, no se asume.'))
    story.append(bullet_p(
        '<b>Penalty multiplicativo de 5 sub-factores</b> (bot_score, duplicate_ratio, low_quality_origin, '
        'coordinated_behavior, promotional_content). Producto, no suma: si cualquier sub-factor colapsa, el score '
        'debe ir a 0.'))
    story.append(bullet_p(
        '<b>HMM de 4 estados</b> (forming/growing/mature/decaying) con matriz de transición estructurada (decaying '
        'absorbente). Viterbi offline para trayectorias, filter forward online para estado actual.'))
    story.append(bullet_p(
        '<b>Burst detection híbrido</b>: CUSUM online (latencia <30s, UMbral h≈5σ) para alerta inmediata; Kleinberg '
        'offline batch diario para detectar jerarquías de bursts y refrescar parámetros.'))
    story.append(bullet_p(
        '<b>Cross-validation bayesiana entre 5 fuentes</b> con 5 categorías de legitimacy: LEGIT, BOT_CAMPAIGN, '
        'TWITTER_NATIVE, PRE_BURST, NOISE. Discrepancia inter-fuente es feature explícita (no ruido).'))
    story.append(bullet_p(
        '<b>SSE sobre WebSocket</b> para push a UI: unidireccional, auto-reconnect nativo, atraviesa proxies '
        'corporativos, 1 endpoint Next.js maneja 500-1000 conexiones sin infra extra.'))
    story.append(bullet_p(
        '<b>Estética "Bloomberg Terminal meets Linear"</b>: dark profundo (#0A0E14), mono-first, 5 paneles densos, '
        'color semántico por fase, reactbytes reservado para momentos cognitivos (no decorativos).'))
    story.append(bullet_p(
        '<b>Aprendizaje de pesos vía Bayesian Optimization</b> sobre precision@k@lead en walk-forward estricto. '
        'Nunca accuracy (99.99% de narrativas no son virales). Pesos por fuente, no globales.'))

    story.append(subsection_header('3.3 · Discrepancias resueltas'))
    story.append(body_p(
        'Cinco decisiones generaron tensión real entre agentes. El siguiente cuadro documenta cada discrepancia, '
        'quién defendió cada posición, y cómo se resolvió:'))
    story.append(make_table(
        ['Discrepancia', 'Posición A', 'Posición B', 'Resolución final'],
        [
            ['Twitter: API oficial vs CloakBrowser scraping',
             '#5 Estratega: API oficial por ética',
             '#4 Fuentes + usuario: CloakBrowser scraping',
             'CloakBrowser + documento de compliance posture. Hashing SHA-256 con salt rotatorio para autor. Opt-out público.'],
            ['Pesos del algoritmo: fijos vs aprendidos',
             'Usuario original: pesos ad-hoc',
             '#2 Data: Bayesian Optimization',
             'Aprendidos via BO sobre precision@k@lead con walk-forward. Defaults razonables como cold start.'],
            ['4 fases: thresholds vs HMM',
             'Heurística simple por umbral',
             '#2 Data: HMM de 4 estados',
             'HMM como baseline (no requiere labels). Classifier supervisado (XGBoost) como upgrade cuando se acumulen 500-1000 trayectorias etiquetadas.'],
            ['Modelo de embeddings para clustering',
             '#4 Fuentes: paraphrase-multilingual-MiniLM (liviano)',
             '#2 Data: BGE-large-en-v1.5 (más calidad)',
             'BGE-large para clustering narrativo (offline, calidad). MiniLM para dedup cross-fuente (online, latencia). Dos modelos, dos propósitos.'],
            ['Multi-rol en MVP vs single-ICP MVP',
             '#5 Estratega: 5 ICPs simultáneos',
             '#1 Arquitecto: 1 ICP (OSINT) para validar PMF',
             'MVP single-ICP (OSINT researcher, más fácil de validar). v1 agrega los 4 restantes.'],
        ],
        col_widths=[CONTENT_W*0.22, CONTENT_W*0.22, CONTENT_W*0.22, CONTENT_W*0.34]
    ))

    story.append(subsection_header('3.4 · Lo que NO se construye en MVP'))
    story.append(body_p(
        'Por honestidad operacional, el consenso también dejó explícito qué queda fuera del MVP para no diluir foco. '
        'Estas features se construyen en v1 o v2:'))
    story.append(bullet_p('GNN (GraphSAGE) para detección de bots coordinados. MVP usa solo heurísticas + Isolation Forest.'))
    story.append(bullet_p('Multi-idioma profundo (ES/EN/PT/FR/DE/RU/ZH). MVP cubre EN + ES nativo.'))
    story.append(bullet_p('Telegram/BlueSky/Mastodon ingestion. MVP se concentra en las 5 fuentes validadas.'))
    story.append(bullet_p('Predictive modeling (LSTM/Transformer para predecir fase futura). v2.'))
    story.append(bullet_p('Marketplace de watchlists curadas. v2.'))
    story.append(bullet_p('White-label para agencias. v2.'))
    story.append(bullet_p('Mobile app. La terminal es desktop-first por definición; mobile solo degradación elegante.'))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════
    # CHAPTER 4 — ARQUITECTURA DEL SISTEMA
    # ═══════════════════════════════════════════════════════════════════════
    story.extend(chapter_header(4, 'Arquitectura del Sistema', kicker_text='CAPÍTULO 04 · CÓMO ESTÁ CONSTRUIDO'))

    story.append(lead_p(
        'Arquitectura orientada a eventos con streaming en tiempo real. Monolito modular en Next.js 16 como núcleo, '
        'workers Python desacoplados para scraping y clustering, Redis Streams como bus de eventos, PostgreSQL con '
        'pgvector para persistencia. SSE para push a UI. Watermark de 35 segundos entre ingesta y narrativa visible.'))

    story.append(subsection_header('4.1 · Visión general'))
    story.append(body_p(
        'La decisión arquitectónica central es <b>monolito modular, no microservicios</b>. Para un MVP con cinco '
        'fuentes, tráfico predecible (<1K eventos/seg) y un equipo pequeño, los microservicios introducen overhead '
        'operacional (service mesh, discovery, API gateway, observabilidad distribuida) sin aportar valor. La '
        'extracción de servicios se difiere hasta que haya presión de escala medible (>50K events/min, >70% CPU '
        'sostenido). Cuando llegue el momento, las fronteras ya están definidas: ingesters Python, cluster service, '
        'scoring service, SSE gateway, cada uno extraíble a contenedor independiente sin reescribir interfaces.'))
    story.append(body_p(
        'El monolito Next.js aloja en un solo proceso: el frontend React, las API routes (REST + SSE gateway), el '
        'consumidor de Redis Streams que procesa menciones normalizadas, y los servicios de scoring y persistencia. '
        'Los sidecars Python (CloakBrowser ingesters + HDBSCAN cluster) corren como procesos separados comunicados '
        'via HTTP localhost. En desarrollo se levantan con Docker Compose; en producción son dos contenedores con '
        'healthcheck mutuo. No hay service mesh, no hay API gateway, no hay discovery — es un monolito con workers.'))

    story.append(subsection_header('4.2 · Diagrama de arquitectura'))
    story.extend(ascii_diagram(
        "  ┌─ FUENTES (external) ─────────────────────────────────────────────────────┐\n"
        "  │  Twitter/X    GDELT 2.0    Reddit(OAuth)   HN Algolia   Google Trends    │\n"
        "  └──────┬────────────┬────────────┬──────────────┬──────────────┬─────────────┘\n"
        "         ▼            ▼            ▼              ▼              ▼\n"
        "  ┌─ INGESTERS (Python workers, 1 por fuente) ─────────────────────────────────┐\n"
        "  │  TwitterIngester   GDELTIngester   RedditIngester   HNIngester   Trends   │\n"
        "  │  + CloakBrowser    + httpx         + OAuth2 token   + httpx      + pytrends│\n"
        "  │  + proxy rotator   + tenacity      + token refresh  + tenacity   + retries │\n"
        "  │  + pybreaker       + pybreaker     + pybreaker      + pybreaker  + circuit │\n"
        "  └──────┬───────────────────────────────────────────────────────────────────┘\n"
        "         ▼  xadd maxlen=100k\n"
        "  ┌─ REDIS STREAMS ──────────────────────────────────────────────────────────┐\n"
        "  │  mentions.raw  →  mentions.normalized  →  mentions.deduped                │\n"
        "  │  narratives.events  (output del score service)                           │\n"
        "  └──────┬───────────────────────────────────────────────────────────────────┘\n"
        "         ▼",
        caption_text='Diagrama 4.1a — Fuentes → Ingesters → Redis Streams (parte 1/2)'
    ))
    story.extend(ascii_diagram(
        "  ┌─ PROCESSING (Next.js Node process) ──────────────────────────────────────┐\n"
        "  │  Normalizer → Dedup → ClusterTier1(TF-IDF) → Score → Persist → Stream    │\n"
        "  │                                       ↓                                  │\n"
        "  │                            ClusterTier2 (cada 30s)                       │\n"
        "  │                            HDBSCAN + BGE-large                           │\n"
        "  │                            (sidecar Python FastAPI)                      │\n"
        "  └──────┬───────────────────────────────────────────────────────────────────┘\n"
        "         ▼\n"
        "  ┌─ STORAGE ─────────────────────────────────────────────────────────────────┐\n"
        "  │  PostgreSQL 16 + pgvector 0.7        Redis 7 (cache + locks + rate limit) │\n"
        "  │  mentions (particionado mensual)     TokenBucket por fuente              │\n"
        "  │  narratives + narrative_scores        CircuitBreaker state               │\n"
        "  │  authors (hashed)                    Embeddings cache (LRU 10k)         │\n"
        "  └──────┬───────────────────────────────────────────────────────────────────┘\n"
        "         ▼\n"
        "  ┌─ API LAYER (Next.js API routes) ──────────────────────────────────────────┐\n"
        "  │  /api/stream     SSE gateway (Last-Event-ID, filter status/minScore)     │\n"
        "  │  /api/narratives REST: list, detail, compare, history                    │\n"
        "  │  /api/sources    REST: health, metrics                                   │\n"
        "  └──────┬───────────────────────────────────────────────────────────────────┘\n"
        "         ▼  text/event-stream\n"
        "  ┌─ FRONTEND (React 19 + reactbytes) ────────────────────────────────────────┐\n"
        "  │  Terminal Bloomberg-style 5-pane                                          │\n"
        "  │  Ticker | Narrative list | Detail | Live stream | Accel strip             │\n"
        "  └─────────────────────────────────────────────────────────────────────────┘",
        caption_text='Diagrama 4.1b — Processing → Storage → API → Frontend (parte 2/2)'
    ))

    story.append(subsection_header('4.3 · Stack tecnológico justificado'))
    story.append(make_table(
        ['Componente', 'Tecnología', 'Versión', 'Por qué esta elección'],
        [
            ['Frontend',        'Next.js',           '16.x',
             'App Router, SSE en API routes, React 19 useTransition para streams'],
            ['Animaciones',     'reactbytes + framer-motion', '1.x / 11.x',
             'Typewriter, glitch, byte-stream — efectos terminales sin CSS hacks'],
            ['Charts',          'visx + SVG custom',  '0.18+',
             'Componible, sin layout asumido, encaja en paneles densos de 320px'],
            ['Backend runtime', 'Node.js (Bun en prod)', '20.x / 1.x',
             'SSE nativo, http2, 1 proceso maneja 500-1000 conexiones concurrentes'],
            ['Scraping runtime','Python',            '3.12',
             'CloakBrowser es Python-first; ecosistema scraping más maduro (httpx, tenacity, pybreaker)'],
            ['Browser stealth', 'CloakBrowser',      '0.5.2+',
             'Patches a nivel binario del Chromium, no JS injection; evita navigator.webdriver, WebGL, canvas'],
            ['Bus de eventos',  'Redis Streams',     '7.x',
             'Consumer groups + replay + persistencia. No Kafka (overkill), no RabbitMQ (routing complejo innecesario)'],
            ['Rate limiting',   'BullMQ + Redis',    '5.x',
             'Rate limiting declarativo, prioridades, retries con backoff, dashboard Bull Board'],
            ['Persistencia',    'PostgreSQL',        '16.x',
             'Particionado mensual, JSONB entities, BRIN en timestamps'],
            ['Vector search',   'pgvector',          '0.7+',
             'IVFFLAT index 384-dim resuelve 10M vectores <50ms p99. No Pinecone (vendor lock-in, latencia red)'],
            ['Embeddings (cluster)','BGE-large-en-v1.5','1.5',
             'SOTA retrieval, multilingüe, 1024-dim. Solo para clustering offline'],
            ['Embeddings (dedup)','paraphrase-multilingual-MiniLM-L12-v2','—',
             '384-dim, ~120MB, CPU <15ms. Para dedup cross-fuente en hot path'],
            ['Clustering',      'HDBSCAN + UMAP',    '0.8+ / 0.5+',
             'Densidad jerárquica, robusto a ruido, no exige k. Estándar de facto para text clustering streaming'],
            ['Real-time push',  'SSE (Server-Sent Events)','—',
             'Unidireccional, auto-reconnect, Last-Event-ID resume, atraviesa proxies corporativos'],
            ['Monitoreo',       'Prometheus + Grafana','2.x / 10.x',
             'Self-hosted, gratis. Métricas por fuente, circuit state, latencia p95, queue depth'],
        ],
        col_widths=[CONTENT_W*0.16, CONTENT_W*0.20, CONTENT_W*0.12, CONTENT_W*0.52]
    ))

    story.append(subsection_header('4.4 · Pipeline de 7 etapas detallado'))
    story.append(body_p(
        'El pipeline va desde ingesta hasta stream a UI. Cada etapa tiene un SLA explícito y el watermark total '
        '(mention ingesta → narrativa visible en UI) es p50 5s, p99 50s (cuando espera tier-2).'))
    story.append(make_table(
        ['#', 'Etapa', 'Tecnología', 'SLA', 'Output'],
        [
            ['1', 'INGEST',       'Python workers + CloakBrowser', 'Twitter 1req/30s/sesión×10 sesiones; otras 1req/5min',
             'Stream mentions.raw con schema normalizado crudo'],
            ['2', 'NORMALIZE',    'Node consumer, adapter pattern', '<5ms/event',
             'Stream mentions.normalized (NormalizedMention)'],
            ['3', 'DEDUP',        'MinHash LSH + URL canonical',   '<2ms/event',
             'Stream mentions.deduped'],
            ['4', 'CLUSTER T1',   'TF-IDF cosine vs centroides',   '<5ms/event',
             'mention.narrative_id provisional (tier1)'],
            ['5', 'CLUSTER T2',   'Sidecar Python HDBSCAN + BGE',  'batch 30s, <3s interno',
             'Reasignación final, merge de narrativas'],
            ['6', 'SCORE',        'Node service on persist',        '<10ms/narrativa',
             'Insert en narrative_scores + computed 4 fase'],
            ['7', 'PERSIST+STREAM','Postgres writer + Redis pub',   'p99 <100ms write, <50ms stream',
             'Postgres row + evento a narratives.events → SSE'],
        ],
        col_widths=[CONTENT_W*0.05, CONTENT_W*0.16, CONTENT_W*0.27, CONTENT_W*0.27, CONTENT_W*0.25],
        mono_cols=[0]
    ))

    story.append(subsection_header('4.5 · Decisiones clave'))
    story.append(body_p(
        'Diez decisiones arquitectónicas con su alternativa descartada y justificación. Cada una fue debatida:'))
    story.append(make_table(
        ['#', 'Decisión', 'Alternativa descartada', 'Justificación'],
        [
            ['1', 'Monolito modular Next.js 16', 'Microservicios en K8s / Serverless Lambda',
             'Serverless mata SSE (cold starts, timeout 15s). K8s overhead de ops sin valor hasta 10x escala'],
            ['2', 'Workers Python separados via Redis Streams', 'Todo en TypeScript (Playwright TS binding)',
             'CloakBrowser es Python-first; aísla bans/crashes del proceso principal'],
            ['3', 'Redis Streams como bus', 'Kafka / RabbitMQ / NATS',
             'Kafka = ops pesadas. RabbitMQ = routing complejo innecesario. Streams da consumer groups + replay barato'],
            ['4', 'PostgreSQL 16 + pgvector', 'Pinecone / Weaviate / Qdrant externos',
             '384-dim con IVFFLAT resuelve 10M vectores <50ms p99. 1 DB. Migrar a Qdrant solo si >100M vectores'],
            ['5', 'SSE para push a UI', 'WebSocket / Socket.io',
             'Push unidireccional. SSE: auto-reconnect nativo, Last-Event-ID resume, atraviesa proxies corporativos'],
            ['6', 'Cluster two-tier TF-IDF + HDBSCAN', 'Embeddings puros en cada mention',
             'Embeddings en hot path = 50-100ms/mention = inviable a 1K mentions/s. MinHash LSH resuelve near-dup en 1-2ms'],
            ['7', 'BGE-large para cluster, MiniLM para dedup', 'Un solo modelo para todo',
             'BGE-large (1024-dim) pesado pero calidad para cluster offline. MiniLM (384-dim) liviano para dedup online'],
            ['8', 'pgvector con IVFFLAT + BRIN en timestamps + GIN en JSONB', 'HNSW siempre / B-tree everywhere',
             'HNSW más rápido pero rebuild caro y memoria-intensive. IVFFLAT suficiente para 10M. BRIN 10x más chico que B-tree para timestamps append-only'],
            ['9', 'BullMQ + pybreaker', 'Celery / RQ puro / sin cola',
             'BullMQ da rate limiting declarativo, prioridades, retries con backoff, dashboards. pybreaker es el circuit breaker estándar Python'],
            ['10', 'Tablas particionadas mensualmente + TTL Redis 7d', 'Tabla única creciendo / sin TTL',
             'mentions crece 1-5M filas/mes. DROP PARTITION para retención 90d sin VACUUM pesado. Eventos crudos en Redis con TTL 7d'],
        ],
        col_widths=[CONTENT_W*0.04, CONTENT_W*0.24, CONTENT_W*0.26, CONTENT_W*0.46],
        mono_cols=[0]
    ))

    story.append(subsection_header('4.6 · Trade-offs (puntos de tensión reales)'))
    story.append(body_p(
        'Tres trade-offs que el equipo aceptó conscientemente, con la estrategia de mitigación para cada uno:'))
    story.extend(callout_box(
        'T1 · FRESCURA vs COSTO DE SCRAPING',
        'Detectar "narrativas formándose" exige alta frecuencia (poll cada 30s en Twitter). Pero más frecuencia = '
        'más proxies, más sesiones, más costo, más riesgo de ban. <b>Mitigación</b>: scraping adaptativo con feedback '
        'loop — narrativas activas en estado forming/rising con score>40 suben a poll 15s; narrativas formed/declining '
        'bajan a 5min. Reduce costo ~60% vs polling uniforme agresivo manteniendo frescura donde importa.',
        color=ACC_FORMING))
    story.extend(callout_box(
        'T2 · LATENCIA DE CLUSTERING vs CALIDAD SEMÁNTICA',
        'HDBSCAN + embeddings detecta mejor narrativas emergentes que TF-IDF, pero tarda 2-5s por batch. Si espero '
        'el batch, pierdo frescura; si uso TF-IDF solo, fallo en cross-fuente. <b>Mitigación</b>: two-tier con '
        'watermark explícito de 35s. Tier-1 asigna mención a narrativa en <5ms y la UI la muestra como "forming" con '
        'flag cluster_confidence=provisional. Tier-2 reasigna y mergea cada 30s. El usuario acepta 35s de ruido a '
        'cambio de no perder 35s de detección.',
        color=ACC_RISING))
    story.extend(callout_box(
        'T3 · SIMPLICIDAD DEL MONOLITO vs AISLAR PYTHON',
        'Quiero un solo proceso (monolito Next.js), pero CloakBrowser y HDBSCAN viven mejor en Python. Levantar 2 '
        'runtimes rompe el "monolito". <b>Mitigación</b>: sidecars Python con FastAPI en localhost HTTP, no '
        'microservicios. En Docker Compose es 1 servicio con sidecar. En prod son 2 contenedores con healthcheck '
        'mutuo. No hay service mesh, no hay API gateway, no hay discovery. Es un monolito con workers, no una red '
        'de microservicios.',
        color=ACC_PEAKED))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════
    # CHAPTER 5 — MODELO DE DATOS Y PERSISTENCIA
    # ═══════════════════════════════════════════════════════════════════════
    story.extend(chapter_header(5, 'Modelo de Datos y Persistencia', kicker_text='CAPÍTULO 05 · POSTGRESQL + PGVECTOR'))

    story.append(lead_p(
        'Cinco tablas principales: mentions (particionada mensualmente), narratives, narrative_scores (serie temporal), '
        'authors (hashed), sources (config y salud). Índices críticos: IVFFLAT en embeddings, BRIN en timestamps, '
        'GIN en JSONB entities. Retención 90 días vía DROP PARTITION.'))

    story.append(subsection_header('5.1 · Tabla mentions — particionada mensualmente'))
    story.append(body_p(
        'La tabla central del sistema. Cada mención individual (tweet, artículo de GDELT, post de Reddit, story de HN, '
        'tendencia de Google Trends) es una fila. Se particiona mensualmente por fetched_at para permitir DROP '
        'PARTITION eficiente (retención 90 días) sin VACUUM pesado. Estimación: 1-5M filas/mes.'))
    story.extend(code_block(
        "CREATE EXTENSION IF NOT EXISTS vector;\n"
        "CREATE EXTENSION IF NOT EXISTS pg_trgm;\n"
        "\n"
        "CREATE TABLE mentions (\n"
        "    id              BIGSERIAL,\n"
        "    source          TEXT NOT NULL,          -- 'twitter' | 'gdelt' | 'reddit' | 'hackernews' | 'googletrends'\n"
        "    external_id     TEXT NOT NULL,          -- id nativo de la fuente\n"
        "    url             TEXT,\n"
        "    url_canonical   TEXT,                   -- para dedup cross-fuente\n"
        "    author_hash     TEXT NOT NULL,          -- SHA-256(salt_rotatorio + author_id) — no PII\n"
        "    author_handle   TEXT,                   -- solo display, no persistente >30d\n"
        "    content         TEXT NOT NULL,\n"
        "    language        TEXT,                   -- ISO 639-1\n"
        "    entities        JSONB,                  -- {persons:[], orgs:[], locations:[]}\n"
        "    embedding       vector(384),            -- all-MiniLM-L6-v2 (dedup) — BGE-large en narrative centroid\n"
        "    minhash_sig     BYTEA,                  -- datasketch MinHash 128 perms\n"
        "    narrative_id    BIGINT,                 -- FK narratives, NULL hasta clusterizar\n"
        "    cluster_state   TEXT DEFAULT 'unclustered',  -- 'unclustered' | 'tier1' | 'final' | 'noise'\n"
        "    engagement      JSONB,                  -- {likes, retweets, comments, ...} fuente-specific\n"
        "    fetched_at      TIMESTAMPTZ NOT NULL,\n"
        "    created_at      TIMESTAMPTZ NOT NULL,\n"
        "    PRIMARY KEY (id, fetched_at)\n"
        ") PARTITION BY RANGE (fetched_at);\n"
        "\n"
        "-- Partición auto-creada por script monthly\n"
        "CREATE TABLE mentions_2026_07 PARTITION OF mentions\n"
        "    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');\n"
        "\n"
        "-- Índices críticos\n"
        "CREATE INDEX idx_mentions_url_canon   ON mentions (url_canonical) WHERE url_canonical IS NOT NULL;\n"
        "CREATE INDEX idx_mentions_narrative   ON mentions (narrative_id) WHERE narrative_id IS NOT NULL;\n"
        "CREATE INDEX idx_mentions_created_brin ON mentions USING BRIN (created_at);\n"
        "CREATE INDEX idx_mentions_entities_gin ON mentions USING GIN (entities jsonb_path_ops);\n"
        "CREATE INDEX idx_mentions_source_ext  ON mentions (source, external_id);\n"
        "\n"
        "-- IVFFLAT para 384-dim: lists = sqrt(rows) ~ 1000 para 1M vectores\n"
        "CREATE INDEX idx_mentions_embedding ON mentions\n"
        "    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 1000);",
        lang='sql'))

    story.append(subsection_header('5.2 · Tabla narratives'))
    story.append(body_p(
        'Cada narrativa es un cluster de menciones semánticamente cohesivas. Mantiene métricas rolling pre-calculadas '
        '(velocity_1h/6h/24h, acceleration, entropy) para scoring rápido sin recomputar desde mentions cada vez. El '
        'status captura la fase actual (forming/rising/formed/declining/dead) según el HMM.'))
    story.extend(code_block(
        "CREATE TABLE narratives (\n"
        "    id              BIGSERIAL PRIMARY KEY,\n"
        "    title           TEXT,                   -- auto-generada: top entities + verbo dominante\n"
        "    summary         TEXT,                   -- LLM-generated opcional\n"
        "    status          TEXT NOT NULL DEFAULT 'forming',\n"
        "                    -- 'forming' | 'rising' | 'formed' | 'declining' | 'dead'\n"
        "    origin_source   TEXT,                   -- primera fuente que la detectó\n"
        "    origin_quality  REAL DEFAULT 0.5,       -- 0-1, calidad del iniciador\n"
        "    legitimacy      TEXT DEFAULT 'UNCERTAIN', -- 'LEGIT' | 'BOT_CAMPAIGN' | 'TWITTER_NATIVE' | 'PRE_BURST' | 'NOISE'\n"
        "    first_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n"
        "    last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n"
        "    mention_count   INTEGER NOT NULL DEFAULT 0,\n"
        "    author_count    INTEGER NOT NULL DEFAULT 0,\n"
        "    source_count    INTEGER NOT NULL DEFAULT 0,  -- # de fuentes distintas que la confirmaron\n"
        "    -- métricas rolling pre-calculadas\n"
        "    velocity_1h     REAL DEFAULT 0,         -- menciones/hora última 1h\n"
        "    velocity_6h     REAL DEFAULT 0,\n"
        "    velocity_24h    REAL DEFAULT 0,\n"
        "    acceleration    REAL DEFAULT 0,         -- segunda derivada del volumen\n"
        "    entropy         REAL DEFAULT 0,         -- H(authors) Shannon normalizada\n"
        "    trash_penalty   REAL DEFAULT 1.0,       -- 0-1 (1 = limpio, 0.3 = spam)\n"
        "    current_score   REAL DEFAULT 0,         -- Vel × Mat^γ × Pen × Decay\n"
        "    burst_onset     TIMESTAMPTZ,            -- momento CUSUM disparó (t*)\n"
        "    predicted_peak  TIMESTAMPTZ,            -- predicción de peak (cuando HMM transicione a formed)\n"
        "    centroid_embedding vector(1024),        -- BGE-large, se actualiza incrementalmente\n"
        "    keywords        TEXT[],                 -- top 10 TF-IDF\n"
        "    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n"
        "    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()\n"
        ");\n"
        "\n"
        "CREATE INDEX idx_narratives_status_score ON narratives (status, current_score DESC);\n"
        "CREATE INDEX idx_narratives_last_seen_brin ON narratives USING BRIN (last_seen);\n"
        "CREATE INDEX idx_narratives_keywords_gin ON narratives USING GIN (keywords);\n"
        "CREATE INDEX idx_narratives_centroid ON narratives\n"
        "    USING ivfflat (centroid_embedding vector_cosine_ops) WITH (lists = 500);",
        lang='sql'))

    story.append(subsection_header('5.3 · Tabla narrative_scores — serie temporal'))
    story.append(body_p(
        'Historial temporal del score y sus componentes por narrativa. Permite reconstruir la trayectoria que llevó a '
        'la fase actual, esencial para backtesting, validación del HMM, y visualización en el timeline del detalle.'))
    story.extend(code_block(
        "CREATE TABLE narrative_scores (\n"
        "    narrative_id    BIGINT NOT NULL REFERENCES narratives(id),\n"
        "    score           REAL NOT NULL,         -- score final compuesto\n"
        "    velocity_score  REAL NOT NULL,         -- Vel(n,t) en [0,1]\n"
        "    maturity_score  REAL NOT NULL,         -- Mat(n,t) en [0,1]\n"
        "    trash_penalty   REAL NOT NULL,         -- Pen(n,t) en [0,1]\n"
        "    decay_factor    REAL NOT NULL,         -- Decay(t-t0) en [0,1]\n"
        "    phase           TEXT NOT NULL,         -- 'forming' | 'rising' | 'formed' | 'decaying'\n"
        "    phase_confidence REAL DEFAULT 0.5,     -- confianza del HMM en la clasificación\n"
        "    features        JSONB,                 -- vector de features completo para backtesting\n"
        "    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n"
        "    PRIMARY KEY (narrative_id, computed_at)\n"
        ") PARTITION BY RANGE (computed_at);\n"
        "\n"
        "-- TimescaleDB hypertable cuando se habilite la extensión:\n"
        "-- SELECT create_hypertable('narrative_scores', 'computed_at');",
        lang='sql'))

    story.append(subsection_header('5.4 · Tabla authors — hashed, no PII'))
    story.append(body_p(
        'Para compliance con GDPR, los autores se hashean con SHA-256 y salt rotatorio mensual (no reversible, no es '
        'PII bajo Art. 4). El handle display se persiste solo 30 días en Redis (no en Postgres). La reputation se '
        'computa agregado, no se guarda per-author PII. El bot_score combina heurísticas + Isolation Forest + '
        'features de grafo (GNN en v1).'))
    story.extend(code_block(
        "CREATE TABLE authors (\n"
        "    author_hash     TEXT PRIMARY KEY,        -- SHA-256, no reversible\n"
        "    first_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n"
        "    last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n"
        "    mention_count   INTEGER DEFAULT 0,\n"
        "    source_counts   JSONB,                   -- {twitter: 120, reddit: 3}\n"
        "    reputation      REAL DEFAULT 0.5,        -- 0-1, recalculado por batch diario\n"
        "    is_bot_suspect  BOOLEAN DEFAULT FALSE,\n"
        "    bot_score       REAL DEFAULT 0,          -- 0-1, heurísticas + Isolation Forest\n"
        "    origin_quality  REAL DEFAULT 0.5,        -- 0-1, quality como iniciador de narrativas\n"
        "    account_age_days INTEGER,                -- estimado, no PII\n"
        "    follower_following_ratio REAL            -- feature anti-bot\n"
        ");\n"
        "CREATE INDEX idx_authors_bot ON authors (is_bot_suspect) WHERE is_bot_suspect;\n"
        "CREATE INDEX idx_authors_reputation ON authors (reputation DESC);",
        lang='sql'))

    story.append(subsection_header('5.5 · Tabla sources — config y salud'))
    story.append(body_p(
        'Configuración y estado de cada fuente. Permite al panel admin mostrar salud en tiempo real (latencia, success '
        'rate, last fetch, circuit state) y al scheduler decidir cadencias adaptativas.'))
    story.extend(code_block(
        "CREATE TABLE sources (\n"
        "    name            TEXT PRIMARY KEY,        -- 'twitter', 'gdelt', etc.\n"
        "    enabled         BOOLEAN DEFAULT TRUE,\n"
        "    fetch_interval_s INTEGER NOT NULL,       -- 30, 300, etc.\n"
        "    last_fetch_at   TIMESTAMPTZ,\n"
        "    last_success_at TIMESTAMPTZ,\n"
        "    consecutive_errors INTEGER DEFAULT 0,\n"
        "    circuit_state   TEXT DEFAULT 'closed',   -- 'closed' | 'open' | 'half_open'\n"
        "    circuit_opened_at TIMESTAMPTZ,\n"
        "    success_rate_1h REAL DEFAULT 1.0,\n"
        "    latency_p95_ms  REAL DEFAULT 0,\n"
        "    config          JSONB                    -- {proxy_pool, session_count, ...}\n"
        ");",
        lang='sql'))

    story.append(subsection_header('5.6 · Estrategia de particionamiento y retención'))
    story.append(body_p(
        'Dos tablas crecen sin bound: mentions (1-5M filas/mes) y narrative_scores (~10K filas/día). Ambas se '
        'particionan mensualmente. La retención es 90 días para mentions y 1 año para narrative_scores. La '
        'partición del mes corriente tiene autovacuum agresivo (scale_factor=0.05) porque los inserts son '
        'append-only y continuos. Las particiones viejas se dropean sin VACUUM:'))
    story.extend(code_block(
        "-- Cron job mensual: crea partición del mes siguiente, dropea la de hace 4 meses\n"
        "CREATE OR REPLACE FUNCTION manage_partitions() RETURNS void AS $$\n"
        "DECLARE\n"
        "    next_month_start DATE := date_trunc('month', NOW() + INTERVAL '1 month');\n"
        "    next_month_end   DATE := date_trunc('month', NOW() + INTERVAL '2 months');\n"
        "    old_partition    TEXT;\n"
        "BEGIN\n"
        "    EXECUTE format(\n"
        "        'CREATE TABLE IF NOT EXISTS mentions_%s PARTITION OF mentions FOR VALUES FROM (%L) TO (%L)',\n"
        "        to_char(next_month_start, 'YYYY_MM'), next_month_start, next_month_end);\n"
        "    SELECT tablename INTO old_partition FROM pg_tables\n"
        "    WHERE tablename LIKE 'mentions_%' AND tablename < to_char(NOW() - INTERVAL '4 months', 'mentions_YYYY_MM')\n"
        "    ORDER BY tablename LIMIT 1;\n"
        "    IF old_partition IS NOT NULL THEN\n"
        "        EXECUTE format('DROP TABLE IF EXISTS %s', old_partition);\n"
        "    END IF;\n"
        "END;\n"
        "$$ LANGUAGE plpgsql;",
        lang='sql'))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════
    # CHAPTER 6 — ALGORITMO DE VIRALIDAD MEJORADO
    # ═══════════════════════════════════════════════════════════════════════
    story.extend(chapter_header(6, 'Algoritmo de Viralidad Mejorado', kicker_text='CAPÍTULO 06 · MATEMÁTICA DEL SCORING'))

    story.append(lead_p(
        'El algoritmo propuesto por el usuario (S = 100·(w1·z(v) + w2·norm(a) + w3·H + w4·origin_quality)·penalty) '
        'es una base correcta pero insuficiente. Esta sección presenta la crítica detallada, el algoritmo mejorado '
        'con fórmulas matemáticas formales, y la justificación de cada componente.'))

    story.append(subsection_header('6.1 · Crítica del algoritmo original'))
    story.append(make_table(
        ['Componente', 'Crítica', 'Mejora propuesta'],
        [
            ['z(v) burst velocidad',
             'Z-score asume Gaussianidad y ventana fija. Frágil ante volatilidad diaria y seasonal patterns.',
             'Robust z-score con mediana + MAD; ventana adaptativa con STL decomposition; combinar con CUSUM online'],
            ['norm(a) aceleración',
             'Segunda derivada del volumen es ruidosísima en series discretas pequeñas. Sensible a 1-2 spikes.',
             'Suavizado Savitzky-Golay o filtro Kalman antes de derivar. Normalizar contra aceleración mediana histórica'],
            ['H(authors) entropía',
             'Colineal con volumen: H crece con N. No distingue 1000 autores orgánicos de 1000 bots coordinados.',
             'Entropía normalizada H/log(N) + complementar con network_velocity (PageRank narrativo) + coordinated_behavior_score'],
            ['origin_quality',
             'Solo mide el primer poster. En Twitter el originador real suele ser ambiguo (RTs, quote tweets, screenshots).',
             'PageRank sobre el grafo de cascada completo + eigenvector centrality del seed + tiempo al primer retweet de alto PageRank'],
            ['penalty(trash)',
             'Único factor escalar aditivo. No descompone modos de ataque distintos (bots vs duplicates vs coordinación).',
             'Producto multiplicativo de 5 sub-penales: bot_score × dup_ratio × low_origin × coordination × promotional'],
            ['Pesos w1..w4 fijos',
             'No calibrados. El usuario los está adivinando. Diferentes fuentes tienen dinámicas distintas.',
             'Aprender vía regresión logística L2 + isotonic calibration, o Bayesian Optimization sobre precision@k@lead'],
            ['Ausencia de Decay',
             'Narrativa viral de hace 72h sigue con score alto. Terminal muestra narrativas muertas.',
             'Decay(t) = exp(-λ(t-t0)), half-life τ½ = ln(2)/λ con λ por fuente (Twitter 6-12h, GDELT 48h)'],
            ['Ausencia de cross-source',
             'Narrativa que solo existe en Twitter pero no en GDELT/Reddit es sospechosa o weak signal.',
             'Bayesian fusion con likelihoods por fuente + correlación inter-fuente como feature'],
            ['Ausencia de semantic novelty',
             'Tema ya visto 50 veces, aunque tenga volumen, no es emergente.',
             'SemanticNovelty = 1 - max_sim(emb, centroids_históricos) con KNN sobre embeddings históricos'],
            ['Mono-score escalar',
             'Un único score no puede distinguir las 4 fases (alto score puede ser creciendo o formada).',
             'Separar en VelocityScore y MaturityScore; clasificar fase con HMM de 4 estados'],
            ['Sin ground truth',
             'Imposible saber si el algoritmo funciona.',
             'Backtesting sobre eventos etiquetados (GDELT GKG, MemeTracker, Hoaxy/Snopes)'],
        ],
        col_widths=[CONTENT_W*0.20, CONTENT_W*0.40, CONTENT_W*0.40]
    ))
    story.append(body_p(
        'Lo robusto que vale conservar: (a) el esqueleto multiplicativo score × penalty es correcto, permite que una '
        'sola categoría de trash anule la señal; (b) el uso de entropía de Shannon para dispersión es estándar y '
        'sólido; (c) el z-score de velocidad es razonable si se robustifica.'))

    story.append(subsection_header('6.2 · Algoritmo mejorado — fórmula matemática formal'))
    story.append(body_p(
        'Sea n una narrativa, t el tiempo discreto (ventanas Δt de 5-15min para Twitter, 1h para GDELT), s ∈ '
        '{tw, gd, rd, hn, gt} una fuente. El score final compuesto es:'))
    story.extend(code_block(
        "┌─────────────────────────────────────────────────────────────────────────┐\n"
        "│                                                                         │\n"
        "│   S(n,t) = 100 · Vel(n,t) · Mat(n,t)^γ · Pen(n,t) · Decay(t - t<sub>0</sub><super>n</super>)     │\n"
        "│                                                                         │\n"
        "└─────────────────────────────────────────────────────────────────────────┘\n"
        "\n"
        "donde:\n"
        "  Vel(n,t)  ∈ [0,1]   — velocidad de crecimiento actual (momentum)\n"
        "  Mat(n,t)  ∈ [0,1]   — consolidación acumulada (maturity)\n"
        "  γ         ∈ [0.3, 0.7]  — peso de madurez vs momentum (APRENDIDO)\n"
        "  Pen(n,t)  ∈ [0,1]   — producto de 5 sub-penales anti-trash\n"
        "  Decay     ∈ [0,1]   — exp(-λ·Δt), half-life por fuente",
        lang='formula'))

    story.append(subsection_header('6.3 · VelocityScore — qué tan rápido crece AHORA'))
    story.append(body_p(
        'El VelocityScore captura el momentum actual de la narrativa. Es una sigmoide sobre una combinación lineal '
        'de 6 features:'))
    story.extend(code_block(
        "┌─────────────────────────────────────────────────────────────────────────┐\n"
        "│  Vel(n,t) = σ( w<sub>1</sub>·z̃(v) + w<sub>2</sub>·ãcc + w<sub>3</sub>·Ĥ(A) + w<sub>4</sub>·NetVel + w<sub>5</sub>·SemNov   │\n"
        "│                    + w<sub>6</sub>·XSrc(n,t) + b )                                │\n"
        "└─────────────────────────────────────────────────────────────────────────┘",
        lang='formula'))

    story.append(body_p('<b>z̃(v) — robust z-score del volumen</b> usando mediana + MAD en vez de media + desvío:'))
    story.extend(code_block(
        "         v_{n,t} - median_{τ∈W}(v_{n,τ})\n"
        "z̃(v) = ─────────────────────────────────────\n"
        "         1.4826 · MAD_{τ∈W}(v_{n,τ}) + ε",
        lang='formula'))
    story.append(body_p(
        'W es ventana histórica (24-72h). El factor 1.4826 hace MAD estimador consistente del desvío Gaussian. '
        'Esto es robusto a outliers y a picos puntuales que no son bursts reales.'))

    story.append(body_p('<b>ãcc — aceleración normalizada</b> sobre volumen suavizado:'))
    story.extend(code_block(
        "             v̂_{n,t} - 2·v̂_{n,t-1} + v̂_{n,t-2}\n"
        "ãcc  =  ─────────────────────────────────────────\n"
        "                  σ_acc(n) + ε",
        lang='formula'))
    story.append(body_p(
        'v̂ es volumen suavizado con filtro Kalman o Savitzky-Golay. σ_acc(n) es la desviación histórica de la '
        'aceleración de n. Sin suavizado, la segunda derivada de series discretas pequeñas es ruidosísima.'))

    story.append(body_p('<b>Ĥ(A) — entropía de Shannon normalizada</b> de la distribución de autores:'))
    story.extend(code_block(
        "             - Σ_{a∈A} p_a · log(p_a)\n"
        "Ĥ(A)  =  ─────────────────────────────\n"
        "                  log(|A|)",
        lang='formula'))
    story.append(body_p(
        'La normalización por log(|A|) corrige el sesgo pro-volumen: 1000 autores únicos orgánicos y 1000 bots '
        'coordinados tendrían H similar sin normalizar, pero con Ĥ se distinguen mejor. p_a = count_a / Σcount.'))

    story.append(body_p('<b>NetVel — network velocity (PageRank narrativo)</b> midiendo cómo crece la centralidad del seed:'))
    story.extend(code_block(
        "NetVel(n,t) = d/dt [ PR_{G_{n,t}}(u_★) ]",
        lang='formula'))
    story.append(body_p(
        'G_{n,t} es el subgrafo de cascada de la narrativa (nodos=usuarios, aristas=RT/quote/reply), u_★ el seed '
        '(originador atribuido). Mide cómo crece la centralidad del seed — captura "este tweet está siendo amplificado '
        'por nodos influyentes", no solo por volumen.'))

    story.append(body_p('<b>SemNov — semantic novelty</b> midiendo qué tan inesperado es el tema:'))
    story.extend(code_block(
        "SemNov(n,t) = 1 - max_{c ∈ C_hist} cos(e_n, μ_c)",
        lang='formula'))
    story.append(body_p(
        'C_hist es el set de centroides de narrativas históricas (últimos 30 días), e_n el embedding promedio de n. '
        '1 = totalmente inesperado, 0 = tópico ya conocido. Esto permite priorizar narrativas nuevas sobre '
        'repeticiones de temas ya vistos.'))

    story.append(body_p('<b>XSrc — cross-source amplification</b> bayesiano:'))
    story.extend(code_block(
        "XSrc(n,t) = P(viral | e^(tw), e^(gd), e^(rd), e^(hn), e^(gt)) - P<sub>0</sub>",
        lang='formula'))
    story.append(body_p(
        'Posterior bayesiano centrado respecto al prior P<sub>0</sub>. Si la narrativa fue detectada en múltiples fuentes, '
        'XSrc sube. Si solo en Twitter, baja (potencial bot campaign o nativa de Twitter).'))

    story.append(subsection_header('6.4 · MaturityScore — qué tan consolidada está'))
    story.append(body_p(
        'MaturityScore captura cuán consolidada está la narrativa. Es ortogonal a Vel: una narrativa puede tener Vel '
        'alto pero Mat bajo (formándose), o Vel bajo pero Mat alto (formada/decaída).'))
    story.extend(code_block(
        "┌─────────────────────────────────────────────────────────────────────────┐\n"
        "│  Mat(n,t) = σ( α<sub>1</sub>·log(Σ v_{n,τ}) + α<sub>2</sub>·Ĥ̄(A) + α<sub>3</sub>·|S_conf(n,t)|        │\n"
        "│                + α<sub>4</sub>·depth(G_{n,t}) + α<sub>5</sub>·age(n,t)_capped )              │\n"
        "└─────────────────────────────────────────────────────────────────────────┘",
        lang='formula'))
    story.append(make_table(
        ['Término', 'Significado', 'Rango'],
        [
            ['Σ v_{n,τ}',           'Volumen acumulado (consolidación por repetición)',     'log(0) a log(∞)'],
            ['Ĥ̄(A)',                'Entropía media integrada en el tiempo (diversidad sostenida)', '0 a 1'],
            ['|S_conf(n,t)|',       'Número de fuentes distintas que confirmaron n',       '0 a 5'],
            ['depth(G_{n,t})',      'Profundidad media del árbol de cascada (cascadas profundas = consolidadas)', '0 a ∞'],
            ['age(n,t)_capped',     'Edad saturada (no premiar puramente la antigüedad)', '0 a T_max'],
        ],
        col_widths=[CONTENT_W*0.22, CONTENT_W*0.58, CONTENT_W*0.20],
        mono_cols=[0, 2]
    ))

    story.append(subsection_header('6.5 · Trash Penalty — multiplicativo de 5 sub-factores'))
    story.append(body_p(
        'El penalty es el componente más importante del algoritmo. Sin él, el sistema se vuelve un espejo de bots. '
        'Es un <b>producto</b> (no suma) porque si cualquier sub-factor colapsa a 0, el score total debe ir a 0:'))
    story.extend(code_block(
        "┌─────────────────────────────────────────────────────────────────────────┐\n"
        "│  Pen(n,t) = Π_{i=1..5} p_i(n,t),    p_i ∈ [0,1]                        │\n"
        "└─────────────────────────────────────────────────────────────────────────┘",
        lang='formula'))
    story.append(make_table(
        ['Sub-factor p_i', 'Significado', 'Modelo / fuente'],
        [
            ['p<sub>1</sub> bot_score',
             'Fracción estimada de cuentas bot',
             'Isolation Forest + graph features (degree, reciprocity, account age) + clasificador Botometer-like'],
            ['p<sub>2</sub> duplicate_ratio',
             'Ratio de menciones near-duplicate',
             'MinHash / SimHash sobre texto normalizado, Jaccard threshold 0.85'],
            ['p<sub>3</sub> low_quality_origin',
             '1 - autoridad del seed',
             'Invertir origin_quality normalizado (ver §6.6)'],
            ['p<sub>4</sub> coordinated_behavior',
             'Score de coordinación temporal',
             'Cross-correlation de timestamps por pares de usuarios + clustering espectral'],
            ['p<sub>5</sub> promotional_content',
             'Ratio de contenido comercial/spam',
             'URL ratio, hashtag stuffing, classifier (regex + transformer)'],
        ],
        col_widths=[CONTENT_W*0.22, CONTENT_W*0.30, CONTENT_W*0.48]
    ))
    story.extend(callout_box(
        'PRODUCTO, NO SUMA',
        'El producto (no la suma) es crítico: si cualquier sub-factor colapsa a 0, el score total debe ir a 0. '
        'Con suma, un solo término bajo no aniquila el score. Esto significa que una narrativa con bot_score=0.1 '
        'pero alta calidad en otros aspectos NO se promociona al top del feed, porque el producto la penaliza '
        'completamente.',
        color=ACC_DECAY
    ))

    story.append(subsection_header('6.6 · Origin Quality Score — multi-componente'))
    story.append(body_p(
        'El origin_quality no debe ser solo "PageRank del primero". Se descompone en 6 componentes que capturan '
        'distintas dimensiones de calidad del iniciador:'))
    story.extend(code_block(
        "origin_quality(initiator) = 0.25·history_in_topic\n"
        "                          + 0.20·engagement_quality\n"
        "                          + 0.20·network_position\n"
        "                          + 0.15·account_authenticity\n"
        "                          + 0.10·temporal_priority\n"
        "                          + 0.10·cross_source_corroboration",
        lang='formula'))
    story.append(make_table(
        ['Componente', 'Cálculo', 'Peso'],
        [
            ['history_in_topic',         '% posts históricos del iniciador sobre el tema (últimos 90d)',      '0.25'],
            ['engagement_quality',       'Ratio (engagement/followers) normalizado, peso replies > likes',  '0.20'],
            ['network_position',         'PageRank + betweenness en grafo del tema',                         '0.20'],
            ['account_authenticity',     '1 − bot_probability(GNN), edad, perfil, historial 90d',           '0.15'],
            ['temporal_priority',        '1 si verdadero primer post público (no recycled)',                  '0.10'],
            ['cross_source_corroboration','Aparece en GDELT/Reddit con timestamp cercano',                   '0.10'],
        ],
        col_widths=[CONTENT_W*0.30, CONTENT_W*0.55, CONTENT_W*0.15],
        mono_cols=[2]
    ))
    story.append(body_p(
        'Caso ilustrativo: hashtag político #X. Escenario A — periodista con 5 años en el tema: history_in_topic=0.9, '
        'engagement_quality=0.8, network_position=0.85, account_authenticity=0.95 → origin_quality = 0.85. Escenario B '
        '— cuenta nueva, 12k followers, 0 engagement: history_in_topic=0.1, engagement_quality=0.05, '
        'account_authenticity=0.2 → origin_quality = 0.10. La narrativa se relega hasta corroboración. Los bots '
        'macedonios de 2016 tenían cuentas creadas 3-6 meses antes → origin_quality ≈ 0.18 → correcta penalización.'))

    story.append(subsection_header('6.7 · Decay temporal — half-life por fuente'))
    story.append(body_p(
        'Sin decay, narrativas viejas siguen con score alto y la terminal se llena de muertos. Decay exponencial '
        'suave y diferenciable:'))
    story.extend(code_block(
        "Decay(Δt) = exp(-λ · Δt),    λ = ln(2) / τ½",
        lang='formula'))
    story.append(make_table(
        ['Fuente', 'Half-life τ½ sugerido', 'Justificación'],
        [
            ['Twitter',        '6-12 h',  'Vida media de trending topics'],
            ['Reddit',         '18-24 h', 'Frontpage rotation'],
            ['Hacker News',    '24 h',    'Ciclo daily'],
            ['GDELT',          '48 h',    'Cadencia de cobertura mediática'],
            ['Google Trends',  '72 h',    'Reporting lag'],
        ],
        col_widths=[CONTENT_W*0.22, CONTENT_W*0.25, CONTENT_W*0.53],
        mono_cols=[1]
    ))
    story.append(body_p(
        'Cuando el HMM detecta estado "decaída", se acelera el decay multiplicando λ por β_decay ∈ [2,5]. Así una '
        'narrativa en fase de muerte desaparece rápido del ranking. Exponential decay es preferible a sliding window '
        'puro porque es suave y diferenciable, ideal para gradient-based learning de λ.'))

    story.append(subsection_header('6.8 · Aprendizaje de pesos — Bayesian Optimization'))
    story.append(body_p(
        'Los pesos w<sub>1</sub>..w<sub>6</sub> y α<sub>1</sub>..α<sub>5</sub> NO son fijos. Se aprenden vía dos métodos complementarios:'))
    story.append(bullet_p(
        '<b>Regresión logística L2 + isotonic calibration</b>: target binario y_{n,t} = 1 si n alcanza "viralidad real" '
        '(v_{n,t\'} ≥ θ_viral dentro de ventana ΔT_horizon = 6h). Esto define lead time supervisado.'))
    story.append(bullet_p(
        '<b>Bayesian Optimization sobre precision@k@lead</b>: cuando la métrica de negocio no es diferenciable. '
        'BO con GP surrogate + Expected Improvement, 50-200 evaluaciones, Optuna. Útil porque precision@k@lead es '
        'no diferenciable y ruidosa.'))
    story.append(body_p(
        'Anti-overfitting crítico: walk-forward estricto (entrenar en [T<sub>0</sub>, T<sub>1</sub>], validar en [T<sub>1</sub>, T<sub>1</sub>+Δ], deslizar; '
        'nunca aleatorizar), L2 fuerte (~10<super>-</super><super>3</super>) por colinealidad entre features, Bayesian priors N(0, σ<super>2</super>) para '
        'estabilizar.'))

    story.append(subsection_header('6.9 · Cross-source fusion — bayesiano con correlación'))
    story.append(body_p(
        'Sea e^{(s)}_t ∈ {0,1} la evidencia "fuente s muestra actividad anómala de n en t". Bajo asunción de '
        'independencia condicional (falsa pero útil como baseline):'))
    story.extend(code_block(
        "P(viral | e^(tw), ..., e^(gt)) = P(viral) · Π_s P(e^(s) | viral) / P(e^(tw), ..., e^(gt))",
        lang='formula'))
    story.append(body_p(
        'Posterior odds (forma cómoda para logs):'))
    story.extend(code_block(
        "log [ P(viral|e) / P(¬viral|e) ] = log [ P(viral) / P(¬viral) ]\n"
        "                                  + Σ_s log[ TPR^(s) / FPR^(s) ] · e^(s)\n"
        "                                  + Σ_s log[ (1-TPR^(s)) / (1-FPR^(s)) ] · (1-e^(s))",
        lang='formula'))
    story.append(body_p(
        'La asunción de independencia es falsa (Twitter y Reddit se influyen mutuamente). Solución: stacking con '
        'LightGBM como meta-learner sobre predicciones per-source. El meta-modelo aprende implícitamente las '
        'correlaciones. Además, la varianza inter-fuente se usa como feature explícita:'))
    story.extend(code_block(
        "Discrepancy(n,t) = Var_s [ Vel^(s)(n,t) ]",
        lang='formula'))
    story.append(body_p(
        'Alta discrepancia = señal de manipulación monocanal o de evento source-specific. Esto es un feature, '
        'no ruido: cuando Twitter muestra alta velocidad pero GDELT no, algo raro está pasando.'))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════
    # CHAPTER 7 — MODELO DE 4 FASES Y BURST DETECTION
    # ═══════════════════════════════════════════════════════════════════════
    story.extend(chapter_header(7, 'Modelo de 4 Fases y Burst Detection', kicker_text='CAPÍTULO 07 · CLASIFICACIÓN TEMPORAL'))

    story.append(lead_p(
        'Las 4 fases (formándose / creciente / formada / decaída) se modelan como estados latentes de un HMM, no como '
        'umbrales ad-hoc del score. El burst detection usa CUSUM online (latencia <30s) + Kleinberg offline '
        '(jerarquía de bursts, batch diario). El lead time se define como t_alert - t_peak.'))

    story.append(subsection_header('7.1 · Por qué no thresholds ad-hoc'))
    story.append(body_p(
        'Cualquier regla tipo "Vel > 0.7 ⇒ creciente" es frágil: los rangos cambian por fuente, por temporada, por '
        'tipo de evento. Necesitamos un modelo que capture la dinámica temporal como transición entre estados '
        'latentes. El HMM (Hidden Markov Model) es el modelo canónico para esto: estados ocultos (las 4 fases) '
        'que emiten observaciones (el vector de features), con matriz de transición que captura la progresión '
        'natural forming → rising → formed → decaying.'))

    story.append(subsection_header('7.2 · HMM de 4 estados'))
    story.append(body_p(
        'Estados latentes S = {s_form, s_grow, s_mat, s_dec}. Matriz de transición estructurada (las narrativas '
        'progresan, no saltan arbitrariamente):'))
    story.extend(code_block(
        "       ┌                                        ┐\n"
        "       │ 0.85  0.13   0     0.02   │  ← forming │\n"
        "  A =  │ 0     0.80  0.18  0.02    │  ← growing │\n"
        "       │ 0     0     0.85  0.15    │  ← mature  │\n"
        "       │ 0     0     0     1.00    │  ← decaying (ABSORBENTE)│\n"
        "       └                                        ┘\n"
        "\n"
        "  a_fd pequeño (algunas narrativas mueren sin madurar)\n"
        "  a_dd = 1 (estado absorbente — narrativa decaída no revive)\n"
        "  Si revive, se considera nueva instancia de narrativa",
        lang='formula'))
    story.append(body_p(
        'Emisiones: Gaussianas multivariadas sobre el vector de features observables o_t = (Vel, Mat, dv/dt, ΔH, '
        'XSrc) ∈ ℝ<super>5</super>. b_j(o_t) = N(o_t; μ_j, Σ_j). Inferencia: Viterbi para estimar la trayectoria más probable de '
        'estados (offline, para backtesting); filter forward para estimación online del estado actual.'))

    story.append(subsection_header('7.3 · Features discriminativas por fase'))
    story.append(make_table(
        ['Fase',         'Vel',         'Mat',          'dv/dt',         'ΔH',            'XSrc'],
        [
            ['Formándose',  'medio-alto',  'bajo',          '> 0, creciente', 'creciente',     'bajo-medio (1 fuente)'],
            ['Creciente',   'alto',        'medio',         '> 0, pico',      'alto, estable', 'medio (2-3 fuentes)'],
            ['Formada',     'medio-bajo',  'alto',          '≈ 0',            'alto, estable', 'alto (≥3 fuentes)'],
            ['Decaída',     'bajo',        'alto (decay)',  '< 0',            'decay',         'decay'],
        ],
        col_widths=[CONTENT_W*0.16, CONTENT_W*0.14, CONTENT_W*0.16, CONTENT_W*0.18, CONTENT_W*0.18, CONTENT_W*0.18]
    ))
    story.append(body_p(
        'Esta tabla muestra cómo las features discriminan las fases. La combinación (Vel alto + Mat bajo + dv/dt '
        '> 0 + XSrc bajo) es la firma inequívoca de "formándose" — la narrativa está creciendo rápido pero aún no '
        'está consolidada ni confirmada por múltiples fuentes. Es exactamente el momento donde el producto agrega valor.'))

    story.append(subsection_header('7.4 · Burst detection — CUSUM online + Kleinberg offline'))
    story.append(body_p(
        'El burst detection identifica el momento exacto en que una narrativa "explota". Se usan dos algoritmos '
        'complementarios:'))
    story.append(make_table(
        ['Algoritmo', 'Tipo',     'Online?', 'Captura',                  'Cuándo usar'],
        [
            ['CUSUM',   'Sequential test', 'Sí',  'Punto de cambio (cambio de media)', 'Online low-latency en la terminal (<30s)'],
            ['Kleinberg','HMM gamma-states','Offline','Jerarquía de bursts multi-escala', 'Backtesting, batch diario, refrescar parámetros'],
            ['PELT',    'Changepoint penalizado','Offline','Múltiples changepoints',     'Segmentación post-hoc para análisis'],
            ['Adams-MacKay','Bayesian online','Sí','Run-length posterior',              'Cuando hay incertidumbre cuantificable'],
        ],
        col_widths=[CONTENT_W*0.13, CONTENT_W*0.20, CONTENT_W*0.10, CONTENT_W*0.30, CONTENT_W*0.27]
    ))

    story.append(body_p('<b>CUSUM one-sided robust</b> con baseline EWMA (no asume media constante):'))
    story.extend(code_block(
        "S_t<super>+</super> = max(0, S_{t-1}<super>+</super> + (v_{n,t} - μ<sub>0</sub>)/σ - k)\n"
        "Alarma si S_t<super>+</super> > h\n"
        "\n"
        "k (slack)    ≈ δ/2 · σ, donde δ es magnitud mínima de shift a detectar (0.5σ-2σ)\n"
        "h (umbral)   se calibra vía ARL (Average Run Length), típicamente h ∈ [4σ, 6σ]\n"
        "μ<sub>0</sub>, σ        se estiman online vía EWMA:  μ<sub>0</sub> ← μ<sub>0</sub> + α·(v - μ<sub>0</sub>)",
        lang='formula'))

    story.append(body_p(
        '<b>Kleinberg</b> modela los gaps entre posts como exponenciales con tasa α_i en estado i. Un burst es '
        'transición a estado de mayor α. Detecta jerarquías de bursts (sub-bursts dentro de bursts), útil para '
        'distinguir "creciendo" de "pico". Cuando CUSUM dispara alarma en t*, marcamos t* como burst onset. El '
        'origin_quality se recalcula mirando el autor del primer post antes de t* (no el primer post de la '
        'narrativa, porque a veces la narrativa duerme días antes de explotar). El lead time del sistema:'))
    story.extend(code_block(
        "Δt_lead = t_alert - t_peak",
        lang='formula'))
    story.append(body_p(
        'Negativo = anticipación correcta. Se reporta la distribución (no solo la media) porque los outliers '
        'positivos (detección muy temprana) son los casos de mayor valor.'))

    story.append(subsection_header('7.5 · Resurrection probability'))
    story.append(body_p(
        'Una narrativa en estado "decaída" puede revivir (resurrection). El HMM estándar con estado absorbente no '
        'permite esto, así que se modela como una nueva instancia. Pero computacionalmente queremos detectar el '
        'revival: si en los últimos 7 días una narrativa decaída muestra σ re-emerging > 0.3, se computa:'))
    story.extend(code_block(
        "P(resurrection | decaying, σ_re-emerging > 0.3) ≈ P(rising | features)",
        lang='formula'))
    story.append(body_p(
        'Si la probabilidad es >20%, la UI muestra un banner sutil "WATCH THIS — resurrection 12%". Esto es útil '
        'para el flujo "explorar narrativa decaída" del usuario que busca segundas olas.'))

    story.append(subsection_header('7.6 · Validación del modelo'))
    story.append(body_p(
        'Métricas para validar el HMM y el burst detector:'))
    story.append(make_table(
        ['Métrica', 'Definición', 'Cuándo importa'],
        [
            ['Precision@k@lead', 'Fracción de Top-k alertas que fueron virales reales Y con anticipación ≥ δ_min al peak', 'Métrica principal de negocio'],
            ['Recall@k',          'Fracción de eventos virales reales capturados en Top-k',                              'Si el costo de perderse un evento es alto'],
            ['Lead time',         'Δt_lead = t_alert - t_peak (negativo = anticipación correcta)',                       'Distribución, no solo media'],
            ['False Positive Rate','# alertas no-virales / # no-virales totales',                                        'Costo operacional de falsos positivos'],
            ['MCC',               'Matthews Correlation Coefficient para fases (balanceado ante clases desbalanceadas)', 'Evaluación del HMM'],
            ['Brier score',       'Calibración de probabilidades',                                                       'Si se usan scores como probabilidades'],
            ['ARL',               'Average Run Length para CUSUM (latencia esperada de detección)',                       'Tuning del burst detector'],
        ],
        col_widths=[CONTENT_W*0.22, CONTENT_W*0.50, CONTENT_W*0.28]
    ))
    story.append(body_p(
        'Backtesting metodológico: walk-forward estricto (prohibido aleatorizar timestamps), sin look-ahead bias '
        '(cualquier feature que use info posterior a t debe ser eliminado — cuidado con z-score usando mediana que '
        'incluye el futuro), event-level evaluation (no post-level), stratified by source, ablation studies (correr '
        'el score sin SemNov, sin XSrc, sin Decay para medir contribución marginal).'))

    story.append(PageBreak())

    return story


if __name__ == '__main__':
    print("This module is imported by generate_pdf.py — use that script to build the PDF.")
