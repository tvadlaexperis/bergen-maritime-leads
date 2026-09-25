'use client';

import { useState, type ReactNode } from 'react';

export interface BoxTab {
  key: string;
  label: string;
  content: ReactNode;
}

// A box header with a title and chip tabs, and the selected tab's body below.
// Every tab's content is rendered server-side and handed in as a slot — this
// only toggles which one is visible.
export default function BoxTabs({ title, tabs }: { title: string; tabs: BoxTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <>
      <div className="box-header" style={{ alignItems: 'center' }}>
        <span className="box-title">{title}</span>
        <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === current?.key}
              className={`chip-tab${t.key === current?.key ? ' active' : ''}`}
              onClick={() => setActive(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="box-pad" role="tabpanel">
        {current?.content}
      </div>
    </>
  );
}
