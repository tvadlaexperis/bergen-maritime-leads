import { NextRequest, NextResponse } from 'next/server';
import { runScan } from '@/lib/scan';

// Triggered by Vercel Cron (vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET`. When CRON_SECRET is unset (local dev)
// the endpoint is open so `npm run scan:local` works — docs/09-security.md §4.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  if (!secret && process.env.NODE_ENV === 'production') {
    return new NextResponse('CRON_SECRET not configured', { status: 500 });
  }

  const p = req.nextUrl.searchParams;
  const limitParam = Number(p.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;
  const full = p.get('full') === '1';
  // Discovery (13 kommune×NACE searches against Brreg) costs a fixed
  // 15-30s+ out of the 60s function budget on every run, crowding out the
  // enrichment batch — but Bergen's maritime company universe barely
  // changes day to day. Run it only once a week (Mondays UTC) by default,
  // so the other six nightly runs spend nearly the whole budget on
  // enrichment instead. `?discovery=0|1` always overrides this explicitly.
  const discoveryParam = p.get('discovery');
  const skipDiscovery = discoveryParam != null ? discoveryParam === '0' : new Date().getUTCDay() !== 1;

  const started = Date.now();
  const result = await runScan({ limit, full, skipDiscovery, trigger: 'cron' });
  return NextResponse.json({ scanId: result.scanId, ...result.details, errors: result.errors, tookMs: Date.now() - started });
}
