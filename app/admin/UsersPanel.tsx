'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { UserRow } from '@/lib/db';
import { approveUserAction, setUserRoleAction, deleteUserAction } from './usersActions';

// Admin → Brukere: sign-ups waiting for approval first, then everyone.
export default function UsersPanel({ users, me, guestEmail }: { users: UserRow[]; me: number; guestEmail: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: number, fn: () => Promise<{ error?: string }>) {
    setBusy(id);
    setError(null);
    try {
      const r = await fn();
      if (r.error) setError(r.error);
      else startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  const pending = users.filter((u) => u.status === 'pending');
  const active = users.filter((u) => u.status !== 'pending');
  const date = (ms: number) => new Date(ms).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 820 }}>
      {error && <p className="form-error" style={{ margin: 0 }}>{error}</p>}
      <div className="box">
        <div className="box-header">
          <span className="box-title">Venter på godkjenning ({pending.length})</span>
          <span className="muted" style={{ fontSize: '0.72rem' }}>registrert via /registrer</span>
        </div>
        <div className="box-pad" style={{ display: 'grid', gap: 8 }}>
          {pending.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>Ingen nye registreringer.</p>}
          {pending.map((u) => (
            <div key={u.id} className="friend-card">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{u.display_name}</div>
                <div className="muted" style={{ fontSize: '0.78rem' }}>
                  {u.email} · registrert {date(u.created_at)}
                </div>
              </div>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy === u.id} onClick={() => run(u.id, () => approveUserAction(u.id))}>
                Godkjenn
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy === u.id}
                onClick={() => confirm(`Avvise og slette registreringen til ${u.email}?`) && run(u.id, () => deleteUserAction(u.id))}
              >
                Avvis
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="box">
        <div className="box-header">
          <span className="box-title">Brukere ({active.length})</span>
        </div>
        <div className="box-pad" style={{ display: 'grid', gap: 8 }}>
          {active.map((u) => (
            <div key={u.id} className="friend-card">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                  {u.display_name} {u.id === me && <span className="muted" style={{ fontWeight: 400 }}>(deg)</span>}
                </div>
                <div className="muted" style={{ fontSize: '0.78rem' }}>{u.email}</div>
              </div>
              {u.id === me || u.email.toLowerCase() === guestEmail ? (
                <span className="muted" style={{ fontSize: '0.8rem' }}>
                  {u.email.toLowerCase() === guestEmail ? 'Gjestekonto' : u.role === 'admin' ? 'Admin' : 'Bruker'}
                </span>
              ) : (
                <>
                  <select
                    value={u.role}
                    disabled={busy === u.id}
                    onChange={(e) => run(u.id, () => setUserRoleAction(u.id, e.target.value as 'viewer' | 'admin'))}
                    aria-label={`Rolle for ${u.display_name}`}
                    className="role-select"
                  >
                    <option value="viewer">Bruker</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy === u.id}
                    onClick={() => confirm(`Slette brukeren ${u.email}? Kundekontakter de har registrert blir stående.`) && run(u.id, () => deleteUserAction(u.id))}
                  >
                    Slett
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
