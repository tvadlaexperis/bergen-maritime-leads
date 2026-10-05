import { describe, it, expect } from 'vitest';
import { industryChallengesFor } from './industryChallenges';
import { NACE_CODES } from '../data/maritime-sectors.mjs';

describe('industryChallengesFor', () => {
  it('has challenges for every maritime NACE code we scan', () => {
    for (const { code } of NACE_CODES as { code: string }[]) {
      expect(industryChallengesFor(code).length, code).toBeGreaterThan(0);
    }
  });

  it('matches a full company code by prefix (03.211 → aquaculture)', () => {
    expect(industryChallengesFor('03.211')[0].challenge).toMatch(/lakselus/i);
    expect(industryChallengesFor('03.111').some((c) => /kvote/i.test(c.challenge))).toBe(true);
  });

  it('returns nothing for an unknown or missing code', () => {
    expect(industryChallengesFor('99.99')).toEqual([]);
    expect(industryChallengesFor(null)).toEqual([]);
  });
});
