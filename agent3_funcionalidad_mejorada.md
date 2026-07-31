# AGENTE #3 · Product Strategist — Funcionalidad Mejorada de FOGÓN

> Postura: el mockup actual se ve bien pero **no completa la promesa**. "Detectar tendencias antes que nadie" requiere 3 cosas que hoy faltan: (1) evidencia verificable de que fuimos tempranos, (2) contexto absoluto para distinguir señal de ruido, (3) mecanismos para no perder lo que el usuario ya tocó pero no atizó. Las 10 features de abajo son microdetalles funcionales —ninguna añade un panel nuevo, todas operan dentro de la grilla + panel de detalle existentes.

## Respuestas a las 5 preguntas (mapa mental, no entregable)

| Pregunta | Respuesta corta | Feature que la resuelve |
|---|---|---|
| 1. ¿Qué info falta para DECIDIR si importa? | **Baseline absoluto + quién la originó + contra-narrativa**. "+312%" sin saber "8→33 menciones de 14 cuentas únicas" es ruido vestido de señal. | #2, #3, #10 |
| 2. ¿Qué acción más allá de atizar/guardar/ahogar? | **Dormir 24h** (estado intermedio), **plantar semilla** (de pasivo a activo), **exportar evidencia** (actuar fuera de FOGÓN). | #7, #8, #9 |
| 3. ¿Cómo mejorar el "wow" del linaje temporal? | Anotar las **transiciones de fase sobre el sparkline** + mostrar **lead time real vs. medios**. La línea plana actual no cuenta historia. | #1, #5 |
| 4. ¿Qué datos de fuentes reales no mostramos? | **URLs verificables** (post/articulo), **karma/seguidores del originador**, **tono GDELT**, **subreddit/instancia**, **delay publicación→detección**. | #3, #5, #6 |
| 5. ¿Cómo no perder trends vistas pero no atizadas? | **Flag `peekedAt` en localStorage** + re-surfear con badge "viste esto hace 2h, ahora creciendo" cuando cambia de fase. No push, no spam. | #4 |

---

## Las 10 features

| # | Feature | Problema que resuelve | Implementación | Prioridad |
|---|---|---|---|---|
| **1** | **Anotación de transiciones de fase sobre el sparkline** | El sparkline actual sólo muestra volumen. El usuario ve "creciendo" pero no sabe hace cuánto ni cuándo fue el salto de `nacida → creciendo`. Pierde el "momento wow" del linaje temporal. | Persistir `stateHistory: [{state, ts}]` en la DB por narrativa (ya se computa en `phase.ts`). En `renderSparkline`, mapear cada transición a un dot del color de la fase destino sobre la línea. Hover → tooltip `hace 47min: nacida → creciendo · +180% velocity`. Dato gratis, sin llamadas extra. | **Alta** |
| **2** | **Baseline absoluto bajo la métrica headline** | "+312% / 24h" sin contexto absoluto es engañoso: 4→16 menciones ≠ 800→3200. El usuario decide mal. Y el % alto en cuentas únicas bajas es el patrón #1 de bot campaign. | Debajo del `metric` actual, agregar línea mono `text-mute` 11px: `8 → 33 menciones reales · 14 cuentas únicas`. Si `cuentas_únicas / menciones < 0.4`, tinte `ash` + tooltip "patrón de repetición: pocas cuentas hablando mucho". Cálculo: `COUNT(DISTINCT author_id)` en la tabla de menciones. | **Alta** |
| **3** | **Originator attribution en el panel de detalle** | "Bluesky" como fuente no dice nada. ¿La empezó `@solar_physics` (8.2k, técnica) o un bot de 30 seguidores? Sin esto el usuario no puede pesar la señal. | En el panel, arriba de "Menciones recientes", bloque `Originador`: avatar + handle + seguidores + 1-shot Nemotron que clasifica el perfil (técnico / periodista / organizacion / individual / sospechoso) usando `getProfile` de Bluesky / karma de HN / API de instancia Mastodon. Cache 24h por author. Si no hay origen claro (ej. GDELT sin actor), mostrar "Sin originador individual — difusión mediática". | **Alta** |
| **4** | **"Casi la atizaste" — revival de trends vistas pero no actuadas** | El usuario abre el panel de una trend `por nacer`, lee el briefing, no atiza, sigue scrolleando. 3h después explota y nunca se entera. Es el failure mode #1 del producto. | `localStorage: { trendId, peekedAt, acted }`. Cuando el `Scout` re-corrre y una trend con `peekedAt && !acted` cambia de fase, el card sube al top de la grilla con hairline `flame` + chip 11px: `viste esto hace 2h · ahora creciendo`. Máx 3 cards así a la vez (anti-spam). Click en el chip → descarta el badge. | **Alta** |
| **5** | **Lead time real vs. cobertura en medios** | FOGÓN promete "antes que nadie" pero el usuario no puede verificar. La promesa no es creíble sin evidencia. | En el panel, dos timestamps: `Detección FOGÓN: hace 2h 14min` (ya existe `firstSeen`) + `Primera cobertura mediática (RSS/GDELT): hace 38min · El Confidencial`. Calcula `lead_time = media_first_seen - fogon_first_seen` y muéstralo como `te avisamos 1h 36min antes que los medios`. Si no hay cobertura mediática todavía: chip `aún sin cobertura — posible scoop`. Esto es la prueba de valor del producto. | **Alta** |
| **6** | **Spread velocity: de cuántas fuentes y en qué orden** | Una trend con +300% en 1 fuente puede ser eco de una cuenta. Una que salta Bluesky → HN → RSS en 2h es la que importa de verdad. Hoy no se ve la propagación. | Reemplazar el footer de "sources" (chips estáticos) por un mini-timeline horizontal: `Bsky (hace 2h) → Reddit (hace 1h) → HN (hace 22min)`. Cuando una fuente nueva aparece en runtime, el dot hace un blip sutil (mismo `motor-dot` del header, reutiliza la animación). Si `fuentes_nuevas_en_última_hora ≥ 2`, agrega hairline `ember` al top del card. | **Media-Alta** |
| **7** | **Dormir 24h — acción intermedia entre ahogar y guardar** | Atizar / guardar / ahogar son binarios. Hay trends que son ruido hoy pero podrían importar mañana (cripto pump, rumor de adquisición). Ahogar es permanente, guardar satura. | Tercer botón ghost en el panel: `Dormir 24h`. Mete la trend en `snoozedUntil: ISO`. Hidden de la grilla. A las 24h, re-aparece con badge `despertó — estado actual: X`. Útil para no saturar "Guardados" con cosas que aún no sabés si importan. Mismo componente que el filter pill "Muriendo", con count. | **Media** |
| **8** | **Exportar evidencia — carta de tendencia en markdown** | Cuando el usuario detecta algo accionable, FOGÓN no le da nada para actuar fuera del producto. No puede pegar en Slack, no puede mandar a un colega, no puede guardar en Notion. El valor se queda cautivo. | Botón `Exportar` en el panel (cliente-side, sin backend). Genera markdown con: título, briefing de Nemotron, sparkline como SVG inline, top 3 menciones con URLs verificables a los posts originales, fuentes con counts, lead time. `navigator.clipboard.writeText(md)`. Toast "Carta copiada al portapapeles". Sin friction, sin auth. | **Media** |
| **9** | **Plantar semilla — de detector pasivo a activo** | FOGÓN hoy sólo muestra lo que detecta pasivamente. El usuario sabe de su nicho (su industria, su competencia, su tema obsesión) y no puede pedirle "vigilá esto". Pierde el caso de uso más obvio. | Input ghost en header: `Plantar semilla…`. Acepta texto libre o URL. Nemotron lo parsea → genera `scout query` + `keywords[]` + `exclusions[]`. Lo agrega a `seeds` table con `active: true`. Próximo `Scout` run incluye ese query. Cap: 10 semillas activas. Cuando una semilla detecta algo, chip `🌱 desde tu semilla "X"` en el card. Re-saca del concepto de "tendencia general" al de "vigilancia personal". | **Media-Alta** |
| **10** | **"Por qué esta fase" — explicación expandible de Nemotron** | El badge `Creciendo` es una etiqueta opaca. El usuario no entiende por qué pasó de `nacida` a `creciendo`. Sin esto, confía ciegamente o no confía. | Click en el badge de estado del card → expande 1 línea debajo del título: `Creciendo desde hace 47min porque velocity 35→82 menc/h y apareció en Reddit (antes sólo Bluesky)`. Nemotron ya tiene `stateHistory`, `velocity`, `sourcesByTime` — sólo estructura el output con un prompt 1-shot corto (`explain_phase_transition(prev, curr, delta)`). Cache por 5min. | **Alta** |

---

## TOP 3 must-have (sin estas el producto no completa su promesa)

1. **#5 — Lead time real vs. medios.** Es la prueba de la promesa. Sin esto, "detectar antes que nadie" es un claim de marketing. Con esto, cada card es un mini caso de éxito verificable. Si FOGÓN no puede mostrar lead time, no debería existir.

2. **#2 — Baseline absoluto + cuentas únicas.** Es la diferencia entre parecer útil y ser útil. "+312%" sin "8 → 33 menciones de 14 cuentas únicas" es activamente dañino: hace que el usuario confíe en señales que son ruido (o bot campaigns). Es también la primera línea de anti-gaming visible para el usuario.

3. **#4 — "Casi la atizaste".** Resuelve el failure mode más común: ves algo, no estás seguro, te vas, explota, nunca te enterás. Sin esto, FOGÓN es un feed más. Con esto, FOGÓN tiene memoria de tu atención y la usa a tu favor. Es lo que separa "detector" de "asistente".

---

## TOP 3 nice-to-have (diferencian pero no son críticas)

1. **#1 — Anotación de transiciones en sparkline.** El "momento wow" del linaje temporal. No es crítico para decidir, pero es lo que el usuario le muestra a un colega cuando dice "mirá esta herramienta". Barato de implementar (dato ya existe).

2. **#3 — Originator attribution.** Sube la calidad de decisión pero requiere 1-shot Nemotron por autor + cache. Es el tipo de feature que un usuario power-user valora y un casual ignora. Bienvenida pero post-MVP.

3. **#8 — Exportar evidencia.** Convierte a FOGÓN en input de otros flujos (Slack, Notion, email). No es crítico para la promesa pero es lo que hace que el producto "viva" en el día a día del usuario en vez de ser una pestaña que abre y cierra.

---

## LO QUE NO AGREGAR (arruinarían la simplicidad)

- **❌ Notificaciones push / email activos.** FOGÓN es pull, no push. Si mandás push, el usuario lo silencia en 2 semanas. La feature #4 (revival visual) hace el mismo trabajo sin fricción. Push es el principio del fin de productos de detección.

- **❌ Sistema de comentarios / social dentro del producto.** Cada producto que añade "comunidad" la pierde en 6 meses. FOGÓN es una herramienta individual de detección. Si el usuario quiere conversar sobre una trend, que lo haga afuera (con #8 export).

- **❌ Dashboard de analytics / métricas propias.** "Tendencias detectadas este mes: 47. Precisión: 78%." Convierte el producto en un panel de control, no en un detector. Mata el "momento wow" de cada card individual.

- **❌ Filtros avanzados multi-dimensión (por fuente, por región, por idioma, por rango de velocity, por rango de confianza, por rango temporal).** Cada filtro que agregás reduce el % de usuarios que lo usa. La grilla actual con 5 pills de estado es el límite. Si necesitás más, plantá una semilla (#9) — es más honesto.

- **❌ Bookmarking con tags / carpetas / colecciones.** Sustituye una decisión simple (atizar/guardar/ahogar) por una taxonomía que el usuario tiene que mantener. Si llegás a 50 "guardados", el problema no es la organización, es que estás guardando ruido.

- **❌ Modo "explorar históricos" con timeline scroll infinito.** FOGÓN detecta lo que está pasando ahora. Si el usuario quiere históricos, que vaya a GDELT directamente. Agregar histórico difumina el foco y cambia el producto de "detector" a "archivo".

- **❌ AI chat / "preguntale a Nemotron sobre esta tendencia".** Cada producto que añade un chat lo termina usando el 3% de los usuarios. El briefing de Nemotron ya está en el panel. Si el usuario quiere más, que exporte (#8) y le pregunte a ChatGPT.

---

## Notas de implementación para el equipo

- **#1, #2, #4, #10 son cero-costo en infra** — sólo frontend + queries a la DB existente. Si hay que cortar alcance, esas cuatro juntas son la "fase 1.5" más rentable.
- **#3 y #9 son los únicos que añaden llamadas a Nemotron** — ambas 1-shot, cacheables, y con fallback barato (sin originator → "difusión mediática"; sin semilla → comportamiento actual).
- **#5 requiere tracking explícito de `media_first_seen`** que no está en el schema actual. Es el único cambio de DB no trivial. Implementarlo como un campo en la tabla `narratives` que se actualiza cuando un mention de fuente RSS/GDELT se asocia a una narrative existente.
- **#7 (snooze) y #4 (revival) comparten la misma migración de localStorage** — hacerlas juntas ahorra trabajo.
- **Ninguna de las 10 features añade un endpoint nuevo.** Todas extienden endpoints existentes (`/api/narratives`, `/api/stream`) o son cliente-side. Esto es intencional: la simplicidad de la API es un activo.

---

## Postura final

FOGÓN no necesita más features. Necesita **evidencia, contexto y memoria**. Las 3 must-have hacen eso: evidencia (#5 lead time), contexto (#2 baseline absoluto), memoria (#4 revival). Las otras 7 profundizan. Lo que NO agregamos protege el contrato simple: "abrir FOGÓN, ver 6 cards, entender por qué cada una está ahí, decidir en 30 segundos". Cualquier feature que rompa ese contrato —push, social, archive, chat— es deuda técnica disfrazada de producto.
