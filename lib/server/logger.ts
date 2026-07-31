/**
 * Server-side logger — pino-shape without the pino dependency.
 * Writes JSON lines to stdout for Vercel log drain.
 */
type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const CURRENT = (process.env.LOG_LEVEL as Level) ?? 'info'

function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[CURRENT as Level]) return
  const line = JSON.stringify({
    level,
    time: Date.now(),
    msg,
    ...(meta ?? {}),
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
}
