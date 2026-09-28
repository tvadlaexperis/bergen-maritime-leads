import type { Provider } from '../types';
import { safeFetchResult, safeFetchText } from '../../http/safeFetch';
import { parseFeedPage, parseAd, type FeedLine, type JobAd } from '../../jobAds';

// NAV's job vacancy feed (pam-stilling-feed.nav.no) — every job ad published
// in Norway, with the employer's (underenhet) orgnr. Docs:
// https://navikt.github.io/pam-stilling-feed/
//
// Access: NAV_FEED_TOKEN is a personal token NAV issues after a written
// agreement to their terms of use. NAV also publishes a rotating public token
// "for experiments only" — used here ONLY when NAV_FEED_USE_PUBLIC_TOKEN=1
// (local testing), never as a silent fallback in production.
const HOST = 'pam-stilling-feed.nav.no';
const BASE = `https://${HOST}`;

let publicToken: { value: string; at: number } | null = null;

async function token(): Promise<string | null> {
  if (process.env.NAV_FEED_TOKEN) return process.env.NAV_FEED_TOKEN;
  if (process.env.NAV_FEED_USE_PUBLIC_TOKEN !== '1') return null;
  if (publicToken && Date.now() - publicToken.at < 3600_000) return publicToken.value;
  const text = await safeFetchText(`${BASE}/api/publicToken`, { allowHosts: [HOST], timeoutMs: 8_000 });
  const t = text?.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/)?.[0] ?? null;
  if (t) publicToken = { value: t, at: Date.now() };
  return t;
}

async function getJson(path: string, extraHeaders: Record<string, string> = {}): Promise<unknown> {
  const t = await token();
  if (!t) throw new Error('NAV-token mangler (NAV_FEED_TOKEN)');
  const res = await safeFetchResult(`${BASE}${path}`, {
    allowHosts: [HOST],
    // A first page asked for "modified since <date>" can take NAV well over
    // ten seconds to compute; later pages are ~1 s.
    timeoutMs: 25_000,
    maxBytes: 8 * 1024 * 1024,
    headers: { Accept: 'application/json', Authorization: `Bearer ${t}`, ...extraHeaders },
  });
  if (!res.ok) throw new Error(`NAV ${res.reason}`);
  return JSON.parse(res.text);
}

/** One feed page: from `path` (a stored next_url), or the first page modified since `since`. */
async function feedPage(args: { path?: string; since?: string }): Promise<{ lines: FeedLine[]; nextUrl: string | null; path: string }> {
  const path = args.path ?? '/api/v1/feed';
  const headers: Record<string, string> =
    !args.path && args.since ? { 'If-Modified-Since': new Date(args.since).toUTCString() } : {};
  const page = parseFeedPage(await getJson(path, headers));
  return { ...page, path };
}

async function getAd(args: { url: string; uuid: string }): Promise<JobAd | null> {
  return parseAd(await getJson(args.url), args.uuid);
}

export const navProvider: Provider = {
  id: 'nav',
  tools: ['feedPage', 'getAd'],
  isEnabled: () => !!process.env.NAV_FEED_TOKEN || process.env.NAV_FEED_USE_PUBLIC_TOKEN === '1',
  async call(tool, args) {
    if (tool === 'feedPage') return feedPage(args as { path?: string; since?: string });
    if (tool === 'getAd') return getAd(args as { url: string; uuid: string });
    throw new Error(`nav: unknown tool ${tool}`);
  },
};
