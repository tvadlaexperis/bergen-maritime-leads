'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { runAiQueueAction, runScanAction } from './actions';

type Totals = { runs: number; processed: number; analyses: number; contacts: number; websites: number; errors: number };
const ZERO: Totals = { runs: 0, processed: 0, analyses: 0, contacts: 0, websites: 0, errors: 0 };

type Phase = 'brreg' | 'ai';

// «Oppdater alt»: the manual catch-up routine as one click. Phase 1 runs
// normal scans until no company is left unchecked in Brreg for 3+ days
// (e-post, roller, regnskap, nettside fra e-postdomene); phase 2 runs AI-only
// scans until the AI queue is empty. One ≤60s server run after another, for
// as long as this page stays open. Stopping only takes effect between runs —
// the one in flight always finishes and gets logged.
export default function RunUpdateAllButton({
  initialStale,
  initialRemaining,
  aiEnabled,
  onStatus,
}: {
  initialStale: number;
  initialRemaining: number;
  aiEnabled: boolean;
  onStatus: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [totals, setTotals] = useState<Totals>(ZERO);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [stale, setStale] = useState(initialStale);
  const [phase, setPhase] = useState<Phase>('brreg');
  const [brregChecked, setBrregChecked] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [waitLeft, setWaitLeft] = useState(0);
  const stopRef = useRef(false);

  // Interruptible pause — "Stopp" during a rate-limit wait ends it at once.
  async function pause(seconds: number) {
    for (let left = seconds; left > 0 && !stopRef.current; left--) {
      setWaitLeft(left);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setWaitLeft(0);
  }

  async function run() {
    stopRef.current = false;
    setRunning(true);
    setStopping(false);
    setMsg(null);
    let t = ZERO;
    setTotals(t);
    setBrregChecked(0);
    let idleRuns = 0;
    let rateLimitWaits = 0;
    try {
      // Phase 1 — Brreg. Stops when nothing is stale, or when a run checks
      // nobody (everything left is already fresh, or Brreg is failing).
      setPhase('brreg');
      let checked = 0;
      for (let i = 0; i < 10 && !stopRef.current; i++) {
        const r = await runScanAction(false);
        checked += r.processed;
        setBrregChecked(checked);
        setStale(r.staleRemaining);
        router.refresh();
        if (r.staleRemaining === 0 || r.processed === 0) break;
      }
      if (!aiEnabled) {
        if (!stopRef.current) setMsg('Ferdig — alle selskaper er sjekket i Brreg (AI er ikke konfigurert).');
        return;
      }

      // Phase 2 — AI queue.
      setPhase('ai');
      while (!stopRef.current) {
        const r = await runAiQueueAction();
        if ('error' in r) {
          setMsg(r.error);
          break;
        }
        t = {
          runs: t.runs + 1,
          processed: t.processed + r.processed,
          analyses: t.analyses + r.analyses,
          contacts: t.contacts + r.contacts,
          websites: t.websites + r.websites,
          errors: t.errors + r.errors,
        };
        setTotals(t);
        setRemaining(r.remaining);
        router.refresh();
        if (r.remaining === 0) {
          setMsg('Ferdig — alle selskaper er AI-vurdert og alle kjente nettsider er lest.');
          break;
        }
        // Gemini's per-minute quota: back off and carry on rather than stop,
        // up to a point — five waits in a row means the daily quota is gone.
        if (r.rateLimited && r.analyses === 0 && r.scraped === 0) {
          rateLimitWaits++;
          if (rateLimitWaits > 5) {
            setMsg(`Stoppet: Gemini avviser fortsatt (kvote brukt opp?). ${r.firstError ?? ''}`);
            break;
          }
          setMsg('Gemini-kvoten er nådd — venter før neste kjøring.');
          await pause(60);
          continue;
        }
        rateLimitWaits = 0;
        // Two runs in a row with nothing done — no analysis and no website
        // read (and not a rate limit) — means something is actually broken.
        idleRuns = r.analyses === 0 && r.scraped === 0 ? idleRuns + 1 : 0;
        if (idleRuns >= 2) {
          setMsg(`Stoppet: to kjøringer på rad uten AI-vurdering. Første feil: ${r.firstError ?? 'ingen feil registrert'}`);
          break;
        }
        setMsg(null);
      }
      if (stopRef.current) setMsg('Stoppet.');
    } catch {
      setMsg('Kjøringen feilet — prøv igjen, eller se «Siste skann».');
    } finally {
      setRunning(false);
      setStopping(false);
      router.refresh();
    }
  }

  // Status is reported up (see ScanHeader) rather than rendered here, so
  // this can sit in the header next to the other scan buttons.
  let status: string | null = null;
  if (running || totals.runs > 0 || brregChecked > 0) {
    const brregPart = `Brreg: ${brregChecked} sjekket, ${stale} gjenstår`;
    const aiPart = `AI: ${totals.analyses} vurdert, ${totals.websites} nettsider, kontakter hos ${totals.contacts}${
      totals.errors ? `, ${totals.errors} feil` : ''
    }, ${remaining} igjen`;
    const now = !running
      ? null
      : waitLeft > 0
        ? `venter ${waitLeft} s`
        : phase === 'brreg'
          ? 'trinn 1/2: Brønnøysund pågår'
          : `trinn 2/2: AI-kjøring ${totals.runs + 1} pågår${
              totals.runs > 0 && totals.processed > 0
                ? ` (ca. ${Math.ceil(remaining / (totals.processed / totals.runs))} min igjen)`
                : ''
            }`;
    status = ['Oppdater alt', now, brregPart, phase === 'ai' || totals.runs > 0 ? aiPart : null, msg]
      .filter(Boolean)
      .join(' · ');
  } else if (msg) {
    status = msg;
  }
  useEffect(() => onStatus(status), [status, onStatus]);

  return running ? (
    <button
      className="btn btn-ghost btn-sm"
      disabled={stopping}
      onClick={() => {
        stopRef.current = true;
        setStopping(true);
      }}
    >
      {stopping ? 'Stopper…' : 'Stopp oppdatering'}
    </button>
  ) : (
    <button
      className="btn btn-ghost btn-sm"
      disabled={stale === 0 && (!aiEnabled || remaining === 0)}
      onClick={run}
      title="Kjører Brreg til alle er sjekket, deretter AI-køen til den er tom — så lenge siden er åpen"
    >
      Oppdater alt ({stale + (aiEnabled ? remaining : 0)} igjen)
    </button>
  );
}
