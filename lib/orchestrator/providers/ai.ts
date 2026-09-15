import type { Provider } from '../types';
import { safeFetchText } from '../../http/safeFetch';

// Gemini Flash generates the "Hvorfor aktuell" sales summary on the company
// page. Free-tier friendly and fast — this is a short text blurb, not a task
// that needs Anthropic-grade reasoning. docs/04-data-sources.md.
const HOST = 'generativelanguage.googleapis.com';
const GEMINI_MODEL = 'gemini-3.6-flash';
const URL = `https://${HOST}/v1beta/interactions`;

export interface LeadSummaryInput {
  name: string;
  poststed: string | null;
  sector: string | null; // matched_label — the maritime segment this company was found under
  nace: string | null;
  employees: number | null;
  revenueLatest: number | null; // NOK
  revenueGrowthPct: number | null;
  operatingMarginPct: number | null;
  leadScore: number | null;
  band: 'low' | 'mid' | 'high' | null;
}

function fmtMNOK(v: number | null): string {
  if (v == null) return 'ukjent';
  return `${(v / 1_000_000).toFixed(1).replace('.', ',')} MNOK`;
}

function buildPrompt(input: LeadSummaryInput): string {
  const facts = [
    `Navn: ${input.name}`,
    input.poststed ? `Sted: ${input.poststed}` : null,
    input.sector ? `Maritimt segment: ${input.sector}` : null,
    input.nace ? `Bransjekode (NACE): ${input.nace}` : null,
    `Ansatte: ${input.employees ?? 'ukjent'}`,
    `Omsetning siste år: ${fmtMNOK(input.revenueLatest)}`,
    input.revenueGrowthPct != null ? `Omsetningsvekst å/å: ${input.revenueGrowthPct.toFixed(0)} %` : null,
    input.operatingMarginPct != null ? `Driftsmargin: ${input.operatingMarginPct.toFixed(0)} %` : null,
    input.leadScore != null ? `Lead-score: ${input.leadScore}/100 (${input.band})` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    'Du hjelper et salgsteam som selger til maritime bedrifter i Bergen-regionen. ' +
    'Skriv en kort vurdering (2-3 setninger, norsk bokmål, ingen overskrift eller punktliste) av HVORFOR dette ' +
    'selskapet kan være en aktuell salgsprospekt akkurat nå, basert på nøkkeltallene under. ' +
    'Vær konkret og saklig — ikke overdriv, og ikke finn på fakta som ikke står i listen. ' +
    'Hvis tallene er svake eller mangler, si det ærlig i stedet for å pynte på det.\n\n' +
    facts
  );
}

async function requestSummary(input: LeadSummaryInput): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

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
      input: [{ type: 'text', text: buildPrompt(input) }],
      response_format: { type: 'text', mime_type: 'text/plain' },
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
  const text = outputStep?.content?.map((block) => block.text ?? '').join('').trim();
  return text || null;
}

export const aiProvider: Provider = {
  id: 'ai',
  tools: ['leadSummary'],
  isEnabled: () => !!process.env.GEMINI_API_KEY,
  async call(tool, args) {
    if (tool !== 'leadSummary') throw new Error(`ai: unknown tool ${tool}`);
    return requestSummary(args as unknown as LeadSummaryInput);
  },
};
