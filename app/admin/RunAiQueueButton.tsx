'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { runAiQueueAction } from './actions';

type Totals = { runs: number; processed: number; analyses: number; contacts: number; websites: number; errors: number };
const ZERO: Totals = { runs: 0, processed: 0, analyses: 0, contacts: 0, websites: 0, errors: 0 };

// Drives the AI queue from the browser: one ≤60s server run after another,
// for as long as this page stays open. Stopping only takes effect between
// runs — the one in flight always finishes and gets logged.
export default function RunAiQueueButton({ initialRemaining }: { initialRemaining: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [totals, setTotals] = useState<Totals>(ZERO);
  const [remaining, setRemaining] = useState(initialRemaining);
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
    let idleRuns = 0;
    let rateLimitWaits = 0;
    try {
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
          setMsg('Ferdig — alle selskaper har vært gjennom AI-trinnet.');
          break;
        }
        // Gemini's per-minute quota: back off and carry on rather than stop,
        // up to a point — five waits in a row means the daily quota is gone.
        if (r.rateLimited && r.analyses === 0) {
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
        // Two runs in a row with no successful analysis (and not a rate
        // limit) means something is actually broken — stop and say what.
        idleRuns = r.analyses === 0 ? idleRuns + 1 : 0;
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

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      {running ? (
        <button
          className="btn btn-ghost btn-sm"
          disabled={stopping}
          onClick={() => {
            stopRef.current = true;
            setStopping(true);
          }}
        >
          {stopping ? 'Stopper etter denne kjøringen…' : 'Stopp AI-køen'}
        </button>
      ) : (
        <button className="btn btn-ghost btn-sm" disabled={remaining === 0} onClick={run}>
          Kjør AI-køen ({remaining} igjen)
        </button>
      )}
      {(running || totals.runs > 0) && (
        <span className="muted" style={{ fontSize: '0.78rem' }}>
          {running && (waitLeft > 0 ? <>Venter {waitLeft} s · </> : <>Kjøring {totals.runs + 1} pågår · </>)}
          {totals.analyses} vurdert, {totals.websites} nettsider, kontakter hos {totals.contacts}
          {totals.errors > 0 && <>, {totals.errors} feil</>} · {remaining} igjen
          {running && totals.runs > 0 && totals.processed > 0 && (
            <> · ca. {Math.ceil(remaining / (totals.processed / totals.runs))} min til</>
          )}
        </span>
      )}
      {msg && <span className="muted" style={{ fontSize: '0.78rem' }}>{msg}</span>}
    </div>
  );
}
