'use client';

import { useState } from 'react';
import RunScanButton from './RunScanButton';
import RunUpdateAllButton from './RunUpdateAllButton';

// The run buttons at the top of the Datakvalitet tab, with whatever they
// report (progress, last result) on a line underneath while there's
// something to say. Split by cost: Brreg is free and primary, AI costs money.
export default function RunControls({
  aiEnabled,
  aiService,
  aiRemaining,
  brregStale,
}: {
  aiEnabled: boolean;
  aiService: string;
  aiRemaining: number;
  brregStale: number;
}) {
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const lines = [scanStatus, aiStatus].filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <RunScanButton initialStale={brregStale} onStatus={setScanStatus} />
        <RunUpdateAllButton initialRemaining={aiRemaining} aiEnabled={aiEnabled} aiService={aiService} onStatus={setAiStatus} />
      </div>
      {lines.map((l) => (
        <div key={l} className="muted" style={{ fontSize: '0.78rem', textAlign: 'left' }}>
          {l}
        </div>
      ))}
    </div>
  );
}
