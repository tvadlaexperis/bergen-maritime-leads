'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { refreshCompanyAction } from '@/app/admin/actions';

// Kicks off the same refresh as the "Oppdater fra registrene" button, once,
// the first time an admin opens a company that hasn't been analyzed yet —
// instead of making them wait for it to reach the front of the nightly
// cron's rotating batch. page.tsx only renders this when ai_analysis is
// still empty and last_refreshed_at is stale, so it won't re-fire on every
// view of a company whose analysis keeps failing (e.g. GEMINI_API_KEY unset).
export default function AutoRefreshTrigger({ orgnr }: { orgnr: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setRunning(true);
    refreshCompanyAction(orgnr).finally(() => {
      setRunning(false);
      router.refresh();
    });
  }, [orgnr, router]);

  if (!running) return null;
  return (
    <p className="muted" style={{ fontSize: '0.78rem' }}>
      Henter ferske tall og AI-vurdering for dette selskapet …
    </p>
  );
}
