import { describe, it, expect } from 'vitest';
import { parseNewsAnswer, findJsonArray } from './companyNews';

const NOW = Date.parse('2026-09-25T12:00:00Z');

describe('parseNewsAnswer', () => {
  it('reads a fenced JSON array wrapped in prose', () => {
    const text =
      'Her er treffene:\n```json\n[{"title":"Beerenberg vinner kontrakt","url":"https://www.bt.no/a/1","source":"BT","date":"2026-08-01","summary":"Stor kontrakt.","category":"kontrakt"}]\n```';
    expect(parseNewsAnswer(text, NOW)).toEqual([
      {
        title: 'Beerenberg vinner kontrakt',
        url: 'https://www.bt.no/a/1',
        source: 'BT',
        date: '2026-08-01',
        summary: 'Stor kontrakt.',
        category: 'kontrakt',
      },
    ]);
  });

  it('drops directory sites, stale or future dates, bad URLs and duplicates', () => {
    const items = [
      { title: 'Proff-oppføring', url: 'https://www.proff.no/x', date: '2026-08-01' },
      { title: 'Gammel sak', url: 'https://e24.no/old', date: '2024-01-01' },
      { title: 'Fremtid', url: 'https://e24.no/future', date: '2027-01-01' },
      { title: 'Ingen lenke', url: 'ikke-en-url' },
      { title: 'God sak', url: 'https://e24.no/ok', date: null, category: 'tull' },
      { title: 'God sak igjen', url: 'https://e24.no/ok' },
    ];
    const out = parseNewsAnswer(JSON.stringify(items), NOW);
    expect(out.map((n) => n.url)).toEqual(['https://e24.no/ok']);
    expect(out[0]).toMatchObject({ category: 'annet', source: 'e24.no', date: null });
  });

  it('returns [] for no array or invalid JSON', () => {
    expect(parseNewsAnswer('Fant ingen nyheter.', NOW)).toEqual([]);
    expect(parseNewsAnswer('[{broken', NOW)).toEqual([]);
    expect(parseNewsAnswer('[]', NOW)).toEqual([]);
  });
});

describe('citation markers around the JSON (search-grounded answers)', () => {
  const item = '{"title":"X vinner kontrakt","url":"https://e24.no/a","source":"E24","date":"2026-08-01","summary":"S.","category":"kontrakt"}';
  it.each([
    ['before', `Jeg fant én sak [1].
[${item}]`],
    ['after', `[${item}]
Kilde: [1] e24.no`],
    ['fenced, both sides', `Resultat [1][2]:
\`\`\`json
[${item}]
\`\`\`
[1] e24`],
  ])('finds the list with a marker %s', (_, text) => {
    expect(parseNewsAnswer(text, NOW).map((n) => n.url)).toEqual(['https://e24.no/a']);
  });
  it('tells "no list at all" (null) apart from an empty list', () => {
    expect(findJsonArray('Fant ingenting relevant [1].')).toBeNull();
    expect(findJsonArray('[]')).toEqual([]);
  });
});
