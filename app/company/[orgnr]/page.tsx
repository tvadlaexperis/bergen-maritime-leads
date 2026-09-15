import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCompanyByOrgnr, getCompany, listFinancials, getScoreHistory } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isValidOrgnr, proffUrl, brregUrl } from '@/lib/brreg';
import { getCompanyNews, type NewsItem } from '@/lib/news';
import { fmtNok, fmtPct, fmtInt, dateLabel } from '@/app/format';
import { bandFor } from '@/app/components/ScoreBadge';
import AdminControls from './AdminControls';
import ContactsEditForm from './ContactsEditForm';
import LeadScoreTabs from './LeadScoreTabs';

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

export default async function CompanyPage({ params }: { params: { orgnr: string } }) {
  if (!isValidOrgnr(params.orgnr)) notFound();
  const co = await getCompanyByOrgnr(params.orgnr);
  if (!co) notFound();

  const base = await getCompany(co.id);
  const [financials, history, user, news] = await Promise.all([
    listFinancials(co.id),
    getScoreHistory(co.id, 12),
    getCurrentUser(),
    getCompanyNews(co.name),
  ]);
  const isAdmin = user?.role === 'admin';
  const band = bandFor(co.lead_score);

  return (
    <div className="page-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <Link href="/" className="muted" style={{ fontSize: '0.8rem' }}>
          ← Alle selskaper
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginTop: 6 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{co.name}</h1>
              {co.under_liquidation === 1 && <span className="muted">(under avvikling)</span>}
            </div>
            <p className="muted" style={{ fontSize: '0.82rem', marginTop: 6 }}>
              Org.nr {co.orgnr}
              {co.org_form ? ` · ${co.org_form}` : ''}
              {co.poststed ? ` · ${co.poststed}` : ''}
              {co.matched_group ? ` · ${co.matched_group}` : ''}
            </p>
          </div>
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
            {co.website && (
              <a href={co.website} target="_blank" rel="noopener noreferrer" className="link-accent">
                Nettsted ↗
              </a>
            )}
          </p>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, alignItems: 'stretch' }}>
        {/* Score panel */}
        <div className="box">
          <LeadScoreTabs
            aiTab={
              co.ai_summary ? (
                <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>{co.ai_summary}</p>
              ) : (
                <p className="muted" style={{ fontSize: '0.86rem' }}>
                  Ingen AI-vurdering ennå. {isAdmin ? 'Bruk «Oppdater fra registrene» under.' : 'Neste skann beregner en.'}
                </p>
              )
            }
            scoreTab={
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
                </>
              ) : (
                <p className="muted">
                  Ingen score ennå. {isAdmin ? 'Bruk «Oppdater fra registrene» under.' : 'Neste skann beregner en.'}
                </p>
              )
            }
          />
        </div>

        {/* Financial history */}
        <div className="box">
          <div className="box-header">
            <span className="box-title">Regnskapstall ({financials.length} år)</span>
            <span className="muted">Regnskapsregisteret</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>År</th>
                  <th className="col-right">Driftsinntekter</th>
                  <th className="col-right">Driftsresultat</th>
                  <th className="col-right">Årsresultat</th>
                  <th className="col-right">Egenkapital</th>
                  <th className="col-right">Sum eiendeler</th>
                </tr>
              </thead>
              <tbody>
                {financials.map((f) => (
                  <tr key={f.id}>
                    <td className="num">{f.year}</td>
                    <td className="col-right num">{fmtNok(f.revenue, { compact: true })}</td>
                    <td className="col-right num" style={{ color: f.operating_result != null ? (f.operating_result >= 0 ? 'var(--positive)' : 'var(--negative)') : undefined }}>
                      {fmtNok(f.operating_result, { compact: true })}
                    </td>
                    <td className="col-right num" style={{ color: f.profit != null ? (f.profit >= 0 ? 'var(--positive)' : 'var(--negative)') : undefined }}>
                      {fmtNok(f.profit, { compact: true })}
                    </td>
                    <td className="col-right num">{fmtNok(f.equity, { compact: true })}</td>
                    <td className="col-right num">{fmtNok(f.total_assets, { compact: true })}</td>
                  </tr>
                ))}
                {financials.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 28 }}>
                      Ingen regnskapstall hentet ennå.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, alignItems: 'start' }}>
        {/* Contacts */}
        <div className="box">
          <div className="box-header"><span className="box-title">Kontakter</span></div>
          <div style={{ overflowX: 'auto' }}>
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
                <ContactRow label="Daglig leder" name={co.ceo_name} />
                <ContactRow label="Kontaktperson" name={co.contact_name} email={co.contact_email} phone={co.contact_phone} />
                <ContactRow label="CTO" name={co.cto_name} email={co.cto_email} phone={co.cto_phone} />
                <ContactRow label="Salgssjef" name={co.sales_name} email={co.sales_email} phone={co.sales_phone} />
              </tbody>
            </table>
          </div>
          {!co.ceo_name && !co.contact_name && !co.cto_name && !co.sales_name && (
            <div className="box-pad muted" style={{ paddingTop: 0, fontSize: '0.82rem' }}>
              Ingen kontaktinfo registrert ennå.{isAdmin ? ' Legg inn under.' : ''}
            </div>
          )}
          {isAdmin && base && (
            <>
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
              <div className="box-pad" style={{ paddingTop: 0 }}>
                <AdminControls
                  embedded
                  id={base.id}
                  orgnr={base.orgnr}
                  name={base.name}
                  status={base.status}
                  notes={base.notes ?? ''}
                />
              </div>
            </>
          )}
        </div>

        {/* News */}
        <div className="box">
          <div className="box-header">
            <span className="box-title">Nyheter</span>
            <span className="muted">GDELT</span>
          </div>
          <div className="box-pad">
            {news.length === 0 ? (
              <p className="muted" style={{ fontSize: '0.85rem' }}>Ingen nyhetstreff siste tiden.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {news.map((n: NewsItem) => (
                  <a key={n.url} href={n.url} target="_blank" rel="noopener noreferrer" className="news-card">
                    <span className="news-card-title">{n.title}</span>
                    <span className="muted" style={{ fontSize: '0.72rem' }}>
                      {n.domain}
                      {n.seenAt ? ` · ${dateLabel(n.seenAt)}` : ''}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
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
}: {
  label: string;
  name: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  return (
    <tr>
      <td className="muted">{label}</td>
      <td>{name ?? <span className="muted">—</span>}</td>
      <td>{email ? <a href={`mailto:${email}`} className="link-accent">{email}</a> : <span className="muted">—</span>}</td>
      <td>{phone ? <a href={`tel:${phone.replace(/\s/g, '')}`} className="link-accent">{phone}</a> : <span className="muted">—</span>}</td>
    </tr>
  );
}
