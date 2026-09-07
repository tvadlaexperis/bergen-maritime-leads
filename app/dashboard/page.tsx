import Link from 'next/link';
import type { Metadata } from 'next';
import { listCompaniesWithScore, listScans } from '@/lib/db';
import { agoLabel, fmtNok } from '@/app/format';
import ScoreBadge, { bandFor } from '@/app/components/ScoreBadge';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Oversikt' };

type Band = 'high' | 'mid' | 'low';

export default async function DashboardPage() {
  const [rows, scans] = await Promise.all([listCompaniesWithScore(), listScans(1)]);
  const active = rows.filter((r) => r.status === 'active');
  const lastScan = scans[0];
  const scored = active.filter((r) => r.lead_score != null);
  const totalHigh = scored.filter((r) => (r.lead_score ?? 0) >= 66).length;

  const groups = [...new Set(active.map((r) => r.matched_group).filter((g): g is string => !!g))].sort();
  const bySegment = groups.map((group) => {
    const list = active.filter((r) => r.matched_group === group);
    const s = list.filter((r) => r.lead_score != null);
    const bands: Record<Band, number> = { high: 0, mid: 0, low: 0 };
    for (const c of s) bands[bandFor(c.lead_score) as Band]++;
    const revenue = list.reduce((sum, c) => sum + (c.revenue_latest ?? 0), 0);
    const employees = list.reduce((sum, c) => sum + (c.employees ?? 0), 0);
    const top = [...s].sort((a, b) => (b.lead_score ?? 0) - (a.lead_score ?? 0)).slice(0, 3);
    return { group, count: list.length, scored: s.length, bands, revenue, employees, top };
  });

  return (
    <div className="page-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Oversikt</h1>
        <p className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
          {active.length} selskaper · {scored.length} scoret ·{' '}
          {lastScan ? `sist skannet ${agoLabel(lastScan.started_at)}` : 'ingen skann ennå'}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Stat label="Prioriterte leads (66+)" value={String(totalHigh)} tone="signal" />
        <Stat label="Verdt en vurdering (40–65)" value={String(scored.filter((r) => bandFor(r.lead_score) === 'mid').length)} tone="accent" />
        <Stat label="Lav prioritet (< 40)" value={String(scored.filter((r) => bandFor(r.lead_score) === 'low').length)} />
        <Stat label="Samlet omsetning" value={fmtNok(active.reduce((s, c) => s + (c.revenue_latest ?? 0), 0), { compact: true })} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {bySegment.map((c) => (
          <div key={c.group} className="box">
            <div className="box-header">
              <span className="box-title">{c.group}</span>
              <span className="muted">{c.count} selskaper</span>
            </div>
            <div className="box-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span className="num" style={{ fontSize: '1.9rem', fontWeight: 800, lineHeight: 1, color: c.bands.high ? 'var(--signal)' : 'var(--text-muted)' }}>
                  {c.bands.high}
                </span>
                <span className="muted" style={{ fontSize: '0.78rem' }}>prioriterte leads</span>
              </div>
              <DistBar bands={c.bands} total={c.scored} />
              <div className="muted" style={{ fontSize: '0.74rem' }}>
                {fmtNok(c.revenue, { compact: true })} omsetning · {c.employees.toLocaleString('nb-NO')} ansatte
              </div>
              {c.top.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {c.top.map((y) => (
                    <Link
                      key={y.id}
                      href={`/company/${y.orgnr}`}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}
                      className="link-accent"
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{y.name}</span>
                      <ScoreBadge score={y.lead_score} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'signal' | 'accent' }) {
  const color = tone === 'signal' ? 'var(--signal)' : tone === 'accent' ? 'var(--accent)' : 'var(--text-primary)';
  return (
    <div className="box box-pad" style={{ gap: 4 }}>
      <span className="num" style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{value}</span>
      <span className="muted" style={{ fontSize: '0.74rem' }}>{label}</span>
    </div>
  );
}

function DistBar({ bands, total }: { bands: Record<Band, number>; total: number }) {
  if (total === 0) return <div className="meter" />;
  const seg = (n: number, bg: string) => (n > 0 ? <span style={{ width: `${(n / total) * 100}%`, background: bg }} /> : null);
  return (
    <div className="meter" style={{ display: 'flex' }}>
      {seg(bands.high, 'var(--signal)')}
      {seg(bands.mid, 'var(--accent)')}
      {seg(bands.low, 'var(--text-muted)')}
    </div>
  );
}
