import { describe, it, expect } from 'vitest';
import { parseArticles } from './news';

const resp = {
  articles: [
    { url: 'https://example.com/a', title: '  Selskap X vinner kontrakt  ', domain: 'example.com', seendate: '20260910T120000Z' },
    { url: 'https://news.example/b', title: 'Selskap X ansetter ny leder', seendate: '20260901T083000Z' },
    { url: 'https://no-title.example/c' },
    { url: '', title: 'Skal ikke med — mangler url' },
  ],
};

describe('parseArticles', () => {
  it('drops entries missing a url or title', () => {
    const items = parseArticles(resp, 10);
    expect(items).toHaveLength(2);
  });

  it('trims titles and derives domain from the url when missing', () => {
    const items = parseArticles(resp, 10);
    expect(items[0].title).toBe('Selskap X vinner kontrakt');
    expect(items[1].domain).toBe('news.example');
  });

  it('parses GDELT seendate into an ISO string', () => {
    const items = parseArticles(resp, 10);
    expect(items[0].seenAt).toBe('2026-09-10T12:00:00.000Z');
  });

  it('respects the limit', () => {
    const items = parseArticles(resp, 1);
    expect(items).toHaveLength(1);
  });

  it('returns [] for a malformed response', () => {
    expect(parseArticles({}, 5)).toEqual([]);
    expect(parseArticles(null, 5)).toEqual([]);
  });
});
