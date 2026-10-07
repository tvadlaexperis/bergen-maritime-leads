import { orchestrator } from './orchestrator/boot';
import { resetAiUsage, getAiUsage, type AiUsage } from './aiUsage';
import type { LeadScoreResult } from './orchestrator/providers/score';
import { industryChallengesFor } from './industryChallenges';
import {
  aiConfigured,
  aiSetup,
  type AiStepSetup,
  type LeadAnalysis,
  type WebsiteInsights,
} from './orchestrator/providers/ai';
import { websiteFromEmail, type Company as RawCompany, type KonsernInfo, type Roller } from './brreg';
import { safeFetchText } from './http/safeFetch';
import { siteMentionsCompany } from './website';
import type { FoundNews } from './companyNews';
import { isCandidate, employerNameKeys, type FeedLine, type JobAd } from './jobAds';
import { scoreBand } from './score';
import type { CompanyFinancials } from './types';
import {
  startScan,
  finishScan,
  upsertCompany,
  upsertCompanies,
  markCompanyRefreshed,
  replaceFinancials,
  insertScore,
  setCompanyCeo,
  setCompanyParent,
  setCompanyAiAnalysis,
  setCompanyWebsite,
  setWebsiteSearchAttempted,
  setAiAttempted,
  setContactsScraped,
  setCompanyTech,
  setCompanyGeo,
  listCompanyNews,
  mergeCompanyNews,
  NEWS_REFRESH_DAYS,
  replaceContacts,
  listWebsiteContacts,
  addNotification,
  listCompaniesToRefresh,
  listCompaniesForAi,
  type TopN,
  getCompanyByOrgnr,
  recomputeGroups,
  listCompanyOrgnrIndex,
  getCachedUnderenhetParent,
  cacheUnderenhetParent,
  upsertJobAd,
  deactivateJobAds,
  listJobAds,
  getMeta,
  setMeta,
  listFinancials,
  type Company,
  type CompanyWithScore,
  type UpsertCompanyInput,
  hideOutsideScope,
  SEARCH_MIN_SCORE,
} from './db';
import { KOMMUNER, NACE_CODES, matchNace } from '../data/maritime-sectors.mjs';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ScanError = { scope: string; message: string };

export type ScanTrigger = 'cron' | 'manuell' | 'full' | 'ai';

// Everything a run did, stored as JSON on the `scans` row so the admin
// "Siste skann" table can show *what* was updated, not just how many rows
// were touched. `companies` lists only companies where something actually
// changed — a Brreg re-check that found nothing new is counted in
// `brreg.processed` but not listed.
export interface ScanDetails {
  trigger: ScanTrigger;
  tookMs: number;
  stoppedEarly: boolean; // the time budget ran out before the queue did
  discovery: { ran: boolean; found: number; added: number };
  brreg: {
    queued: number;
    processed: number;
    newFinancials: number;
    ceoSet: number;
    ceoChanged: number;
    boardUpdated: number;
    scoreChanged: number;
    emailFound?: number; // optional: absent on scans from before these existed
    websiteFromEmail?: number;
  };
  ai: {
    enabled: boolean;
    /** Which API and model each AI step used (aiSetup) — absent on older runs. */
    setup?: AiStepSetup[];
    processed: number;
    analyses: number;
    websitesFound: number;
    contactCompanies: number;
    contactPeople: number;
    sitesScraped?: number; // websites read for contacts (successful Gemini call, found people or not)
    newsSearched?: number; // companies whose news search completed
    newsFound?: number; // articles not stored before
    /** Approximate tokens + cost for this run (lib/aiUsage) — absent on older runs. */
    usage?: AiUsage;
  };
  // NAV job ads — optional: absent on scans from before it existed
  jobs?: {
    enabled: boolean;
    pages: number; // feed pages read
    candidates: number; // ads fetched (in scope by municipality/name)
    newAds: number; // ads matched to one of our companies, first time seen
    techAds: number; // of those, IT/tech roles
    deactivated: number; // ads NAV marked stopped/expired
    ms?: number; // time spent in the pass
  };
  companies: { orgnr: string; name: string; changes: string[] }[];
  changedCount: number; // before `companies` is capped for storage
}

export interface ScanResult {
  scanId: number;
  details: ScanDetails;
  errors: ScanError[];
}

function emptyDetails(trigger: ScanTrigger): ScanDetails {
  return {
    trigger,
    tookMs: 0,
    stoppedEarly: false,
    discovery: { ran: false, found: 0, added: 0 },
    brreg: {
      queued: 0,
      processed: 0,
      newFinancials: 0,
      ceoSet: 0,
      ceoChanged: 0,
      boardUpdated: 0,
      scoreChanged: 0,
      emailFound: 0,
      websiteFromEmail: 0,
    },
    ai: {
      enabled: false,
      processed: 0,
      analyses: 0,
      websitesFound: 0,
      contactCompanies: 0,
      contactPeople: 0,
      sitesScraped: 0,
      newsSearched: 0,
      newsFound: 0,
    },
    jobs: { enabled: false, pages: 0, candidates: 0, newAds: 0, techAds: 0, deactivated: 0 },
    companies: [],
    changedCount: 0,
  };
}

// Per-company log shared by both passes: `changes` feeds the scan's details,
// `notes` (a subset — only what a salesperson cares about) feeds the header
// bell via addNotification.
class CompanyLog {
  changes: string[] = [];
  notes: string[] = [];
  change(text: string, notify = false) {
    this.changes.push(text);
    if (notify) this.notes.push(text);
  }
}

function toUpsertInput(co: RawCompany, manual = false): UpsertCompanyInput {
  const match = matchNace(co.nace.map((n) => n.code)) as { code: string; label: string; group: string } | null;
  return {
    orgnr: co.orgnr,
    name: co.name,
    org_form: co.orgForm,
    nace: co.nace,
    sector_code: co.sectorCode,
    sector_text: co.sectorText,
    employees: co.employees,
    website: co.website,
    phone: co.phone,
    email: co.email,
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
    manual_entry: manual,
  };
}

// --- Discovery: walk the register for every kommune × NACE slice ----------

async function discover(errors: ScanError[]): Promise<Map<string, RawCompany>> {
  const found = new Map<string, RawCompany>();
  // Three municipalities at a time — one after another, nine of them would
  // take most of the 60 s budget.
  const kommuner = [...(KOMMUNER as { nr: string; name: string }[])];
  const worker = async () => {
    for (let k = kommuner.shift(); k; k = kommuner.shift()) await discoverKommune(k, found, errors);
  };
  await Promise.all([worker(), worker(), worker()]);
  return found;
}

async function discoverKommune(
  k: { nr: string; name: string },
  found: Map<string, RawCompany>,
  errors: ScanError[],
): Promise<void> {
  {
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
}

// Reads only the level, tolerating malformed/absent JSON — mirrors
// app/components/SignalBadge.tsx's parser, duplicated here rather than
// imported so this backend module doesn't reach into app/.
function parseBuyingSignalLevel(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { buyingSignal?: { level?: string } })?.buyingSignal?.level ?? null;
  } catch {
    return null;
  }
}

function toCompanyFinancials(history: Awaited<ReturnType<typeof listFinancials>>): CompanyFinancials[] {
  return history
    .slice()
    .sort((a, b) => b.year - a.year)
    .map((f) => ({
      year: f.year,
      currency: f.currency,
      revenue: f.revenue,
      operatingResult: f.operating_result,
      pretaxResult: f.pretax_result,
      profit: f.profit,
      equity: f.equity,
      totalAssets: f.total_assets,
      totalDebt: f.total_debt,
      employees: null,
    }));
}

// --- Pass 1: Brønnøysund (free, fast) ------------------------------------
// Accounts, daglig leder + board, konsern, and the lead score. A few hundred
// ms per company, so a single run gets through most of the list. Used to
// share a code path with the AI calls below, which made every company as slow
// as its slowest Gemini call — and a chunk of five regularly outlived the
// 60s function limit, so even the cheap Brreg data never got written.

async function brregPass(
  company: CompanyWithScore,
  log: CompanyLog,
  stats: ScanDetails['brreg'],
  errors: ScanError[],
): Promise<void> {
  const orgnr = company.orgnr;
  const [prevFinancials, prevBoard, enhet, fin, roller, konsern] = await Promise.all([
    listFinancials(company.id),
    listWebsiteContacts(company.id, 'brreg'),
    // Company record: e-post, ansatte, hjemmeside. Used to be read only by
    // discovery (weekly), so a new field like e-post stayed empty for days.
    orchestrator.callTool<RawCompany | null>('brreg.getEnhet', { orgnr }, 12_000),
    orchestrator.callTool<CompanyFinancials[]>('brreg.getRegnskap', { orgnr }, 15_000),
    orchestrator.callTool<Roller | null>('brreg.getRoller', { orgnr }, 12_000),
    // null just means "not part of any corporate group" (the common case).
    orchestrator.callTool<KonsernInfo | null>('brreg.getKonsern', { orgnr }, 12_000),
  ]);

  let employees = company.employees;
  if (enhet.ok && enhet.data) {
    await upsertCompany(toUpsertInput(enhet.data));
    employees = enhet.data.employees;
    if (enhet.data.email && !company.email) {
      stats.emailFound = (stats.emailFound ?? 0) + 1;
      log.change(`E-post: ${enhet.data.email}`);
    }
  }

  // No website on record, but a company email domain: post@firma.no says
  // firma.no is theirs. Free, unlike the Gemini search — but only trusted if
  // the site answers *and* mentions the company, since the address is often
  // a manager's or parent's (post@obos.no on a boat harbour co-op).
  const email = (enhet.ok && enhet.data?.email) || company.email;
  const hasWebsite = !!(company.website || (enhet.ok && enhet.data?.website));
  const candidate = !hasWebsite ? websiteFromEmail(email) : null;
  const candidateHtml = candidate ? await safeFetchText(candidate, { timeoutMs: 5_000, maxBytes: 2_000_000 }) : null;
  if (candidate && candidateHtml && siteMentionsCompany(candidateHtml, company.name, company.orgnr)) {
    await setCompanyWebsite(company.id, candidate);
    stats.websiteFromEmail = (stats.websiteFromEmail ?? 0) + 1;
    log.change(`Nettside fra e-postdomenet: ${candidate}`, true);
  }

  // Map position (Kartverket), only when the address is new or changed.
  // Sole proprietorships (ENK) are never placed: their business address is
  // often the owner's home, so we store "skjult" instead of coordinates.
  const fresh = enhet.ok ? enhet.data : null;
  const address = fresh ? fresh.address : company.address;
  const postnummer = fresh ? fresh.postnummer : company.postnummer;
  const geoKey = `${address ?? ''}|${postnummer ?? ''}`;
  if (geoKey !== '|' && geoKey !== company.geocoded_for) {
    if (/enkeltperson/i.test(company.org_form ?? '')) {
      await setCompanyGeo(company.id, { lat: null, lon: null, precision: 'skjult', forAddress: geoKey });
    } else {
      const geo = await orchestrator.callTool<{ lat: number; lon: number; precision: string } | null>(
        'geo.geocode',
        { address, postnummer },
        10_000,
      );
      if (geo.ok) {
        await setCompanyGeo(company.id, {
          lat: geo.data?.lat ?? null,
          lon: geo.data?.lon ?? null,
          precision: geo.data?.precision ?? null,
          forAddress: geoKey,
        });
      }
    }
  }

  const priorYears = new Set(prevFinancials.map((f) => f.year));
  if (!fin.ok) errors.push({ scope: `regnskap ${orgnr}`, message: fin.error });
  const financials = fin.ok ? fin.data : [];
  const newYears = financials.filter((f) => !priorYears.has(f.year)).map((f) => f.year);
  if (financials.length) await replaceFinancials(company.id, financials);
  if (newYears.length) {
    stats.newFinancials++;
    log.change(`Nytt regnskap for ${newYears.join(', ')}`, true);
  }

  if (!roller.ok) errors.push({ scope: `roller ${orgnr}`, message: roller.error });
  if (roller.ok && roller.data) {
    const ceo = roller.data.ceo;
    const ceoChanged = company.ceo_name != null && ceo != null && ceo !== company.ceo_name;
    if (ceo !== company.ceo_name) await setCompanyCeo(company.id, ceo, ceoChanged);
    if (ceoChanged) {
      stats.ceoChanged++;
      log.change(`Ny daglig leder: ${ceo}`, true);
    } else if (ceo && !company.ceo_name) {
      stats.ceoSet++;
      log.change(`Daglig leder: ${ceo}`);
    }

    const key = (xs: { name: string; role: string | null }[]) => xs.map((x) => `${x.role}:${x.name}`).sort().join('|');
    if (key(roller.data.board) !== key(prevBoard)) {
      await replaceContacts(
        company.id,
        'brreg',
        roller.data.board.map((b) => ({ name: b.name, role: b.role, email: null, phone: null })),
      );
      stats.boardUpdated++;
      const chair = roller.data.board.find((b) => b.role === 'Styreleder');
      log.change(`Styre oppdatert (${roller.data.board.length} pers.${chair ? `, leder ${chair.name}` : ''})`);
    }
  }

  if (konsern.ok) {
    const newParentOrgnr = konsern.data?.parentOrgnr ?? null;
    const newRoot = konsern.data?.rootOrgnr ?? null;
    if (newParentOrgnr !== company.parent_orgnr || newRoot !== company.konsern_root_orgnr) {
      await setCompanyParent(
        company.id,
        newParentOrgnr,
        konsern.data?.parentName ?? null,
        newRoot,
        konsern.data?.rootName ?? null,
      );
      // Only a real change of parent is news — filling in the root for the
      // first time on an existing member isn't.
      if (newParentOrgnr && newParentOrgnr !== company.parent_orgnr) {
        log.change(`Del av konsernet ${konsern.data?.parentName ?? newParentOrgnr}`, true);
      }
    }
  }

  // Brønnøysund's regnskap endpoint often returns only the single most
  // recent filing per call, not the company's full history — score off the
  // full stored history instead of this call's result.
  const allFinancials = toCompanyFinancials(newYears.length ? await listFinancials(company.id) : prevFinancials);
  const scored = await orchestrator.callTool<LeadScoreResult>('score.compute', {
    employees,
    financials: allFinancials,
  });
  if (scored.ok) {
    const s = scored.data;
    const before = company.lead_score;
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
      operatingResultLatest: s.operatingResultLatest,
      operatingMarginPct: s.operatingMarginPct,
      latestYear: s.latestYear,
      reason: s.reason,
    });
    if (before !== s.leadScore) {
      stats.scoreChanged++;
      log.change(before == null ? `Score ${s.leadScore}` : `Score ${before} → ${s.leadScore}`);
    }
  } else {
    errors.push({ scope: `score ${orgnr}`, message: scored.error });
  }

  await markCompanyRefreshed(orgnr);
  stats.processed++;
}

// --- Pass 2: AI (Gemini — slow, partly paid) ------------------------------
// Analysis, website search, website contact scrape. The analysis and the
// website→contacts chain run side by side rather than one after the other,
// and every call's timeout is clipped to whatever is left of the run's
// budget so a slow Gemini response can't push the function past Vercel's
// hard limit.

async function aiPass(
  orgnr: string,
  log: CompanyLog,
  stats: ScanDetails['ai'],
  errors: ScanError[],
  deadline: number,
  force = false,
): Promise<void> {
  const company = await getCompanyByOrgnr(orgnr);
  if (!company) return;
  // A company can be in the AI queue only because it has a website nobody
  // has read yet — don't pay for a new analysis if the last one is recent.
  // `force` (the admin refresh button) always re-analyzes.
  const analysisFresh =
    !force && company.ai_analysis_at != null && Date.now() - company.ai_analysis_at < AI_REANALYZE_AFTER_MS;
  await setAiAttempted(company.id);
  const budget = (ms: number) => Math.max(1_000, Math.min(ms, deadline - Date.now()));

  // News first, so a fresh analysis gets to use it (buying signals). Found
  // articles are merged into company_news; an analysis done only because of
  // new news would be wasteful, so news alone never forces one.
  // Paid web searches (news, website lookup) only from SEARCH_MIN_SCORE up —
  // the admin refresh button (`force`) always searches.
  const searchWorthIt = force || (company.lead_score ?? 0) >= SEARCH_MIN_SCORE;
  const newsDue =
    force ||
    (searchWorthIt &&
      (company.news_checked_at == null || Date.now() - company.news_checked_at > NEWS_REFRESH_DAYS * 86_400_000));
  const newsJob = async () => {
    if (!newsDue) return;
    const found = await orchestrator.callTool<FoundNews[]>(
      'ai.findNews',
      {
        name: company.name,
        orgnr: company.orgnr,
        poststed: company.poststed,
        website: company.website,
        parentName: company.parent_name,
      },
      budget(30_000),
    );
    if (!found.ok) {
      errors.push({ scope: `ai.findNews ${orgnr}`, message: found.error });
      return;
    }
    const fresh = await mergeCompanyNews(company.id, found.data);
    stats.newsSearched = (stats.newsSearched ?? 0) + 1;
    stats.newsFound = (stats.newsFound ?? 0) + fresh.length;
    if (fresh.length) {
      log.change(`${fresh.length} ${fresh.length === 1 ? 'ny nyhet' : 'nye nyheter'}`);
      // Only recent, concrete news goes to the bell — "annet" and old
      // articles found on a first search are just background.
      const recent = fresh.filter(
        (n) => n.category !== 'annet' && n.date && Date.now() - Date.parse(n.date) < 60 * 86_400_000,
      );
      for (const n of recent.slice(0, 2)) log.change(`Nyhet: ${n.title}`, true);
    }
  };

  const analysisJob = async () => {
    await newsJob();
    if (analysisFresh) return;
    const priorSignalLevel = parseBuyingSignalLevel(company.ai_analysis);
    const [history, board, news, jobAds] = await Promise.all([
      listFinancials(company.id),
      listWebsiteContacts(company.id),
      listCompanyNews(company.id, 5),
      listJobAds([company.id]),
    ]);
    const contacts: { role: string; name: string }[] = [
      { role: 'Daglig leder', name: company.ceo_name },
      { role: 'Kontaktperson', name: company.contact_name },
      { role: 'CTO', name: company.cto_name },
      { role: 'Salgssjef', name: company.sales_name },
      ...board.slice(0, 8).map((b) => ({ role: b.role ?? 'Ansatt', name: b.name })),
    ].filter((c): c is { role: string; name: string } => !!c.name);

    const analysis = await orchestrator.callTool<LeadAnalysis | null>(
      'ai.analyze',
      {
        name: company.name,
        poststed: company.poststed,
        sector: company.matched_label,
        nace: company.nace1_text,
        industryKnown: industryChallengesFor(company.matched_code),
        employees: company.employees,
        financials: toCompanyFinancials(history).map((f) => ({
          year: f.year,
          revenue: f.revenue,
          operatingResult: f.operatingResult,
          profit: f.profit,
        })),
        leadScore: company.lead_score,
        band: company.lead_score != null ? scoreBand(company.lead_score) : null,
        news: news.map((n) => ({
          title: n.title,
          date: n.published_at,
          domain: n.source ?? '',
          summary: n.summary ?? undefined,
          category: n.category,
        })),
        contacts,
        ...techForAnalysis(company.tech_json),
        jobAds: jobAds.slice(0, 8).map((j) => ({
          title: j.title,
          occupation: j.occupation,
          published: j.published,
          isTech: j.is_tech === 1,
        })),
      },
      budget(40_000),
    );
    if (!analysis.ok) errors.push({ scope: `ai.analyze ${orgnr}`, message: analysis.error });
    if (analysis.ok && analysis.data) {
      await setCompanyAiAnalysis(company.id, JSON.stringify(analysis.data));
      stats.analyses++;
      log.change('AI-vurdering oppdatert');
      if (analysis.data.buyingSignal.level === 'høy' && priorSignalLevel !== 'høy') {
        log.change('Sterkt kjøpssignal oppdaget', true);
      }
    }
  };

  const websiteJob = async () => {
    // Paid Google Search-grounded lookup, so this must run at most once per
    // company ever — never on a later refresh, even if it found nothing.
    let website = company.website;
    if (!website && !company.website_search_attempted_at && searchWorthIt) {
      const found = await orchestrator.callTool<string | null>(
        'ai.findWebsite',
        { name: company.name, orgnr: company.orgnr, poststed: company.poststed },
        budget(30_000),
      );
      // Only a completed search counts as "attempted" — a timeout clipped by
      // the run's budget didn't actually get an answer, so try again later.
      if (found.ok) await setWebsiteSearchAttempted(company.id);
      else errors.push({ scope: `ai.findWebsite ${orgnr}`, message: found.error });
      if (found.ok && found.data) {
        await setCompanyWebsite(company.id, found.data);
        website = found.data;
        stats.websitesFound++;
        log.change(`Nettside funnet: ${found.data}`, true);
      }
    }
    // An admin-set contact page (framo.com/contact) is enough on its own —
    // its site's front page stands in for the unknown website.
    const contactPage = company.contact_page_url;
    if (!website && contactPage) {
      try {
        website = new URL(contactPage).origin;
      } catch {
        // malformed URL — validated on save, so only a hand-edited row
      }
    }
    if (!website) return;

    // Free-form Gemini read of the company's own about/contact/team pages —
    // fine to repeat on every AI cycle, since staff on a team page turn over.
    const prior = await listWebsiteContacts(company.id, 'nettside');
    const insights = await orchestrator.callTool<WebsiteInsights>(
      'ai.extractContacts',
      { name: company.name, website, contactPage },
      budget(40_000),
    );
    if (!insights.ok) {
      errors.push({ scope: `ai.extractContacts ${orgnr}`, message: insights.error });
      return;
    }
    const contacts = { data: insights.data.contacts };
    // Technology named on the site (verified quotes only — lib/.../ai.ts),
    // read in the same call as the contacts: no extra cost.
    await setCompanyTech(company.id, {
      technologies: insights.data.technologies,
      itEnvironment: insights.data.itEnvironment,
      digitalProducts: insights.data.digitalProducts,
      profile: insights.data.profile,
      checkedAt: Date.now(),
    });
    await setContactsScraped(company.id);
    stats.sitesScraped = (stats.sitesScraped ?? 0) + 1;
    // An empty result from a site that previously listed people is far more
    // likely a fetch hiccup (timeout, bot wall) than everyone leaving — keep
    // the old list rather than wiping it.
    if (contacts.data.length === 0 && prior.length > 0) return;
    await replaceContacts(company.id, 'nettside', contacts.data);
    if (contacts.data.length > 0) {
      stats.contactCompanies++;
      stats.contactPeople += contacts.data.length;
      const added = contacts.data.filter((c) => !prior.some((p) => p.name === c.name)).length;
      if (added > 0) log.change(`${added} nye kontakter fra nettsiden`, prior.length === 0);
    }
  };

  await Promise.all([analysisJob(), websiteJob()]);
  stats.processed++;
}

// What the analysis gets from the last website read (documented only).
function techForAnalysis(raw: string | null): { technologies?: string[]; itEnvironment?: string | null; digitalProducts?: string | null } {
  if (!raw) return {};
  try {
    const t = JSON.parse(raw) as { technologies?: { name: string }[]; itEnvironment?: { value: string }; digitalProducts?: { value: string } };
    return {
      technologies: (t.technologies ?? []).map((x) => x.name),
      itEnvironment: t.itEnvironment?.value ?? null,
      digitalProducts: t.digitalProducts?.value ?? null,
    };
  } catch {
    return {};
  }
}

// --- Pass: NAV job ads ------------------------------------------------------
// Reads NAV's vacancy feed forward from where the last run stopped (the
// cursor is a feed page id in app_meta; a first run starts 14 days back),
// pre-filters each line on municipality / employer name, fetches the full ad
// for the candidates, maps the employer's underenhet to one of our companies
// and stores it. Stopped/expired ads are retired, as NAV's terms require.

const JOBS_CURSOR = 'nav_feed_path';
const JOBS_SINCE = 'nav_feed_since';
const JOBS_FIRST_RUN_DAYS = 14;

async function jobsPass(
  stats: NonNullable<ScanDetails['jobs']>,
  logFor: (co: { orgnr: string; name: string }) => CompanyLog,
  errors: ScanError[],
  until: number,
): Promise<void> {
  const index = await listCompanyOrgnrIndex();
  const nameWords = employerNameKeys(index.names);
  const municipalities = new Set((KOMMUNER as { name: string }[]).map((k) => k.name.toUpperCase()));

  // Employer (usually an underenhet) → our company id, via a cached Brreg lookup.
  const resolve = async (orgnr: string | null): Promise<number | null> => {
    if (!orgnr) return null;
    if (index.byOrgnr.has(orgnr)) return index.byOrgnr.get(orgnr)!;
    let { known, parent } = await getCachedUnderenhetParent(orgnr);
    if (!known) {
      const r = await orchestrator.callTool<string | null>('brreg.getUnderenhetParent', { orgnr }, 8_000);
      if (!r.ok) return null;
      parent = r.data;
      await cacheUnderenhetParent(orgnr, parent);
    }
    return parent && index.byOrgnr.has(parent) ? index.byOrgnr.get(parent)! : null;
  };

  let path = (await getMeta(JOBS_CURSOR)) || null;
  let since = (await getMeta(JOBS_SINCE)) || new Date(Date.now() - JOBS_FIRST_RUN_DAYS * 86_400_000).toISOString();
  let errorCount = 0;
  while (Date.now() < until) {
    const page = await orchestrator.callTool<{ lines: FeedLine[]; nextUrl: string | null; path: string }>(
      'nav.feedPage',
      path ? { path } : { since },
      26_000,
    );
    if (!page.ok) {
      errors.push({ scope: 'nav.feed', message: page.error });
      break;
    }
    stats.pages++;
    const lines = page.data.lines;
    stats.deactivated += await deactivateJobAds(lines.filter((l) => l.status !== 'ACTIVE').map((l) => l.uuid));

    const candidates = lines.filter((l) => isCandidate(l, municipalities, nameWords));
    let finishedPage = true;
    for (let i = 0; i < candidates.length; i += 6) {
      if (Date.now() >= until) {
        finishedPage = false; // re-read this page next run; upserts are idempotent
        break;
      }
      await Promise.all(
        candidates.slice(i, i + 6).map(async (line) => {
          stats.candidates++;
          const ad = await orchestrator.callTool<JobAd | null>('nav.getAd', { url: line.url, uuid: line.uuid }, 10_000);
          if (!ad.ok) {
            if (errorCount++ < 5) errors.push({ scope: `nav.ad ${line.uuid}`, message: ad.error });
            return;
          }
          if (!ad.data) return;
          const companyId = await resolve(ad.data.employerOrgnr);
          if (companyId == null) return;
          if (await upsertJobAd(companyId, ad.data)) {
            stats.newAds++;
            if (ad.data.isTech) stats.techAds++;
            const co = index.byId.get(companyId);
            if (co) logFor(co).change(`Ny stilling: ${ad.data.title}${ad.data.isTech ? ' (IT)' : ''}`, ad.data.isTech);
          }
        }),
      );
    }
    const last = lines[lines.length - 1]?.modified;
    if (!finishedPage) break;
    if (page.data.nextUrl) {
      path = page.data.nextUrl;
    } else {
      // Reached the end of the feed: stay on this last page and re-read it
      // next run (fast, ~1 s), following next_url once NAV adds pages. Only
      // a real page id can be a cursor — the bare /api/v1/feed would restart
      // from the feed's beginning in 2023. The "modified since" query is
      // only for the very first run: NAV sometimes takes 25 s+ to answer it.
      path = /^\/api\/v1\/feed\/[\w-]+$/.test(page.data.path) ? page.data.path : null;
      if (last) since = last;
      break;
    }
    if (last) since = last;
  }
  await setMeta(JOBS_CURSOR, path ?? '');
  await setMeta(JOBS_SINCE, since);
}

// --- The scan ----------------------------------------------------------

export interface RunScanOptions {
  /** Brreg pass: treat every company as due, not just stale ones (the time budget still applies). */
  full?: boolean;
  /** Skip the Brreg pass entirely — the whole budget goes to the AI queue ("Kjør AI-køen"). */
  aiOnly?: boolean;
  /** Skip the AI pass — Brreg (and NAV) only, costs nothing ("Kjør skann" / "Full oppdatering"). */
  noAi?: boolean;
  /** AI queue covers this many top leads (konsern counted once). Default AI_TOP_N. */
  aiTopN?: TopN;
  /** How many companies the Brreg pass may consider this run (ignored when `full`). */
  limit?: number;
  /** Skip discovery — only refresh known companies. */
  skipDiscovery?: boolean;
  trigger?: ScanTrigger;
}

// The cron route and the admin Server Action both cap the function at 60s
// (maxDuration). Everything below is planned against that: discovery first
// (when it runs), then the Brreg pass until BRREG_UNTIL_MS, then as many AI
// waves as still fit whole before HARD_STOP_MS — leaving a few seconds to
// write the scan row, so the "Siste skann" table always gets a finished
// entry instead of a "kjører / avbrutt" one.
const BRREG_CONCURRENCY = 6;
const AI_CONCURRENCY = 4;
// A company re-checked in Brreg within this many days isn't due again —
// accounts are filed yearly and board changes are rare.
const BRREG_STALE_DAYS = 3;
// An AI analysis younger than this isn't redone when a company is queued
// only for its website contacts.
const AI_REANALYZE_AFTER_MS = 30 * 86_400_000;
const BRREG_UNTIL_MS = 30_000;
const BRREG_UNTIL_NO_AI_MS = 50_000;
const HARD_STOP_MS = 54_000;
const AI_MIN_WINDOW_MS = 18_000;

export async function runScan(opts: RunScanOptions = {}): Promise<ScanResult> {
  const started = Date.now();
  const scanId = await startScan();
  const errors: ScanError[] = [];
  const details = emptyDetails(opts.trigger ?? 'manuell');
  const logs = new Map<string, { name: string; log: CompanyLog }>();
  const logFor = (co: { orgnr: string; name: string }) => {
    let entry = logs.get(co.orgnr);
    if (!entry) logs.set(co.orgnr, (entry = { name: co.name, log: new CompanyLog() }));
    return entry.log;
  };
  const aiEnabled = aiConfigured() && !opts.noAi;
  details.ai.enabled = aiEnabled;
  if (aiEnabled) details.ai.setup = aiSetup();
  resetAiUsage();

  if (!opts.skipDiscovery) {
    details.discovery.ran = true;
    try {
      const discovered = await discover(errors);
      details.discovery.found = discovered.size;
      details.discovery.added = await upsertCompanies([...discovered.values()].map((co) => toUpsertInput(co)));
    } catch (e) {
      errors.push({ scope: 'discovery', message: e instanceof Error ? e.message : String(e) });
    }
  }

  // Pass 1 — Brreg, only companies that are due, staleness-ordered (lib/db.ts
  // listCompaniesToRefresh), so each run picks up where the last one stopped.
  // Once everyone's been checked recently this is empty and the AI pass
  // below starts immediately with the whole budget.
  const brregUntil = started + (aiEnabled ? BRREG_UNTIL_MS : BRREG_UNTIL_NO_AI_MS);
  const batch = opts.aiOnly
    ? []
    : await listCompaniesToRefresh(
        opts.full ? Number.MAX_SAFE_INTEGER : opts.limit && opts.limit > 0 ? opts.limit : Number(process.env.SCAN_BATCH) || 150,
        opts.full ? 0 : BRREG_STALE_DAYS,
      );
  details.brreg.queued = batch.length;
  let next = 0;
  await Promise.all(
    Array.from({ length: BRREG_CONCURRENCY }, async () => {
      while (next < batch.length && Date.now() < brregUntil) {
        const co = batch[next++];
        try {
          await brregPass(co, logFor(co), details.brreg, errors);
        } catch (e) {
          errors.push({ scope: `brreg ${co.orgnr}`, message: e instanceof Error ? e.message : String(e) });
        }
      }
    }),
  );
  if (details.brreg.processed < batch.length) details.stoppedEarly = true;
  // A company that moved its address out of the scan area stops showing up.
  if (details.brreg.processed > 0) {
    await hideOutsideScope((KOMMUNER as { nr: string }[]).map((k) => k.nr)).catch((e) =>
      errors.push({ scope: 'scope', message: e instanceof Error ? e.message : String(e) }),
    );
  }

  // Pass 1b — NAV job ads, a short slot of its own (the feed is read forward
  // from a cursor, so a short slot every run keeps up). Not on AI-only runs.
  if (!opts.aiOnly && orchestrator.hasProvider('nav')) {
    details.jobs!.enabled = true;
    // Runs after the Brreg pass (itself capped at 30 s): whatever is left up
    // to the AI pass's start — at least ~6 s, the whole gap when Brreg had
    // little to do, which is how a backlog in the feed gets cleared.
    const jobsUntil = Math.max(Date.now() + 6_000, started + (aiEnabled ? 36_000 : 50_000));
    const jobsStart = Date.now();
    try {
      await jobsPass(details.jobs!, logFor, errors, jobsUntil);
      details.jobs!.ms = Date.now() - jobsStart;
    } catch (e) {
      errors.push({ scope: 'nav', message: e instanceof Error ? e.message : String(e) });
    }
  }

  // Pass 2 — AI, in whole waves that each still fit before the hard stop.
  if (aiEnabled) {
    const deadline = started + HARD_STOP_MS;
    const queue = await listCompaniesForAi(Number(process.env.SCAN_AI_BATCH) || 12, opts.aiTopN);
    let i = 0;
    while (i < queue.length && deadline - Date.now() >= AI_MIN_WINDOW_MS) {
      const wave = queue.slice(i, i + AI_CONCURRENCY);
      i += wave.length;
      await Promise.all(
        wave.map(async (co) => {
          try {
            await aiPass(co.orgnr, logFor(co), details.ai, errors, deadline);
          } catch (e) {
            errors.push({ scope: `ai ${co.orgnr}`, message: e instanceof Error ? e.message : String(e) });
          }
        }),
      );
    }
    if (i < queue.length) details.stoppedEarly = true;
  }

  for (const [orgnr, { name, log }] of logs) {
    if (log.changes.length) details.companies.push({ orgnr, name, changes: log.changes });
    if (log.notes.length) {
      const co = await getCompanyByOrgnr(orgnr);
      if (co) await addNotification(co.id, orgnr, name, log.notes.join(' · '));
    }
  }
  // Groups depend on websites, people and konsern data this run may have
  // changed. Best-effort: a failure here mustn't lose the scan's record.
  try {
    await recomputeGroups();
  } catch (e) {
    errors.push({ scope: 'konsern', message: e instanceof Error ? e.message : String(e) });
  }

  if (aiEnabled) details.ai.usage = getAiUsage();
  details.changedCount = details.companies.length;
  details.companies.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  details.companies = details.companies.slice(0, 400);
  details.tookMs = Date.now() - started;

  await finishScan(scanId, {
    companiesFound: details.discovery.found,
    companiesUpdated: details.brreg.processed,
    financialsFetched: details.brreg.newFinancials,
    errors,
    details,
  });
  return { scanId, details, errors };
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

// Both passes for a single company, outside the scan budget (admin "refresh"
// button, auto-refresh on first view, manual add).
async function enrichOne(orgnr: string, errors: ScanError[]): Promise<void> {
  const company = await getCompanyByOrgnr(orgnr);
  if (!company) return;
  const log = new CompanyLog();
  await brregPass(company, log, emptyDetails('manuell').brreg, errors);
  await aiPass(orgnr, log, emptyDetails('manuell').ai, errors, Date.now() + HARD_STOP_MS, true);
  if (log.notes.length) await addNotification(company.id, company.orgnr, company.name, log.notes.join(' · '));
}

async function doRefreshCompany(orgnr: string): Promise<{ ok: boolean; errors: ScanError[] }> {
  const errors: ScanError[] = [];
  try {
    // Pull the latest facts from the register too, in case employees changed.
    const enhet = await orchestrator.callTool<RawCompany | null>('brreg.getEnhet', { orgnr }, 12_000);
    if (enhet.ok && enhet.data) await upsertCompany(toUpsertInput(enhet.data));
    await enrichOne(orgnr, errors);
    await recomputeGroups().catch((e) => errors.push({ scope: 'konsern', message: String(e) }));
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
  await upsertCompany(toUpsertInput(enhet.data, true));
  await enrichOne(orgnr, []);
  return { ok: true, company: (await getCompanyByOrgnr(orgnr))! };
}
