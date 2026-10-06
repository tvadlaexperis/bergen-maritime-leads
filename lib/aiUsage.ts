// Rough token/cost tally for the AI calls in one server run. Module-level, so
// it's per serverless instance: runScan resets it at the start and reads it at
// the end. Two overlapping runs on one warm instance would mix — fine for a
// "ca." figure in the admin UI, not for billing.

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  searches: number;
  /** Estimated cost in USD (list prices below). */
  costUsd: number;
}

// USD per million tokens / per search — list prices, update when they change.
const PRICES: { match: RegExp; inPerM: number; outPerM: number }[] = [
  { match: /haiku/i, inPerM: 1, outPerM: 5 },
  { match: /sonnet/i, inPerM: 3, outPerM: 15 },
  { match: /opus/i, inPerM: 5, outPerM: 25 },
  { match: /flash-lite/i, inPerM: 0.1, outPerM: 0.4 },
  { match: /flash/i, inPerM: 0.3, outPerM: 2.5 },
];
const CLAUDE_SEARCH_USD = 0.01; // $10 per 1,000 searches
// Gemini grounding: 5,000 searches/month free, so counted as 0 here.

/** Approximate NOK per USD for display. */
export const USD_NOK = 10.5;

let current: AiUsage = { inputTokens: 0, outputTokens: 0, searches: 0, costUsd: 0 };

export function resetAiUsage(): void {
  current = { inputTokens: 0, outputTokens: 0, searches: 0, costUsd: 0 };
}

export function getAiUsage(): AiUsage {
  return { ...current };
}

export function recordAiUsage(model: string, inputTokens: number, outputTokens: number, searches = 0, claude = false): void {
  const p = PRICES.find((x) => x.match.test(model)) ?? PRICES[0];
  const inT = Number(inputTokens) || 0;
  const outT = Number(outputTokens) || 0;
  current.inputTokens += inT;
  current.outputTokens += outT;
  current.searches += searches;
  current.costUsd += (inT * p.inPerM + outT * p.outPerM) / 1_000_000 + (claude ? searches * CLAUDE_SEARCH_USD : 0);
}
