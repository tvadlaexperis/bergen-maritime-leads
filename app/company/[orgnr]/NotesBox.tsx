'use client';

import { useFormState } from 'react-dom';
import { updateNotesAction, type ActionState } from '@/app/admin/actions';

const initial: ActionState = {};

export default function NotesBox({ id, notes }: { id: number; notes: string }) {
  const [state, action] = useFormState(updateNotesAction, initial);

  return (
    <div className="box">
      <div className="box-header"><span className="box-title">Notater</span></div>
      <form action={action} className="box-pad" style={{ display: 'grid', gap: 8 }}>
        <input type="hidden" name="id" value={id} />
        <label className="field">
          <span className="muted">Intern — vises kun her</span>
          <textarea name="notes" rows={3} defaultValue={notes} />
        </label>
        {state.error && <p className="form-error">{state.error}</p>}
        {state.ok && <p className="form-ok">{state.ok}</p>}
        <div>
          <button type="submit" className="btn btn-primary btn-sm">Lagre notater</button>
        </div>
      </form>
    </div>
  );
}
