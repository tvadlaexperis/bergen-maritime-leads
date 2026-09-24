import Link from 'next/link';
import type { Freshness, Scan } from '@/lib/db';
import type { ScanDetails } from '@/lib/scan';
import { KOMMUNER, NACE_CODES } from '@/data/maritime-sectors.mjs';
import ScanHeader from './ScanHeader';

const TRIGGER_LABEL: Record<ScanDetails['trigger'], string> = {
  cron: 'Nattlig',
  manuell: 'Manuell',
  full: 'Full',
  ai: 'AI-kø',
};

function parseDetails(raw: string | null): ScanDetails | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ScanDetails;
  } catch {
    return null;
  }
}

function parseErrors(raw: string | null): { scope: string; message: string }[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as { scope: string; message: string }[];
  } catch {
    return [];
  }
}

// Server-rendered timestamps would otherwise come out in the Vercel
// function's UTC, an hour or two off from what anyone in Bergen expects.
function whenLabel(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', timeZone: 'Europe/Oslo' });
  const time = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });
  return `${date} ${time}`;
}

function statusLabel(s: Scan, d: ScanDetails | null): string {
  if (!s.finished_at) return Date.now() - s.started_at > 2 * 60_000 ? 'avbrutt' : 'kjører';
  return d?.stoppedEarly ? 'ferdig · tidsgrense nådd' : 'ferdig';
}

// A zero is noise in a wide table of mostly-zero columns — dim it so the
// numbers that actually moved stand out.
function Num({ n }: { n: number | null | undefined }) {
  if (n == null) return <span className="muted">—</span>;
  return <span className={n === 0 ? 'muted' : undefined}>{n}</span>;
}

function FreshnessTile({ label, value, total, hint }: { label: string; value: number; total: number; hint: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{label}</span>
      <span className="num" style={{ fontSize: '1.1rem', fontWeight: 800 }}>
        {value}
        <span className="muted" style={{ fontSize: '0.75rem', fontWeight: 500 }}> / {total}</span>
      </span>
      <div className="meter">
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="muted" style={{ fontSize: '0.7rem' }}>{hint}</span>
    </div>
  );
}

export default function ScanPanel({
  scans,
  freshness,
  activeCount,
  selectedScanId,
  aiRemaining,
  aiEnabled,
}: {
  scans: Scan[];
  freshness: Freshness;
  activeCount: number;
  selectedScanId: number | null;
  aiRemaining: number;
  aiEnabled: boolean;
}) {
  const aiBatch = Number(process.env.SCAN_AI_BATCH) || 12;
  return (
    <div className="box" style={{ flex: 1, minHeight: 0 }}>
      <ScanHeader
        meta={`nattlig 05:00 UTC · ${(KOMMUNER as { name: string }[]).map((k) => k.name).join(', ')} · ${
          (NACE_CODES as unknown[]).length
        } bransjekoder · ${activeCount} selskaper`}
        aiEnabled={aiEnabled}
        aiRemaining={aiRemaining}
        info={
          <>
            Hver kjøring har to trinn innenfor et tidsbudsjett på ca. 55 sekunder. <strong>1. Brønnøysund</strong>{' '}
            (gratis, raskt): regnskap, daglig leder, styre, konsern og lead-score for selskaper som ikke er sjekket de
            siste 3 dagene — er alle oppdatert, hoppes trinnet over. <strong>2. AI</strong> (tregt): AI-vurdering,
            nettsidesøk og kontakter fra nettsiden for inntil {aiBatch} selskaper — de som aldri er vurdert og har
            høyest score går først. «Full oppdatering» sjekker alle i Brreg uansett alder og leter etter nye selskaper.
            «Kjør AI-køen» hopper over Brreg og kjører AI-trinnet gang på gang (ca. {aiBatch} selskaper i minuttet) så
            lenge siden er åpen.
          </>
        }
      />
      <div className="box-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0 }}>
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
      <div className="box-header" style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <span className="box-title">Siste skann</span>
        <span className="muted">klikk en rad for å se hva som ble oppdatert</span>
      </div>
      <div className="box-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Startet</th>
              <th>Type</th>
              <th className="col-right" title="Nye selskaper funnet i Enhetsregisteret">Nye selsk.</th>
              <th className="col-right" title="Selskaper sjekket mot Brønnøysund">Brreg sjekket</th>
              <th className="col-right" title="Selskaper med nytt regnskapsår">Nye regnskap</th>
              <th className="col-right" title="Daglig leder satt/endret, eller styret endret">Ledelse/styre</th>
              <th className="col-right">AI-vurdert</th>
              <th className="col-right">Nettsider</th>
              <th className="col-right" title="Selskaper der vi hentet kontakter fra nettsiden (antall personer i parentes)">Kontakter</th>
              <th className="col-right">Feil</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {scans.map((s) => {
              const d = parseDetails(s.details);
              const errors = parseErrors(s.errors);
              const open = selectedScanId === s.id;
              const href = open ? '/admin' : `/admin?scan=${s.id}`;
              const cell = (content: React.ReactNode, right = true) => (
                <td className={right ? 'col-right num' : undefined}>
                  <Link href={href} scroll={false} style={{ display: 'block', color: 'inherit' }}>
                    {content}
                  </Link>
                </td>
              );
              return [
                <tr key={s.id} style={{ cursor: 'pointer', background: open ? 'var(--accent-soft)' : undefined }}>
                  {cell(<span style={{ whiteSpace: 'nowrap' }}>{open ? '▾' : '▸'} {whenLabel(s.started_at)}</span>, false)}
                  {cell(d ? TRIGGER_LABEL[d.trigger] : <span className="muted">eldre</span>, false)}
                  {cell(<Num n={d ? (d.discovery.ran ? d.discovery.added : null) : null} />)}
                  {cell(<Num n={d ? d.brreg.processed : null} />)}
                  {cell(<Num n={d ? d.brreg.newFinancials : s.financials_fetched} />)}
                  {cell(<Num n={d ? d.brreg.ceoSet + d.brreg.ceoChanged + d.brreg.boardUpdated : null} />)}
                  {cell(<Num n={d ? (d.ai.enabled ? d.ai.analyses : null) : null} />)}
                  {cell(<Num n={d ? (d.ai.enabled ? d.ai.websitesFound : null) : null} />)}
                  {cell(
                    d && d.ai.enabled ? (
                      <>
                        <Num n={d.ai.contactCompanies} />
                        {d.ai.contactPeople > 0 && <span className="muted"> ({d.ai.contactPeople})</span>}
                      </>
                    ) : (
                      <Num n={null} />
                    ),
                  )}
                  {cell(<span style={{ color: errors.length ? 'var(--negative)' : undefined }}><Num n={errors.length} /></span>)}
                  {cell(<span className="muted">{statusLabel(s, d)}</span>, false)}
                </tr>,
                open && (
                  <tr key={`${s.id}-details`}>
                    <td colSpan={11} style={{ padding: '12px 20px 18px', background: 'var(--surface-raised)' }}>
                      <ScanDetailsView scan={s} details={d} errors={errors} />
                    </td>
                  </tr>
                ),
              ];
            })}
            {scans.length === 0 && (
              <tr>
                <td colSpan={11} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                  Ingen skann ennå.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScanDetailsView({
  scan,
  details: d,
  errors,
}: {
  scan: Scan;
  details: ScanDetails | null;
  errors: { scope: string; message: string }[];
}) {
  if (!d) {
    return (
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        Denne kjøringen er fra før detaljlogging ble innført: {scan.companies_found} funnet, {scan.financials_fetched}{' '}
        med regnskap hentet, {errors.length} feil.
      </p>
    );
  }
  const changed = d.changedCount ?? d.companies.length;
  // AI-only companies can show up as changed without being in the Brreg count.
  const unchanged = Math.max(0, d.brreg.processed - changed);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.8rem' }}>
      <p>
        {d.discovery.ran && (
          <>
            Enhetsregisteret: {d.discovery.found} maritime selskaper, {d.discovery.added} nye.{' '}
          </>
        )}
        Brreg: {d.brreg.processed} av {d.brreg.queued} i køen sjekket — {d.brreg.newFinancials} nye regnskap,{' '}
        {d.brreg.ceoSet} daglig leder funnet, {d.brreg.ceoChanged} ny daglig leder, {d.brreg.boardUpdated} styrer
        oppdatert, {d.brreg.scoreChanged} endret score.{' '}
        {d.ai.enabled ? (
          <>
            AI: {d.ai.processed} selskaper — {d.ai.analyses} vurderinger, {d.ai.websitesFound} nettsider funnet,
            kontakter hos {d.ai.contactCompanies} ({d.ai.contactPeople} personer).
          </>
        ) : (
          <span className="muted">AI-trinnet er av (GEMINI_API_KEY mangler).</span>
        )}{' '}
        <span className="muted">Tok {Math.round(d.tookMs / 1000)} s.</span>
      </p>

      {d.companies.length > 0 ? (
        <div>
          <p style={{ fontWeight: 600, marginBottom: 6 }}>
            Endringer i {changed} selskaper
            {changed > d.companies.length && <span className="muted" style={{ fontWeight: 400 }}> (viser {d.companies.length})</span>}
            {unchanged > 0 && <span className="muted" style={{ fontWeight: 400 }}> · {unchanged} sjekket uten endring</span>}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '6px 20px' }}>
            {d.companies.map((c) => (
              <div key={c.orgnr} style={{ minWidth: 0 }}>
                <Link href={`/company/${c.orgnr}`} className="link-accent" style={{ fontWeight: 600 }}>
                  {c.name}
                </Link>
                <span className="muted"> — {c.changes.join(' · ')}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="muted">Ingen endringer — alt som ble sjekket var allerede oppdatert.</p>
      )}

      {errors.length > 0 && (
        <div>
          <p style={{ fontWeight: 600, marginBottom: 6, color: 'var(--negative)' }}>{errors.length} feil</p>
          <ul className="muted" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {errors.slice(0, 30).map((e, i) => (
              <li key={i}>
                <span className="num">{e.scope}</span>: {e.message}
              </li>
            ))}
            {errors.length > 30 && <li>… og {errors.length - 30} til</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
