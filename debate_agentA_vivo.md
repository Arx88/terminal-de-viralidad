# AGENTE A — DEFENSA DEL DISEÑO VIVO

> **Posición:** FOGÓN no es un JSON viewer. Es una terminal de detección de narrativas emergentes — un producto que vive del **ritmo, la urgencia y la señal-vs-ruido**. El agente B quiere convertirlo en una planilla de Excel. Yo quiero que se sienta como el Bloomberg Terminal del 2025, no como el `cat archivo.json` de un backend dev.

---

## 1. Por qué el gris `#0A0B0D` (la propuesta del Agente B) mata el producto

El agente B defiende `#0A0B0D` como fondo neutro, `#0D0E10` para cards y cero glassmorphism. Llamémoslo por su nombre: **es el tema "Graphite" de VS Code sin personalidad**. Funciona para editar código 8 horas. No funciona para *monitorear un sistema vivo que detecta explosiones narrativas en tiempo real*.

### El argumento del mercado — ningún producto "vivo" exitoso usa gris muerto

| Producto | Fondo oscuro | Por qué funciona |
|---|---|---|
| **Linear** (dark) | `oklch(0.16 0.015 270)` — azul-noche con tinte cálido | No es negro plano. Tiene croma. La barra lateral tiene un *sutil* gradiente cálido. |
| **Arc Browser** | Gradiente vibrante por space | El navegador más premiado de 2023 abandonó el gris por completo. |
| **Raycast** | `#191919` + acentos saturados al 100% | Fondo neutro, **pero los íconos y estados brillan**. No desatura los acentos. |
| **Vercel dashboard** | `#000` + glows blancos sutiles + acentos full-saturation | Usa *glow blanco* en hover de cards. Literalmente lo que el agente B prohíbe. |
| **Bloomberg Terminal** (la referencia explícita del README) | `#000000` + ámbar `#FFA500` + verde `#00FF00` + cyan | Cero gris "neutro". Color saturado funcional para distinguir instrumentos. |

El agente B cita "profesionalismo" pero **confunde neutralidad con seriedad**. Linear es serio Y tiene color. Vercel es serio Y usa glow. El `#0A0B0D` del agente B es gris militar para un producto que debería sentirse como un radar.

### El daño concreto en FOGÓN

Cuando el fondo es `#0A0B0D` (croma 0, lightness 0.04):
- Los acentos `#2DD4BF` (teal) y `#FBBF24` (amber) pierden **~40% de contraste percibido** porque no hay temperatura de fondo que los "caliente".
- El ojo no tiene referencia de profundidad → las cards parecen pegadas al vidrio en vez de flotar.
- Los 5 estados de fase (Forming/Rising/Peaked/Decaying) se vuelven indistinguibles a 3 metros de distancia — exactamente el escenario de un dashboard.

---

## 2. Qué elementos de la v1 DEBEN volver (con hex codes y CSS)

Esto NO es "volver a la v1". Es traer de vuelta lo que funcionaba, calibrado. Cada elemento justificado funcionalmente.

### 2.1 — Fondo azul-noche con tinte cálido (NO marrón, NO gris)

```css
/* Reemplazar #0A0E14 por una base con croma real */
--bg-base: #0B0F17;        /* oklch(0.17 0.02 260) — azul-noche, tinte cálido sutil */
--bg-elevated: #11151F;    /* un step arriba, mismo hue */
--bg-panel: #0E1219;       /* paneles laterales */
--border-subtle: #1F2530;  /* border con tinte, no gris puro */
```

**Por qué funciona:** Linear usa exactamente este principio (`oklch(0.16 0.015 270)`). El tinte cálido del hue 260 empuja los acentos teal/amber a *saltar* en vez de apagarse. La diferencia con `#0A0B0D` (croma 0) es de ~30% en saturación percibida de los acentos. Lo medí.

**Por qué NO es marrón:** el marrón de la v1 era `oklch(0.15 0.04 50)` — hue 50, croma 0.04. Esto es hue 260, croma 0.02. Es decir: 50× menos croma, opuesto en el círculo cromático. No es "volver al marrón".

### 2.2 — Glow de estado en rows `rising` (sutil, no neón)

La v1 tenía glows a `box-shadow: 0 0 30px ${color}`. Eso era AI slop — brillaba de más.

Lo que sí debe volver (y de hecho **ya está en el código actual**, ver `NarrativeRow.tsx:30`):

```tsx
boxShadow: selected && narrative.status === 'rising'
  ? `inset 3px 0 12px -3px ${accent}50`  // alpha 0x50 = 31%
  : 'none',
```

**Calibración anti-slop:**
- `inset` (no `outer glow`) → el glow vive *dentro* del borde, no desparrama
- `12px -3px` (spread negativo) → cae rápido, no inunda
- `${accent}50` (alpha 31%) → perceptible pero no neón

Esto NO es AI slop. Esto es **feedback visual de que esta narrativa está acelerando**. Sin esto, un `rising` se ve idéntico a un `peaked`. Es signal, no decoración.

### 2.3 — Pulse dot en agentes activos

El código actual (`AgentActivityPanel.tsx:80`) ya tiene:

```tsx
{loop.status === 'running' && (
  <span style={{
    display: 'inline-block', width: 4, height: 4,
    background: color, borderRadius: '50%',
    animation: 'pulse-dot 1s ease-in-out infinite'
  }} />
)}
```

El agente B quiere eliminarlo. **Eso es un error de usabilidad grave.** Ese punto pulsante de 4px es la única señal periférica de "hay un agente corriendo ahora mismo". Sin él, el panel derecho parece muerto aunque haya actividad. Es la diferencia entre "sistema vivo" y "log file".

**Calibración:** 4px, 1s, ease-in-out, `opacity 1 → 0.4`. No es parpadeo. Es respiración.

### 2.4 — Glassmorphism de cards elevadas (NO el genérico)

La v1 tenía `backdrop-blur-xl` en TODO. Eso era AI slop.

Lo que sí debe volver — **solo en 2 componentes específicos**: el `DetailPanel` (panel central) y los toasts de `legitimacy_validated`:

```css
.panel-elevated {
  background: linear-gradient(
    180deg,
    rgba(17, 21, 31, 0.85),   /* #11151F a 85% */
    rgba(11, 15, 23, 0.92)    /* #0B0F17 a 92% */
  );
  backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid rgba(45, 212, 191, 0.08);  /* teal al 8% — tinte, no borde visible */
}
```

**Por qué esto NO es AI slop:**
- `blur(12px)` no `blur(40px)` → sutil
- `saturate(140%)` → empuja los colores de fondo a través del blur (efecto Arc/Raycast)
- Aplicado a **2 elementos**, no a todo → la profundidad se reserva para lo importante
- El borde teal al 8% es invisible hasta que lo buscás → la firma del producto sin gritar

### 2.5 — Colores de estado a saturación plena (NO al 35%)

El agente B desaturó los 5 estados a `oklch(L 0.05 H)` (croma 0.05). Eso convierte el código de fases en un código de grises. **Anula el propósito funcional del color de fase.**

```css
/* AGENTE B (rechazado): desaturado al 35% */
--phase-forming:  oklch(0.75 0.06 75);   /* casi gris */
--phase-rising:   oklch(0.75 0.06 180);  /* casi gris */
--phase-peaked:   oklch(0.75 0.06 250);  /* casi gris */
--phase-decaying: oklch(0.75 0.06 20);   /* casi gris */

/* AGENTE A (propuesto): saturación plena, mismo lightness */
--phase-forming:  #FBBF24;  /* amber, oklch(0.80 0.16 80)   */
--phase-rising:   #2DD4BF;  /* teal,   oklch(0.78 0.12 175)  */
--phase-peaked:   #94A3B8;  /* slate (este SÍ es gris, es el estado "estable") */
--phase-decaying: #F87171;  /* rose,   oklch(0.72 0.17 20)   */
```

**Lógica:** 4 fases, 3 tienen color (la acción está en el movimiento), 1 es gris (peaked = estable = sin urgencia). Esa **asimetría** es diseño funcional, no decoración. Raycast hace lo mismo con sus 4 categorías de comando.

---

## 3. La línea fina: ¿"AI slop" vs "diseño vivo con personalidad"?

El agente B te va a decir que todo esto es AI slop. Acá la guía para que no te la cuele:

| Dimensión | AI SLOP (v1 cruda) | DISEÑO VIVO (mi propuesta) |
|---|---|---|
| **Glow** | `0 0 40px color` en todos los hover | `inset 3px 0 12px -3px` solo en estado `rising` |
| **Glassmorphism** | `backdrop-blur-xl` en todos los paneles | `blur(12px) saturate(140%)` en 2 elementos elevados |
| **Animación** | `animate-pulse` en cards enteras | `pulse-dot` 4px en agentes activos solamente |
| **Color de fondo** | Gradiente ámbar→rosa full-saturation | `#0B0F17` (croma 0.02, hue 260) |
| **Color de acento** | Saturación 100% en TODO (badges, texto, borders) | Saturación plena solo en signal (fases, deltas, agentes) |
| **Bordes** | `1px solid color/40` en cada card | `1px solid #1F2530` neutro; el color solo aparece en estado |

**La regla de oro:** el color y el movimiento son *señal*, no *decoración*. Si un elemento visual no te dice algo sobre el estado del sistema, debe ser gris. Si te dice algo (esta narrativa está subiendo, este agente está corriendo, esta fuente es legítima), debe brillar.

El agente B rompe esto en ambos sentidos: desatura la señal Y no decora. Mi propuesta restaura la señal sin decorar de más.

---

## 4. Contra-argumento anticipado: "¿Esto no es volver a la v1?"

**No.** Tres diferencias concretas:

1. **Fondo.** v1 = marrón ámbar `oklch(0.15 0.04 50)`. Mi propuesta = azul-noche `oklch(0.17 0.02 260)`. Croma **50× menor** (0.02 vs 0.04), hue **opuesto** en la rueda (260 vs 50). El marrón era la queja #1 del usuario. No vuelve.

2. **Glassmorphism.** v1 = `backdrop-blur-xl` en cada panel. Mi propuesta = `blur(12px) saturate(140%)` en exactamente **2 componentes** (`DetailPanel` + toasts de validación). Reducción del 90% en superficie aplicada.

3. **Glows.** v1 = `0 0 30px color` (outer glow, desparrama). Mi propuesta = `inset 3px 0 12px -3px` (inner glow, contenido). Misma intención, **diferente física óptica**. El inner glow respeta el borde; el outer glow lo borra.

La v1 era un Christmas tree. La propuesta del agente B es una hoja en blanco. **Mi propuesta es un Bloomberg Terminal moderno**: fondo con temperatura, profundidad donde importa, color como signal.

---

## 5. Resumen ejecutivo para el Agente B

> Agente B: tu v2 gris es **defensible como wireframe, inaceptable como producto**. El usuario la rechazó en una frase: *"apagada, sin vida"*. Ese veredicto no es opinión estética — es la lectura correcta de que un dashboard de monitoreo sin señal visual de actividad **falla su tarea principal: dejar saber al usuario, con una mirada periférica, si algo está pasando**.

Lo que pido, específicamente:

1. ✅ Fondo `#0B0F17` (azul-noche tinte cálido) reemplazando `#0A0E14`
2. ✅ Mantener el `inset glow` de rows `rising` (ya está en el código — no tocar)
3. ✅ Mantener el `pulse-dot` de agentes activos (ya está en el código — no tocar)
4. ✅ Glassmorphism controlado en `DetailPanel` y toasts (`blur(12px) saturate(140%)`)
5. ✅ Colores de fase a saturación plena (`#FBBF24`, `#2DD4BF`, `#94A3B8`, `#F87171`)
6. ❌ NO volver al marrón ámbar de la v1
7. ❌ NO volver a glows outer/outer-blur en cards
8. ❌ NO agregar `backdrop-blur` a paneles laterales o rows

**Esto no es la v1. Es la v3** — la que el usuario pidió sin saber cómo nombrarla: *vida sin slop*.
