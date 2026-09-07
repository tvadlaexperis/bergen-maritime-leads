export function bandFor(score: number | null | undefined): 'low' | 'mid' | 'high' | 'none' {
  if (score == null) return 'none';
  if (score >= 66) return 'high';
  if (score >= 40) return 'mid';
  return 'low';
}

export default function ScoreBadge({ score }: { score: number | null | undefined }) {
  const band = bandFor(score);
  return (
    <span
      className="score-badge"
      data-band={band}
      title={band === 'none' ? 'Ikke scoret ennå' : `Lead-score ${score}/100`}
    >
      {score == null ? '—' : score}
    </span>
  );
}
