'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Notification, UserNotification } from '@/lib/db';
import { markMyNotificationsReadAction } from './venner/actions';
import { agoLabel } from './format';
import { markNotificationsReadAction } from './notificationsActions';

// Server-rendered on every navigation (layout.tsx fetches fresh data each
// request), so no client-side polling — the list is only ever as stale as
// the last page the user loaded, which is frequent enough for an internal
// tool a handful of people check throughout the day.
export default function NotificationsBell({
  initial,
  initialUnread,
  personal = [],
}: {
  initial: Notification[];
  initialUnread: number;
  /** Friend requests and companies shared with you — shown first. */
  personal?: UserNotification[];
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      startTransition(async () => {
        await Promise.all([markNotificationsReadAction(), personal.length ? markMyNotificationsReadAction() : null]);
        router.refresh();
      });
    }
  }

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
        onClick={toggle}
        aria-label="Varsler"
        aria-pressed={open}
        title="Siste oppdateringer"
      >
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 16v-5a6 6 0 0 0-12 0v5l-1.5 2.5h15L18 16z" strokeLinejoin="round" />
          <path d="M10 21a2 2 0 0 0 4 0" strokeLinecap="round" />
        </svg>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          {personal.length > 0 && (
            <>
              <div className="notif-panel-header">Til deg</div>
              <ul className="notif-list">
                {personal.map((n) => (
                  <li key={`u${n.id}`}>
                    <Link
                      href={n.type === 'company_shared' && n.orgnr ? `/company/${n.orgnr}` : '/venner'}
                      className={`notif-item${n.read_at ? '' : ' notif-item-new'}`}
                      onClick={() => setOpen(false)}
                    >
                      <span className="notif-company">
                        {n.type === 'company_shared' ? n.company_name : n.actor_name}
                      </span>
                      <span className="notif-message">
                        {n.type === 'company_shared'
                          ? `${n.actor_name} sendte deg dette selskapet`
                          : n.type === 'friend_request'
                            ? 'vil bli venn med deg'
                            : 'godtok venneforespørselen din'}
                      </span>
                      {n.message && <span className="notif-note">«{n.message}»</span>}
                      <span className="notif-time muted">{agoLabel(n.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="notif-panel-header">Siste oppdateringer</div>
          {initial.length === 0 ? (
            <p className="muted" style={{ padding: '10px 14px', fontSize: '0.82rem' }}>
              Ingen varsler ennå.
            </p>
          ) : (
            <ul className="notif-list">
              {initial.map((n) => (
                <li key={n.id}>
                  <Link href={`/company/${n.orgnr}`} className="notif-item" onClick={() => setOpen(false)}>
                    <span className="notif-company">{n.company_name}</span>
                    <span className="notif-message">{n.message}</span>
                    <span className="notif-time muted">{agoLabel(n.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
