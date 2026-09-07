import { describe, it, expect } from 'vitest';
import { buildRates } from './fx';

// base=NOK → rates[code] is "units of code per 1 NOK"
const today = { date: '2026-09-03', rates: { USD: 0.1073, EUR: 0.0921, SEK: 1.028, DKK: 0.6875 } };
const prev = { date: '2026-09-02', rates: { USD: 0.1075, EUR: 0.0921, SEK: 1.02, DKK: 0.687 } };

describe('buildRates', () => {
  const rates = buildRates(today, prev);

  it('returns all four currencies', () => {
    expect(rates.map((r) => r.code)).toEqual(['USD', 'EUR', 'SEK', 'DKK']);
  });

  it('inverts to NOK per unit, ×100 for SEK/DKK', () => {
    const usd = rates.find((r) => r.code === 'USD')!;
    expect(usd.value).toBeCloseTo(1 / 0.1073, 2); // ≈ 9.3
    const sek = rates.find((r) => r.code === 'SEK')!;
    expect(sek.value).toBeCloseTo((1 / 1.028) * 100, 1); // ≈ 97
    const dkk = rates.find((r) => r.code === 'DKK')!;
    expect(dkk.value).toBeCloseTo((1 / 0.6875) * 100, 1); // ≈ 145
  });

  it('computes the day-over-day change', () => {
    const usd = rates.find((r) => r.code === 'USD')!;
    // USD strengthened vs NOK (0.1075 -> 0.1073 code-per-NOK means more NOK per USD)
    expect(usd.changePct).toBeGreaterThan(0);
    const eur = rates.find((r) => r.code === 'EUR')!;
    expect(eur.changePct).toBeCloseTo(0, 3); // unchanged
  });

  it('leaves changePct null when there is no previous day', () => {
    for (const r of buildRates(today, null)) expect(r.changePct).toBeNull();
  });

  it('skips a currency the API did not return', () => {
    const partial = buildRates({ date: 'x', rates: { USD: 0.107 } }, null);
    expect(partial.map((r) => r.code)).toEqual(['USD']);
  });
});
