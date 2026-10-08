'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';

// Header «Venner» menu (as on minmatside): your friends at a glance and a way
// to /venner. The badge counts friend requests waiting for an answer.
export default function FriendsMenu({ friends, pending }: { friends: { id: number; display_name: string }[]; pending: number }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative' }}
      tabIndex={-1}
      onBlur={(e) => {
        if (!wrapRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button type="button" className="icon-toggle" onClick={() => setOpen((o) => !o)} aria-label="Venner" aria-pressed={open} title="Venner">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="17" cy="8.5" r="2.4" />
          <path d="M15 13.3c2.5.2 4.5 2.3 4.5 5.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {pending > 0 && <span className="notif-badge">{pending > 9 ? '9+' : pending}</span>}
      </button>
      {open && (
        <div className="notif-panel" style={{ width: 260 }}>
          <div className="notif-panel-header">Venner</div>
          {pending > 0 && (
            <Link href="/venner" className="notif-item" onClick={() => setOpen(false)}>
              <span className="notif-company">
                {pending} venneforespørsel{pending > 1 ? 'er' : ''} venter
              </span>
            </Link>
          )}
          {friends.length === 0 ? (
            <p className="muted" style={{ padding: '10px 14px', fontSize: '0.82rem' }}>
              Ingen venner ennå.
            </p>
          ) : (
            <ul className="notif-list">
              {friends.map((f) => (
                <li key={f.id} className="friend-row">
                  <span className="friend-avatar">{initials(f.display_name)}</span>
                  {f.display_name}
                </li>
              ))}
            </ul>
          )}
          <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
            <Link href="/venner" className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setOpen(false)}>
              Administrer venner
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}
