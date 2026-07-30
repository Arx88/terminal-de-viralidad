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

---
