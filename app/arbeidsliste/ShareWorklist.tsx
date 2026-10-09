'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Friend } from '@/lib/db';
import { readWorklist } from '@/lib/worklist';
import { listFriendsAction, shareWorklistAction } from '@/app/venner/actions';

// «Del arbeidslisten» — sends a snapshot of this browser's work list to
// friends; they get it as a notification (Til deg) and can copy it.
export default function ShareWorklist() {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok?: string; error?: string } | null>(null);
  const [count, setCount] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setCount(readWorklist().size);
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    setResult(null);
    if (next && !friends) {
      try {
        setFriends(await listFriendsAction());
      } catch {
        setFriends([]);
      }
    }
  }

  async function send() {
    setSending(true);
    setResult(null);
    try {
      const r = await shareWorklistAction([...readWorklist()], picked, message);
      if (r.error) setResult({ error: r.error });
      else {
        setResult({ ok: `Sendt til ${r.sent} ${r.sent === 1 ? 'venn' : 'venner'}.` });
        setPicked([]);
        setMessage('');
      }
    } catch {
      setResult({ error: 'Noe gikk galt — prøv igjen.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={toggle} aria-expanded={open}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ marginRight: 6 }}>
          <path d="M22 2 11 13" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M22 2 15 22l-4-9-9-4 20-7Z" strokeLinejoin="round" />
        </svg>
        Del arbeidslisten
      </button>
      {open && (
        <div className="notif-panel share-panel">
          <div className="notif-panel-header">
            Send arbeidslisten ({count} selskap{count === 1 ? '' : 'er'}) til
          </div>
          <div style={{ padding: 12, display: 'grid', gap: 10 }}>
            {!friends && <p className="muted" style={{ fontSize: '0.84rem' }}>Laster …</p>}
            {friends && friends.length === 0 && (
              <p className="muted" style={{ fontSize: '0.84rem' }}>
                Ingen bekreftede venner ennå.{' '}
                <Link href="/venner" className="link-accent">
                  Legg til venner
                </Link>
              </p>
            )}
            {friends && friends.length > 0 && (
              <>
                <div style={{ display: 'grid', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
                  {friends.map((f) => (
                    <label key={f.id} className="share-friend">
                      <input
                        type="checkbox"
                        checked={picked.includes(f.id)}
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, f.id] : p.filter((x) => x !== f.id)))}
                      />
                      {f.display_name}
                    </label>
                  ))}
                </div>
                <label className="field">
                  <textarea
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={500}
                    placeholder="Melding (valgfritt)"
                    aria-label="Melding"
                  />
                </label>
                <button type="button" className="btn btn-primary btn-sm" disabled={sending || picked.length === 0 || count === 0} onClick={send}>
                  {sending ? 'Sender …' : 'Send'}
                </button>
                <p className="muted" style={{ fontSize: '0.74rem', margin: 0 }}>
                  Vennen får en kopi av listen slik den er nå, og kan legge selskapene til i sin egen.
                </p>
              </>
            )}
            {result?.ok && <p className="form-ok" style={{ margin: 0 }}>{result.ok}</p>}
            {result?.error && <p className="form-error" style={{ margin: 0 }}>{result.error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
