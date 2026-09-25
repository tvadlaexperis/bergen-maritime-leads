import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  getCompanyByOrgnr,
  getCompany,
  listFinancials,
  getScoreHistory,
  listSiblingCompanies,
  listWebsiteContacts,
  listCompanyNews,
} from '@/lib/db';
import { NEWS_CATEGORY_LABEL, type NewsCategory } from '@/lib/companyNews';
import { getCurrentUser } from '@/lib/auth';
import {
  isValidOrgnr,
  proffUrl,
  brregUrl,
  linkedinCompanyName,
  linkedinCompanyUrl,
  linkedinPeopleUrl,
  linkedinRoleSearchUrl,
} from '@/lib/brreg';
import { getCompanyNews } from '@/lib/news';
import { fmtNok, fmtPct, fmtInt, dateLabel } from '@/app/format';
import { bandFor } from '@/app/components/ScoreBadge';
import type { LeadAnalysis, ScoreVerdict, SignalLevel } from '@/lib/orchestrator/providers/ai';
import AdminControls from './AdminControls';
import { AdminPanelProvider, AdminPanelToggle, AdminPanelModal } from './AdminPanel';
import AutoRefreshTrigger from './AutoRefreshTrigger';
import ContactsEditForm from './ContactsEditForm';
import FinancialsTabs from './FinancialsTabs';
import LeadScoreTabs from './LeadScoreTabs';
import NotesBox from './NotesBox';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { orgnr: string } }): Promise<Metadata> {
  const co = await getCompanyByOrgnr(params.orgnr);
  return { title: co ? co.name : 'Selskap' };
}

const SUBSCORES: { key: 'size_score' | 'revenue_score' | 'growth_score' | 'profitability_score'; label: string; weight: string }[] = [
  { key: 'size_score', label: 'Størrelse (ansatte)', weight: '35 %' },
  { key: 'revenue_score', label: 'Omsetning', weight: '30 %' },
  { key: 'growth_score', label: 'Omsetningsvekst', weight: '20 %' },
  { key: 'profitability_score', label: 'Lønnsomhet (driftsmargin)', weight: '15 %' },
];

function parseAnalysis(raw: string | null): LeadAnalysis | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LeadAnalysis;
  } catch {
    return null;
  }
}

// Confidence is computed here, not self-reported by the model — how much
// underlying documentation the analysis actually had to work with.
function confidenceFor(dataPoints: number): 'høy' | 'middels' | 'lav' {
  if (dataPoints >= 3) return 'høy';
  if (dataPoints >= 1) return 'middels';
  return 'lav';
}

export default async function CompanyPage({ params }: { params: { orgnr: string } }) {
  if (!isValidOrgnr(params.orgnr)) notFound();
  const co = await getCompanyByOrgnr(params.orgnr);
  if (!co) notFound();

  const base = await getCompany(co.id);
  const [financials, history, user, storedNews, siblings, allContacts] = await Promise.all([
    listFinancials(co.id),
    getScoreHistory(co.id, 12),
    getCurrentUser(),
    listCompanyNews(co.id, 6),
    co.parent_orgnr ? listSiblingCompanies(co.parent_orgnr, co.orgnr) : Promise.resolve([]),
    listWebsiteContacts(co.id),
  ]);
  // Stored news from the AI pass's web search; companies it hasn't searched
  // yet fall back to a live GDELT lookup (often empty — see lib/companyNews.ts).
  const news: { title: string; url: string; source: string; date: string | null; summary: string | null; category: string | null }[] =
    co.news_checked_at != null
      ? storedNews.map((n) => ({
          title: n.title,
          url: n.url,
          source: n.source ?? '',
          date: n.published_at,
          summary: n.summary,
          category: n.category,
        }))
      : (await getCompanyNews(co.name)).map((n) => ({
          title: n.title,
          url: n.url,
          source: n.domain,
          date: n.seenAt,
          summary: null,
          category: null,
        }));
  const websiteContacts = allContacts.filter((c) => c.source !== 'brreg');
  const boardContacts = allContacts.filter((c) => c.source === 'brreg');
  const liName = linkedinCompanyName(co.name);
  const isAdmin = user?.role === 'admin';
  const band = bandFor(co.lead_score);
  const analysis = parseAnalysis(co.ai_analysis);
  const aiConfidence = confidenceFor(
    (financials.length > 0 ? 1 : 0) +
      (news.length > 0 ? 1 : 0) +
      (co.employees != null ? 1 : 0) +
      (co.ceo_name || co.contact_name || co.cto_name || co.sales_name ? 1 : 0),
  );
  // Auto-refresh once for an admin viewing a company that's never been
  // analyzed, instead of making them wait for the nightly cron's rotating
  // batch to reach it. The staleness check stops this from re-firing on
  // every view of a company whose analysis keeps failing.
  const needsAutoRefresh =
    isAdmin && !co.ai_analysis && (!co.last_refreshed_at || Date.now() - co.last_refreshed_at > 60 * 60 * 1000);

  return (
    <AdminPanelProvider>
    <div className="page-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <Link href="/" className="muted" style={{ fontSize: '0.8rem' }}>
          ← Alle selskaper
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginTop: 6 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{co.name}</h1>
              {co.under_liquidation === 1 && <span className="liquidation-badge">Under avvikling</span>}
            </div>
            <p className="muted" style={{ fontSize: '0.82rem', marginTop: 6 }}>
              Org.nr {co.orgnr}
              {co.org_form ? ` · ${co.org_form}` : ''}
              {co.poststed ? ` · ${co.poststed}` : ''}
              {co.matched_group ? ` · ${co.matched_group}` : ''}
            </p>
            {co.parent_orgnr && (
              <p className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>
                Del av konsernet <span style={{ color: 'var(--text-primary)' }}>{co.parent_name ?? co.parent_orgnr}</span>
                {siblings.length > 0 && (
                  <>
                    {' '}· {siblings.length} {siblings.length === 1 ? 'annet selskap' : 'andre selskaper'} i denne oversikten:{' '}
                    {siblings.map((s, i) => (
                      <span key={s.orgnr}>
                        {i > 0 && ', '}
                        <Link href={`/company/${s.orgnr}`} className="link-accent">
                          {s.name}
                        </Link>
                      </span>
                    ))}
                  </>
                )}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
            <p style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {co.phone && (
                <a href={`tel:${co.phone.replace(/\s/g, '')}`} title={co.phone} className="link-accent" style={{ display: 'inline-flex' }}>
                  <PhoneIcon />
                </a>
              )}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  [co.address, co.postnummer, co.poststed].filter(Boolean).join(', '),
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                title={[co.address, co.postnummer, co.poststed].filter(Boolean).join(', ') || undefined}
                className="link-accent"
                style={{ display: 'inline-flex' }}
              >
                <PinIcon />
              </a>
              <span className="muted">|</span>
              <a href={proffUrl(co.orgnr)} target="_blank" rel="noopener noreferrer" className="link-accent">
                proff.no ↗
              </a>
              <a href={brregUrl(co.orgnr)} target="_blank" rel="noopener noreferrer" className="link-accent">
                Brønnøysund ↗
              </a>
              {co.website ? (
                <a href={co.website} target="_blank" rel="noopener noreferrer" className="link-accent">
                  Nettsted ↗
                </a>
              ) : (
                <span className="muted" title="Ikke registrert i Brønnøysund">
                  Nettsted ↗
                </span>
              )}
            </p>
            {co.ceo_name && (
              <span className="muted" style={{ fontSize: '0.82rem' }}>
                Daglig leder: <span style={{ color: 'var(--text-primary)' }}>{co.ceo_name}</span>
                {co.ceo_changed_at != null && (
                  <span className="ceo-changed-badge" title={`Byttet daglig leder ${dateLabel(co.ceo_changed_at)}`}>
                    Ny ledelse
                  </span>
                )}
              </span>
            )}
            {isAdmin && <AdminPanelToggle />}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 10 }}>
          <Fact label="Ansatte" value={fmtInt(co.employees)} />
          <Fact label="Omsetning (siste)" value={fmtNok(co.revenue_latest, { compact: true })} />
          <Fact label="Vekst å/å" value={co.revenue_growth_pct != null ? fmtPct(co.revenue_growth_pct, 0) : '—'} />
          <Fact label="Driftsmargin" value={co.operating_margin_pct != null ? fmtPct(co.operating_margin_pct, 0) : '—'} />
          <Fact label="Registrert" value={dateLabel(co.registered_at)} />
          <Fact label="Siste årsregnskap" value={co.last_annual_report ?? '—'} />
        </div>
      </div>

      {analysis?.conclusion && (
        <p className="ai-conclusion">
          <AiConfidenceBadge confidence={aiConfidence} generatedAt={co.ai_analysis_at} /> {analysis.conclusion}
        </p>
      )}
      {needsAutoRefresh && <AutoRefreshTrigger orgnr={co.orgnr} />}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, alignItems: 'stretch' }}>
        {/* Score panel */}
        <div className="box">
          <LeadScoreTabs
            tabs={[
              {
                key: 'why',
                label: 'Hvorfor aktuell',
                content: analysis ? (
                  <WhyRelevantTab analysis={analysis} />
                ) : (
                  <p className="muted" style={{ fontSize: '0.86rem' }}>
                    Ingen AI-vurdering ennå. {isAdmin ? 'Bruk «Oppdater fra registrene» under.' : 'Neste skann beregner en.'}
                  </p>
                ),
              },
              {
                key: 'score',
                label: 'Score',
                content:
                  co.lead_score != null ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span className="num" data-band={band} style={{ fontSize: '2.4rem', fontWeight: 800, lineHeight: 1 }}>
                          {co.lead_score}
                        </span>
                        <span className="muted" style={{ fontSize: '0.8rem' }}>
                          / 100
                          <br />
                          {band === 'high' ? 'prioritert lead' : band === 'mid' ? 'verdt en vurdering' : 'lav prioritet'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gap: 8 }}>
                        {SUBSCORES.map((s) => {
                          const v = co[s.key] ?? 0;
                          return (
                            <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'center' }}>
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                {s.label} <span className="muted">{s.weight}</span>
                              </span>
                              <span className="num muted" style={{ fontSize: '0.76rem', textAlign: 'right' }}>{v}</span>
                              <span className="meter" style={{ gridColumn: '1 / -1' }}>
                                <span style={{ width: `${v}%` }} />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {co.reason && <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>{co.reason}</p>}
                      {history.length > 1 && (
                        <p className="muted" style={{ fontSize: '0.72rem' }}>
                          Historikk: {history.slice().reverse().map((h) => h.lead_score).join(' → ')}
                        </p>
                      )}
                      {analysis && analysis.scoreFactors.length > 0 && (
                        <div style={{ marginTop: 4, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                          <span className="muted" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                            Andre faktorer (AI-vurdert)
                          </span>
                          <ScoreFactorList factors={analysis.scoreFactors} />
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="muted">
                      Ingen score ennå. {isAdmin ? 'Bruk «Oppdater fra registrene» under.' : 'Neste skann beregner en.'}
                    </p>
                  ),
              },
              {
                key: 'buying',
                label: 'Kjøpsmodus',
                content: analysis ? (
                  <BuyingSignalTab analysis={analysis} />
                ) : (
                  <p className="muted" style={{ fontSize: '0.86rem' }}>
                    Ingen AI-vurdering ennå. {isAdmin ? 'Bruk «Oppdater fra registrene» under.' : 'Neste skann beregner en.'}
                  </p>
                ),
              },
              {
                key: 'entry',
                label: 'Tilrådd inngang',
                content: analysis ? (
                  <EntryTab analysis={analysis} />
                ) : (
                  <p className="muted" style={{ fontSize: '0.86rem' }}>
                    Ingen AI-vurdering ennå. {isAdmin ? 'Bruk «Oppdater fra registrene» under.' : 'Neste skann beregner en.'}
                  </p>
                ),
              },
            ]}
          />
        </div>

        {/* Contacts */}
        <div className="box">
          <div className="box-header">
            <span className="box-title">Kontakter</span>
            <span className="muted" style={{ fontSize: '0.72rem' }}>
              {[boardContacts.length || co.ceo_name ? 'Brreg' : null, websiteContacts.length ? 'nettside' : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          <div style={{ overflow: 'auto', maxHeight: 320 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Rolle</th>
                  <th>Navn</th>
                  <th>E-post</th>
                  <th>Telefon</th>
                </tr>
              </thead>
              <tbody>
                {co.ceo_name && <ContactRow label="Daglig leder" name={co.ceo_name} company={liName} source="brreg" />}
                {(co.phone || co.email) && <ContactRow label="Sentralbord" name={null} email={co.email} phone={co.phone} />}
                <ContactRow label="Kontaktperson" name={co.contact_name} email={co.contact_email} phone={co.contact_phone} company={liName} />
                <ContactRow label="CTO" name={co.cto_name} email={co.cto_email} phone={co.cto_phone} company={liName} />
                <ContactRow label="Salgssjef" name={co.sales_name} email={co.sales_email} phone={co.sales_phone} company={liName} />
                {websiteContacts.map((wc) => (
                  <ContactRow key={wc.id} label={wc.role ?? 'Ansatt'} name={wc.name} email={wc.email} phone={wc.phone} company={liName} source="nettside" />
                ))}
                {boardContacts
                  .filter((b) => b.name !== co.ceo_name)
                  .map((b) => (
                    <ContactRow key={b.id} label={b.role ?? 'Styremedlem'} name={b.name} company={liName} source="brreg" />
                  ))}
              </tbody>
            </table>
          </div>
          {!co.contact_name && !co.cto_name && !co.sales_name && websiteContacts.length === 0 && (
            <div className="box-pad muted" style={{ paddingTop: 0, fontSize: '0.82rem' }}>
              Ingen navngitte kontakter utover ledelse/styre ennå.{isAdmin ? ' Legg inn under.' : ''}
            </div>
          )}
          {/* Search links only — LinkedIn has no open API for people data and
              forbids scraping, so the salesperson does the lookup in their own
              logged-in LinkedIn / Sales Navigator session. */}
          <div className="box-pad" style={{ paddingTop: 0, fontSize: '0.78rem', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span className="muted">Finn på LinkedIn:</span>
            <a href={linkedinCompanyUrl(co.name)} target="_blank" rel="noopener noreferrer" className="link-accent">
              Selskapet ↗
            </a>
            <a
              href={linkedinRoleSearchUrl(co.name, ['IT', 'CTO', 'CIO', 'IT-sjef', 'IT-leder', 'digitalisering', 'teknologi'])}
              target="_blank"
              rel="noopener noreferrer"
              className="link-accent"
            >
              IT-/teknologiledere ↗
            </a>
            <a
              href={linkedinRoleSearchUrl(co.name, ['HR', 'rekruttering', 'personal', 'talent'])}
              target="_blank"
              rel="noopener noreferrer"
              className="link-accent"
            >
              HR/rekruttering ↗
            </a>
            <a href={linkedinPeopleUrl(`"${liName}"`)} target="_blank" rel="noopener noreferrer" className="link-accent">
              Alle ansatte ↗
            </a>
          </div>
          {isAdmin && base && (
            <ContactsEditForm
              id={base.id}
              contacts={{
                contact_name: base.contact_name,
                contact_email: base.contact_email,
                contact_phone: base.contact_phone,
                cto_name: base.cto_name,
                cto_email: base.cto_email,
                cto_phone: base.cto_phone,
                sales_name: base.sales_name,
                sales_email: base.sales_email,
                sales_phone: base.sales_phone,
              }}
            />
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, alignItems: 'start' }}>
        {/* Financial history */}
        <div className="box">
          <FinancialsTabs financials={financials} />
        </div>

        {/* News + Notater, stacked in the right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="box">
            <div className="box-header">
              <span className="box-title">Nyheter</span>
              <span className="muted" style={{ fontSize: '0.72rem' }}>
                {co.news_checked_at != null ? `nettsøk · sjekket ${dateLabel(co.news_checked_at)}` : 'GDELT'}
              </span>
            </div>
            <div className="box-pad">
              {news.length === 0 ? (
                <p className="muted" style={{ fontSize: '0.85rem' }}>
                  {co.news_checked_at != null ? 'Ingen nyheter funnet siste 12 måneder.' : 'Ingen nyhetstreff siste tiden.'}
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                  {news.map((n) => (
                    <a key={n.url} href={n.url} target="_blank" rel="noopener noreferrer" className="news-card">
                      {n.category && n.category !== 'annet' && (
                        <span className="news-card-tag">{NEWS_CATEGORY_LABEL[n.category as NewsCategory] ?? n.category}</span>
                      )}
                      <span className="news-card-title">{n.title}</span>
                      {n.summary && <span className="news-card-summary">{n.summary}</span>}
                      <span className="muted" style={{ fontSize: '0.72rem' }}>
                        {n.source}
                        {n.date ? ` · ${dateLabel(n.date)}` : ''}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          {isAdmin && base && <NotesBox notes={base.notes ?? ''} />}
        </div>
      </div>

      {isAdmin && base && (
        <AdminPanelModal>
          <AdminControls
            id={base.id}
            orgnr={base.orgnr}
            name={base.name}
            status={base.status}
            website={base.website}
            notes={base.notes ?? ''}
          />
        </AdminPanelModal>
      )}
    </div>
    </AdminPanelProvider>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.5" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.36 2.3.56 3.5.56a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.6 21 3 13.4 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.2.2 2.4.56 3.5a1 1 0 0 1-.25 1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Small "AI-tolkning · sikkerhet: X · sist generert ..." byline — satisfies
// the requirement that AI-derived claims are visibly distinguished from
// documented facts and carry a confidence grade + a check-date.
function AiConfidenceBadge({ confidence, generatedAt }: { confidence: 'høy' | 'middels' | 'lav'; generatedAt: number | null }) {
  return (
    <span
      className="muted"
      style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', verticalAlign: 'middle' }}
      title={generatedAt ? `AI-tolkning (Gemini) — sist generert ${dateLabel(generatedAt)}` : 'AI-tolkning (Gemini)'}
    >
      AI · sikkerhet {confidence}
    </span>
  );
}

function verdictColor(v: ScoreVerdict): string {
  if (v === 'positiv') return 'var(--positive)';
  if (v === 'negativ') return 'var(--negative)';
  return 'var(--text-muted)';
}

function ScoreFactorList({ factors }: { factors: LeadAnalysis['scoreFactors'] }) {
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
      {factors.map((f, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: verdictColor(f.verdict), flexShrink: 0, marginTop: 4 }} />
          <span style={{ fontSize: '0.84rem' }}>
            <strong style={{ fontWeight: 600 }}>{f.factor}:</strong>{' '}
            <span style={{ color: 'var(--text-secondary)' }}>{f.note}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function WhyRelevantTab({ analysis }: { analysis: LeadAnalysis }) {
  return (
    <div style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
      <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{analysis.conclusion}</p>
      {analysis.scoreFactors.length > 0 && <ScoreFactorList factors={analysis.scoreFactors} />}
    </div>
  );
}

function signalLevelColor(level: SignalLevel): string {
  if (level === 'høy') return 'var(--positive)';
  if (level === 'middels') return 'var(--accent)';
  return 'var(--text-muted)';
}

function BuyingSignalTab({ analysis }: { analysis: LeadAnalysis }) {
  const { buyingSignal } = analysis;
  return (
    <div style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: '0.76rem',
          fontWeight: 700,
          color: signalLevelColor(buyingSignal.level),
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: signalLevelColor(buyingSignal.level) }} />
        Kjøpssignal: {buyingSignal.level}
      </span>
      <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)' }}>{buyingSignal.explanation}</p>
      {buyingSignal.signals.length > 0 && (
        <ul style={{ margin: '10px 0 0', paddingLeft: '1.2em', listStyleType: 'disc' }}>
          {buyingSignal.signals.map((s, i) => (
            <li key={i} style={{ marginTop: i === 0 ? 0 : 6 }}>
              {s.text} <span className="muted" style={{ fontSize: '0.76rem' }}>({s.source})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EntryTab({ analysis }: { analysis: LeadAnalysis }) {
  return (
    <div style={{ fontSize: '0.9rem', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <span className="muted" style={{ fontSize: '0.72rem', fontWeight: 700 }}>Kontakt</span>
        <p style={{ margin: '2px 0 0' }}>
          {analysis.recommendedContact.name ? (
            <strong>{analysis.recommendedContact.name}</strong>
          ) : (
            <span className="muted">Ingen registrert kontakt</span>
          )}
        </p>
        <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>{analysis.recommendedContact.reason}</p>
      </div>

      <div>
        <span className="muted" style={{ fontSize: '0.72rem', fontWeight: 700 }}>Pitch</span>
        <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)' }}>{analysis.pitch}</p>
      </div>

      {analysis.icebreaker && (
        <div>
          <span className="muted" style={{ fontSize: '0.72rem', fontWeight: 700 }}>Icebreaker</span>
          <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)' }}>{analysis.icebreaker}</p>
        </div>
      )}

      {analysis.questions.length > 0 && (
        <div>
          <span className="muted" style={{ fontSize: '0.72rem', fontWeight: 700 }}>Spørsmål å stille</span>
          <ul style={{ margin: '6px 0 0', paddingLeft: '1.2em', listStyleType: 'disc' }}>
            {analysis.questions.map((q, i) => (
              <li key={i} style={{ marginTop: i === 0 ? 0 : 4 }}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {analysis.avoidClaiming.length > 0 && (
        <div>
          <span className="muted" style={{ fontSize: '0.72rem', fontWeight: 700 }}>Ikke påstå uten bekreftelse</span>
          <ul style={{ margin: '6px 0 0', paddingLeft: '1.2em', listStyleType: 'disc', color: 'var(--text-secondary)' }}>
            {analysis.avoidClaiming.map((a, i) => (
              <li key={i} style={{ marginTop: i === 0 ? 0 : 4 }}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="muted" style={{ fontSize: '0.72rem' }}>{label}</span>
      <span style={{ fontSize: '0.9rem' }}>{value}</span>
    </div>
  );
}

function ContactRow({
  label,
  name,
  email,
  phone,
  company,
  source,
}: {
  label: string;
  name: string | null;
  email?: string | null;
  phone?: string | null;
  /** LinkedIn-friendly company name — adds a person search link next to a named contact. */
  company?: string;
  /** Where a machine-sourced row came from; omitted for admin-entered contacts. */
  source?: 'nettside' | 'brreg';
}) {
  return (
    <tr>
      <td className="muted">
        {label}
        {source && (
          <span
            className="muted"
            style={{ fontSize: '0.72rem' }}
            title={source === 'nettside' ? 'Hentet fra selskapets egen nettside' : 'Fra Brønnøysundregistrene'}
          >
            {' '}· {source === 'nettside' ? 'nettside' : 'Brreg'}
          </span>
        )}
      </td>
      <td>
        {name ?? <span className="muted">—</span>}
        {name && company && (
          <a
            href={linkedinPeopleUrl(`${name} ${company}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-accent"
            title={`Søk etter ${name} på LinkedIn`}
            style={{ marginLeft: 6, fontSize: '0.7rem', fontWeight: 700 }}
          >
            in
          </a>
        )}
      </td>
      <td>{email ? <a href={`mailto:${email}`} className="link-accent">{email}</a> : <span className="muted">—</span>}</td>
      <td>{phone ? <a href={`tel:${phone.replace(/\s/g, '')}`} className="link-accent">{phone}</a> : <span className="muted">—</span>}</td>
    </tr>
  );
}
