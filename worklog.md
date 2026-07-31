---
Task ID: 5
Agent: Estratega Anti-Gaming
Task: Debater estrategia y anti-gaming de Terminal de Viralidad

Work Log:
- Leí el directorio /home/z/my-project/ — worklog.md no existía, soy uno de los primeros agentes.
- Desarrollé análisis estratégico completo en /home/z/my-project/agent5_estrategia_anti_gaming.md con 14 secciones:
  1. Resumen ejecutivo (postura estratégica)
  2. Modelo de 4 fases (definición matemática, transiciones, duraciones)
  3. Weak signals / pre-burst detection (features, casos reales: Fyre Festival, GameStop)
  4. Anti-gaming model (taxonomía de amenazas, 21 features, 3 capas: heurísticas + Isolation Forest + GNN, código conceptual)
  5. Cross-validation matrix (Twitter + GDELT + Reddit + HN + Google Trends, reglas bayesianas)
  6. Origin quality score (fórmula de 6 componentes, casos ilustrativos)
  7. 5 workflows concretos: periodista, trader cripto, marca, OSINT, analista político
  8. Sistema de alertas con anti-fatigue
  9. 5 killer features vs Twitter Trending
  10. Roadmap MVP (4 sem) / v1 (3 meses) / v2 (6 meses)
  11. Ética y legalidad (riesgos + 8 mitigaciones)
  12. Métricas de éxito del producto (incl. North Star: lead time accionable)
  13. 3 preguntas para otros agentes (arquitecto, backend, frontend)
  14. Postura final
- Critiqué el score propuesto S = 100×(w1·z(v)+w2·norm(a)+w3·H+w4·origin)×penalty por: (a) no tener coordenada temporal → imposible distinguir fases, (b) suma ponderada en vez de producto de probabilidades condicionales, (c) penalty(trash) sub-considerado.
- Propuse reformulación: phase(n) = argmax P(phase | features) y S(n) = P(creciente|features)·(1−trash)·origin_quality — score de "oportunidad", no de magnitud.
- Cité casos reales: Fyre Festival (lead time 48h), GameStop/AMC (5-10 días), Cambridge Analytica (>2 años pre-burst), bots macedonios 2016.

Stage Summary:
- El score original es ingenuo: no distingue fases temporales ni prioriza pre-burst. Reformular con probabilidades condicionales y coordenada temporal t por narrativa.
- penalty(trash) debe ser sub-sistema de primera clase con 3 capas: heurísticas deterministas (8 reglas), Isolation Forest (anomalía no supervisada), GNN/GraphSAGE (bot detection por grafo). Trash score combinado 0.4·heur+0.3·IF+0.3·GNN con umbrales <0.3 limpio / 0.3-0.6 flag / >0.6 ocultar.
- Cross-validation es la clave anti-gaming: narrativa sólo en Twitter = sospechosa; Twitter+GDELT+Reddit = legit; GDELT/Reddit sin Twitter = pre-burst (lo más valioso). Bayesian con likelihood ratios por fuente.
- 5 killer features: lead time, anti-gaming transparente (badge legitimacy), cross-source corroboration visible, workflows curados por rol, origin attribution.
- Roadmap: MVP 4 semanas (Twitter+GDELT+Reddit+heurísticas+1 workflow OSINT), v1 3 meses (GNN+multi-rol+origin quality completo+API pública), v2 6 meses (multi-idioma+Telegram/BlueSky+predictive modeling+graph exploration UI+marketplace de watchlists).
- North Star metric: lead time accionable medio ponderado por precision.
- Riesgos éticos principales: scraping Twitter (mitigado con API v2), GDPR (opt-out + DPO), difamación por false-positive bot (disclaimer + score con incertidumbre), uso malicioso por estados (TOS restrictivos).
- Preguntas pendientes para otros agentes: (a) Agente #1 sobre latencia <5min y viabilidad de GNN en tiempo real, (b) Agente #3 sobre reformulación del score y Isolation Forest <50ms, (c) Agente #2 sobre UX de 4 fases + legitimacy badges + 5 roles.

Task ID: 3
Agent: Designer UX/UI Senior
Task: Debater diseño de Terminal de Viralidad

Work Log:
- Leí worklog.md: Agent #2 (Científico de Datos) ya entregó postura sobre algoritmo (HMM para 4 fases, VelocityScore/MaturityScore separados, CUSUM+Kleinberg para burst). Tomé posición como Agent #3 alineando mis 4 fases visuales con sus 4 estados HMM.
- Defendí postura "Bloomberg Terminal meets Linear": fondo #0A0E14, JetBrains Mono para datos + Inter para prosa, acentos semánticos (#2DD4BF rising, #FBBF24 forming, #94A3B8 peaked, #F87171 decaying).
- Especificé sistema de diseño completo: paleta con 24 hex exactos, escala mono (10-24px) + sans (11-20px), spacing 4px grid, radius 0-8px (deliberadamente pequeño para feel terminal), sombras con borders en vez de drop-shadows.
- Diseñé 3 wireframes ASCII: (1) Terminal default multi-panel (ticker 36px / left 320px / center flex / right 360px / accel 80px / hint 24px), (2) Detalle de narrativa con timeline + key accounts + lifecycle track, (3) Vista comparativa con overlaid velocity curves + phase matrix + cross-correlation.
- Mapeé las 4 fases a UI: tabla con color/icono/animación/badge/ejemplo para forming (◇ ámbar pulse), rising (▲ teal glitch), peaked (● slate quieto), decaying (▽ rojo dashed opacity 0.7).
- Definí real-time UX: SSE con throttle 100ms vía requestAnimationFrame, cap 50 menciones en right panel, visibility API para pausar animaciones, connection indicator stepped (live/syncing/offline), sonido opcional off-by-default.
- Especificé uso de reactbytes: SÍ en boot, inserción de mención nueva, burst events, score glitch >5%, search overlay, connection lost. NO en hover, charts, static panels, cada keystroke, más de 2 typewriters simultáneos.
- Elegí visx como librería principal de charts (componible, React-first, terminal-density friendly) sobre Recharts/Nivo/D3 puro. Sparklines y heatmaps custom SVG para overhead mínimo.
- Documenté 4 flujos de usuario step-by-step: descubrir emergente (j/k → enter → s → g), monitorear activa (tab cycle + burst detection), explorar decaída (f filter → r resurrection), comparar (c → tray → enter → matrix).
- Detallé 14 microinteracciones con timing exacto (hover 100ms, score count-up 200ms, glitch 120ms, burst 800ms, etc.).
- Escribí 3 snippets TypeScript/React production-ready: NarrativeRow con typewriter condicional + memo con comparator custom, hook useLiveStream SSE con throttle RAF + useTransition + visibility API, PhaseBadge con framer-motion cross-fade + pulse CSS.
- Enuncié 7 principios senior (densidad > whitespace, color semántico, mono/sans separados, animación al servicio de cognición, una fuente de verdad por panel, estado siempre visible, keyboard-first).
- Definí accesibilidad: WCAG AA/AAA contrast verificado, prefers-reduced-motion con fallbacks, 11 keyboard shortcuts vim-style, ARIA live regions polite para mentions y assertive para connection status.
- Listé 7 anti-patrones: no glassmorphism, no card-based dashboard, no gradientes decorativos, no animaciones >1s (salvo boot), no modales centrados, no dark/light toggle, no emoji como iconos.
- Planté 4 preguntas para otros agentes: (a) a Data Scientist: ¿phase viene del backend o infiero en frontend? ¿threshold sigma para glitch?; (b) a Backend: latencia P99 del stream para decidir throttle; (c) a PM: floor mínimo mobile.

Stage Summary:
- Postura: terminal densa multi-panel estilo Bloomberg (no card-based), dark-mode only, mono+sans estrictamente separados, color 100% semántico, reactbytes reservado para momentos cognitivos (no decoración).
- Entregable: documento Markdown con sistema de diseño completo (24 hex, 2 escalas tipográficas, spacing 4px, radius pequeño), 3 wireframes ASCII, tabla de 4 fases con UI, reglas de real-time (SSE throttle 100ms, cap 50 menciones, visibility API), catálogo de charts (visx principal + SVG custom), 4 flujos user, 14 microinteracciones, 3 snippets TypeScript (NarrativeRow/useLiveStream/PhaseBadge), 7 principios, 7 anti-patrones, 12 keyboard shortcuts, accesibilidad WCAG.
- Decisiones clave para alinear con equipo: (1) mis 4 fases visuales se mapean 1:1 con HMM del Agent #2 (forming→forming, growing→rising, mature→peaked, decaying→decaying); (2) necesito confirmación de Agent #1 sobre latencia P99 para throttle; (3) necesito OK del PM sobre no-optimizar mobile <1280px.

Task ID: 6
Agent: Product Strategist (Agent #3 — contexto FOGÓN)
Task: Proponer 10 features concretas para mejorar funcionalidad de FOGÓN manteniendo UX simple

Work Log:
- Leí worklog.md, README.md, src/lib/agents/phase.ts y public/fogon-ui-mockup.html (570 líneas) para entender el estado actual de FOGÓN: grilla de 6 cards con 4 estados (por nacer/nacida/creciendo/muriendo), panel de detalle lateral con briefing Nemotron + velocity + sparkline + sources + mentions, acciones atizar/guardar (ahogar mencionado en el prompt pero no visible en mockup).
- Mapeé las 5 preguntas del brief a features específicas: (P1 decisión → #2 baseline absoluto + #3 originator + #10 explicación de fase; P2 acciones → #7 snooze + #8 exportar + #9 semillas; P3 linaje → #1 transiciones en sparkline + #5 lead time vs medios; P4 datos no mostrados → URLs verificables, karma/seguidores originador, subreddit/instancia, delay pub→detección; P5 anti-loss → #4 "casi la atizaste" con flag peekedAt en localStorage).
- Filtré features genéricas: descarté "notificaciones", "filtros avanzados", "AI chat", "social/comentarios", "dashboard de analytics", "históricos infinitos", "bookmarking con tags". Las clasifiqué en sección "LO QUE NO AGREGAR" con justificación por cada una.
- Escribí entregable agent3_funcionalidad_mejorada.md con: tabla de 10 features (#/feature/problema/implementación/prioridad), TOP 3 must-have (#5 lead time, #2 baseline absoluto, #4 revival), TOP 3 nice-to-have (#1 transiciones sparkline, #3 originator, #8 exportar), LO QUE NO AGREGAR (7 features vetadas), notas de implementación (cuáles son cero-costo en infra, cuáles añaden llamadas Nemotron, cuál requiere migración DB).

Stage Summary:
- Postura: FOGÓN no necesita más features, necesita evidencia (lead time verificable vs. medios), contexto (baseline absoluto + cuentas únicas + originator attribution) y memoria (revival de trends vistas pero no atizadas). Sin estas 3, el producto no completa la promesa "detectar antes que nadie".
- 4 de las 10 features son cero-costo en infra (#1 transiciones sparkline, #2 baseline, #4 revival, #10 explicación fase) — recomendé hacerlas como "fase 1.5" si hay que cortar alcance.
- Solo 2 features añaden llamadas a Nemotron (#3 originator, #9 semillas), ambas 1-shot con cache y fallback barato.
- Único cambio de DB no trivial: tracking de `media_first_seen` para #5 lead time. Resto son frontend + queries a tablas existentes.
- Ninguna feature añade endpoint nuevo — protección intencional de la simplicidad de la API.
- Anti-patterns vetados: push notifications, social/comentarios, dashboard analytics, filtros multi-dimensión, bookmarking con tags, históricos infinitos, AI chat. Cada uno con justificación específica de por qué rompe el contrato "abrir, ver 6 cards, entender, decidir en 30s".

Task ID: 1
Agent: Auditor UI (Auditor de Interfaz y Extracción de Contratos UI)
Task: Extraer contrato UI → backend del frontend existente en /home/z/my-project/

Work Log:
- Leí worklog.md: ya estaban Agent #5 (estrategia anti-gaming), Agent #3 (diseño UX/UI), Agent #6 (FOGÓN features), Agent #2 (referenciado). Tomé posición como Agent #1 con enfoque de ingeniería inversa del código real.
- Listé /home/z/my-project/components/screens/ → 7 archivos: screen-shell, explore, alerts, saved, reports, engines, settings.
- Leí completos 18 archivos: virahub-provider.tsx, lib/virahub-data.ts, lib/scoring.ts (800 líneas), lib/utils.ts, app/page.tsx, app/layout.tsx, hero-card.tsx, live-scan.tsx, trend-timeline.tsx, analysis-panel.tsx, top-bar.tsx, left-rail.tsx, source-icon.tsx, brand-icons.tsx, count-up.tsx, toast.tsx, los 7 screens, screen-shell.tsx.
- Documenté tipo SourceKey: 9 valores ('reddit'|'bluesky'|'hn'|'rss'|'gdelt'|'github'|'x'|'nvidia'|'crypto'), pero solo 7 son motores (nvidia y crypto son "temas"). Cada uno con label ES, color CSS, icon component, tile bg, auth type.
- Documenté tipo Trend (16 campos). Mapeé fielmente los campos del brief (score→confidence, velocity→mentions, phase→shape) y marqué como ❌ NO EXISTE los que faltan (uniqueAuthors, firstSeen, lastSeen, originator, sources, brief, tags, hasMedia, history) — algunos existen en NarrativeMetrics (intermedio en scoring.ts) pero NO en el tipo Trend que consume la UI.
- Propuse AnalysisBriefing (no existe como tipo; el UI lo sintetiza client-side en explore-screen.tsx:296-300 con strings hardcoded "Nemotron-3-Ultra · generado hace 2min", "thinking:false · 312 tokens · 4.2s").
- Documenté EngineStatus: el UI actual solo maneja active/paused (binario), propongo añadir health: 'online'|'degraded'|'offline'. LogEntry type confirmado (id, engine, ts, level: 'info'|'warn'|'error', message).
- Documenté AlertRule (9 campos), TriggeredEvent (8 campos), Note (saved-screen), Folder, ApiKeyState (4 campos), NotificationSettings (11 campos). UserProfile no existe como tipo pero sí los 5 campos sueltos en state.
- Documenté SSE: NO existe EventSource en el código. Propuse 11 eventos: scan.tick, trend.upserted, trend.velocity_spike, trend.phase_changed, engine.status_changed, engine.log_appended, alert.triggered, alert.acknowledged, briefing.generated, report.updated, connection.heartbeat/lost.
- Documenté ScreenKey: 7 valores (radar, explorar, alertas, guardados, motores, informes, ajustes).
- Documenté 9 grupos de endpoints REST: /trends (lista+detalle+briefing+history+save), /engines (lista+toggle+config+test+logs), /alerts (lista+create+patch+delete+ack+ack-all), /saved (lista+pin+patch), /reports, /profile, /notifications, /api-keys (sin devolver plaintext), /system/about, /stream (SSE).
- Identifiqué y numeré todas las simulaciones Math.random/PRNG/setInterval con ruta:linea: virahub-provider.tsx:90-91 (analyzed+latency), live-scan.tsx:100 (progress), top-bar.tsx:41 (waveform sin), virahub-data.ts:176-225 (makeRng+buildSeries), y 7 arrays hardcodeados (TRENDS, INITIAL_RULES, TRIGGERED, INITIAL_LOGS, INITIAL_API_KEYS, PERIOD_DATA, INITIAL_FOLDERS).
- Documenté 14 valores computed/derived que el cliente calcula solo (buildSeries, smoothPath, CountUp, TONE_BY_HEAT, deriveStatus, buildWhy, buildEvidence, hoverLabel, MiniSpark, agoMin formatting, etc.).
- Documenté 14 optimistic updates actuales con ruta:linea exacta.
- Documenté 12 triggers de refetch propuestos, 6 triggers de reconexión SSE, y 17 strings de toast que el backend no debe reproducir pero sí emitir eventos mapeables.
- Crítica de seguridad: settings-screen.tsx:638-640 dice "Las claves se cifran en reposo y nunca se exponen al cliente" pero la UI actual rompe esto guardando plaintext en state. El backend GET /api-keys NO debe devolver key en claro, solo masked+status.

Stage Summary:
- El frontend VIRAHUB es 100% mock: cero fetches, cero EventSource. Todo "live data" es setInterval + Math.random + PRNG LCG determinista.
- Contrato real Trend (16 campos) es mucho más simple que lo que el brief pedía: NO tiene uniqueAuthors, firstSeen, lastSeen, originator, sources, brief, tags, hasMedia, history — esos existen solo en NarrativeMetrics (intermedio de scoring.ts) o no existen. El backend puede elegir exponerlos extendiendo Trend o dejar que el cliente siga calculándolos.
- Contrato SourceKey tiene 9 valores, pero ENGINES (toggleable) solo tiene 7. 'nvidia' y 'crypto' son SourceKeys para trends no motores.
- 7 pantallas (ScreenKey): radar, explorar, alertas, guardados, motores, informes, ajustes.
- 11 eventos SSE propuestos (ninguno existe), 9 grupos de endpoints REST propuestos (ninguno existe), 14 optimistic updates documentados (todos locales, sin persistencia entre sesiones).
- Hallazgo crítico de seguridad: apiKeys se guardan en state local del cliente, rompiendo el contrato declarado en settings-screen.tsx:638. El backend debe validar server-side y nunca devolver plaintext.
- Hallazgo de UX: trending history es generado client-side por PRNG determinista (buildSeries), por lo que las sparklines NO reflejan datos reales — el backend debería enviar history[] opcional, y el cliente degradar a buildSeries() solo si 404/timeout.
- Entregable: /home/z/my-project/agent1_contratos_ui.md (10 secciones + 2 apéndices, ~700 líneas, con citas literales de código TS y ruta:linea para cada afirmación).
- Para el próximo agente (backend): leer §8 del archivo para el catálogo completo de endpoints, §9 para no enviar campos que el cliente ya calcula, §10.3 para replicar el patrón optimistic-update+toast al migrar a mutaciones server-side.

---

---
Task ID: PIVOT-2.0
Agent: Arquitecto Jefe (viraje v2.0)
Task: Reescribir el Documento Técnico Maestro como v2.0 "Local-First Zero-Cost Prototype" incorporando CloakBrowser 0.5.2, Ollama y Docker Compose como pilares centrales. Costo objetivo: $0/mes.

Work Log:
- Leí worklog.md para entender contexto previo (contratos UI extraídos, doc v1.0 analizado).
- Inspeccioné /home/z/my-project/download/VIRAHUB-Doc-Tecnico-Backend.html (2523 líneas, v1.0) para entender el estilo visual y estructura.
- Creé /home/z/my-project/download/VIRAHUB-Doc-Tecnico-Backend-v2.html como documento nuevo (no sobrescribir v1).
- Diseñé CSS con paleta dual: violeta (v1.x heredado) + cyan (CloakBrowser) + amber (Ollama) + mint (Docker local) + lime ($0/mes).
- Estructuré en 15 secciones (00–14) con banner de pivote, 3 tarjetas de pilares, banner de costo $0/mes, diagramas ASCII coloreados.
- Sección 00 — Resumen Ejecutivo: tabla diff v1.x → v2.0 con 15 filas (X API, Reddit API, NIM, Supabase, Upstash, Vercel → CloakBrowser/Ollama/Docker), capacidad operativa sobre hardware mínimo, cost-banner $0/mes.
- Sección 01 — Principios: 6 principios (Local-First, Zero-Cost, AAA Quality, Resilience, No Mocks, Tipo End-to-End) con diagrama del flujo E2E.
- Sección 02 — Contratos UI/API: tipos canónicos (SourceKey, Trend, AnalysisBriefing, EngineStatusDTO, AlertRuleDTO, SavedTrendDTO), tabla de 11 eventos SSE, catálogo de 16 endpoints REST, valores derivados.
- Sección 03 — Ingesta con CloakBrowser 0.5.2 (PILAR NUEVO, ~570 líneas): visión general, integración vía mini-servicio en :3030, ScrapeRequest/ScrapeResponse contracts, Adapter pattern, Worker Pool con Playwright + patched Chromium, fingerprint rotation (UA pool, locales, timezones, viewports, WebGL/Canvas/Audio seeds), BullMQ queue topology (11 colas), HTML→JSON extraction patterns, implementación detallada de RedditAdapter (old.reddit.com/.json) y XAdapter (x.com/search con article[data-testid="tweet"] selector + parseTweetHtml), RSS fallback, públicos (HN/GDELT/GitHub/Bluesky) sin cloak, Worker de Enriquecimiento Multimodal (OCR + captioning), tabla de resilience por fuente.
- Sección 04 — Procesamiento con Ollama (PILAR NUEVO, ~450 líneas): pipeline 8 etapas, MinHash LSH (128 perm, 32 bands, 4 rows, Jaccard 0.85) sin cambios, embeddings con Ollama nomic-embed-text 384-dim (con cache LRU + persistencia BD + batching), NER con Ollama llama3.2:3b (fast path regex+dict, slow path LLM con prompt template JSON), rigid veto (sin cambios), scoring Π pᵢ con 7 sub-scores y 7 pesos, trashPenalty (spam/bot/recycle), EWMA velocity, shape detection (regresión + 2da derivada), phase detection, snapshot de rendimiento CPU vs GPU.
- Sección 05 — Docker Compose Local (PILAR NUEVO, ~380 líneas): topología ASCII, docker-compose.yml completo verbatim con 6 servicios (postgres timescale/timescaledb:2.14.2-pg16, redis:7.4-alpine, ollama/ollama:latest, backend Next.js, cloak-pool Playwright, caddy gateway, grafana opcional), Caddyfile con SSE passthrough, Dockerfiles (backend + cloak-pool), .env template, tabla de consumo de recursos (RAM/CPU/disco por servicio, totales con y sin GPU), hardware mínimo.
- Sección 06 — Base de Datos: init.sql con extensions (timescaledb, vector, pg_trgm, btree_gin) + tuning para 8GB, hypertables (Mention, TrendScore, EngineLog), continuous aggregate mentions_1h, retention policies, pgvector ivfflat index, índices críticos (trgm, trending, source, cluster, score).
- Sección 07 — SSE: código del Route Handler completo, backpressure 3 capas (client RAF, transport ReadableStream HWM, broker ring buffer 1000), reconexión con Last-Event-ID + evento resync_required.
- Sección 08 — API Gateway: Zod schemas canónicos (SourceKeySchema, TrendSchema, ListTrendsQuerySchema, CreateAlertBodySchema), RFC 7807 error envelope, middleware chain de 13 pasos.
- Sección 09 — Inferencia con Ollama (PILAR NUEVO, ~200 líneas): OllamaClient con semaphore de concurrencia, model registry (6 modelos con tamaños/VRAM/latencia), warmUpOllama en boot (pull si no instalado + cargar en memoria), generateBriefing con prompt template español + JSON output, fallback determinista (TF-IDF + regex NER + briefing extractivo).
- Sección 10 — Anti-Gaming: tabla trashPenalty (spam 0.4 / bot 0.3 / recycle 0.3), token bucket Redis local, circuit breaker estados, retry con backoff + jitter.
- Sección 11 — Observabilidad: pino logger con redact, prom-client metrics (Counter/Histogram/Gauge), X-Trace-Id propagado.
- Sección 12 — Costos: banner $0/mes, tabla desglose v1.x→v2.0 (X API $100→$0, NIM $20-80→$0, Supabase $25→$0, etc.), 3 tiers hardware, ruta de escalado a cloud cuando se exceda 50K menciones/h.
- Sección 13 — Despliegue Local paso a paso: prerrequisitos, 8 comandos setup (clone → .env → docker compose up → wait ollama → prisma db push → post-init.sql → curl verify → open), comandos útiles, healthchecks.
- Sección 14 — Apéndices: tabla de 13 variables de entorno, cadena E2E de tipos (Prisma → types.ts → Zod → SSE → hook → component), changelog v1.x→v2.0 con 15 filas, tabla de 6 riesgos y mitigaciones.

Stage Summary:
- Documento v2.0 entregado en /home/z/my-project/download/VIRAHUB-Doc-Tecnico-Backend-v2.html (3079 líneas, 15 secciones balanceadas, 53 menciones CloakBrowser, 58 Ollama, 35 $0/mes).
- Tres pilares centrales integrados con profundidad de implementación: CloakBrowser 0.5.2 (mini-servicio :3030 con pool de workers Playwright, fingerprint rotation, HTML→JSON extraction, adapters Reddit/X/RSS), Ollama (modelos nomic-embed-text + llama3.2:3b + qwen2.5:3b/7b + llava:7b, warm-up, prompting, fallback), Docker Compose (6 servicios con healthchecks, volumes, resource limits, GPU opcional).
- Calidad AAA preservada explícitamente: scoring Π pᵢ con 7 sub-scores, MinHash LSH 128/32/4 + Jaccard 0.85, embeddings cosine 0.78, NER rigid veto, 11 eventos SSE con heartbeat 15s + Last-Event-ID + backpressure 3 capas, contratos Zod end-to-end, tipo E2E Prisma→Hook.
- Costo total documentado: $0/mes (self-hosted en hardware local). Tabla de migración v1.x→v2.0 muestra ahorro de ~$150/mes → $0/mes. Hardware mínimo 8GB/4cores CPU-only, recomendado 16GB/8cores + RTX 3060 GPU.
- Pendiente: el código backend que empecé en /home/z/my-project/lib/server/config/sources.ts (asume Reddit JSON API y X API v2 con bearer token) debe actualizarse para reflejar la nueva arquitectura CloakBrowser. Lo dejé sin tocar; el usuario debe confirmar si quiere que actualice el código también o solo el documento.
