'use client';

import { useState } from 'react';
import RunScanButton from './RunScanButton';
import RunAiQueueButton from './RunAiQueueButton';

// The Skann box header: title + scope on the left, the run buttons on the
// right, and whatever the buttons report (last result, AI-queue progress)
// on a line underneath — only while there's something to say.
export default function ScanHeader({
  meta,
  aiEnabled,
  aiRemaining,
}: {
  meta: string;
  aiEnabled: boolean;
  aiRemaining: number;
}) {
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const lines = [scanStatus, aiStatus].filter(Boolean);

  return (
    <>
      <div className="box-header" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
          <span className="box-title">Skann</span>
          <span className="muted" style={{ fontSize: '0.75rem' }}>{meta}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <RunScanButton onStatus={setScanStatus} />
          {aiEnabled && <RunAiQueueButton initialRemaining={aiRemaining} onStatus={setAiStatus} />}
        </div>
      </div>
      {lines.length > 0 && (
        <div
          className="muted"
          style={{ padding: '8px 18px', fontSize: '0.78rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}
        >
          {lines.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      )}
    </>
  );
}
