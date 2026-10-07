'use client';

import type { ReactNode } from 'react';

/** Window event PageTabs listens for: detail = { tab, anchor? }. */
export const GOTO_TAB_EVENT = 'company-goto-tab';

// A card elsewhere on the page that opens another page tab (and scrolls to
// `anchor` in it) — e.g. a challenge on Salg → «Utfordringer i bransjen».
export default function GoToTab({ tab, anchor, className, children }: { tab: string; anchor?: string; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new CustomEvent(GOTO_TAB_EVENT, { detail: { tab, anchor } }))}
    >
      {children}
    </button>
  );
}
