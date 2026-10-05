'use client';

import { useFormState } from 'react-dom';
import { updateMeetingAction, type ActionState } from '@/app/admin/actions';

// «Bedriftsmøte» tab in «Tilrådd inngang»: date, notes to prepare and the
// summary afterwards — stored on the company (lib/db.ts setCompanyMeeting),
// so they're the same on every device. Admins edit; others read.
export default function MeetingTab({
  id,
  date,
  prep,
  notes,
  canEdit,
}: {
  id: number;
  date: string | null;
  prep: string | null;
  notes: string | null;
  canEdit: boolean;
}) {
  const [state, action] = useFormState<ActionState, FormData>(updateMeetingAction, {});

  if (!canEdit) {
    return (
      <div style={{ display: 'grid', gap: 14, fontSize: '0.88rem' }}>
        <ReadOnly label="Møtedato" text={date} />
        <ReadOnly label="Forberedelse" text={prep} />
        <ReadOnly label="Oppsummering etter møtet" text={notes} />
      </div>
    );
  }

  return (
    <form action={action} style={{ display: 'grid', gap: 14 }}>
      <input type="hidden" name="id" value={id} />
      <label className="field" style={{ maxWidth: 220 }}>
        Møtedato
        <input type="date" name="date" defaultValue={date ?? ''} />
      </label>
      <label className="field">
        Forberedelse <span className="muted">(mål for møtet, hvem som kommer, hva vi vil vite)</span>
        <textarea name="prep" rows={5} defaultValue={prep ?? ''} />
      </label>
      <label className="field">
        Oppsummering etter møtet <span className="muted">(hva kom fram, behov, neste steg)</span>
        <textarea name="notes" rows={5} defaultValue={notes ?? ''} />
      </label>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button type="submit" className="btn btn-primary btn-sm">
          Lagre møtenotater
        </button>
        {state.error && <span className="form-error" style={{ margin: 0 }}>{state.error}</span>}
        {state.ok && <span className="form-ok" style={{ margin: 0 }}>{state.ok}</span>}
      </div>
    </form>
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
