'use client';

import { useEffect, type ReactNode } from 'react';

// Small confirm popup for the scan buttons: says what a run does (and
// whether it costs anything) before it starts. Same look as the
// «Oppdater info» popup on the company page.
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '15vh 16px 16px',
        zIndex: 100,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="box"
        style={{ width: '100%', maxWidth: 440, textAlign: 'left' }}
      >
        <div className="box-header">
          <span className="box-title">{title}</span>
        </div>
        <div className="box-pad" style={{ fontSize: '0.85rem', lineHeight: 1.5, display: 'grid', gap: 8 }}>
          {children}
        </div>
        <div className="box-pad" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 0 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Avbryt
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
