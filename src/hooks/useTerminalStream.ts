'use client';

import { useEffect, useRef, useState, useTransition, useCallback } from 'react';
import type { SSEEvent, Narrative, AgentActivity, NormalizedMention } from '@/lib/types';

interface StreamState {
  events: SSEEvent[];
  status: 'live' | 'syncing' | 'reconnecting' | 'offline';
  narratives: Map<string, Narrative>;
  activities: AgentActivity[];
  mentions: { mention: NormalizedMention; narrative_id: string; ts: number }[];
  loops: Map<string, { iteration: number; agent: string; status: string }>;
  convergences: { loop_id: string; narrative_id: string; iterations: number; ts: number }[];
}

const MAX_MENTIONS = 30;
const MAX_ACTIVITIES = 30;
const MAX_CONVERGENCES = 10;

export function useTerminalStream() {
  const [state, setState] = useState<StreamState>({
    events: [],
    status: 'syncing',
    narratives: new Map(),
    activities: [],
    mentions: [],
    loops: new Map(),
    convergences: [],
  });
  const [, startTransition] = useTransition();
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const bufRef = useRef<SSEEvent[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastFlushRef = useRef(0);

  const flushRef = useRef<() => void>(() => {});

  const flush = useCallback(() => {
    rafRef.current = null;
    const now = performance.now();
    if (now - lastFlushRef.current < 100) {
      rafRef.current = requestAnimationFrame(() => flushRef.current());
      return;
    }
    lastFlushRef.current = now;

    const batch = bufRef.current;
    bufRef.current = [];
    if (batch.length === 0) return;

    startTransition(() => {
      setState(prev => {
        const narratives = new Map(prev.narratives);
        const activities = [...prev.activities];
        const mentions = [...prev.mentions];
        const loops = new Map(prev.loops);
        const convergences = [...prev.convergences];

        for (const evt of batch) {
          if (evt.type === 'narrative_update') {
            narratives.set(evt.narrative.id, evt.narrative);
          } else if (evt.type === 'agent_activity') {
            activities.unshift(evt.activity);
            if (activities.length > MAX_ACTIVITIES) activities.length = MAX_ACTIVITIES;
          } else if (evt.type === 'mention_new') {
            mentions.unshift({ mention: evt.mention, narrative_id: evt.narrative_id, ts: Date.now() });
            if (mentions.length > MAX_MENTIONS) mentions.length = MAX_MENTIONS;
          } else if (evt.type === 'loop_iteration') {
            loops.set(`${evt.loop_id}:${evt.agent}`, { iteration: evt.iteration, agent: evt.agent, status: evt.status });
          } else if (evt.type === 'convergence') {
            convergences.unshift({ ...evt, ts: Date.now() });
            if (convergences.length > MAX_CONVERGENCES) convergences.length = MAX_CONVERGENCES;
          }
        }

        return { ...prev, narratives, activities, mentions, loops, convergences };
      });
    });
  }, [startTransition]);

  // Keep ref in sync so RAF callback always invokes latest
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close();
    setState(prev => ({ ...prev, status: 'reconnecting' }));

    const es = new EventSource('/api/stream');
    esRef.current = es;

    es.onopen = () => {
      retryRef.current = 0;
      setState(prev => ({ ...prev, status: 'live' }));
    };

    const handleEvent = (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data) as SSEEvent;
        bufRef.current.push(evt);
        if (!rafRef.current) rafRef.current = requestAnimationFrame(() => flushRef.current());
      } catch { /* */ }
    };

    es.onmessage = handleEvent;
    es.addEventListener('agent_activity', handleEvent as any);
    es.addEventListener('narrative_update', handleEvent as any);
    es.addEventListener('mention_new', handleEvent as any);
    es.addEventListener('loop_iteration', handleEvent as any);
    es.addEventListener('convergence', handleEvent as any);

    es.onerror = () => {
      setState(prev => ({ ...prev, status: 'offline' }));
      es.close();
      const delay = Math.min(1000 * 2 ** retryRef.current, 30_000);
      retryRef.current += 1;
      setTimeout(() => connectRef.current(), delay);
    };
  }, []);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    connect();
    // Initial snapshot via REST
    fetch('/api/narratives?limit=50')
      .then(r => r.json())
      .then(data => {
        if (data.narratives) {
          startTransition(() => {
            setState(prev => {
              const narratives = new Map(prev.narratives);
              for (const n of data.narratives) narratives.set(n.id, n);
              return { ...prev, narratives };
            });
          });
        }
      })
      .catch(() => { /* */ });

    fetch('/api/activities?limit=30')
      .then(r => r.json())
      .then(data => {
        if (data.activities) {
          startTransition(() => {
            setState(prev => ({ ...prev, activities: data.activities }));
          });
        }
      })
      .catch(() => { /* */ });

    // Trigger first agent step on mount — waits for full loop (30-60s)
    const runTrigger = async (query?: string) => {
      try {
        const res = await fetch('/api/trigger', {
          method: 'POST',
          body: JSON.stringify({ query: query || 'IA agentes autónomos' }),
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(90_000), // 90s timeout for full loop
        });
        const data = await res.json();
        if (data.narratives && Array.isArray(data.narratives)) {
          startTransition(() => {
            setState(prev => {
              const narratives = new Map(prev.narratives);
              for (const n of data.narratives) narratives.set(n.id, n);
              return { ...prev, narratives, status: 'live' };
            });
          });
        }
        if (data.activities && Array.isArray(data.activities)) {
          startTransition(() => {
            setState(prev => ({ ...prev, activities: data.activities }));
          });
        }
      } catch { /* */ }
    };

    runTrigger();

    // Poll /api/trigger every 30s (each call runs a full 6-agent loop)
    const triggerInterval = setInterval(() => {
      const queries = ['IA agentes autónomos', 'regulación cripto 2026', 'cumbre climática', 'despidos tech'];
      const q = queries[Math.floor(Math.random() * queries.length)];
      runTrigger(q);
    }, 30_000);

    const onVisibility = () => {
      if (document.hidden) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      } else {
        if (bufRef.current.length && !rafRef.current) {
          rafRef.current = requestAnimationFrame(() => flushRef.current());
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      esRef.current?.close();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearInterval(triggerInterval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return state;
}
