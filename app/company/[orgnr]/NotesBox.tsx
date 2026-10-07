'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { updateNotesAction } from '@/app/admin/actions';

// Internal notes. The pencil in the header switches to edit mode in place;
// saves through the same server action as the «Oppdater info» popup.
export default function NotesBox({ id, notes }: { id: number; notes: string }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useFormState(updateNotesAction, {});
  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state]);

  return (
    <div className="box">
      <div className="box-header">
        <span className="box-title">Notater</span>
        {!editing && (
          <button type="button" className="icon-btn" onClick={() => setEditing(true)} title="Rediger notater" aria-label="Rediger notater">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        )}
      </div>
      <div className="box-pad">
        {editing ? (
          <form action={action} style={{ display: 'grid', gap: 8 }}>
            <input type="hidden" name="id" value={id} />
            <label className="field">
              <textarea name="notes" rows={6} defaultValue={notes} autoFocus aria-label="Notater" />
            </label>
            {state.error && <p className="form-error" style={{ margin: 0 }}>{state.error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
                Avbryt
              </button>
              <SaveButton />
            </div>
          </form>
        ) : notes ? (
          <p style={{ whiteSpace: 'pre-line' }}>{notes}</p>
        ) : (
          <p className="muted" style={{ fontSize: '0.85rem' }}>Ingen notater ennå.</p>
        )}
      </div>
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
      {pending ? 'Lagrer…' : 'Lagre'}
    </button>
  );
}
