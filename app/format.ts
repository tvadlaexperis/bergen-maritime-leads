// Norwegian-style formatting helpers for the UI.

export function fmtNok(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (opts.compact || abs >= 1_000_000) {
    if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace('.', ',')} mrd`;
    if (abs >= 1_000_000) return `${Math.round(value / 1_000_000).toLocaleString('nb-NO')} MNOK`;
    if (abs >= 1_000) return `${Math.round(value / 1_000).toLocaleString('nb-NO')} kNOK`;
  }
  return value.toLocaleString('nb-NO');
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value == null) return '—';
  const s = value > 0 ? '+' : '';
  return `${s}${value.toFixed(digits).replace('.', ',')} %`;
}

export function fmtInt(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('nb-NO');
}

export function dateLabel(ts: number | string | null | undefined): string {
  if (ts == null) return '—';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('nb-NO', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function agoLabel(ts: number | null | undefined): string {
  if (ts == null) return 'aldri';
  const days = Math.floor((Date.now() - ts) / 864e5);
  if (days <= 0) return 'i dag';
  if (days === 1) return 'i går';
  if (days < 45) return `for ${days} dager siden`;
  const months = Math.round(days / 30);
  if (months < 24) return `for ${months} mnd siden`;
  return `for ${Math.round(months / 12)} år siden`;
}
