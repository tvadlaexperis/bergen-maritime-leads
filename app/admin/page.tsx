import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import {
  countActiveCompanies,
  getDataCoverage,
  listCompaniesForCoverage,
  isCoverageCategory,
  isCoverageMode,
  type CoverageCategory,
  type CoverageMode,
  listScans,
  listAudit,
  getFreshness,
  countAiPending,
  countBrregStale,
} from '@/lib/db';
import { dateLabel, osloDayStart } from '@/app/format';
import ScanPanel from './ScanPanel';
import AddCompanyForm from './AddCompanyForm';
import GuestLinkPanel from './GuestLinkPanel';
import FreshnessTile from './FreshnessTile';
import BackArrow from '@/app/components/BackArrow';

export const dynamic = 'force-dynamic';
// Matches the cron route's budget (app/api/cron/scan/route.ts) — without
// this, the "Kjør skann" button's Server Action would inherit Vercel's much
// shorter default function duration and get killed well before runScan()'s
// own 45s enrichment deadline ever kicks in.
export const maxDuration = 60;
export const metadata: Metadata = { title: 'Admin' };

type View = 'oppdatering' | 'datakvalitet' | 'verktoy' | 'logg';

// Page-level tabs. Old `?view=skann|dekning` links (bookmarks, notifications)
// map onto their new homes.
const VIEWS: { key: View; label: string; href: string }[] = [
  { key: 'oppdatering', label: 'Oppdatering', href: '/admin' },
  { key: 'datakvalitet', label: 'Datakvalitet', href: '/admin?view=datakvalitet' },
  { key: 'verktoy', label: 'Verktøy', href: '/admin?view=verktoy' },
  { key: 'logg', label: 'Logg', href: '/admin?view=logg' },
];

function parseView(raw: string | undefined): View {
  if (raw === 'logg' || raw === 'verktoy' || raw === 'datakvalitet') return raw;
  if (raw === 'dekning') return 'datakvalitet';
  return 'oppdatering';
}

// Logg date filter. Day boundaries are Bergen midnight, not the server's UTC.
const PERIODS = [
  { key: 'idag', label: 'I dag', range: () => ({ from: osloDayStart(0), to: Number.MAX_SAFE_INTEGER }) },
  { key: 'igar', label: 'I går', range: () => ({ from: osloDayStart(1), to: osloDayStart(0) }) },
  { key: '7d', label: 'Siste 7 dager', range: () => ({ from: osloDayStart(6), to: Number.MAX_SAFE_INTEGER }) },
  { key: '30d', label: 'Siste 30 dager', range: () => ({ from: osloDayStart(29), to: Number.MAX_SAFE_INTEGER }) },
  { key: 'alle', label: 'Alle', range: () => null },
] as const;


// Which of the full-width panels shows below the header — a query param
// rather than client state, so the toggle is a plain link and the page stays
// a Server Component (no new client wrapper needed just to switch panels).
export default async function AdminPage({
  searchParams,
}: {
  searchParams: { view?: string; kategori?: string; modus?: string; scan?: string; periode?: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login?next=/admin');

  const view = parseView(searchParams.view);
  const category: CoverageCategory | null =
    view === 'datakvalitet' && searchParams.kategori && isCoverageCategory(searchParams.kategori) ? searchParams.kategori : null;
  const selectedScanId = Number(searchParams.scan) || null;
  const period = PERIODS.find((p) => p.key === searchParams.periode) ?? PERIODS.find((p) => p.key === 'idag')!;
  const periodRange = period.range();
  const mode: CoverageMode = searchParams.modus && isCoverageMode(searchParams.modus) ? searchParams.modus : 'har';

  const [activeCount, scans, auditRows, coverage, categoryCompanies, freshness, aiRemaining, brregStale] = await Promise.all([
    countActiveCompanies(),
    listScans(15),
    listAudit(periodRange ? 1000 : 200, periodRange ?? undefined),
    getDataCoverage(),
    category ? listCompaniesForCoverage(category, mode) : Promise.resolve(null),
    getFreshness(),
    countAiPending(),
    countBrregStale(),
  ]);

  return (
    <div className="page-fill" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BackArrow href="/" label="Tilbake til listen" />
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Admin</h1>
        </div>
      </div>

      <nav className="page-tabs" aria-label="Admin">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={v.href}
            className={`page-tab${view === v.key ? ' active' : ''}`}
            aria-current={view === v.key ? 'page' : undefined}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {/* Full width, full height — only one panel shows at a time rather than
          splitting the width permanently, since these are rarely needed
          side by side. */}
      {view === 'datakvalitet' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
          {(() => {
            const rows = [
              { key: 'financials', label: 'Regnskap hentet (Brreg)', value: coverage.withFinancials },
              { key: 'growth', label: 'Vekst beregnbar (2+ regnskapsår)', value: coverage.withGrowth },
              { key: 'ai', label: 'AI-vurdering generert', value: coverage.withAiAnalysis },
              { key: 'website', label: 'Nettside funnet', value: coverage.withWebsite },
              { key: 'contacts', label: 'Kontakter hentet fra nettside', value: coverage.withWebsiteContacts },
              { key: 'ceo', label: 'Daglig leder (Brreg)', value: coverage.withCeo },
              { key: 'board', label: 'Styre (Brreg)', value: coverage.withBoard },
              { key: 'email', label: 'Firma-e-post (Brreg)', value: coverage.withEmail },
              { key: 'news', label: 'Nyheter funnet (siste 12 mnd)', value: coverage.withNews },
            ] as const;
            const selectedLabel = rows.find((r) => r.key === category)?.label;

            return (
              <>
                <div className="box box-pad" style={{ flexShrink: 0, gap: 14 }}>
                  <span className="box-title">Hvor oppdatert er dataene</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 18 }}>
                    <FreshnessTile label="Brreg sjekket" value={freshness.brregWeek} total={freshness.total} hint="siste 7 dager" />
                    <FreshnessTile label="Brreg sjekket" value={freshness.brregMonth} total={freshness.total} hint="siste 30 dager" />
                    <FreshnessTile label="AI-vurdert" value={freshness.aiMonth} total={freshness.total} hint="siste 30 dager" />
                    <FreshnessTile
                      label="Aldri AI-vurdert"
                      value={freshness.aiNever}
                      total={freshness.total}
                      hint="står i AI-køen, høyest score først"
                    />
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 4 }}>Hvor mye vet vi</p>
                  <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 14 }}>
                    Om de {coverage.total} selskapene — klikk «Har» eller «Mangler» på en kategori for å se hvem
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                    {rows.map((row) => {
                      const pct = coverage.total > 0 ? Math.round((row.value / coverage.total) * 100) : 0;
                      const missing = coverage.total - row.value;
                      const cardActive = category === row.key;
                      return (
                        <div
                          key={row.key}
                          className="box box-pad"
                          style={{ gap: 8, borderColor: cardActive ? 'var(--accent-border)' : undefined, background: cardActive ? 'var(--accent-soft)' : undefined }}
                        >
                          <span className="num" style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1, color: pct >= 50 ? 'var(--positive)' : 'var(--text-muted)' }}>
                            {pct} %
                          </span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{row.label}</span>
                          <div className="meter">
                            <span style={{ width: `${pct}%` }} />
                          </div>
                          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                            <Link
                              href={cardActive && mode === 'har' ? '/admin?view=datakvalitet' : `/admin?view=datakvalitet&kategori=${row.key}&modus=har`}
                              className={`coverage-link${cardActive && mode === 'har' ? ' active' : ''}`}
                            >
                              Har ({row.value})
                            </Link>
                            <Link
                              href={cardActive && mode === 'mangler' ? '/admin?view=datakvalitet' : `/admin?view=datakvalitet&kategori=${row.key}&modus=mangler`}
                              className={`coverage-link${cardActive && mode === 'mangler' ? ' active' : ''}`}
                            >
                              Mangler ({missing})
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {category && categoryCompanies && (
                  <div className="box" style={{ flex: 1, minHeight: 0 }}>
                    <div className="box-header">
                      <span className="box-title">
                        {categoryCompanies.length} selskaper {mode === 'har' ? 'har' : 'mangler'} — {selectedLabel}
                      </span>
                      <Link href="/admin?view=datakvalitet" className="muted" style={{ fontSize: '0.78rem' }}>✕ lukk</Link>
                    </div>
                    <div className="box-scroll">
                      {categoryCompanies.length === 0 ? (
                        <p className="muted box-pad" style={{ fontSize: '0.82rem' }}>Ingen selskaper i denne kategorien.</p>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '4px 16px', padding: '12px 20px' }}>
                          {categoryCompanies.map((co) => (
                            <Link key={co.orgnr} href={`/company/${co.orgnr}`} className="link-accent" style={{ fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {co.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : view === 'verktoy' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18, alignItems: 'start' }}>
          <div className="box">
            <div className="box-header">
              <span className="box-title">Legg til selskap manuelt</span>
              <span className="muted" style={{ fontSize: '0.72rem' }}>for selskaper utenfor skannet</span>
            </div>
            <div className="box-pad">
              <AddCompanyForm />
            </div>
          </div>
          <div className="box">
            <div className="box-header">
              <span className="box-title">Gjestelenke</span>
              <span className="muted" style={{ fontSize: '0.72rem' }}>lesetilgang uten passord</span>
            </div>
            <div className="box-pad">
              <GuestLinkPanel />
            </div>
          </div>
        </div>
      ) : view === 'logg' ? (
        <div className="box" style={{ flex: 1, minHeight: 0 }}>
          <div className="box-header">
            <span className="box-title">Logg</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {PERIODS.map((p) => (
                <Link
                  key={p.key}
                  href={`/admin?view=logg&periode=${p.key}`}
                  className={`btn btn-ghost btn-sm${p.key === period.key ? ' active' : ''}`}
                >
                  {p.label}
                </Link>
              ))}
              <span className="muted" style={{ marginLeft: 8 }}>{auditRows.length} hendelser</span>
            </div>
          </div>
          <div className="box-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Når</th>
                  <th>Aktør</th>
                  <th>Handling</th>
                  <th>Detalj</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((a) => (
                  <tr key={a.id}>
                    <td className="num muted" style={{ whiteSpace: 'nowrap' }}>
                      {dateLabel(a.at)} {new Date(a.at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' })}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{a.actor ?? '—'}</td>
                    <td>
                      <span className="cat" data-cat={a.action.startsWith('login.fail') || a.action.includes('rate_limited') ? 'financial' : undefined}>
                        {a.action}
                      </span>
                    </td>
                    <td className="muted">{a.detail ?? a.target ?? ''}</td>
                    <td className="num muted" style={{ whiteSpace: 'nowrap' }}>{a.ip ?? '—'}</td>
                  </tr>
                ))}
                {auditRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 24 }}>Ingen hendelser i perioden.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <ScanPanel
          scans={scans}
          activeCount={activeCount}
          selectedScanId={selectedScanId}
          aiRemaining={aiRemaining}
          brregStale={brregStale}
          aiEnabled={!!process.env.GEMINI_API_KEY}
        />
      )}
    </div>
  );
}
