'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireAdmin, createMagicLinkToken, type SessionPayload } from '@/lib/auth';
import { isRateLimited } from '@/lib/rateLimit';
import { audit } from '@/lib/audit';
import { cleanWebsite } from '@/lib/brreg';
import {
  getCompany,
  getUserByEmail,
  setCompanyStatus,
  setCompanyNotes,
  setCompanyWebsite,
  setCompanyContactPage,
  setCompanyMeeting,
  setCompanyContacts,
  deleteCompany,
  countAiPending,
  AI_TOP_N,
  parseTopN,
  countBrregStale,
  getAiProgressSince,
  type AiProgress,
  type CompanyStatus,
} from '@/lib/db';
import { runScan, refreshCompany } from '@/lib/scan';
import { aiConfigured } from '@/lib/orchestrator/providers/ai';

export type ActionState = { error?: string; ok?: string };

async function guard(bucket: string): Promise<SessionPayload> {
  const user = await requireAdmin();
  const ip = headers().get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  if (await isRateLimited(`${bucket}:${ip}`, 30, 5 * 60 * 1000)) {
    throw new Error('For mange forespørsler — vent litt.');
  }
  return user;
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

// «Bedriftsmøte»: date + notes before and after the meeting.
export async function updateMeetingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await guard('admin-meeting');
  const id = Number(formData.get('id'));
  if (!id || !(await getCompany(id))) return { error: 'Ukjent selskap.' };
  const text = (k: string) => String(formData.get(k) ?? '').trim().slice(0, 8000) || null;
  const date = String(formData.get('date') ?? '').trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Ugyldig dato.' };
  await setCompanyMeeting(id, { date: date || null, prep: text('prep'), notes: text('notes') });
  await audit('company.meeting', { actor: user.email, target: `company:${id}` });
  revalidatePath('/company');
  return { ok: 'Møtenotater lagret.' };
}

// The page on the company's own site that lists its people. Read first on
// the next AI run (the company is queued for it). The fetch itself goes
// through safeFetch's SSRF guard, so only the URL shape is checked here.
export async function updateContactPageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await guard('admin-contactpage');
  const id = Number(formData.get('id'));
  if (!id || !(await getCompany(id))) return { error: 'Ukjent selskap.' };
  let raw = String(formData.get('contactPage') ?? '').trim();
  if (raw && !/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  if (raw) {
    try {
      const u = new URL(raw);
      if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.') || raw.length > 500) throw new Error();
    } catch {
      return { error: 'Ser ikke ut som en gyldig nettadresse.' };
    }
  }
  await setCompanyContactPage(id, raw || null);
  await audit('company.contactpage', { actor: user.email, target: `company:${id}` });
  revalidatePath('/company');
  return { ok: raw ? 'Kontaktside lagret — leses ved neste AI-kjøring.' : 'Kontaktside fjernet.' };
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

// One Brreg-only run for «Oppdater fra Brreg» (never Gemini — that's the
// AI button). The button calls it back to back; only the first call walks
// the register for new companies (`discover`), the rest refresh stale ones.
export async function runScanAction(
  discover: boolean,
): Promise<{ summary: string; processed: number; added: number; newFinancials: number; staleRemaining: number }> {
  const user = await guard('admin-scan');
  // Brreg only: Gemini costs money, and the AI queue has its own button
  // («Oppdater alt» phase 2) and the nightly cron.
  const r = await runScan({ noAi: true, skipDiscovery: !discover, trigger: 'manuell' });
  const d = r.details;
  const parts = [
    d.discovery.ran ? `${d.discovery.added} nye selskaper` : null,
    `${d.brreg.processed} sjekket i Brreg`,
    d.brreg.newFinancials ? `${d.brreg.newFinancials} nye regnskap` : null,
    d.brreg.emailFound ? `${d.brreg.emailFound} e-poster` : null,
    d.brreg.websiteFromEmail ? `${d.brreg.websiteFromEmail} nettsider fra e-postdomene` : null,
    d.ai.enabled ? `${d.ai.analyses} AI-vurderinger` : null,
    d.ai.contactCompanies ? `kontakter hos ${d.ai.contactCompanies}` : null,
    r.errors.length ? `${r.errors.length} feil` : null,
  ].filter(Boolean);
  const summary = parts.join(', ') + '.';
  await audit('scan.run', { actor: user.email, detail: `brreg: ${summary}` });
  revalidatePath('/');
  revalidatePath('/admin');
  revalidatePath('/dashboard');
  return { summary, processed: d.brreg.processed, added: d.discovery.added, newFinancials: d.brreg.newFinancials, staleRemaining: await countBrregStale() };
}

// Live counts for the running «AI-vurdering» (polled every few seconds).
// Read-only, so admin check only — no rate-limit bucket.
export async function aiProgressAction(since: number): Promise<AiProgress> {
  await requireAdmin();
  return getAiProgressSince(Number(since) || Date.now());
}

// One AI-only run (no Brreg pass, whole budget to the AI queue). The
// «Kjør AI-køen» button calls this back to back until `remaining` hits 0 —
// each call is its own ≤60s request, so no single request outlives Vercel's
// function limit however long the queue is.
export async function runAiQueueAction(topN: number | null = AI_TOP_N): Promise<
  | { error: string }
  | {
      processed: number;
      analyses: number;
      contacts: number;
      websites: number;
      scraped: number;
      newsSearched: number;
      newsFound: number;
      errors: number;
      rateLimited: boolean;
      /** Paid credits used up (402) or the free key's daily quota gone — waiting minutes won't help. */
      quotaGone: boolean;
      firstError: string | null;
      remaining: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }
> {
  const user = await guard('admin-ai-queue');
  if (!aiConfigured()) return { error: 'AI er ikke konfigurert (ANTHROPIC_API_KEY eller GEMINI_API_KEY mangler).' };
  const n = parseTopN(topN == null ? 'alle' : String(topN));
  const r = await runScan({ aiOnly: true, skipDiscovery: true, trigger: 'ai', aiTopN: n });
  const d = r.details.ai;
  await audit('scan.ai', {
    actor: user.email,
    detail: `${d.processed} forsøkt, ${d.analyses} vurderinger, ${d.websitesFound} nettsider, kontakter hos ${d.contactCompanies}, ${d.newsFound ?? 0} nyheter, ${r.errors.length} feil`,
  });
  revalidatePath('/');
  revalidatePath('/admin');
  return {
    processed: d.processed,
    analyses: d.analyses,
    contacts: d.contactCompanies,
    websites: d.websitesFound,
    scraped: d.sitesScraped ?? 0,
    newsSearched: d.newsSearched ?? 0,
    newsFound: d.newsFound ?? 0,
    errors: r.errors.length,
    quotaGone: r.errors.some((e) => /HTTP 402|credits are depleted|credit balance is too low|per day|free tier/i.test(e.message)),
    rateLimited: r.errors.some((e) => /HTTP 4(29|02)|RESOURCE_EXHAUSTED|quota|credits/i.test(e.message)),
    firstError: r.errors[0] ? `${r.errors[0].scope}: ${r.errors[0].message}` : null,
    remaining: await countAiPending(n),
    inputTokens: d.usage?.inputTokens ?? 0,
    outputTokens: d.usage?.outputTokens ?? 0,
    costUsd: d.usage?.costUsd ?? 0,
  };
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
