'use client';

import { useState, type ReactNode } from 'react';

export interface TabDef {
  key: string;
  label: string;
  content: ReactNode;
}

// Every tab's content is rendered server-side and handed in as a slot — this
// component only toggles which one is visible, so no client data fetching.
export default function LeadScoreTabs({ tabs }: { tabs: TabDef[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <>
      <div className="box-header">
        <span className="box-title">Om selskapet</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`chip-tab${t.key === current?.key ? ' active' : ''}`}
              onClick={() => setActive(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="box-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 280 }}>
        {current?.content}
      </div>
    </>
  );
}
