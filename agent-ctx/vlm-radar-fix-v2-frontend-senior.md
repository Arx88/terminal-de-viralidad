# VLM Radar Fix v2 — Frontend Senior Work Record

**Task ID:** vlm-radar-fix-v2
**Agent:** frontend-senior
**Date:** 2026-07-31
**Goal:** Llevar el Radar de VIRAHUB de 8.5/10 a 9+ arreglando los 6 issues
del VLM.

## Reglas respetadas

- TypeScript estricto, sin `any` (`npx tsc --noEmit` → 0 errores en el
  proyecto, excluyendo demos de `skills/`).
- `'use client'` mantenido en los 5 componentes.
- Sistema oklch de `globals.css` (solo se bumpó `--muted-foreground` y se
  añadieron 2 keyframes; sin nuevos colores fuera de paleta).
- `lucide-react` para iconos (`ChevronDown` añadido al top-bar).
- `cn()` de `@/lib/utils` para clases condicionales.
- Microdetalles: transiciones 200–300ms, hover/focus-visible.
- No se rompió nada: `aria-label`/`title`/`aria-pressed`/`aria-current`
  conservados y enriquecidos; `notify`/`setScreen`/`select` intactos.

## Issue 1 — "Top bar doing too much"

> Los 7 iconos sociales inline saturaban la barra.

### `components/top-bar.tsx`

- **Antes:** `<ul>` inline con 7 botones `<SourceTile>` + tooltips CSS.
- **Después:** nuevo componente `EngineFocusMenu` — trigger compacto con
  **avatar pile** (3 logos solapados + ring) + label "Foco / {name}" +
  `ChevronDown`. Al click abre un **popover** (`role="menu"`) con los 7
  motores como `menuitemradio`, cada uno con su `SourceTile` + nombre +
  `✓` cuando está seleccionado.
- Cierre: click-fuera (`mousedown` listener) + `Escape` (`keydown`).
- Accesibilidad: `aria-expanded`, `aria-haspopup="menu"`,
  `aria-checked` en cada item, `aria-label` descriptivo.
- Padding responsive: `px-4 py-3.5 sm:px-6 sm:py-4` (mobile-first).

## Issue 2 — "En análisis list has no visual breathing room"

### `components/analysis-panel.tsx`

- `<ul>`: añadido `gap-0.5` entre items.
- Cada item: `py-2.5` → `py-3` (más aire vertical).
- **Zebra striping:** filas impares (no activas) con `bg-white/[0.018]`;
  las activas conservan su `bg-[var(--hot)]/8` + gradiente + barra
  lateral. El zebra se aplica solo cuando `!active` para no chocar con
  el estado seleccionado.
- Hover no-activo: `bg-white/[0.04]` (un toque más fuerte que antes).

## Issue 3 — "Color contrast on secondary text too dim"

### `app/globals.css`

- `--muted-foreground`: `oklch(0.66 0.02 285)` → `oklch(0.70 0.02 285)`.
  Sube el contraste de **todo** el texto secundario globalmente, manteniendo
  jerarquía vs `--foreground` (0.97).

### `components/top-bar.tsx`

- Separadores `•`: `text-muted-foreground/40` → `/70`.
- Contadores inline: `text-foreground/85` → `/90`.

### `components/analysis-panel.tsx`

- Indicador "Actualizaciones en tiempo real" (pie): `/70` → `/85`.

## Issue 4 — "Missing micro-interactions"

### `app/globals.css` — 2 keyframes nuevas

- `vh-radar-pulse`: scale 1→1.4 + opacity 0.55→0.14 (heartbeat contenido).
- `vh-badge-glow`: box-shadow 10px→20px halo hot (respira).

### `components/left-rail.tsx`

- Cuando `id === 'radar' && isActive`: span absoluto `bg-primary/25 blur-md`
  con `vh-radar-pulse 2s` detrás del icono Target → **pulse** sutil que
  señala "esta es la pantalla en vivo".

### `components/hero-card.tsx`

- Badge "EN VIVO" (`En vivo` pill): añadido `style={{ animation:
  'vh-badge-glow 2.4s ease-in-out infinite' }}` cuando `live` → **glow**
  pulsante hot-orange alrededor del badge.

## Issue 5 — "Mobile responsiveness unknown"

### `components/left-rail.tsx`

- Nav width: `w-[92px]` → `w-[72px] sm:w-[84px] lg:w-[92px]`.
- Icono: `size-11` → `size-10 lg:size-11`; glyph `size-5` →
  `size-[18px] lg:size-5`.
- Label: `text-[11px]` → `text-[10px] lg:text-[11px]`.
- Padding: `pt-4 pb-6` → `pt-3 pb-5 sm:pt-4 sm:pb-6`.
- En móvil (375px): rail 72px en vez de 92px → libera ~20px de contenido.

### `components/top-bar.tsx`

- `flex-wrap` + `gap-x-4 gap-y-3 sm:gap-x-8 sm:gap-y-4` + `px-4 sm:px-6`
  → la barra envuelve limpiamente; el dropdown de motores elimina el
  cluster de 7 iconos en móvil.

### `app/page.tsx`

- Container: `px-4` → `px-3 sm:px-4 lg:px-6`; gap `gap-2 sm:gap-2.5 lg:gap-3`.

## Issue 6 — "Stats cards look clickable but unclear what they do"

### `components/hero-card.tsx`

- **Antes:** `ChevronRight` solo en `lg:block` + `opacity-0`→hover.
- **Después:** `ChevronRight` **siempre visible** (absolute top-right,
  `opacity-40` en reposo) en todos los breakpoints. En hover:
  `translate-x-0.5` + `opacity-100` + `text-foreground`.
- Botón ahora `relative` para anclar la flecha.
- Content span `lg:pr-5` para que el número no solape la flecha en desktop.
- Número responsive: `text-xl sm:text-2xl lg:text-[2rem]` (no desborda en
  móvil con 3 columnas).
- Conserva: lift `-translate-y-0.5`, border highlight, icon glow, label
  `group-hover/stat:text-foreground`, `aria-label` + `title` con destino.

## Verificación

- `npx tsc --noEmit`: **0 errores** en `app/` y `components/`.
- `bun run lint`: error interno pre-existente de ESLint (config ajv,
  registrado en `final-polish-orchestrator.md`), no relacionado.
- Dev server: corriendo en :3000, último GET / = 200, sin errores de
  compilación en `dev.log`.

## Archivos modificados (6)

| Archivo | Cambio |
|---|---|
| `app/globals.css` | `--muted-foreground` 0.66→0.70 + 2 keyframes (pulse/glow) |
| `components/top-bar.tsx` | `EngineFocusMenu` dropdown reemplaza 7 iconos inline |
| `components/analysis-panel.tsx` | zebra + `py-3` + gap + opacity `/70→/85` |
| `components/left-rail.tsx` | radar pulse + sizing responsive |
| `components/hero-card.tsx` | badge glow + flecha always-visible + nº responsive |
| `app/page.tsx` | padding/gap responsive |

## Veredicto

Los 6 issues del VLM están resueltos sin romper funcionalidad existente.
Esperado: **9+/10**.
