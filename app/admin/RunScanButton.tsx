'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { runScanAction } from './actions';
import ConfirmDialog from './ConfirmDialog';
import { publishLiveRun } from './LiveRun';

// «Oppdater fra Brreg»: free. The first run also looks for new companies in
// the register; then runs back to back (each ≤60s) until every company has
// been checked in the last 3 days. Never touches Gemini.
export default function RunScanButton({
  initialStale,
  onStatus,
}: {
  initialStale: number;
  onStatus: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [ask, setAsk] = useState(false);
  const [stale, setStale] = useState(initialStale);
  const stopRef = useRef(false);

  async function run() {
    stopRef.current = false;
    setRunning(true);
    let checked = 0;
    let added = 0;
    let financials = 0;
    const live = (running: boolean, status: string) =>
      publishLiveRun({
        title: running ? 'Oppdatering fra Brreg pågår' : 'Oppdatering fra Brreg ferdig',
        running,
        status,
        error: null,
        steps: [
          { label: 'Selskaper sjekket', service: 'Brønnøysundregistrene', cost: 'gratis', done: checked },
          { label: 'Nye selskaper', service: 'Enhetsregisteret', cost: 'gratis', done: added },
          { label: 'Nye regnskap', service: 'Regnskapsregisteret', cost: 'gratis', done: financials },
        ],
      });
    try {
      for (let i = 0; i < 20 && !stopRef.current; i++) {
        live(true, `kjøring ${i + 1}${i === 0 ? ' · leter også etter nye selskaper' : ''}`);
        const r = await runScanAction(i === 0);
        checked += r.processed;
        added += r.added;
        financials += r.newFinancials;
        setStale(r.staleRemaining);
        router.refresh();
        if (r.staleRemaining === 0 || r.processed === 0) break;
      }
      live(false, stopRef.current ? 'stoppet' : 'alle er sjekket');
    } catch {
      onStatus('Brreg-oppdateringen feilet — prøv igjen, eller se loggen under.');
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  if (running) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => (stopRef.current = true)}>
        Stopp Brreg
      </button>
    );
  }
  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setAsk(true)}>
        Oppdater fra Brreg{stale > 0 ? ` (${stale})` : ''}
      </button>
      <ConfirmDialog
        open={ask}
        title="Oppdater fra Brreg"
        confirmLabel="Start"
        onCancel={() => setAsk(false)}
        onConfirm={() => {
          setAsk(false);
          run();
        }}
      >
        <p>
          Leter etter nye maritime selskaper i Brønnøysundregistrene, og henter regnskap, daglig leder, styre, e-post,
          konsern og lead-score for alle som ikke er sjekket de siste 3 dagene{stale > 0 ? ` (${stale} nå)` : ''}.
        </p>
        <p>Tar noen minutter. Kjører så lenge siden er åpen, og kan stoppes underveis.</p>
        <p className="muted">Gratis. Bruker ikke AI (Gemini).</p>
      </ConfirmDialog>
    </>
  );
}
