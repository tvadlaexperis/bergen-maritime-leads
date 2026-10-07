'use client';

import { useEffect, useState } from 'react';
import { GOTO_TAB_EVENT } from './GoToTab';
import type { BoxTab } from './BoxTabs';

// Page-level tabs under the company header. Returns a fragment so the active
// tab's .split-scroll stays a direct child of .page-fill (the layout CSS
// relies on that). Content is server-rendered and handed in as slots.
export default function PageTabs({ tabs }: { tabs: BoxTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  // Cards on one tab can open another (GoToTab), optionally scrolling to an element in it.
  useEffect(() => {
    const on = (e: Event) => {
      const { tab, anchor } = (e as CustomEvent<{ tab: string; anchor?: string }>).detail;
      setActive(tab);
      if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };
    window.addEventListener(GOTO_TAB_EVENT, on);
    return () => window.removeEventListener(GOTO_TAB_EVENT, on);
  }, []);

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
