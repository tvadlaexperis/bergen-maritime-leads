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
        setError(e instanceof Error ? e.message : 'Kunne ikke lage lenke.');
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
        En innloggingslenke til den felles <strong>gjestekontoen</strong> (kun lesetilgang). Alle som har
        lenken blir logget inn som leser til den utløper.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            className={`chip${days === d ? ' active' : ''}`}
            onClick={() => setDays(d)}
            disabled={busy}
          >
            {d} dager
          </button>
        ))}
        <button className="btn btn-primary btn-sm" onClick={generate} disabled={busy}>
          {busy ? 'Lager lenke…' : 'Lag lenke'}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {url && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            aria-label="Gjestelenke"
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
            {copied ? 'Kopiert' : 'Kopier'}
          </button>
          <a className="btn btn-ghost btn-sm" href={`mailto:?subject=${encodeURIComponent('Tilgang til Maritim Bergen')}&body=${encodeURIComponent(url)}`}>
            Send på e-post
          </a>
        </div>
      )}
    </div>
  );
}
