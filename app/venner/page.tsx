import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listFriends, listIncomingFriendRequests, listOutgoingFriendRequests } from '@/lib/db';
import FriendsClient from './FriendsClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Venner' };

export default async function FriendsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/venner');
  const guest = (process.env.GUEST_EMAIL ?? '').trim().toLowerCase();
  if (guest && user.email.toLowerCase() === guest) redirect('/');

  const id = Number(user.sub);
  const [friends, requests, sent] = await Promise.all([
    listFriends(id),
    listIncomingFriendRequests(id),
    listOutgoingFriendRequests(id),
  ]);
  return <FriendsClient friends={friends} requests={requests} sent={sent} />;
}
