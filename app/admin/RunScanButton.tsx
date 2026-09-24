'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runScanAction } from './actions';

export default function RunScanButton() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run(full: boolean) {
    setMsg(null);
    start(async () => {
      try {
        const r = await runScanAction(full);
        setMsg(r.summary);
        router.refresh();
      } catch {
        setMsg('Skann feilet — sjekk loggene.');
      }
    });
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(false)}>
        {busy ? 'Skanner…' : 'Kjør skann (neste bunt)'}
      </button>
      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(true)}>
        Full oppdatering
      </button>
      {msg && <span className="muted" style={{ fontSize: '0.78rem' }}>{msg}</span>}
    </div>
  );
}
