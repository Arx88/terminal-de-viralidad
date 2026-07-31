# Home Radar Redesign — Orchestrator Work Record

**Task ID:** home-radar-v2
**Agent:** orchestrator (senior)
**Date:** 2026-07-31

## Scope

Rediseño del HOME (Radar) de VIRAHUB, integración de X.com como fuente y conversión del sidebar izquierdo (LeftRail) en fijo/sticky.

## Cambios realizados

### 1. `lib/virahub-data.ts`
- Agregado `'x'` al tipo `SourceKey`.
- Agregado motor X al array `ENGINES` (en posición 3, entre Bluesky y Hacker News) con `verbs: ['Escaneando…', 'Monitoreando…', 'Detectando…']`. Total motores: 7.

### 2. `components/source-icon.tsx`
- Importado `XIcon` de `brand-icons.tsx`.
- Agregada entrada `x` al MAP: tile `bg-black text-white` (acorde al branding oficial de X).

### 3. `components/screens/engines-screen.tsx`
- Agregada entrada X al `ENGINE_META` (intervalo 4 min, OAuth, hashtags como queries).
- Agregadas dos entradas X al `INITIAL_LOGS` (info + warn).

### 4. `components/screens/explore-screen.tsx`
- Actualizados arrays hardcoded `pct` y `menc` para incluir el 7º motor X (244% / 11 menciones).

### 5. `components/screens/reports-screen.tsx`
- Agregada fuente `x` a los `bySource` de los tres períodos (today / week / month) con conteos y porcentajes coherentes (~23-24% del total).

### 6. `components/top-bar.tsx`
- Reemplazado literal `"6 motores"` por `{ENGINES.length} motores` para que se mantenga sincronizado.

### 7. `components/left-rail.tsx` (CRÍTICO — sticky/fijo)
- El `<nav>` ahora usa `sticky top-0 h-svh w-[92px] shrink-0 flex-col items-center overflow-y-auto self-start scrollbar-thin`.
- Ya no scrollea con el contenido de la página: permanece fijo a la izquierda durante todo el scroll vertical.

### 8. `app/page.tsx`
- Cambiado el contenedor de `items-stretch` a `items-start` para que el LeftRail (ahora sticky) no se estire al alto del padre y pueda adherirse al top del viewport.

### 9. `components/hero-card.tsx` (mejora impacto visual)
- Agregado badge **"EN VIVO"** con punto pulsante (anillo `vh-ripple`) que cambia a "En pausa" cuando `live` es false.
- Agregado segundo badge con icono `Radio` mostrando `{ENGINES.length} motores activos`.
- Headline con gradiente de 3 paradas (lila→violeta→púrpura) y subrayado glow decorativo.
- Stats rediseñados: cada uno ahora tiene su propio tile con icono + glow al hover (`group-hover/stat:shadow-[0_0_24px_-6px_var(--hot|cool)]`), número CountUp en `text-3xl` y label.
- Actualizada copy del primer step: `Recolectamos señales de ${ENGINES.length} motores en paralelo`.

### 10. `components/live-scan.tsx` (rediseño completo)
- Eliminado el `Ribbon` SVG con ondas que no se entendía.
- Nuevo layout de pipeline con:
  - Header band con icono `Cpu`, estado del pipeline y métricas (posts analizados, deduplicación).
  - Track horizontal con línea punteada fluida de fondo (`vh-flow-bg`) en desktop.
  - 7 nodos-motor, cada uno en su tarjeta: badge de índice, `SourceTile`, nombre, badge ON/OFF con dot pulsante, verbo animado (fade-in/slide-in), barra de progreso con gradiente violeta y % numérico.
  - Flechas `ArrowRight` con animación `vh-nudge` escalonada entre nodos.
  - Nodo final "Radar" (dashed border primary) que representa la salida del pipeline.
  - Scroll horizontal en mobile (`overflow-x-auto scrollbar-thin`).

### 11. `app/globals.css`
- Agregado keyframe `vh-flow-bg` (background-position) para animar la línea punteada del pipeline.

### 12. `components/trend-timeline.tsx` (rediseño completo — trading chart)
- Reemplazado el layout de un solo SVG superpuesto por una grid 2-columnas `[labelCol]_[chartCol]` responsive (170 / 210 / 250 px).
- Cada tendencia tiene su propia **lane** de altura fija (`LANE_H = 54px`) con:
  - **Label cell**: borde derecho divisor, color stripe vertical con glow al seleccionar, source glyph, título truncado, delta %, botón eye para toggle visibilidad.
  - **Chart cell**: SVG `viewBox 0 0 1000 54` con fill area + path + dot actual + ripple animado si live + línea vertical "NOW" en el borde derecho.
- Líneas NUNCA se solapan con labels ni con lanes vecinas (cada lane tiene su propio SVG acotado).
- Hover sincronizado: un único `chartRef` en la fila de tiempo captura `hoverRatio` (0..1). Todas las lanes dibujan crosshair + dot en la misma posición horizontal.
- Tooltip anclado a la columna chart justo debajo del eje temporal, lista valores de todas las lanes (con opcidad reducida para ocultas), ajustando translateX cerca de los bordes.
- Ranges (1H/6H/24H/7D) en la esquina superior derecha del header.
- Línea "AHORA" vertical con dot pulsante por lane.

### 13. `components/analysis-panel.tsx` (pulido)
- Header "En análisis" ahora muestra dot pulsante verde (mint) cuando live.
- Item activo ahora tiene gradiente sutil `from-[var(--hot)]/[0.06] to-transparent` además del stripe izquierdo, para mayor jerarquía visual.

## Verificación

- `bunx tsc --noEmit` → 0 errores en archivos del proyecto (los 2 errores residuales están en `skills/` y son pre-existentes).
- `dev.log` → servidor arrancado, GET / 200 OK, sin warnings ni errores.

## Notas para siguientes agentes

- El LeftRail es ahora `sticky top-0 h-svh`. Si se añaden más items al menú, el `overflow-y-auto` ya está preparado.
- X está integrado en TODO: SourceKey, ENGINES, source-icon MAP, ENGINE_META, logs, bySource (reports), FuentesPanel (explore) y TopBar.
- LiveScan y TrendTimeline han sido reescritos desde cero. Mantienen la misma API pública (props desde useVirahub) y los mismos datos (buildSeries, smoothPath, RANGE_CONFIG).
- TrendTimeline ahora usa grid 2-col con breakpoints; si se cambia el ancho de columna label, actualizar `GRID_cls` en los 3 breakpoints simultáneamente.
