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

// firma.no and www.firma.no are the same site — a stored website without
// "www." used to discard every menu link that had it (and vice versa).
function sameSite(a: string, b: string): boolean {
  const bare = (h: string) => h.toLowerCase().replace(/^www\./, '');
  return bare(a) === bare(b);
}

// Where Norwegian company sites usually keep their people, for when the
// homepage menu doesn't link to them in a way findLikelyContactPages spots
// (JS-rendered menus, icon-only links).
const COMMON_CONTACT_PATHS = ['/kontakt', '/om-oss', '/ansatte', '/kontakt-oss', '/contact', '/about-us', '/team', '/people'];

/**
 * Pages to read for contacts: the best-matching links from the homepage,
 * topped up with common paths on the same site, de-duplicated, capped to
 * `limit`.
 */
export function contactPageCandidates(html: string, baseUrl: string, limit = 4): string[] {
  const found = findLikelyContactPages(html, baseUrl, limit);
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return found;
  }
  const seen = new Set(found.map((u) => u.replace(/\/$/, '').toLowerCase()));
  const out = [...found];
  for (const path of COMMON_CONTACT_PATHS) {
    if (out.length >= limit) break;
    const url = new URL(path, base).toString();
    const key = url.replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

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
    if (!sameSite(abs.hostname, base.hostname)) continue;

    const key = abs.toString();
    scores.set(key, Math.max(scores.get(key) ?? 0, score));
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([url]) => url);
}

// Words too common in maritime company names to identify one on their own.
const GENERIC_NAME_WORDS = new Set([
  'as', 'asa', 'sa', 'da', 'ans', 'ks', 'nuf', 'norway', 'norge', 'norwegian', 'bergen', 'group', 'gruppen',
  'holding', 'holdings', 'shipping', 'service', 'services', 'marine', 'maritime', 'invest', 'eiendom', 'rederi',
  'offshore', 'subsea', 'teknikk', 'technology', 'solutions', 'og', 'and', 'the', 'of',
]);

/**
 * Does this page look like the company's own site? Used before trusting a
 * website derived from an email domain — post@obos.no on a boat harbour
 * co-op means OBOS manages it, not that obos.no is the harbour's site.
 * True if the page text has the org.nr, the full name (minus company form),
 * or a distinctive (non-generic, 4+ letter) word from the name.
 */
export function siteMentionsCompany(html: string, companyName: string, orgnr: string): boolean {
  const text = stripHtml(html).toLowerCase();
  if (text.replace(/\s/g, '').includes(orgnr)) return true;
  const words = companyName
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s&-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const core = words.filter((w) => !['as', 'asa', 'sa', 'da', 'ans', 'ks', 'nuf'].includes(w)).join(' ');
  if (core && text.includes(core)) return true;
  return words.some((w) => w.length >= 4 && !GENERIC_NAME_WORDS.has(w) && text.includes(w));
}
