import { headers } from 'next/headers';
import { insertAudit } from './db';

// Records a security-relevant event. Safe to call from Server Actions and Route
// Handlers; never throws. `actor` is the acting user's email (or null for a
// failed/anonymous attempt).
export async function audit(
  action: string,
  opts: { actor?: string | null; target?: string | null; detail?: string | null; ip?: string | null } = {},
): Promise<void> {
  let ip = opts.ip ?? null;
  if (ip == null) {
    try {
      ip = headers().get('x-forwarded-for')?.split(',')[0].trim() || null;
    } catch {
      ip = null;
    }
  }
  await insertAudit({ action, actor: opts.actor ?? null, target: opts.target ?? null, detail: opts.detail ?? null, ip });
}
