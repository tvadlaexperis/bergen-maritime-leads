'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import LogoutButton from './LogoutButton';

// The old header showed the display name as plain text next to a standalone
// "Log out" button, with no link to /admin at all — the "Admin" a user
// might have spotted there was actually just the seeded admin account's
// display name (literally "Admin"), not a nav link. This folds user info,
// the actual admin-panel link, and logout into one discoverable place.
export default function ProfileMenu({
  user,
}: {
  user: { displayName: string; email: string; role: 'viewer' | 'admin' };
}) {
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
      <button
        type="button"
        className="icon-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label="Profil"
        aria-pressed={open}
        title={user.displayName}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="8" r="3.6" />
          <path d="M4.5 20c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="notif-panel" style={{ width: 260 }}>
          <div className="profile-panel-header">
            <div className="profile-name">{user.displayName}</div>
            <div className="profile-email muted">{user.email}</div>
            <span className="profile-role-badge">{user.role === 'admin' ? 'Admin' : 'Viser'}</span>
          </div>
          <div className="profile-panel-body">
            {user.role === 'admin' && (
              <Link href="/admin" className="profile-panel-link" onClick={() => setOpen(false)}>
                Admin-panel
              </Link>
            )}
            <div style={{ padding: '8px 14px 10px' }}>
              <LogoutButton />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
