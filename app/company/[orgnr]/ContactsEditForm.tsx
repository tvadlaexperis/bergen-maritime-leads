'use client';

import { useFormState } from 'react-dom';
import type { CSSProperties } from 'react';
import { updateContactsAction, type ActionState } from '@/app/admin/actions';
import type { Contacts } from './AdminControls';

const initial: ActionState = {};

const ROWS: { label: string; name: keyof Contacts; email: keyof Contacts; phone: keyof Contacts }[] = [
  { label: 'Kontaktperson', name: 'contact_name', email: 'contact_email', phone: 'contact_phone' },
  { label: 'CTO', name: 'cto_name', email: 'cto_email', phone: 'cto_phone' },
  { label: 'Salgssjef', name: 'sales_name', email: 'sales_email', phone: 'sales_phone' },
];

const inputStyle: CSSProperties = {
  width: '100%',
  background: 'var(--surface-raised)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-control)',
  padding: '6px 10px',
  font: 'inherit',
  fontSize: '0.85rem',
  color: 'var(--text-primary)',
};

// Same table shape as the read-only Kontakter list above it — editable
// inline, so it doesn't need its own set of labels per field.
export default function ContactsEditForm({ id, contacts }: { id: number; contacts: Contacts }) {
  const [state, action] = useFormState(updateContactsAction, initial);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Rolle</th>
              <th>Navn</th>
              <th>E-post</th>
              <th>Telefon</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.name}>
                <td className="muted">{r.label}</td>
                <td>
                  <input name={r.name} type="text" defaultValue={contacts[r.name] ?? ''} style={inputStyle} />
                </td>
                <td>
                  <input name={r.email} type="email" defaultValue={contacts[r.email] ?? ''} style={inputStyle} />
                </td>
                <td>
                  <input name={r.phone} type="text" defaultValue={contacts[r.phone] ?? ''} style={inputStyle} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="box-pad" style={{ paddingTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="submit" className="btn btn-primary btn-sm">Lagre kontakter</button>
        {state.error && <p className="form-error" style={{ margin: 0 }}>{state.error}</p>}
        {state.ok && <p className="form-ok" style={{ margin: 0 }}>{state.ok}</p>}
      </div>
    </form>
  );
}
