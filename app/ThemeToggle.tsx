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

// `variant="menu-item"` renders as a full-width row (for inside ProfileMenu's
// dropdown) instead of the standalone header icon button.
export default function ThemeToggle({ initial, variant = 'icon' }: { initial: ThemePref; variant?: 'icon' | 'menu-item' }) {
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

  const icon = (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4a1 1 0 0 0-1.3-1.2A10 10 0 1 0 21.2 15.8 1 1 0 0 0 20 14.5z"
        fill={dark ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (variant === 'menu-item') {
    return (
      <button
        type="button"
        className="profile-panel-link"
        onClick={toggle}
        aria-pressed={dark}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
      >
        {icon}
        {dark ? 'Lys modus' : 'Mørk modus'}
      </button>
    );
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
      {icon}
    </button>
  );
}
