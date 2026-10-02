import type { Provider } from '../types';
import { safeFetchText } from '../../http/safeFetch';

// NOK exchange rates for the header ticker: live market prices from Yahoo
// Finance (free, no key) — the same source as ../../Other Projects/
// minaksjeportal, so both apps show the same numbers. Refreshed every 5 min.
const HOST = 'query1.finance.yahoo.com';
const chartUrl = (code: string) => `https://${HOST}/v8/finance/chart/${code}NOK=X?range=1d&interval=1d`;

// USD/EUR shown as NOK per 1 unit; SEK/DKK as NOK per 100 (Norges Bank style).
const PER100 = new Set(['SEK', 'DKK']);
export const FX_CODES = ['USD', 'EUR', 'SEK', 'DKK'] as const;
export type FxCode = (typeof FX_CODES)[number];

export interface FxRate {
  code: FxCode;
  value: number; // NOK per unit (×100 for SEK/DKK)
  /** Change vs. the previous close, in % of NOK per unit. Negative = NOK stronger. */
  changePct: number | null;
}

type ChartResp = { chart?: { result?: { meta?: { regularMarketPrice?: number; chartPreviousClose?: number } }[] } };

/** One currency from Yahoo's chart response (price = NOK per 1 unit). */
export function buildRate(code: FxCode, json: unknown): FxRate | null {
  const meta = (json as ChartResp)?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  if (typeof price !== 'number' || !(price > 0)) return null;
  const prev = meta?.chartPreviousClose;
  return {
    code,
    value: price * (PER100.has(code) ? 100 : 1),
    changePct: typeof prev === 'number' && prev > 0 ? ((price - prev) / prev) * 100 : null,
  };
}

async function fetchRate(code: FxCode): Promise<FxRate | null> {
  const body = await safeFetchText(chartUrl(code), {
    allowHosts: [HOST],
    timeoutMs: 8_000,
    revalidate: 300,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!body) return null;
  try {
    return buildRate(code, JSON.parse(body));
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
    const rates = await Promise.all(FX_CODES.map(fetchRate));
    return rates.filter((r): r is FxRate => r != null);
  },
};
