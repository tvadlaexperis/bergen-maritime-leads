'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const AdminPanelContext = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null);

// Lets the "Oppdater info" button up in the header (far from the Admin
// content in the DOM) open a popup showing it, without a server round-trip —
// both just read/write the same client-side context.
export function AdminPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <AdminPanelContext.Provider value={{ open, setOpen }}>{children}</AdminPanelContext.Provider>;
}

function usePanel() {
  const ctx = useContext(AdminPanelContext);
  if (!ctx) throw new Error('AdminPanel components must be inside an AdminPanelProvider');
  return ctx;
}

export function AdminPanelToggle() {
  const { setOpen } = usePanel();
  return (
    <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
      Oppdater info
    </button>
  );
}

export function AdminPanelModal({ children }: { children: ReactNode }) {
  const { open, setOpen } = usePanel();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div
      role="presentation"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '10vh 16px 16px',
        zIndex: 100,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="box"
        style={{ width: '100%', maxWidth: 480, maxHeight: '75vh', overflowY: 'auto' }}
      >
        <div className="box-header">
          <span className="box-title">Oppdater info</span>
          <button type="button" className="chip" onClick={() => setOpen(false)} aria-label="Lukk">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
