import type { Provider } from '../types';
import { safeFetchText } from '../../http/safeFetch';
import { cleanWebsite } from '../../brreg';

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
  news: { title: string; date: string | null; domain: string }[];
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
    .map((n) => `  "${n.title}" (${n.domain}${n.date ? `, ${n.date.slice(0, 10)}` : ''})`)
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
    newsLines ? `Nylige nyhetstreff (GDELT):\n${newsLines}` : 'Nyhetstreff: ingen funnet.',
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
    '- Skriv kort og konkret, norsk bokmål. "conclusion" er maks 2 setninger. "pitch" er maks 3 setninger. ' +
    '"questions" er 2-5 konkrete spørsmål en selger kan stille.\n\n' +
    facts
  );
}

async function requestAnalysis(input: LeadAnalysisInput): Promise<LeadAnalysis | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const body = await safeFetchText(URL, {
    allowHosts: [HOST],
    method: 'POST',
    timeoutMs: 25_000,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input: [{ type: 'text', text: buildPrompt(input) }],
      response_format: { type: 'text', mime_type: 'application/json', schema: ANALYSIS_SCHEMA },
    }),
  });
  if (!body) return null;

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  const outputStep = (data as { steps?: { type: string; content?: { text?: string }[] }[] }).steps?.find(
    (step) => step.type === 'model_output',
  );
  const outputText = outputStep?.content?.map((block) => block.text ?? '').join('');
  if (!outputText) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    return null;
  }
  return isValidAnalysis(parsed) ? parsed : null;
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

  const body = await safeFetchText(URL, {
    allowHosts: [HOST],
    method: 'POST',
    timeoutMs: 20_000,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input: [{ type: 'text', text: prompt }],
      tools: [{ type: 'google_search' }],
    }),
  });
  if (!body) return null;

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  const outputStep = (data as { steps?: { type: string; content?: { text?: string }[] }[] }).steps?.find(
    (step) => step.type === 'model_output',
  );
  const text = outputStep?.content
    ?.map((block) => block.text ?? '')
    .join('')
    .trim();
  if (!text || text.toUpperCase().includes('UKJENT')) return null;
  return cleanWebsite(text);
}

export const aiProvider: Provider = {
  id: 'ai',
  tools: ['analyze', 'findWebsite'],
  isEnabled: () => !!process.env.GEMINI_API_KEY,
  async call(tool, args) {
    if (tool === 'analyze') return requestAnalysis(args as unknown as LeadAnalysisInput);
    if (tool === 'findWebsite') return requestWebsite(args as unknown as FindWebsiteInput);
    throw new Error(`ai: unknown tool ${tool}`);
  },
};
