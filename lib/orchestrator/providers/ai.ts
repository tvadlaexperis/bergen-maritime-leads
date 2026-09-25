import type { Provider } from '../types';
import { safeFetchText, safeFetchResult } from '../../http/safeFetch';
import { cleanWebsite } from '../../brreg';
import { stripHtml, contactPageCandidates } from '../../website';
import { parseNewsAnswer, findJsonArray, NEWS_CATEGORIES, type FoundNews } from '../../companyNews';
import { linkedinCompanyName } from '../../brreg';

// Gemini Flash builds the structured "Om selskapet" analysis (customer-fit
// score factors, buying signals, recommended entry point). Free-tier
// friendly and fast enough for a batch scan run. docs/04-data-sources.md.
const HOST = 'generativelanguage.googleapis.com';
const GEMINI_MODEL = 'gemini-3.6-flash';
const URL = `https://${HOST}/v1beta/interactions`;

export interface LeadAnalysisInput {
  name: string;
  poststed: string | null;
  sector: string | null; // matched_label — the maritime segment this company was found under
  nace: string | null;
  employees: number | null;
  financials: { year: number; revenue: number | null; operatingResult: number | null; profit: number | null }[]; // newest first
  leadScore: number | null;
  band: 'low' | 'mid' | 'high' | null;
  news: { title: string; date: string | null; domain: string; summary?: string; category?: string }[];
  contacts: { role: string; name: string }[]; // whichever of ceo/contact/cto/sales are filled in
}

export type ScoreVerdict = 'positiv' | 'negativ' | 'nøytral' | 'ukjent';
export type SignalLevel = 'høy' | 'middels' | 'lav';

export interface LeadAnalysis {
  conclusion: string;
  scoreFactors: { factor: string; verdict: ScoreVerdict; note: string }[];
  buyingSignal: {
    level: SignalLevel;
    signals: { text: string; source: string }[];
    explanation: string;
  };
  recommendedContact: { name: string | null; reason: string };
  pitch: string;
  icebreaker: string | null;
  questions: string[];
  avoidClaiming: string[];
  /** Segment-level challenges (general industry knowledge, not facts about
   *  this company). Absent on analyses made before it was added. */
  industryChallenges?: { challenge: string; relevance: string }[];
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    conclusion: { type: 'string' },
    scoreFactors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          factor: { type: 'string' },
          verdict: { type: 'string', enum: ['positiv', 'negativ', 'nøytral', 'ukjent'] },
          note: { type: 'string' },
        },
        required: ['factor', 'verdict', 'note'],
      },
    },
    buyingSignal: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['høy', 'middels', 'lav'] },
        signals: {
          type: 'array',
          items: {
            type: 'object',
            properties: { text: { type: 'string' }, source: { type: 'string' } },
            required: ['text', 'source'],
          },
        },
        explanation: { type: 'string' },
      },
      required: ['level', 'signals', 'explanation'],
    },
    recommendedContact: {
      type: 'object',
      properties: { name: { type: ['string', 'null'] }, reason: { type: 'string' } },
      required: ['name', 'reason'],
    },
    pitch: { type: 'string' },
    icebreaker: { type: ['string', 'null'] },
    questions: { type: 'array', items: { type: 'string' } },
    avoidClaiming: { type: 'array', items: { type: 'string' } },
    industryChallenges: {
      type: 'array',
      items: {
        type: 'object',
        properties: { challenge: { type: 'string' }, relevance: { type: 'string' } },
        required: ['challenge', 'relevance'],
      },
    },
  },
  required: [
    'conclusion',
    'scoreFactors',
    'buyingSignal',
    'recommendedContact',
    'pitch',
    'icebreaker',
    'questions',
    'avoidClaiming',
    'industryChallenges',
  ],
} as const;

function isValidAnalysis(v: unknown): v is LeadAnalysis {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  if (typeof a.conclusion !== 'string' || !Array.isArray(a.scoreFactors)) return false;
  if (!a.buyingSignal || typeof a.buyingSignal !== 'object') return false;
  if (!a.recommendedContact || typeof a.recommendedContact !== 'object') return false;
  if (typeof a.pitch !== 'string' || !Array.isArray(a.questions) || !Array.isArray(a.avoidClaiming)) return false;
  return true;
}

function fmtMNOK(v: number | null): string {
  if (v == null) return 'ukjent';
  return `${(v / 1_000_000).toFixed(1).replace('.', ',')} MNOK`;
}

function buildPrompt(input: LeadAnalysisInput): string {
  const finLines = input.financials
    .slice(0, 5)
    .map((f) => `  ${f.year}: omsetning ${fmtMNOK(f.revenue)}, driftsresultat ${fmtMNOK(f.operatingResult)}, årsresultat ${fmtMNOK(f.profit)}`)
    .join('\n');
  const newsLines = input.news
    .slice(0, 5)
    .map(
      (n) =>
        `  "${n.title}" (${n.domain}${n.date ? `, ${n.date.slice(0, 10)}` : ''}${n.category ? `, ${n.category}` : ''})` +
        (n.summary ? ` — ${n.summary}` : ''),
    )
    .join('\n');
  const contactLines = input.contacts.map((c) => `  ${c.role}: ${c.name}`).join('\n');

  const facts = [
    `Navn: ${input.name}`,
    input.poststed ? `Sted: ${input.poststed}` : null,
    input.sector ? `Maritimt segment: ${input.sector}` : null,
    input.nace ? `Bransjekode (NACE): ${input.nace}` : null,
    `Ansatte (siste registrerte tall): ${input.employees ?? 'ukjent'}`,
    input.leadScore != null ? `Beregnet lead-score (størrelse/omsetning/vekst/lønnsomhet): ${input.leadScore}/100 (${input.band})` : null,
    finLines ? `Regnskapstall per år (nyeste først):\n${finLines}` : 'Regnskapstall: ingen registrert.',
    contactLines ? `Registrerte kontaktpersoner:\n${contactLines}` : 'Registrerte kontaktpersoner: ingen.',
    newsLines ? `Nyheter siste 12 måneder (nettsøk):\n${newsLines}` : 'Nyheter: ingen funnet i nettsøk.',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    'Du hjelper en Experis-selger vurdere om denne maritime bedriften i Bergen-regionen er et aktuelt salgsprospekt, ' +
    'basert UTELUKKENDE på faktaene under (offentlige registre + nyhetstreff). Experis leverer IT-/teknologikonsulenter ' +
    'og bemanning.\n\n' +
    'REGLER (svært viktig):\n' +
    '- Ikke finn på fakta som ikke står i listen under. Har du ikke dokumentasjon for noe (f.eks. IT-miljø, digitale ' +
    'produkt, bruk av konsulenter, rekrutteringsaktivitet, ledelsesendringer, risiko for at de er konkurrent/leverandør), ' +
    'sett verdict "ukjent" og skriv i notatet at det ikke er dokumentert i tilgjengelige kilder — ikke gjett.\n' +
    '- "buyingSignal.signals" skal KUN inneholde signaler som faktisk følger av regnskapstall eller nyhetstreffene over ' +
    '(f.eks. omsetningsvekst, eller en nyhetssak). Finnes ingen slike, sett level "lav" og tom signals-liste.\n' +
    '- "recommendedContact" skal bruke en av de registrerte kontaktpersonene hvis noen finnes; hvis ingen finnes, sett ' +
    'name til null og forklar i reason hvem man bør prøve å identifisere (f.eks. daglig leder eller IT-ansvarlig).\n' +
    '- "avoidClaiming" skal liste 2-4 konkrete ting selgeren IKKE bør påstå som fakta uten å få det bekreftet av kunden ' +
    '(f.eks. antatt teknologibruk, antatte behov).\n' +
    '- "industryChallenges" er et UNNTAK fra regelen om bare å bruke faktaene over: list 2-4 kjente utfordringer som ' +
    'selskapets maritime segment/bransje generelt står overfor i dag (f.eks. regulering som EU ETS, FuelEU Maritime og ' +
    'IMOs klimakrav, utslippsrapportering, cybersikkerhet, mangel på fagfolk, digitalisering av drift og flåtestyring). ' +
    'Dette er generell bransjekunnskap — skriv det som bransjeutfordringer, ALDRI som påstander om at akkurat dette ' +
    'selskapet har problemet. "relevance" er én setning om hvorfor utfordringen kan åpne for en samtale om IT-/' +
    'teknologikonsulenter eller bemanning.\n' +
    '- Skriv kort og konkret, norsk bokmål. "conclusion" er maks 2 setninger. "pitch" er maks 3 setninger. ' +
    '"questions" er 2-5 konkrete spørsmål en selger kan stille.\n\n' +
    facts
  );
}


// One Gemini Interactions call → the model's output text. Throws (rather
// than returning null) on HTTP errors, timeouts and empty output, so the
// orchestrator turns them into a scan error with the actual reason — a 429
// or a timeout used to be indistinguishable from "the model had no answer".
// The fetch timeout is deliberately generous: the orchestrator's own
// timeout (clipped to the scan's remaining budget in lib/scan.ts) is what
// actually bounds a call.
async function geminiText(apiKey: string, payload: Record<string, unknown>): Promise<string> {
  const res = await safeFetchResult(URL, {
    allowHosts: [HOST],
    method: 'POST',
    timeoutMs: 55_000,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({ model: GEMINI_MODEL, ...payload }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.reason}`);

  let data: { status?: string; steps?: { type: string; content?: { text?: string }[] }[] };
  try {
    data = JSON.parse(res.text);
  } catch {
    throw new Error('Gemini: svaret var ikke gyldig JSON');
  }
  const outputStep = data.steps?.find((step) => step.type === 'model_output');
  const text = outputStep?.content?.map((block) => block.text ?? '').join('').trim();
  if (!text) {
    const kinds = (data.steps ?? []).map((st) => st.type).join(', ') || 'ingen steg';
    throw new Error(`Gemini: tomt svar (status ${data.status ?? 'ukjent'}; ${kinds})`);
  }
  return text;
}

function parseJsonOutput(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Gemini: modellsvaret var ikke gyldig JSON');
  }
}

async function requestAnalysis(input: LeadAnalysisInput): Promise<LeadAnalysis | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const parsed = parseJsonOutput(
    await geminiText(apiKey, {
      input: [{ type: 'text', text: buildPrompt(input) }],
      response_format: { type: 'text', mime_type: 'application/json', schema: ANALYSIS_SCHEMA },
    }),
  );
  if (!isValidAnalysis(parsed)) throw new Error('Gemini: vurderingen manglet påkrevde felt');
  return parsed;
}

export interface FindWebsiteInput {
  name: string;
  orgnr: string;
  poststed: string | null;
}

// Uses Gemini's google_search grounding tool — a real web search, not a
// guess — to find a company's official site when Brønnøysund has none.
// Billed per search query Google executes (unlike the free-tier ai.analyze
// call above), so callers must only invoke this once per company ever
// (lib/scan.ts checks website_search_attempted_at before calling it).
async function requestWebsite(input: FindWebsiteInput): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt =
    `Finn den offisielle nettsiden til det norske selskapet "${input.name}" (org.nr ${input.orgnr})` +
    `${input.poststed ? `, med forretningsadresse i ${input.poststed}` : ''}. ` +
    'Bruk søk til å bekrefte at du finner riktig selskaps EGEN offisielle nettside — ikke en oppføring hos ' +
    'proff.no, 1881.no, LinkedIn, Facebook eller en lignende katalog-/tredjepartstjeneste. ' +
    'Svar KUN med selve URL-en (f.eks. https://firma.no) uten noen annen tekst eller forklaring. ' +
    'Hvis du ikke finner en offisiell nettside med rimelig sikkerhet, svar nøyaktig ordet UKJENT.';

  const text = await geminiText(apiKey, {
    input: [{ type: 'text', text: prompt }],
    tools: [{ type: 'google_search' }],
  });
  if (text.toUpperCase().includes('UKJENT')) return null;
  return cleanWebsite(text);
}

// --- News about the company (Google Search-grounded) ----------------------
// Billed per search query like findWebsite, but refreshed only every ~30 days
// per company (lib/scan.ts). Structured output isn't combined with the search
// tool here, so the model is asked for a bare JSON array and
// lib/companyNews.ts#parseNewsAnswer validates it.

export interface FindNewsInput {
  name: string;
  orgnr: string;
  poststed: string | null;
  website: string | null;
  parentName?: string | null; // konsern — news is often about the group
}

// The model can return a dead or invented link, or a short-lived Google
// redirect. Follow each one: keep the final URL when it loads, drop it on
// 404/410/DNS failure, keep the original on bot walls (401/403/429/5xx) and
// timeouts — news sites often block non-browsers, which says nothing about
// whether the article exists.
async function verifyNewsLink(item: FoundNews): Promise<FoundNews | null> {
  const res = await safeFetchResult(item.url, { timeoutMs: 6_000, maxBytes: 4 * 1024 * 1024 });
  if (res.ok) return { ...item, url: res.finalUrl };
  if (res.status === 404 || res.status === 410) return null;
  if (res.status != null || /tidsavbrudd|svar over/.test(res.reason)) return item;
  return null; // DNS failure, blocked address, malformed URL
}

async function requestNews(input: FindNewsInput): Promise<FoundNews[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  let domain: string | null = null;
  try {
    domain = input.website ? new globalThis.URL(input.website).hostname.replace(/^www\./, '') : null;
  } catch {
    domain = null;
  }
  // The press writes "Beerenberg", not "BEERENBERG SERVICES AS" — give the
  // model the everyday name (and the group's) to search with.
  const shortName = linkedinCompanyName(input.name);
  const parent = input.parentName ? linkedinCompanyName(input.parentName) : null;
  const prompt =
    `Finn nyhetsartikler fra de siste 12 månedene om det norske selskapet "${input.name}" (org.nr ${input.orgnr}` +
    `${input.poststed ? `, ${input.poststed}` : ''}${domain ? `, nettside ${domain}` : ''}). ` +
    `Søk på navnet slik pressen skriver det, f.eks. "${shortName}"` +
    `${parent && parent !== shortName ? ` og konsernet "${parent}"` : ''}, og gjerne sammen med ord som rederi, kontrakt eller skip. ` +
    'Bruk søk. Se etter f.eks. kontrakter, oppkjøp, investeringer, nye fartøy, ansettelser, ledelsesendringer og resultater.\n\n' +
    'REGLER (svært viktig):\n' +
    '- Ta KUN med artikler som tydelig handler om akkurat dette selskapet (eller konsernet det er en del av), ' +
    'ikke andre selskaper med lignende navn.\n' +
    '- Ikke ta med katalog- og registersider (proff.no, purehelp, 1881, LinkedIn, Facebook, brreg).\n' +
    '- Bruk den faktiske URL-en til artikkelen. Ikke finn på lenker, titler eller datoer.\n' +
    '- Svar KUN med en JSON-liste (maks 5, nyeste først), uten annen tekst: ' +
    '[{"title": "...", "url": "https://...", "source": "navn på nettstedet", "date": "YYYY-MM-DD eller null", ' +
    `"summary": "én setning på norsk", "category": "${NEWS_CATEGORIES.join('|')}"}]\n` +
    '- Finner du ingen relevante artikler, svar nøyaktig [].';

  const text = await geminiText(apiKey, {
    input: [{ type: 'text', text: prompt }],
    tools: [{ type: 'google_search' }],
  });
  // No list at all (prose, a refusal) is an error worth seeing in the scan
  // log — it used to be indistinguishable from "no news found".
  if (!findJsonArray(text)) {
    throw new Error(`Nyhetssøk: fant ingen JSON-liste i svaret («${text.replace(/\s+/g, ' ').slice(0, 120)}»)`);
  }
  const items = parseNewsAnswer(text);
  const verified = await Promise.all(items.map(verifyNewsLink));
  return verified.filter((n): n is FoundNews => n != null);
}

// --- Contact extraction from a company's own website ----------------------
// Brønnøysund only ever exposes the statutory daglig leder — a "Kontakter"
// section that's otherwise limited to admin-typed fields is thin for a
// maritime company whose own "about us" page lists a dozen named crew/
// technical/sales contacts with direct emails. This reads the site itself
// (not a paid search — we already know the URL from ai.findWebsite) and asks
// Gemini to turn the page text into structured contacts. Runs every
// enrichment cycle (like ai.analyze), not once-per-company like findWebsite,
// since staff listed on a team page turn over.

export interface ExtractedContact {
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
}

const CONTACTS_SCHEMA = {
  type: 'object',
  properties: {
    contacts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: ['string', 'null'] },
          email: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'] },
        },
        required: ['name', 'role', 'email', 'phone'],
      },
    },
  },
  required: ['contacts'],
} as const;

function isValidContacts(v: unknown): v is { contacts: ExtractedContact[] } {
  if (!v || typeof v !== 'object') return false;
  return Array.isArray((v as { contacts?: unknown }).contacts);
}

// Deliberately no `allowHosts` — this is an arbitrary company's own domain,
// exactly the case safeFetchText's SSRF guard (private-IP/DNS check) exists
// for, unlike the calls above to our own trusted Gemini host.
async function fetchPageText(url: string): Promise<string | null> {
  return safeFetchText(url, { timeoutMs: 6_000, revalidate: 21_600, headers: { Accept: 'text/html' } });
}

// Homepage first (its links pick the subpages), then up to four subpages in
// parallel — best-matching menu links, topped up with common paths like
// /kontakt and /om-oss. Reading just one subpage missed most team pages.
// Each fetch is capped at 6s and runs inside the scan's shared budget.
async function requestContacts(name: string, website: string): Promise<ExtractedContact[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  const homepageHtml = await fetchPageText(website);
  if (!homepageHtml) return [];

  const subpageUrls = contactPageCandidates(homepageHtml, website, 4);
  const subpageHtmls = await Promise.all(subpageUrls.map((url) => fetchPageText(url)));
  const pages = [{ url: website, html: homepageHtml }];
  subpageUrls.forEach((url, i) => {
    const html = subpageHtmls[i];
    if (html) pages.push({ url, html });
  });

  const combinedText = pages
    .map((p) => `--- ${p.url} ---\n${stripHtml(p.html).slice(0, 8_000)}`)
    .join('\n\n')
    .slice(0, 32_000);
  if (!combinedText.trim()) return [];

  const prompt =
    `Du leser tekst hentet fra det norske selskapet "${name}" sin egen nettside, for å finne navngitte ` +
    'ansatte/kontaktpersoner og deres rolle, e-post og telefon.\n\n' +
    'REGLER (svært viktig):\n' +
    '- Ta KUN med personer som er eksplisitt navngitt på siden med et virkelig person-navn — ikke ' +
    'avdelinger, skjemaer eller "Kontakt oss"-bokser.\n' +
    '- Mangler e-post eller telefon for en person, sett feltet til null. Ikke gjett eller finn på noe.\n' +
    '- Ikke ta med generiske firma-adresser (post@, info@, sentralbord) som om de var en person.\n' +
    '- Finner du ingen navngitte personer i teksten, returner en tom liste.\n\n' +
    combinedText;

  const parsed = parseJsonOutput(
    await geminiText(apiKey, {
      input: [{ type: 'text', text: prompt }],
      response_format: { type: 'text', mime_type: 'application/json', schema: CONTACTS_SCHEMA },
    }),
  );
  if (!isValidContacts(parsed)) throw new Error('Gemini: kontaktlisten hadde feil format');
  return parsed.contacts.filter((ct) => ct.name?.trim()).slice(0, 20);
}

export const aiProvider: Provider = {
  id: 'ai',
  tools: ['analyze', 'findWebsite', 'findNews', 'extractContacts'],
  isEnabled: () => !!process.env.GEMINI_API_KEY,
  async call(tool, args) {
    if (tool === 'analyze') return requestAnalysis(args as unknown as LeadAnalysisInput);
    if (tool === 'findWebsite') return requestWebsite(args as unknown as FindWebsiteInput);
    if (tool === 'findNews') return requestNews(args as unknown as FindNewsInput);
    if (tool === 'extractContacts') {
      const { name, website } = args as { name: string; website: string };
      return requestContacts(name, website);
    }
    throw new Error(`ai: unknown tool ${tool}`);
  },
};
