'use client';

import { useEffect, useState } from 'react';

// A run in progress, shown at the top of «Siste kjøringer» while the page
// drives it (RunScanButton / RunUpdateAllButton publish progress through a
// window event — the buttons and the run panel sit far apart in the tree).
// Each step says which service it calls and whether that costs money.

export interface LiveStep {
  label: string; // "AI-vurdering"
  service: string; // "Gemini (Google)"
  cost: 'gratis' | 'betalt' | 'betalt, gratis reserve';
  done: number; // how many so far
}

export interface LiveRunState {
  title: string; // "AI-vurdering pågår"
  running: boolean;
  status: string | null; // "kjøring 3 · ca. 20 min igjen" / final message
  steps: LiveStep[];
  error: string | null; // latest error in plain words
}

const EVENT = 'admin-live-run';

export function publishLiveRun(state: LiveRunState | null) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: state }));
}

export default function LiveRun() {
  const [state, setState] = useState<LiveRunState | null>(null);
  useEffect(() => {
    const on = (e: Event) => setState((e as CustomEvent<LiveRunState | null>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  if (!state) return null;

  return (
    <div
      className="box box-pad"
      role="status"
      aria-live="polite"
      style={{ gap: 10, borderColor: state.running ? 'var(--accent-border)' : undefined, background: 'var(--accent-soft)' }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.9rem' }}>{state.title}</strong>
        {state.status && (
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            {state.status}
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
        {state.steps.map((s) => (
          <div key={s.label} className="box" style={{ padding: '10px 12px', gap: 3, display: 'flex', flexDirection: 'column' }}>
            <span className="num" style={{ fontSize: '1.15rem', fontWeight: 800, color: s.done ? 'var(--positive)' : 'var(--text-muted)' }}>
              {s.done}
            </span>
            <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{s.label}</span>
            <span className="muted" style={{ fontSize: '0.72rem' }}>
              {s.service} ·{' '}
              <span style={{ color: s.cost === 'gratis' ? 'var(--positive)' : 'var(--signal)' }}>{s.cost}</span>
            </span>
          </div>
        ))}
      </div>
      {state.error && (
        <p style={{ fontSize: '0.8rem', color: 'var(--negative)', overflowWrap: 'anywhere' }}>{state.error}</p>
      )}
    </div>
  );
}
