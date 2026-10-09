import type { Metadata } from 'next';
import { listCompaniesWithScore } from '@/lib/db';
import CompanyList from '../CompanyList';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Arbeidsliste' };

// One work list for now — the companies bookmarked in the list or added from
// the map popup. Stored in this browser (lib/worklist.ts).
export default async function WorklistPage() {
  const rows = await listCompaniesWithScore();
  const active = rows.filter((r) => r.status === 'active');

  return (
    <CompanyList
      rows={active}
      title="Arbeidsliste"
      subtitle="Selskaper du har lagt til med bokmerket i listen eller fra kartet — lagres i denne nettleseren."
      lockFavorites
    />
  );
}
