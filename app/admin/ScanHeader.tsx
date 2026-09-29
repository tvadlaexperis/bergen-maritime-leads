import type { ReactNode } from 'react';

// A run panel's box header: title, an (i) explaining how scans work, and
// the scan scope. The run buttons live in RunControls at the top of the tab.
export default function ScanHeader({
  meta,
  info,
  title = 'Kjøringer',
  nav,
}: {
  title?: string;
  /** Run navigation (← → and which run is shown), next to the title. */
  nav?: ReactNode;
  meta: string;
  /** How a scan works — shown in a hover/focus popover behind the (i) icon. */
  info: ReactNode;
}) {
  return (
      <div className="box-header" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
          <span className="box-title">{title}</span>
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
          {nav}
          <span className="muted" style={{ fontSize: '0.75rem' }}>{meta}</span>
        </div>
      </div>
  );
}
