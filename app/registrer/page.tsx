'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';

// Self sign-up. The account waits for an admin's approval before it can log in.
export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError('Passordene er ikke like.');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || 'Registreringen feilet.');
      setDone(true);
    } catch {
      setError('Noe gikk galt — prøv igjen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-scroll" style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
      {done ? (
        <div className="box box-pad" style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Takk — kontoen er registrert</h1>
          <p style={{ fontSize: '0.88rem', lineHeight: 1.55 }}>
            En administrator må godkjenne kontoen før du kan logge inn. Du kan logge inn så snart den er godkjent.
          </p>
          <Link href="/login" className="btn btn-primary" style={{ justifyContent: 'center' }}>
            Til innlogging
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="box box-pad" style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h1 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Registrer deg</h1>
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              Internt verktøy — nye kontoer godkjennes av en administrator før første innlogging.
            </p>
          </div>
          <label className="field">
            Navn
            <input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          <label className="field">
            E-post (jobb)
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            Passord <span className="muted">(minst 10 tegn)</span>
            <input type="password" required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="field">
            Gjenta passord
            <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'Registrerer …' : 'Registrer'}
          </button>
          <p className="muted" style={{ fontSize: '0.8rem', textAlign: 'center' }}>
            Har du konto?{' '}
            <Link href="/login" className="link-accent">
              Logg inn
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
