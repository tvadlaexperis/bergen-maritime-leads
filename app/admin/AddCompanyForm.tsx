'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { addCompanyAction, type ActionState } from './actions';

const initial: ActionState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
      {pending ? 'Henter…' : 'Legg til & hent nøkkeltall'}
    </button>
  );
}

export default function AddCompanyForm() {
  const [state, action] = useFormState(addCompanyAction, initial);

  return (
    <form action={action} style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
      <label className="field">
        Organisasjonsnummer
        <input name="orgnr" required placeholder="f.eks. 971 171 898" inputMode="numeric" />
      </label>
      <p className="muted" style={{ fontSize: '0.72rem' }}>
        Slår opp foretaket i Enhetsregisteret og henter siste regnskap. Nyttig for selskaper utenfor
        de valgte bransjekodene.
      </p>
      {state.error && <p className="form-error">{state.error}</p>}
      <div><Submit /></div>
    </form>
  );
}
