'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useFormState } from 'react-dom';
import { updateContactsAction, type ActionState } from '@/app/admin/actions';
import type { Contacts } from './AdminControls';

const initial: ActionState = {};

type Role = 'contact' | 'cto' | 'sales';

const ROLES: { key: Role; label: string; name: keyof Contacts; email: keyof Contacts; phone: keyof Contacts }[] = [
  { key: 'contact', label: 'Kontaktperson', name: 'contact_name', email: 'contact_email', phone: 'contact_phone' },
  { key: 'cto', label: 'CTO', name: 'cto_name', email: 'cto_email', phone: 'cto_phone' },
  { key: 'sales', label: 'Salgssjef', name: 'sales_name', email: 'sales_email', phone: 'sales_phone' },
];

const inputStyle: CSSProperties = {
  background: 'var(--surface-raised)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-control)',
  padding: '6px 10px',
  font: 'inherit',
  fontSize: '0.85rem',
  color: 'var(--text-primary)',
};

// The DB still only has three contact "slots" (contact/cto/sales columns), so
// this picks one via a dropdown rather than offering a free-text role — see
// the project's decision to keep the fixed-role model instead of a real
// contacts table. Submits all nine fields (the two untouched roles as hidden
// inputs) since updateContactsAction replaces the whole set at once.
export default function ContactsEditForm({ id, contacts }: { id: number; contacts: Contacts }) {
  const [state, action] = useFormState(updateContactsAction, initial);
  const [adding, setAdding] = useState(false);
  const [role, setRole] = useState<Role>('contact');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const startAdding = () => {
    // Default to the first empty slot — "Legg til" reads as adding someone
    // new, not overwriting an existing entry.
    const empty = ROLES.find((r) => !contacts[r.name]);
    const r = empty ?? ROLES[0];
    setRole(r.key);
    setName(contacts[r.name] ?? '');
    setEmail(contacts[r.email] ?? '');
    setPhone(contacts[r.phone] ?? '');
    setAdding(true);
  };

  const changeRole = (key: Role) => {
    const r = ROLES.find((x) => x.key === key)!;
    setRole(key);
    setName(contacts[r.name] ?? '');
    setEmail(contacts[r.email] ?? '');
    setPhone(contacts[r.phone] ?? '');
  };

  // Collapse back to the button once a save completes.
  useEffect(() => {
    if (state.ok) setAdding(false);
  }, [state.ok]);

  if (!adding) {
    return (
      <div className="box-pad" style={{ paddingTop: 0 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={startAdding}>
          + Legg til kontakt
        </button>
      </div>
    );
  }

  const active = ROLES.find((r) => r.key === role)!;
  const other = ROLES.filter((r) => r.key !== role);

  return (
    <form action={action} className="box-pad" style={{ paddingTop: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input type="hidden" name="id" value={id} />
      {other.map((r) => (
        <input key={r.name} type="hidden" name={r.name} value={contacts[r.name] ?? ''} />
      ))}
      {other.map((r) => (
        <input key={r.email} type="hidden" name={r.email} value={contacts[r.email] ?? ''} />
      ))}
      {other.map((r) => (
        <input key={r.phone} type="hidden" name={r.phone} value={contacts[r.phone] ?? ''} />
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) 2fr 2fr 1.4fr', gap: 8, alignItems: 'center' }}>
        <select value={role} onChange={(e) => changeRole(e.target.value as Role)} style={inputStyle}>
          {ROLES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        <input
          name={active.name}
          type="text"
          placeholder="Navn"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
        <input
          name={active.email}
          type="email"
          placeholder="E-post"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          name={active.phone}
          type="text"
          placeholder="Telefon"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={inputStyle}
        />
      </div>

      {state.error && <p className="form-error" style={{ margin: 0 }}>{state.error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary btn-sm">Lagre</button>
        <button type="button" className="chip" onClick={() => setAdding(false)}>Avbryt</button>
      </div>
    </form>
  );
}
