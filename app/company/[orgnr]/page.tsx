import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCompanyByOrgnr, getCompany, listFinancials, getScoreHistory } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isValidOrgnr, proffUrl, brregUrl } from '@/lib/brreg';
import { fmtNok, fmtPct, fmtInt, dateLabel, agoLabel } from '@/app/format';
import ScoreBadge, { bandFor } from '@/app/components/ScoreBadge';
import AdminControls from './AdminControls';

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
  const [financials, history, user] = await Promise.all([
    listFinancials(co.id),
    getScoreHistory(co.id, 12),
    getCurrentUser(),
  ]);
  const isAdmin = user?.role === 'admin';
  const band = bandFor(co.lead_score);
  const nace = [
    co.nace1_code && { code: co.nace1_code, text: co.nace1_text },
    co.nace2_code && { code: co.nace2_code, text: co.nace2_text },
    co.nace3_code && { code: co.nace3_code, text: co.nace3_text },
  ].filter(Boolean) as { code: string; text: string | null }[];

  return (
    <div className="page-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <Link href="/" className="muted" style={{ fontSize: '0.8rem' }}>
          ← Alle selskaper
        </Link>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{co.name}</h1>
          <ScoreBadge score={co.lead_score} />
          {co.under_liquidation === 1 && <span className="muted">(under avvikling)</span>}
        </div>
        <p className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>
          Org.nr {co.orgnr}
          {co.org_form ? ` · ${co.org_form}` : ''}
          {co.poststed ? ` · ${co.poststed}` : ''}
          {co.matched_group ? ` · ${co.matched_group}` : ''}
        </p>
        <p style={{ fontSize: '0.82rem', marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {co.website && (
            <a href={co.website} target="_blank" rel="noopener noreferrer" className="link-accent">
              Nettsted ↗
            </a>
          )}
          <a href={proffUrl(co.orgnr)} target="_blank" rel="noopener noreferrer" className="link-accent">
            proff.no ↗
          </a>
          <a href={brregUrl(co.orgnr)} target="_blank" rel="noopener noreferrer" className="link-accent">
            Brønnøysund ↗
          </a>
          {co.phone && <span className="muted">Tlf {co.phone}</span>}
        </p>
      </div>

      {/* Score panel */}
      <div className="box">
        <div className="box-header">
          <span className="box-title">Lead-score</span>
          <span className="muted">{co.computed_at ? `oppdatert ${agoLabel(co.computed_at)}` : 'ikke scoret ennå'}</span>
        </div>
        <div className="box-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {co.lead_score != null ? (
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
                    <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '190px 1fr 42px', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {s.label} <span className="muted">{s.weight}</span>
                      </span>
                      <span className="meter">
                        <span style={{ width: `${v}%` }} />
                      </span>
                      <span className="num muted" style={{ fontSize: '0.76rem', textAlign: 'right' }}>{v}</span>
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
          )}
        </div>
      </div>

      {/* Key facts */}
      <div className="box">
        <div className="box-header"><span className="box-title">Nøkkelinfo</span></div>
        <div className="box-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          <Fact label="Ansatte" value={fmtInt(co.employees)} />
          <Fact label="Omsetning (siste)" value={fmtNok(co.revenue_latest, { compact: true })} />
          <Fact label="Vekst å/å" value={co.revenue_growth_pct != null ? fmtPct(co.revenue_growth_pct, 0) : '—'} />
          <Fact label="Driftsmargin" value={co.operating_margin_pct != null ? fmtPct(co.operating_margin_pct, 0) : '—'} />
          <Fact label="Bransje (NACE)" value={nace.map((n) => `${n.code} ${n.text ?? ''}`).join(' · ') || '—'} />
          <Fact label="Adresse" value={[co.address, co.postnummer, co.poststed].filter(Boolean).join(', ') || '—'} />
          <Fact label="Registrert" value={dateLabel(co.registered_at)} />
          <Fact label="Siste årsregnskap" value={co.last_annual_report ?? '—'} />
        </div>
      </div>

      {isAdmin && base && (
        <AdminControls
          id={base.id}
          orgnr={base.orgnr}
          name={base.name}
          status={base.status}
          notes={base.notes ?? ''}
        />
      )}

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
