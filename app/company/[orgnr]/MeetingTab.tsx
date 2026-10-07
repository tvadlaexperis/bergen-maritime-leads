'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { updateMeetingAction, type ActionState } from '@/app/admin/actions';

// «Bedriftsmøte»: date, place and who's there on top; the writing — before,
// during and after the meeting — in three tabs that each get the full height.
// One form: the hidden tabs' textareas stay mounted, so a save keeps all three.
// Stored on the company (lib/db.ts setCompanyMeeting). Admins edit; others read.
const PHASES = [
  { key: 'prep', label: 'Forberedelse', hint: 'Mål for møtet, hva vi vil vite, spørsmål vi skal stille' },
  { key: 'during', label: 'I møtet', hint: 'Notater underveis — svar, navn, tall, systemer de nevner' },
  { key: 'notes', label: 'Etter møtet', hint: 'Oppsummering — hva kom fram, behov, neste steg' },
] as const;
type Phase = (typeof PHASES)[number]['key'];

export default function MeetingTab({
  id,
  date,
  location,
  attendees,
  prep,
  during,
  notes,
  canEdit,
}: {
  id: number;
  date: string | null;
  location: string | null;
  attendees: string | null;
  prep: string | null;
  during: string | null;
  notes: string | null;
  canEdit: boolean;
}) {
  const [state, action] = useFormState<ActionState, FormData>(updateMeetingAction, {});
  const text: Record<Phase, string | null> = { prep, during, notes };
  // Open on the phase you're in: after the meeting date → «Etter møtet» if it
  // has text or «I møtet» was used; otherwise «Forberedelse».
  const [phase, setPhase] = useState<Phase>(notes ? 'notes' : during ? 'during' : 'prep');

  const tabs = (
    <div role="tablist" className="meeting-phases">
      {PHASES.map((p) => (
        <button
          key={p.key}
          type="button"
          role="tab"
          aria-selected={phase === p.key}
          className={`meeting-phase${phase === p.key ? ' active' : ''}`}
          onClick={() => setPhase(p.key)}
        >
          {p.label}
          {text[p.key] ? <span className="meeting-phase-dot" aria-label="har tekst" /> : null}
        </button>
      ))}
    </div>
  );

  if (!canEdit) {
    return (
      <div style={{ display: 'grid', gap: 14, fontSize: '0.88rem' }}>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          <ReadOnly label="Møtedato" text={date} />
          <ReadOnly label="Sted" text={location} />
        </div>
        <ReadOnly label="Deltakere" text={attendees} />
        {tabs}
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{text[phase] || <span className="muted">Ikke fylt ut.</span>}</p>
      </div>
    );
  }

  return (
    <form action={action} className="meeting-form">
      <input type="hidden" name="id" value={id} />
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field" style={{ width: 200 }}>
          Møtedato
          <input type="date" name="date" defaultValue={date ?? ''} />
        </label>
        <label className="field" style={{ flex: '1 1 240px' }}>
          Sted
          <input type="text" name="location" defaultValue={location ?? ''} maxLength={300} placeholder="Adresse, Teams, …" />
        </label>
      </div>
      <label className="field">
        Deltakere
        <textarea
          name="attendees"
          rows={2}
          defaultValue={attendees ?? ''}
          placeholder="Én per linje — fra kunden og fra oss, gjerne med rolle"
        />
      </label>

      {tabs}
      {PHASES.map((p) => (
        <label key={p.key} className="field meeting-phase-field" hidden={phase !== p.key}>
          <span className="muted" style={{ fontSize: '0.78rem' }}>{p.hint}</span>
          <textarea name={p.key} defaultValue={text[p.key] ?? ''} aria-label={p.label} />
        </label>
      ))}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <SaveButton />
        {state.error && <span className="form-error" style={{ margin: 0 }}>{state.error}</span>}
        {state.ok && <span className="form-ok" style={{ margin: 0 }}>{state.ok}</span>}
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
      {pending ? 'Lagrer…' : 'Lagre møtenotater'}
    </button>
  );
}

function ReadOnly({ label, text }: { label: string; text: string | null }) {
  return (
    <div>
      <p className="muted" style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </p>
      <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{text || <span className="muted">Ikke fylt ut.</span>}</p>
    </div>
  );
}
