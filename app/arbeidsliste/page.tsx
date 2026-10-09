import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { listCompaniesWithScore, getSharedWorklist, listSharedWorklists } from '@/lib/db';
import CompanyList from '../CompanyList';
import ShareWorklist from './ShareWorklist';
import CopySharedList from './CopySharedList';
import WorklistPicker from './WorklistPicker';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Arbeidsliste' };

// Your work list — the companies bookmarked in the list or added from the map
// popup, stored in this browser (lib/worklist.ts) — or, with ?delt=<id>, a
// list a friend sent you (shared_worklists).
export default async function WorklistPage({ searchParams }: { searchParams: { delt?: string } }) {
  const [rows, user] = await Promise.all([listCompaniesWithScore(), getCurrentUser()]);
  const active = rows.filter((r) => r.status === 'active');
  const guest = (process.env.GUEST_EMAIL ?? '').trim().toLowerCase();
  const canShare = !!user && user.email.toLowerCase() !== guest;

  const sharedLists = canShare && user ? await listSharedWorklists(Number(user.sub)) : [];
  const sharedId = Number(searchParams.delt);
  const picker = sharedLists.length > 0 ? <WorklistPicker lists={sharedLists} current={sharedId || null} /> : null;
  if (sharedId && user) {
    const shared = await getSharedWorklist(sharedId, Number(user.sub));
    if (shared) {
      return (
        <CompanyList
          rows={active}
          title={`Arbeidsliste fra ${shared.from_name}`}
          subtitle={
            <>
              {shared.orgnrs.length} selskap{shared.orgnrs.length === 1 ? '' : 'er'} · sendt{' '}
              {new Date(shared.created_at).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
              {shared.message ? <> · «{shared.message}»</> : null} ·{' '}
              <Link href="/arbeidsliste" className="link-accent">
                til min arbeidsliste
              </Link>
            </>
          }
          onlyOrgnrs={shared.orgnrs}
          actions={
            <>
              {picker}
              <CopySharedList orgnrs={shared.orgnrs} />
            </>
          }
        />
      );
    }
  }

  return (
    <CompanyList
      rows={active}
      title="Arbeidsliste"
      subtitle="Selskaper du har lagt til med bokmerket i listen eller fra kartet — lagres i denne nettleseren."
      lockFavorites
      actions={
        canShare ? (
          <>
            {picker}
            <ShareWorklist />
          </>
        ) : undefined
      }
    />
  );
}
