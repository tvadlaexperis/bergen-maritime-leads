'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { CompanyWithScore } from '@/lib/db';
import { fmtNok, fmtPct, fmtInt } from './format';
import ScoreBadge from './components/ScoreBadge';

type SizeFilter = 'all' | 'under10' | '10' | '50';
type ScoreFilter = 'all' | '40' | '66';
type FilterTab = 'segment' | 'size' | 'score';
type SortKey = 'name' | 'group' | 'employees' | 'revenue' | 'growth' | 'score';
type SortDir = 'asc' | 'desc';

const COLUMNS: {
  key: SortKey;
  label: string;
  align?: 'right';
  firstDir: SortDir;
  value: (r: CompanyWithScore) => number | string | null;
}[] = [
  { key: 'name', label: 'Selskap', firstDir: 'asc', value: (r) => r.name.toLowerCase() },
  { key: 'group', label: 'Segment', firstDir: 'asc', value: (r) => r.matched_group ?? r.nace1_text ?? '' },
  { key: 'employees', label: 'Ansatte', align: 'right', firstDir: 'desc', value: (r) => r.employees },
  { key: 'revenue', label: 'Omsetning', align: 'right', firstDir: 'desc', value: (r) => r.revenue_latest },
  { key: 'growth', label: 'Vekst å/å', align: 'right', firstDir: 'desc', value: (r) => r.revenue_growth_pct },
  { key: 'score', label: 'Lead', align: 'right', firstDir: 'desc', value: (r) => r.lead_score },
];

export default function CompanyList({ rows }: { rows: CompanyWithScore[] }) {
  const [group, setGroup] = useState<string>('ALL');
  const [minSize, setMinSize] = useState<SizeFilter>('all');
  const [minScore, setMinScore] = useState<ScoreFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterTab, setFilterTab] = useState<FilterTab>('segment');

  const groups = useMemo(
    () => [...new Set(rows.map((r) => r.matched_group).filter((g): g is string => !!g))].sort(),
    [rows],
  );

  function toggleSort(col: (typeof COLUMNS)[number]) {
    if (col.key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(col.key);
      setSortDir(col.firstDir);
    }
  }

  const filtered = useMemo(() => {
    const list = rows.filter((r) => {
      if (group !== 'ALL' && r.matched_group !== group) return false;
      if (minSize === 'under10' && (r.employees ?? 0) >= 10) return false;
      if (minSize === '10' && (r.employees ?? 0) < 10) return false;
      if (minSize === '50' && (r.employees ?? 0) < 50) return false;
      if (minScore === '40' && (r.lead_score ?? -1) < 40) return false;
      if (minScore === '66' && (r.lead_score ?? -1) < 66) return false;
      return true;
    });
    const col = COLUMNS.find((c) => c.key === sortKey)!;
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = col.value(a);
      const bv = col.value(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return mul * av.localeCompare(bv as string, 'nb');
      return mul * ((av as number) - (bv as number));
    });
  }, [rows, group, minSize, minScore, sortKey, sortDir]);

  return (
    <div className="page-fill" style={{ gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className={`chip-tab${filterTab === 'segment' ? ' active' : ''}`}
            onClick={() => setFilterTab('segment')}
          >
            {group !== 'ALL' && <span className="chip-tab-dot" />}
            Segment
          </button>
          <button
            className={`chip-tab${filterTab === 'size' ? ' active' : ''}`}
            onClick={() => setFilterTab('size')}
          >
            {minSize !== 'all' && <span className="chip-tab-dot" />}
            Størrelse
          </button>
          <button
            className={`chip-tab${filterTab === 'score' ? ' active' : ''}`}
            onClick={() => setFilterTab('score')}
          >
            {minScore !== 'all' && <span className="chip-tab-dot" />}
            Score
          </button>
        </div>

        {filterTab === 'segment' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className={`chip${group === 'ALL' ? ' active' : ''}`} onClick={() => setGroup('ALL')}>
              Alle
            </button>
            {groups.map((g) => (
              <button key={g} className={`chip${group === g ? ' active' : ''}`} onClick={() => setGroup(g)}>
                {g}
              </button>
            ))}
          </div>
        )}

        {filterTab === 'size' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className={`chip${minSize === 'all' ? ' active' : ''}`} onClick={() => setMinSize('all')}>
              Alle
            </button>
            <button className={`chip${minSize === 'under10' ? ' active' : ''}`} onClick={() => setMinSize('under10')}>
              Under 10 ansatte
            </button>
            <button className={`chip${minSize === '10' ? ' active' : ''}`} onClick={() => setMinSize('10')}>
              10+ ansatte
            </button>
            <button className={`chip${minSize === '50' ? ' active' : ''}`} onClick={() => setMinSize('50')}>
              50+ ansatte
            </button>
          </div>
        )}

        {filterTab === 'score' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className={`chip${minScore === 'all' ? ' active' : ''}`} onClick={() => setMinScore('all')}>
              Alle
            </button>
            <button className={`chip${minScore === '40' ? ' active' : ''}`} onClick={() => setMinScore('40')}>
              40+
            </button>
            <button className={`chip${minScore === '66' ? ' active' : ''}`} onClick={() => setMinScore('66')}>
              66+
            </button>
          </div>
        )}
      </div>

      <div className="box" style={{ flex: 1, minHeight: 0 }}>
        <div className="box-scroll">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 34 }}>#</th>
                {COLUMNS.map((col) => {
                  const activeCol = col.key === sortKey;
                  return (
                    <th
                      key={col.key}
                      className={col.align === 'right' ? 'col-right' : undefined}
                      aria-sort={activeCol ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <button type="button" className="th-sort" onClick={() => toggleSort(col)}>
                        {col.label}
                        <span className="sort-ind">{activeCol ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id}>
                  <td className="num muted">{i + 1}</td>
                  <td>
                    <Link href={`/company/${r.orgnr}`} className="link-accent">
                      {r.name}
                    </Link>
                    {r.manual_entry === 1 && <span className="muted" style={{ marginLeft: 6 }}>· lagt til</span>}
                    {r.under_liquidation === 1 && <span className="muted" style={{ marginLeft: 6 }}>· under avvikling</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }} className="muted">{r.matched_group ?? '—'}</td>
                  <td className="col-right num">{fmtInt(r.employees)}</td>
                  <td className="col-right num" style={{ whiteSpace: 'nowrap' }}>{fmtNok(r.revenue_latest, { compact: true })}</td>
                  <td
                    className="col-right num"
                    style={{ whiteSpace: 'nowrap', color: r.revenue_growth_pct != null ? (r.revenue_growth_pct >= 0 ? 'var(--positive)' : 'var(--negative)') : undefined }}
                  >
                    {r.revenue_growth_pct != null ? fmtPct(r.revenue_growth_pct, 0) : '—'}
                  </td>
                  <td className="col-right">
                    <ScoreBadge score={r.lead_score} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 28 }}>
                    Ingen selskaper matcher filtrene.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
