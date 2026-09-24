import { describe, it, expect } from 'vitest';
import { cleanErrorMessage, groupScanErrors } from './scanErrors';

const QUOTA =
  'Gemini HTTP 429: {"error":{"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To mon';

describe('cleanErrorMessage', () => {
  it('keeps the first sentence of a Google JSON error', () => {
    expect(cleanErrorMessage(QUOTA)).toBe(
      'HTTP 429: You exceeded your current quota, please check your plan and billing details.',
    );
  });
  it('normalizes varying timeout durations', () => {
    expect(cleanErrorMessage('timeout after 12345ms')).toBe('tidsavbrudd');
    expect(cleanErrorMessage('Gemini tidsavbrudd etter 55 s')).toBe('tidsavbrudd');
  });
});

describe('groupScanErrors', () => {
  it('groups identical errors per step, largest first, with a billing hint for quota errors', () => {
    const groups = groupScanErrors([
      { scope: 'ai.findWebsite 932610299', message: QUOTA },
      { scope: 'ai.findWebsite 995423243', message: QUOTA },
      { scope: 'ai.analyze 932610299', message: QUOTA },
      { scope: 'ai.findWebsite 921437935', message: QUOTA },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ step: 'Nettsidesøk', count: 3, orgnrs: ['932610299', '995423243', '921437935'] });
    expect(groups[0].hint).toMatch(/fakturering/);
    expect(groups[1]).toMatchObject({ step: 'AI-vurdering', count: 1 });
  });
  it('handles scopes without an orgnr', () => {
    const [g] = groupScanErrors([{ scope: 'discover Bergen/50', message: 'HTTP 503' }]);
    expect(g).toMatchObject({ step: 'Oppdagelse', count: 1, orgnrs: [] });
    expect(g.hint).toMatch(/prøves igjen/);
  });
});
