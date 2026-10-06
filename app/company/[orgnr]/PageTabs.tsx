'use client';

import { useState } from 'react';
import type { BoxTab } from './BoxTabs';

// Page-level tabs under the company header. Returns a fragment so the active
// tab's .split-scroll stays a direct child of .page-fill (the layout CSS
// relies on that). Content is server-rendered and handed in as slots.
export default function PageTabs({ tabs }: { tabs: BoxTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <>
      <div role="tablist" className="page-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === current?.key}
            className={`page-tab${t.key === current?.key ? ' active' : ''}`}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current?.content}
    </>
  );
}
