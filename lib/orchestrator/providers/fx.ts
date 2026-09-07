import type { Provider } from '../types';
import { safeFetchText } from '../../http/safeFetch';

// NOK exchange rates for the header ticker. Frankfurter (ECB data, free, no key).
// docs/04-data-sources.md.
const HOST = 'api.frankfurter.dev';
const BASE = `https://${HOST}/v1`;

// USD/EUR shown as NOK per 1 unit; SEK/DKK as NOK per 100 (Norges Bank style).
const PER100 = new Set(['SEK', 'DKK']);
export const FX_CODES = ['USD', 'EUR', 'SEK', 'DKK'] as const;
export type FxCode = (typeof FX_CODES)[number];

export interface FxRate {
  code: FxCode;
  value: number; // NOK per unit (×100 for SEK/DKK)
  changePct: number | null; // vs. the previous ECB business day
}

type FrankfurterResp = { date: string; rates: Record<string, number> };

// base=NOK → rates[code] is "code per 1 NOK"; invert for "NOK per code".
function nokPer(resp: FrankfurterResp, code: string): number | null {
  const r = resp.rates?.[code];
  return typeof r === 'number' && r > 0 ? 1 / r : null;
}

export function buildRates(today: FrankfurterResp, prev: FrankfurterResp | null): FxRate[] {
  const out: FxRate[] = [];
  for (const code of FX_CODES) {
    const now = nokPer(today, code);
    if (now == null) continue;
    const mult = PER100.has(code) ? 100 : 1;
    const before = prev ? nokPer(prev, code) : null;
    out.push({
      code,
      value: now * mult,
      changePct: before ? ((now - before) / before) * 100 : null,
    });
  }
  return out;
}

async function get(url: string): Promise<FrankfurterResp | null> {
  const body = await safeFetchText(url, { allowHosts: [HOST], timeoutMs: 8_000, revalidate: 3600 });
  if (!body) return null;
  try {
    return JSON.parse(body) as FrankfurterResp;
  } catch {
    return null;
  }
}

export const fxProvider: Provider = {
  id: 'fx',
  tools: ['rates'],
  isEnabled: () => process.env.SKIP_FX !== '1',
  async call(tool) {
    if (tool !== 'rates') throw new Error(`fx: unknown tool ${tool}`);
    const symbols = FX_CODES.join(',');
    const today = await get(`${BASE}/latest?base=NOK&symbols=${symbols}`);
    if (!today) return [];
    // previous ECB business day
    const prevDate = new Date(today.date + 'T00:00:00Z');
    prevDate.setUTCDate(prevDate.getUTCDate() - (prevDate.getUTCDay() === 1 ? 3 : 1));
    const prev = await get(`${BASE}/${prevDate.toISOString().slice(0, 10)}?base=NOK&symbols=${symbols}`);
    return buildRates(today, prev);
  },
};
