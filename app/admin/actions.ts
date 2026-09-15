'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireAdmin, createMagicLinkToken, type SessionPayload } from '@/lib/auth';
import { isRateLimited } from '@/lib/rateLimit';
import { audit } from '@/lib/audit';
import { parseOrgnr } from '@/lib/validation';
import { cleanWebsite } from '@/lib/brreg';
import {
  getCompany,
  getUserByEmail,
  setCompanyStatus,
  setCompanyNotes,
  setCompanyWebsite,
  setCompanyContacts,
  deleteCompany,
  type CompanyStatus,
} from '@/lib/db';
import { runScan, refreshCompany, addCompanyByOrgnr } from '@/lib/scan';

export type ActionState = { error?: string; ok?: string };

async function guard(bucket: string): Promise<SessionPayload> {
  const user = await requireAdmin();
  const ip = headers().get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  if (await isRateLimited(`${bucket}:${ip}`, 30, 5 * 60 * 1000)) {
    throw new Error('For mange forespørsler — vent litt.');
  }
  return user;
}

export async function addCompanyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await guard('admin-add');
  const parsed = parseOrgnr(String(formData.get('orgnr') ?? ''));
  if (!parsed.ok) return { error: parsed.error };

  const res = await addCompanyByOrgnr(parsed.orgnr);
  if (!res.ok) return { error: res.error };

  await audit('company.create', { actor: user.email, target: `company:${parsed.orgnr}`, detail: res.company.name });
  revalidatePath('/');
  redirect(`/company/${parsed.orgnr}`);
}

export async function updateNotesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await guard('admin-notes');
  const id = Number(formData.get('id'));
  if (!id || !(await getCompany(id))) return { error: 'Ukjent selskap.' };
  const notes = String(formData.get('notes') ?? '').slice(0, 4000);
  await setCompanyNotes(id, notes || null);
  await audit('company.notes', { actor: user.email, target: `company:${id}` });
  revalidatePath('/company');
  return { ok: 'Notater lagret.' };
}

// Manual override for when Brønnøysund has no `hjemmeside` registered —
// overwritten again automatically only if the register later reports one
// (upsertCompany's COALESCE), so this sticks across nightly refreshes.
export async function updateWebsiteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await guard('admin-website');
  const id = Number(formData.get('id'));
  if (!id || !(await getCompany(id))) return { error: 'Ukjent selskap.' };
  const raw = String(formData.get('website') ?? '').trim();
  if (raw && !cleanWebsite(raw)) return { error: 'Ser ikke ut som en gyldig nettadresse.' };
  await setCompanyWebsite(id, cleanWebsite(raw));
  await audit('company.website', { actor: user.email, target: `company:${id}` });
  revalidatePath('/company');
  return { ok: 'Nettsted lagret.' };
}

const CONTACT_FIELDS = [
  'contact_name', 'contact_email', 'contact_phone',
  'cto_name', 'cto_email', 'cto_phone',
  'sales_name', 'sales_email', 'sales_phone',
] as const;

export async function updateContactsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await guard('admin-contacts');
  const id = Number(formData.get('id'));
  if (!id || !(await getCompany(id))) return { error: 'Ukjent selskap.' };

  const value = (key: string) => {
    const v = String(formData.get(key) ?? '').trim().slice(0, 200);
    return v || null;
  };
  const input = Object.fromEntries(CONTACT_FIELDS.map((f) => [f, value(f)])) as Record<
    (typeof CONTACT_FIELDS)[number],
    string | null
  >;

  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const f of ['contact_email', 'cto_email', 'sales_email'] as const) {
    if (input[f] && !email.test(input[f]!)) return { error: `Ugyldig e-post: ${input[f]}` };
  }

  await setCompanyContacts(id, input);
  await audit('company.contacts', { actor: user.email, target: `company:${id}` });
  revalidatePath('/company');
  return { ok: 'Kontaktinfo lagret.' };
}

export async function setStatusAction(id: number, status: CompanyStatus): Promise<void> {
  const user = await guard('admin-status');
  const co = await getCompany(id);
  if (!co) return;
  await setCompanyStatus(id, status);
  await audit('company.status', { actor: user.email, target: `company:${id}`, detail: status });
  revalidatePath('/');
  revalidatePath(`/company/${co.orgnr}`);
}

export async function deleteCompanyAction(id: number): Promise<void> {
  const user = await guard('admin-delete');
  const co = await getCompany(id);
  if (!co) return;
  await deleteCompany(id);
  await audit('company.delete', { actor: user.email, target: `company:${id}`, detail: co.name });
  revalidatePath('/');
  redirect('/');
}

export async function refreshCompanyAction(orgnr: string): Promise<{ ok: boolean; errors: number }> {
  const user = await guard('admin-refresh');
  const r = await refreshCompany(orgnr);
  await audit('company.refresh', { actor: user.email, target: `company:${orgnr}`, detail: `${r.errors.length} feil` });
  revalidatePath('/');
  revalidatePath(`/company/${orgnr}`);
  return { ok: r.ok, errors: r.errors.length };
}

// Manual "run scan". `full` re-fetches accounts for every company (slower);
// otherwise it runs the same rotating batch as the nightly cron.
export async function runScanAction(full: boolean): Promise<{ found: number; updated: number; fin: number; errors: number }> {
  const user = await guard('admin-scan');
  const r = await runScan({ full });
  await audit('scan.run', {
    actor: user.email,
    detail: `${full ? 'full' : 'batch'}: ${r.companiesFound} funnet, ${r.companiesUpdated} oppdatert, ${r.financialsFetched} regnskap, ${r.errors.length} feil`,
  });
  revalidatePath('/');
  revalidatePath('/admin');
  revalidatePath('/dashboard');
  return { found: r.companiesFound, updated: r.companiesUpdated, fin: r.financialsFetched, errors: r.errors.length };
}

export async function generateGuestLinkAction(
  days: number,
): Promise<{ url?: string; expiresDays?: number; error?: string }> {
  const admin = await guard('admin-guestlink');
  const email = process.env.GUEST_EMAIL?.trim().toLowerCase();
  if (!email) return { error: 'Ingen gjestekonto konfigurert (GUEST_EMAIL).' };
  const guest = await getUserByEmail(email);
  if (!guest) return { error: 'Gjestekonto ikke funnet — kjør seed / redeploy.' };
  if (guest.role === 'admin') return { error: 'Gjestekontoen kan ikke være admin.' };

  const d = [7, 30, 90].includes(days) ? days : 30;
  const token = await createMagicLinkToken(String(guest.id), guest.email, d);

  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const url = `${proto}://${host}/api/auth/link?t=${token}`;

  await audit('guestlink.generate', { actor: admin.email, detail: `${d} dager` });
  return { url, expiresDays: d };
}
