import { orchestrator } from './orchestrator/boot';
import type { LeadScoreResult } from './orchestrator/providers/score';
import type { LeadAnalysis } from './orchestrator/providers/ai';
import type { Company as RawCompany } from './brreg';
import { getCompanyNews } from './news';
import type { CompanyFinancials } from './types';
import {
  startScan,
  finishScan,
  upsertCompany,
  markCompanyRefreshed,
  replaceFinancials,
  insertScore,
  setCompanyCeo,
  setCompanyAiAnalysis,
  listCompaniesToRefresh,
  listActiveCompanies,
  getCompanyByOrgnr,
  type Company,
} from './db';
import { KOMMUNER, NACE_CODES, matchNace } from '../data/maritime-sectors.mjs';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ScanError = { scope: string; message: string };

export interface ScanResult {
  scanId: number;
  companiesFound: number;
  companiesUpdated: number;
  financialsFetched: number;
  errors: ScanError[];
  tookMs: number;
}

// --- Discovery: walk the register for every kommune × NACE slice ----------

async function discover(errors: ScanError[]): Promise<Map<string, RawCompany>> {
  const found = new Map<string, RawCompany>();
  for (const k of KOMMUNER as { nr: string; name: string }[]) {
    for (const nace of NACE_CODES as { code: string; label: string; group: string }[]) {
      const res = await orchestrator.callTool<RawCompany[]>(
        'brreg.searchEnheter',
        { kommunenummer: k.nr, naeringskode: nace.code },
        20_000,
      );
      if (!res.ok) {
        errors.push({ scope: `discover ${k.name}/${nace.code}`, message: res.error });
        continue;
      }
      for (const co of res.data) {
        // The register's NACE filter is fuzzy — keep only real maritime matches.
        const match = matchNace(co.nace.map((n) => n.code));
        if (!match) continue;
        if (co.bankrupt) continue;
        if (!found.has(co.orgnr)) found.set(co.orgnr, co);
      }
      await sleep(150);
    }
  }
  return found;
}

// --- Enrichment: annual accounts + score for one company -----------------

async function enrichCompany(orgnr: string, errors: ScanError[]): Promise<boolean> {
  const company = await getCompanyByOrgnr(orgnr);
  if (!company) return false;

  const fin = await orchestrator.callTool<CompanyFinancials[]>('brreg.getRegnskap', { orgnr }, 15_000);
  const financials = fin.ok ? fin.data : [];
  if (!fin.ok) errors.push({ scope: `regnskap ${orgnr}`, message: fin.error });

  const roller = await orchestrator.callTool<string | null>('brreg.getRoller', { orgnr }, 12_000);
  if (roller.ok) await setCompanyCeo(company.id, roller.data);

  let fetched = 0;
  if (financials.length) {
    fetched = await replaceFinancials(company.id, financials);
  }

  const scored = await orchestrator.callTool<LeadScoreResult>('score.compute', {
    employees: company.employees,
    financials,
  });
  if (scored.ok) {
    const s = scored.data;
    await insertScore({
      companyId: company.id,
      leadScore: s.leadScore,
      sizeScore: s.sizeScore,
      revenueScore: s.revenueScore,
      growthScore: s.growthScore,
      profitabilityScore: s.profitabilityScore,
      revenueLatest: s.revenueLatest,
      revenuePrev: s.revenuePrev,
      revenueGrowthPct: s.revenueGrowthPct,
      operatingMarginPct: s.operatingMarginPct,
      latestYear: s.latestYear,
      reason: s.reason,
    });

    // Best-effort — disabled (no GEMINI_API_KEY) or failed calls just leave
    // the previous analysis in place rather than failing the whole scan.
    const news = await getCompanyNews(company.name, 5);
    const contacts: { role: string; name: string }[] = [
      { role: 'Daglig leder', name: company.ceo_name },
      { role: 'Kontaktperson', name: company.contact_name },
      { role: 'CTO', name: company.cto_name },
      { role: 'Salgssjef', name: company.sales_name },
    ].filter((c): c is { role: string; name: string } => !!c.name);

    const analysis = await orchestrator.callTool<LeadAnalysis | null>(
      'ai.analyze',
      {
        name: company.name,
        poststed: company.poststed,
        sector: company.matched_label,
        nace: company.nace1_text,
        employees: company.employees,
        financials: financials
          .slice()
          .sort((a, b) => b.year - a.year)
          .map((f) => ({ year: f.year, revenue: f.revenue, operatingResult: f.operatingResult, profit: f.profit })),
        leadScore: s.leadScore,
        band: s.band,
        news: news.map((n) => ({ title: n.title, date: n.seenAt, domain: n.domain })),
        contacts,
      },
      25_000,
    );
    if (analysis.ok && analysis.data) await setCompanyAiAnalysis(company.id, JSON.stringify(analysis.data));
  } else {
    errors.push({ scope: `score ${orgnr}`, message: scored.error });
  }

  await markCompanyRefreshed(orgnr);
  return fetched > 0 || financials.length > 0;
}

function naceMatchFor(co: RawCompany) {
  return matchNace(co.nace.map((n) => n.code)) as { code: string; label: string; group: string } | null;
}

// --- The scan ----------------------------------------------------------

export interface RunScanOptions {
  /** Re-fetch accounts for every company, not just the stale rotating batch. */
  full?: boolean;
  /** How many companies to enrich this run (ignored when `full`). */
  limit?: number;
  /** Skip discovery — only refresh accounts/scores for known companies. */
  skipDiscovery?: boolean;
}

export async function runScan(opts: RunScanOptions = {}): Promise<ScanResult> {
  const started = Date.now();
  const scanId = await startScan();
  const errors: ScanError[] = [];
  let companiesFound = 0;
  let companiesUpdated = 0;
  let financialsFetched = 0;

  if (!opts.skipDiscovery) {
    try {
      const discovered = await discover(errors);
      companiesFound = discovered.size;
      for (const co of discovered.values()) {
        const match = naceMatchFor(co);
        const fresh = await upsertCompany({
          orgnr: co.orgnr,
          name: co.name,
          org_form: co.orgForm,
          nace: co.nace,
          sector_code: co.sectorCode,
          sector_text: co.sectorText,
          employees: co.employees,
          website: co.website,
          phone: co.phone,
          address: co.address,
          postnummer: co.postnummer,
          poststed: co.poststed,
          kommune: co.kommune,
          kommunenummer: co.kommunenummer,
          registered_at: co.registeredAt,
          established_at: co.establishedAt,
          last_annual_report: co.lastAnnualReport,
          in_mva: co.inMva,
          bankrupt: co.bankrupt,
          under_liquidation: co.underLiquidation,
          matched_code: match?.code ?? null,
          matched_label: match?.label ?? null,
          matched_group: match?.group ?? null,
        });
        if (!fresh) companiesUpdated++;
      }
    } catch (e) {
      errors.push({ scope: 'discovery', message: e instanceof Error ? e.message : String(e) });
    }
  }

  // Enrichment pass.
  const batch = opts.full
    ? await listActiveCompanies()
    : await listCompaniesToRefresh(opts.limit && opts.limit > 0 ? opts.limit : Number(process.env.SCAN_BATCH) || 40);

  for (let i = 0; i < batch.length; i++) {
    try {
      const did = await enrichCompany(batch[i].orgnr, errors);
      if (did) financialsFetched++;
    } catch (e) {
      errors.push({ scope: `enrich ${batch[i].orgnr}`, message: e instanceof Error ? e.message : String(e) });
    }
    if (i < batch.length - 1) await sleep(120);
  }

  await finishScan(scanId, { companiesFound, companiesUpdated, financialsFetched, errors });
  return { scanId, companiesFound, companiesUpdated, financialsFetched, errors, tookMs: Date.now() - started };
}

// Concurrent refreshes for the same company (e.g. the auto-refresh trigger
// racing a manual click within the same warm instance) used to interleave
// their writes — financials from one run landing alongside the AI analysis
// from another, out of sync with each other. De-dupe by orgnr so overlapping
// callers share a single in-flight run instead.
const inFlightRefresh = new Map<string, Promise<{ ok: boolean; errors: ScanError[] }>>();

export function refreshCompany(orgnr: string): Promise<{ ok: boolean; errors: ScanError[] }> {
  const existing = inFlightRefresh.get(orgnr);
  if (existing) return existing;
  const p = doRefreshCompany(orgnr).finally(() => inFlightRefresh.delete(orgnr));
  inFlightRefresh.set(orgnr, p);
  return p;
}

// Enrich a single company on demand (admin "refresh" button, or after a manual
// add). Also runs discovery-less so it's fast.
async function doRefreshCompany(orgnr: string): Promise<{ ok: boolean; errors: ScanError[] }> {
  const errors: ScanError[] = [];
  try {
    // Pull the latest facts from the register too, in case employees changed.
    const enhet = await orchestrator.callTool<RawCompany | null>('brreg.getEnhet', { orgnr }, 12_000);
    if (enhet.ok && enhet.data) {
      const co = enhet.data;
      const match = naceMatchFor(co);
      await upsertCompany({
        orgnr: co.orgnr,
        name: co.name,
        org_form: co.orgForm,
        nace: co.nace,
        sector_code: co.sectorCode,
        sector_text: co.sectorText,
        employees: co.employees,
        website: co.website,
        phone: co.phone,
        address: co.address,
        postnummer: co.postnummer,
        poststed: co.poststed,
        kommune: co.kommune,
        kommunenummer: co.kommunenummer,
        registered_at: co.registeredAt,
        established_at: co.establishedAt,
        last_annual_report: co.lastAnnualReport,
        in_mva: co.inMva,
        bankrupt: co.bankrupt,
        under_liquidation: co.underLiquidation,
        matched_code: match?.code ?? null,
        matched_label: match?.label ?? null,
        matched_group: match?.group ?? null,
      });
    }
    await enrichCompany(orgnr, errors);
    return { ok: errors.length === 0, errors };
  } catch (e) {
    errors.push({ scope: `refresh ${orgnr}`, message: e instanceof Error ? e.message : String(e) });
    return { ok: false, errors };
  }
}

// Manual add: look the company up by orgnr, insert it, enrich it.
export async function addCompanyByOrgnr(
  orgnr: string,
): Promise<{ ok: true; company: Company } | { ok: false; error: string }> {
  const existing = await getCompanyByOrgnr(orgnr);
  if (existing) return { ok: false, error: `Allerede i listen: ${existing.name}.` };

  const enhet = await orchestrator.callTool<RawCompany | null>('brreg.getEnhet', { orgnr }, 12_000);
  if (!enhet.ok || !enhet.data) {
    return { ok: false, error: 'Fant ikke foretaket i Enhetsregisteret.' };
  }
  const co = enhet.data;
  const match = naceMatchFor(co);
  await upsertCompany({
    orgnr: co.orgnr,
    name: co.name,
    org_form: co.orgForm,
    nace: co.nace,
    sector_code: co.sectorCode,
    sector_text: co.sectorText,
    employees: co.employees,
    website: co.website,
    phone: co.phone,
    address: co.address,
    postnummer: co.postnummer,
    poststed: co.poststed,
    kommune: co.kommune,
    kommunenummer: co.kommunenummer,
    registered_at: co.registeredAt,
    established_at: co.establishedAt,
    last_annual_report: co.lastAnnualReport,
    in_mva: co.inMva,
    bankrupt: co.bankrupt,
    under_liquidation: co.underLiquidation,
    matched_code: match?.code ?? null,
    matched_label: match?.label ?? null,
    matched_group: match?.group ?? null,
    manual_entry: true,
  });
  await enrichCompany(orgnr, []);
  return { ok: true, company: (await getCompanyByOrgnr(orgnr))! };
}
