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
  updateContactsAction,
  type ActionState,
} from '@/app/admin/actions';

const initial: ActionState = {};

export interface Contacts {
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  cto_name: string | null;
  cto_email: string | null;
  cto_phone: string | null;
  sales_name: string | null;
  sales_email: string | null;
  sales_phone: string | null;
}

export default function AdminControls(props: {
  id: number;
  orgnr: string;
  name: string;
  status: CompanyStatus;
  notes: string;
  contacts: Contacts;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [notesState, notesAction] = useFormState(updateNotesAction, initial);
  const [contactsState, contactsAction] = useFormState(updateContactsAction, initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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

        <form action={contactsAction} style={{ display: 'grid', gap: 10 }}>
          <input type="hidden" name="id" value={props.id} />
          <span className="muted" style={{ fontSize: '0.78rem' }}>
            Kontaktpersoner <span>(fylles inn manuelt — finnes ikke i registrene)</span>
          </span>
          <ContactRow label="Kontaktperson" name="contact_name" email="contact_email" phone="contact_phone" contacts={props.contacts} />
          <ContactRow label="CTO" name="cto_name" email="cto_email" phone="cto_phone" contacts={props.contacts} />
          <ContactRow label="Salgssjef" name="sales_name" email="sales_email" phone="sales_phone" contacts={props.contacts} />
          {contactsState.error && <p className="form-error">{contactsState.error}</p>}
          {contactsState.ok && <p className="form-ok">{contactsState.ok}</p>}
          <div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Lagre kontakter</button>
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
  );

  if (props.embedded) {
    return (
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 4 }}>
        <span className="muted" style={{ fontSize: '0.78rem', fontWeight: 700 }}>Admin</span>
        <div style={{ marginTop: 14 }}>{body}</div>
      </div>
    );
  }

  return (
    <div className="box" style={{ borderColor: 'var(--accent-border)' }}>
      <div className="box-header"><span className="box-title">Admin</span></div>
      <div className="box-pad">{body}</div>
    </div>
  );
}

function ContactRow({
  label,
  name,
  email,
  phone,
  contacts,
}: {
  label: string;
  name: keyof Contacts;
  email: keyof Contacts;
  phone: keyof Contacts;
  contacts: Contacts;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
      <label className="field">
        {label}
        <input name={name} type="text" defaultValue={contacts[name] ?? ''} />
      </label>
      <label className="field">
        E-post
        <input name={email} type="email" defaultValue={contacts[email] ?? ''} />
      </label>
      <label className="field">
        Telefon
        <input name={phone} type="text" defaultValue={contacts[phone] ?? ''} />
      </label>
    </div>
  );
}
