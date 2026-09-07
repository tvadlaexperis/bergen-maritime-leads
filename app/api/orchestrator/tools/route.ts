import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { orchestrator } from '@/lib/orchestrator/boot';

// Debug: which providers registered (reveals which API keys are configured, so
// admin-only — docs/09-security.md §4).
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return new NextResponse('Not found', { status: 404 });
  }
  return NextResponse.json({ tools: orchestrator.listTools() });
}
