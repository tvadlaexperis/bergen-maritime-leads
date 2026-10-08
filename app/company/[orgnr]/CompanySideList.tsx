'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { CompanyBrief } from '@/lib/db';
import { bandFor } from '@/app/components/ScoreBadge';

// Split view: the company list beside the open company. Search filters by
// name or place; the open company is highlighted and scrolled into view.
export default function CompanySideList({ companies, current }: { companies: CompanyBrief[]; current: string }) {
  const [q, setQ] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? companies.filter((c) => c.name.toLowerCase().includes(s) || (c.poststed ?? '').toLowerCase().includes(s)) : companies;
  }, [companies, q]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'center' });
  }, [current]);

  return (
    <aside className="side-list box" aria-label="Selskaper">
      <div className="side-list-search">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Søk i ${companies.length} kunder …`} aria-label="Søk selskap" />
      </div>
      <ul ref={listRef} className="side-list-items">
        {shown.map((c, i) => (
          <li key={c.orgnr}>
            <Link href={`/company/${c.orgnr}`} className="side-list-item" aria-current={c.orgnr === current ? 'page' : undefined}>
              <span className="side-list-rank muted">{q ? '' : i + 1}</span>
              <span className="side-list-name">
                {c.name}
                <span className="muted side-list-meta">
                  {[c.poststed, c.group_size > 1 ? `konsern · ${c.group_size}` : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              {c.lead_score != null && (
                <span className="score-badge" data-band={bandFor(c.lead_score)}>
                  {c.lead_score}
                </span>
              )}
            </Link>
          </li>
        ))}
        {shown.length === 0 && <li className="muted" style={{ padding: 12, fontSize: '0.84rem' }}>Ingen treff.</li>}
      </ul>
    </aside>
  );
}
