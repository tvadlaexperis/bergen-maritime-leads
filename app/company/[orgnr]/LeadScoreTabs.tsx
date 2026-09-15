'use client';

import { useState, type ReactNode } from 'react';

// Both tabs are rendered server-side and handed in as slots — this component
// only toggles which one is visible, so no client data fetching is needed.
export default function LeadScoreTabs({
  updatedLabel,
  aiTab,
  scoreTab,
}: {
  updatedLabel: string;
  aiTab: ReactNode;
  scoreTab: ReactNode;
}) {
  const [tab, setTab] = useState<'ai' | 'score'>('ai');

  return (
    <>
      <div className="box-header">
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className={`chip-tab${tab === 'ai' ? ' active' : ''}`} onClick={() => setTab('ai')}>
            Hvorfor aktuell
          </button>
          <button type="button" className={`chip-tab${tab === 'score' ? ' active' : ''}`} onClick={() => setTab('score')}>
            Score
          </button>
        </div>
        <span className="muted">{updatedLabel}</span>
      </div>
      <div className="box-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tab === 'ai' ? aiTab : scoreTab}
      </div>
    </>
  );
}
