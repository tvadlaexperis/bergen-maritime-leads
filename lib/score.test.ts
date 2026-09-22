import { describe, it, expect } from 'vitest';
import { computeLeadScore, scoreBand } from './score';
import type { CompanyFinancials } from './types';

const fin = (year: number, revenue: number, operatingResult = 0): CompanyFinancials => ({
  year,
  currency: 'NOK',
  revenue,
  operatingResult,
  pretaxResult: null,
  profit: null,
  equity: null,
  totalAssets: null,
  totalDebt: null,
  employees: null,
});

describe('computeLeadScore', () => {
  it('a big, growing, profitable company scores high', () => {
    const r = computeLeadScore({
      employees: 220,
      financials: [fin(2024, 480_000_000, 40_000_000), fin(2023, 400_000_000, 30_000_000)],
    });
    expect(r.band).toBe('high');
    expect(r.revenueGrowthPct).toBeCloseTo(20, 0);
    expect(r.operatingResultLatest).toBe(40_000_000);
    expect(r.operatingMarginPct).toBeCloseTo(8.33, 1);
    expect(r.leadScore).toBeGreaterThan(66);
  });

  it('a tiny company with no accounts scores low', () => {
    const r = computeLeadScore({ employees: 2, financials: [] });
    expect(r.band).toBe('low');
    expect(r.revenueLatest).toBeNull();
    expect(r.reason).toMatch(/Lav prioritet/);
  });

  it('no data at all yields the "run a refresh" reason', () => {
    const r = computeLeadScore({ employees: null, financials: [] });
    expect(r.reason).toMatch(/Ingen regnskapstall/);
  });

  it('missing prior year gives a neutral growth score', () => {
    const r = computeLeadScore({ employees: 50, financials: [fin(2024, 100_000_000)] });
    expect(r.revenueGrowthPct).toBeNull();
    expect(r.growthScore).toBe(45);
  });

  it('shrinking revenue pulls the growth score down', () => {
    const r = computeLeadScore({
      employees: 60,
      financials: [fin(2024, 70_000_000), fin(2023, 100_000_000)],
    });
    expect(r.revenueGrowthPct).toBeCloseTo(-30, 0);
    expect(r.growthScore).toBe(0);
  });

  it('reason string mentions employees, revenue and year', () => {
    const r = computeLeadScore({ employees: 142, financials: [fin(2024, 312_000_000, 19_000_000)] });
    expect(r.reason).toMatch(/142 ansatte/);
    expect(r.reason).toMatch(/omsetning/);
    expect(r.reason).toMatch(/2024/);
  });
});

describe('scoreBand', () => {
  it('maps score to band', () => {
    expect(scoreBand(80)).toBe('high');
    expect(scoreBand(50)).toBe('mid');
    expect(scoreBand(20)).toBe('low');
  });
});
