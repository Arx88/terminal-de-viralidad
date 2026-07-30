# Terminal de Viralidad

> Bloomberg-style terminal for detecting emerging narratives across Twitter, GDELT, Reddit, HN, and Google Trends — before they explode publicly.

**Multi-agent loop architecture** with 5 specialized agents (Scout → Cluster → Score → Phase → Validator) running in a convergence loop until narratives are validated.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  ORCHESTRATOR (loop until convergence)                          │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
   ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌──────────┐    ┌───────────┐
   │ 1. SCOUT  │ →  │ 2. CLUSTER│ →  │ 3. SCORE  │ →  │ 4. PHASE │ →  │ 5. VALID  │
   │ scrape    │    │ dedup +   │    │ Vel × Mat │    │ HMM 4    │    │ legitimacy│
   │ sources   │    │ cluster   │    │ × Pen ×   │    │ states   │    │ + conv.   │
   │           │    │ narratives│    │ Decay     │    │          │    │ decision  │
   └───────────┘    └───────────┘    └───────────┘    └──────────┘    └─────┬─────┘
                                                                             │
                                                                       ┌─────┴─────┐
                                                                       ▼           ▼
                                                                   CONVERGED    RE-LOOP
                                                                   (publish)    (Scout with feedback)
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS + custom Bloomberg-terminal dark theme (#0A0E14)
- **Real-time**: SSE (Server-Sent Events) with 100ms throttle
- **State**: React 19 useTransition + custom useTerminalStream hook
- **Sources**: GDELT 2.0 DOC API (real) + mock adapters for Twitter/Reddit/HN/Trends
- **Event bus**: In-memory pub/sub (replaceable with Upstash Redis for production)

## Agent Contracts

Each agent has a clear input/output contract documented in `src/lib/agents/`:

| Agent | Input | Output | Re-loop trigger |
|-------|-------|--------|-----------------|
| Scout | query, sources[] | NormalizedMention[] | — (decided by Validator) |
| Cluster | mentions + existing narratives | Narrative[] | — |
| Score | narratives | scored narratives (Vel×Mat^γ×Pen×Decay) | — |
| Phase | scored narratives | narratives with .status + confidence | — |
| Validator | phased narratives | narratives with .legitimacy + convergence | YES if not converged & iter < max |

## Score Algorithm

```
S(n,t) = 100 · Vel(n,t) · Mat(n,t)^γ · Pen(n,t) · Decay(t-t₀)

Vel(n,t) = σ(w₁·z̃(v) + w₂·ãcc + w₃·Ĥ(A) + w₄·NetVel + w₅·SemNov + w₆·XSrc + b)
Mat(n,t) = σ(α₁·log(Σv) + α₂·Ĥ̄ + α₃·|S_conf| + α₄·depth + α₅·age_capped)
Pen(n,t) = Π p_i    (5 sub-penals: bot, dup, origin, coord, promo)
Decay    = exp(-λ·Δt),  λ = ln(2)/τ½,  τ½ = 12h (twitter)
```

## 4 Phases (HMM-inspired)

| Phase | Color | Icon | Description |
|-------|-------|------|-------------|
| Forming | `#FBBF24` amber | ◇ | vel > 0.3, mat < 0.5, accel ≥ 0 |
| Rising | `#2DD4BF` teal | ▲ | vel > 0.6, mat < 0.75, accel > 0 |
| Peaked | `#94A3B8` slate | ● | mat > 0.7, vel < 0.45 |
| Decaying | `#F87171` rose | ▽ | vel < 0.25, accel < -0.5, age > 4h |

## 5 Legitimacy Categories (Bayesian cross-source)

| Category | Condition | Confidence |
|----------|-----------|------------|
| LEGIT | Twitter + (GDELT/Reddit) + trash > 0.6 | 0.92 |
| BOT_CAMPAIGN | Twitter only + trash < 0.4 | 0.85 |
| TWITTER_NATIVE | Twitter only + trash ≥ 0.4 | 0.55 |
| PRE_BURST | GDELT/Reddit only, no Twitter | 0.70 |
| NOISE | < 2 mentions or no sources | 0.20 |

## UI Layout (Bloomberg Terminal style)

```
┌─────────────────────────────────────────────────────────────────┐
│ ▮ LIVE  TICKER (top narratives scrolling)                       │ 32px
├──────────┬─────────────────────────────────────┬────────────────┤
│ NARRATIVE│ DETAIL PANEL                        │ AGENT ACTIVITY │
│ LIST     │                                     │ + LIVE STREAM  │
│ (320px)  │ Hero score, timeline, sparkline,    │ (340px)        │
│          │ sample mentions, legitimacy badge,  │                │
│          │ keywords, sources                   │                │
│          │ (flex)                              │                │
├──────────┴─────────────────────────────────────┴────────────────┤
│ ACCEL STRIP (8 sparklines top velocity) + HINTS + STATUS        │ 52px
└─────────────────────────────────────────────────────────────────┘
```

## API Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stream` | GET | SSE gateway — pushes all events in real-time |
| `/api/trigger` | POST | Trigger a new agent loop with `{query, sources, max_iterations}` |
| `/api/narratives` | GET | REST snapshot of current narratives |
| `/api/activities` | GET | REST snapshot of recent agent activity logs |

## Local Development

```bash
bun install
bun run dev    # http://localhost:3000
bun run lint   # check code quality
```

## Roadmap

- **MVP** (this): 5 agents + GDELT real + mocks for Twitter/Reddit/HN/Trends + Bloomberg-style UI
- **v1**: Real CloakBrowser Twitter scraping, Isolation Forest + GNN anti-gaming, multi-ICP dashboards
- **v2**: Multi-language (ES/EN/PT/FR/DE/RU/ZH), Telegram/BlueSky/Mastodon ingestion, predictive modeling

## Documentation

The full architecture document is in `download/Terminal_de_Viralidad_v1.0.pdf` — 50 pages covering architecture, algorithm, UX/UI, sources, anti-gaming, roadmap, metrics, risks, ethics, and business model.

## License

MIT
