import type { Provider } from '../types';
import { safeFetchText } from '../../http/safeFetch';

// GDELT Project — free, keyless public news index (DOC 2.0 API). Rate-limited
// to ~1 req/5s per the API itself; a long revalidate keeps normal per-company
// browsing well under that. docs/04-data-sources.md.
const HOST = 'api.gdeltproject.org';
const BASE = `https://${HOST}/api/v2/doc/doc`;

export interface NewsItem {
  title: string;
  url: string;
  domain: string;
  seenAt: string | null; // ISO date, or null if unparseable
}

interface RawArticle {
  url?: string;
  title?: string;
  seendate?: string; // e.g. "20260721T070000Z"
  domain?: string;
}
interface RawResponse {
  articles?: RawArticle[];
}

function parseSeenDate(raw: string | undefined): string | null {
  if (!raw || raw.length < 15) return null;
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseArticles(json: unknown, limit: number): NewsItem[] {
  const arr = (json as RawResponse)?.articles ?? [];
  const out: NewsItem[] = [];
  for (const a of arr) {
    if (!a.url || !a.title) continue;
    let domain = a.domain;
    if (!domain) {
      try {
        domain = new URL(a.url).hostname.replace(/^www\./, '');
      } catch {
        domain = '';
      }
    }
    out.push({ title: a.title.trim(), url: a.url, domain, seenAt: parseSeenDate(a.seendate) });
    if (out.length >= limit) break;
  }
  return out;
}

async function searchNews(query: string, limit: number): Promise<NewsItem[]> {
  const url =
    `${BASE}?query=${encodeURIComponent(`"${query}"`)}` +
    `&mode=artlist&maxrecords=${limit}&format=json&sort=datedesc`;
  const body = await safeFetchText(url, {
    allowHosts: [HOST],
    timeoutMs: 8_000,
    revalidate: 21_600, // 6h — stays well clear of GDELT's per-IP rate limit
    headers: { Accept: 'application/json' },
  });
  if (!body) return [];
  try {
    return parseArticles(JSON.parse(body), limit);
  } catch {
    return [];
  }
}

export const newsProvider: Provider = {
  id: 'news',
  tools: ['search'],
  isEnabled: () => process.env.SKIP_NEWS !== '1',
  async call(tool, args) {
    if (tool !== 'search') throw new Error(`news: unknown tool ${tool}`);
    const { query, limit } = args as { query: string; limit?: number };
    return searchNews(query, limit && limit > 0 ? limit : 5);
  },
};
