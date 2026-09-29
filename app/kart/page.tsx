import type { Metadata } from 'next';
import { listCompaniesWithScore, ensureGroupsFresh } from '@/lib/db';
import CompanyMap, { type MapCompany } from './CompanyMap';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Kart' };

// Every active company with a geocoded business address (Kartverket, filled
// in by the Brreg pass in lib/scan.ts). Sole proprietorships are never placed.
export default async function MapPage() {
  await ensureGroupsFresh().catch(() => {});
  const rows = (await listCompaniesWithScore()).filter((r) => r.status === 'active');
  const groupSize = new Map<string, number>();
  for (const r of rows) if (r.group_key) groupSize.set(r.group_key, (groupSize.get(r.group_key) ?? 0) + 1);

  const placed: MapCompany[] = rows
    .filter((r) => r.lat != null && r.lon != null)
    .map((r) => ({
      orgnr: r.orgnr,
      name: r.name,
      lat: Number(r.lat),
      lon: Number(r.lon),
      score: r.lead_score,
      segment: r.matched_group,
      approximate: r.geo_precision === 'postnummer',
      groupSize: r.group_key ? (groupSize.get(r.group_key) ?? 1) : 1,
    }));
  const hidden = rows.filter((r) => r.geo_precision === 'skjult').length;
  const pending = rows.filter((r) => r.lat == null && r.geo_precision !== 'skjult').length;
  const segments = [...new Set(placed.map((c) => c.segment).filter((s): s is string => !!s))].sort();

  return (
    <div className="page-fill" style={{ gap: 14 }}>
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Kart</h1>
        <p className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
          {placed.length} av {rows.length} selskaper plassert etter forretningsadressen (Kartverket)
          {pending > 0 && ` · ${pending} venter på neste skann`}
          {hidden > 0 && ` · ${hidden} enkeltpersonforetak vises ikke (adressen er ofte eierens bolig)`}
        </p>
      </div>
      <CompanyMap companies={placed} segments={segments} />
    </div>
  );
}
