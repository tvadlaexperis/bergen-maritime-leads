'use client';

import { useRef, useState } from 'react';
import AddCompanyForm from './AddCompanyForm';
import GuestLinkPanel from './GuestLinkPanel';

// Used rarely enough (adding a one-off company, generating a guest link)
// that they don't need permanent screen space next to the two boxes admins
// actually check daily (Skann, Logg) — tucked behind a header button instead.
export default function AdminToolsMenu() {
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
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} aria-pressed={open}>
        Flere verktøy
      </button>
      {open && (
        <div className="notif-panel" style={{ width: 380, right: 0 }}>
          <div className="box-header">
            <span className="box-title">Legg til selskap manuelt</span>
          </div>
          <div className="box-pad">
            <AddCompanyForm />
          </div>
          <div className="box-header">
            <span className="box-title">Gjestelenke</span>
          </div>
          <div className="box-pad">
            <GuestLinkPanel />
          </div>
        </div>
      )}
    </div>
  );
}
