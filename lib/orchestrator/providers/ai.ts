import type { Provider } from '../types';
import { recordAiUsage } from '../../aiUsage';
import { safeFetchText, safeFetchResult } from '../../http/safeFetch';
import { cleanWebsite } from '../../brreg';
import { stripHtml, contactPageCandidates, deeperContactPages } from '../../website';
import { parseNewsAnswer, findJsonArray, NEWS_CATEGORIES, type FoundNews } from '../../companyNews';
import { linkedinCompanyName } from '../../brreg';
import { claudeText, claudeModel } from './claude';

// Gemini Flash builds the structured "Om selskapet" analysis (customer-fit
// score factors, buying signals, recommended entry point). Free-tier
// friendly and fast enough for a batch scan run. docs/04-data-sources.md.
const HOST = 'generativelanguage.googleapis.com';
const GEMINI_MODEL = 'gemini-3.6-flash';
// Flash-Lite, the cheapest model (~1/7 Flash's token price), for all four
// tasks; Flash is only the fallback when Lite refuses search grounding.
// GEMINI_LITE_MODEL overrides.
const geminiLiteModel = () => process.env.GEMINI_LITE_MODEL?.trim() || 'gemini-3.5-flash-lite';
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
  jobAds?: { title: string; occupation: string | null; published: string | null; isTech: boolean }[]; // active NAV ads
  technologies?: string[]; // named on the company's own website (documented)
  itEnvironment?: string | null; // 'ja' | 'nei' | 'ukjent', from the website
  digitalProducts?: string | null;
  /** Known challenges for the company's segment (lib/industryChallenges.ts). */
  industryKnown?: { challenge: string; angle: string }[];
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
  industryChallenges?: { challenge: string; relevance: string; details?: string }[];
  /** Customer relevance class (spec §4) and why. Absent on older analyses. */
  customerCategory?: CustomerCategory;
  categoryReason?: string;
}

export const CUSTOMER_CATEGORIES = [
  'svært aktuell',
  'aktuell',
  'mulig',
  'lite aktuell',
  'ikke aktuell',
  'konkurrent',
] as const;
export type CustomerCategory = (typeof CUSTOMER_CATEGORIES)[number];

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
    // Before pitch: the model writes fields in schema order, and the pitch
    // should build on the challenges.
    industryChallenges: {
      type: 'array',
      items: {
        type: 'object',
        properties: { challenge: { type: 'string' }, relevance: { type: 'string' }, details: { type: 'string' } },
        required: ['challenge', 'relevance', 'details'],
      },
    },
    pitch: { type: 'string' },
    icebreaker: { type: ['string', 'null'] },
    questions: { type: 'array', items: { type: 'string' } },
    avoidClaiming: { type: 'array', items: { type: 'string' } },
    customerCategory: { type: 'string', enum: [...CUSTOMER_CATEGORIES] },
    categoryReason: { type: 'string' },
  },
  required: [
    'conclusion',
    'scoreFactors',
    'buyingSignal',
    'recommendedContact',
    'industryChallenges',
    'pitch',
    'icebreaker',
    'questions',
    'avoidClaiming',
    'customerCategory',
    'categoryReason',
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
  const jobLines = (input.jobAds ?? [])
    .map((j) => `  "${j.title}"${j.occupation ? ` (${j.occupation})` : ''}${j.published ? `, publisert ${j.published}` : ''}${j.isTech ? ' [IT/teknologi]' : ''}`)
    .join('\n');

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
    jobLines
      ? `Aktive stillingsannonser (NAV):\n${jobLines}`
      : 'Stillingsannonser: ingen aktive funnet hos NAV.',
    input.technologies?.length
      ? `Teknologi/systemer nevnt på egen nettside: ${input.technologies.join(', ')}`
      : 'Teknologi: ingen nevnt på nettsiden (eller ikke lest ennå).',
    `Eget IT-miljø ifølge nettsiden: ${input.itEnvironment ?? 'ukjent'}. Egne digitale produkter: ${input.digitalProducts ?? 'ukjent'}.`,
    input.industryKnown?.length
      ? `Kjente utfordringer i bransjen (generell kunnskap — velg de mest relevante for "industryChallenges"):\n${input.industryKnown
          .map((c) => `  - ${c.challenge} (IT/bemanning: ${c.angle})`)
          .join('\n')}`
      : null,
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
    '- "buyingSignal.signals" skal KUN inneholde signaler som faktisk følger av regnskapstall, nyhetstreffene eller ' +
    'stillingsannonsene over. Rekruttering innen IT/teknologi er et sterkt signal (behov for kompetanse/kapasitet), men ' +
    'en annonse betyr ikke automatisk at de vil kjøpe konsulenter — si det slik. Eksempler: omsetningsvekst, en ' +
    'nyhetssak eller en IT-stilling. Finnes ingen slike, sett level "lav" og tom signals-liste.\n' +
    '- "recommendedContact" skal bruke en av de registrerte kontaktpersonene hvis noen finnes; hvis ingen finnes, sett ' +
    'name til null og forklar i reason hvem man bør prøve å identifisere (f.eks. daglig leder eller IT-ansvarlig).\n' +
    '- "avoidClaiming" skal liste 2-4 konkrete ting selgeren IKKE bør påstå som fakta uten å få det bekreftet av kunden ' +
    '(f.eks. antatt teknologibruk, antatte behov).\n' +
    '- "industryChallenges" er et UNNTAK fra regelen om bare å bruke faktaene over: list 2-4 utfordringer som ' +
    'akkurat dette selskapets bransje står overfor i dag. Står det "Kjente utfordringer i bransjen" under, VELG de ' +
    '2-4 som passer best for dette selskapet (ut fra segment, størrelse, regnskap og nyheter) og skriv dem konkret ' +
    'for denne bransjen — f.eks. lakselus og fiskehelse for oppdrett, kvoter for fiske, EU ETS for rederier. Ikke ' +
    'bruk generelle utfordringer som "cybersikkerhet", "mangel på fagfolk" eller "digitalisering" alene; de er bare ' +
    'med når de står i listen og er knyttet til noe bransjespesifikt. Dette er bransjekunnskap — skriv det som ' +
    'bransjeutfordringer, ALDRI som påstander om at akkurat dette selskapet har problemet. "relevance" er én setning ' +
    'om hvordan IT-/teknologikonsulenter eller bemanning konkret kan hjelpe med utfordringen (bruk vinklingen i ' +
    'listen som utgangspunkt). Hver "challenge" skal være SPISS: maks ca. 12 ord, og nevne noe konkret og ' +
    'gjenkjennelig for bransjen — et regelverk, en frist, et tall eller et konkret driftsproblem (f.eks. «EU ETS: ' +
    'kvoter for 100 % av utslippene fra 2026», «Lakselus — behandlingskostnader og dødelighet»). Unngå vage ' +
    'formuleringer som «kompleksitet knyttet til», «økte krav til», «mangel på fagfolk», «digitalisering». ' +
    '"details" er en utdyping på 4-6 setninger som vises når selgeren klikker på ' +
    'utfordringen: hva utfordringen går ut på i praksis, hvorfor den er aktuell nå (regelverk, frister, ' +
    'markedsutvikling), hvilke konkrete oppgaver eller roller IT-/teknologikonsulenter eller bemanning typisk løser, ' +
    'og ett godt oppfølgingsspørsmål selgeren kan stille. Fortsatt bransjekunnskap, ikke påstander om selskapet.\n' +
    '- "pitch" skal kobles til akkurat dette selskapet: nevn minst ett konkret faktum fra listen over (f.eks. antall ' +
    'ansatte, omsetningsvekst eller -fall, en nyhetssak, en stillingsannonse, en teknologi fra nettsiden) og knytt det ' +
    'til den mest relevante av "industryChallenges". Formuler det som et spørsmål eller en hypotese, ALDRI som en ' +
    'påstand om at selskapet har problemet. Eksempel: «Med 120 ansatte og 30 % vekst i fjor blir rapporteringen ' +
    'til EU ETS fort en jobb for flere — hvem tar den hos dere?»\n' +
    '- "questions": minst to av spørsmålene skal vise til noe konkret om selskapet eller den spesifikke ' +
    'bransjeutfordringen (ikke generelt om "IT" eller "digitalisering"). Høyst ett spørsmål om innleie/konsulenter.\n' +
    '- FORBUDTE standardfraser (de går igjen på alle selskaper og sier ingenting): «Mange innen …», «kapasitets- og ' +
    'kompetanseutfordringer», «økte digitaliseringsbehov», «spisskompetanse på teknologi», «Bruker dere eksterne ' +
    'konsulenter i dag», «hvordan løser dere dette internt». Skriv heller noe som bare passer dette selskapet.\n' +
    '- "customerCategory" klassifiserer selskapet som kunde for Experis: "svært aktuell", "aktuell", "mulig" (krever ' +
    'mer undersøkelse), "lite aktuell", "ikke aktuell" eller "konkurrent". Bruk "konkurrent" når selskapet selv ' +
    'primært selger IT-konsulenter, bemanning eller rekruttering — da er det et mulig konkurrent/leverandør, ikke en ' +
    'kunde. Programvare-/SaaS-selskaper skal IKKE sorteres bort: de kan være gode kunder hvis de har eget ' +
    'utviklingsmiljø. Ikke press alt inn som salgsmulighet: mangler grunnlaget, velg "mulig" eller lavere. ' +
    '"categoryReason" er én setning med både det som trekker opp og det som trekker ned.\n' +
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
// Paid key blocked (spend cap / quota)? Then the lead analysis (public
// register data only, no search) may retry on GEMINI_API_KEY_FREE — a separate AI Studio
// project without billing. Never used for extractContacts: on the free tier
// Google may use inputs to improve its models, and website pages contain
// people's names and e-mails (GDPR). Not for findWebsite/findNews either:
// the free tier has no google_search quota (HTTP 429). Once the paid key has been rejected,
// it's skipped for 15 minutes rather than wasting a round trip per call.
const PAID_BLOCKED_FOR_MS = 15 * 60_000;
let paidBlockedUntil = 0;
// 429 = rate limit / quota; 402 = prepaid credits used up (spend cap).
const isQuotaError = (msg: string) => /(429|402)|RESOURCE_EXHAUSTED|quota|spend|credits/i.test(msg);

async function geminiText(
  apiKey: string,
  payload: Record<string, unknown>,
  opts: { freePayload?: Record<string, unknown> } = {},
): Promise<string> {
  // The free-tier variant of the request (e.g. without people's names), or
  // none → no fallback for this call.
  const freeKey = opts.freePayload ? process.env.GEMINI_API_KEY_FREE : undefined;
  const freeCall = () => geminiTextOnce(freeKey!, opts.freePayload!);
  if (freeKey && Date.now() < paidBlockedUntil) return freeCall();
  try {
    return await geminiTextOnce(apiKey, payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!freeKey || !isQuotaError(msg)) throw e;
    paidBlockedUntil = Date.now() + PAID_BLOCKED_FOR_MS;
    return freeCall();
  }
}

async function geminiTextOnce(apiKey: string, payload: Record<string, unknown>): Promise<string> {
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

  let data: {
    status?: string;
    steps?: { type: string; content?: { text?: string }[] }[];
    usage?: Record<string, number>;
    usageMetadata?: Record<string, number>;
  };
  try {
    data = JSON.parse(res.text);
  } catch {
    throw new Error('Gemini: svaret var ikke gyldig JSON');
  }
  // Field names differ between Gemini endpoints — take whichever is there.
  const u = data.usage ?? data.usageMetadata;
  if (u) {
    recordAiUsage(
      String(payload.model ?? GEMINI_MODEL),
      u.total_input_tokens ?? u.input_tokens ?? u.promptTokenCount ?? 0,
      (u.total_output_tokens ?? u.output_tokens ?? u.candidatesTokenCount ?? 0) + (u.total_thought_tokens ?? u.thoughtsTokenCount ?? 0),
    );
  }
  const outputStep = data.steps?.find((step) => step.type === 'model_output');
  const text = outputStep?.content?.map((block) => block.text ?? '').join('').trim();
  if (!text) {
    const kinds = (data.steps ?? []).map((st) => st.type).join(', ') || 'ingen steg';
    throw new Error(`Gemini: tomt svar (status ${data.status ?? 'ukjent'}; ${kinds})`);
  }
  return text;
}

// --- Backend choice --------------------------------------------------------
// Claude when ANTHROPIC_API_KEY is set (AI_BACKEND=gemini forces Gemini),
// otherwise Gemini. Every request below goes through aiText, so the four
// tools work the same on either.
const claudeSelected = () => !!process.env.ANTHROPIC_API_KEY && process.env.AI_BACKEND !== 'gemini';
export const aiConfigured = () => !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY);
/** Human label for the admin UI, e.g. "Claude Haiku" or "Gemini". */
export const aiServiceLabel = () => (claudeSelected() ? 'Claude Haiku' : 'Gemini');

export interface AiStepSetup {
  step: string; // "AI-vurdering"
  api: string; // "Gemini Interactions API (Google)"
  model: string; // "gemini-3.5-flash-lite"
  cost: string; // plain words
}

/**
 * What an AI run will call, step by step — stored on each scan so the admin
 * can see afterwards which API and model were tried. Mirrors aiText's routing.
 */
export function aiSetup(): AiStepSetup[] {
  if (claudeSelected()) {
    const model = claudeModel();
    const api = 'Anthropic Messages API';
    return [
      { step: 'AI-vurdering', api, model, cost: 'betalt per token' },
      { step: 'Kontakter fra nettside', api: `nettsiden + ${api}`, model, cost: 'betalt per token' },
      { step: 'Nyhetssøk (score 40+)', api: `${api} + websøk`, model, cost: 'betalt per søk + token' },
      { step: 'Nettsidesøk (score 40+, ukjent nettside)', api: `${api} + websøk`, model, cost: 'betalt per søk + token' },
    ];
  }
  const api = 'Gemini API (Google)';
  const reserve = process.env.GEMINI_API_KEY_FREE ? ' · gratisnøkkel som reserve' : '';
  return [
    { step: 'AI-vurdering', api, model: geminiLiteModel(), cost: `betalt per token${reserve}` },
    { step: 'Kontakter fra nettside', api: `nettsiden + ${api}`, model: geminiLiteModel(), cost: 'betalt per token' },
    { step: 'Nyhetssøk (score 40+)', api: `${api} + Google-søk`, model: geminiLiteModel(), cost: 'token + søk (5 000 gratis/mnd)' },
    {
      step: 'Nettsidesøk (score 40+, ukjent nettside)',
      api: `${api} + Google-søk`,
      model: geminiLiteModel(),
      cost: 'token + søk (5 000 gratis/mnd)',
    },
  ];
}

async function aiText(task: {
  prompt: string;
  schema?: object; // structured JSON answer
  search?: boolean; // web search
  freePrompt?: string; // Gemini only: variant allowed on GEMINI_API_KEY_FREE
}): Promise<string> {
  if (claudeSelected()) return claudeText(task.prompt, { schema: task.schema, search: task.search });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('AI er ikke konfigurert');
  // Everything on Flash-Lite, the cheapest model — searches included. Should
  // Google refuse search grounding on Lite (HTTP 400), that search retries
  // once on Flash.
  const payload = (prompt: string, model = geminiLiteModel()) => ({
    model,
    input: [{ type: 'text', text: prompt }],
    ...(task.schema ? { response_format: { type: 'text', mime_type: 'application/json', schema: task.schema } } : {}),
    ...(task.search ? { tools: [{ type: 'google_search' }] } : {}),
  });
  try {
    return await geminiText(apiKey, payload(task.prompt), task.freePrompt ? { freePayload: payload(task.freePrompt) } : {});
  } catch (e) {
    if (!task.search || !/HTTP 400/.test(e instanceof Error ? e.message : '')) throw e;
    return geminiText(apiKey, payload(task.prompt, GEMINI_MODEL));
  }
}

function parseJsonOutput(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('AI: modellsvaret var ikke gyldig JSON');
  }
}

async function requestAnalysis(input: LeadAnalysisInput): Promise<LeadAnalysis | null> {
  if (!aiConfigured()) return null;

  // Gemini's free tier: same analysis, but no people's names in the prompt
  // (GDPR — Google may use free-tier inputs). Company facts and news only.
  const parsed = parseJsonOutput(
    await aiText({
      prompt: buildPrompt(input),
      schema: ANALYSIS_SCHEMA,
      freePrompt: buildPrompt({ ...input, contacts: [] }),
    }),
  );
  if (!isValidAnalysis(parsed)) throw new Error('AI: vurderingen manglet påkrevde felt');
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
  if (!aiConfigured()) return null;

  const prompt =
    `Finn den offisielle nettsiden til det norske selskapet "${input.name}" (org.nr ${input.orgnr})` +
    `${input.poststed ? `, med forretningsadresse i ${input.poststed}` : ''}. ` +
    'Bruk søk til å bekrefte at du finner riktig selskaps EGEN offisielle nettside — ikke en oppføring hos ' +
    'proff.no, 1881.no, LinkedIn, Facebook eller en lignende katalog-/tredjepartstjeneste. ' +
    'Svar KUN med selve URL-en (f.eks. https://firma.no) uten noen annen tekst eller forklaring. ' +
    'Hvis du ikke finner en offisiell nettside med rimelig sikkerhet, svar nøyaktig ordet UKJENT.';

  const text = await aiText({ prompt, search: true });
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
  if (!aiConfigured()) return [];

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
    `"summary": "én setning på norsk", "category": "${NEWS_CATEGORIES.join('|')}", "relevance": "én setning: mulig betydning for Experis (IT-/teknologikonsulenter, bemanning)", "buyingSignal": true|false, "question": "ett spørsmål saken åpner for i en kundesamtale"}]\n` +
    '- "relevance", "buyingSignal" og "question" er DIN tolkning, ikke fakta fra artikkelen. "buyingSignal" er ' +
    'true bare når saken konkret kan gi behov for kompetanse eller kapasitet (ny kontrakt, vekst, nye fartøy, oppkjøp, ' +
    'digitalisering, lederskifte) — ikke for rutinenyheter.\n' +
    '- Finner du ingen relevante artikler, svar nøyaktig [].';

  const text = await aiText({ prompt, search: true });
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

export const TECH_CATEGORIES = [
  'programvare',
  'data og analyse',
  'AI',
  'sky og plattform',
  'cybersikkerhet',
  'integrasjoner',
  'ERP/CRM',
  'maritime systemer',
  'infrastruktur',
  'annet',
] as const;

const YES_NO = { type: 'object', properties: { value: { type: 'string', enum: ['ja', 'nei', 'ukjent'] }, evidence: { type: ['string', 'null'] } }, required: ['value', 'evidence'] };

const CONTACTS_SCHEMA = {
  type: 'object',
  properties: {
    technologies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string', enum: [...TECH_CATEGORIES] },
          evidence: { type: 'string' },
          sourceUrl: { type: 'string' },
        },
        required: ['name', 'category', 'evidence', 'sourceUrl'],
      },
    },
    itEnvironment: YES_NO,
    digitalProducts: YES_NO,
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
  required: ['contacts', 'technologies', 'itEnvironment', 'digitalProducts'],
} as const;

export interface WebsiteTech {
  name: string;
  category: string;
  evidence: string;
  sourceUrl: string;
}
export interface YesNo {
  value: 'ja' | 'nei' | 'ukjent';
  evidence: string | null;
}
export interface WebsiteInsights {
  contacts: ExtractedContact[];
  technologies: WebsiteTech[];
  itEnvironment: YesNo;
  digitalProducts: YesNo;
}

const UNKNOWN: YesNo = { value: 'ukjent', evidence: null };
const EMPTY_INSIGHTS: WebsiteInsights = { contacts: [], technologies: [], itEnvironment: UNKNOWN, digitalProducts: UNKNOWN };

// The model's evidence must actually be in the text we sent, and its source
// one of the pages we read — otherwise it's dropped. Spec §3: never claim a
// technology without a concrete source.
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
function verifiedYesNo(v: unknown, text: string): YesNo {
  const o = (v ?? {}) as { value?: string; evidence?: string | null };
  const value = o.value === 'ja' || o.value === 'nei' ? o.value : 'ukjent';
  const evidence = typeof o.evidence === 'string' && o.evidence.trim() ? o.evidence.trim().slice(0, 200) : null;
  if (value !== 'ukjent' && (!evidence || !text.includes(squash(evidence).slice(0, 60)))) return UNKNOWN;
  return { value, evidence: value === 'ukjent' ? null : evidence };
}

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
// /kontakt and /om-oss — then up to four pages one level deeper (office /
// department pages). Reading just one subpage missed most team pages.
// Each fetch is capped at 6s and runs inside the scan's shared budget.
async function requestContacts(name: string, website: string, contactPage: string | null = null): Promise<WebsiteInsights> {
  if (!aiConfigured()) return EMPTY_INSIGHTS;

  // An admin-set contact page is read first and always kept — the crawler's
  // own guesses fill in around it.
  const fetchAll = async (urls: string[]) =>
    (await Promise.all(urls.map(async (url) => ({ url, html: await fetchPageText(url) })))).filter(
      (p): p is { url: string; html: string } => !!p.html,
    );
  const pinned = contactPage ? await fetchAll([contactPage]) : [];

  const homepageHtml = await fetchPageText(website);
  if (!homepageHtml && pinned.length === 0) return EMPTY_INSIGHTS;

  const level1 = homepageHtml
    ? (await fetchAll(contactPageCandidates(homepageHtml, website, 4))).filter((p) => p.url !== contactPage)
    : [];
  // One level further: many sites keep the people on office/department pages
  // under a /contacts hub (wilsonship.no), which the homepage never links to.
  const visited = new Set([website, ...(contactPage ? [contactPage] : []), ...level1.map((p) => p.url)]);
  const level2 = await fetchAll(deeperContactPages([...pinned, ...level1], visited, 4));

  // Most specific pages first, so the text cap trims the homepage, not the
  // page that actually lists the people. The pinned page leads.
  const pages = [
    ...pinned,
    ...level2,
    ...level1,
    ...(homepageHtml ? [{ url: website, html: homepageHtml }] : []),
  ];
  const combinedText = pages
    // The pinned contact page gets more room: on framo.com/contact the
    // people start ~7,500 characters in, after a long menu.
    .map((p) => `--- ${p.url} ---\n${stripHtml(p.html).slice(0, p.url === contactPage ? 20_000 : 9_000)}`)
    .join('\n\n')
    .slice(0, 40_000);
  if (!combinedText.trim()) return EMPTY_INSIGHTS;

  const prompt =
    `Du leser tekst hentet fra det norske selskapet "${name}" sin egen nettside, for å finne navngitte ` +
    'ansatte/kontaktpersoner og deres rolle, e-post og telefon.\n\n' +
    'REGLER (svært viktig):\n' +
    '- Ta KUN med personer som er eksplisitt navngitt på siden med et virkelig person-navn — ikke ' +
    'avdelinger, skjemaer eller "Kontakt oss"-bokser.\n' +
    '- Mangler e-post eller telefon for en person, sett feltet til null. Ikke gjett eller finn på noe.\n' +
    '- Ikke ta med generiske firma-adresser (post@, info@, sentralbord) som om de var en person.\n' +
    '- Finner du ingen navngitte personer i teksten, returner en tom liste.\n' +
    '- "technologies": KUN teknologier, systemer, plattformer eller programvare som er EKSPLISITT nevnt i teksten ' +
    '(f.eks. navngitte systemer, sky-plattformer, ERP, flåtestyringssystemer). "evidence" er et ordrett sitat fra ' +
    'teksten (maks 120 tegn); "sourceUrl" er URL-en i "--- url ---"-linjen over avsnittet sitatet står i. Ikke gjett ' +
    'teknologi ut fra bransje. Ingenting nevnt: tom liste.\n' +
    '- "itEnvironment": "ja" bare hvis teksten viser egen IT-avdeling, IT-ansatte eller utviklere; "nei" bare hvis den ' +
    'sier at IT er satt bort; ellers "ukjent". "digitalProducts": "ja" bare hvis selskapet selv utvikler eller selger ' +
    'programvare/digitale tjenester. "evidence" er et ordrett sitat (null ved "ukjent").\n\n' +
    combinedText;

  // No freePrompt: page text has people's names, never sent to Gemini's free tier.
  const parsed = parseJsonOutput(await aiText({ prompt, schema: CONTACTS_SCHEMA }));
  if (!isValidContacts(parsed)) throw new Error('AI: kontaktlisten hadde feil format');
  return verifyWebsiteInsights(parsed, combinedText, pages.map((p) => p.url));
}

/**
 * Keeps only what the pages we read actually support: a technology needs its
 * name and quote to appear in the text and its source to be one of the pages;
 * an IT-environment / digital-products claim needs its quote in the text, or
 * it falls back to "ukjent". Exported for tests.
 */
export function verifyWebsiteInsights(parsed: { contacts: ExtractedContact[] }, combinedText: string, urls: string[]): WebsiteInsights {
  const text = squash(combinedText);
  const pageUrls = new Set(urls);
  const raw = parsed as unknown as { technologies?: unknown[]; itEnvironment?: unknown; digitalProducts?: unknown };
  const technologies: WebsiteTech[] = [];
  for (const t of (raw.technologies ?? []) as Record<string, unknown>[]) {
    const tech = {
      name: String(t.name ?? '').trim().slice(0, 60),
      category: (TECH_CATEGORIES as readonly string[]).includes(String(t.category)) ? String(t.category) : 'annet',
      evidence: String(t.evidence ?? '').trim().slice(0, 160),
      sourceUrl: String(t.sourceUrl ?? ''),
    };
    if (!tech.name || !pageUrls.has(tech.sourceUrl)) continue;
    if (!text.includes(squash(tech.evidence).slice(0, 60)) || !text.includes(tech.name.toLowerCase())) continue;
    if (!technologies.some((x) => x.name.toLowerCase() === tech.name.toLowerCase())) technologies.push(tech);
  }
  return {
    contacts: parsed.contacts.filter((ct) => ct.name?.trim()).slice(0, 30),
    technologies: technologies.slice(0, 20),
    itEnvironment: verifiedYesNo(raw.itEnvironment, text),
    digitalProducts: verifiedYesNo(raw.digitalProducts, text),
  };
}

export const aiProvider: Provider = {
  id: 'ai',
  tools: ['analyze', 'findWebsite', 'findNews', 'extractContacts'],
  isEnabled: aiConfigured,
  async call(tool, args) {
    if (tool === 'analyze') return requestAnalysis(args as unknown as LeadAnalysisInput);
    if (tool === 'findWebsite') return requestWebsite(args as unknown as FindWebsiteInput);
    if (tool === 'findNews') return requestNews(args as unknown as FindNewsInput);
    if (tool === 'extractContacts') {
      const { name, website, contactPage } = args as { name: string; website: string; contactPage?: string | null };
      return requestContacts(name, website, contactPage ?? null);
    }
    throw new Error(`ai: unknown tool ${tool}`);
  },
};
