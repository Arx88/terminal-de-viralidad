// ─────────────────────────────────────────────────────────────────────────
// Source Adapters — GDELT real + mocks for Twitter/Reddit/HN/Trends
// Each adapter implements SourceAdapter interface from types.ts
// ─────────────────────────────────────────────────────────────────────────

import type { NormalizedMention, SourceAdapter, SourceType } from './types';

// ─── GDELT 2.0 DOC API (real, no auth) ────────────────────────────────────
// Rate limit: 1 req / 5s per IP (verified)
// Docs: https://api.gdeltproject.org/api/v2/doc/doc
let gdelt_last_call = 0;
const GDELT_MIN_INTERVAL = 5500; // ms — slightly above 5s to be safe

class GdeltAdapter implements SourceAdapter {
  name: SourceType = 'gdelt';
  private last_call = 0;

  async fetch(query: string, opts?: { maxResults?: number }): Promise<NormalizedMention[]> {
    // Rate limit
    const now = Date.now();
    const elapsed = now - this.last_call;
    if (elapsed < GDELT_MIN_INTERVAL) {
      await new Promise(r => setTimeout(r, GDELT_MIN_INTERVAL - elapsed));
    }
    this.last_call = Date.now();

    const maxRecords = Math.min(opts?.maxResults ?? 30, 250);
    const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
    url.searchParams.set('query', query);
    url.searchParams.set('mode', 'artlist');
    url.searchParams.set('format', 'json');
    url.searchParams.set('maxrecords', String(maxRecords));
    url.searchParams.set('sort', 'datedesc');

    try {
      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': 'TerminalDeViralidad/0.1 (research)' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        throw new Error(`GDELT ${res.status}`);
      }
      const data = await res.json() as { articles?: any[] };
      return (data.articles ?? []).map((a): NormalizedMention => ({
        id: crypto.randomUUID(),
        source: 'gdelt',
        source_id: a.url,
        url: a.url,
        fetched_at: Date.now(),
        published_at: parseGdeltDate(a.seendate),
        type: 'article',
        title: a.title,
        body: a.title, // GDELT DOC only gives title
        lang: a.language ?? null,
        author: { handle: null, name: a.domain },
        engagement: {},
        entities: {
          hashtags: [],
          urls: [a.url],
          domains: [a.domain],
        },
      }));
    } catch (err) {
      console.error('[GDELT] fetch failed:', err);
      return [];
    }
  }
}

function parseGdeltDate(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]);
}

// ─── Mock adapters for demo (Twitter, Reddit, HN, Trends) ─────────────────
// These produce realistic-looking mentions to demo the agent loop without
// risking Twitter ban or needing OAuth setup.

const SAMPLE_TOPICS = [
  'AI agents', 'crypto regulation', 'climate summit', 'tech layoffs',
  'election polls', 'startup funding', 'privacy law', 'quantum computing',
  'social media ban', 'EV market', 'semiconductor shortage', 'central bank rate',
];

const SAMPLE_AUTHORS = [
  '@techwatcher', '@cryptonews', '@climatealert', '@valleyvoice',
  '@policywonk', '@vc_insider', '@privacyorg', '@quantumdaily',
  '@digitalrights', '@evworld', '@chipwatch', '@fedwatcher',
  'r/technology', 'r/worldnews', 'r/cryptocurrency', 'r/politics',
];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}
function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

class MockTwitterAdapter implements SourceAdapter {
  name: SourceType = 'twitter';

  async fetch(query: string, opts?: { maxResults?: number }): Promise<NormalizedMention[]> {
    await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
    const n = Math.min(opts?.maxResults ?? randInt(3, 12), 20);
    const mentions: NormalizedMention[] = [];
    for (let i = 0; i < n; i++) {
      const topic = query.includes(' ') ? query : pick(SAMPLE_TOPICS);
      const author = pick(SAMPLE_AUTHORS.slice(0, 12));
      const body = generateTweetBody(topic, author);
      mentions.push({
        id: crypto.randomUUID(),
        source: 'twitter',
        source_id: `${randInt(1700000000000000, 1899999999999999)}`,
        url: `https://x.com/${author.replace('@', '')}/status/${randInt(1700000000000000, 1899999999999999)}`,
        fetched_at: Date.now(),
        published_at: Date.now() - randInt(1000, 3600_000),
        type: 'post',
        title: null,
        body,
        lang: 'es',
        author: {
          handle: author,
          name: author.replace('@', '').replace('_', ' '),
          followers: randInt(500, 500_000),
        },
        engagement: {
          likes: randInt(0, 5000),
          retweets: randInt(0, 1500),
          replies: randInt(0, 400),
        },
        entities: {
          hashtags: extractHashtags(body),
          urls: [],
          domains: [],
        },
      });
    }
    return mentions;
  }
}

class MockRedditAdapter implements SourceAdapter {
  name: SourceType = 'reddit';

  async fetch(query: string, opts?: { maxResults?: number }): Promise<NormalizedMention[]> {
    await new Promise(r => setTimeout(r, 150 + Math.random() * 250));
    const n = Math.min(opts?.maxResults ?? randInt(2, 8), 15);
    const mentions: NormalizedMention[] = [];
    const subs = ['technology', 'worldnews', 'cryptocurrency', 'politics', 'science'];
    for (let i = 0; i < n; i++) {
      const sub = pick(subs);
      const topic = query || pick(SAMPLE_TOPICS);
      const body = `Discussion: ${topic} — what are the implications?`;
      mentions.push({
        id: crypto.randomUUID(),
        source: 'reddit',
        source_id: `t3_${Math.random().toString(36).slice(2, 10)}`,
        url: `https://reddit.com/r/${sub}/comments/${Math.random().toString(36).slice(2, 8)}`,
        fetched_at: Date.now(),
        published_at: Date.now() - randInt(60_000, 7200_000),
        type: 'post',
        title: `${topic[0].toUpperCase()}${topic.slice(1)} — r/${sub} thread`,
        body,
        lang: 'en',
        author: { handle: pick(['u/news_junkie', 'u/spez_watch', 'u/techthrowaway', 'u/longtime_lurker']), name: null },
        engagement: {
          score: randInt(5, 4500),
          comments: randInt(2, 800),
        },
        entities: { hashtags: [], urls: [], domains: [] },
      });
    }
    return mentions;
  }
}

class MockHNAdapter implements SourceAdapter {
  name: SourceType = 'hackernews';

  async fetch(query: string, opts?: { maxResults?: number }): Promise<NormalizedMention[]> {
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
    const n = Math.min(opts?.maxResults ?? randInt(1, 5), 10);
    const mentions: NormalizedMention[] = [];
    for (let i = 0; i < n; i++) {
      const topic = query || pick(SAMPLE_TOPICS);
      mentions.push({
        id: crypto.randomUUID(),
        source: 'hackernews',
        source_id: String(randInt(40000000, 42000000)),
        url: `https://news.ycombinator.com/item?id=${randInt(40000000, 42000000)}`,
        fetched_at: Date.now(),
        published_at: Date.now() - randInt(120_000, 14400_000),
        type: 'story',
        title: `Show HN: ${topic} analysis tool`,
        body: `We built a tool to track ${topic}. Here's what we learned.`,
        lang: 'en',
        author: { handle: pick(['pg', 'dang', 'tptacek', 'tlb', 'patio11']), name: null },
        engagement: { score: randInt(10, 800), comments: randInt(5, 300) },
        entities: { hashtags: [], urls: [], domains: [] },
      });
    }
    return mentions;
  }
}

function generateTweetBody(topic: string, author: string): string {
  const templates = [
    `Breaking: ${topic} is exploding right now. Thread 🧵`,
    `Just saw the ${topic} news. This changes everything.`,
    `${topic[0].toUpperCase()}${topic.slice(1)} discussion — what's your take?`,
    `Hot take on ${topic}: nobody is talking about the real issue here.`,
    `The ${topic} story is developing fast. Stay tuned.`,
    `${topic} — key players are about to make a move. Watch this space.`,
    `Just confirmed: ${topic} is bigger than reported.`,
    `My analysis on ${topic}: ${randInt(3, 7)} reasons why this matters.`,
  ];
  let body = pick(templates);
  // Add hashtags 50% of time
  if (Math.random() < 0.5) {
    const tags = pickN(['#breaking', '#analysis', '#thread', '#developing', '#exclusive', '#hot'], randInt(1, 3));
    body += ` ${tags.join(' ')}`;
  }
  return body;
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#\w+/g);
  return matches ?? [];
}

// ─── Adapter registry ──────────────────────────────────────────────────────
export const adapters: Record<SourceType, SourceAdapter> = {
  gdelt: new GdeltAdapter(),
  twitter: new MockTwitterAdapter(),
  reddit: new MockRedditAdapter(),
  hackernews: new MockHNAdapter(),
  googletrends: {
    name: 'googletrends',
    async fetch(query: string) {
      await new Promise(r => setTimeout(r, 100));
      return [{
        id: crypto.randomUUID(),
        source: 'googletrends',
        source_id: `${query}-daily`,
        url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(query)}`,
        fetched_at: Date.now(),
        published_at: Date.now(),
        type: 'trend_signal',
        title: `${query} — Google Trends`,
        body: `Search interest for "${query}" rose ${randInt(20, 200)}% in last 24h`,
        lang: 'en',
        author: { handle: null, name: 'Google Trends' },
        engagement: {},
        entities: { hashtags: [], urls: [], domains: ['trends.google.com'] },
      }];
    },
  },
  mock: new MockTwitterAdapter(),
};

export const REAL_SOURCES: SourceType[] = ['gdelt'];
export const ALL_SOURCES: SourceType[] = ['twitter', 'gdelt', 'reddit', 'hackernews'];
