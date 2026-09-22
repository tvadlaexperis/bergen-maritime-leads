export function bandFor(score: number | null | undefined): 'low' | 'mid' | 'high' | 'none' {
  if (score == null) return 'none';
  if (score >= 66) return 'high';
  if (score >= 40) return 'mid';
  return 'low';
}

// `reason` is the plain-language breakdown already computed alongside the
// score (lib/score.ts buildReason) — e.g. "15 ansatte · 245 MNOK omsetning
// (+12 % å/å) · 8 % driftsmargin · regnskap 2025. Prioritert lead." Passing
// it turns the hover tooltip into an actual explanation instead of just the
// number restated.
export default function ScoreBadge({
  score,
  reason,
}: {
  score: number | null | undefined;
  reason?: string | null;
}) {
  const band = bandFor(score);
  const title =
    band === 'none' ? 'Ikke scoret ennå' : reason ? `Lead-score ${score}/100 — ${reason}` : `Lead-score ${score}/100`;
  return (
    <span className="score-badge" data-band={band} title={title}>
      {score == null ? '—' : score}
    </span>
  );
}
