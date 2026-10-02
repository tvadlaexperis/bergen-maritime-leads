import { describe, it, expect } from 'vitest';
import { buildRate } from './fx';

// Yahoo chart response: meta.regularMarketPrice = NOK per 1 unit right now,
// chartPreviousClose = NOK per 1 unit at the previous close.
const chart = (price: number, prev?: number) => ({
  chart: { result: [{ meta: { regularMarketPrice: price, chartPreviousClose: prev } }] },
});

describe('buildRate', () => {
  it('gives NOK per unit, ×100 for SEK/DKK', () => {
    expect(buildRate('USD', chart(9.6257))!.value).toBeCloseTo(9.6257, 4);
    expect(buildRate('SEK', chart(0.9598))!.value).toBeCloseTo(95.98, 2);
  });

  it('change is negative when NOK strengthened (fewer NOK per unit)', () => {
    expect(buildRate('USD', chart(9.5, 9.6))!.changePct).toBeLessThan(0);
    expect(buildRate('EUR', chart(10.9, 10.8))!.changePct).toBeGreaterThan(0);
  });

  it('leaves changePct null without a previous close', () => {
    expect(buildRate('USD', chart(9.6))!.changePct).toBeNull();
  });

  it('returns null for a missing or broken response', () => {
    expect(buildRate('USD', {})).toBeNull();
    expect(buildRate('USD', chart(0))).toBeNull();
  });
});
