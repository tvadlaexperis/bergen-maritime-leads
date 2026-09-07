'use client';

import { useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { CompanyStatus } from '@/lib/types';
import {
  refreshCompanyAction,
  setStatusAction,
  deleteCompanyAction,
  updateNotesAction,
  type ActionState,
} from '@/app/admin/actions';

const initial: ActionState = {};

export default function AdminControls(props: {
  id: number;
  orgnr: string;
  name: string;
  status: CompanyStatus;
  notes: string;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [notesState, notesAction] = useFormState(updateNotesAction, initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="box" style={{ borderColor: 'var(--accent-border)' }}>
      <div className="box-header"><span className="box-title">Admin</span></div>
      <div className="box-pad" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                setMsg(null);
                const r = await refreshCompanyAction(props.orgnr);
                setMsg(r.ok ? 'Oppdatert.' : `Fullført med ${r.errors} feil.`);
                router.refresh();
              })
            }
          >
            {busy ? 'Jobber…' : 'Oppdater fra registrene'}
          </button>
          {(['active', 'hidden'] as CompanyStatus[]).map((s) => (
            <button
              key={s}
              className={`chip${props.status === s ? ' active' : ''}`}
              disabled={busy || props.status === s}
              onClick={() =>
                startTransition(async () => {
                  await setStatusAction(props.id, s);
                  router.refresh();
                })
              }
            >
              {s === 'active' ? 'aktiv' : 'skjult'}
            </button>
          ))}
          {msg && <span className="muted" style={{ fontSize: '0.78rem' }}>{msg}</span>}
        </div>

        <form action={notesAction} style={{ display: 'grid', gap: 8 }}>
          <input type="hidden" name="id" value={props.id} />
          <label className="field">
            Notater <span className="muted">(intern — vises kun her)</span>
            <textarea name="notes" rows={3} defaultValue={props.notes} />
          </label>
          {notesState.error && <p className="form-error">{notesState.error}</p>}
          {notesState.ok && <p className="form-ok">{notesState.ok}</p>}
          <div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Lagre notater</button>
          </div>
        </form>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {confirmDelete ? (
            <>
              <span className="muted" style={{ fontSize: '0.8rem' }}>Slett {props.name} fra listen?</span>
              <button
                className="btn btn-danger btn-sm"
                disabled={busy}
                onClick={() => startTransition(() => deleteCompanyAction(props.id))}
              >
                Ja, slett
              </button>
              <button className="chip" onClick={() => setConfirmDelete(false)}>Avbryt</button>
            </>
          ) : (
            <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>Slett selskap</button>
          )}
        </div>
      </div>
    </div>
  );
}
