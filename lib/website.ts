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

// Pages that list PEOPLE outrank general "about us" pages: a homepage with
// six "About us" sub-links (history, mission, group structure …) used to
// fill every slot and push /contacts out (wilsonship.no). Each keyword counts
// once per link; weight is per keyword.
const PEOPLE_KEYWORDS = [
  'kontakt', 'contact', 'team', 'ansatte', 'people', 'staff', 'ledelse', 'management',
  'medarbeidere', 'employees', 'organisasjon', 'organisation', 'organization', 'crew', 'leadership',
];
const GENERAL_KEYWORDS = ['about', 'om-oss', 'om oss'];
// Never people pages, however they're worded.
const EXCLUDE_WORDS = [
  'privacy', 'personvern', 'cookie', 'history', 'historie', 'sustainab', 'baerekraft', 'bærekraft',
  'investor', 'news', 'nyhet', 'press', 'vacanc', 'stilling', 'career', 'karriere', 'jobb', 'job',
  'whistle', 'varsling', 'fleet', 'flåte', 'terms', 'vilkår', 'login', 'logg-inn', '.pdf',
  'aktuelt', 'blog', 'artikkel', 'article',
];

function linkScore(hrefLower: string, text: string): number {
  if (EXCLUDE_WORDS.some((w) => hrefLower.includes(w))) return 0;
  const inHref = (kw: string) => hrefLower.includes(kw.replace(/ /g, '-')) || hrefLower.includes(kw.replace(/ /g, ''));
  // Per people keyword: 3 in the address, +1 when the link text agrees
  // (both beats address-only); text alone is a weak hint.
  let score = 0;
  for (const kw of PEOPLE_KEYWORDS) score += (inHref(kw) ? 3 : 0) + (text.includes(kw) ? 1 : 0);
  if (GENERAL_KEYWORDS.some((kw) => inHref(kw) || text.includes(kw))) score += 1;
  return score;
}

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

// Second-level pages worth reading first: where the named people usually
// are on sites that split contacts by office or department
// (wilsonship.no: /contacts → /contacts/office/bergen-headquarter).
const PRIORITY_WORDS = ['executive', 'management', 'ledelse', 'leadership', 'headquarter', 'hovedkontor', 'bergen', 'board', 'styre'];

/**
 * Links one level further down from already-read contact pages (office,
 * department, team pages), same site only, not already visited. Ranked by
 * the contact keywords, with a bonus for management/headquarters/Bergen so a
 * site with a dozen offices abroad still gets its head office read first.
 */
export function deeperContactPages(pages: { html: string; url: string }[], visited: Set<string>, limit = 4): string[] {
  const norm = (u: string) => u.replace(/#.*$/, '').replace(/\/$/, '').toLowerCase();
  const seen = new Set([...visited].map(norm));
  const scored = new Map<string, number>();
  for (const page of pages) {
    for (const url of findLikelyContactPages(page.html, page.url, 40)) {
      const key = norm(url);
      if (seen.has(key)) continue;
      const lower = url.toLowerCase();
      const bonus = PRIORITY_WORDS.reduce((n, w) => n + (lower.includes(w) ? 3 : 0), 0);
      // Deeper paths are more specific (a department, an office) than a hub.
      const depth = new URL(url).pathname.split('/').filter(Boolean).length;
      scored.set(url, Math.max(scored.get(url) ?? 0, bonus + depth));
    }
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([u]) => u);
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

  const scores = new Map<string, { url: string; score: number }>();
  const linkRe = /<a\s+[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const href = m[1];
    const text = stripHtml(m[2]).toLowerCase();
    const hrefLower = href.toLowerCase();

    const score = linkScore(hrefLower, text);
    if (score === 0) continue;

    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      continue;
    }
    if (!sameSite(abs.hostname, base.hostname)) continue;

    // "/contacts" and "/contacts/" are one page — don't spend two slots on it.
    abs.hash = '';
    const key = `${abs.origin}${abs.pathname.replace(/\/+$/, '')}${abs.search}`.toLowerCase();
    const prev = scores.get(key);
    if (!prev || score > prev.score) scores.set(key, { url: abs.toString(), score });
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.url);
}

// Words too common in maritime company names to identify one on their own.
export const GENERIC_NAME_WORDS = new Set([
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
