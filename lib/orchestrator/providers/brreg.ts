import type { Provider } from '../types';
import { safeFetchText } from '../../http/safeFetch';
import {
  BRREG_ENHET_HOST,
  parseEnhetPage,
  parseRegnskap,
  type Company,
  type EnhetPage,
} from '../../brreg';
import type { CompanyFinancials } from '../../types';

// Brønnøysundregistrene — the official Norwegian company register. Free, no key,
// no ToS restriction on the open data. This is the same source proff.no builds
// on. docs/04-data-sources.md.
//
//   Enhetsregisteret:    company facts (name, NACE, employees, address, status)
//   Regnskapsregisteret: annual accounts (revenue, operating result, equity)

const ENHET_BASE = `https://${BRREG_ENHET_HOST}/enhetsregisteret/api/enheter`;
const REGNSKAP_BASE = `https://${BRREG_ENHET_HOST}/regnskapsregisteret/regnskap`;
const PAGE_SIZE = 100;
const MAX_PAGES = 15; // safety cap — a single kommune+NACE slice is well under this

async function getJson(url: string): Promise<unknown | null> {
  const body = await safeFetchText(url, {
    allowHosts: [BRREG_ENHET_HOST],
    timeoutMs: 12_000,
    revalidate: 3600,
    headers: { Accept: 'application/json' },
  });
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

// Every active company in `kommunenummer` whose NACE code starts with
// `naeringskode`, paging through the register.
async function searchEnheter(kommunenummer: string, naeringskode: string): Promise<Company[]> {
  const out: Company[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      `${ENHET_BASE}?kommunenummer=${encodeURIComponent(kommunenummer)}` +
      `&naeringskode=${encodeURIComponent(naeringskode)}` +
      `&registrertIForetaksregisteret=true&size=${PAGE_SIZE}&page=${page}`;
    const json = await getJson(url);
    if (!json) break;
    const parsed: EnhetPage = parseEnhetPage(json);
    out.push(...parsed.companies);
    if (page >= parsed.totalPages - 1) break;
  }
  return out;
}

async function getEnhet(orgnr: string): Promise<Company | null> {
  const json = await getJson(`${ENHET_BASE}/${encodeURIComponent(orgnr)}`);
  if (!json) return null;
  // A single enhet is returned unwrapped, not under _embedded.
  const parsed = parseEnhetPage({ _embedded: { enheter: [json] } });
  return parsed.companies[0] ?? null;
}

async function getRegnskap(orgnr: string): Promise<CompanyFinancials[]> {
  const json = await getJson(`${REGNSKAP_BASE}/${encodeURIComponent(orgnr)}`);
  if (!json) return [];
  return parseRegnskap(json);
}

export const brregProvider: Provider = {
  id: 'brreg',
  tools: ['searchEnheter', 'getEnhet', 'getRegnskap'],
  isEnabled: () => true,
  async call(tool, args) {
    if (tool === 'searchEnheter') {
      const { kommunenummer, naeringskode } = args as { kommunenummer: string; naeringskode: string };
      return searchEnheter(kommunenummer, naeringskode);
    }
    if (tool === 'getEnhet') {
      return getEnhet(String((args as { orgnr: string }).orgnr));
    }
    if (tool === 'getRegnskap') {
      return getRegnskap(String((args as { orgnr: string }).orgnr));
    }
    throw new Error(`brreg: unknown tool ${tool}`);
  },
};
