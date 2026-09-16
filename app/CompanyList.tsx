'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { CompanyWithScore } from '@/lib/db';
import { fmtNok, fmtPct, fmtInt } from './format';
import ScoreBadge from './components/ScoreBadge';

type SizeFilter = 'all' | 'under10' | '5-15' | '10' | '50';
type ScoreFilter = 'all' | '40' | '66';
type GrowthFilter = 'all' | '0' | '10' | '25';
type FilterTab = 'segment' | 'bransje' | 'selskapsform' | 'kommune' | 'size' | 'growth' | 'score';
type SortKey = 'name' | 'group' | 'employees' | 'revenue' | 'growth' | 'score';
type SortDir = 'asc' | 'desc';

const STORAGE_KEY = 'bml.companyList.filters.v1';
const FAVORITES_KEY = 'bml.companyList.favorites.v1';

interface StoredFilters {
  group: string;
  bransje: string;
  orgForm: string;
  kommuneFilter: string;
  minSize: SizeFilter;
  minGrowth: GrowthFilter;
  minScore: ScoreFilter;
  filterTab: FilterTab;
  search: string;
}

const DEFAULT_FILTERS: StoredFilters = {
  group: 'ALL',
  bransje: 'ALL',
  orgForm: 'ALL',
  kommuneFilter: 'ALL',
  minSize: 'all',
  minGrowth: 'all',
  minScore: 'all',
  filterTab: 'segment',
  search: '',
};

function uniqSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'nb'));
}

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

export default function CompanyList({
  rows,
  title,
  subtitle,
  lockFavorites,
}: {
  rows: CompanyWithScore[];
  title: string;
  subtitle: ReactNode;
  /** Forces the list to show favorites only and hides the toggle — used by the /favoritter page. */
  lockFavorites?: boolean;
}) {
  const [group, setGroup] = useState<string>(DEFAULT_FILTERS.group);
  const [bransje, setBransje] = useState<string>(DEFAULT_FILTERS.bransje);
  const [orgForm, setOrgForm] = useState<string>(DEFAULT_FILTERS.orgForm);
  const [kommuneFilter, setKommuneFilter] = useState<string>(DEFAULT_FILTERS.kommuneFilter);
  const [minSize, setMinSize] = useState<SizeFilter>(DEFAULT_FILTERS.minSize);
  const [minGrowth, setMinGrowth] = useState<GrowthFilter>(DEFAULT_FILTERS.minGrowth);
  const [minScore, setMinScore] = useState<ScoreFilter>(DEFAULT_FILTERS.minScore);
  const [filterTab, setFilterTab] = useState<FilterTab>(DEFAULT_FILTERS.filterTab);
  const [search, setSearch] = useState<string>(DEFAULT_FILTERS.search);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const loadedFromStorage = useRef(false);
  const loadedFavorites = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<StoredFilters>;
        if (saved.group) setGroup(saved.group);
        if (saved.bransje) setBransje(saved.bransje);
        if (saved.orgForm) setOrgForm(saved.orgForm);
        if (saved.kommuneFilter) setKommuneFilter(saved.kommuneFilter);
        if (saved.minSize) setMinSize(saved.minSize);
        if (saved.minGrowth) setMinGrowth(saved.minGrowth);
        if (saved.minScore) setMinScore(saved.minScore);
        if (saved.filterTab) setFilterTab(saved.filterTab);
        if (saved.search) setSearch(saved.search);
      }
    } catch {
      // localStorage unavailable (private mode, blocked storage, …) — fall back to defaults.
    }
    loadedFromStorage.current = true;

    try {
      const rawFav = window.localStorage.getItem(FAVORITES_KEY);
      if (rawFav) setFavorites(new Set(JSON.parse(rawFav) as string[]));
    } catch {
      // ignore
    }
    loadedFavorites.current = true;
  }, []);

  useEffect(() => {
    if (!loadedFromStorage.current) return;
    const toSave: StoredFilters = {
      group,
      bransje,
      orgForm,
      kommuneFilter,
      minSize,
      minGrowth,
      minScore,
      filterTab,
      search,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // ignore write failures
    }
  }, [group, bransje, orgForm, kommuneFilter, minSize, minGrowth, minScore, filterTab, search]);

  useEffect(() => {
    if (!loadedFavorites.current) return;
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
    } catch {
      // ignore write failures
    }
  }, [favorites]);

  function toggleFavorite(orgnr: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(orgnr)) next.delete(orgnr);
      else next.add(orgnr);
      return next;
    });
  }

  const activeFilterCount = [
    group !== DEFAULT_FILTERS.group,
    bransje !== DEFAULT_FILTERS.bransje,
    orgForm !== DEFAULT_FILTERS.orgForm,
    kommuneFilter !== DEFAULT_FILTERS.kommuneFilter,
    minSize !== DEFAULT_FILTERS.minSize,
    minGrowth !== DEFAULT_FILTERS.minGrowth,
    minScore !== DEFAULT_FILTERS.minScore,
    search !== DEFAULT_FILTERS.search,
  ].filter(Boolean).length;

  function resetFilters() {
    setGroup(DEFAULT_FILTERS.group);
    setBransje(DEFAULT_FILTERS.bransje);
    setOrgForm(DEFAULT_FILTERS.orgForm);
    setKommuneFilter(DEFAULT_FILTERS.kommuneFilter);
    setMinSize(DEFAULT_FILTERS.minSize);
    setMinGrowth(DEFAULT_FILTERS.minGrowth);
    setMinScore(DEFAULT_FILTERS.minScore);
    setSearch(DEFAULT_FILTERS.search);
  }

  const hasGrowthData = useMemo(() => rows.some((r) => r.revenue_growth_pct != null), [rows]);
  const groups = useMemo(() => uniqSorted(rows.map((r) => r.matched_group)), [rows]);
  const bransjer = useMemo(() => uniqSorted(rows.map((r) => r.nace1_text)), [rows]);
  const orgForms = useMemo(() => uniqSorted(rows.map((r) => r.org_form)), [rows]);
  const kommuner = useMemo(() => uniqSorted(rows.map((r) => r.kommune)), [rows]);

  function toggleSort(col: (typeof COLUMNS)[number]) {
    if (col.key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(col.key);
      setSortDir(col.firstDir);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (lockFavorites && !favorites.has(r.orgnr)) return false;
      if (group !== 'ALL' && r.matched_group !== group) return false;
      if (bransje !== 'ALL' && r.nace1_text !== bransje) return false;
      if (orgForm !== 'ALL' && r.org_form !== orgForm) return false;
      if (kommuneFilter !== 'ALL' && r.kommune !== kommuneFilter) return false;
      const employees = r.employees ?? 0;
      if (minSize === 'under10' && employees >= 10) return false;
      if (minSize === '5-15' && (employees < 5 || employees > 15)) return false;
      if (minSize === '10' && employees < 10) return false;
      if (minSize === '50' && employees < 50) return false;
      const growth = r.revenue_growth_pct;
      if (minGrowth === '0' && (growth == null || growth <= 0)) return false;
      if (minGrowth === '10' && (growth == null || growth <= 10)) return false;
      if (minGrowth === '25' && (growth == null || growth <= 25)) return false;
      if (minScore === '40' && (r.lead_score ?? -1) < 40) return false;
      if (minScore === '66' && (r.lead_score ?? -1) < 66) return false;
      if (q) {
        const haystack = `${r.name} ${r.matched_group ?? ''} ${r.nace1_text ?? ''} ${r.org_form ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
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
  }, [rows, group, bransje, orgForm, kommuneFilter, minSize, minGrowth, minScore, search, favorites, lockFavorites, sortKey, sortDir]);

  return (
    <div className="page-fill" style={{ gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</h1>
          <p className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
            {subtitle}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="search"
            className="search-input"
            placeholder="Søk selskap, segment, bransje …"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Søk i selskaper"
          />
        </div>
      </div>

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
            className={`chip-tab${filterTab === 'bransje' ? ' active' : ''}`}
            onClick={() => setFilterTab('bransje')}
          >
            {bransje !== 'ALL' && <span className="chip-tab-dot" />}
            Bransje
          </button>
          <button
            className={`chip-tab${filterTab === 'selskapsform' ? ' active' : ''}`}
            onClick={() => setFilterTab('selskapsform')}
          >
            {orgForm !== 'ALL' && <span className="chip-tab-dot" />}
            Selskapsform
          </button>
          <button
            className={`chip-tab${filterTab === 'kommune' ? ' active' : ''}`}
            onClick={() => setFilterTab('kommune')}
          >
            {kommuneFilter !== 'ALL' && <span className="chip-tab-dot" />}
            Kommune
          </button>
          <button
            className={`chip-tab${filterTab === 'size' ? ' active' : ''}`}
            onClick={() => setFilterTab('size')}
          >
            {minSize !== 'all' && <span className="chip-tab-dot" />}
            Størrelse
          </button>
          <button
            className={`chip-tab${filterTab === 'growth' ? ' active' : ''}`}
            onClick={() => setFilterTab('growth')}
          >
            {minGrowth !== 'all' && <span className="chip-tab-dot" />}
            Vekst
          </button>
          <button
            className={`chip-tab${filterTab === 'score' ? ' active' : ''}`}
            onClick={() => setFilterTab('score')}
          >
            {minScore !== 'all' && <span className="chip-tab-dot" />}
            Score
          </button>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            {activeFilterCount > 0 && (
              <>
                <span className="muted" style={{ fontSize: '0.76rem' }}>
                  {activeFilterCount} {activeFilterCount === 1 ? 'filter' : 'filtre'} aktive
                </span>
                <button type="button" className="clear-filters" onClick={resetFilters}>
                  <span aria-hidden="true">✕</span> Nullstill
                </button>
              </>
            )}
            <span className="hit-badge">Treff {filtered.length}</span>
          </span>
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

        {filterTab === 'bransje' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className={`chip${bransje === 'ALL' ? ' active' : ''}`} onClick={() => setBransje('ALL')}>
              Alle
            </button>
            {bransjer.map((b) => (
              <button key={b} className={`chip${bransje === b ? ' active' : ''}`} onClick={() => setBransje(b)}>
                {b}
              </button>
            ))}
          </div>
        )}

        {filterTab === 'selskapsform' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className={`chip${orgForm === 'ALL' ? ' active' : ''}`} onClick={() => setOrgForm('ALL')}>
              Alle
            </button>
            {orgForms.map((o) => (
              <button key={o} className={`chip${orgForm === o ? ' active' : ''}`} onClick={() => setOrgForm(o)}>
                {o}
              </button>
            ))}
          </div>
        )}

        {filterTab === 'kommune' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className={`chip${kommuneFilter === 'ALL' ? ' active' : ''}`}
              onClick={() => setKommuneFilter('ALL')}
            >
              Alle
            </button>
            {kommuner.map((k) => (
              <button
                key={k}
                className={`chip${kommuneFilter === k ? ' active' : ''}`}
                onClick={() => setKommuneFilter(k)}
              >
                {k}
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
            <button className={`chip${minSize === '5-15' ? ' active' : ''}`} onClick={() => setMinSize('5-15')}>
              5–15 ansatte
            </button>
            <button className={`chip${minSize === '10' ? ' active' : ''}`} onClick={() => setMinSize('10')}>
              10+ ansatte
            </button>
            <button className={`chip${minSize === '50' ? ' active' : ''}`} onClick={() => setMinSize('50')}>
              50+ ansatte
            </button>
          </div>
        )}

        {filterTab === 'growth' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className={`chip${minGrowth === 'all' ? ' active' : ''}`} onClick={() => setMinGrowth('all')}>
              Alle
            </button>
            <button className={`chip${minGrowth === '0' ? ' active' : ''}`} onClick={() => setMinGrowth('0')}>
              Vekst &gt; 0 %
            </button>
            <button className={`chip${minGrowth === '10' ? ' active' : ''}`} onClick={() => setMinGrowth('10')}>
              Vekst &gt; 10 %
            </button>
            <button className={`chip${minGrowth === '25' ? ' active' : ''}`} onClick={() => setMinGrowth('25')}>
              Vekst &gt; 25 %
            </button>
            {!hasGrowthData && (
              <span className="muted" style={{ fontSize: '0.76rem' }}>
                Ingen vekstdata ennå — Brønnøysund har foreløpig bare siste årsregnskap for disse
                selskapene. Fylles ut automatisk etter hvert som nye årsregnskap leveres.
              </span>
            )}
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
                <th style={{ width: 28 }} aria-label="Favoritt" />
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
                    <button
                      type="button"
                      className={`fav-star${favorites.has(r.orgnr) ? ' active' : ''}`}
                      onClick={() => toggleFavorite(r.orgnr)}
                      aria-label={favorites.has(r.orgnr) ? 'Fjern fra favoritter' : 'Legg til favoritter'}
                      aria-pressed={favorites.has(r.orgnr)}
                    >
                      {favorites.has(r.orgnr) ? '★' : '☆'}
                    </button>
                  </td>
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
                  <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 28 }}>
                    {lockFavorites && favorites.size === 0
                      ? 'Ingen favoritter ennå. Klikk ☆ ved et selskap for å legge det til.'
                      : 'Ingen selskaper matcher filtrene.'}
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
