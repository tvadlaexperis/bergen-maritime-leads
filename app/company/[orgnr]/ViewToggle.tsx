'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

// «Enkel / Delt» above the company links. Wide screens only (CSS hides it
// below 1400px, where the split wouldn't fit). Saved in a cookie for a year.
export default function ViewToggle({ view }: { view: 'enkel' | 'delt' }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const set = (v: 'enkel' | 'delt') => {
    if (v === view) return;
    document.cookie = `company_view=${v}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  };
  return (
    <div className="view-toggle" role="group" aria-label="Visning" aria-busy={pending}>
      <button type="button" className={view === 'enkel' ? 'active' : ''} aria-pressed={view === 'enkel'} onClick={() => set('enkel')} title="Bare selskapet">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
        Enkel
      </button>
      <button type="button" className={view === 'delt' ? 'active' : ''} aria-pressed={view === 'delt'} onClick={() => set('delt')} title="Selskapslisten til venstre">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16" />
        </svg>
        Delt
      </button>
    </div>
  );
}
