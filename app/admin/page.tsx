import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import { countActiveCompanies, listScans, listAudit } from '@/lib/db';
import { agoLabel, dateLabel } from '@/app/format';
import { NACE_CODES, KOMMUNER } from '@/data/maritime-sectors.mjs';
import AddCompanyForm from './AddCompanyForm';
import RunScanButton from './RunScanButton';
import GuestLinkPanel from './GuestLinkPanel';

export const dynamic = 'force-dynamic';
// Matches the cron route's budget (app/api/cron/scan/route.ts) — without
// this, the "Kjør skann" button's Server Action would inherit Vercel's much
// shorter default function duration and get killed well before runScan()'s
// own 45s enrichment deadline ever kicks in.
export const maxDuration = 60;
export const metadata: Metadata = { title: 'Admin' };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login?next=/admin');

  const [activeCount, scans, auditRows] = await Promise.all([
    countActiveCompanies(),
    listScans(12),
    listAudit(40),
  ]);

  return (
    <div className="page-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Admin</h1>
        <Link href="/" className="link-accent" style={{ fontSize: '0.85rem' }}>← Tilbake til listen</Link>
      </div>

      <div className="box">
        <div className="box-header">
          <span className="box-title">Skann</span>
          <span className="muted">
            nattlig 05:00 UTC · {(KOMMUNER as { name: string }[]).map((k) => k.name).join(', ')} ·{' '}
            {(NACE_CODES as unknown[]).length} bransjekoder · {activeCount} selskaper
          </span>
        </div>
        <div className="box-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <RunScanButton />
          <p className="muted" style={{ fontSize: '0.72rem' }}>
            «Kjør skann» oppdaterer selskapslisten fra Enhetsregisteret og henter regnskap for en
            roterende bunt (inntil {process.env.SCAN_BATCH || 150} selskaper, begrenset av en
            45-sekunders tidsbudsjett per kjøring). «Full oppdatering» henter regnskap for alle.
          </p>
        </div>
        <div className="box-header" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="box-title">Siste skann</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
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

      <div className="box">
        <div className="box-header"><span className="box-title">Legg til selskap manuelt</span></div>
        <div className="box-pad"><AddCompanyForm /></div>
      </div>

      <div className="box">
        <div className="box-header"><span className="box-title">Gjestelenke</span></div>
        <div className="box-pad"><GuestLinkPanel /></div>
      </div>

      <div className="box">
        <div className="box-header">
          <span className="box-title">Logg</span>
          <span className="muted">innlogginger &amp; admin-handlinger</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
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
    </div>
  );
}
