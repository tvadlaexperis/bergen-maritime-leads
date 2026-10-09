'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { isRateLimited } from '@/lib/rateLimit';
import { audit } from '@/lib/audit';
import {
  getCompany,
  addContactLog,
  getContactLogEntry,
  deleteContactLog,
  updateContactLog,
  homeCompanyId,
  CONTACT_CHANNELS,
  CONTACT_OUTCOMES,
} from '@/lib/db';

// «Kundekontakt»: any logged-in user except the shared guest login logs a
// call / e-mail / meeting. Admins can delete any entry, others their own.
export type ContactLogState = { ok?: string; error?: string };

async function seller() {
  const user = await requireUser();
  const guest = (process.env.GUEST_EMAIL ?? '').trim().toLowerCase();
  if (guest && user.email.toLowerCase() === guest) throw new Error('Gjestekontoen kan ikke logge kundekontakt.');
  return user;
}

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function addContactLogAction(_prev: ContactLogState, form: FormData): Promise<ContactLogState> {
  const user = await seller();
  if (await isRateLimited(`contact-log:${user.sub}`, 120, 60 * 60 * 1000)) return { error: 'For mange registreringer — vent litt.' };
  const given = Number(form.get('id'));
  if (!given || !(await getCompany(given))) return { error: 'Ukjent selskap.' };
  const companyId = await homeCompanyId(given); // the konsern's main company

  const text = (k: string, max: number) => String(form.get(k) ?? '').trim().slice(0, max) || null;
  const contactedOn = text('contacted_on', 10) ?? '';
  if (!isDate(contactedOn)) return { error: 'Velg en dato.' };
  const channel = String(form.get('channel') ?? '');
  if (!(CONTACT_CHANNELS as readonly string[]).includes(channel)) return { error: 'Ugyldig kanal.' };
  const outcome = String(form.get('outcome') ?? '');
  if (!(CONTACT_OUTCOMES as readonly string[]).includes(outcome)) return { error: 'Velg resultat.' };
  const followUp = text('follow_up_on', 10);
  if (followUp && !isDate(followUp)) return { error: 'Ugyldig oppfølgingsdato.' };
  const phone = text('phone', 40);
  if (phone && !/^[+\d][\d\s()-]{4,}$/.test(phone)) return { error: 'Telefonnummeret ser ikke riktig ut.' };

  const fields = {
    contactedOn,
    channel,
    person: text('person', 120),
    phone,
    outcome,
    note: text('note', 2000),
    followUpOn: followUp,
  };

  // Editing an existing entry: your own, or any as admin — same rule as delete.
  const entryId = Number(form.get('entry_id'));
  if (entryId) {
    const entry = await getContactLogEntry(entryId);
    if (!entry || entry.company_id !== companyId) return { error: 'Fant ikke registreringen.' };
    if (user.role !== 'admin' && entry.user_id !== Number(user.sub)) return { error: 'Du kan bare endre dine egne.' };
    await updateContactLog(entryId, fields);
    await audit('company.contact_log.edit', { actor: user.email, target: `company:${companyId}` });
    revalidatePath('/company');
    return { ok: 'Endringen er lagret.' };
  }

  await addContactLog({ companyId, userId: Number(user.sub), ...fields });
  await audit('company.contact_log', { actor: user.email, target: `company:${companyId}` });
  revalidatePath('/company');
  return { ok: 'Kontakt registrert.' };
}

export async function deleteContactLogAction(id: number): Promise<ContactLogState> {
  const user = await seller();
  const entry = await getContactLogEntry(Number(id));
  if (!entry) return { error: 'Fant ikke registreringen.' };
  if (user.role !== 'admin' && entry.user_id !== Number(user.sub)) return { error: 'Du kan bare slette dine egne.' };
  await deleteContactLog(entry.id);
  revalidatePath('/company');
  return { ok: 'Slettet.' };
}
