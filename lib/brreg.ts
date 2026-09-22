// Pure helpers for the Brønnøysund open registers. No I/O here — the HTTP calls
// live in lib/orchestrator/providers/brreg.ts; this module just normalizes the
// JSON shapes so it can be unit-tested. Docs:
//   Enhetsregisteret:   https://data.brreg.no/enhetsregisteret/api/docs/index.html
//   Regnskapsregisteret: https://data.brreg.no/regnskapsregisteret/docs/index.html
import type { CompanyFinancials } from './types';

export const BRREG_ENHET_HOST = 'data.brreg.no';

// --- Enhetsregisteret ------------------------------------------------------

export interface RawEnhet {
  organisasjonsnummer: string;
  navn: string;
  organisasjonsform?: { kode?: string; beskrivelse?: string };
  naeringskode1?: { kode?: string; beskrivelse?: string };
  naeringskode2?: { kode?: string; beskrivelse?: string };
  naeringskode3?: { kode?: string; beskrivelse?: string };
  institusjonellSektorkode?: { kode?: string; beskrivelse?: string };
  antallAnsatte?: number;
  hjemmeside?: string;
  telefon?: string;
  mobil?: string;
  forretningsadresse?: {
    adresse?: string[];
    postnummer?: string;
    poststed?: string;
    kommune?: string;
    kommunenummer?: string;
  };
  registreringsdatoEnhetsregisteret?: string;
  stiftelsesdato?: string;
  sisteInnsendteAarsregnskap?: string;
  registrertIMvaregisteret?: boolean;
  konkurs?: boolean;
  underAvvikling?: boolean;
  underTvangsavviklingEllerTvangsopplosning?: boolean;
}

export interface Company {
  orgnr: string;
  name: string;
  orgForm: string | null;
  nace: { code: string; text: string }[];
  sectorCode: string | null;
  sectorText: string | null;
  employees: number | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  postnummer: string | null;
  poststed: string | null;
  kommune: string | null;
  kommunenummer: string | null;
  registeredAt: string | null;
  establishedAt: string | null;
  lastAnnualReport: string | null;
  inMva: boolean;
  bankrupt: boolean;
  underLiquidation: boolean;
}

function naceEntry(n?: { kode?: string; beskrivelse?: string }): { code: string; text: string } | null {
  if (!n?.kode) return null;
  return { code: n.kode, text: n.beskrivelse ?? '' };
}

export function normalizeEnhet(e: RawEnhet): Company {
  const addr = e.forretningsadresse;
  const nace = [naceEntry(e.naeringskode1), naceEntry(e.naeringskode2), naceEntry(e.naeringskode3)].filter(
    (x): x is { code: string; text: string } => x != null,
  );
  return {
    orgnr: e.organisasjonsnummer,
    name: e.navn,
    orgForm: e.organisasjonsform?.beskrivelse ?? e.organisasjonsform?.kode ?? null,
    nace,
    sectorCode: e.institusjonellSektorkode?.kode ?? null,
    sectorText: e.institusjonellSektorkode?.beskrivelse ?? null,
    employees: typeof e.antallAnsatte === 'number' ? e.antallAnsatte : null,
    website: cleanWebsite(e.hjemmeside),
    phone: e.telefon || e.mobil || null,
    address: addr?.adresse?.filter(Boolean).join(', ') || null,
    postnummer: addr?.postnummer ?? null,
    poststed: addr?.poststed ?? null,
    kommune: addr?.kommune ?? null,
    kommunenummer: addr?.kommunenummer ?? null,
    registeredAt: e.registreringsdatoEnhetsregisteret ?? null,
    establishedAt: e.stiftelsesdato ?? null,
    lastAnnualReport: e.sisteInnsendteAarsregnskap ?? null,
    inMva: !!e.registrertIMvaregisteret,
    bankrupt: !!e.konkurs,
    underLiquidation: !!(e.underAvvikling || e.underTvangsavviklingEllerTvangsopplosning),
  };
}

export function cleanWebsite(raw?: string): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return `https://${s}`;
  return null;
}

export interface EnhetPage {
  companies: Company[];
  page: number;
  totalPages: number;
  totalElements: number;
}

export function parseEnhetPage(json: unknown): EnhetPage {
  const j = json as {
    _embedded?: { enheter?: RawEnhet[] };
    page?: { number?: number; totalPages?: number; totalElements?: number };
  };
  const list = j._embedded?.enheter ?? [];
  return {
    companies: list.map(normalizeEnhet),
    page: j.page?.number ?? 0,
    totalPages: j.page?.totalPages ?? 1,
    totalElements: j.page?.totalElements ?? list.length,
  };
}

// --- Regnskapsregisteret -------------------------------------------------

interface RawRegnskap {
  regnskapsperiode?: { fraDato?: string; tilDato?: string };
  valuta?: string;
  resultatregnskapResultat?: {
    aarsresultat?: number;
    ordinaertResultatFoerSkattekostnad?: number;
    driftsresultat?: {
      driftsresultat?: number;
      driftsinntekter?: { sumDriftsinntekter?: number };
    };
  };
  egenkapitalGjeld?: {
    egenkapital?: { sumEgenkapital?: number };
    gjeldOversikt?: { sumGjeld?: number };
  };
  eiendeler?: { sumEiendeler?: number };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseRegnskap(json: unknown): CompanyFinancials[] {
  const arr = Array.isArray(json) ? (json as RawRegnskap[]) : [];
  const byYear = new Map<number, CompanyFinancials>();
  for (const r of arr) {
    const end = r.regnskapsperiode?.tilDato;
    const year = end ? new Date(end).getUTCFullYear() : NaN;
    if (!Number.isFinite(year)) continue;
    const res = r.resultatregnskapResultat;
    const row: CompanyFinancials = {
      year,
      currency: r.valuta ?? null,
      revenue: num(res?.driftsresultat?.driftsinntekter?.sumDriftsinntekter),
      operatingResult: num(res?.driftsresultat?.driftsresultat),
      pretaxResult: num(res?.ordinaertResultatFoerSkattekostnad),
      profit: num(res?.aarsresultat),
      equity: num(r.egenkapitalGjeld?.egenkapital?.sumEgenkapital),
      totalAssets: num(r.eiendeler?.sumEiendeler),
      totalDebt: num(r.egenkapitalGjeld?.gjeldOversikt?.sumGjeld),
      employees: null,
    };
    // Keep the richest record for a given year (some orgs file both "SELSKAP"
    // and "KONSERN" — prefer whichever has revenue).
    const prev = byYear.get(year);
    if (!prev || (row.revenue != null && prev.revenue == null)) byYear.set(year, row);
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year);
}

// --- Roller (roles) ------------------------------------------------------
// Only the statutory "daglig leder" (managing director) role is exposed —
// Brønnøysund has no concept of CTO/sales manager, and we deliberately don't
// read/store birth dates from the person object (privacy).

interface RawRolle {
  type?: { kode?: string };
  person?: { navn?: { fornavn?: string; mellomnavn?: string; etternavn?: string }; erDoed?: boolean };
  avregistrert?: boolean;
}
interface RawRollegruppe {
  type?: { kode?: string };
  roller?: RawRolle[];
}
interface RawRoller {
  rollegrupper?: RawRollegruppe[];
}

export function parseDagligLeder(json: unknown): string | null {
  const grupper = (json as RawRoller)?.rollegrupper ?? [];
  const dagl = grupper.find((g) => g.type?.kode === 'DAGL');
  const rolle = dagl?.roller?.find((r) => !r.avregistrert && r.person && !r.person.erDoed);
  const navn = rolle?.person?.navn;
  if (!navn) return null;
  const full = [navn.fornavn, navn.mellomnavn, navn.etternavn].filter(Boolean).join(' ').trim();
  return full || null;
}

// --- Konsernstruktur (corporate group structure) --------------------------
// The API always returns the tree rooted at the ULTIMATE parent, regardless
// of which member's orgnr you queried with — so the target company can be
// anywhere in it (including being the root itself, if it has no parent).
// 404 (no group at all) is handled upstream by safeFetchText returning null.

export interface KonsernInfo {
  parentOrgnr: string | null;
  parentName: string | null;
}

interface RawKonsernNode {
  organisasjonsnummer?: string;
  navn?: string;
  parentOrganisasjonsnummer?: string;
  parentNavn?: string;
  children?: RawKonsernNode[];
}

function findInTree(node: RawKonsernNode, targetOrgnr: string): RawKonsernNode | null {
  if (node.organisasjonsnummer === targetOrgnr) return node;
  for (const child of node.children ?? []) {
    const hit = findInTree(child, targetOrgnr);
    if (hit) return hit;
  }
  return null;
}

export function parseKonsernstruktur(json: unknown, targetOrgnr: string): KonsernInfo | null {
  const root = json as RawKonsernNode;
  if (!root?.organisasjonsnummer) return null;

  const found = findInTree(root, targetOrgnr);
  if (!found) return null;

  return {
    parentOrgnr: found.parentOrganisasjonsnummer ?? null,
    parentName: found.parentNavn ?? null,
  };
}

// --- Misc --------------------------------------------------------------

/** Norwegian organisasjonsnummer: 9 digits, mod-11 check digit. */
export function isValidOrgnr(raw: string): boolean {
  const s = raw.replace(/\s/g, '');
  if (!/^\d{9}$/.test(s)) return false;
  const w = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = w.reduce((acc, wi, i) => acc + wi * Number(s[i]), 0);
  const rem = sum % 11;
  const check = rem === 0 ? 0 : 11 - rem;
  return check < 10 && check === Number(s[8]);
}

export function proffUrl(orgnr: string): string {
  return `https://www.proff.no/bransjes%C3%B8k?q=${orgnr}`;
}

export function brregUrl(orgnr: string): string {
  return `https://virksomhet.brreg.no/nb/oppslag/enheter/${orgnr}`;
}
