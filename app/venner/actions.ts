'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, type SessionPayload } from '@/lib/auth';
import { isRateLimited } from '@/lib/rateLimit';
import {
  searchUsers,
  getUserById,
  getFriendshipBetween,
  getFriendshipById,
  sendFriendRequest,
  acceptFriendRequest,
  deleteFriendship,
  listFriends,
  areFriends,
  addUserNotification,
  getCompanyByOrgnr,
  markUserNotificationsRead,
  type UserSearchResult,
  type Friend,
} from '@/lib/db';

// Venner + deling, the minmatside flow as Server Actions: search → request →
// accept, then share a company with friends as an in-app notification.
// Any logged-in user except the shared guest login.

async function me(): Promise<{ user: SessionPayload; id: number }> {
  const user = await requireUser();
  const guest = (process.env.GUEST_EMAIL ?? '').trim().toLowerCase();
  if (guest && user.email.toLowerCase() === guest) throw new Error('Gjestekontoen kan ikke ha venner.');
  return { user, id: Number(user.sub) };
}

type Result = { ok?: true; error?: string };

export async function searchUsersAction(q: string): Promise<UserSearchResult[]> {
  const { id } = await me();
  const query = String(q ?? '').trim().slice(0, 80);
  if (query.length < 2) return [];
  return searchUsers(query, id);
}

export async function sendFriendRequestAction(targetId: number): Promise<Result & { friendshipId?: number }> {
  const { id } = await me();
  if (await isRateLimited(`friend-request:${id}`, 30, 60 * 60 * 1000)) return { error: 'For mange forespørsler — prøv igjen senere.' };
  const target = Number(targetId);
  if (!Number.isInteger(target) || target === id || !(await getUserById(target))) return { error: 'Ukjent bruker.' };
  const existing = await getFriendshipBetween(id, target);
  if (existing) return { error: existing.status === 'accepted' ? 'Dere er allerede venner.' : 'Det finnes allerede en forespørsel.' };
  const friendshipId = await sendFriendRequest(id, target);
  await addUserNotification({ userId: target, type: 'friend_request', actorId: id });
  revalidatePath('/venner');
  return { ok: true, friendshipId };
}

export async function respondFriendRequestAction(friendshipId: number, accept: boolean): Promise<Result> {
  const { id } = await me();
  const f = await getFriendshipById(Number(friendshipId));
  if (!f || f.addressee_id !== id) return { error: 'Fant ikke forespørselen.' };
  if (f.status !== 'pending') return { error: 'Forespørselen er allerede besvart.' };
  if (accept) {
    await acceptFriendRequest(f.id);
    await addUserNotification({ userId: f.requester_id, type: 'friend_accepted', actorId: id });
  } else {
    await deleteFriendship(f.id);
  }
  revalidatePath('/venner');
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Withdraw a request you sent, or remove a friend. */
export async function removeFriendshipAction(friendshipId: number): Promise<Result> {
  const { id } = await me();
  const f = await getFriendshipById(Number(friendshipId));
  if (!f || (f.requester_id !== id && f.addressee_id !== id)) return { error: 'Fant ikke vennskapet.' };
  await deleteFriendship(f.id);
  revalidatePath('/venner');
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function listFriendsAction(): Promise<Friend[]> {
  const { id } = await me();
  return (await listFriends(id)).map(({ id: fid, display_name, email }) => ({ id: fid, display_name, email }));
}

export async function shareCompanyAction(orgnr: string, friendIds: number[], message: string): Promise<Result & { sent?: number }> {
  const { id } = await me();
  if (await isRateLimited(`share-company:${id}`, 60, 60 * 60 * 1000)) return { error: 'For mange delinger — prøv igjen senere.' };
  const company = await getCompanyByOrgnr(String(orgnr ?? ''));
  if (!company) return { error: 'Fant ikke selskapet.' };
  const ids = [...new Set((Array.isArray(friendIds) ? friendIds : []).map(Number).filter(Number.isInteger))].slice(0, 50);
  if (ids.length === 0) return { error: 'Velg minst én venn.' };
  const note = String(message ?? '').trim().slice(0, 500) || null;
  let sent = 0;
  for (const friendId of ids) {
    // Only to confirmed friends — the same rule as minmatside's recipe share.
    if (!(await areFriends(id, friendId))) continue;
    await addUserNotification({
      userId: friendId,
      type: 'company_shared',
      actorId: id,
      orgnr: company.orgnr,
      companyName: company.name,
      message: note,
    });
    sent++;
  }
  if (sent === 0) return { error: 'Du kan bare dele med bekreftede venner.' };
  return { ok: true, sent };
}

export async function markMyNotificationsReadAction(): Promise<void> {
  const { id } = await me().catch(() => ({ id: 0 }));
  if (id) await markUserNotificationsRead(id);
}
