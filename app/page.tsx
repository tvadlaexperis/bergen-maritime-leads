import Link from 'next/link';
import { listCompaniesWithScore, listScans } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { agoLabel } from './format';
import CompanyList from './CompanyList';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [rows, scans, user] = await Promise.all([
    listCompaniesWithScore(),
    listScans(1),
    getCurrentUser(),
  ]);

  const active = rows.filter((r) => r.status === 'active');
  const scored = active.filter((r) => r.lead_score != null).length;
  const lastScan = scans[0];

  const subtitle = (
    <>
      {active.length} selskaper · {scored} scoret · sortert etter lead-score ·{' '}
      {lastScan ? `sist skannet ${agoLabel(lastScan.started_at)}` : 'ingen skann ennå'}
    </>
  );

  return (
    <div className="page-fill" style={{ gap: 16 }}>
      {active.length === 0 ? (
        <>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Maritim sektor i Bergen
            </h1>
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
              {subtitle}
            </p>
          </div>
          <div className="box box-pad muted">
            Ingen selskaper ennå. Kjør{' '}
            {user?.role === 'admin' ? (
              <Link href="/admin" className="link-accent">et skann fra Admin</Link>
            ) : (
              <code>npm run scan:local</code>
            )}
            .
          </div>
        </>
      ) : (
        <CompanyList
          rows={active}
          title="Maritim sektor i Bergen"
          subtitle={subtitle}
        />
      )}

      <p className="muted" style={{ fontSize: '0.72rem', flexShrink: 0 }}>
        Nøkkeltall fra Brønnøysundregistrene (Enhets- og Regnskapsregisteret). Lead-scoren er et
        automatisk estimat for salgsprioritering — ikke en vurdering av selskapet. Kun til intern bruk.
      </p>
    </div>
  );
}
