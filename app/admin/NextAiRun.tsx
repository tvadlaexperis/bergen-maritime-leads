'use client';

import { useEffect, useState } from 'react';
import type { AiStepSetup } from '@/lib/orchestrator/providers/ai';
import { START_AI_EVENT } from './RunUpdateAllButton';

// At the top of «Siste kjøringer»: what the next AI run will do — each step,
// which API and model, and what it costs — with a confirm button that starts
// it (same run as the «AI-vurdering» button). Hidden while a run is going.
export default function NextAiRun({ setup, remaining }: { setup: AiStepSetup[]; remaining: number }) {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setRunning(!!(e as CustomEvent<{ running?: boolean } | null>).detail?.running);
    window.addEventListener('admin-live-run', on);
    return () => window.removeEventListener('admin-live-run', on);
  }, []);
  if (running || remaining === 0) return null;

  return (
    <div className="box box-pad" style={{ gap: 10, borderColor: 'var(--accent-border)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.9rem' }}>Neste AI-kjøring — hva som vil skje</strong>
        <span className="muted" style={{ fontSize: '0.8rem' }}>
          {remaining} selskaper i køen, høyest lead-score først · ca. 12 selskaper per minutt · kjører så lenge siden er
          åpen
        </span>
      </div>
      <table className="table" style={{ fontSize: '0.8rem' }}>
        <thead>
          <tr>
            <th>Steg</th>
            <th>API</th>
            <th>Modell</th>
            <th>Kostnad</th>
          </tr>
        </thead>
        <tbody>
          {setup.map((x) => (
            <tr key={x.step}>
              <td>{x.step}</td>
              <td className="muted">{x.api}</td>
              <td className="num">{x.model}</td>
              <td className="muted">{x.cost}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" onClick={() => window.dispatchEvent(new Event(START_AI_EVENT))}>
          Bekreft og start AI-vurdering
        </button>
        <span className="muted" style={{ fontSize: '0.78rem' }}>
          Koster penger. Stopper av seg selv hvis kreditten er brukt opp, og kan stoppes underveis.
        </span>
      </div>
    </div>
  );
}
