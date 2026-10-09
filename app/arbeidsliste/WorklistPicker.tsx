'use client';

import { useRouter } from 'next/navigation';
import type { SharedWorklistSummary } from '@/lib/db';

// Arbeidsliste picker: your own list, or one a friend sent you (or you sent).
export default function WorklistPicker({ lists, current }: { lists: SharedWorklistSummary[]; current: number | null }) {
  const router = useRouter();
  const received = lists.filter((l) => l.direction === 'received');
  const sent = lists.filter((l) => l.direction === 'sent');
  const date = (ms: number) => new Date(ms).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
  const label = (l: SharedWorklistSummary) => `${l.other_name} · ${l.count} selskap${l.count === 1 ? '' : 'er'} · ${date(l.created_at)}`;

  return (
    <select
      className="role-select worklist-picker"
      value={current ?? ''}
      onChange={(e) => router.push(e.target.value ? `/arbeidsliste?delt=${e.target.value}` : '/arbeidsliste')}
      aria-label="Velg arbeidsliste"
    >
      <option value="">Min arbeidsliste</option>
      {received.length > 0 && (
        <optgroup label="Delt med meg">
          {received.map((l) => (
            <option key={l.id} value={l.id}>
              Fra {label(l)}
            </option>
          ))}
        </optgroup>
      )}
      {sent.length > 0 && (
        <optgroup label="Sendt av meg">
          {sent.map((l) => (
            <option key={l.id} value={l.id}>
              Til {label(l)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
