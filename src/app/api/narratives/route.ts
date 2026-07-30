// REST: list narratives (snapshot for initial UI load).
// Reads from Redis (shared across all Vercel instances).

import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/eventbus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') ?? undefined;
  const minScore = Number(req.nextUrl.searchParams.get('minScore') ?? 0);
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 50);

  const narratives = await store.list({
    status: status || undefined,
    min_score: minScore || undefined,
    limit,
  });

  return NextResponse.json({
    narratives,
    count: narratives.length,
    ts: Date.now(),
  });
}
