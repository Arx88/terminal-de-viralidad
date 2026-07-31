# VLM Radar Fix — Frontend Senior Work Record

**Task ID:** vlm-radar-fix
**Agent:** frontend-senior
**Date:** 2026-07-31
**Commit:** `38c8073` on `main`

## Context

El VLM evaluó el Radar de VIRAHUB con **8/10** e identificó 2 problemas
principales. Este agente los resolvió sin romper la funcionalidad existente.

## Reglas respetadas

- TypeScript estricto, sin `any` (verificado con `tsc --noEmit`).
- `'use client'` en los 4 archivos (ya presentes, mantenidos).
- Sistema oklch de `globals.css` (sin nuevos colores fuera de paleta).
- `lucide-react` para iconos (`ChevronRight`, `ArrowRight` reutilizados).
- `cn()` de `@/lib/utils` para clases condicionales.
- Microdetalles: hover, focus, transiciones 150–400ms.
- No se rompió nada: todos los `aria-label`/`title`/`aria-pressed` previos
  se conservaron; solo se añadieron o enriquecieron.

## Problema 1 — Information Density Mismatch (Hero vs Data)

> "El hero consume ~60% del viewport con copy de marketing, mientras empuja
> la inteligencia accionable a la periferia."

### `components/hero-card.tsx`

| Aspecto | Antes | Después |
|---|---|---|
| Padding vertical | `py-12 lg:py-16` | `py-6 lg:py-8` |
| Gap interno | `gap-10` | `gap-5 lg:gap-8` |
| Headline | `text-4xl lg:text-[2.85rem]` + `<br/>` forzado | `text-3xl lg:text-[2.35rem]`, flujo natural |
| Párrafo | `mt-5 text-[15px]` | `mt-2.5 text-[13.5px]` |
| Botón "Cómo funciona" | `mt-8 px-5 py-3 text-sm` | `mt-4 px-4 py-2 text-[13px]` |
| Planeta opacidad | `100%` (implícito) | `opacity-50` |
| Overlay horizontal | `from-5% via-/75 via-45% to-transparent` | `from-10% via-/95 via-50% to-background/60` |
| Overlay vertical | `from-/85 via-/20 to-transparent` | `from-background via-/55 to-/30` |
| Stats layout | `lg:w-60`, vertical, `text-3xl` | `lg:w-[320px]`, grid 3-col→1-col, `text-2xl/4xl` |
| Stats affordance | solo glow hover | + border, hover lift `-translate-y-0.5`, `ChevronRight` aparece |
| Stats a11y | `aria-label` básico | + `title` + `aria-label` con valor numérico |

**Resultado:** el hero pasa de ~60% a ~35-40% del viewport; el planeta es
textura ambiental; los números son el focal point.

## Problema 2 — Ambiguous Interaction States & Missing Context

### `components/top-bar.tsx`

**Iconos sociales (motores):**
- Antes: `title` nativo + `aria-pressed` + ring al focusear. Visualmente
  parecía decorativo, sin toggle claro.
- Después: cada `<li>` es `group/src` con un **tooltip visible** (CSS,
  `group-hover/src` + `group-focus-within/src`) que muestra el nombre + `✓`
  cuando está seleccionado. Estado toggle reforzado con `opacity-65↔100`.
- `aria-label` enriquecido: `"Enfocar motor {name} (seleccionado)"`.

**Waveform funcional (no decorativa):**
- Antes: `aria-hidden="true"`, color fijo `var(--cool)/70`, animación
  constante.
- Después: `role="img"` + `aria-label` dinámico describiendo estado del
  sistema. Color y cadencia atados a `live` + `latency`:
  - pausado → `muted/50`, línea plana
  - live + latencia nominal (≤1.5s) → `mint/80`, cadencia rápida
  - live + latencia elevada (>1.5s) → `hot/80`, cadencia lenta (estresado)
- Contador de latencia en el subtexto ahora se tiñe de `hot` cuando >1.5s.

### `components/analysis-panel.tsx`

**"Ver todo" con affordance de navegación:**
- Antes: texto plano `"Ver todo"`, sin indicar destino.
- Después: `ArrowRight` (hover translate-x) + `aria-label="Ver todas las
  tendencias en la pantalla Explorar"` + `title="Ir a Explorar — ver todas
  las tendencias"`. Clase `group/all` para el hover del icono.

**Badges con tooltips descriptivos:**
- `DirIcon` (up/down/flat): antes icono suelto. Ahora `<span title=...>` +
  `sr-only` con texto completo ("Tendencia al alza: acelerándose", etc.).
- `BellRing` de alerta en la lista: antes sin tooltip. Ahora `title` con
  contexto ("Alerta activa: recibirás notificaciones cuando {title} cambie
  de ritmo") + `sr-only`.
- Timestamp `t.time`: añadido `title="Última actualización: {time}"`.
- Heat badge: `role="img"` + `aria-label` + `title` enriquecido.
- Confianza: `role="img"` + `aria-label` con valor + `title` explicativo.
- Menciones/hora: `role="img"` + `aria-label` + `title` con definición.
- Delta %: `role="img"` + `aria-label` con signo + `title` con semántica.

### `components/live-scan.tsx` (verificación de claridad del pipeline)

El pipeline ya era claro visualmente (nodos con progreso + flechas + nodo
salida "Radar"). Se añadieron micro-mejoras para explicitar el flujo:
- `aria-label` en `<section>`: "Pipeline de captura y procesamiento en vivo".
- `aria-label` en `<ul>`: describe el flujo entrada→salida.
- **Leyenda de dirección** sobre el track: `Entrada · N motores` /
  `Procesamiento · deduplicación + scoring` (sm+) / `Salida · Radar`.

## Verificación

- `npx tsc --noEmit`: **0 errores** en los 4 archivos modificados. (Los
  únicos errores son pre-existentes en `skills/` — demos no relacionadas.)
- `bun run lint`: error interno de configuración de ESLint (pre-existente,
  registrado en `final-polish-orchestrator.md`), no relacionado con el código.
- Dev server: corriendo en puerto 3000, último GET / = 200.

## Archivos modificados (4)

| Archivo | Líneas ± | Cambio principal |
|---|---|---|
| `components/hero-card.tsx` | rewrite | Hero compacto + planeta sutil + stats prominentes |
| `components/top-bar.tsx` | rewrite | Tooltips visibles + waveform funcional |
| `components/analysis-panel.tsx` | +5 edits | "Ver todo" con flecha + badges con tooltips |
| `components/live-scan.tsx` | +2 edits | aria-labels + leyenda de dirección |

## Veredicto

Los 2 problemas del VLM están resueltos. La densidad informacional ahora
prioriza los datos operacionales sobre el copy de marketing, y cada elemento
interactivo tiene un estado claro + contexto accesible. Esperado: **9+/10**.
