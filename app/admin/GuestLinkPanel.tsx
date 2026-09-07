'use client';

import { useState, useTransition } from 'react';
import { generateGuestLinkAction } from './actions';

export default function GuestLinkPanel() {
  const [days, setDays] = useState(30);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, start] = useTransition();

  function generate() {
    setError(null);
    setUrl(null);
    setCopied(false);
    start(async () => {
      try {
        const r = await generateGuestLinkAction(days);
        if (r.error) setError(r.error);
        else setUrl(r.url ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not generate a link.');
      }
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the field is selectable */
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="muted" style={{ fontSize: '0.78rem' }}>
        A one-click sign-in link for the shared <strong>guest</strong> account (read-only). Anyone
        with the link is signed in as a viewer until it expires.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            className={`chip${days === d ? ' active' : ''}`}
            onClick={() => setDays(d)}
            disabled={busy}
          >
            {d} days
          </button>
        ))}
        <button className="btn btn-primary btn-sm" onClick={generate} disabled={busy}>
          {busy ? 'Generating…' : 'Generate link'}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {url && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            aria-label="Guest link"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              flex: 1,
              minWidth: 260,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              background: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-control)',
              padding: '8px 10px',
              color: 'var(--text-primary)',
            }}
          />
          <button className="btn btn-ghost btn-sm" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <a className="btn btn-ghost btn-sm" href={`mailto:?subject=Ship%20Predictions%20access&body=${encodeURIComponent(url)}`}>
            Email
          </a>
        </div>
      )}
    </div>
  );
}
