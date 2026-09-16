'use client';

import { useState } from 'react';
import { fmtNok } from '@/app/format';
import type { Financial } from '@/lib/db';

// Shows the most recent two years as tabs; older years are revealed one at a
// time behind the "›" arrow instead of all stacking vertically.
export default function FinancialsTabs({ financials }: { financials: Financial[] }) {
  const [visibleCount, setVisibleCount] = useState(Math.min(2, financials.length));
  const [selectedYear, setSelectedYear] = useState(financials[0]?.year);

  if (financials.length === 0) {
    return (
      <div className="box-pad">
        <p className="muted" style={{ fontSize: '0.85rem' }}>Ingen regnskapstall hentet ennå.</p>
      </div>
    );
  }

  const visible = financials.slice(0, visibleCount);
  const current = financials.find((f) => f.year === selectedYear) ?? financials[0];

  return (
    <div className="box-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {visible.map((f) => (
          <button
            key={f.year}
            type="button"
            className={`chip-tab${f.year === current.year ? ' active' : ''}`}
            onClick={() => setSelectedYear(f.year)}
          >
            {f.year}
          </button>
        ))}
        {visibleCount < financials.length && (
          <button
            type="button"
            className="chip-tab"
            onClick={() => {
              const next = financials[visibleCount];
              setVisibleCount((n) => n + 1);
              setSelectedYear(next.year);
            }}
            aria-label={`Vis ${financials[visibleCount].year}`}
            title={`Vis ${financials[visibleCount].year}`}
          >
            ›
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
        <Fact label="Driftsinntekter" value={fmtNok(current.revenue, { compact: true })} />
        <Fact label="Driftsresultat" value={fmtNok(current.operating_result, { compact: true })} />
        <Fact label="Årsresultat" value={fmtNok(current.profit, { compact: true })} />
        <Fact label="Egenkapital" value={fmtNok(current.equity, { compact: true })} />
        <Fact label="Sum eiendeler" value={fmtNok(current.total_assets, { compact: true })} />
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="muted" style={{ fontSize: '0.72rem' }}>{label}</span>
      <span style={{ fontSize: '0.9rem' }}>{value}</span>
    </div>
  );
}
