'use client';

import { useState } from 'react';
import Link from 'next/link';
import RunScanButton from './RunScanButton';
import RunUpdateAllButton from './RunUpdateAllButton';

// The run buttons at the top of the Datakvalitet tab, with whatever they
// report (progress, last result) on a line underneath while there's
// something to say. Brreg (free) on the left; on the right the «Topp N»
// filter — it scopes the coverage boxes below and the AI run (paid) next to it.
export default function RunControls({
  aiEnabled,
  aiService,
  aiRemaining,
  brregStale,
  topN,
  topLinks,
}: {
  aiEnabled: boolean;
  aiService: string;
  aiRemaining: number;
  brregStale: number;
  topN: number | null;
  topLinks: { label: string; href: string; active: boolean }[];
}) {
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const lines = [scanStatus, aiStatus].filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <RunScanButton initialStale={brregStale} onStatus={setScanStatus} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: '0.78rem' }}>Høyest lead-score</span>
          {topLinks.map((l) => (
            <Link key={l.label} href={l.href} className={`chip${l.active ? ' active' : ''}`} aria-current={l.active || undefined}>
              {l.label}
            </Link>
          ))}
          <RunUpdateAllButton
            key={topN ?? 'alle'}
            initialRemaining={aiRemaining}
            topN={topN}
            aiEnabled={aiEnabled}
            aiService={aiService}
            onStatus={setAiStatus}
          />
        </div>
      </div>
      {lines.map((l) => (
        <div key={l} className="muted" style={{ fontSize: '0.78rem', textAlign: 'left' }}>
          {l}
        </div>
      ))}
    </div>
  );
}
