// ─────────────────────────────────────────────────────────────────────────
// EventBus — in-memory pub/sub for agent activity + narrative updates
// Used by SSE gateway to push events to clients in real-time.
//
// For MVP: in-memory (works on single Vercel instance).
// For production: replace with Upstash Redis Streams.
// ─────────────────────────────────────────────────────────────────────────

import type { SSEEvent, Narrative, AgentActivity, NormalizedMention } from './types';

type Subscriber = (event: SSEEvent) => void;

class EventBus {
  private subscribers = new Set<Subscriber>();
  // Recent event buffer for client reconnect/resume (last 100)
  private history: SSEEvent[] = [];
  private readonly HISTORY_MAX = 100;

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  publish(event: SSEEvent): void {
    // Buffer
    this.history.push(event);
    if (this.history.length > this.HISTORY_MAX) {
      this.history.shift();
    }
    // Fan-out
    for (const sub of this.subscribers) {
      try { sub(event); } catch { /* ignore */ }
    }
  }

  /** Get recent events for backfill on new connection */
  getHistory(since_ts: number): SSEEvent[] {
    return this.history.filter(e => (e as { ts: number }).ts > since_ts);
  }

  // Convenience emitters
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
    this.publish({
      type: 'loop_iteration',
      loop_id, iteration,
      agent: agent as never,
      status: status as never,
    });
  }
  emitConvergence(loop_id: string, narrative_id: string, iterations: number) {
    this.publish({ type: 'convergence', loop_id, narrative_id, iterations });
  }
  emitPhaseChange(narrative_id: string, old_phase: any, new_phase: any, confidence: number) {
    this.publish({ type: 'phase_change', narrative_id, old_phase, new_phase, confidence });
  }
}

// Singleton — use global to survive HMR in dev
const globalAny = globalThis as any;
export const bus: EventBus = globalAny.__terminal_bus ?? new EventBus();
if (!globalAny.__terminal_bus) globalAny.__terminal_bus = bus;

// ─── Narrative store (in-memory for MVP) ──────────────────────────────────
class NarrativeStore {
  private narratives = new Map<string, Narrative>();
  private activities: AgentActivity[] = [];

  upsert(narrative: Narrative): void {
    const existing = this.narratives.get(narrative.id);
    if (existing && existing.status !== narrative.status) {
      bus.emitPhaseChange(narrative.id, existing.status, narrative.status, narrative.phase_confidence);
    }
    this.narratives.set(narrative.id, narrative);
    bus.emitNarrativeUpdate(narrative);
  }

  get(id: string): Narrative | undefined {
    return this.narratives.get(id);
  }

  list(filter?: { status?: string; min_score?: number; limit?: number }): Narrative[] {
    let items = Array.from(this.narratives.values());
    if (filter?.status) items = items.filter(n => n.status === filter.status);
    if (filter?.min_score) items = items.filter(n => n.current_score >= filter.min_score!);
    items.sort((a, b) => b.current_score - a.current_score);
    if (filter?.limit) items = items.slice(0, filter.limit);
    return items;
  }

  logActivity(activity: AgentActivity): void {
    this.activities.unshift(activity);
    if (this.activities.length > 200) this.activities.pop();
    bus.emitAgentActivity(activity);
    console.log(`[store] activity logged: ${activity.agent} ${activity.status} | ${activity.output_summary.slice(0, 80)}`);
  }

  getActivities(limit = 50): AgentActivity[] {
    return this.activities.slice(0, limit);
  }
}

export const store: NarrativeStore = globalAny.__terminal_store ?? new NarrativeStore();
if (!globalAny.__terminal_store) globalAny.__terminal_store = store;
