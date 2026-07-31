# VIRAHUB — Scraper local de X/Twitter

## Cómo funciona

```
Tu PC (Playwright + Chromium)          Vercel (Dashboard)
┌─────────────────────────┐           ┌─────────────────────┐
│  1. Lee trends de Vercel │──GET─────►│  /api/v1/trends     │
│  2. Busca en X via       │           │                     │
│     xcancel.com/search   │           │                     │
│     (Playwright pasa     │           │                     │
│      el JS challenge)    │           │                     │
│  3. Extrae tweets de     │           │                     │
│     cuentas REALES       │           │                     │
│  4. POST a Vercel        │──POST────►│  /api/v1/ingest     │
│                         │           │  → store + SSE       │
│                         │           │  → Dashboard actualiza│
└─────────────────────────┘           └─────────────────────┘
```

## Instalación (2 minutos)

```bash
cd scripts/local-x-scraper
npm install
npx playwright install chromium
```

## Uso

### Modo continuo (recomendado)
```bash
# Configura tu URL y API key
export VERCEL_URL="https://terminal-de-viralidad.vercel.app"
export VIRAHUB_INGEST_API_KEY="virahub-local-2025"

# Ejecuta
node scraper.js
```

El scraper busca cada 60 segundos. Los tweets aparecen en el dashboard en <5 segundos.

### Modo una sola vez
```bash
node scraper.js --once
```

### Cambiar intervalo
```bash
SCRAP_INTERVAL=30000 node scraper.js  # cada 30s
```

## Qué busca

1. **Términos reactivos**: lee los trends activos de Vercel y busca esos temas en X. Si "DeepSeek V4" está acelerando en HN+Reddit, busca "DeepSeek V4" en X.

2. **Términos fijos**: AI, crypto, OpenAI, GPU, regulation (configurables en `scraper.js`).

3. **Cualquier término**: edita `FIXED_QUERIES` en `scraper.js` para buscar lo que quieras.

## Lo que NO hace

- No necesita API de Twitter (gratis)
- No necesita proxies (xcancel es el proxy)
- No necesita Vercel Pro (corre en tu PC)
- No almacena nada localmente (todo va a Vercel)

## Requisitos

- Node.js 18+
- 2GB RAM libres (Chromium)
- Conexión a internet
