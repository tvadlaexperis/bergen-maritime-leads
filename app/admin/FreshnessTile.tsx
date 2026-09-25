// One "how current is the data" tile — used on the admin Datakvalitet tab.
export default function FreshnessTile({ label, value, total, hint }: { label: string; value: number; total: number; hint: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{label}</span>
      <span className="num" style={{ fontSize: '1.1rem', fontWeight: 800 }}>
        {value}
        <span className="muted" style={{ fontSize: '0.75rem', fontWeight: 500 }}>
          {' '}
          / {total}
        </span>
      </span>
      <div className="meter">
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="muted" style={{ fontSize: '0.7rem' }}>
        {hint}
      </span>
    </div>
  );
}
