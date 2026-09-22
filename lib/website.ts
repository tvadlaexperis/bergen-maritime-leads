// Minimal, dependency-free helpers for reading a company's own public
// website (its "about us"/"contact"/"team" pages) — not a general HTML
// parser, just enough regex-based extraction to hand readable text to the
// AI contact-extraction call in lib/orchestrator/providers/ai.ts. Deliberately
// no cheerio/jsdom dependency: the codebase has none, and this only needs to
// be good enough for an LLM to read, not a faithful DOM.

const ENTITY_MAP: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  oslash: 'ø',
  Oslash: 'Ø',
  aelig: 'æ',
  Aelig: 'Æ',
  aring: 'å',
  Aring: 'Å',
  eacute: 'é',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITY_MAP[name] ?? m);
}

/** Strips scripts/styles/tags and collapses whitespace into readable text. */
export function stripHtml(html: string): string {
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

const CONTACT_PAGE_KEYWORDS = [
  'about-us', 'about', 'om-oss', 'om oss', 'kontakt', 'contact', 'team',
  'ansatte', 'crew', 'people', 'staff', 'ledelse', 'organisasjon', 'our-team',
];

/**
 * Finds same-site links whose href or link text suggest an "about us" /
 * "contact" / "team" style page, ranked by how many keywords matched.
 * Returns absolute URLs, best match first, capped to `limit`.
 */
export function findLikelyContactPages(html: string, baseUrl: string, limit = 3): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const scores = new Map<string, number>();
  const linkRe = /<a\s+[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const href = m[1];
    const text = stripHtml(m[2]).toLowerCase();
    const hrefLower = href.toLowerCase();

    let score = 0;
    for (const kw of CONTACT_PAGE_KEYWORDS) {
      if (hrefLower.includes(kw.replace(/ /g, '-')) || hrefLower.includes(kw.replace(/ /g, ''))) score += 2;
      if (text.includes(kw)) score += 1;
    }
    if (score === 0) continue;

    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      continue;
    }
    if (abs.hostname !== base.hostname) continue; // same-site only

    const key = abs.toString();
    scores.set(key, Math.max(scores.get(key) ?? 0, score));
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([url]) => url);
}
