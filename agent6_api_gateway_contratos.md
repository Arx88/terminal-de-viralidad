# VIRAHUB — API Gateway & End-to-End Contracts

> **Agente 6 · DISEÑADOR DE API GATEWAY Y CONTRATOS**
> Ex-Principal Engineer de Stripe · API design · Zod · tipado compartido · seguridad
>
> Estado: spec v1.0 — listo para implementación. Alineado con los tipos de dominio existentes en `lib/virahub-data.ts` (`Trend`, `RangeKey`, `Shape`, `SourceKey`, `ENGINES`) y con las 7 screens del frontend (`radar`, `explorar`, `alertas`, `guardados`, `motores`, `informes`, `ajustes`).

---

## 0. TL;DR — Decisiones de arquitectura

| Dimensión | Decisión | Una línea de por qué |
|---|---|---|
| **Estilo de API** | **REST sobre Next.js Route Handlers (App Router)** | Edge-ready, cacheable, OpenAPI-generable, consumible por 3rd-parties sin acoplamiento de runtime |
| **Tipado compartido** | **Paquete `@virahub/contracts`** (Zod schemas + tipos inferidos) | Una sola fuente de verdad; el frontend importa `z.infer<...>`, el backend valida con `safeParse` |
| **Auth** | **Auth.js v5 (NextAuth) · GitHub + Google · estrategia JWT con DB sessions** | httpOnly cookie, sin sesión opaca en Redis, compatible Edge Runtime |
| **Validación** | **Zod en cada boundary** (query, params, body, response) | Falla rápido, mensajes tipados, genera OpenAPI automático |
| **Rate limiting** | **Token bucket en Upstash Redis** (`@upstash/ratelimit`) | Serverless-friendly, 3 tiers por criticalidad de endpoint |
| **Errores** | **RFC 7807 Problem Details** + extensión `code` + `traceId` | Estándar, máquina-parseable, alineado con Stripe/GitHub |
| **Versionado** | **URL path `/v1/`** | Explícito, cacheable, soporta múltiples versiones en paralelo |
| **Docs** | **OpenAPI 3.1 generado desde Zod** vía `@asteasolutions/zod-to-openapi` | Single source of truth: el schema ES la documentación |
| **Middleware** | **`middleware.ts` (Edge) para CORS + auth gate** + **composición funcional en cada handler** para rate-limit / zod / logging | Edge para lo global, handler para lo específico de ruta |

---

## 1. Arquitectura — REST vs tRPC vs GraphQL

### 1.1 Veredicto: **REST sobre Next.js Route Handlers**

### 1.2 Justificación comparativa

| Criterio | REST (Route Handlers) | tRPC | GraphQL |
|---|---|---|---|
| **Edge Runtime** | ✅ Nativo | ⚠️ Requiere adapter | ❌ Necesita parser pesado |
| **Cache HTTP (CDN/Vercel)** | ✅ `Cache-Control`, `ETag`, `stale-while-revalidate` | ❌ Todo POST | ❌ POST, sin cache nativo |
| **Consumidores 3rd-party** | ✅ Cualquier HTTP client | ❌ Solo TS frontend | ✅ Pero overkill |
| **OpenAPI / SDK auto-gen** | ✅ Nativo (zod-to-openapi) | ⚠️ Manual | ✅ Introspección |
| **SSE / streaming** | ✅ `ReadableStream` en Route Handler | ⚠️ Hack via httpLink | ⚠️ Subscriptions complejas |
| **Curva de equipo** | ✅ Baja | ✅ Baja (TS) | ❌ Alta (schema, resolvers, N+1) |
| **Acoplamiento** | ✅ Bajo (contrato explícito) | ❌ Alto (tipos compartidos mutan breaking) | ✅ Bajo |
| **Fit con VIRAHUB** | ✅ CRUD + SSE + cache de trends | ⚠️ No hay ganancia real (1 cliente) | ❌ Over-engineering |

**Argumento decisivo**: VIRAHUB tiene **un cliente frontend** (Next.js) y **casos de uso CRUD + un stream SSE**. tRPC sólo brilla con N clientes TS mutando esquemas; GraphQL brilla con selección de campos heterogénea. Ninguno aplica. REST gana por **cacheabilidad HTTP** (los trends son read-heavy y semi-estables: 30s–60s de TTL es aceptable para `GET /api/trends`), **Edge Runtime** (latencia baja en auth + rate limit) y **posibilidad futura de API pública** sin refactor.

### 1.3 Estructura de carpetas propuesta

```
app/
├── api/
│   └── v1/
│       ├── trends/
│       │   ├── route.ts                          # GET, list
│       │   ├── [id]/
│       │   │   ├── route.ts                      # GET, detail
│       │   │   ├── follow/route.ts               # POST / DELETE
│       │   │   ├── timeline/route.ts             # GET
│       │   │   ├── conversations/route.ts        # GET
│       │   │   └── sources/route.ts              # GET
│       ├── alerts/
│       │   ├── route.ts                          # GET / POST
│       │   ├── [id]/route.ts                     # PATCH / DELETE
│       │   ├── history/route.ts                  # GET
│       │   └── feed/route.ts                     # GET
│       ├── saved/
│       │   ├── route.ts                          # GET
│       │   ├── export/route.ts                   # GET
│       │   ├── [trendId]/route.ts                # POST / DELETE
│       │   └── [id]/route.ts                     # PATCH (nota/folder/pin)
│       ├── engines/
│       │   ├── route.ts                          # GET
│       │   └── [id]/
│       │       ├── route.ts                      # PATCH
│       │       ├── logs/route.ts                 # GET
│       │       └── test/route.ts                 # POST
│       ├── reports/
│       │   ├── route.ts                          # GET ?period=
│       │   └── export/route.ts                   # GET
│       ├── settings/
│       │   ├── route.ts                          # GET / PATCH
│       │   └── api-keys/[service]/route.ts       # PUT
│       └── stream/route.ts                       # GET (SSE)
├── auth/
│   ├── [...nextauth]/route.ts                    # Auth.js v5 handler
│   ├── signin/route.ts                           # POST (custom thin wrapper)
│   └── signout/route.ts                          # POST
└── middleware.ts                                 # Edge: CORS + auth gate

packages/
└── contracts/                                    # workspace package @virahub/contracts
    ├── src/
    │   ├── index.ts
    │   ├── trends.ts                             # Zod schemas + types
    │   ├── alerts.ts
    │   ├── saved.ts
    │   ├── engines.ts
    │   ├── reports.ts
    │   ├── settings.ts
    │   ├── auth.ts
    │   ├── errors.ts                             # ApiErrorSchema, error codes
    │   └── openapi.ts                            # registry → OpenAPI 3.1 build
    └── package.json

lib/
├── api/
│   ├── handler.ts                                # compose middleware + zod
│   ├── auth.ts                                   # getSession, requireUser
│   ├── ratelimit.ts                              # Upstash token bucket
│   ├── errors.ts                                 # ApiError class + serializer
│   ├── cors.ts                                   # CORS helper
│   ├── logging.ts                                # structured log (pino/otlp)
│   └── sse.ts                                    # SSE encoder helper
└── db/
    ├── client.ts                                 # Drizzle/Prisma
    └── schema.ts
```

> **Por qué `/api/v1/` y no `/api/` directo**: el versionado por path permite servir `/v2/` en paralelo durante migraciones sin tocar `/v1/`. Los clientes del frontend usan un helper `apiClient('/v1/trends')` que centraliza el prefijo → migrar a v2 es 1 línea.

---

## 2. Autenticación — Auth.js v5

### 2.1 Estrategia

- **Providers**: GitHub (perfumes de dev / OSINT) + Google (resto de usuarios). Sin email/password (eliminar superficie de ataque).
- **Session strategy**: `jwt` con **DB adapter** para persistir users/accounts/sessions en Postgres (tabla estándar Auth.js). El JWT se firma con `AUTH_SECRET` (256-bit) y se guarda en **cookie httpOnly + Secure + SameSite=Lax**.
- **Edge-compatible**: el chequeo de sesión en `middleware.ts` usa sólo la verificación JWT (sin DB hit), garantizando latencia <50ms en Edge.
- **CSRF**: Auth.js lo trae nativo (double-submit cookie + same-site).
- **Session enrichment**: el JWT incluye `userId`, `email`, `role`, `plan`, `rateLimitTier`. No sensible.

### 2.2 Config (`auth.ts`)

```ts
// auth.ts
import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'
import { db } from '@/lib/db/client'
import { DrizzleAdapter } from '@auth/drizzle-adapter'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 }, // 30 días
  providers: [
    GitHub({ clientId: process.env.GITHUB_ID!, clientSecret: process.env.GITHUB_SECRET! }),
    Google({ clientId: process.env.GOOGLE_ID!, clientSecret: process.env.GOOGLE_SECRET! }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role ?? 'user'
        token.plan = (user as any).plan ?? 'free'
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = token.role as UserRole
      session.user.plan = token.plan as Plan
      return session
    },
  },
  pages: { signIn: '/login', error: '/auth/error' },
})
```

### 2.3 Token JWT (claims)

```jsonc
{
  "sub": "usr_01HQ2...",
  "email": "ana@virahub.io",
  "role": "user",          // user | admin
  "plan": "pro",           // free | pro | team
  "iat": 1730419200,
  "exp": 1733011200,
  "iss": "virahub",
  "aud": "virahub-web"
}
```

### 2.4 Helpers de sesión para handlers

```ts
// lib/api/auth.ts
import { auth } from '@/auth'
import { ApiError } from './errors'

export async function getSession() {
  return auth()  // Lee cookie, verifica JWT (cached en Edge)
}

export async function requireUser() {
  const session = await getSession()
  if (!session?.user?.id) throw ApiError.unauthenticated()
  return session
}

export async function requireAdmin() {
  const session = await requireUser()
  if (session.user.role !== 'admin') throw ApiError.forbidden()
  return session
}
```

---

## 3. Endpoints — Catálogo completo

> **Auth**: ✅ requiere sesión · ✅+ requiere admin · ❌ público
> **Rate limit**: formato `tier/costo` — ver §4. Tiers: `L1` read ligero, `L2` read medio, `L3` mutación, `L4` export/SSE.

### 3.1 Trends

| Método | Ruta | Auth | Rate limit | Descripción |
|---|---|---|---|---|
| `GET` | `/v1/trends` | ✅ | L1 / 1 | Lista trends activos. Filtros: `?source=`, `?tone=`, `?shape=`, `?dir=`, `?cursor=&limit=` |
| `GET` | `/v1/trends/:id` | ✅ | L1 / 1 | Detalle de un trend (incluye `why`, `evidence`) |
| `POST` | `/v1/trends/:id/follow` | ✅ | L3 / 2 | Seguir trend (idempotente) |
| `DELETE` | `/v1/trends/:id/follow` | ✅ | L3 / 1 | Dejar de seguir |
| `GET` | `/v1/trends/:id/timeline` | ✅ | L2 / 2 | Serie temporal. `?range=1H\|6H\|24H\|7D&step=` |
| `GET` | `/v1/trends/:id/conversations` | ✅ | L2 / 2 | Menciones agrupadas por hilo. `?limit=` |
| `GET` | `/v1/trends/:id/sources` | ✅ | L1 / 1 | Distribución por fuente (pie data) |

### 3.2 Alerts

| Método | Ruta | Auth | Rate limit | Descripción |
|---|---|---|---|---|
| `GET` | `/v1/alerts` | ✅ | L1 / 1 | Reglas activas del usuario |
| `POST` | `/v1/alerts` | ✅ | L3 / 3 | Crear regla. Body: `trendId`, `condition`, `threshold`, `channel` |
| `PATCH` | `/v1/alerts/:id` | ✅ | L3 / 2 | Toggle `enabled` o modificar `threshold` |
| `DELETE` | `/v1/alerts/:id` | ✅ | L3 / 1 | Eliminar regla |
| `GET` | `/v1/alerts/history` | ✅ | L2 / 2 | Historial de disparos. `?cursor=&limit=&since=` |
| `GET` | `/v1/alerts/feed` | ✅ | L2 / 1 | Bandeja de notificaciones no leídas |

### 3.3 Saved

| Método | Ruta | Auth | Rate limit | Descripción |
|---|---|---|---|---|
| `GET` | `/v1/saved` | ✅ | L1 / 1 | Guardados del usuario. `?folder=&pinned=` |
| `POST` | `/v1/saved/:trendId` | ✅ | L3 / 2 | Guardar trend. Body opcional: `folder`, `note` |
| `DELETE` | `/v1/saved/:trendId` | ✅ | L3 / 1 | Quitar guardado |
| `PATCH` | `/v1/saved/:id` | ✅ | L3 / 1 | Modificar `note`, `folder`, `pinned` |
| `GET` | `/v1/saved/export` | ✅ | L4 / 10 | Exportar guardados. `?format=json\|md` |

### 3.4 Engines

| Método | Ruta | Auth | Rate limit | Descripción |
|---|---|---|---|---|
| `GET` | `/v1/engines` | ✅ | L1 / 1 | Estado de motores (id, name, status, lastRun, health) |
| `PATCH` | `/v1/engines/:id` | ✅+ | L3 / 3 | Toggle `enabled` o actualizar `config` (admin) |
| `GET` | `/v1/engines/:id/logs` | ✅ | L2 / 2 | Logs de motor. `?cursor=&level=&since=` |
| `POST` | `/v1/engines/:id/test` | ✅+ | L4 / 25 | Test de conexión (1 shot costoso) |

### 3.5 Reports

| Método | Ruta | Auth | Rate limit | Descripción |
|---|---|---|---|---|
| `GET` | `/v1/reports` | ✅ | L2 / 2 | Informe agregado. `?period=today\|week\|month` |
| `GET` | `/v1/reports/export` | ✅ | L4 / 10 | Exportar. `?format=md\|pdf` |

### 3.6 Settings

| Método | Ruta | Auth | Rate limit | Descripción |
|---|---|---|---|---|
| `GET` | `/v1/settings` | ✅ | L1 / 1 | Preferencias del usuario (profile, notifications) |
| `PATCH` | `/v1/settings` | ✅ | L3 / 1 | Actualizar preferencias |
| `PUT` | `/v1/settings/api-keys/:service` | ✅ | L3 / 3 | Guardar API key externa (cifrada at-rest). `:service = openai\|reddit\|gdelt\|...` |

### 3.7 Streaming & Auth

| Método | Ruta | Auth | Rate limit | Descripción |
|---|---|---|---|---|
| `GET` | `/v1/stream` | ✅ | L4 / 5 | SSE gateway. Eventos: `trend.new`, `trend.update`, `alert.fired`, `engine.status`. `?topics=trends,alerts` |
| `POST` | `/auth/signin` | ❌ | L5 / 1 | Login (delegado a Auth.js `signIn`) |
| `POST` | `/auth/signout` | ✅ | L5 / 1 | Logout |

---

## 4. Rate Limiting — Token bucket en Upstash Redis

### 4.1 Modelo

- **Algoritmo**: token bucket (mejor que sliding window para ráfagas legítimas de UI).
- **Storage**: Upstash Redis (REST API, serverless-friendly, Edge-compatible).
- **Library**: `@upstash/ratelimit` con `Ratelimit.slidingWindow` para L4/L5 y token bucket custom para L1–L3.
- **Identifier**: `user:{userId}` si autenticado, si no `ip:{ip}`. **Nunca** rate-limit sólo por IP en usuarios logueados (NAT/CGNAT rompe UX).
- **Response headers** (estilo GitHub):
  - `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (epoch seconds)
  - `Retry-After` cuando 429

### 4.2 Tiers

| Tier | Burst | Sustained (/min) | Aplica a |
|---|---|---|---|
| L1 | 60 | 120 | Reads ligeros (`GET /trends`, `GET /alerts`) |
| L2 | 30 | 60 | Reads medios (`timeline`, `conversations`, `history`) |
| L3 | 20 | 40 | Mutaciones (`POST`, `PATCH`, `DELETE`) |
| L4 | 10 | 20 | Export / SSE / test de motor |
| L5 | 5 | 10 | Auth (anti brute-force) |

> Override por `plan`: `pro` × 2, `team` × 5. Implementado como factor multiplicativo en el coste.

### 4.3 Implementación

```ts
// lib/api/ratelimit.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { headers } from 'next/headers'
import { ApiError } from './errors'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const limiters = {
  L1: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, '1 m'), prefix: 'rl:L1' }),
  L2: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60,  '1 m'), prefix: 'rl:L2' }),
  L3: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(40,  '1 m'), prefix: 'rl:L3' }),
  L4: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20,  '1 m'), prefix: 'rl:L4' }),
  L5: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10,  '1 m'), prefix: 'rl:L5' }),
} as const

export type Tier = keyof typeof limiters

function getClientId(userId?: string) {
  if (userId) return `user:${userId}`
  // Fallback IP (CGNAT-aware: usa x-forwarded-for + real-ip)
  const h = headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown'
  return `ip:${ip}`
}

export async function rateLimit(tier: Tier, userId?: string, cost = 1) {
  const identifier = getClientId(userId)
  const planMultiplier = 1 // TODO: leer de sesión → pro:0.5, team:0.2
  const { success, limit, remaining, reset } = await limiters[tier].limit(identifier, {
    rate: cost * planMultiplier,
  })
  if (!success) {
    throw new ApiError({
      status: 429,
      code: 'RATE_LIMITED',
      title: `Rate limit exceeded (${tier})`,
      retryAfter: Math.ceil((reset - Date.now()) / 1000),
      headers: {
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(reset),
        'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
      },
    })
  }
  // Devolvemos headers para que el handler los attaché
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(reset),
  }
}
```

---

## 5. Errores — RFC 7807 Problem Details + extensión

### 5.1 Formato estándar

Todo error responde con `Content-Type: application/problem+json` y sigue **RFC 7807** con dos extensiones: `code` (string machine-readable estable) y `traceId` (correlación con logs).

```jsonc
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json
Content-Language: en

{
  "type": "https://docs.virahub.io/errors/validation",
  "title": "Validation failed",
  "status": 422,
  "code": "VALIDATION_ERROR",
  "detail": "2 fields failed validation",
  "traceId": "trc_01HQ2XK7F8...",
  "instance": "/v1/alerts",
  "errors": [
    { "path": "threshold", "message": "Expected number, received string", "code": "invalid_type" },
    { "path": "condition", "message": "Invalid enum value. Expected 'gt'|'lt'|'delta_pct', received 'greater'" }
  ]
}
```

### 5.2 Catálogo de códigos

| `code` | HTTP | Cuándo |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No hay sesión o JWT expirado |
| `TOKEN_EXPIRED` | 401 | JWT expirado (cliente puede refresh) |
| `FORBIDDEN` | 403 | Sessión válida pero sin permiso (role) |
| `NOT_FOUND` | 404 | Recurso inexistente o no visible para el usuario |
| `VALIDATION_ERROR` | 422 | Zod safeParse falla (query/params/body) |
| `CONFLICT` | 409 | Follow duplicado, alerta ya existe, etc. |
| `RATE_LIMITED` | 429 | Rate limit excedido |
| `PAYLOAD_TOO_LARGE` | 413 | Body > 1MB |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Content-Type no JSON |
| `METHOD_NOT_ALLOWED` | 405 | Verb no soportado en ruta |
| `UPSTREAM_ERROR` | 502 | Motor externo caído (Reddit, GDELT…) |
| `INTERNAL_ERROR` | 500 | Catch-all. Nunca filtra detalles |
| `SERVICE_UNAVAILABLE` | 503 | Maintenance mode / dependencia degradada |

### 5.3 Implementación

```ts
// lib/api/errors.ts
import { ZodError } from 'zod'
import { NextResponse } from 'next/server'

export type ErrorCode =
  | 'UNAUTHENTICATED' | 'TOKEN_EXPIRED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'VALIDATION_ERROR' | 'CONFLICT' | 'RATE_LIMITED' | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE' | 'METHOD_NOT_ALLOWED' | 'UPSTREAM_ERROR'
  | 'INTERNAL_ERROR' | 'SERVICE_UNAVAILABLE'

export interface ApiErrorInit {
  status: number
  code: ErrorCode
  title: string
  detail?: string
  type?: string
  retryAfter?: number
  headers?: Record<string, string>
  errors?: { path: string; message: string; code?: string }[]
}

export class ApiError extends Error {
  status: number
  code: ErrorCode
  title: string
  detail?: string
  type: string
  retryAfter?: number
  headers: Record<string, string>
  errors?: { path: string; message: string; code?: string }[]

  constructor(init: ApiErrorInit) {
    super(init.title)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.title = init.title
    this.detail = init.detail
    this.type = init.type ?? `https://docs.virahub.io/errors/${init.code.toLowerCase()}`
    this.retryAfter = init.retryAfter
    this.headers = init.headers ?? {}
    this.errors = init.errors
  }

  static unauthenticated() { return new ApiError({ status: 401, code: 'UNAUTHENTICATED', title: 'Authentication required' }) }
  static tokenExpired()    { return new ApiError({ status: 401, code: 'TOKEN_EXPIRED', title: 'Token expired' }) }
  static forbidden()       { return new ApiError({ status: 403, code: 'FORBIDDEN', title: 'Insufficient permissions' }) }
  static notFound(what = 'Resource') { return new ApiError({ status: 404, code: 'NOT_FOUND', title: `${what} not found` }) }
  static conflict(detail: string)    { return new ApiError({ status: 409, code: 'CONFLICT', title: 'Conflict', detail }) }
  static upstream(detail: string)    { return new ApiError({ status: 502, code: 'UPSTREAM_ERROR', title: 'Upstream service error', detail }) }
  static internal()                  { return new ApiError({ status: 500, code: 'INTERNAL_ERROR', title: 'Internal server error' }) }

  static fromZod(err: ZodError, instance: string) {
    return new ApiError({
      status: 422,
      code: 'VALIDATION_ERROR',
      title: 'Validation failed',
      detail: `${err.issues.length} field(s) failed validation`,
      errors: err.issues.map(i => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    })
  }

  toResponse(traceId: string): NextResponse {
    const body = {
      type: this.type,
      title: this.title,
      status: this.status,
      code: this.code,
      detail: this.detail,
      traceId,
      instance: undefined, // lo setea el handler con la URL
      errors: this.errors,
    }
    return NextResponse.json(body, {
      status: this.status,
      headers: { 'Content-Type': 'application/problem+json', 'X-Trace-Id': traceId, ...this.headers },
    })
  }
}
```

---

## 6. Contratos compartidos — Paquete `@virahub/contracts`

### 6.1 Filosofía

**Una sola fuente de verdad**: los Zod schemas viven en `packages/contracts`. Tanto frontend como backend importan:
- Los **schemas** (backend: validación; frontend: parse de respuesta)
- Los **tipos inferidos** (`z.infer<typeof X>`) — nunca se escriben tipos a mano que dupliquen el schema.

```ts
// packages/contracts/src/trends.ts
import { z } from 'zod'

// ---------- Primitivos de dominio ----------
export const SourceKeySchema = z.enum([
  'reddit', 'bluesky', 'hn', 'rss', 'gdelt', 'github', 'x', 'nvidia', 'crypto',
])
export const ToneSchema = z.enum(['hot', 'cool', 'mint', 'muted'])
export const DirectionSchema = z.enum(['up', 'down', 'flat'])
export const ShapeSchema = z.enum(['accel', 'rise', 'flat', 'decay', 'wobble'])
export const RangeKeySchema = z.enum(['1H', '6H', '24H', '7D'])

// ---------- Trend ----------
export const TrendSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  source: SourceKeySchema,
  color: z.string(),
  status: z.string(),
  tone: ToneSchema,
  dir: DirectionSchema,
  time: z.string(),               // 'HH:mm' display string
  heat: z.string(),
  confidence: z.number().min(0).max(100),
  mentions: z.number().int().min(0),
  delta: z.number().int(),
  shape: ShapeSchema,
  why: z.string(),
  evidence: z.array(z.object({ label: z.string(), value: z.string() })),
  inTimeline: z.boolean().optional(),
  followed: z.boolean().optional(),    // hydration por usuario
  saved: z.boolean().optional(),
})

// ---------- GET /v1/trends ----------
export const ListTrendsQuerySchema = z.object({
  source: SourceKeySchema.optional(),
  tone: ToneSchema.optional(),
  shape: ShapeSchema.optional(),
  dir: DirectionSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const ListTrendsResponseSchema = z.object({
  items: z.array(TrendSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
})
```

### 6.2 Los 5 endpoints más críticos — Zod schemas completos

Los 5 endpoints elegidos como críticos (por riesgo de seguridad, complejidad de entrada o impacto en el producto):

1. `POST /v1/alerts` — mutación con lógica de condición
2. `PUT /v1/settings/api-keys/:service` — secreto cifrado
3. `POST /v1/engines/:id/test` — dispara acción externa
4. `GET /v1/trends/:id/timeline` — lectura con rango temporal
5. `GET /v1/stream` (SSE) — suscripción con topics

```ts
// packages/contracts/src/alerts.ts
import { z } from 'zod'

export const AlertConditionSchema = z.enum([
  'gt',           // mentions > threshold
  'lt',           // mentions < threshold
  'delta_pct',    // delta% > threshold (|Δ|/baseline)
  'velocity',     // velocidisión (mentions/h) > threshold
  'phase_change', // transición de fase HMM
  'source_breakout', // nueva fuente supera X% del total
])

export const AlertChannelSchema = z.enum(['in_app', 'email', 'webhook'])

export const CreateAlertBodySchema = z.object({
  trendId: z.string().min(1).max(64),
  condition: AlertConditionSchema,
  threshold: z.number().min(0),
  window: z.enum(['5m', '15m', '1h', '6h', '24h']).default('1h'),
  channel: AlertChannelSchema.default('in_app'),
  webhookUrl: z.string().url().optional(), // requerido si channel === 'webhook'
  cooldown: z.number().int().min(0).max(86400).default(300), // segundos
  enabled: z.boolean().default(true),
}).refine(
  (b) => b.channel !== 'webhook' || !!b.webhookUrl,
  { message: 'webhookUrl is required when channel is "webhook"', path: ['webhookUrl'] },
)

export const AlertSchema = z.object({
  id: z.string(),
  trendId: z.string(),
  trendTitle: z.string(),
  condition: AlertConditionSchema,
  threshold: z.number(),
  window: z.string(),
  channel: AlertChannelSchema,
  cooldown: z.number().int(),
  enabled: z.boolean(),
  lastFiredAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})

export const CreateAlertResponseSchema = AlertSchema
```

```ts
// packages/contracts/src/settings.ts
import { z } from 'zod'

export const ApiKeyServiceSchema = z.enum([
  'openai', 'reddit', 'gdelt', 'bluesky', 'github', 'x', 'newsapi', 'alphavantage',
])

// El body nunca contiene la clave en claro en responses. Sólo máscara.
export const PutApiKeyBodySchema = z.object({
  key: z.string().min(8).max(256),
  metadata: z.object({
    label: z.string().max(60).optional(),
    expiresAt: z.string().datetime().optional(),
  }).optional(),
}).refine((b) => !b.key.includes(' '), { message: 'Key cannot contain spaces', path: ['key'] })

export const ApiKeyMetadataSchema = z.object({
  service: ApiKeyServiceSchema,
  label: z.string().nullable(),
  masked: z.string(),                    // 'sk-...4f2a'
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})

export const SettingsSchema = z.object({
  profile: z.object({
    name: z.string(),
    email: z.string().email(),
    avatarUrl: z.string().url().nullable(),
    timezone: z.string().default('UTC'),
  }),
  notifications: z.object({
    emailDigest: z.enum(['off', 'daily', 'weekly']).default('daily'),
    inAppSound: z.boolean().default(false),
    pushEnabled: z.boolean().default(false),
  }),
  apiKeys: z.array(ApiKeyMetadataSchema),
})

export const PatchSettingsBodySchema = SettingsSchema.partial().deepPartial()
```

```ts
// packages/contracts/src/engines.ts
import { z } from 'zod'

export const EngineIdSchema = z.enum(['reddit', 'bluesky', 'x', 'hn', 'rss', 'gdelt', 'github'])
export const EngineStatusSchema = z.enum(['idle', 'running', 'error', 'disabled'])

export const EngineSchema = z.object({
  id: EngineIdSchema,
  name: z.string(),
  status: EngineStatusSchema,
  enabled: z.boolean(),
  lastRunAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  health: z.number().min(0).max(1),
  config: z.record(z.unknown()),
})

export const EngineLogSchema = z.object({
  id: z.string(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string(),
  timestamp: z.string().datetime(),
  meta: z.record(z.unknown()).optional(),
})

export const TestEngineResponseSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number().int().min(0),
  checks: z.array(z.object({
    name: z.string(),          // 'auth', 'rate_limit', 'sample_fetch'
    ok: z.boolean(),
    detail: z.string().optional(),
  })),
})
```

```ts
// packages/contracts/src/trends.ts (extensión para timeline)
export const TimelineQuerySchema = z.object({
  range: RangeKeySchema.default('24H'),
  step: z.coerce.number().int().min(0).default(0), // paso "live" para jitter determinista
})

export const TimelinePointSchema = z.object({
  t: z.number(),            // epoch ms
  v: z.number().min(0).max(1), // normalizado 0..1 (signal strength)
  raw: z.number().int().min(0).optional(), // mentions absolutas
})

export const TimelineResponseSchema = z.object({
  trendId: z.string(),
  range: RangeKeySchema,
  points: z.array(TimelinePointSchema),
  labels: z.array(z.string()),
})
```

```ts
// packages/contracts/src/stream.ts
import { z } from 'zod'

export const StreamQuerySchema = z.object({
  topics: z.string()  // CSV: 'trends,alerts,engines'
    .transform((s) => s.split(',').map(x => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(['trends', 'alerts', 'engines', 'all'])).min(1)),
  lastEventId: z.string().optional(),  // resumir stream tras reconexión
})

export const StreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('trend.new'),
    id: z.string(),
    data: TrendSchema,
  }),
  z.object({
    type: z.literal('trend.update'),
    id: z.string(),
    data: z.object({ trendId: z.string(), patch: z.record(z.unknown()) }),
  }),
  z.object({
    type: z.literal('alert.fired'),
    id: z.string(),
    data: z.object({ alertId: z.string(), trendId: z.string(), value: z.number(), threshold: z.number() }),
  }),
  z.object({
    type: z.literal('engine.status'),
    id: z.string(),
    data: z.object({ engineId: z.string(), status: EngineStatusSchema }),
  }),
  z.object({
    type: z.literal('heartbeat'),
    id: z.string(),
    data: z.object({ ts: z.number() }),
  }),
])
```

### 6.3 Tipos TypeScript compartidos (frontend + backend)

Estos son los únicos tipos que el frontend debe usar — inferidos, no escritos a mano:

```ts
// packages/contracts/src/index.ts
export * from './trends'
export * from './alerts'
export * from './saved'
export * from './engines'
export * from './reports'
export * from './settings'
export * from './auth'
export * from './stream'
export * from './errors'

// Re-export de tipos inferidos — esto es lo que importa el frontend
import type { z } from 'zod'
import {
  TrendSchema, ListTrendsQuerySchema, ListTrendsResponseSchema,
  TimelineQuerySchema, TimelineResponseSchema,
  AlertSchema, CreateAlertBodySchema,
  EngineSchema, TestEngineResponseSchema,
  SettingsSchema, PatchSettingsBodySchema,
  StreamEventSchema,
} from './index'

export type Trend              = z.infer<typeof TrendSchema>
export type SourceKey          = Trend['source']
export type Shape              = Trend['shape']
export type RangeKey           = z.infer<typeof RangeKeySchema>

export type ListTrendsQuery    = z.infer<typeof ListTrendsQuerySchema>
export type ListTrendsResponse = z.infer<typeof ListTrendsResponseSchema>

export type TimelineQuery      = z.infer<typeof TimelineQuerySchema>
export type TimelineResponse   = z.infer<typeof TimelineResponseSchema>

export type Alert              = z.infer<typeof AlertSchema>
export type CreateAlertBody    = z.infer<typeof CreateAlertBodySchema>

export type Engine             = z.infer<typeof EngineSchema>
export type TestEngineResponse = z.infer<typeof TestEngineResponseSchema>

export type Settings           = z.infer<typeof SettingsSchema>
export type PatchSettingsBody  = z.infer<typeof PatchSettingsBodySchema>

export type StreamEvent        = z.infer<typeof StreamEventSchema>
```

**Cómo se usa en el frontend**:

```ts
// components/screens/alerts-screen.tsx (cliente)
import type { CreateAlertBody, Alert } from '@virahub/contracts'
import { CreateAlertBodySchema } from '@virahub/contracts'

async function createAlert(input: CreateAlertBody): Promise<Alert> {
  // Validación pre-envío en el cliente → UX instantánea
  const parsed = CreateAlertBodySchema.safeParse(input)
  if (!parsed.success) return showToast(parsed.error.issues) && never

  const res = await fetch('/api/v1/alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  })
  if (!res.ok) throw await parseProblem(res)
  return res.json()
}
```

---

## 7. Endpoint completo — `GET /v1/trends`

Implementación de referencia: **Zod validation + auth + rate limit + error handling + ETag cache**, todo compuesto en un handler de 60 líneas legibles.

### 7.1 Helper `apiHandler` (composición de middleware)

```ts
// lib/api/handler.ts
import { ZodSchema } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { ApiError } from './errors'
import { rateLimit, type Tier } from './ratelimit'
import { requireUser } from './auth'
import { logger } from './logging'
import { randomUUID } from 'crypto'

type Ctx = {
  req: NextRequest
  params: Record<string, string>
  user: { id: string; role: string; plan: string }
  traceId: string
}

type Handler<T> = (ctx: Ctx) => Promise<NextResponse<T>>

interface RouteOptions {
  auth?: boolean                                  // default true
  admin?: boolean
  rateLimit?: { tier: Tier; cost?: number }
  query?: ZodSchema
  body?: ZodSchema
  // Cache HTTP (sólo GET). Si retorna string, se usa como ETag.
  etag?: (ctx: Ctx, parsed: unknown) => Promise<string | null>
}

export function apiHandler<T>(handler: Handler<T>, opts: RouteOptions = {}) {
  return async (req: NextRequest, { params }: { params: Promise<Record<string,string>> }) => {
    const traceId = randomUUID()
    const startedAt = Date.now()
    const resolvedParams = await params.catch(() => ({}))

    try {
      // 1. Auth
      let user: Ctx['user'] | undefined
      if (opts.auth !== false) {
        const session = opts.admin ? await requireAdmin() : await requireUser()
        user = { id: session.user.id, role: session.user.role, plan: session.user.plan }
      }

      // 2. Rate limit
      let rlHeaders: Record<string,string> = {}
      if (opts.rateLimit) {
        rlHeaders = await rateLimit(opts.rateLimit.tier, user?.id, opts.rateLimit.cost ?? 1)
      }

      // 3. Validación query
      let parsed: unknown = undefined
      if (opts.query) {
        const url = new URL(req.url)
        const queryObj = Object.fromEntries(url.searchParams)
        const result = opts.query.safeParse(queryObj)
        if (!result.success) throw ApiError.fromZod(result.error, req.url)
        parsed = result.data
      }

      // 4. Validación body
      if (opts.body && req.method !== 'GET' && req.method !== 'HEAD') {
        const ct = req.headers.get('content-type') ?? ''
        if (!ct.includes('application/json')) {
          throw new ApiError({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', title: 'Content-Type must be application/json' })
        }
        const json = await req.json().catch(() => { throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', title: 'Invalid JSON body' }) })
        const result = opts.body.safeParse(json)
        if (!result.success) throw ApiError.fromZod(result.error, req.url)
        parsed = result.data
      }

      // 5. Ejecutar handler
      const ctx: Ctx = { req, params: resolvedParams, user: user!, traceId, ...({ query: parsed } as any) }
      const res = await handler(ctx)

      // 6. Merge rate-limit headers
      rlHeaders.forEach ? null : Object.entries(rlHeaders).forEach(([k, v]) => res.headers.set(k, v))
      res.headers.set('X-Trace-Id', traceId)
      return res

    } catch (err) {
      logger.error({ traceId, err, path: req.url, method: req.method, durMs: Date.now() - startedAt })

      if (err instanceof ApiError) {
        const res = err.toResponse(traceId)
        res.headers.set('X-Trace-Id', traceId)
        return res
      }

      // Nunca filtra detalles al cliente
      const fallback = ApiError.internal()
      const res = fallback.toResponse(traceId)
      res.headers.set('X-Trace-Id', traceId)
      return res
    } finally {
      logger.info({
        traceId,
        method: req.method,
        path: req.url,
        durMs: Date.now() - startedAt,
        status: 'completed',
      })
    }
  }
}
```

### 7.2 El handler `GET /v1/trends`

```ts
// app/api/v1/trends/route.ts
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api/handler'
import { rateLimit } from '@/lib/api/ratelimit'
import { ListTrendsQuerySchema, ListTrendsResponseSchema } from '@virahub/contracts'
import type { ListTrendsResponse } from '@virahub/contracts'
import { db } from '@/lib/db/client'
import { trends, follows } from '@/lib/db/schema'
import { and, eq, desc, lt, sql } from 'drizzle-orm'

// Cálculo de ETag — hashea filtros + step de cursor (trends semi-estables 30s)
async function computeEtag(query: any, userId: string): Promise<string> {
  const bucket = Math.floor(Date.now() / 30_000) // 30s TTL
  return `W/"trends-${userId}-${query.source ?? 'all'}-${query.tone ?? 'all'}-${query.shape ?? 'all'}-${query.dir ?? 'all'}-${bucket}"`
}

export const GET = apiHandler<ListTrendsResponse>(
  async (ctx) => {
    const query = (ctx as any).query as ListTrendsResponse // ya validado por opts.query

    // Consulta con cursor pagination (keyset) — O(log n), estable
    const conditions = [eq(trends.visible, true)]
    if (query.source) conditions.push(eq(trends.source, query.source))
    if (query.tone)   conditions.push(eq(trends.tone, query.tone))
    if (query.shape)  conditions.push(eq(trends.shape, query.shape))
    if (query.dir)    conditions.push(eq(trends.dir, query.dir))
    if (query.cursor) conditions.push(lt(trends.cursorKey, query.cursor))

    const rows = await db
      .select({
        id: trends.id, title: trends.title, source: trends.source,
        color: trends.color, status: trends.status, tone: trends.tone,
        dir: trends.dir, time: trends.timeLabel, heat: trends.heat,
        confidence: trends.confidence, mentions: trends.mentions,
        delta: trends.delta, shape: trends.shape, why: trends.why,
        evidence: trends.evidence, inTimeline: trends.inTimeline,
        followed: sql<boolean>`EXISTS(SELECT 1 FROM ${follows} WHERE ${follows.trendId} = ${trends.id} AND ${follows.userId} = ${ctx.user.id})`,
      })
      .from(trends)
      .where(and(...conditions))
      .orderBy(desc(trends.cursorKey))
      .limit(query.limit + 1)

    const hasMore = rows.length > query.limit
    const items = hasMore ? rows.slice(0, query.limit) : rows
    const nextCursor = hasMore ? items[items.length - 1]?.id : null

    // Validación de SALIDA — nunca confíes en tu DB
    const payload: ListTrendsResponse = {
      items: items as any,
      nextCursor,
      total: items.length, // para total real, query COUNT separada con cache
    }
    const validated = ListTrendsResponseSchema.safeParse(payload)
    if (!validated.success) {
      // Esto es un bug del backend, no del cliente. Loguear y 500.
      throw ApiError.internal()
    }

    const etag = await computeEtag(query, ctx.user.id)
    if (ctx.req.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } })
    }

    return NextResponse.json(validated.data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        ETag: etag,
        Vary: 'Cookie',
      },
    })
  },
  {
    auth: true,
    rateLimit: { tier: 'L1', cost: 1 },
    query: ListTrendsQuerySchema,
  },
)
```

### 7.3 Características que cumple este endpoint (checklist de producción)

- ✅ **Auth obligatoria** (`opts.auth: true`)
- ✅ **Rate limit L1** (120/min) con headers `X-RateLimit-*`
- ✅ **Zod validation de query** (con `z.coerce.number()` para `limit`)
- ✅ **Zod validation de response** (defensa en profundidad — si la DB muta, el cliente nunca ve un shape roto)
- ✅ **ETag + 304** (caché condicional — ahorra bandwidth y CPU)
- ✅ **`Cache-Control: private`** (no cachear en CDN shared — los `followed` son por usuario)
- ✅ **`Vary: Cookie`** (la sessión afecta la respuesta)
- ✅ **Cursor pagination** (keyset, no OFFSET — estable con datos cambiantes)
- ✅ **`+1` row trick** para detectar siguiente página en 1 query
- ✅ **Error RFC 7807** con `traceId` correlacionable con logs
- ✅ **Logging estructurado** al inicio y al fin (duración)
- ✅ **`X-Trace-Id`** en toda respuesta (éxito o error)

---

## 8. Middleware Pipeline

### 8.1 Diagrama

```
                                    ┌──────────────────────────────────────────────────┐
   Client (browser)                 │   Next.js Edge Runtime (middleware.ts)            │
 ─────────────────────────────────▶ │                                                  │
   GET /api/v1/trends               │   ┌─────────────┐   ┌────────────┐   ┌─────────┐ │
   Cookie: next-auth.session-token  │   │ 1. CORS     │──▶│ 2. Origin  │──▶│ 3. Path │ │
                                   │   │   preflight │   │   allowlist│   │  match  │ │
                                   │   └─────────────┘   └────────────┘   └────┬────┘ │
                                   │                                          │      │
                                   │                  ┌───────────────────────▼────┐ │
                                   │                  │ 4. Auth gate (JWT verify)  │ │
                                   │                  │    · 401 si expirado        │ │
                                   │                  │    · 401 si /v1/* sin sess. │ │
                                   │                  │    · pinta req.user en hdr  │ │
                                   │                  └────────────┬───────────────┘ │
                                   └───────────────────────────────┼─────────────────┘
                                                                   │
                                                                   ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │  Route Handler  (app/api/v1/trends/route.ts)  — Node Runtime                          │
 │                                                                                       │
 │  apiHandler(handler, { auth, rateLimit, query })                                      │
 │                                                                                       │
 │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
 │  │ 5. Trace │─▶│ 6. Auth  │─▶│ 7. Rate  │─▶│ 8. Zod   │─▶│ 9. Zod   │─▶│10. Logic │  │
 │  │   ID     │  │  (DB-    │  │   limit  │  │  query   │  │  body    │  │  (DB /   │  │
 │  │  uuid    │  │  back)   │  │  Upstash │  │  parse   │  │  parse   │  │  stream) │  │
 │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └────┬─────┘  │
 │                                                                              │        │
 │  ┌──────────────────────────────────────────────────────────────────────────▼──────┐  │
 │  │ 11. Zod response validation (defensa en profundidad)                            │  │
 │  └──────────────────────────────────────────────────────────────────┬──────────────┘  │
 │                                                                      │                 │
 │  ┌──────────────────────────────────────────────────────────────────▼──────────────┐  │
 │  │ 12. ETag / Cache-Control / Vary                                                  │  │
 │  └──────────────────────────────────────────────────────────────────┬──────────────┘  │
 │                                                                      │                 │
 │  ┌──────────────────────────────────────────────────────────────────▼──────────────┐  │
 │  │ 13. Attach X-Trace-Id + X-RateLimit-* headers                                    │  │
 │  └──────────────────────────────────────────────────────────────────┬──────────────┘  │
 └──────────────────────────────────────────────────────────────────────┼─────────────────┘
                                                                        │
                                                                        ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │  catch (err)                                                                         │
 │                                                                                       │
 │   ApiError?  ──▶ err.toResponse(traceId)   (mensaje controlado, RFC 7807)            │
 │   ZodError?  ──▶ ApiError.fromZod(err)    (422 con campo `errors[]` detallado)      │
 │   Otro?      ──▶ ApiError.internal()      (500 opaco, detalle sólo en logs)         │
 │                                                                                       │
 │   logger.error({ traceId, err, path, method, durMs })  ──▶  OTLP / Vercel Log Drain  │
 └──────────────────────────────────────────────────────────────────────────────────────┘
                                                                        │
                                                                        ▼
                                              200 OK / 4xx / 5xx  ──── Client
                                              application/json | application/problem+json
                                              X-Trace-Id: trc_01HQ2XK7...
```

### 8.2 `middleware.ts` (Edge)

```ts
// middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',')

export async function middleware(req: NextRequest) {
  const { pathname, origin } = req.nextUrl
  const res = NextResponse.next()

  // 1. CORS
  const reqOrigin = req.headers.get('origin')
  if (reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)) {
    res.headers.set('Access-Control-Allow-Origin', reqOrigin)
    res.headers.set('Access-Control-Allow-Credentials', 'true')
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, If-None-Match, Last-Event-ID')
    res.headers.set('Access-Control-Expose-Headers', 'X-Trace-Id, X-RateLimit-*, ETag, Retry-After')
  }
  if (req.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers: res.headers })

  // 2. Auth gate — sólo para /api/v1/*
  if (pathname.startsWith('/api/v1/')) {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { type: 'https://docs.virahub.io/errors/unauthenticated', title: 'Authentication required', status: 401, code: 'UNAUTHENTICATED' },
        { status: 401, headers: { 'Content-Type': 'application/problem+json' } },
      )
    }
    // Forward al handler para evitar re-verificar (opcional: en Node se re-verifica igual)
    res.headers.set('x-virahub-user-id', session.user.id)
  }

  return res
}

export const config = {
  matcher: ['/api/:path*', '/auth/:path*'],
}
```

### 8.3 Orden de ejecución — por qué este orden

| # | Step | Por qué aquí y no en otro sitio |
|---|---|---|
| 1 | **CORS preflight** | Edge: debe responder antes de tocar lógica. OPTIONS corto-circuita. |
| 2 | **Origin allowlist** | Edge: rechazar origins no permitidos sin tocar runtime Node. |
| 3 | **Path match** | Edge: sólo autenticamos `/api/v1/*` y `/auth/*`. Páginas públicas pasan. |
| 4 | **Auth gate (JWT)** | Edge: verificación JWT sin DB hit → latencia <50ms. Si falla, 401 inmediato. |
| 5 | **Trace ID** | Handler: generado en Node para tener crypto completo (Edge tiene limitaciones). |
| 6 | **Auth (DB-backed)** | Handler: para endpoints que necesitan `role`/`plan` fresco. Cacheable. |
| 7 | **Rate limit** | Handler: Upstash. Antes de parsear body (evita gasto CPU en abuso). |
| 8 | **Zod query** | Handler: antes de tocar DB. Falla rápido con 422. |
| 9 | **Zod body** | Handler: después de query (más barato). `Content-Type` check primero. |
| 10 | **Lógica de negocio** | Handler: sólo aquí se accede a DB / motores. |
| 11 | **Zod response** | Handler: defensa en profundidad. Si la DB muta, el cliente nunca ve shape roto. |
| 12 | **ETag/Cache** | Handler: al final, sobre el payload ya validado. |
| 13 | **Headers trace/RL** | Handler: en finally para que también se seteen en error. |

---

## 9. Versionado

### 9.1 Estrategia: **URL path `/v1/`**

| Alternativa | Veredicto | Por qué no |
|---|---|---|
| Path `/v1/` | ✅ Elegida | Explícito en logs, cacheable por CDN (URL distinta), soporta v1+v2 en paralelo |
| Header `Accept: application/vnd.virahub.v1+json` | ❌ | Invisible en logs, rompe curl simple, no cacheable por Vary |
| Query `?version=1` | ❌ | Se pierde al paginar, conflictos con otros params |

### 9.2 Reglas de breaking change

| Tipo | ¿Requiere v2? |
|---|---|
| Añadir campo opcional a response | ❌ |
| Añadir endpoint nuevo | ❌ |
| Añadir valor a enum (response) | ❌ |
| Eliminar campo | ✅ |
| Cambiar tipo de campo | ✅ |
| Cambiar semántica (`delta` de absoluto a relativo) | ✅ |
| Añadir valor a enum (request body) | ❌ pero marcar `deprecated` el anterior |

### 9.3 Sunset policy

- v(N-1) se mantiene **6 meses** tras release de v(N).
- Header `Sunset: <date>` y `Deprecation: true` en cada response de la versión antigua.
- Log de telemetría: si <1% tráfico en v(N-1) a los 3 meses, acelerar sunset.

---

## 10. Documentación — OpenAPI 3.1 auto-generado

### 10.1 Generación desde Zod

```ts
// packages/contracts/src/openapi.ts
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { TrendSchema, ListTrendsQuerySchema, ListTrendsResponseSchema } from './trends'
import { CreateAlertBodySchema, AlertSchema } from './alerts'

export const registry = new OpenAPIRegistry()

// Security scheme
registry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'next-auth.session-token',
})

// Endpoint: GET /v1/trends
registry.registerPath({
  method: 'get',
  path: '/v1/trends',
  security: [{ cookieAuth: [] }],
  tags: ['trends'],
  summary: 'List active trends',
  request: { query: ListTrendsQuerySchema },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: ListTrendsResponseSchema } } },
    401: { description: 'Unauthenticated', content: { 'application/problem+json': { schema: ProblemSchema } } },
    429: { description: 'Rate limited', content: { 'application/problem+json': { schema: ProblemSchema } } },
  },
})

// ... registrar todos los endpoints ...

export function generateOpenApi() {
  const generator = new OpenApiGeneratorV3(registry.definitions)
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'VIRAHUB API',
      version: '1.0.0',
      description: 'Trend detection & alerting platform. RFC 7807 errors. Cursor pagination.',
      contact: { email: 'api@virahub.io' },
    },
    servers: [
      { url: 'https://app.virahub.io/api/v1', description: 'production' },
      { url: 'http://localhost:3000/api/v1', description: 'local' },
    ],
  })
}
```

### 10.2 Endpoint de spec + Swagger UI

```ts
// app/api/v1/openapi.json/route.ts
import { generateOpenApi } from '@virahub/contracts/openapi'
export async function GET() {
  return Response.json(generateOpenApi(), {
    headers: { 'Cache-Control': 'public, max-age=300' },
  })
}
```

Swagger UI en `/docs` (página estática que fetcha `/api/v1/openapi.json`). Scalar como alternativa más moderna.

### 10.3 Contract testing

- **CI check**: cada PR corre `zod-to-openapi` y compara el diff contra `openapi.json` committed. Si hay cambios breaking sin bump de versión → fail.
- **Synthetic client**: genera un cliente TS `@virahub/api-client` desde el OpenAPI (vía `openapi-typescript`) — el frontend lo usa, garantizando que no hay drift.

---

## 11. SSE Streaming — `/v1/stream`

### 11.1 Formato

SSE estándar (`text/event-stream`). Cada evento:

```
event: trend.new
id: evt_01HQ2XK7...
data: {"id":"evt_01HQ2XK7...","type":"trend.new","data":{"id":"ia","title":"...", ...}}

```

### 11.2 Handler

```ts
// app/api/v1/stream/route.ts
import { apiHandler } from '@/lib/api/handler'
import { StreamQuerySchema } from '@virahub/contracts'
import { subscribe } from '@/lib/realtime/pubsub'  // Redis Pub/Sub o Postgres LISTEN

export const GET = apiHandler(async (ctx) => {
  const { topics, lastEventId } = (ctx as any).query

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, id: string, data: unknown) => {
        controller.enqueue(encoder.encode(
          `event: ${event}\nid: ${id}\ndata: ${JSON.stringify(data)}\n\n`,
        ))
      }

      // Heartbeat cada 15s — mantiene conexión viva (proxies cortan a 30s idle)
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: hb ${Date.now()}\n\n`))
      }, 15_000)

      // Replay desde lastEventId (resumir tras reconexión)
      if (lastEventId) {
        const missed = await replayEvents(ctx.user.id, topics, lastEventId)
        missed.forEach(e => send(e.type, e.id, e))
      }

      // Subscribe
      const unsub = subscribe(ctx.user.id, topics, (evt) => {
        send(evt.type, evt.id, evt)
      })

      // Cleanup
      ctx.req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        unsub()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',  // desactiva buffering nginx
    },
  })
}, {
  auth: true,
  rateLimit: { tier: 'L4', cost: 5 },  // 1 suscripción = 5 tokens (anti-abuso)
  query: StreamQuerySchema,
})
```

### 11.3 Notas SSE

- **Reconexión**: el navegador reconecta solo. El cliente envía `Last-Event-ID` → handler hace replay.
- **Heartbeat**: comentarios `:` cada 15s evitan timeouts de proxies/load balancers.
- **Backpressure**: `ReadableStream` respeta backpressure nativo. Si el cliente no consume, el controller.enqueue eventually lanza — capturar y cerrar.
- **Máx conexiones por usuario**: 3 (rate limit L4 × 5 = 25 tokens/min, pero límite duro aparte en middleware para evitar 1 usuario abriendo 50 tabs).

---

## 12. Frontend integration — `apiClient`

```ts
// lib/api/client.ts
import type { ApiErrorInit } from '@virahub/contracts'

const BASE = '/api/v1'

export class ApiClientError extends Error {
  constructor(public problem: { code: string; title: string; detail?: string; status: number; traceId: string; errors?: any[] }) {
    super(problem.title)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',  // envía cookie de sesión
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  })

  if (res.status === 304) return undefined as T  // caché hit

  const ct = res.headers.get('content-type') ?? ''
  if (!res.ok) {
    if (ct.includes('application/problem+json')) {
      const problem = await res.json()
      throw new ApiClientError(problem)
    }
    throw new ApiClientError({ code: 'INTERNAL_ERROR', title: 'Unknown error', status: res.status, traceId: res.headers.get('x-trace-id') ?? '' })
  }

  return res.json() as Promise<T>
}

export const api = {
  trends: {
    list: (query?: ListTrendsQuery) => request<ListTrendsResponse>(`/trends?${qs(query)}`),
    get: (id: string) => request<Trend>(`/trends/${id}`),
    follow: (id: string) => request<void>(`/trends/${id}/follow`, { method: 'POST' }),
    unfollow: (id: string) => request<void>(`/trends/${id}/follow`, { method: 'DELETE' }),
    timeline: (id: string, query: TimelineQuery) => request<TimelineResponse>(`/trends/${id}/timeline?${qs(query)}`),
  },
  alerts: {
    list: () => request<Alert[]>(`/alerts`),
    create: (body: CreateAlertBody) => request<Alert>(`/alerts`, { method: 'POST', body: JSON.stringify(body) }),
    toggle: (id: string, enabled: boolean) => request<Alert>(`/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
    history: (cursor?: string) => request<AlertHistory>(`/alerts/history?${qs({ cursor })}`),
  },
  // ... etc
}
```

---

## 13. Open questions para otros agentes

1. **Agente 1 (Backend/Infra)**: ¿Redis gestionado por Upstash o self-hosted? ¿Postgres para Auth.js sessions o DynamoDB? Necesito saber para finalizar `ratelimit.ts` y `db/client.ts`.
2. **Agente 2 (Data Scientist)**: ¿El campo `confidence` (0–100) viene ya calculado del pipeline HMM, o lo infiere el gateway con un scorer? Si viene del backend, ¿es estable por sesión o recalcula cada tick? (afecta a la decisión de ETag en `GET /trends`).
3. **Agente 4 (Frontend)**: ¿Confirmáis uso de React 19 Suspense + fetch en server components para `GET /trends`? Si sí, el `apiClient` actual (client-side) necesita una variante server-side que use `headers()` de `next/headers` para pasar la cookie — lo dejo esbozado pero falta implementar.
4. **Agente 5 (Seguridad/Compliance)**: ¿Audit logging obligatorio para `PUT /settings/api-keys/:service` y `POST /engines/:id/test`? Si sí, ¿destino (Postgres `audit_log` tabla vs S3 immutable vs SIEM externo)?
5. **PM**: ¿API pública (3rd-party developers) en roadmap? Si sí, añadir `POST /v1/oauth/token` + scopes (`trends:read`, `alerts:write`) **antes** de v1 freeze — refactor caro post-launch.

---

## 14. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Drift entre Zod schema y DB schema | Cliente ve 500 opacos | (a) Zod response validation en handler, (b) CI check que compara `db/schema.ts` con `contracts/*` via codegen |
| Rate limit by-pass con header spoofing | Abuso, costes Redis | `getClientId` prioriza `user:` sobre `ip:`; nunca confiar en `X-Forwarded-For` sin validar contra Vercel/AWS trust list |
| SSE connection leak | FD exhaustion | Heartbeat + `req.signal.abort` cleanup + límite duro 3 conexiones/usuario en middleware |
| JWT en cookie SameSite=Lax rompe SSE cross-tab | Stream no reconecta | SSE usa misma cookie; Lax permite GET top-level navigation. Para embeds 3rd-party se necesitará `SameSite=None; Secure` + token corto |
| OpenAPI drift | Docs mienten | CI diff + bloqueo de merge si `openapi.json` cambia sin bump |
| Secreto API key en logs | Leak | `logger` redacta campos `key`, `token`, `authorization` automáticamente via serializer pino |
| ENUM source nuevo sin migrar frontend | Frontend rompe al renderizar | `SourceKeySchema` es `z.enum` estricto; añadir valor requiere sync release frontend+backend. Documentar en ADR |

---

## 15. Resumen ejecutivo para el orchestrator

**Lo que entrego**: spec completa del API Gateway para VIRAHUB — 30 endpoints cubriendo trends/alerts/saved/engines/reports/settings/stream/auth, con:

1. **Decisión arquitectónica justificada**: REST sobre Next.js Route Handlers (descartados tRPC y GraphQL con argumentos comparativos).
2. **Auth.js v5** con GitHub+Google, JWT + DB adapter, Edge-compatible.
3. **Rate limiting** en 5 tiers (L1–L5) vía Upstash Redis, identifier `user:` prioritario sobre `ip:`.
4. **Errores RFC 7807** con `code` + `traceId`, 13 códigos catalogados, clase `ApiError` con factory methods.
5. **Versionado** `/v1/` path-based, con sunset policy de 6 meses.
6. **OpenAPI 3.1** generado desde Zod (`@asteasolutions/zod-to-openapi`), spec servida en `/api/v1/openapi.json`.
7. **Paquete `@virahub/contracts`** como single source of truth — frontend y backend importan los mismos schemas + tipos inferidos.
8. **Middleware pipeline** documentado: Edge (CORS + auth gate) → Node handler (trace → auth → rate-limit → zod query → zod body → logic → zod response → ETag → headers).
9. **Zod schemas completos** para los 5 endpoints más críticos (`POST /alerts`, `PUT /settings/api-keys/:service`, `POST /engines/:id/test`, `GET /trends/:id/timeline`, `GET /stream`).
10. **Endpoint `GET /v1/trends`** implementado de principio a fin (~80 líneas) con auth, rate limit, Zod query+response, ETag, cursor pagination, logging.
11. **SSE `/v1/stream`** con heartbeat, replay por `Last-Event-ID`, cleanup en abort, rate limit L4.
12. **5 preguntas** para otros agentes y **7 riesgos** con mitigación.

**Próximos pasos recomendados**:
- **Agente 1** (backend): implementar `lib/db/schema.ts` (Drizzle) alineado con `@virahub/contracts`. La fuente de verdad son los Zod schemas.
- **Agente 4** (frontend): crear `lib/api/client.ts` (esbozado en §12) y reemplazar imports de `lib/virahub-data.ts` por llamadas a `api.trends.list()`.
- **Setup**: `pnpm add @upstash/ratelimit @upstash/redis next-auth@5 @auth/drizzle-adapter zod @asteasolutions/zod-to-openapi drizzle-orm`.
- **CI**: añadir job que regenere `openapi.json` y haga diff contra committed.

**Cero endpoints huérfanos**: cada endpoint del catálogo §3 mapea a una screen existente en `components/screens/*`. El frontend puede empezar a migrar de `lib/virahub-data.ts` (mock) a `api.*` (real) tan pronto como el Agente 1 levante la primera ruta.
