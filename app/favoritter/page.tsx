import type { Metadata } from 'next';
import { listCompaniesWithScore } from '@/lib/db';
import CompanyList from '../CompanyList';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Favoritter' };

export default async function FavoritesPage() {
  const rows = await listCompaniesWithScore();
  const active = rows.filter((r) => r.status === 'active');

  return (
    <CompanyList
      rows={active}
      title="Favoritter"
      subtitle="Selskaper du har stjernemerket — lagres i denne nettleseren."
      lockFavorites
    />
  );
}
