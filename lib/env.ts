/**
 * Centralized environment config with Zod validation.
 * All env reads in the app MUST go through this module.
 */
import { z } from 'zod'

const schema = z.object({
  // Database
  DATABASE_URL: z.string().default('file:./prisma/dev.db'),

  // NVIDIA NIM (Nemotron) — used for AI briefings
  NVIDIA_NIM_API_KEY: z.string().optional(),
  NVIDIA_NIM_BASE_URL: z.string().default('https://integrate.api.nvidia.com'),
  NVIDIA_NIM_MODEL: z.string().default('nvidia/nemotron-3-ultra-550b'),

  // Upstash Redis (optional; sandbox falls back to in-memory bus)
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Public site URL (for SSE CORS)
  NEXT_PUBLIC_SITE_URL: z.string().default('http://localhost:3000'),

  // Sandbox/preview URL
  NEXT_PUBLIC_VERCEL_URL: z.string().optional(),

  // Node env
  NODE_ENV: z.string().default('development'),
})

export type Env = z.infer<typeof schema>

function load(): Env {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    // Don't crash — log and use defaults. Missing optional keys are fine.
    console.warn('[env] invalid env config:', parsed.error.issues)
    return schema.parse({
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? 'file:./prisma/dev.db',
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
      NODE_ENV: process.env.NODE_ENV ?? 'development',
    })
  }
  return parsed.data
}

export const env = load()

/** True when running on Vercel/production with Redis available. */
export const hasRedis = !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)

/** True when AI briefing can actually call NVIDIA NIM. */
export const hasNim = !!env.NVIDIA_NIM_API_KEY
