'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { CompanyBrief } from '@/lib/db';
import { bandFor } from '@/app/components/ScoreBadge';
import { ContactStatusIcon, MeetingCell } from '@/app/components/ContactStatus';
import { readWorklist, WORKLIST_EVENT } from '@/lib/worklist';

type Mode = 'arbeidsliste' | 'alle';
const MODE_KEY = 'bml.sideList.mode';

// Split view: the work list (default) or every customer beside the open
// company, with score, contact status and booked meeting. «Alle» shows a
// konsern once, as its main company with the group's best score.
export default function CompanySideList({ companies, current }: { companies: CompanyBrief[]; current: string }) {
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<Mode>('arbeidsliste');
  const [worklist, setWorklist] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setWorklist(readWorklist());
    try {
      if (window.localStorage.getItem(MODE_KEY) === 'alle') setMode('alle');
    } catch {
      // storage blocked — default mode
    }
    const on = () => setWorklist(readWorklist());
    window.addEventListener(WORKLIST_EVENT, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(WORKLIST_EVENT, on);
      window.removeEventListener('storage', on);
    };
  }, []);

  const pick = (m: Mode) => {
    setMode(m);
    try {
      window.localStorage.setItem(MODE_KEY, m);
    } catch {
      // ignore
    }
  };

  const all = useMemo(() => {
    const groups = new Map<string, CompanyBrief[]>();
    const out: (CompanyBrief & { groupSize: number })[] = [];
    for (const c of companies) {
      if (!c.group_key) continue;
      groups.set(c.group_key, [...(groups.get(c.group_key) ?? []), c]);
    }
    const seen = new Set<string>();
    for (const c of companies) {
      if (!c.group_key || (groups.get(c.group_key)?.length ?? 0) < 2) {
        out.push({ ...c, groupSize: 1 });
        continue;
      }
      if (seen.has(c.group_key)) continue;
      seen.add(c.group_key);
      const members = groups.get(c.group_key)!;
      const main = members.find((m) => m.orgnr === m.group_main_orgnr) ?? c;
      out.push({ ...main, lead_score: Math.max(...members.map((m) => m.lead_score ?? -1)), groupSize: members.length });
    }
    return out;
  }, [companies]);

  const base = mode === 'alle' ? all : companies.filter((c) => worklist.has(c.orgnr)).map((c) => ({ ...c, groupSize: 1 }));
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? base.filter((c) => c.name.toLowerCase().includes(s) || (c.poststed ?? '').toLowerCase().includes(s)) : base;
  }, [base, q]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'center' });
  }, [current, mode]);

  return (
    <aside className="side-list box" aria-label="Selskaper">
      <div className="side-list-search">
        <div className="side-list-modes" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'arbeidsliste'} className={mode === 'arbeidsliste' ? 'active' : ''} onClick={() => pick('arbeidsliste')}>
            Arbeidsliste ({worklist.size})
          </button>
          <button type="button" role="tab" aria-selected={mode === 'alle'} className={mode === 'alle' ? 'active' : ''} onClick={() => pick('alle')}>
            Alle ({all.length})
          </button>
        </div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk …" aria-label="Søk selskap" />
      </div>
      <div className="side-list-head muted">
        <span>Selskap</span>
        <span>Lead</span>
        <span title="Kundekontakt">Kontakt</span>
        <span>Møte</span>
      </div>
      <ul ref={listRef} className="side-list-items">
        {shown.map((c) => (
          <li key={c.orgnr}>
            <Link href={`/company/${c.orgnr}`} className="side-list-item" aria-current={c.orgnr === current ? 'page' : undefined}>
              <span className="side-list-name">
                {c.name}
                <span className="muted side-list-meta">
                  {[c.poststed, c.groupSize > 1 ? `konsern · ${c.groupSize}` : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span>
                {c.lead_score != null && c.lead_score >= 0 && (
                  <span className="score-badge" data-band={bandFor(c.lead_score)}>
                    {c.lead_score}
                  </span>
                )}
              </span>
              <span className="side-list-icon">
                <ContactStatusIcon r={c} />
              </span>
              <span className="side-list-meeting">
                <MeetingCell r={c} short />
              </span>
            </Link>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="muted" style={{ padding: 14, fontSize: '0.84rem', lineHeight: 1.5 }}>
            {mode === 'arbeidsliste' && worklist.size === 0
              ? 'Arbeidslisten er tom. Legg til selskaper med bokmerket i selskapslisten, eller se «Alle».'
              : 'Ingen treff.'}
          </li>
        )}
      </ul>
    </aside>
  );
}
