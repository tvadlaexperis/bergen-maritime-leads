'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { getUserById, setUserStatus, setUserRole, deleteUser } from '@/lib/db';

// Admin → Brukere: approve or reject sign-ups, change role, remove users.
type R = { ok?: true; error?: string };

async function target(id: number, adminSub: string) {
  const u = await getUserById(Number(id));
  if (!u) return { error: 'Fant ikke brukeren.' } as const;
  if (String(u.id) === adminSub) return { error: 'Du kan ikke endre din egen konto her.' } as const;
  return { u } as const;
}

export async function approveUserAction(id: number): Promise<R> {
  const admin = await requireAdmin();
  const t = await target(id, admin.sub);
  if ('error' in t) return { error: t.error };
  await setUserStatus(t.u.id, 'active');
  await audit('user.approve', { actor: admin.email, target: t.u.email });
  revalidatePath('/admin');
  return { ok: true };
}

export async function setUserRoleAction(id: number, role: 'viewer' | 'admin'): Promise<R> {
  const admin = await requireAdmin();
  if (role !== 'viewer' && role !== 'admin') return { error: 'Ugyldig rolle.' };
  const t = await target(id, admin.sub);
  if ('error' in t) return { error: t.error };
  const guest = (process.env.GUEST_EMAIL ?? '').trim().toLowerCase();
  if (guest && t.u.email.toLowerCase() === guest) return { error: 'Gjestekontoen kan ikke endre rolle.' };
  await setUserRole(t.u.id, role);
  await audit('user.role', { actor: admin.email, target: t.u.email, detail: role });
  revalidatePath('/admin');
  return { ok: true };
}

/** Rejects a pending sign-up, or removes an existing user. */
export async function deleteUserAction(id: number): Promise<R> {
  const admin = await requireAdmin();
  const t = await target(id, admin.sub);
  if ('error' in t) return { error: t.error };
  const guest = (process.env.GUEST_EMAIL ?? '').trim().toLowerCase();
  if (guest && t.u.email.toLowerCase() === guest) return { error: 'Gjestekontoen kan ikke slettes her.' };
  await deleteUser(t.u.id);
  await audit('user.delete', { actor: admin.email, target: t.u.email });
  revalidatePath('/admin');
  return { ok: true };
}
