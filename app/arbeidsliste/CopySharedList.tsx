'use client';

import { useState } from 'react';
import { readWorklist, writeWorklist } from '@/lib/worklist';

// On a shared list: copies its companies into this browser's own work list.
export default function CopySharedList({ orgnrs }: { orgnrs: string[] }) {
  const [added, setAdded] = useState<number | null>(null);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {added != null && <span className="form-ok" style={{ margin: 0 }}>{added === 0 ? 'Alle var allerede på listen din.' : `${added} lagt til.`}</span>}
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => {
          const mine = readWorklist();
          const before = mine.size;
          for (const o of orgnrs) mine.add(o);
          writeWorklist(mine);
          setAdded(mine.size - before);
        }}
      >
        Legg alle til i min arbeidsliste
      </button>
    </div>
  );
}
