import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  getCompanyByOrgnr,
  getCompany,
  listFinancials,
  getScoreHistory,
  listGroupMembers,
  listWebsiteContacts,
  listCompanyNews,
  listJobAds,
  SEARCH_MIN_SCORE,
} from '@/lib/db';
import { NEWS_CATEGORY_LABEL, type NewsCategory } from '@/lib/companyNews';
import { describeGroupBasis, type GroupBasis } from '@/lib/groups';
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
import { fmtPct, fmtInt, dateLabel } from '@/app/format';
import { bandFor } from '@/app/components/ScoreBadge';
import type { LeadAnalysis, ScoreVerdict, SignalLevel, CompanyProfile } from '@/lib/orchestrator/providers/ai';
import BackArrow from '@/app/components/BackArrow';
import AdminControls from './AdminControls';
import MeetingTab from './MeetingTab';
import { AdminPanelProvider, AdminPanelToggle, AdminPanelModal } from './AdminPanel';
import AutoRefreshTrigger from './AutoRefreshTrigger';
import ContactsEditForm from './ContactsEditForm';
import BoxTabs from './BoxTabs';
import PageTabs from './PageTabs';
import GoToTab from './GoToTab';
import FinancialsTabs from './FinancialsTabs';
import NotesBox from './NotesBox';
import { industryChallengesFor } from '@/lib/industryChallenges';

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

const CATEGORY_LABEL: Record<string, string> = {
  'svært aktuell': 'Svært aktuell kunde',
  aktuell: 'Aktuell kunde',
  mulig: 'Mulig kunde – krever mer undersøkelse',
  'lite aktuell': 'Lite aktuell kunde',
  'ikke aktuell': 'Ikke aktuell kunde',
  konkurrent: 'Konkurrent eller leverandør',
};

interface TechInfo {
  technologies: { name: string; category: string; evidence: string; sourceUrl: string }[];
  itEnvironment?: { value: string; evidence: string | null };
  digitalProducts?: { value: string; evidence: string | null };
  profile?: CompanyProfile | null;
  checkedAt: number;
}

function parseTech(raw: string | null): TechInfo | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as TechInfo;
    return { ...t, technologies: t.technologies ?? [] };
  } catch {
    return null;
  }
}

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
  const [financials, history, user, storedNews, groupMembers, allContacts] = await Promise.all([
    listFinancials(co.id),
    getScoreHistory(co.id, 12),
    getCurrentUser(),
    listCompanyNews(co.id, 6),
    co.group_key ? listGroupMembers(co.group_key) : Promise.resolve([]),
    listWebsiteContacts(co.id),
  ]);
  // The rest of the group (lib/groups.ts): their website contacts and news
  // are shown here too — for a salesperson the group is one customer.
  const otherMembers = groupMembers.filter((m) => m.orgnr !== co.orgnr);
  const groupEmployeeTotal = groupMembers.some((m) => m.employees != null)
    ? groupMembers.reduce((sum, m) => sum + (m.employees ?? 0), 0)
    : null;
  const [groupContactLists, groupNewsLists] = await Promise.all([
    Promise.all(otherMembers.map((m) => listWebsiteContacts(m.id, 'nettside'))),
    Promise.all(otherMembers.map((m) => listCompanyNews(m.id, 6))),
  ]);
  const groupBasis = (() => {
    if (!co.group_basis) return null;
    try {
      return describeGroupBasis(JSON.parse(co.group_basis) as GroupBasis);
    } catch {
      return null;
    }
  })();

  // NAV job ads for the whole group (the ad is usually placed by one
  // workplace/company; for sales it's the group that's recruiting).
  const jobAds = await listJobAds([co.id, ...otherMembers.map((m) => m.id)]);
  const jobsEnabled = !!process.env.NAV_FEED_TOKEN || process.env.NAV_FEED_USE_PUBLIC_TOKEN === '1';
  const jobContacts = jobAds.flatMap((j) => {
    try {
      return (JSON.parse(j.contacts ?? '[]') as { name: string; title: string | null; email: string | null; phone: string | null }[]).map(
        (c) => ({ name: c.name, role: c.title, email: c.email, phone: c.phone }),
      );
    } catch {
      return [];
    }
  });

  const people = buildContactPeople({
    ceo: co.ceo_name ? { name: co.ceo_name, isNew: co.ceo_changed_at != null } : null,
    manual: [
      { label: 'Kontaktperson', name: co.contact_name, email: co.contact_email, phone: co.contact_phone },
      { label: 'CTO', name: co.cto_name, email: co.cto_email, phone: co.cto_phone },
      { label: 'Salgssjef', name: co.sales_name, email: co.sales_email, phone: co.sales_phone },
    ],
    website: allContacts.filter((c) => c.source !== 'brreg'),
    group: otherMembers.flatMap((m, i) => groupContactLists[i].map((c) => ({ ...c, via: linkedinCompanyName(m.name) }))),
    board: allContacts.filter((c) => c.source === 'brreg'),
    jobAds: jobContacts,
  });

  // Stored news from the AI pass's web search only. (A live GDELT lookup
  // used to fill in for companies not yet searched — it held the page for
  // up to 10 s under GDELT's ~1 req/5s limit, so it's gone.)
  const news: {
    title: string;
    url: string;
    source: string;
    date: string | null;
    summary: string | null;
    category: string | null;
    relevance?: string | null;
    isSignal?: boolean;
    question?: string | null;
  }[] =
    co.news_checked_at != null || otherMembers.length > 0
      ? [...storedNews, ...groupNewsLists.flat()]
          .filter((n, i, all) => all.findIndex((x) => x.url === n.url) === i)
          .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
          .slice(0, 8)
          .map((n) => ({
          title: n.title,
          url: n.url,
          source: n.source ?? '',
          date: n.published_at,
          summary: n.summary,
          category: n.category,
          relevance: n.relevance,
          isSignal: n.is_signal === 1,
          question: n.question,
        }))
      : [];
  const websiteContacts = allContacts.filter((c) => c.source !== 'brreg');
  const boardContacts = allContacts.filter((c) => c.source === 'brreg');
  const liName = linkedinCompanyName(co.name);
  const isAdmin = user?.role === 'admin';
  const band = bandFor(co.lead_score);
  const analysis = parseAnalysis(co.ai_analysis);
  const tech = parseTech(co.tech_json);
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

  const segmentChallenges = industryChallengesFor(co.matched_code);
  // Rendered twice (narrow: under Kontakter; wide: own column) — CSS shows one.
  const newsBox = (
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
            {co.news_checked_at != null ? 'Ingen nyheter funnet siste 12 måneder.' : (co.lead_score ?? 0) >= SEARCH_MIN_SCORE
                ? 'Nyheter hentes ved neste AI-kjøring.'
                : `Nyheter søkes bare for selskaper med lead-score ${SEARCH_MIN_SCORE}+ (websøk koster).`}
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
                {(n.relevance || n.question || n.isSignal) && (
                  // AI interpretation, kept visibly apart from the article's own facts.
                  <span className="news-card-ai">
                    <span className="news-card-ai-label">
                      AI-vurdering{n.isSignal && <span className="news-card-signal">Mulig kjøpssignal</span>}
                    </span>
                    {n.relevance && <span>For Experis: {n.relevance}</span>}
                    {n.question && <span>Spørsmål: «{n.question}»</span>}
                  </span>
                )}
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
  );

  return (
    <AdminPanelProvider>
    {/* The page itself doesn't scroll: the header and AI strip stay put and
        each column below scrolls on its own (.split-scroll). */}
    <div className="page-fill" style={{ gap: 18 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <BackArrow href="/" label="Tilbake til alle selskaper" />
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{co.name}</h1>
              {co.lead_score != null && (
                <span className="score-badge score-badge-lg" data-band={band} title="Lead-score — se «Hvorfor aktuell»">
                  <span className="num">{co.lead_score}</span>
                  <span className="score-badge-lg-label">
                    / 100 · {band === 'high' ? 'prioritert lead' : band === 'mid' ? 'verdt en vurdering' : 'lav prioritet'}
                  </span>
                </span>
              )}
              {co.under_liquidation === 1 && <span className="liquidation-badge">Under avvikling</span>}
            </div>
            <p className="muted" style={{ fontSize: '0.82rem', marginTop: 6 }}>
              Org.nr {co.orgnr}
              {co.org_form ? ` · ${co.org_form}` : ''}
              {co.poststed ? ` · ${co.poststed}` : ''}
              {co.matched_group ? ` · ${co.matched_group}` : ''}
            </p>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className="muted" style={{ fontSize: '0.82rem', display: 'inline-flex', gap: 14, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {co.ceo_name && (
                  <span>
                    Daglig leder: <span style={{ color: 'var(--text-primary)' }}>{co.ceo_name}</span>
                    {co.ceo_changed_at != null && (
                      <span className="ceo-changed-badge" title={`Byttet daglig leder ${dateLabel(co.ceo_changed_at)}`}>
                        Ny ledelse
                      </span>
                    )}
                  </span>
                )}
                <span>
                  Ansatte: <span style={{ color: 'var(--text-primary)' }}>{fmtInt(co.employees)}</span>
                {groupMembers.length > 1 && groupEmployeeTotal != null && groupEmployeeTotal !== co.employees && (
                  <span title="Registrerte ansatte summert over selskapene i konsernet (Brønnøysund)">
                    {' '}
                    ({fmtInt(groupEmployeeTotal)} i konsernet)
                  </span>
                )}
                </span>
              </span>
              {isAdmin && <AdminPanelToggle />}
            </div>
          </div>
        </div>
      </div>

      {needsAutoRefresh && <AutoRefreshTrigger orgnr={co.orgnr} />}

      {/* Two columns all the way down: the sales analysis on the left,
          the facts (people, news, numbers, notes) on the right. */}
      {/* Page tabs: Salg (who to call and why), Om selskapet (facts),
          Møter (meeting + notes). Each tab keeps the two scroll columns. */}
      <PageTabs
        tabs={[
          {
            key: 'sales',
            label: 'Salg',
            content: (
      <div className="split-scroll">
        <div className="split-scroll-col">
          {/* Tilrådd inngang — the salesperson's first question ("who do I call,
              and what do I say"), so it leads the wide column with an accent
              edge. Kjøpsmodus is a tab here: it's the same "should I call now?"
              question. */}
          <div className="box box-featured">
            <BoxTabs
              title="Tilrådd inngang"
              intro={
                analysis?.conclusion && (
                  <p className="ai-conclusion">
                    <AiConfidenceBadge confidence={aiConfidence} generatedAt={co.ai_analysis_at} /> {analysis.conclusion}
                  </p>
                )
              }
              tabs={[
                {
                  key: 'entry',
                  label: 'Hvem og hva',
                  content: analysis ? (
                    <EntryTab analysis={analysis} liCompany={liName} />
                  ) : (
                    <p className="muted" style={{ fontSize: '0.86rem' }}>
                      Ingen AI-vurdering ennå. {isAdmin ? 'Bruk «Oppdater fra registrene» under.' : 'Neste skann beregner en.'}
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
              ]}
            />
          </div>

        </div>
        <div className="split-scroll-col">
          {/* Contacts — one card per person, all sources merged (the same
              person often appears as daglig leder in Brreg AND on the
              website). Cards, not a table: the column is too narrow for
              four columns of names, e-mails and phone numbers. */}
          <div className="box">
            <div className="box-header">
              <span className="box-title">Kontakter</span>
              <span className="muted" style={{ fontSize: '0.72rem' }}>
                {people.length} {people.length === 1 ? 'person' : 'personer'}
              </span>
            </div>
            {(co.phone || co.email) && (
              <div className="contact-switchboard">
                <span className="muted">Sentralbord</span>
                {co.phone && (
                  <a href={`tel:${co.phone.replace(/\s/g, '')}`} className="link-accent">
                    {co.phone}
                  </a>
                )}
                {co.email && (
                  <a href={`mailto:${co.email}`} className="link-accent">
                    {co.email}
                  </a>
                )}
              </div>
            )}
            <div className="contact-list">
              {people.slice(0, 6).map((p) => (
                <PersonCard key={p.key} person={p} company={liName} />
              ))}
              {people.length > 6 && (
                <details className="contact-more">
                  <summary>Vis {people.length - 6} til</summary>
                  <div className="contact-list" style={{ padding: 0, marginTop: 8 }}>
                    {people.slice(6).map((p) => (
                      <PersonCard key={p.key} person={p} company={liName} />
                    ))}
                  </div>
                </details>
              )}
            </div>
            {!people.some((p) => p.roles.some((r) => r.source !== 'brreg')) && (
              <div className="box-pad muted" style={{ paddingTop: 0, fontSize: '0.82rem' }}>
                Ingen navngitte kontakter utover ledelse og styre ennå.{isAdmin ? ' Legg inn under.' : ''}
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

          {/* News: here on normal screens, own column when wide (CSS). */}
          <div className="news-narrow">{newsBox}</div>
        </div>
        <div className="split-scroll-col news-wide">{newsBox}</div>
      </div>
            ),
          },
          {
            key: 'meetings',
            label: 'Møter',
            content: (
      <div className="split-scroll">
        <div className="split-scroll-col">
          <div className="box">
            <div className="box-header">
              <span className="box-title">Bedriftsmøte</span>
            </div>
            <div className="box-pad">
                    <MeetingTab
                      id={co.id}
                      date={co.meeting_date}
                      prep={co.meeting_prep}
                      notes={co.meeting_notes}
                      canEdit={isAdmin}
                    />
            </div>
          </div>
        </div>
        <div className="split-scroll-col">
          {isAdmin && base && <NotesBox id={co.id} notes={base.notes ?? ''} />}
        </div>
      </div>
            ),
          },
          {
            key: 'why',
            label: 'Hvorfor aktuell',
            content: (
              <div className="split-scroll">
                <div className="split-scroll-col">
          {/* Score + AI factors (merged: they listed the same factors) */}
          <div className="box">
            <div className="box-header">
              <span className="box-title">Hvorfor aktuell</span>
              <span className="muted" style={{ fontSize: '0.72rem' }}>lead-score + AI-faktorer</span>
            </div>
            <div className="box-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {co.lead_score != null ? (
              // Two columns: the computed score (bars) left, the AI's
              // qualitative factors right — wraps to one column when narrow.
              <div className="score-split">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
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
              </div>
              <div className="score-split-factors">
                <span className="muted" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                  Faktorer (AI-vurdert)
                </span>
                {analysis && analysis.scoreFactors.length > 0 ? (
                  <ScoreFactorList factors={analysis.scoreFactors} />
                ) : (
                  <p className="muted" style={{ fontSize: '0.84rem', marginTop: 6 }}>Ingen AI-vurdering ennå.</p>
                )}
              </div>
              </div>
            ) : (
              <p className="muted">
                Ingen score ennå. {isAdmin ? 'Bruk «Oppdater fra registrene» under.' : 'Neste skann beregner en.'}
              </p>
            )}
            </div>
          </div>
                </div>
              </div>
            ),
          },
          {
            key: 'about',
            label: 'Om selskapet',
            content: (
      <div className="split-scroll">
        <div className="split-scroll-col">
          <ProfileBox
            profile={tech?.profile ?? null}
            checkedAt={tech?.checkedAt ?? null}
            hasWebsite={!!co.website}
            established={co.established_at}
            registered={co.registered_at}
            orgForm={co.org_form}
            activity={co.matched_label}
          />
            {groupMembers.length > 1 ? (
              // One customer, several legal entities — show them together,
              // and say whether the register or our inference joined them.
              <div className="group-panel">
                <span className="group-panel-title">
                  <KonsernIcon /> Konsern · {groupMembers.length} selskaper i oversikten
                  {groupBasis && (
                    <span className={`group-panel-basis${groupBasis.documented ? ' documented' : ''}`} title={groupBasis.text}>
                      {groupBasis.documented ? 'registrert' : groupBasis.partly ? 'delvis registrert' : 'sannsynlig'}
                    </span>
                  )}
                </span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {groupMembers.map((m) =>
                    m.orgnr === co.orgnr ? (
                      <span key={m.orgnr} className="group-chip current">
                        {m.name}
                      </span>
                    ) : (
                      <Link key={m.orgnr} href={`/company/${m.orgnr}`} className="group-chip">
                        {m.name}
                      </Link>
                    ),
                  )}
                </span>
                {groupBasis && <span className="muted" style={{ fontSize: '0.74rem' }}>{groupBasis.text}</span>}
              </div>
            ) : (
              co.parent_orgnr && (
                <p className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>
                  Del av konsernet{' '}
                  <span style={{ color: 'var(--text-primary)' }}>{co.konsern_root_name ?? co.parent_name ?? co.parent_orgnr}</span>
                </p>
              )
            )}
          {/* Teknologi og kunderelevans (spec §3–4). Two kinds of information,
              labelled apart: what the company's own website says (documented,
              each item linked to its page) and the AI's classification. */}
          <div className="box">
            <div className="box-header">
              <span className="box-title">Teknologi og kunderelevans</span>
            </div>
            <div className="box-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <span className="muted" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                  KUNDERELEVANS <span style={{ fontWeight: 400 }}>· AI-vurdering</span>
                </span>
                {analysis?.customerCategory ? (
                  <p style={{ marginTop: 6, fontSize: '0.88rem', display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span className={`category-pill cat-${analysis.customerCategory.replace(/\s+/g, '-')}`}>
                      {CATEGORY_LABEL[analysis.customerCategory] ?? analysis.customerCategory}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{analysis.categoryReason}</span>
                  </p>
                ) : (
                  <p className="muted" style={{ marginTop: 6, fontSize: '0.84rem' }}>
                    Ikke med i denne AI-vurderingen ennå — kommer ved neste kjøring.
                  </p>
                )}
              </div>
              <div>
                <span className="muted" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                  TEKNOLOGI <span style={{ fontWeight: 400 }}>· dokumentert fra selskapets nettside</span>
                </span>
                {!tech ? (
                  <p className="muted" style={{ marginTop: 6, fontSize: '0.84rem' }}>
                    {co.website ? 'Nettsiden er ikke lest for teknologi ennå.' : 'Ingen nettside registrert.'}
                  </p>
                ) : (
                  <>
                    <p style={{ marginTop: 6, fontSize: '0.84rem', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span title={tech.itEnvironment?.evidence ?? undefined}>
                        Eget IT-miljø: <strong>{tech.itEnvironment?.value ?? 'ukjent'}</strong>
                      </span>
                      <span title={tech.digitalProducts?.evidence ?? undefined}>
                        Egne digitale produkter: <strong>{tech.digitalProducts?.value ?? 'ukjent'}</strong>
                      </span>
                    </p>
                    {tech.technologies.length === 0 ? (
                      <p className="muted" style={{ marginTop: 6, fontSize: '0.84rem' }}>Ingen teknologi eller systemer er nevnt på nettsiden.</p>
                    ) : (
                      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {tech.technologies.map((t) => (
                          <a
                            key={t.name}
                            href={t.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tech-chip"
                            title={`«${t.evidence}» — ${t.sourceUrl}`}
                          >
                            {t.name} <span className="muted">· {t.category}</span>
                          </a>
                        ))}
                      </span>
                    )}
                    <p className="muted" style={{ marginTop: 6, fontSize: '0.72rem' }}>
                      Lest {dateLabel(tech.checkedAt)}. Hold over en teknologi for sitatet den bygger på.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Rekruttering — NAV job ads for the group. IT/tech roles are the
              strongest buying signal in the spec, so they're marked. */}
          <div className="box">
            <div className="box-header">
              <span className="box-title">Rekruttering</span>
              <span className="muted" style={{ fontSize: '0.72rem' }}>
                {jobsEnabled
                  ? `NAV · ${jobAds.length} aktive${jobAds.some((j) => j.is_tech) ? ` · ${jobAds.filter((j) => j.is_tech).length} IT` : ''}`
                  : 'NAV'}
              </span>
            </div>
            <div className="box-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!jobsEnabled ? (
                <p className="muted" style={{ fontSize: '0.84rem' }}>
                  Stillingsannonser fra NAV er ikke slått på ennå (krever egen NAV-token etter avtale om vilkår).
                </p>
              ) : jobAds.length === 0 ? (
                <p className="muted" style={{ fontSize: '0.84rem' }}>Ingen aktive stillingsannonser hos NAV.</p>
              ) : (
                jobAds.map((j) => (
                  <a key={j.uuid} href={j.source_url} target="_blank" rel="noopener noreferrer" className="job-ad">
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      {j.is_tech === 1 && <span className="news-card-tag">IT</span>}
                      <strong style={{ fontSize: '0.88rem' }}>{j.title}</strong>
                    </span>
                    <span className="muted" style={{ fontSize: '0.76rem' }}>
                      {[j.occupation, j.location, j.employer_name].filter(Boolean).join(' · ')}
                    </span>
                    <span className="muted" style={{ fontSize: '0.74rem' }}>
                      {j.published ? `Publisert ${dateLabel(j.published)}` : ''}
                      {j.application_due ? ` · frist ${/^\d{4}-/.test(j.application_due) ? dateLabel(j.application_due) : j.application_due}` : ''}
                    </span>
                  </a>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="split-scroll-col">
            <div className="box">
              {/* Omsetning (siste) is left out — it's this year's Driftsinntekter. */}
              <FinancialsTabs
                financials={financials}
                keyFigures={[
                  { label: 'Vekst å/å', value: co.revenue_growth_pct != null ? fmtPct(co.revenue_growth_pct, 0) : '—' },
                  { label: 'Driftsmargin', value: co.operating_margin_pct != null ? fmtPct(co.operating_margin_pct, 0) : '—' },
                  { label: 'Siste årsregnskap', value: co.last_annual_report ?? '—' },
                  { label: 'Registrert', value: dateLabel(co.registered_at) },
                ]}
              />
            </div>
        </div>
      </div>
            ),
          },
          {
            key: 'challenges',
            label: 'Utfordringer i bransjen',
            content: (
              <div className="split-scroll">
                <div className="split-scroll-col">
                  <div className="box">
                    <div className="box-header">
                      <span className="box-title">Utvalgt for selskapet</span>
                      <span className="muted" style={{ fontSize: '0.72rem' }}>
                        AI · generell bransjekunnskap — ikke bekreftet for selskapet
                      </span>
                    </div>
                    <div className="box-pad" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                      {analysis?.industryChallenges && analysis.industryChallenges.length > 0 ? (
                        analysis.industryChallenges.map((c, i) => (
                          <ChallengeCard key={i} id={`challenge-${i}`} challenge={c.challenge} details={c.details} relevance={c.relevance} />
                        ))
                      ) : (
                        <p className="muted" style={{ fontSize: '0.86rem' }}>
                          Ingen AI-vurdering av bransjeutfordringer ennå. Kommer ved neste AI-kjøring.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="split-scroll-col">
                  <div className="box">
                    <div className="box-header">
                      <span className="box-title">Alle kjente utfordringer i segmentet</span>
                      <span className="muted" style={{ fontSize: '0.72rem' }}>{co.matched_group ?? ''}</span>
                    </div>
                    <div className="box-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {segmentChallenges.length > 0 ? (
                        segmentChallenges.map((c, i) => (
                          <div key={i}>
                            <strong style={{ fontSize: '0.88rem' }}>{c.challenge}</strong>
                            <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                              <span className="muted">Vinkel: </span>
                              {c.angle}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="muted" style={{ fontSize: '0.86rem' }}>
                          Ingen kjent liste for dette segmentet.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ),
          },
        ]}
      />

      {isAdmin && base && (
        <AdminPanelModal>
          <AdminControls
            id={base.id}
            orgnr={base.orgnr}
            name={base.name}
            status={base.status}
            website={base.website}
            contactPage={base.contact_page_url}
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
      title={generatedAt ? `AI-tolkning — sist generert ${dateLabel(generatedAt)}` : 'AI-tolkning'}
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

function EntryTab({ analysis, liCompany }: { analysis: LeadAnalysis; liCompany: string }) {
  const contact = analysis.recommendedContact;
  const label = (text: string) => (
    <span className="muted" style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {text}
    </span>
  );
  return (
    <div style={{ fontSize: '0.9rem', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Who to approach — the headline of the box */}
      <div className="entry-contact">
        {label('Kontakt')}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
          {contact.name ? (
            <>
              <strong style={{ fontSize: '1.15rem' }}>{contact.name}</strong>
              <a
                href={linkedinPeopleUrl(`${contact.name} ${liCompany}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="link-accent"
                style={{ fontSize: '0.78rem' }}
              >
                Finn på LinkedIn ↗
              </a>
            </>
          ) : (
            <strong style={{ fontSize: '1.05rem' }} className="muted">
              Ingen registrert kontakt
            </strong>
          )}
        </div>
        <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.86rem' }}>{contact.reason}</p>
      </div>

      {/* Segment-level context — general knowledge, labelled as such so it
          isn't mistaken for something known about this company. */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          {label('Utfordringer i bransjen')}
          <span className="muted" style={{ fontSize: '0.72rem' }}>
            generell bransjekunnskap — ikke bekreftet for selskapet
          </span>
        </div>
        {analysis.industryChallenges && analysis.industryChallenges.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 10,
              marginTop: 8,
            }}
          >
            {analysis.industryChallenges.map((c, i) => (
              // Click → the «Utfordringer i bransjen» tab, scrolled to this one.
              <GoToTab key={i} tab="challenges" anchor={`challenge-${i}`} className="challenge-card">
                <strong style={{ fontSize: '0.86rem' }}>{c.challenge}</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{c.relevance}</span>
                <span className="challenge-more">Les mer i Utfordringer i bransjen →</span>
              </GoToTab>
            ))}
          </div>
        ) : (
          // Analyses made before this field existed don't have it; they're
          // queued for a new run (ONCE_MIGRATIONS in lib/db.ts).
          <p className="muted" style={{ fontSize: '0.84rem', marginTop: 6 }}>
            Vurderingen er fra før dette feltet fantes. Selskapet står i AI-køen og får det når «AI-vurdering» kjøres
            neste gang (Admin → Datakvalitet).
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            {label('Pitch')}
            <p style={{ margin: '2px 0 0' }}>{analysis.pitch}</p>
          </div>
          {analysis.icebreaker && (
            <div>
              {label('Icebreaker')}
              <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)' }}>{analysis.icebreaker}</p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {analysis.questions.length > 0 && (
            <div>
              {label('Spørsmål å stille')}
              <ul style={{ margin: '6px 0 0', paddingLeft: '1.2em', listStyleType: 'disc' }}>
                {analysis.questions.map((q, i) => (
                  <li key={i} style={{ marginTop: i === 0 ? 0 : 4 }}>
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {analysis.avoidClaiming.length > 0 && (
            <div>
              {label('Ikke påstå uten bekreftelse')}
              <ul style={{ margin: '6px 0 0', paddingLeft: '1.2em', listStyleType: 'disc', color: 'var(--text-secondary)' }}>
                {analysis.avoidClaiming.map((x, i) => (
                  <li key={i} style={{ marginTop: i === 0 ? 0 : 4 }}>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

// Same mark as in the company list: several companies, one group.
function KonsernIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" style={{ verticalAlign: '-2px' }}>
      <rect x="9" y="2" width="6" height="6" rx="1" />
      <rect x="2" y="16" width="6" height="6" rx="1" />
      <rect x="16" y="16" width="6" height="6" rx="1" />
      <path d="M12 8v4M5 16v-2h14v2" />
    </svg>
  );
}

interface ContactPerson {
  key: string;
  name: string;
  roles: { label: string; source: 'brreg' | 'nettside' | 'manuell' | 'annonse'; via?: string }[];
  emails: string[];
  phones: string[];
  isNew: boolean;
}

type SourcedContact = { name: string; role: string | null; email: string | null; phone: string | null };

// Merges every source into one entry per person (by name, case/space-
// insensitive), in the order a salesperson would call them: daglig leder,
// manually entered, website (own, then the rest of the group), board.
function buildContactPeople(input: {
  ceo: { name: string; isNew: boolean } | null;
  manual: { label: string; name: string | null; email: string | null; phone: string | null }[];
  website: SourcedContact[];
  group: (SourcedContact & { via: string })[];
  board: SourcedContact[];
  jobAds: SourcedContact[];
}): ContactPerson[] {
  const byKey = new Map<string, ContactPerson>();
  const add = (
    name: string | null,
    role: ContactPerson['roles'][number],
    email: string | null = null,
    phone: string | null = null,
    isNew = false,
  ) => {
    if (!name?.trim()) return;
    const key = name.toLowerCase().replace(/\s+/g, ' ').trim();
    const p = byKey.get(key) ?? { key, name: name.trim(), roles: [], emails: [], phones: [], isNew: false };
    if (!p.roles.some((r) => r.label === role.label && r.source === role.source)) p.roles.push(role);
    if (email && !p.emails.includes(email)) p.emails.push(email);
    // "+47 55 21 00 10 / +47 908 25 634" — one tel: link each
    for (const ph of (phone ?? '').split(/\s*[/,;]\s*/).filter(Boolean)) if (!p.phones.includes(ph)) p.phones.push(ph);
    p.isNew ||= isNew;
    byKey.set(key, p);
  };
  if (input.ceo) add(input.ceo.name, { label: 'Daglig leder', source: 'brreg' }, null, null, input.ceo.isNew);
  for (const m of input.manual) add(m.name, { label: m.label, source: 'manuell' }, m.email, m.phone);
  for (const w of input.website) add(w.name, { label: w.role ?? 'Ansatt', source: 'nettside' }, w.email, w.phone);
  for (const g of input.group) add(g.name, { label: g.role ?? 'Ansatt', source: 'nettside', via: g.via }, g.email, g.phone);
  for (const j of input.jobAds) add(j.name, { label: j.role ?? 'Kontakt i stillingsannonse', source: 'annonse' }, j.email, j.phone);
  for (const b of input.board) add(b.name, { label: b.role ?? 'Styremedlem', source: 'brreg' });
  return [...byKey.values()];
}

const SOURCE_LABEL: Record<ContactPerson['roles'][number]['source'], string> = {
  brreg: 'Brreg',
  nettside: 'nettside',
  manuell: 'lagt inn',
  annonse: 'stillingsannonse (NAV)',
};

function PersonCard({ person, company }: { person: ContactPerson; company: string }) {
  return (
    <div className="person-card">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.9rem' }}>{person.name}</strong>
        <a
          href={linkedinPeopleUrl(`${person.name} ${company}`)}
          target="_blank"
          rel="noopener noreferrer"
          className="link-accent"
          title={`Søk etter ${person.name} på LinkedIn`}
          style={{ fontSize: '0.7rem', fontWeight: 700 }}
        >
          in
        </a>
        {person.isNew && <span className="ceo-changed-badge">Ny i rollen</span>}
      </div>
      <div className="person-card-roles">
        {person.roles.map((r, i) => (
          <span key={i}>
            {r.label}
            <span className="muted">
              {' '}
              · {SOURCE_LABEL[r.source]}
              {r.via ? ` via ${r.via}` : ''}
            </span>
          </span>
        ))}
      </div>
      {person.emails.map((e) => (
        <a key={e} href={`mailto:${e}`} className="person-card-line link-accent">
          <MailIcon /> {e}
        </a>
      ))}
      {person.phones.map((ph) => (
        <a key={ph} href={`tel:${ph.replace(/\s/g, '')}`} className="person-card-line link-accent">
          <PhoneSmallIcon /> {ph}
        </a>
      ))}
    </div>
  );
}

function MailIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function PhoneSmallIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
    </svg>
  );
}

// The AI's «details» ends with a suggested follow-up question inside the
// prose; pulled out to its own line so the card reads as: what, how we help, ask.
function splitFollowUp(details: string): { body: string; question: string | null } {
  const sentences = details.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [details];
  const i = sentences.findIndex((x) => /oppfølgingsspørsmål/i.test(x));
  if (i < 0) return { body: details, question: null };
  const q = sentences[i]
    .replace(/^\s*(et\s+)?(godt|relevant)?\s*oppfølgingsspørsmål\s*(selgeren kan stille|å stille|kan være)?\s*(er|kan være)?\s*:?\s*(å spørre\s*)?/i, '')
    .trim();
  return {
    body: sentences.filter((_, j) => j !== i).join('').trim(),
    question: q ? q.charAt(0).toUpperCase() + q.slice(1) : null,
  };
}

function ChallengeCard({ id, challenge, details, relevance }: { id: string; challenge: string; details?: string | null; relevance: string }) {
  const { body, question } = details ? splitFollowUp(details) : { body: null, question: null };
  return (
    <div id={id} className="challenge-full">
      <h3 className="challenge-full-title">{challenge}</h3>
      {body ? (
        <p className="challenge-full-body">{body}</p>
      ) : (
        <p className="muted challenge-full-body">Utdypingen lages ved neste AI-vurdering av selskapet (Admin → Datakvalitet).</p>
      )}
      <div className="challenge-full-help">
        <span className="challenge-full-label">Hvordan vi kan hjelpe</span>
        {relevance}
      </div>
      {question && (
        <div className="challenge-full-ask">
          <span className="challenge-full-label">Spør kunden</span>
          {question}
        </div>
      )}
    </div>
  );
}

// «Om selskapet»: what the company does and its history, in its own words
// (read off its website by the AI pass — lib/orchestrator/providers/ai.ts
// requestContacts) next to the register's dates.
function ProfileBox({
  profile,
  checkedAt,
  hasWebsite,
  established,
  registered,
  orgForm,
  activity,
}: {
  profile: CompanyProfile | null;
  checkedAt: number | null;
  hasWebsite: boolean;
  established: string | null;
  registered: string | null;
  orgForm: string | null;
  activity: string | null;
}) {
  const year = (d: string | null) => (d ? d.slice(0, 4) : null);
  const facts = [
    year(established) && { label: 'Stiftet', value: year(established)! },
    year(registered) && year(registered) !== year(established) && { label: 'Registrert', value: year(registered)! },
    orgForm && { label: 'Selskapsform', value: orgForm },
    activity && { label: 'Bransje (Brreg)', value: activity },
  ].filter(Boolean) as { label: string; value: string }[];
  return (
    <div className="box">
      <div className="box-header">
        <span className="box-title">Om selskapet</span>
        <span className="muted" style={{ fontSize: '0.72rem' }}>
          {profile ? 'AI-sammendrag av selskapets egen nettside' : 'Brønnøysund'}
        </span>
      </div>
      <div className="box-pad profile-box">
        {facts.length > 0 && (
          <dl className="profile-facts">
            {facts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {profile ? (
          <>
            <section>
              <h3 className="profile-h">Hva de driver med</h3>
              <p className="profile-text">{profile.summary}</p>
            </section>
            {profile.history && (
              <section>
                <h3 className="profile-h">Historikk</h3>
                <p className="profile-text">{profile.history}</p>
              </section>
            )}
            {profile.offerings.length > 0 && (
              <section>
                <h3 className="profile-h">Produkter og tjenester</h3>
                <div className="profile-chips">
                  {profile.offerings.map((o) => (
                    <span key={o} className="chip">{o}</span>
                  ))}
                </div>
              </section>
            )}
            {profile.markets.length > 0 && (
              <section>
                <h3 className="profile-h">Kunder og markeder</h3>
                <div className="profile-chips">
                  {profile.markets.map((o) => (
                    <span key={o} className="chip">{o}</span>
                  ))}
                </div>
              </section>
            )}
            <p className="muted" style={{ fontSize: '0.72rem' }}>
              {checkedAt ? `Lest ${dateLabel(checkedAt)}` : ''}
              {profile.sourceUrl && (
                <>
                  {' · '}
                  <a href={profile.sourceUrl} target="_blank" rel="noopener noreferrer" className="link-accent">
                    kilde ↗
                  </a>
                </>
              )}
              {' · bygger bare på det selskapet selv skriver.'}
            </p>
          </>
        ) : (
          <p className="muted" style={{ fontSize: '0.84rem' }}>
            {hasWebsite
              ? 'Ingen beskrivelse ennå — lages neste gang AI-vurderingen leser nettsiden.'
              : 'Ingen kjent nettside, så ingen beskrivelse av virksomheten ennå.'}
          </p>
        )}
      </div>
    </div>
  );
}
