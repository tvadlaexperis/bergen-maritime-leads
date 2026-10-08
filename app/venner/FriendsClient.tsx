'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Friend, FriendRequest, UserSearchResult } from '@/lib/db';
import { initials } from '@/app/FriendsMenu';
import { searchUsersAction, sendFriendRequestAction, respondFriendRequestAction, removeFriendshipAction } from './actions';

// /venner — the minmatside friends page: find people, answer requests, see
// what you've sent, and your friends. Lists come from the server; every
// action refreshes them (router.refresh) instead of patching local copies.
export default function FriendsClient({
  friends,
  requests,
  sent,
}: {
  friends: (Friend & { friendship_id: number })[];
  requests: FriendRequest[];
  sent: FriendRequest[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => startTransition(() => router.refresh());

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (query.trim().length < 2) return setResults(null);
    setSearching(true);
    try {
      setResults(await searchUsersAction(query));
    } catch {
      setError('Søket feilet — prøv igjen.');
    } finally {
      setSearching(false);
    }
  }

  async function run(key: number, fn: () => Promise<{ error?: string }>, after?: () => void) {
    setBusy(key);
    setError(null);
    try {
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        after?.();
        refresh();
      }
    } catch {
      setError('Noe gikk galt — prøv igjen.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 760, width: '100%' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Venner</h1>
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: -10 }}>
        Legg til kolleger som venner, så kan dere sende selskaper til hverandre. De dukker opp som varsel i bjella.
      </p>

      <section className="box">
        <div className="box-header">
          <span className="box-title">Finn kolleger</span>
        </div>
        <div className="box-pad" style={{ display: 'grid', gap: 12 }}>
          <form onSubmit={onSearch} style={{ display: 'flex', gap: 8 }}>
            <label className="field" style={{ flex: 1 }}>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Søk på navn eller e-post …"
                aria-label="Søk brukere"
              />
            </label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={searching}>
              {searching ? 'Søker …' : 'Søk'}
            </button>
          </form>
          {error && (
            <p role="alert" className="form-error" style={{ margin: 0 }}>
              {error}
            </p>
          )}
          {results && results.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>Fant ingen.</p>}
          {results?.map((r) => (
            <Person key={r.id} name={r.display_name} email={r.email}>
              {r.status === 'none' && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy === r.id}
                  onClick={() =>
                    run(r.id, () => sendFriendRequestAction(r.id), () =>
                      setResults((prev) => prev?.map((x) => (x.id === r.id ? { ...x, status: 'pending_sent' } : x)) ?? null),
                    )
                  }
                >
                  + Legg til venn
                </button>
              )}
              {r.status === 'pending_sent' && <span className="muted" style={{ fontSize: '0.8rem' }}>Forespørsel sendt</span>}
              {r.status === 'pending_received' && <span className="muted" style={{ fontSize: '0.8rem' }}>Har sendt deg en forespørsel</span>}
              {r.status === 'friends' && <span style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>Venner ✓</span>}
            </Person>
          ))}
        </div>
      </section>

      {requests.length > 0 && (
        <section className="box">
          <div className="box-header">
            <span className="box-title">Venneforespørsler</span>
          </div>
          <div className="box-pad" style={{ display: 'grid', gap: 8 }}>
            {requests.map((r) => (
              <Person key={r.friendship_id} name={r.display_name} email={r.email}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy === r.friendship_id}
                  onClick={() => run(r.friendship_id, () => respondFriendRequestAction(r.friendship_id, true))}
                >
                  Godta
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy === r.friendship_id}
                  onClick={() => run(r.friendship_id, () => respondFriendRequestAction(r.friendship_id, false))}
                >
                  Avslå
                </button>
              </Person>
            ))}
          </div>
        </section>
      )}

      {sent.length > 0 && (
        <section className="box">
          <div className="box-header">
            <span className="box-title">Sendte forespørsler</span>
          </div>
          <div className="box-pad" style={{ display: 'grid', gap: 8 }}>
            {sent.map((r) => (
              <Person key={r.friendship_id} name={r.display_name} email={r.email}>
                <span className="muted" style={{ fontSize: '0.78rem' }}>Venter på svar</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy === r.friendship_id}
                  onClick={() => run(r.friendship_id, () => removeFriendshipAction(r.friendship_id))}
                >
                  Trekk tilbake
                </button>
              </Person>
            ))}
          </div>
        </section>
      )}

      <section className="box">
        <div className="box-header">
          <span className="box-title">Venner{friends.length > 0 ? ` (${friends.length})` : ''}</span>
        </div>
        <div className="box-pad" style={{ display: 'grid', gap: 8 }}>
          {friends.length === 0 ? (
            <p className="muted" style={{ fontSize: '0.85rem' }}>Ingen venner ennå — søk over for å finne kolleger.</p>
          ) : (
            friends.map((f) => (
              <Person key={f.id} name={f.display_name} email={f.email}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy === f.friendship_id}
                  onClick={() => {
                    if (confirm(`Fjerne ${f.display_name} som venn?`)) run(f.friendship_id, () => removeFriendshipAction(f.friendship_id));
                  }}
                >
                  Fjern
                </button>
              </Person>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Person({ name, email, children }: { name: string; email: string; children: React.ReactNode }) {
  return (
    <div className="friend-card">
      <span className="friend-avatar">{initials(name)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{name}</div>
        <div className="muted" style={{ fontSize: '0.78rem' }}>{email}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{children}</div>
    </div>
  );
}
