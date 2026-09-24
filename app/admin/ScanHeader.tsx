'use client';

import { useState, type ReactNode } from 'react';
import RunScanButton from './RunScanButton';
import RunAiQueueButton from './RunAiQueueButton';

// The Skann box header: title + scope on the left, the run buttons on the
// right, and whatever the buttons report (last result, AI-queue progress)
// on a line underneath — only while there's something to say.
export default function ScanHeader({
  meta,
  aiEnabled,
  aiRemaining,
  info,
  tabs,
}: {
  meta: string;
  aiEnabled: boolean;
  aiRemaining: number;
  /** How a scan works — shown in a hover/focus popover behind the (i) icon. */
  info: ReactNode;
  /** Oversikt / Siste skann view toggles — plain links, rendered left of the run buttons. */
  tabs: ReactNode;
}) {
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const lines = [scanStatus, aiStatus].filter(Boolean);

  return (
    <>
      <div className="box-header" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
          <span className="box-title">Skann</span>
          <span className="info-tip" tabIndex={0} aria-label="Om skanningen">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-5" />
              <path d="M12 8h.01" />
            </svg>
            <span className="info-tip-panel" role="tooltip">
              {info}
            </span>
          </span>
          <span className="muted" style={{ fontSize: '0.75rem' }}>{meta}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {tabs}
          <span aria-hidden="true" style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
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
