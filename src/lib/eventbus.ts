// ─────────────────────────────────────────────────────────────────────────
// EventBus + NarrativeStore — backed by Upstash Redis
//
// - Redis stores narratives + activities persistently (shared across Vercel instances)
// - In-memory bus handles SSE fan-out within a single instance
// - New instances fetch state from Redis on first request
// ─────────────────────────────────────────────────────────────────────────

import { Redis } from '@upstash/redis';
import type { SSEEvent, Narrative, AgentActivity, NormalizedMention } from './types';

// ─── Redis client (singleton) ─────────────────────────────────────────────
const globalAny = globalThis as any;
export const redis: Redis | null = globalAny.__upstash_redis ?? (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.warn('[eventbus] UPSTASH_REDIS_REST_URL/TOKEN not set — running in degraded mode (no persistence)');
    return null;
  }
  const client = new Redis({ url, token });
  globalAny.__upstash_redis = client;
  return client;
})();

const NARRATIVES_KEY = 'terminal:narratives';
const ACTIVITIES_KEY = 'terminal:activities';
const NARRATIVES_TTL = 86400; // 24h
const ACTIVITIES_MAX = 100;

// ─── In-memory event bus for SSE fan-out ──────────────────────────────────
type Subscriber = (event: SSEEvent) => void;

class EventBus {
  private subscribers = new Set<Subscriber>();
  private history: SSEEvent[] = [];
  private readonly HISTORY_MAX = 100;

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  publish(event: SSEEvent): void {
    this.history.push(event);
    if (this.history.length > this.HISTORY_MAX) this.history.shift();
    for (const sub of this.subscribers) {
      try { sub(event); } catch { /* ignore */ }
    }
  }

  getHistory(since_ts: number): SSEEvent[] {
    return this.history.filter(e => (e as { ts: number }).ts > since_ts);
  }

  emitAgentActivity(activity: AgentActivity) {
    this.publish({ type: 'agent_activity', activity });
  }
  emitNarrativeUpdate(narrative: Narrative) {
    this.publish({ type: 'narrative_update', narrative });
  }
  emitMentionNew(mention: NormalizedMention, narrative_id: string) {
    this.publish({ type: 'mention_new', mention, narrative_id });
  }
  emitLoopIteration(loop_id: string, iteration: number, agent: string, status: string) {
    this.publish({ type: 'loop_iteration', loop_id, iteration, agent: agent as never, status: status as never });
  }
  emitConvergence(loop_id: string, narrative_id: string, iterations: number) {
    this.publish({ type: 'convergence', loop_id, narrative_id, iterations });
  }
  emitPhaseChange(narrative_id: string, old_phase: any, new_phase: any, confidence: number) {
    this.publish({ type: 'phase_change', narrative_id, old_phase, new_phase, confidence });
  }
}

export const bus: EventBus = globalAny.__terminal_bus ?? new EventBus();
if (!globalAny.__terminal_bus) globalAny.__terminal_bus = bus;

// ─── Narrative store (Redis-backed) ───────────────────────────────────────
class NarrativeStore {
  async upsert(narrative: Narrative): Promise<void> {
    // Phase change detection
    if (redis) {
      const existing = await this.get(narrative.id);
      if (existing && existing.status !== narrative.status) {
        bus.emitPhaseChange(narrative.id, existing.status, narrative.status, narrative.phase_confidence);
      }
      // Store as hash: id -> JSON
      await redis.hset(NARRATIVES_KEY, { [narrative.id]: JSON.stringify(narrative) });
      await redis.expire(NARRATIVES_KEY, NARRATIVES_TTL);
    } else {
      // Degraded mode: in-memory only
      if (!globalAny.__mem_narratives) globalAny.__mem_narratives = new Map();
      globalAny.__mem_narratives.set(narrative.id, narrative);
    }
    bus.emitNarrativeUpdate(narrative);
  }

  async get(id: string): Promise<Narrative | undefined> {
    if (redis) {
      const raw = await redis.hget<string>(NARRATIVES_KEY, id);
      if (!raw) return undefined;
      try { return JSON.parse(raw) as Narrative; } catch { return undefined; }
    }
    return globalAny.__mem_narratives?.get(id);
  }

  async list(filter?: { status?: string; min_score?: number; limit?: number }): Promise<Narrative[]> {
    let items: Narrative[] = [];
    if (redis) {
      const all = await redis.hgetall<Record<string, string>>(NARRATIVES_KEY);
      if (all) {
        for (const raw of Object.values(all)) {
          try { items.push(JSON.parse(raw) as Narrative); } catch {}
        }
      }
    } else {
      items = Array.from(globalAny.__mem_narratives?.values() ?? []);
    }
    if (filter?.status) items = items.filter(n => n.status === filter.status);
    if (filter?.min_score) items = items.filter(n => n.current_score >= filter.min_score!);
    items.sort((a, b) => b.current_score - a.current_score);
    if (filter?.limit) items = items.slice(0, filter.limit);
    return items;
  }

  async logActivity(activity: AgentActivity): Promise<void> {
    if (redis) {
      // Push to a list, cap length
      await redis.lpush(ACTIVITIES_KEY, JSON.stringify(activity));
      await redis.ltrim(ACTIVITIES_KEY, 0, ACTIVITIES_MAX - 1);
    } else {
      if (!globalAny.__mem_activities) globalAny.__mem_activities = [];
      globalAny.__mem_activities.unshift(activity);
      if (globalAny.__mem_activities.length > ACTIVITIES_MAX) globalAny.__mem_activities.pop();
    }
    bus.emitAgentActivity(activity);
    console.log(`[store] activity logged: ${activity.agent} ${activity.status} | ${activity.output_summary.slice(0, 80)}`);
  }

  async getActivities(limit = 50): Promise<AgentActivity[]> {
    if (redis) {
      const raw = await redis.lrange<string>(ACTIVITIES_KEY, 0, limit - 1);
      return raw.map(s => { try { return JSON.parse(s) as AgentActivity; } catch { return null; } }).filter(Boolean) as AgentActivity[];
    }
    return (globalAny.__mem_activities ?? []).slice(0, limit);
  }
}

export const store: NarrativeStore = globalAny.__terminal_store ?? new NarrativeStore();
if (!globalAny.__terminal_store) globalAny.__terminal_store = store;
