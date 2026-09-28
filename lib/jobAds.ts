// Job ads from NAV's open vacancy feed (pam-stilling-feed.nav.no). Pure — the
// HTTP lives in lib/orchestrator/providers/nav.ts, the matching to our
// companies in lib/scan.ts.
//
// Two things the feed makes non-obvious:
// - employer.orgnr is the UNDERENHET (the workplace), not the company we
//   store: Tide AS advertises as 983235824, the company is 912423921. It has
//   to be mapped via Brreg's underenheter register.
// - The feed is chronological and huge (all of Norway, ~1,200 entries a day),
//   so each entry is pre-filtered on the little the feed line itself carries
//   (status, municipality, business name) before fetching the full ad.
import { distinctiveWords } from './groups';

export interface FeedLine {
  uuid: string;
  url: string; // relative, "/api/v1/feed/<uuid>"
  status: 'ACTIVE' | 'INACTIVE' | string;
  businessName: string | null;
  municipal: string | null;
  modified: string | null;
}

export interface JobAd {
  uuid: string;
  employerOrgnr: string | null; // underenhet
  employerName: string | null;
  title: string;
  jobTitle: string | null;
  occupation: string | null; // "IT / Utvikling"
  location: string | null;
  published: string | null; // YYYY-MM-DD
  expires: string | null;
  applicationDue: string | null; // free text in the source ("Snarest") — kept as given
  sourceUrl: string;
  contacts: { name: string; title: string | null; email: string | null; phone: string | null }[];
  isTech: boolean;
}

type RawFeed = { items?: { id?: string; url?: string; _feed_entry?: Record<string, unknown> }[]; next_url?: string | null };

export function parseFeedPage(json: unknown): { lines: FeedLine[]; nextUrl: string | null } {
  const f = (json ?? {}) as RawFeed;
  const lines: FeedLine[] = [];
  for (const it of f.items ?? []) {
    const e = it._feed_entry ?? {};
    const uuid = String(e.uuid ?? it.id ?? '');
    if (!uuid || !it.url) continue;
    lines.push({
      uuid,
      url: it.url,
      status: String(e.status ?? ''),
      businessName: typeof e.businessName === 'string' ? e.businessName : null,
      municipal: typeof e.municipal === 'string' ? e.municipal : null,
      modified: typeof e.sistEndret === 'string' ? e.sistEndret : null,
    });
  }
  return { lines, nextUrl: f.next_url ?? null };
}

const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// IT / technology roles — what matters most for Experis. Matched on NAV's
// occupation categories and the title. Deliberately not "tech"/"teknisk":
// in shipping a Technical Superintendent is a ship engineer, not IT.
const TECH_RE =
  /(\bit\b|\bikt\b|utvikler|developer|programm|software|systemutvikl|\bdata\b|dataingeni|database|cyber|informasjonssikkerhet|devops|cloud|skytjenest|(løsnings|system|it-|data|enterprise|cloud)arkitekt|digitaliser)/i;

export function parseAd(json: unknown, uuid: string): JobAd | null {
  const e = (json ?? {}) as { status?: string; ad_content?: Record<string, unknown> };
  const a = e.ad_content;
  if (!a) return null; // stopped ads have their content removed
  const employer = (a.employer ?? {}) as Record<string, unknown>;
  const occ = ((a.occupationCategories ?? []) as { level1?: string; level2?: string }[])[0];
  const loc = ((a.workLocations ?? []) as { city?: string; municipal?: string }[])[0];
  const title = str(a.title) ?? str(a.jobtitle);
  if (!title) return null;
  const occupation = occ ? [occ.level1, occ.level2].filter(Boolean).join(' / ') || null : null;
  const contacts = ((a.contactList ?? []) as Record<string, unknown>[])
    .map((c) => ({ name: str(c.name) ?? '', title: str(c.title) ?? str(c.role), email: str(c.email), phone: str(c.phone) }))
    .filter((c) => c.name);
  return {
    uuid,
    employerOrgnr: str(employer.orgnr),
    employerName: str(employer.name),
    title,
    jobTitle: str(a.jobtitle),
    occupation,
    location: str(loc?.city) ?? str(loc?.municipal),
    published: day(a.published),
    expires: day(a.expires),
    applicationDue: str(a.applicationDue)?.slice(0, 40) ?? null,
    sourceUrl: `https://arbeidsplassen.nav.no/stillinger/stilling/${uuid}`,
    contacts,
    isTech: TECH_RE.test(`${occupation ?? ''} ${title} ${str(a.jobtitle) ?? ''}`),
  };
}

// Industry words that are distinctive among company names in general but
// common among Norwegian employers — matching on them pulled in crane
// hire in Lillestrøm and "Nordic" factories in Kongsvinger.
const COMMON_EMPLOYER_WORDS = new Set([
  'nordic', 'royal', 'crew', 'ocean', 'fjord', 'north', 'nord', 'vest', 'west', 'havn', 'skips', 'skip', 'invest',
  'partner', 'partners', 'energy', 'power', 'marin', 'drilling', 'tankers', 'tank', 'bulk', 'chemical', 'seafood',
  'fish', 'fisk', 'laks', 'boat', 'yacht', 'cruise', 'logistics', 'transport', 'industri', 'teknisk', 'solutions',
  'norsk', 'vestland', 'hordaland', 'consult', 'consulting', 'eiendom', 'bygg', 'kran',
]);

/**
 * The words the feed's employer names are matched against: each company's
 * FIRST distinctive name word (Odfjell, Wilson, Misje, Beerenberg), 5+
 * letters, not a common employer word.
 */
export function employerNameKeys(companyNames: string[]): Set<string> {
  const keys = new Set<string>();
  for (const n of companyNames) {
    const w = distinctiveWords(n)[0];
    if (w && w.length >= 5 && !COMMON_EMPLOYER_WORDS.has(w)) keys.add(w);
  }
  return keys;
}

/**
 * Cheap pre-filter on the feed line, before fetching the full ad: active, and
 * either in one of our municipalities or from an employer whose name shares
 * a distinctive word with one of our companies (a Bergen shipowner hiring
 * crew or staff elsewhere).
 */
export function isCandidate(line: FeedLine, municipalities: Set<string>, nameWords: Set<string>): boolean {
  if (line.status !== 'ACTIVE') return false;
  if (line.municipal && municipalities.has(line.municipal.toUpperCase())) return true;
  if (!line.businessName) return false;
  const first = distinctiveWords(line.businessName)[0];
  return !!first && nameWords.has(first);
}
