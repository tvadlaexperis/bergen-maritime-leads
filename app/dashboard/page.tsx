import Link from 'next/link';
import type { Metadata } from 'next';
import { listCompaniesWithScore, listScans, ensureGroupsFresh, type CompanyWithScore } from '@/lib/db';
import { agoLabel, fmtNok } from '@/app/format';
import ScoreBadge, { bandFor } from '@/app/components/ScoreBadge';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Oversikt' };

type Band = 'high' | 'mid' | 'low';
type View = 'kunde' | 'selskap';

// One row of the overview: a company, or — per customer — a whole group
// (lib/groups.ts) shown as its operating company, with the group's best
// score and summed revenue/employees, placed in the operating company's
// segment. Same rules as the merged company list.
interface Unit {
  key: string;
  rep: CompanyWithScore;
  size: number;
  score: number | null;
  revenue: number;
  employees: number;
  segment: string | null;
}

function buildUnits(active: CompanyWithScore[], view: View): Unit[] {
  const one = (c: CompanyWithScore): Unit => ({
    key: c.orgnr,
    rep: c,
    size: 1,
    score: c.lead_score,
    revenue: c.revenue_latest ?? 0,
    employees: c.employees ?? 0,
    segment: c.matched_group,
  });
  if (view === 'selskap') return active.map(one);
  const byGroup = new Map<string, CompanyWithScore[]>();
  const units: Unit[] = [];
  for (const c of active) {
    if (c.group_key) byGroup.set(c.group_key, [...(byGroup.get(c.group_key) ?? []), c]);
    else units.push(one(c));
  }
  for (const [key, members] of byGroup) {
    if (members.length === 1) {
      units.push(one(members[0]));
      continue;
    }
    const rep = [...members].sort(
      (a, b) =>
        (b.employees ?? -1) - (a.employees ?? -1) ||
        (b.revenue_latest ?? -1) - (a.revenue_latest ?? -1) ||
        (b.lead_score ?? -1) - (a.lead_score ?? -1),
    )[0];
    const scores = members.map((m) => m.lead_score).filter((v): v is number => v != null);
    units.push({
      key,
      rep,
      size: members.length,
      score: scores.length ? Math.max(...scores) : null,
      revenue: members.reduce((sum, m) => sum + (m.revenue_latest ?? 0), 0),
      employees: members.reduce((sum, m) => sum + (m.employees ?? 0), 0),
      segment: rep.matched_group,
    });
  }
  return units;
}

export default async function DashboardPage({ searchParams }: { searchParams: { visning?: string } }) {
  const view: View = searchParams.visning === 'selskap' ? 'selskap' : 'kunde';
  await ensureGroupsFresh().catch(() => {});
  const [rows, scans] = await Promise.all([listCompaniesWithScore(), listScans(1)]);
  const active = rows.filter((r) => r.status === 'active');
  const lastScan = scans[0];
  const units = buildUnits(active, view);
  const scored = units.filter((u) => u.score != null);
  const totalHigh = scored.filter((u) => (u.score ?? 0) >= 66).length;
  const noun = view === 'kunde' ? 'kunder' : 'selskaper';

  const groups = [...new Set(units.map((u) => u.segment).filter((g): g is string => !!g))].sort();
  const bySegment = groups.map((group) => {
    const list = units.filter((u) => u.segment === group);
    const s = list.filter((u) => u.score != null);
    const bands: Record<Band, number> = { high: 0, mid: 0, low: 0 };
    for (const u of s) bands[bandFor(u.score) as Band]++;
    const revenue = list.reduce((sum, u) => sum + u.revenue, 0);
    const employees = list.reduce((sum, u) => sum + u.employees, 0);
    const top = [...s].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 3);
    return { group, count: list.length, scored: s.length, bands, revenue, employees, top };
  });

  return (
    <div className="page-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Oversikt</h1>
          <p className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
            {units.length} {noun}
            {view === 'kunde' && units.length !== active.length && ` (${active.length} selskaper, konsern slått sammen)`} ·{' '}
            {scored.length} scoret · {lastScan ? `sist skannet ${agoLabel(lastScan.started_at)}` : 'ingen skann ennå'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '0.78rem' }}>Vis</span>
          <Link href="/dashboard" className={`chip${view === 'kunde' ? ' active' : ''}`}>
            kunder (konsern samlet)
          </Link>
          <Link href="/dashboard?visning=selskap" className={`chip${view === 'selskap' ? ' active' : ''}`}>
            alle selskaper
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Stat label="Prioriterte leads (66+)" value={String(totalHigh)} tone="signal" />
        <Stat label="Verdt en vurdering (40–65)" value={String(scored.filter((u) => bandFor(u.score) === 'mid').length)} tone="accent" />
        <Stat label="Lav prioritet (< 40)" value={String(scored.filter((u) => bandFor(u.score) === 'low').length)} />
        <Stat label="Samlet omsetning" value={fmtNok(units.reduce((s, u) => s + u.revenue, 0), { compact: true })} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {bySegment.map((c) => (
          <div key={c.group} className="box">
            <div className="box-header">
              <span className="box-title">{c.group}</span>
              <span className="muted">
                {c.count} {noun}
              </span>
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
                  {c.top.map((u) => (
                    <Link
                      key={u.key}
                      href={`/company/${u.rep.orgnr}`}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}
                      className="link-accent"
                      title={u.size > 1 ? `Konsern med ${u.size} selskaper — viser driftsselskapet og konsernets høyeste score` : undefined}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.rep.name}
                        {u.size > 1 && <span className="muted"> · konsern ({u.size})</span>}
                      </span>
                      <ScoreBadge score={u.score} />
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
