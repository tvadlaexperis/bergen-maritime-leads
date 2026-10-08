'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { ContactLogEntry } from '@/lib/db';
import { CONTACT_CHANNELS, CONTACT_OUTCOMES } from '@/lib/contactLog';
import { addContactLogAction, deleteContactLogAction, type ContactLogState } from './contactLogActions';

// «Kundekontakt» tab in «Tilrådd inngang»: log a call (who, number, how it
// went, when to follow up) and see everyone's earlier contact with the
// customer. A number typed here becomes that person's newest number on the
// contact card (buildContactPeople in page.tsx).
export default function ContactLogTab({
  companyId,
  people,
  entries,
  canLog,
  currentUserId,
  isAdmin,
}: {
  companyId: number;
  /** Known contacts, to pick from — name and their newest number. */
  people: { name: string; phone: string | null }[];
  entries: ContactLogEntry[];
  canLog: boolean;
  currentUserId: number | null;
  isAdmin: boolean;
}) {
  const [state, action] = useFormState<ContactLogState, FormData>(addContactLogAction, {});
  const [open, setOpen] = useState(entries.length === 0);
  const [phone, setPhone] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();
  const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD, local time

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setPhone('');
      setOpen(false);
    }
  }, [state]);

  // Picking a known person fills in their number (still editable).
  const onPerson = (name: string) => {
    const hit = people.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    if (hit?.phone) setPhone(hit.phone);
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {canLog && !open && (
        <div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
            + Registrer kontakt
          </button>
          {state.ok && <span className="form-ok" style={{ marginLeft: 10 }}>{state.ok}</span>}
        </div>
      )}

      {canLog && open && (
        <form ref={formRef} action={action} className="contact-log-form">
          <input type="hidden" name="id" value={companyId} />
          <div className="contact-log-row">
            <label className="field" style={{ width: 160 }}>
              Dato
              <input type="date" name="contacted_on" defaultValue={today} max={today} required />
            </label>
            <label className="field" style={{ width: 130 }}>
              Kanal
              <select name="channel" defaultValue="telefon">
                {CONTACT_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ flex: '1 1 200px' }}>
              Hvem
              <input
                type="text"
                name="person"
                list={`people-${companyId}`}
                placeholder="Navn — velg eller skriv"
                maxLength={120}
                onChange={(e) => onPerson(e.target.value)}
              />
              <datalist id={`people-${companyId}`}>
                {people.map((p) => (
                  <option key={p.name} value={p.name} />
                ))}
              </datalist>
            </label>
            <label className="field" style={{ width: 170 }}>
              Telefon
              <input
                type="tel"
                name="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+47 …"
                maxLength={40}
              />
            </label>
          </div>
          <div className="contact-log-row">
            <label className="field" style={{ width: 200 }}>
              Resultat
              <select name="outcome" defaultValue="" required>
                <option value="" disabled>
                  Velg …
                </option>
                {CONTACT_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ width: 160 }}>
              Følg opp
              <input type="date" name="follow_up_on" min={today} />
            </label>
          </div>
          <label className="field">
            Notat
            <textarea name="note" rows={3} maxLength={2000} placeholder="Hva ble sagt, hva er neste steg …" />
          </label>
          <p className="muted" style={{ fontSize: '0.74rem', margin: 0 }}>
            Telefonnummeret lagres som det nyeste nummeret til personen og vises på kontaktkortet.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <SaveButton />
            {entries.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
                Avbryt
              </button>
            )}
            {state.error && <span className="form-error" style={{ margin: 0 }}>{state.error}</span>}
          </div>
        </form>
      )}

      <div>
        <p className="contact-log-heading">Historikk</p>
        {entries.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.86rem' }}>Ingen kontakt registrert ennå.</p>
        ) : (
          <ul className="contact-log-list">
            {entries.map((e) => (
              <li key={e.id} className="contact-log-item">
                <div className="contact-log-top">
                  <strong>{dateLabel(e.contacted_on)}</strong>
                  <span className="contact-log-outcome" data-outcome={e.outcome}>
                    {e.outcome}
                  </span>
                  <span className="muted">
                    {e.channel}
                    {e.person ? ` · ${e.person}` : ''}
                    {e.phone ? ` · ${e.phone}` : ''}
                  </span>
                  {(isAdmin || (currentUserId != null && e.user_id === currentUserId)) && (
                    <button
                      type="button"
                      className="contact-log-delete"
                      title="Slett"
                      aria-label="Slett registrering"
                      onClick={() => {
                        if (confirm('Slette denne registreringen?')) startTransition(() => void deleteContactLogAction(e.id));
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                {e.note && <p className="contact-log-note">{e.note}</p>}
                <p className="muted contact-log-meta">
                  {e.user_name ? `Registrert av ${e.user_name}` : 'Registrert'}
                  {e.follow_up_on ? ` · følg opp ${dateLabel(e.follow_up_on)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
      {pending ? 'Lagrer …' : 'Lagre'}
    </button>
  );
}

// "2026-10-08" → "8. okt. 2026" without a timezone shift.
function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}
