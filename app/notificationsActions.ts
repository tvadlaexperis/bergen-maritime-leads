'use server';

import { requireUser } from '@/lib/auth';
import { markAllNotificationsRead } from '@/lib/db';

// Any logged-in user (not admin-only) — notifications surface sales-relevant
// changes (new contacts, buying signals, leadership changes), not just
// backend/admin housekeeping.
export async function markNotificationsReadAction(): Promise<void> {
  await requireUser();
  await markAllNotificationsRead();
}
