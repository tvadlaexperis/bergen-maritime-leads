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
} from '@/lib/db';
import { agoLabel, dateLabel } from '@/app/format';
import { NACE_CODES, KOMMUNER } from '@/data/maritime-sectors.mjs';
import RunScanButton from './RunScanButton';
import AdminToolsMenu from './AdminToolsMenu';

export const dynamic = 'force-dynamic';
// Matches the cron route's budget (app/api/cron/scan/route.ts) — without
// this, the "Kjør skann" button's Server Action would inherit Vercel's much
// shorter default function duration and get killed well before runScan()'s
// own 45s enrichment deadline ever kicks in.
export const maxDuration = 60;
export const metadata: Metadata = { title: 'Admin' };

type View = 'skann' | 'logg' | 'dekning';

// Which of the full-width panels shows below the header — a query param
// rather than client state, so the toggle is a plain link and the page stays
// a Server Component (no new client wrapper needed just to switch panels).
export default async function AdminPage({
  searchParams,
}: {
  searchParams: { view?: string; kategori?: string; modus?: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login?next=/admin');

  const view: View = searchParams.view === 'logg' ? 'logg' : searchParams.view === 'dekning' ? 'dekning' : 'skann';
  const category: CoverageCategory | null =
    view === 'dekning' && searchParams.kategori && isCoverageCategory(searchParams.kategori) ? searchParams.kategori : null;
  const mode: CoverageMode = searchParams.modus && isCoverageMode(searchParams.modus) ? searchParams.modus : 'har';

  const [activeCount, scans, auditRows, coverage, categoryCompanies] = await Promise.all([
    countActiveCompanies(),
    listScans(12),
    listAudit(40),
    getDataCoverage(),
    category ? listCompaniesForCoverage(category, mode) : Promise.resolve(null),
  ]);

  return (
    <div className="page-fill" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Admin</h1>
          <Link href="/" className="link-accent" style={{ fontSize: '0.85rem' }}>← Tilbake til listen</Link>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <AdminToolsMenu />
          <div style={{ display: 'flex', gap: 6 }}>
            <Link href="/admin" className={`btn btn-ghost btn-sm${view === 'skann' ? ' active' : ''}`}>
              Skann
            </Link>
            <Link href="/admin?view=dekning" className={`btn btn-ghost btn-sm${view === 'dekning' ? ' active' : ''}`}>
              Datadekning
            </Link>
            <Link href="/admin?view=logg" className={`btn btn-ghost btn-sm${view === 'logg' ? ' active' : ''}`}>
              Logg
            </Link>
          </div>
        </div>
      </div>

      {/* Full width, full height — only one panel shows at a time rather than
          splitting the width permanently, since these are rarely needed
          side by side. */}
      {view === 'dekning' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
          {(() => {
            const rows = [
              { key: 'financials', label: 'Regnskap hentet (Brreg)', value: coverage.withFinancials },
              { key: 'growth', label: 'Vekst beregnbar (2+ regnskapsår)', value: coverage.withGrowth },
              { key: 'ai', label: 'AI-vurdering generert', value: coverage.withAiAnalysis },
              { key: 'website', label: 'Nettside funnet', value: coverage.withWebsite },
              { key: 'contacts', label: 'Kontakter hentet fra nettside', value: coverage.withWebsiteContacts },
              { key: 'ceo', label: 'Daglig leder (Brreg)', value: coverage.withCeo },
            ] as const;
            const selectedLabel = rows.find((r) => r.key === category)?.label;

            return (
              <>
                <div style={{ flexShrink: 0 }}>
                  <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 14 }}>
                    Hvor mye vet vi om de {coverage.total} selskapene — klikk «Har» eller «Mangler» på en kategori
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
                              href={cardActive && mode === 'har' ? '/admin?view=dekning' : `/admin?view=dekning&kategori=${row.key}&modus=har`}
                              className={`coverage-link${cardActive && mode === 'har' ? ' active' : ''}`}
                            >
                              Har ({row.value})
                            </Link>
                            <Link
                              href={cardActive && mode === 'mangler' ? '/admin?view=dekning' : `/admin?view=dekning&kategori=${row.key}&modus=mangler`}
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
                      <Link href="/admin?view=dekning" className="muted" style={{ fontSize: '0.78rem' }}>✕ lukk</Link>
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
      ) : view === 'logg' ? (
        <div className="box" style={{ flex: 1, minHeight: 0 }}>
          <div className="box-header">
            <span className="box-title">Logg</span>
            <span className="muted">innlogginger &amp; admin-handlinger</span>
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
                      {dateLabel(a.at)} {new Date(a.at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
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
                    <td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 24 }}>Ingen hendelser ennå.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="box" style={{ flex: 1, minHeight: 0 }}>
          <div className="box-header">
            <span className="box-title">Skann</span>
            <span className="muted">
              nattlig 05:00 UTC · {(KOMMUNER as { name: string }[]).map((k) => k.name).join(', ')} ·{' '}
              {(NACE_CODES as unknown[]).length} bransjekoder · {activeCount} selskaper
            </span>
          </div>
          <div className="box-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
            <RunScanButton />
            <p className="muted" style={{ fontSize: '0.72rem' }}>
              «Kjør skann» oppdaterer selskapslisten fra Enhetsregisteret og henter regnskap for en
              roterende bunt (inntil {process.env.SCAN_BATCH || 150} selskaper, prioritert etter hvem
              som trenger det mest). «Full oppdatering» bruker samme prioritering uten bunngrensen —
              begge er likevel begrenset av et 45-sekunders tidsbudsjett per kjøring, så det tar flere
              kjøringer å nå gjennom alle.
            </p>
          </div>
          <div className="box-header" style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <span className="box-title">Siste skann</span>
          </div>
          <div className="box-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Startet</th>
                  <th className="col-right">Funnet</th>
                  <th className="col-right">Oppdatert</th>
                  <th className="col-right">Regnskap</th>
                  <th className="col-right">Feil</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((s) => {
                  const errs = s.errors ? (JSON.parse(s.errors) as unknown[]).length : 0;
                  return (
                    <tr key={s.id}>
                      <td className="num">{agoLabel(s.started_at)}</td>
                      <td className="col-right num">{s.companies_found}</td>
                      <td className="col-right num">{s.companies_updated}</td>
                      <td className="col-right num">{s.financials_fetched}</td>
                      <td className="col-right num" style={{ color: errs ? 'var(--negative)' : undefined }}>{errs}</td>
                      <td className="muted">{s.finished_at ? 'ferdig' : 'kjører / avbrutt'}</td>
                    </tr>
                  );
                })}
                {scans.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                      Ingen skann ennå.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
