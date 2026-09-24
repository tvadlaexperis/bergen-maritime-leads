'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runScanAction } from './actions';

// Buttons only — the result line is reported up via `onStatus` so the
// buttons can sit in the Skann header while the text renders below it.
export default function RunScanButton({ onStatus }: { onStatus: (msg: string | null) => void }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const setMsg = onStatus;

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
    <>
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(false)}>
        {busy ? 'Skanner…' : 'Kjør skann (neste bunt)'}
      </button>
      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(true)}>
        Full oppdatering
      </button>
    </>
  );
}
