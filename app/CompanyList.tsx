'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { CompanyWithScore } from '@/lib/db';
import { describeGroupBasis, type GroupBasis } from '@/lib/groups';
import { fmtNok, fmtPct, fmtInt, dateLabel, agoLabel } from './format';
import ScoreBadge from './components/ScoreBadge';
import SignalBadge, { parseBuyingSignalLevel } from './components/SignalBadge';

type SizeFilter = 'all' | 'under5' | '5-15' | '10' | '50';
type ScoreFilter = 'all' | '40' | '66';
type GrowthFilter = 'all' | '0' | '10' | '25';
type SignalFilter = 'all' | 'high';
type FilterTab = 'segment' | 'bransje' | 'selskapsform' | 'kommune' | 'size' | 'growth' | 'score' | 'signal';
type SortKey = 'name' | 'group' | 'employees' | 'revenue' | 'growth' | 'result' | 'margin' | 'score' | 'updated';
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
  signalFilter: SignalFilter;
  mergeGroups: boolean;
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
  signalFilter: 'all',
  mergeGroups: true,
  filterTab: 'segment',
  search: '',
};

function KonsernIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" style={{ verticalAlign: '-1px' }}>
      <rect x="9" y="2" width="6" height="6" rx="1" />
      <rect x="2" y="16" width="6" height="6" rx="1" />
      <rect x="16" y="16" width="6" height="6" rx="1" />
      <path d="M12 8v4M5 16v-2h14v2" />
    </svg>
  );
}

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
  { key: 'result', label: 'Driftsresultat', align: 'right', firstDir: 'desc', value: (r) => r.operating_result_latest },
  { key: 'margin', label: 'Driftsmargin', align: 'right', firstDir: 'desc', value: (r) => r.operating_margin_pct },
  { key: 'score', label: 'Lead', align: 'right', firstDir: 'desc', value: (r) => r.lead_score },
  { key: 'updated', label: 'Sist oppdatert', align: 'right', firstDir: 'desc', value: (r) => r.last_refreshed_at },
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
  const [signalFilter, setSignalFilter] = useState<SignalFilter>(DEFAULT_FILTERS.signalFilter);
  const [mergeGroups, setMergeGroups] = useState<boolean>(DEFAULT_FILTERS.mergeGroups);
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
        if (saved.signalFilter) setSignalFilter(saved.signalFilter);
        if (typeof saved.mergeGroups === 'boolean') setMergeGroups(saved.mergeGroups);
        if (saved.filterTab && (saved.filterTab as string) !== 'kontakt') setFilterTab(saved.filterTab);
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
      signalFilter,
      mergeGroups,
      filterTab,
      search,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // ignore write failures
    }
  }, [group, bransje, orgForm, kommuneFilter, minSize, minGrowth, minScore, signalFilter, mergeGroups, filterTab, search]);

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
    signalFilter !== DEFAULT_FILTERS.signalFilter,
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
    setSignalFilter(DEFAULT_FILTERS.signalFilter);
    setSearch(DEFAULT_FILTERS.search);
  }

  const hasGrowthData = useMemo(() => rows.some((r) => r.revenue_growth_pct != null), [rows]);
  const groups = useMemo(() => uniqSorted(rows.map((r) => r.matched_group)), [rows]);
  const bransjer = useMemo(() => uniqSorted(rows.map((r) => r.nace1_text)), [rows]);
  const orgForms = useMemo(() => uniqSorted(rows.map((r) => r.org_form)), [rows]);
  const kommuner = useMemo(() => uniqSorted(rows.map((r) => r.kommune)), [rows]);
  // Keyed by id, not embedded on the row, so `rows` stays exactly what the
  // server sent — parsing 600+ small JSON blobs is negligible either way.
  const signalById = useMemo(() => new Map(rows.map((r) => [r.id, parseBuyingSignalLevel(r.ai_analysis)])), [rows]);
  const hasSignalData = useMemo(() => [...signalById.values()].some((v) => v != null), [signalById]);
  // Company groups (lib/groups.ts, stored as group_key by the scan): every
  // member in our list, and why they were grouped — for the badge tooltip.
  const membersByGroup = useMemo(() => {
    const map = new Map<string, CompanyWithScore[]>();
    for (const r of rows) {
      if (!r.group_key) continue;
      map.set(r.group_key, [...(map.get(r.group_key) ?? []), r]);
    }
    return map;
  }, [rows]);
  // Employees and revenue summed over the group — Brreg counts per legal
  // company, and a group's staff and turnover are spread over management,
  // shipowning and chartering companies (Wilson: 134 ansatte in one, the
  // revenue in three others).
  const groupTotals = useMemo(() => {
    const sum = (vals: (number | null)[]) => {
      const known = vals.filter((v): v is number => v != null);
      return known.length ? known.reduce((a, b) => a + b, 0) : null;
    };
    const map = new Map<string, { employees: number | null; revenue: number | null; result: number | null }>();
    for (const [key, members] of membersByGroup) {
      map.set(key, {
        employees: sum(members.map((m) => m.employees)),
        revenue: sum(members.map((m) => m.revenue_latest)),
        result: sum(members.map((m) => m.operating_result_latest)),
      });
    }
    return map;
  }, [membersByGroup]);
  const GROUP_SUM_NOTE =
    'Sum av selskapenes egne tall i Brønnøysund — kan inneholde interne transaksjoner, og utenlandske selskaper og mannskap ansatt i utlandet er ikke med.';
  const groupBasisText = (r: CompanyWithScore) => {
    if (!r.group_basis) return '';
    try {
      return describeGroupBasis(JSON.parse(r.group_basis) as GroupBasis).text;
    } catch {
      return '';
    }
  };

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
      // Size is the whole group's when groups are merged (a group row shows
      // the summed staff — Odfjell Tankers has none itself, 364 in the
      // group). Unknown staff matches no size filter rather than counting as 0.
      const employees =
        mergeGroups && r.group_key && (membersByGroup.get(r.group_key)?.length ?? 0) > 1
          ? (groupTotals.get(r.group_key)?.employees ?? null)
          : r.employees;
      if (minSize !== 'all' && employees == null) return false;
      const n = employees ?? 0;
      if (minSize === 'under5' && n >= 5) return false;
      if (minSize === '5-15' && (n < 5 || n > 15)) return false;
      if (minSize === '10' && n < 10) return false;
      if (minSize === '50' && n < 50) return false;
      const growth = r.revenue_growth_pct;
      if (minGrowth === '0' && (growth == null || growth <= 0)) return false;
      if (minGrowth === '10' && (growth == null || growth <= 10)) return false;
      if (minGrowth === '25' && (growth == null || growth <= 25)) return false;
      if (minScore === '40' && (r.lead_score ?? -1) < 40) return false;
      if (minScore === '66' && (r.lead_score ?? -1) < 66) return false;
      if (signalFilter === 'high' && signalById.get(r.id) !== 'høy') return false;
      if (q) {
        const haystack = `${r.name} ${r.matched_group ?? ''} ${r.nace1_text ?? ''} ${r.org_form ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    const col = COLUMNS.find((c) => c.key === sortKey)!;
    const mul = sortDir === 'asc' ? 1 : -1;
    const sorted = [...list].sort((a, b) => {
      const av = col.value(a);
      const bv = col.value(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return mul * av.localeCompare(bv as string, 'nb');
      return mul * ((av as number) - (bv as number));
    });
    if (!mergeGroups) return sorted;
    // One row per group, at the position of its best-ranked member under the
    // current sort — but shown as its operating company (most employees,
    // then revenue, then score), not whichever holding or shipowning shell
    // happened to rank first (Wilson showed "Wilson Ship Management, 10
    // ansatte" while Wilson Management has 134).
    const inList = new Set(list.map((r) => r.id));
    const operating = (key: string) =>
      [...(membersByGroup.get(key) ?? [])]
        .filter((m) => inList.has(m.id))
        .sort(
          (a, b) =>
            (b.employees ?? -1) - (a.employees ?? -1) ||
            (b.revenue_latest ?? -1) - (a.revenue_latest ?? -1) ||
            (b.lead_score ?? -1) - (a.lead_score ?? -1),
        )[0];
    const seen = new Set<string>();
    const out: CompanyWithScore[] = [];
    for (const r of sorted) {
      if (!r.group_key || (membersByGroup.get(r.group_key)?.length ?? 0) < 2) {
        out.push(r);
        continue;
      }
      if (seen.has(r.group_key)) continue;
      seen.add(r.group_key);
      out.push(operating(r.group_key) ?? r);
    }
    return out;
  }, [rows, group, bransje, orgForm, kommuneFilter, minSize, minGrowth, minScore, signalFilter, signalById, search, favorites, lockFavorites, sortKey, sortDir, mergeGroups, membersByGroup, groupTotals]);

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
          <label className="merge-toggle" title="Vis selskaper i samme konsern som én rad">
            <input type="checkbox" checked={mergeGroups} onChange={(e) => setMergeGroups(e.target.checked)} />
            Slå sammen konsern
          </label>
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
          <button
            className={`chip-tab${filterTab === 'signal' ? ' active' : ''}`}
            onClick={() => setFilterTab('signal')}
          >
            {signalFilter !== 'all' && <span className="chip-tab-dot" />}
            Kjøpssignal
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
            <button className={`chip${minSize === 'under5' ? ' active' : ''}`} onClick={() => setMinSize('under5')}>
              Under 5 ansatte
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

        {filterTab === 'signal' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className={`chip${signalFilter === 'all' ? ' active' : ''}`} onClick={() => setSignalFilter('all')}>
              Alle
            </button>
            <button className={`chip${signalFilter === 'high' ? ' active' : ''}`} onClick={() => setSignalFilter('high')}>
              Sterkt kjøpssignal
            </button>
            {!hasSignalData && (
              <span className="muted" style={{ fontSize: '0.76rem' }}>
                Ingen kjøpssignal-data ennå — kommer fra AI-analysen som kjøres på selskapene etter
                hvert som den roterende skanningen når dem.
              </span>
            )}
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
                    <Fragment key={col.key}>
                      <th
                        className={col.align === 'right' ? 'col-right' : undefined}
                        aria-sort={activeCol ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <button type="button" className="th-sort" onClick={() => toggleSort(col)}>
                          {col.label}
                          <span className="sort-ind">{activeCol ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                        </button>
                      </th>
                      {col.key === 'name' && <th>Status</th>}
                    </Fragment>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const groupMembers = r.group_key ? (membersByGroup.get(r.group_key) ?? []) : [];
                // A merged group row shows the group's totals throughout, so
                // revenue, result and margin describe the same thing.
                const tot = mergeGroups && groupMembers.length > 1 ? groupTotals.get(r.group_key!) : undefined;
                const opResult = tot ? tot.result : r.operating_result_latest;
                const opMargin = tot
                  ? tot.result != null && tot.revenue ? (tot.result / tot.revenue) * 100 : null
                  : r.operating_margin_pct;
                return (
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
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.under_liquidation === 1 && <span className="liquidation-badge">Under avvikling</span>}
                    {r.ceo_changed_at != null && (
                      <span className="ceo-changed-badge" title={`Byttet daglig leder ${dateLabel(r.ceo_changed_at)}`}>
                        Ny ledelse
                      </span>
                    )}
                    <SignalBadge level={signalById.get(r.id) ?? null} />
                    {groupMembers.length > 1 && (
                      <span
                        className="konsern-badge"
                        title={`${groupBasisText(r)}\nSelskaper: ${groupMembers.map((m) => m.name).join(', ')}`}
                      >
                        <KonsernIcon /> Konsern · {groupMembers.length}
                      </span>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }} className="muted">{r.matched_group ?? '—'}</td>
                  <td className="col-right num">
                    {mergeGroups && groupMembers.length > 1 ? (
                      <span title={`Sum i konsernet (${fmtInt(r.employees)} i ${r.name}). ${GROUP_SUM_NOTE}`}>
                        {fmtInt(groupTotals.get(r.group_key!)?.employees ?? null)}
                      </span>
                    ) : (
                      fmtInt(r.employees)
                    )}
                  </td>
                  <td className="col-right num" style={{ whiteSpace: 'nowrap' }}>{mergeGroups && groupMembers.length > 1 ? (
                      <span title={`Sum i konsernet (${fmtNok(r.revenue_latest, { compact: true })} i ${r.name}). ${GROUP_SUM_NOTE}`}>
                        {fmtNok(groupTotals.get(r.group_key!)?.revenue ?? null, { compact: true })}
                      </span>
                    ) : (
                      fmtNok(r.revenue_latest, { compact: true })
                    )}</td>
                  <td
                    className="col-right num"
                    style={{ whiteSpace: 'nowrap', color: r.revenue_growth_pct != null ? (r.revenue_growth_pct >= 0 ? 'var(--positive)' : 'var(--negative)') : undefined }}
                  >
                    {r.revenue_growth_pct != null ? fmtPct(r.revenue_growth_pct, 0) : '—'}
                  </td>
                  <td
                    className="col-right num"
                    style={{ whiteSpace: 'nowrap', color: opResult != null ? (opResult >= 0 ? 'var(--positive)' : 'var(--negative)') : undefined }}
                    title={tot ? `Sum i konsernet. ${GROUP_SUM_NOTE}` : undefined}
                  >
                    {fmtNok(opResult, { compact: true })}
                  </td>
                  <td
                    className="col-right num"
                    style={{ whiteSpace: 'nowrap', color: opMargin != null ? (opMargin >= 0 ? 'var(--positive)' : 'var(--negative)') : undefined }}
                  >
                    {opMargin != null ? fmtPct(opMargin, 0) : '—'}
                  </td>
                  <td className="col-right">
                    <ScoreBadge score={r.lead_score} reason={r.reason} />
                  </td>
                  <td className="col-right muted" style={{ whiteSpace: 'nowrap' }} title={dateLabel(r.last_refreshed_at)}>
                    {agoLabel(r.last_refreshed_at)}
                  </td>
                </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="muted" style={{ textAlign: 'center', padding: 28 }}>
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
