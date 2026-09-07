'use client';

import { useEffect, useState } from 'react';
import type { ThemePref } from '@/lib/theme';

const YEAR = 60 * 60 * 24 * 365;

function currentlyDark(pref: ThemePref): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  if (typeof window !== 'undefined') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }
  return false;
}

export default function ThemeToggle({ initial }: { initial: ThemePref }) {
  const [dark, setDark] = useState(() => currentlyDark(initial));

  // If we're following the OS ("system"), sync the button to it after mount
  // (the server can't know the OS preference).
  useEffect(() => {
    if (initial === 'system') setDark(currentlyDark('system'));
  }, [initial]);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    document.cookie = `theme=${next ? 'dark' : 'light'}; path=/; max-age=${YEAR}; samesite=lax`;
  }

  return (
    <button
      type="button"
      className="icon-toggle"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
        <path
          d="M20 14.5A8.5 8.5 0 0 1 9.5 4a1 1 0 0 0-1.3-1.2A10 10 0 1 0 21.2 15.8 1 1 0 0 0 20 14.5z"
          fill={dark ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
