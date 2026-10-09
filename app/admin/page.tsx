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
  isCoverageUnit,
  type CoverageUnit,
  type CoverageCategory,
  type CoverageMode,
  listScans,
  listAudit,
  countAiPending,
  countBrregStale,
  parseTopN,
  TOP_CHOICES,
  AI_TOP_N,
  listUsers,
} from '@/lib/db';
import { dateLabel, osloDayStart } from '@/app/format';
import ScanPanel from './ScanPanel';
import RunControls from './RunControls';
import { aiConfigured, aiServiceLabel } from '@/lib/orchestrator/providers/ai';
import GuestLinkPanel from './GuestLinkPanel';
import UsersPanel from './UsersPanel';
import BackArrow from '@/app/components/BackArrow';

export const dynamic = 'force-dynamic';
// Matches the cron route's budget (app/api/cron/scan/route.ts) — without
// this, the "Kjør skann" button's Server Action would inherit Vercel's much
// shorter default function duration and get killed well before runScan()'s
// own 45s enrichment deadline ever kicks in.
export const maxDuration = 60;
export const metadata: Metadata = { title: 'Admin' };

type View = 'oppdatering' | 'logg' | 'nattlig' | 'gjest' | 'brukere';

// Page-level tabs. Old `?view=skann|dekning` links (bookmarks, notifications)
// map onto their new homes.
const VIEWS: { key: View; label: string; href: string }[] = [
  { key: 'oppdatering', label: 'Datakvalitet', href: '/admin' },
  { key: 'nattlig', label: 'Nattlige kjøringer', href: '/admin?view=nattlig' },
  { key: 'brukere', label: 'Brukere', href: '/admin?view=brukere' },
  { key: 'gjest', label: 'Gjestelenke', href: '/admin?view=gjest' },
  // Audit log (logins, manual actions) — rarely needed, so last.
  { key: 'logg', label: 'Logg', href: '/admin?view=logg' },
];

function parseView(raw: string | undefined): View {
  if (raw === 'logg' || raw === 'nattlig' || raw === 'gjest' || raw === 'brukere') return raw;
  // 'datakvalitet' / 'dekning' now live on the Oppdatering tab.
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
  searchParams: { view?: string; kategori?: string; modus?: string; scan?: string; periode?: string; enhet?: string; topp?: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login?next=/admin');

  const view = parseView(searchParams.view);
  const category: CoverageCategory | null =
    view === 'oppdatering' && searchParams.kategori && isCoverageCategory(searchParams.kategori) ? searchParams.kategori : null;
  const period = PERIODS.find((p) => p.key === searchParams.periode) ?? PERIODS.find((p) => p.key === 'idag')!;
  const periodRange = period.range();
  const mode: CoverageMode = searchParams.modus && isCoverageMode(searchParams.modus) ? searchParams.modus : 'har';
  const unit: CoverageUnit = searchParams.enhet && isCoverageUnit(searchParams.enhet) ? searchParams.enhet : 'kunde';
  const topN = parseTopN(searchParams.topp);
  // Keeps the chosen unit and «Topp N» filter when drilling into a category or closing it.
  const qs = (u: CoverageUnit, t: typeof topN) =>
    [u === 'selskap' ? 'enhet=selskap' : '', t === AI_TOP_N ? '' : `topp=${t ?? 'alle'}`].filter(Boolean).join('&');
  const dq = (extra = '') => `/admin?${qs(unit, topN)}${extra}`;
  const topLinks = [null, ...TOP_CHOICES].map((t) => ({
    label: t ? String(t) : 'Alle',
    href: `/admin?${qs(unit, t)}`,
    active: t === topN,
  }));

  const [activeCount, scans, auditRows, coverage, categoryCompanies, aiRemaining, brregStale] = await Promise.all([
    countActiveCompanies(),
    listScans(15, view === 'nattlig' ? 'nattlig' : 'manuell'),
    listAudit(periodRange ? 1000 : 200, periodRange ?? undefined),
    getDataCoverage(unit, topN),
    category ? listCompaniesForCoverage(category, mode, unit, topN) : Promise.resolve(null),
    countAiPending(topN),
    countBrregStale(),
  ]);
  // The run shown; the latest when none is picked.
  const selectedScanId = Number(searchParams.scan) || scans[0]?.id || null;

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
      {view === 'oppdatering' ? (
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
                <RunControls
                  aiEnabled={aiConfigured()}
                  aiService={aiServiceLabel()}
                  aiRemaining={aiRemaining}
                  brregStale={brregStale}
                  topN={topN}
                  topLinks={topLinks}
                />
                <div style={{ flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div>
                      <p style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 4 }}>Totalt – hvor mye vet vi</p>
                      <p className="muted" style={{ fontSize: '0.8rem' }}>
                        {unit === 'kunde'
                          ? `Om de ${coverage.total} kundene${topN ? ` i topp ${topN}` : ''} — et konsern telles én gang og «har» noe hvis ett av selskapene har det.`
                          : `Om ${topN ? `de ${coverage.total} selskapene i topp ${topN}-kundene` : `alle ${coverage.total} selskapene`}, hvert for seg — også datterselskaper og skallselskaper.`}{' '}
                        Klikk «Har» eller «Mangler» for å se hvem.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span className="muted" style={{ fontSize: '0.78rem' }}>Tell per</span>
                      <Link href={`/admin?${qs('kunde', topN)}`} className={`chip${unit === 'kunde' ? ' active' : ''}`}>
                        kunde (konsern samlet)
                      </Link>
                      <Link href={`/admin?${qs('selskap', topN)}`} className={`chip${unit === 'selskap' ? ' active' : ''}`}>
                        selskap
                      </Link>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                    {rows.map((row) => {
                      const pct = coverage.total > 0 ? Math.round((row.value / coverage.total) * 100) : 0;
                      const missing = coverage.total - row.value;
                      const cardActive = category === row.key;
                      return (
                        <div
                          key={row.key}
                          className="box box-pad"
                          style={{ gap: 6, padding: '10px 12px', borderColor: cardActive ? 'var(--accent-border)' : undefined, background: cardActive ? 'var(--accent-soft)' : undefined }}
                        >
                          <span className="num" style={{ fontSize: '1.15rem', fontWeight: 800, lineHeight: 1, color: pct >= 50 ? 'var(--positive)' : 'var(--text-muted)' }}>
                            {pct} %
                          </span>
                          <span style={{ fontSize: '0.74rem', fontWeight: 600, lineHeight: 1.25 }}>{row.label}</span>
                          <div className="meter">
                            <span style={{ width: `${pct}%` }} />
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: '0.72rem' }}>
                            <Link
                              href={cardActive && mode === 'har' ? dq() : dq(`&kategori=${row.key}&modus=har`)}
                              className={`coverage-link${cardActive && mode === 'har' ? ' active' : ''}`}
                            >
                              Har ({row.value})
                            </Link>
                            <Link
                              href={cardActive && mode === 'mangler' ? dq() : dq(`&kategori=${row.key}&modus=mangler`)}
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
                        {categoryCompanies.length} {unit === 'kunde' ? 'kunder' : 'selskaper'} {mode === 'har' ? 'har' : 'mangler'} — {selectedLabel}
                      </span>
                      <Link href={dq()} className="muted" style={{ fontSize: '0.78rem' }}>✕ lukk</Link>
                    </div>
                    <div className="box-scroll">
                      {categoryCompanies.length === 0 ? (
                        <p className="muted box-pad" style={{ fontSize: '0.82rem' }}>Ingen selskaper i denne kategorien.</p>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '4px 16px', padding: '12px 20px' }}>
                          {categoryCompanies.map((co) => (
                            <Link key={co.orgnr} href={`/company/${co.orgnr}`} className="link-accent" style={{ fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {co.name}
                              {co.groupSize > 1 && <span className="muted"> · konsern ({co.groupSize})</span>}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {!category && (
                  <ScanPanel
                    scans={scans}
                    activeCount={activeCount}
                    selectedScanId={selectedScanId}
                    aiRemaining={aiRemaining}
                    topN={topN}
                  />
                )}
              </>
            );
          })()}
        </div>
      ) : view === 'brukere' ? (
        <div className="page-scroll">
          <UsersPanel users={await listUsers()} me={Number(user.sub)} guestEmail={(process.env.GUEST_EMAIL ?? '').trim().toLowerCase()} />
        </div>
      ) : view === 'gjest' ? (
        <div style={{ maxWidth: 640 }}>
        {/* Login link for the guest account — a normal user, not admin. */}
        <div className="box" >
          <div className="box-header">
            <span className="box-title">Gjestelenke</span>
            <span className="muted" style={{ fontSize: '0.72rem' }}>innlogging uten passord · vanlig bruker, ikke admin</span>
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
          nightly={view === 'nattlig'}
        />
      )}
    </div>
  );
}
