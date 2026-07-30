// REST: list recent agent activity logs.

import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/eventbus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 50);
  const activities = await store.getActivities(limit);
  return NextResponse.json({ activities, count: activities.length, ts: Date.now() });
}
