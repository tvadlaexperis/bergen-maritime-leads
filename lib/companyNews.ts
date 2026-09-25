// News about a company, found by a Google Search-grounded Gemini call in the
// AI pass (ai.findNews in lib/orchestrator/providers/ai.ts) and stored in
// `company_news`. Replaces GDELT as the main source: GDELT matched only the
// exact registered name ("… AS"), which the press rarely writes, and its
// per-IP rate limit made it fail on Vercel's shared addresses.
//
// This module is pure (no I/O) — parsing and validating the model's answer.

export const NEWS_CATEGORIES = [
  'kontrakt',
  'oppkjøp',
  'investering',
  'ansettelse',
  'ledelse',
  'resultat',
  'nybygg',
  'annet',
] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export const NEWS_CATEGORY_LABEL: Record<NewsCategory, string> = {
  kontrakt: 'Kontrakt',
  oppkjøp: 'Oppkjøp',
  investering: 'Investering',
  ansettelse: 'Ansettelser',
  ledelse: 'Ledelse',
  resultat: 'Resultat',
  nybygg: 'Nybygg/fartøy',
  annet: 'Annet',
};

export interface FoundNews {
  title: string;
  url: string;
  source: string;
  date: string | null; // YYYY-MM-DD
  summary: string;
  category: NewsCategory;
}

// Directory/aggregator sites that aren't news about the company, just
// listings of it — the prompt already asks the model to skip these.
const NOT_NEWS_HOSTS = /(^|\.)(proff\.no|purehelp\.no|1881\.no|gulesider\.no|linkedin\.com|facebook\.com|brreg\.no|forvalt\.no|allabolag\.se)$/i;

const MAX_AGE_DAYS = 400; // "last 12 months", with some slack for late indexing

/**
 * Finds the JSON array in a model answer. Search-grounded answers are prose
 * around the JSON and often carry citation markers — "[1]", "[1][2]" — before
 * or after it, so "first '[' to last ']'" (the old approach) grabbed the
 * wrong span and silently returned nothing. Tries each '[' as a start and
 * each ']' as an end, longest first, and keeps the first span that parses to
 * an array of objects (or an empty array). Null when there's none at all.
 */
export function findJsonArray(text: string): unknown[] | null {
  const src = text.replace(/```(?:json)?/gi, '');
  const starts: number[] = [];
  const ends: number[] = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '[') starts.push(i);
    else if (src[i] === ']') ends.push(i);
  }
  let tries = 0;
  for (const s of starts) {
    for (let k = ends.length - 1; k >= 0 && ends[k] > s; k--) {
      if (++tries > 400) return null;
      let v: unknown;
      try {
        v = JSON.parse(src.slice(s, ends[k] + 1));
      } catch {
        continue;
      }
      if (Array.isArray(v) && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) return v;
    }
  }
  return null;
}

/**
 * Parses the model's answer — a JSON array, possibly wrapped in prose, a
 * ```json fence and citation markers, since structured output isn't available
 * together with the search tool — and keeps only well-formed, recent,
 * non-directory items.
 */
export function parseNewsAnswer(text: string, now = Date.now()): FoundNews[] {
  const raw = findJsonArray(text);
  if (!raw) return [];

  const out: FoundNews[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const title = typeof r.title === 'string' ? r.title.trim() : '';
    const url = typeof r.url === 'string' ? r.url.trim() : '';
    if (!title || !/^https?:\/\//i.test(url)) continue;
    let host: string;
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
    if (NOT_NEWS_HOSTS.test(host) || seen.has(url)) continue;

    const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null;
    if (date) {
      const t = Date.parse(`${date}T00:00:00Z`);
      if (Number.isNaN(t) || t > now + 86_400_000 || now - t > MAX_AGE_DAYS * 86_400_000) continue;
    }
    const category = (NEWS_CATEGORIES as readonly string[]).includes(String(r.category))
      ? (r.category as NewsCategory)
      : 'annet';
    seen.add(url);
    out.push({
      title: title.slice(0, 300),
      url,
      source: typeof r.source === 'string' && r.source.trim() ? r.source.trim().slice(0, 80) : host,
      date,
      summary: typeof r.summary === 'string' ? r.summary.trim().slice(0, 400) : '',
      category,
    });
  }
  return out.slice(0, 6);
}
