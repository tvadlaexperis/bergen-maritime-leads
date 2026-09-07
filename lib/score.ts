import type { CompanyFinancials } from './types';

// Pure scoring — no DB, no I/O. Unit-tested in score.test.ts. The `score`
// orchestrator provider feeds this a company's employee count + annual accounts.
//
// The lead score ranks how attractive a company is as a SALES PROSPECT in the
// Bergen maritime sector: bigger, financially healthy, growing companies score
// higher (more budget, more activity, more decision-makers). It is a
// prioritisation aid, not a statement of fact about the company.

export type ScoreBand = 'low' | 'mid' | 'high';

export interface LeadScoreInput {
  employees: number | null;
  financials: CompanyFinancials[]; // newest first
}

export interface LeadScoreResult {
  leadScore: number;
  sizeScore: number;
  revenueScore: number;
  growthScore: number;
  profitabilityScore: number;
  revenueLatest: number | null;
  revenuePrev: number | null;
  revenueGrowthPct: number | null;
  operatingMarginPct: number | null;
  latestYear: number | null;
  reason: string;
  band: ScoreBand;
}

export const SCORE_WEIGHTS = {
  size: 0.35,
  revenue: 0.3,
  growth: 0.2,
  profitability: 0.15,
} as const;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n);

export function scoreBand(score: number): ScoreBand {
  if (score >= 66) return 'high';
  if (score >= 40) return 'mid';
  return 'low';
}

// employees on a log curve: 1 -> ~0, 25 -> ~43, 100 -> ~65, 500 -> 100
function sizeScoreFrom(employees: number | null): number {
  if (!employees || employees <= 0) return 5;
  return clamp((Math.log10(employees) / Math.log10(500)) * 100);
}

// revenue in NOK on a log curve: 2 MNOK -> ~10, 50 MNOK -> ~57, 1 000 MNOK -> 100
function revenueScoreFrom(revenue: number | null): number {
  if (!revenue || revenue <= 0) return 3;
  const mnok = revenue / 1_000_000;
  return clamp((Math.log10(mnok + 1) / Math.log10(1000)) * 100);
}

// YoY revenue growth: -25% -> 0, 0% -> 45, +25% -> 90, +40%+ -> 100
function growthScoreFrom(pct: number | null): number {
  if (pct == null) return 45;
  return clamp(45 + pct * 1.8);
}

// operating margin: -15% -> 0, 0% -> 40, +12% -> 100
function profitabilityScoreFrom(marginPct: number | null): number {
  if (marginPct == null) return 40;
  return clamp(40 + marginPct * 5);
}

function fmtMNOK(v: number | null): string {
  if (v == null) return '—';
  const mnok = v / 1_000_000;
  if (Math.abs(mnok) >= 1000) return `${(mnok / 1000).toFixed(1).replace('.', ',')} mrd`;
  if (Math.abs(mnok) >= 10) return `${Math.round(mnok)} MNOK`;
  return `${mnok.toFixed(1).replace('.', ',')} MNOK`;
}

function fmtPct(v: number | null): string {
  if (v == null) return '—';
  const s = v >= 0 ? '+' : '';
  return `${s}${v.toFixed(0)} %`;
}

export function computeLeadScore(input: LeadScoreInput): LeadScoreResult {
  const fin = [...input.financials].sort((a, b) => b.year - a.year);
  const latest = fin[0] ?? null;
  const prev = fin[1] ?? null;

  const revenueLatest = latest?.revenue ?? null;
  const revenuePrev = prev?.revenue ?? null;
  const revenueGrowthPct =
    revenueLatest != null && revenuePrev != null && revenuePrev > 0
      ? ((revenueLatest - revenuePrev) / revenuePrev) * 100
      : null;
  const operatingMarginPct =
    latest?.operatingResult != null && revenueLatest != null && revenueLatest > 0
      ? (latest.operatingResult / revenueLatest) * 100
      : null;

  const sizeScore = round(sizeScoreFrom(input.employees));
  const revenueScore = round(revenueScoreFrom(revenueLatest));
  const growthScore = round(growthScoreFrom(revenueGrowthPct));
  const profitabilityScore = round(profitabilityScoreFrom(operatingMarginPct));

  const leadScore = round(
    SCORE_WEIGHTS.size * sizeScore +
      SCORE_WEIGHTS.revenue * revenueScore +
      SCORE_WEIGHTS.growth * growthScore +
      SCORE_WEIGHTS.profitability * profitabilityScore,
  );

  return {
    leadScore,
    sizeScore,
    revenueScore,
    growthScore,
    profitabilityScore,
    revenueLatest,
    revenuePrev,
    revenueGrowthPct,
    operatingMarginPct,
    latestYear: latest?.year ?? null,
    reason: buildReason({
      employees: input.employees,
      revenueLatest,
      revenueGrowthPct,
      operatingMarginPct,
      latestYear: latest?.year ?? null,
      leadScore,
    }),
    band: scoreBand(leadScore),
  };
}

function buildReason(x: {
  employees: number | null;
  revenueLatest: number | null;
  revenueGrowthPct: number | null;
  operatingMarginPct: number | null;
  latestYear: number | null;
  leadScore: number;
}): string {
  const parts: string[] = [];
  if (x.employees != null) parts.push(`${x.employees} ansatte`);
  if (x.revenueLatest != null) {
    let rev = `${fmtMNOK(x.revenueLatest)} omsetning`;
    if (x.revenueGrowthPct != null) rev += ` (${fmtPct(x.revenueGrowthPct)} å/å)`;
    parts.push(rev);
  }
  if (x.operatingMarginPct != null) parts.push(`${x.operatingMarginPct.toFixed(0)} % driftsmargin`);
  if (x.latestYear != null) parts.push(`regnskap ${x.latestYear}`);

  if (parts.length === 0) return 'Ingen regnskapstall registrert ennå — kjør en oppdatering.';

  const verdict =
    x.leadScore >= 66
      ? 'Prioritert lead.'
      : x.leadScore >= 40
        ? 'Verdt en vurdering.'
        : 'Lav prioritet.';
  return `${parts.join(' · ')}. ${verdict}`;
}
