import { createClient, type Client, type InStatement } from '@libsql/client';
import path from 'path';
import type { Role, CompanyStatus, CompanyFinancials } from './types';
import { computeGroups } from './groups';
import type { JobAd } from './jobAds';

export type { Role, CompanyStatus, CompanyFinancials } from './types';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  role: Role;
  created_at: number;
}

export interface Company {
  id: number;
  orgnr: string;
  name: string;
  org_form: string | null;
  nace1_code: string | null;
  nace1_text: string | null;
  nace2_code: string | null;
  nace2_text: string | null;
  nace3_code: string | null;
  nace3_text: string | null;
  sector_code: string | null;
  sector_text: string | null;
  employees: number | null;
  website: string | null;
  phone: string | null;
  email: string | null; // Brreg's `epostadresse` — usually post@/firmapost@, not a person
  address: string | null;
  postnummer: string | null;
  poststed: string | null;
  kommune: string | null;
  kommunenummer: string | null;
  registered_at: string | null;
  established_at: string | null;
  last_annual_report: string | null;
  in_mva: number;
  bankrupt: number;
  under_liquidation: number;
  matched_code: string | null;
  matched_label: string | null;
  matched_group: string | null;
  manual_entry: number;
  status: CompanyStatus;
  notes: string | null;
  ceo_name: string | null;
  ceo_changed_at: number | null;
  parent_orgnr: string | null;
  parent_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  cto_name: string | null;
  cto_email: string | null;
  cto_phone: string | null;
  sales_name: string | null;
  sales_email: string | null;
  sales_phone: string | null;
  ai_summary: string | null;
  ai_summary_at: number | null;
  ai_analysis: string | null; // JSON-encoded LeadAnalysis (lib/orchestrator/providers/ai.ts)
  ai_analysis_at: number | null;
  website_search_attempted_at: number | null;
  ai_attempted_at: number | null;
  contacts_scraped_at: number | null;
  contact_page_url: string | null; // admin-set page with the people (read first by ai.extractContacts)
  meeting_date: string | null; // «Bedriftsmøte» tab: YYYY-MM-DD
  meeting_prep: string | null; // notes before the meeting
  meeting_notes: string | null; // summary after the meeting
  meeting_during: string | null; // notes taken in the meeting
  meeting_location: string | null; // where (address, Teams, …)
  meeting_attendees: string | null; // who takes part, theirs and ours — free text
  news_checked_at: number | null;
  konsern_root_orgnr: string | null; // registered group's top parent (Brreg konsernstruktur)
  konsern_root_name: string | null;
  group_key: string | null; // shared by every company recomputeGroups() put in the same group; null = standalone
  group_basis: string | null; // JSON GroupBasis — why they were grouped (lib/groups.ts)
  tech_json: string | null; // JSON { technologies, itEnvironment, digitalProducts, checkedAt } from the website read
  lat: number | null;
  lon: number | null;
  geo_precision: string | null; // 'adresse' | 'postnummer' | 'skjult' (sole proprietorship — not placed, GDPR)
  geocoded_for: string | null; // the address the coordinates belong to; a new address triggers a new lookup
  discovered_at: number;
  last_refreshed_at: number | null;
  updated_at: number;
}

export interface Financial {
  id: number;
  company_id: number;
  year: number;
  currency: string | null;
  revenue: number | null;
  operating_result: number | null;
  pretax_result: number | null;
  profit: number | null;
  equity: number | null;
  total_assets: number | null;
  total_debt: number | null;
  fetched_at: number;
}

// Machine-sourced contacts, kept apart from the admin-typed Kontaktperson/
// CTO/Salgssjef fields on `companies` (which a human explicitly entered and a
// re-scan must never silently overwrite). `source` says where each row came
// from, and each source is replaced independently of the other:
//   'nettside' — scraped from the company's own site (lib/website.ts + ai.extractContacts)
//   'brreg'    — styreleder/styremedlemmer from the Brønnøysund roles register
export type ContactSource = 'nettside' | 'brreg';

export interface WebsiteContact {
  id: number;
  company_id: number;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  source: ContactSource;
  fetched_at: number;
}

export interface CompanyNewsRow {
  id: number;
  company_id: number;
  title: string;
  url: string;
  source: string | null;
  published_at: string | null; // YYYY-MM-DD
  summary: string | null;
  category: string;
  relevance: string | null;
  is_signal: number;
  question: string | null;
  fetched_at: number;
}

export interface CompanyScore {
  id: number;
  company_id: number;
  lead_score: number;
  size_score: number;
  revenue_score: number;
  growth_score: number;
  profitability_score: number;
  revenue_latest: number | null;
  revenue_prev: number | null;
  revenue_growth_pct: number | null;
  operating_result_latest: number | null;
  operating_margin_pct: number | null;
  latest_year: number | null;
  reason: string | null;
  computed_at: number;
}

export interface Scan {
  id: number;
  started_at: number;
  finished_at: number | null;
  companies_found: number;
  companies_updated: number;
  financials_fetched: number;
  errors: string | null;
  details: string | null; // JSON-encoded ScanDetails (lib/scan.ts); null on scans from before it existed
}

export interface CompanyWithScore extends Company {
  lead_score: number | null;
  size_score: number | null;
  revenue_score: number | null;
  growth_score: number | null;
  profitability_score: number | null;
  revenue_latest: number | null;
  revenue_prev: number | null;
  revenue_growth_pct: number | null;
  operating_result_latest: number | null;
  operating_margin_pct: number | null;
  latest_year: number | null;
  reason: string | null;
  computed_at: number | null;
}

// Local dev / scripts use an embedded SQLite file. Production points
// TURSO_DATABASE_URL / TURSO_AUTH_TOKEN at a hosted libSQL (Turso) database.
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'local.db');

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

function getClient(): Client {
  if (!client) {
    client = process.env.TURSO_DATABASE_URL
      ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
      : createClient({ url: `file:${DB_PATH}` });
  }
  return client;
}

// `CREATE TABLE IF NOT EXISTS` above only covers a brand-new database. For a
// `companies` table that already existed before these columns were added
// (any persistent local.db or Turso DB), add them one at a time and swallow
// the "duplicate column" error on a DB that already has them.
const CONTACT_COLUMNS = [
  'ceo_name TEXT',
  'ceo_changed_at INTEGER',
  'parent_orgnr TEXT',
  'parent_name TEXT',
  'contact_name TEXT',
  'contact_email TEXT',
  'contact_phone TEXT',
  'cto_name TEXT',
  'cto_email TEXT',
  'cto_phone TEXT',
  'sales_name TEXT',
  'sales_email TEXT',
  'sales_phone TEXT',
  'ai_summary TEXT',
  'ai_summary_at INTEGER',
  'ai_analysis TEXT',
  'ai_analysis_at INTEGER',
  'website_search_attempted_at INTEGER',
  'email TEXT',
  'ai_attempted_at INTEGER',
  'contacts_scraped_at INTEGER',
  'contact_page_url TEXT',
  'meeting_date TEXT',
  'meeting_prep TEXT',
  'meeting_notes TEXT',
  'meeting_location TEXT',
  'meeting_attendees TEXT',
  'meeting_during TEXT',
  'news_checked_at INTEGER',
  'konsern_root_orgnr TEXT',
  'konsern_root_name TEXT',
  'group_key TEXT',
  'group_basis TEXT',
  'tech_json TEXT',
  'lat REAL',
  'lon REAL',
  'geo_precision TEXT',
  'geocoded_for TEXT',
];

// Data fixes that must run exactly once per database, tracked in app_meta.
const ONCE_MIGRATIONS: { key: string; sql: string }[] = [
  {
    // The news parser used to choke on citation markers ("[1]") in
    // search-grounded answers and record "checked, nothing found". Re-queue
    // every company without stored news for a fresh search.
    key: '2026-09-25-news-parser-requeue',
    sql: `UPDATE companies SET news_checked_at = NULL
          WHERE news_checked_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM company_news n WHERE n.company_id = companies.id)`,
  },
  {
    // Analyses gained "industryChallenges" (Utfordringer i bransjen). Mark the
    // older ones as due so the AI queue redoes them; the old analysis stays
    // visible until the new one lands.
    key: '2026-09-25-industry-challenges-requeue',
    sql: `UPDATE companies SET ai_analysis_at = NULL
          WHERE ai_analysis IS NOT NULL AND ai_analysis NOT LIKE '%industryChallenges%'`,
  },
  {
    // Industry challenges gained "details" (shown when a card is clicked).
    // Re-queue analyses without it; the old one stays visible meanwhile.
    key: '2026-10-06-challenge-details-requeue',
    sql: `UPDATE companies SET ai_analysis_at = NULL
          WHERE ai_analysis LIKE '%industryChallenges%' AND ai_analysis NOT LIKE '%"details"%'`,
  },
  {
    // Sharper industry challenges (concrete rule/deadline/number in each).
    // Re-queue every analysis; the old one stays visible meanwhile.
    key: '2026-10-06-sharper-challenges-requeue',
    sql: `UPDATE companies SET ai_analysis_at = NULL WHERE ai_analysis IS NOT NULL`,
  },
  {
    // konsern_root_orgnr is new; companies with a registered parent need a
    // Brreg pass to fill it in, so mark them due for the next scan.
    key: '2026-09-28-konsern-root-refresh',
    sql: `UPDATE companies SET last_refreshed_at = NULL WHERE parent_orgnr IS NOT NULL`,
  },
  {
    // The contact crawler used to rank "About us" pages above /contacts and
    // never went a level deeper (wilsonship.no: people on
    // /contacts/office/bergen-headquarter). Re-read every site that gave no
    // named people; the AI analysis itself isn't redone if under 30 days.
    key: '2026-09-28-contacts-recrawl',
    sql: `UPDATE companies SET contacts_scraped_at = NULL
          WHERE website IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM company_contacts cc WHERE cc.company_id = companies.id AND cc.source = 'nettside')`,
  },
  {
    // Companies whose business address has moved out of the scan area
    // (Bergen) since discovery added them — hidden, not deleted. From here
    // on lib/scan.ts does the same after every Brreg pass.
    key: '2026-09-29-hide-outside-scope',
    sql: `UPDATE companies SET status = 'hidden'
          WHERE status = 'active' AND kommunenummer IS NOT NULL AND kommunenummer NOT IN ('4601')`,
  },
  {
    // The scan area grew from Bergen to the municipalities within about an
    // hour's drive — companies hidden above for being in one of them come back.
    key: '2026-09-29-unhide-bergen-region',
    sql: `UPDATE companies SET status = 'active'
          WHERE status = 'hidden'
            AND kommunenummer IN ('4626','4627','4624','4631','4630','4623','4628','4625')`,
  },
];

async function runOnceMigrations(): Promise<void> {
  const c = getClient();
  await c.execute('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)');
  for (const m of ONCE_MIGRATIONS) {
    const done = await c.execute({ sql: 'SELECT 1 FROM app_meta WHERE key = ?', args: [m.key] });
    if (done.rows.length) continue;
    await c.batch(
      [m.sql, { sql: 'INSERT INTO app_meta (key, value) VALUES (?, ?)', args: [m.key, String(Date.now())] }],
      'write',
    );
  }
}

async function addColumnsIfMissing(table: string, columns: string[]): Promise<void> {
  const c = getClient();
  for (const col of columns) {
    try {
      await c.execute(`ALTER TABLE ${table} ADD COLUMN ${col}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/duplicate column name/i.test(msg)) throw e;
    }
  }
}

const SCORE_COLUMNS = ['operating_result_latest REAL'];

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getClient()
      .executeMultiple(
        `
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orgnr TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        org_form TEXT,
        nace1_code TEXT, nace1_text TEXT,
        nace2_code TEXT, nace2_text TEXT,
        nace3_code TEXT, nace3_text TEXT,
        sector_code TEXT, sector_text TEXT,
        employees INTEGER,
        website TEXT,
        phone TEXT,
        address TEXT,
        postnummer TEXT,
        poststed TEXT,
        kommune TEXT,
        kommunenummer TEXT,
        registered_at TEXT,
        established_at TEXT,
        last_annual_report TEXT,
        in_mva INTEGER NOT NULL DEFAULT 0,
        bankrupt INTEGER NOT NULL DEFAULT 0,
        under_liquidation INTEGER NOT NULL DEFAULT 0,
        matched_code TEXT,
        matched_label TEXT,
        matched_group TEXT,
        manual_entry INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT,
        ceo_name TEXT,
        ceo_changed_at INTEGER,
        parent_orgnr TEXT,
        parent_name TEXT,
        contact_name TEXT, contact_email TEXT, contact_phone TEXT,
        cto_name TEXT, cto_email TEXT, cto_phone TEXT,
        sales_name TEXT, sales_email TEXT, sales_phone TEXT,
        ai_summary TEXT, ai_summary_at INTEGER,
        ai_analysis TEXT, ai_analysis_at INTEGER,
        website_search_attempted_at INTEGER,
        discovered_at INTEGER NOT NULL,
        last_refreshed_at INTEGER,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS financials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        year INTEGER NOT NULL,
        currency TEXT,
        revenue REAL,
        operating_result REAL,
        pretax_result REAL,
        profit REAL,
        equity REAL,
        total_assets REAL,
        total_debt REAL,
        fetched_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_financials_company_year ON financials(company_id, year);

      CREATE TABLE IF NOT EXISTS company_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        lead_score INTEGER NOT NULL,
        size_score INTEGER NOT NULL,
        revenue_score INTEGER NOT NULL,
        growth_score INTEGER NOT NULL,
        profitability_score INTEGER NOT NULL,
        revenue_latest REAL,
        revenue_prev REAL,
        revenue_growth_pct REAL,
        operating_result_latest REAL,
        operating_margin_pct REAL,
        latest_year INTEGER,
        reason TEXT,
        computed_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_scores_company_computed ON company_scores(company_id, computed_at);

      CREATE TABLE IF NOT EXISTS company_contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        role TEXT,
        email TEXT,
        phone TEXT,
        source TEXT NOT NULL DEFAULT 'nettside',
        fetched_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_contacts_company ON company_contacts(company_id);

      CREATE TABLE IF NOT EXISTS company_news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        source TEXT,
        published_at TEXT,
        summary TEXT,
        category TEXT NOT NULL DEFAULT 'annet',
        fetched_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_news_company_url ON company_news(company_id, url);

      CREATE TABLE IF NOT EXISTS job_ads (
        uuid TEXT PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        employer_orgnr TEXT,
        employer_name TEXT,
        title TEXT NOT NULL,
        job_title TEXT,
        occupation TEXT,
        location TEXT,
        published TEXT,
        expires TEXT,
        application_due TEXT,
        source_url TEXT NOT NULL,
        contacts TEXT,
        is_tech INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_job_ads_company ON job_ads(company_id, active);

      -- Brreg underenhet (a job ad's employer) → its company. parent NULL =
      -- not an underenhet. Cached: the same workplaces advertise over and over.
      CREATE TABLE IF NOT EXISTS underenheter (
        orgnr TEXT PRIMARY KEY,
        parent_orgnr TEXT,
        checked_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        orgnr TEXT NOT NULL,
        company_name TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        read_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

      CREATE TABLE IF NOT EXISTS scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        companies_found INTEGER NOT NULL DEFAULT 0,
        companies_updated INTEGER NOT NULL DEFAULT 0,
        financials_fetched INTEGER NOT NULL DEFAULT 0,
        errors TEXT,
        details TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        actor TEXT,
        action TEXT NOT NULL,
        target TEXT,
        detail TEXT,
        ip TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);

      CREATE TABLE IF NOT EXISTS rate_limits (
        bucket TEXT NOT NULL,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL,
        PRIMARY KEY (bucket, window_start)
      );
    `,
      )
      .then(() => addColumnsIfMissing('companies', CONTACT_COLUMNS))
      .then(() => addColumnsIfMissing('company_scores', SCORE_COLUMNS))
      .then(() => addColumnsIfMissing('company_contacts', ["source TEXT NOT NULL DEFAULT 'nettside'"]))
      .then(() => addColumnsIfMissing('scans', ['details TEXT']))
      .then(() => addColumnsIfMissing('company_news', ['relevance TEXT', 'is_signal INTEGER NOT NULL DEFAULT 0', 'question TEXT']))
      .then(() => runOnceMigrations())
      .then(() => ensureSeeded());
  }
  return schemaReady;
}

async function seedUserFromEnv(
  c: Client,
  u: { email?: string; hash?: string; password?: string; role: Role; name: string },
): Promise<void> {
  const email = u.email?.trim().toLowerCase();
  if (!email || (!u.hash && !u.password)) return;
  const existing = await c.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
  if (existing.rows[0]) return;
  const hash = u.hash ?? (await import('bcryptjs')).default.hashSync(u.password as string, 12);
  await c.execute({
    sql: `INSERT INTO users (email, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [email, hash, u.name, u.role, Date.now()],
  });
}

// First-run seed so a fresh database (including the ephemeral /tmp file on
// Vercel before Turso is wired up) is usable immediately: provisions the admin +
// guest accounts from env vars, and loads the committed company snapshot so the
// list is populated on the very first request. The nightly scan refreshes on top.
async function ensureSeeded(): Promise<void> {
  const c = getClient();
  try {
    await seedUserFromEnv(c, {
      email: process.env.ADMIN_EMAIL,
      hash: process.env.ADMIN_PASSWORD_HASH,
      password: process.env.ADMIN_PASSWORD,
      role: 'admin',
      name: 'Admin',
    });
    await seedUserFromEnv(c, {
      email: process.env.GUEST_EMAIL,
      hash: process.env.GUEST_PASSWORD_HASH,
      password: process.env.GUEST_PASSWORD,
      role: 'viewer',
      name: 'Guest',
    });

    const n = await c.execute('SELECT COUNT(*) AS n FROM companies');
    if (Number((n.rows[0] as unknown as { n: number }).n) === 0) {
      await loadSnapshot(c);
    }
  } catch {
    // Non-fatal — `npm run db:build` remains the reliable path.
  }
}

interface Snapshot {
  companies: {
    company: Record<string, unknown>;
    financials: CompanyFinancials[];
    score: {
      lead_score: number;
      size_score: number;
      revenue_score: number;
      growth_score: number;
      profitability_score: number;
      revenue_latest: number | null;
      revenue_prev: number | null;
      revenue_growth_pct: number | null;
      operating_result_latest?: number | null;
      operating_margin_pct: number | null;
      latest_year: number | null;
      reason: string | null;
    } | null;
  }[];
}

async function loadSnapshot(c: Client): Promise<void> {
  if (process.env.SKIP_SNAPSHOT === '1') return;
  let snapshot: Snapshot;
  try {
    snapshot = ((await import('../data/companies-snapshot.json')) as { default: Snapshot }).default;
  } catch {
    return;
  }
  const now = Date.now();
  for (const entry of snapshot.companies) {
    const co = entry.company as Record<string, unknown>;
    const cols = [
      'orgnr', 'name', 'org_form', 'nace1_code', 'nace1_text', 'nace2_code', 'nace2_text',
      'nace3_code', 'nace3_text', 'sector_code', 'sector_text', 'employees', 'website', 'phone', 'email',
      'address', 'postnummer', 'poststed', 'kommune', 'kommunenummer', 'registered_at',
      'established_at', 'last_annual_report', 'in_mva', 'bankrupt', 'under_liquidation',
      'matched_code', 'matched_label', 'matched_group', 'manual_entry', 'status', 'notes',
      'ceo_name', 'contact_name', 'contact_email', 'contact_phone',
      'cto_name', 'cto_email', 'cto_phone', 'sales_name', 'sales_email', 'sales_phone',
    ];
    await c.execute({
      sql: `INSERT INTO companies (${cols.join(', ')}, discovered_at, updated_at, last_refreshed_at)
            VALUES (${cols.map(() => '?').join(', ')}, ?, ?, ?)
            ON CONFLICT(orgnr) DO NOTHING`,
      args: [...cols.map((k) => (co[k] === undefined ? null : (co[k] as never))), now, now, now],
    });
    const row = await c.execute({ sql: 'SELECT id FROM companies WHERE orgnr = ?', args: [String(co.orgnr)] });
    const id = Number((row.rows[0] as unknown as { id: number })?.id);
    if (!id) continue;

    for (const f of entry.financials) {
      await c.execute({
        sql: `INSERT INTO financials (company_id, year, currency, revenue, operating_result, pretax_result, profit, equity, total_assets, total_debt, fetched_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(company_id, year) DO NOTHING`,
        args: [id, f.year, f.currency, f.revenue, f.operatingResult, f.pretaxResult, f.profit, f.equity, f.totalAssets, f.totalDebt, now],
      });
    }
    if (entry.score) {
      const s = entry.score;
      await c.execute({
        sql: `INSERT INTO company_scores (company_id, lead_score, size_score, revenue_score, growth_score, profitability_score, revenue_latest, revenue_prev, revenue_growth_pct, operating_result_latest, operating_margin_pct, latest_year, reason, computed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, s.lead_score, s.size_score, s.revenue_score, s.growth_score, s.profitability_score, s.revenue_latest, s.revenue_prev, s.revenue_growth_pct, s.operating_result_latest ?? null, s.operating_margin_pct, s.latest_year, s.reason, now],
      });
    }
  }
}

async function db(): Promise<Client> {
  await ensureSchema();
  return getClient();
}

function plain<T>(rows: unknown[]): T[] {
  return rows.map((r) => ({ ...(r as object) })) as T[];
}

// --- Users ---

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const c = await db();
  const res = await c.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email.toLowerCase()] });
  return res.rows[0] as unknown as User | undefined;
}

export async function getUserById(id: number): Promise<User | undefined> {
  const c = await db();
  const res = await c.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
  return res.rows[0] as unknown as User | undefined;
}

// --- Companies ---

const SCORE_JOIN = `
  LEFT JOIN company_scores sc ON sc.id = (
    SELECT id FROM company_scores WHERE company_id = co.id ORDER BY computed_at DESC, id DESC LIMIT 1
  )`;
const SCORE_COLS = `
  sc.lead_score, sc.size_score, sc.revenue_score, sc.growth_score, sc.profitability_score,
  sc.revenue_latest, sc.revenue_prev, sc.revenue_growth_pct, sc.operating_result_latest, sc.operating_margin_pct,
  sc.latest_year, sc.reason, sc.computed_at`;

// Cheap count for a UI subtitle — avoids pulling all 621 rows (with their
// full score join) just to read .length, as the admin page used to.
export async function countActiveCompanies(): Promise<number> {
  const c = await db();
  const res = await c.execute("SELECT COUNT(*) AS n FROM companies WHERE status = 'active'");
  return Number((res.rows[0] as unknown as { n: number }).n);
}

export interface DataCoverage {
  unit: CoverageUnit;
  total: number;
  withFinancials: number;
  withGrowth: number;
  withAiAnalysis: number;
  withWebsite: number;
  withWebsiteContacts: number;
  withCeo: number;
  withEmail: number;
  withBoard: number;
  withNews: number;
  newsSearched: number;
}

export const COVERAGE_CATEGORIES = [
  'financials',
  'growth',
  'ai',
  'website',
  'contacts',
  'ceo',
  'email',
  'board',
  'news',
] as const;
export type CoverageCategory = (typeof COVERAGE_CATEGORIES)[number];

export function isCoverageCategory(v: string): v is CoverageCategory {
  return (COVERAGE_CATEGORIES as readonly string[]).includes(v);
}

// Each value here is a fixed, hardcoded SQL fragment — `category` only ever
// selects which one by key (validated via isCoverageCategory before this is
// called), it's never interpolated into the query itself.
const COVERAGE_WHERE: Record<CoverageCategory, string> = {
  financials: 'EXISTS (SELECT 1 FROM financials f WHERE f.company_id = co.id)',
  growth: '(SELECT COUNT(DISTINCT year) FROM financials f WHERE f.company_id = co.id) >= 2',
  ai: 'co.ai_analysis IS NOT NULL',
  website: 'co.website IS NOT NULL',
  contacts: "EXISTS (SELECT 1 FROM company_contacts cc WHERE cc.company_id = co.id AND cc.source = 'nettside')",
  ceo: 'co.ceo_name IS NOT NULL',
  email: 'co.email IS NOT NULL',
  board: "EXISTS (SELECT 1 FROM company_contacts cc WHERE cc.company_id = co.id AND cc.source = 'brreg')",
  news: 'EXISTS (SELECT 1 FROM company_news n WHERE n.company_id = co.id)',
};

export type CoverageMode = 'har' | 'mangler';

export function isCoverageMode(v: string): v is CoverageMode {
  return v === 'har' || v === 'mangler';
}

// What one row of the coverage view counts: a customer (a konsern counted
// once — the way the company list shows it) or each legal company. A
// customer "has" something when ANY company in its group has it: 21
// shipowning shells without a website shouldn't drag coverage down when
// the operating company has one.
export type CoverageUnit = 'kunde' | 'selskap';

export function isCoverageUnit(v: string): v is CoverageUnit {
  return v === 'kunde' || v === 'selskap';
}

const UNIT_EXPR: Record<CoverageUnit, string> = {
  kunde: "COALESCE(co.group_key, 'c' || co.id)",
  selskap: "'c' || co.id",
};

// One query, not `listCompaniesWithScore()` + counting in JS — this is a
// dashboard tile that admin/page.tsx renders on every load.
export async function getDataCoverage(unit: CoverageUnit = 'kunde', topN: TopN = null): Promise<DataCoverage> {
  const c = await db();
  const u = UNIT_EXPR[unit];
  const count = (cond: string) => `COUNT(DISTINCT CASE WHEN ${cond} THEN ${u} END)`;
  const res = await c.execute(`
    SELECT
      COUNT(DISTINCT ${u}) AS total,
      ${count(COVERAGE_WHERE.financials)} AS with_financials,
      ${count(COVERAGE_WHERE.growth)} AS with_growth,
      ${count(COVERAGE_WHERE.ai)} AS with_ai_analysis,
      ${count(COVERAGE_WHERE.website)} AS with_website,
      ${count(COVERAGE_WHERE.contacts)} AS with_website_contacts,
      ${count(COVERAGE_WHERE.ceo)} AS with_ceo,
      ${count(COVERAGE_WHERE.email)} AS with_email,
      ${count(COVERAGE_WHERE.board)} AS with_board,
      ${count(COVERAGE_WHERE.news)} AS with_news,
      ${count('co.news_checked_at IS NOT NULL')} AS news_searched
    FROM companies co
    WHERE co.status = 'active' AND ${inTopUnits(topN)}
  `);
  const r = res.rows[0] as unknown as Record<string, number>;
  return {
    unit,
    total: Number(r.total),
    withFinancials: Number(r.with_financials),
    withGrowth: Number(r.with_growth),
    withAiAnalysis: Number(r.with_ai_analysis),
    withWebsite: Number(r.with_website),
    withWebsiteContacts: Number(r.with_website_contacts),
    withCeo: Number(r.with_ceo),
    withEmail: Number(r.with_email),
    withBoard: Number(r.with_board),
    withNews: Number(r.with_news),
    newsSearched: Number(r.news_searched),
  };
}

// The "Har" / "Mangler" drill-down. Per customer: one entry per unit, named
// after its operating company (most employees, then revenue, then score) —
// not a ship-owning shell that happens to score higher.
export async function listCompaniesForCoverage(
  category: CoverageCategory,
  mode: CoverageMode = 'har',
  unit: CoverageUnit = 'kunde',
  topN: TopN = null,
): Promise<{ orgnr: string; name: string; groupSize: number }[]> {
  const c = await db();
  const res = await c.execute(
    `SELECT ${UNIT_EXPR[unit]} AS unit, co.orgnr, co.name, co.employees, sc.revenue_latest, sc.lead_score,
            CASE WHEN ${COVERAGE_WHERE[category]} THEN 1 ELSE 0 END AS has
     FROM companies co ${SCORE_JOIN}
     WHERE co.status = 'active' AND ${inTopUnits(topN)}`,
  );
  type Row = {
    unit: string;
    orgnr: string;
    name: string;
    employees: number | null;
    revenue_latest: number | null;
    lead_score: number | null;
    has: number;
  };
  const units = new Map<string, Row[]>();
  for (const r of res.rows as unknown as Row[]) units.set(r.unit, [...(units.get(r.unit) ?? []), r]);
  const out: { orgnr: string; name: string; groupSize: number }[] = [];
  for (const members of units.values()) {
    const has = members.some((m) => Number(m.has) === 1);
    if (has !== (mode === 'har')) continue;
    const best = [...members].sort(
      (a, b) =>
        (b.employees ?? -1) - (a.employees ?? -1) ||
        (b.revenue_latest ?? -1) - (a.revenue_latest ?? -1) ||
        (b.lead_score ?? -1) - (a.lead_score ?? -1),
    )[0];
    out.push({ orgnr: best.orgnr, name: best.name, groupSize: members.length });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}

export async function listCompaniesWithScore(): Promise<CompanyWithScore[]> {
  const c = await db();
  const res = await c.execute(`
    SELECT co.*, ${SCORE_COLS}
    FROM companies co ${SCORE_JOIN}
    ORDER BY (sc.lead_score IS NULL) ASC, sc.lead_score DESC, co.name COLLATE NOCASE
  `);
  return plain<CompanyWithScore>(res.rows);
}

export async function getCompanyByOrgnr(orgnr: string): Promise<CompanyWithScore | undefined> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT co.*, ${SCORE_COLS} FROM companies co ${SCORE_JOIN} WHERE co.orgnr = ?`,
    args: [orgnr],
  });
  return res.rows[0] ? plain<CompanyWithScore>(res.rows)[0] : undefined;
}

export async function getCompany(id: number): Promise<Company | undefined> {
  const c = await db();
  const res = await c.execute({ sql: 'SELECT * FROM companies WHERE id = ?', args: [id] });
  return res.rows[0] as unknown as Company | undefined;
}

export async function listFinancials(companyId: number): Promise<Financial[]> {
  const c = await db();
  const res = await c.execute({
    sql: 'SELECT * FROM financials WHERE company_id = ? ORDER BY year DESC',
    args: [companyId],
  });
  return res.rows as unknown as Financial[];
}

export async function listWebsiteContacts(companyId: number, source?: ContactSource): Promise<WebsiteContact[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT * FROM company_contacts WHERE company_id = ?${source ? ' AND source = ?' : ''} ORDER BY id`,
    args: source ? [companyId, source] : [companyId],
  });
  return plain<WebsiteContact>(res.rows);
}

// Full delete+reinsert of one source's rows on every enrichment cycle, unlike
// replaceFinancials' per-year upsert — a team page / board reflects who's
// there *now*, not a history worth accumulating, so a departed contact should
// simply disappear. One batch (one round-trip, atomic) rather than a
// statement per contact.
export async function replaceContacts(
  companyId: number,
  source: ContactSource,
  contacts: { name: string; role: string | null; email: string | null; phone: string | null }[],
): Promise<void> {
  const c = await db();
  const now = Date.now();
  await c.batch(
    [
      { sql: 'DELETE FROM company_contacts WHERE company_id = ? AND source = ?', args: [companyId, source] },
      ...contacts.map((ct) => ({
        sql: 'INSERT INTO company_contacts (company_id, name, role, email, phone, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [companyId, ct.name, ct.role, ct.email, ct.phone, source, now],
      })),
    ],
    'write',
  );
}

// A short, human-readable log of what a scan run actually changed — surfaced
// via the header bell (app/NotificationsBell.tsx) so a salesperson can see
// "what's new" without diffing a company page themselves. `companyId` is
// nullable so a row survives even if the company is later deleted (unlikely,
// but the message/orgnr/name are denormalized specifically so it still reads
// fine on its own).
export interface Notification {
  id: number;
  company_id: number | null;
  orgnr: string;
  company_name: string;
  message: string;
  created_at: number;
  read_at: number | null;
}

export async function addNotification(companyId: number, orgnr: string, companyName: string, message: string): Promise<void> {
  const c = await db();
  await c.execute({
    sql: 'INSERT INTO notifications (company_id, orgnr, company_name, message, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [companyId, orgnr, companyName, message, Date.now()],
  });
}

export async function listRecentNotifications(limit = 15): Promise<Notification[]> {
  const c = await db();
  const res = await c.execute({
    sql: 'SELECT * FROM notifications ORDER BY created_at DESC, id DESC LIMIT ?',
    args: [limit],
  });
  return res.rows as unknown as Notification[];
}

export async function countUnreadNotifications(): Promise<number> {
  const c = await db();
  const res = await c.execute('SELECT COUNT(*) AS n FROM notifications WHERE read_at IS NULL');
  return Number((res.rows[0] as unknown as { n: number }).n);
}

export async function markAllNotificationsRead(): Promise<void> {
  const c = await db();
  await c.execute({ sql: 'UPDATE notifications SET read_at = ? WHERE read_at IS NULL', args: [Date.now()] });
}

export async function getScoreHistory(companyId: number, limit = 20): Promise<CompanyScore[]> {
  const c = await db();
  const res = await c.execute({
    sql: 'SELECT * FROM company_scores WHERE company_id = ? ORDER BY computed_at DESC LIMIT ?',
    args: [companyId, limit],
  });
  return res.rows as unknown as CompanyScore[];
}

export interface UpsertCompanyInput {
  orgnr: string;
  name: string;
  org_form?: string | null;
  nace?: { code: string; text: string }[];
  sector_code?: string | null;
  sector_text?: string | null;
  employees?: number | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  postnummer?: string | null;
  poststed?: string | null;
  kommune?: string | null;
  kommunenummer?: string | null;
  registered_at?: string | null;
  established_at?: string | null;
  last_annual_report?: string | null;
  in_mva?: boolean;
  bankrupt?: boolean;
  under_liquidation?: boolean;
  matched_code?: string | null;
  matched_label?: string | null;
  matched_group?: string | null;
  manual_entry?: boolean;
}

function upsertStatement(input: UpsertCompanyInput, now: number): InStatement {
  const nace = input.nace ?? [];
  const args = [
    input.orgnr,
    input.name.trim(),
    input.org_form ?? null,
    nace[0]?.code ?? null, nace[0]?.text ?? null,
    nace[1]?.code ?? null, nace[1]?.text ?? null,
    nace[2]?.code ?? null, nace[2]?.text ?? null,
    input.sector_code ?? null, input.sector_text ?? null,
    input.employees ?? null,
    input.website ?? null,
    input.phone ?? null,
    input.email ?? null,
    input.address ?? null,
    input.postnummer ?? null,
    input.poststed ?? null,
    input.kommune ?? null,
    input.kommunenummer ?? null,
    input.registered_at ?? null,
    input.established_at ?? null,
    input.last_annual_report ?? null,
    input.in_mva ? 1 : 0,
    input.bankrupt ? 1 : 0,
    input.under_liquidation ? 1 : 0,
    input.matched_code ?? null,
    input.matched_label ?? null,
    input.matched_group ?? null,
    input.manual_entry ? 1 : 0,
    now,
    now,
  ];
  return {
    sql: `INSERT INTO companies (
        orgnr, name, org_form, nace1_code, nace1_text, nace2_code, nace2_text, nace3_code, nace3_text,
        sector_code, sector_text, employees, website, phone, email, address, postnummer, poststed, kommune,
        kommunenummer, registered_at, established_at, last_annual_report, in_mva, bankrupt,
        under_liquidation, matched_code, matched_label, matched_group, manual_entry, discovered_at, updated_at
      ) VALUES (${args.map(() => '?').join(', ')})
      ON CONFLICT(orgnr) DO UPDATE SET
        name = excluded.name, org_form = excluded.org_form,
        nace1_code = excluded.nace1_code, nace1_text = excluded.nace1_text,
        nace2_code = excluded.nace2_code, nace2_text = excluded.nace2_text,
        nace3_code = excluded.nace3_code, nace3_text = excluded.nace3_text,
        sector_code = excluded.sector_code, sector_text = excluded.sector_text,
        employees = excluded.employees, website = COALESCE(excluded.website, companies.website),
        phone = COALESCE(excluded.phone, companies.phone), email = COALESCE(excluded.email, companies.email),
        address = excluded.address,
        postnummer = excluded.postnummer, poststed = excluded.poststed, kommune = excluded.kommune,
        kommunenummer = excluded.kommunenummer, registered_at = excluded.registered_at,
        established_at = excluded.established_at, last_annual_report = excluded.last_annual_report,
        in_mva = excluded.in_mva, bankrupt = excluded.bankrupt,
        under_liquidation = excluded.under_liquidation,
        matched_code = COALESCE(excluded.matched_code, companies.matched_code),
        matched_label = COALESCE(excluded.matched_label, companies.matched_label),
        matched_group = COALESCE(excluded.matched_group, companies.matched_group),
        updated_at = excluded.updated_at`,
    args,
  };
}

// Returns 1 for a fresh insert, 0 for an update of an existing company.
export async function upsertCompany(input: UpsertCompanyInput): Promise<number> {
  return upsertCompanies([input]);
}

// Discovery upserts all ~600 companies every time it runs — one execute()
// per company is one Turso round-trip each, which alone used to eat most of
// the scan's 60s budget. Chunked batches cut that to a handful of calls.
// Returns how many were fresh inserts.
export async function upsertCompanies(inputs: UpsertCompanyInput[]): Promise<number> {
  if (inputs.length === 0) return 0;
  const c = await db();
  const now = Date.now();
  const existing = new Set(
    (await c.execute('SELECT orgnr FROM companies')).rows.map((r) => String((r as unknown as { orgnr: string }).orgnr)),
  );
  for (let i = 0; i < inputs.length; i += 100) {
    await c.batch(
      inputs.slice(i, i + 100).map((input) => upsertStatement(input, now)),
      'write',
    );
  }
  return inputs.filter((input) => !existing.has(input.orgnr)).length;
}

export async function markCompanyRefreshed(orgnr: string): Promise<void> {
  const c = await db();
  await c.execute({ sql: 'UPDATE companies SET last_refreshed_at = ? WHERE orgnr = ?', args: [Date.now(), orgnr] });
}

export async function replaceFinancials(companyId: number, rows: CompanyFinancials[]): Promise<number> {
  const c = await db();
  const now = Date.now();
  let n = 0;
  for (const f of rows) {
    const res = await c.execute({
      sql: `INSERT INTO financials (company_id, year, currency, revenue, operating_result, pretax_result, profit, equity, total_assets, total_debt, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(company_id, year) DO UPDATE SET
              currency = excluded.currency, revenue = excluded.revenue,
              operating_result = excluded.operating_result, pretax_result = excluded.pretax_result,
              profit = excluded.profit, equity = excluded.equity, total_assets = excluded.total_assets,
              total_debt = excluded.total_debt, fetched_at = excluded.fetched_at`,
      args: [companyId, f.year, f.currency, f.revenue, f.operatingResult, f.pretaxResult, f.profit, f.equity, f.totalAssets, f.totalDebt, now],
    });
    n += res.rowsAffected;
  }
  return n;
}

export interface NewScoreInput {
  companyId: number;
  leadScore: number;
  sizeScore: number;
  revenueScore: number;
  growthScore: number;
  profitabilityScore: number;
  revenueLatest: number | null;
  revenuePrev: number | null;
  revenueGrowthPct: number | null;
  operatingResultLatest: number | null;
  operatingMarginPct: number | null;
  latestYear: number | null;
  reason: string;
}

export async function insertScore(s: NewScoreInput): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO company_scores (company_id, lead_score, size_score, revenue_score, growth_score, profitability_score, revenue_latest, revenue_prev, revenue_growth_pct, operating_result_latest, operating_margin_pct, latest_year, reason, computed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [s.companyId, s.leadScore, s.sizeScore, s.revenueScore, s.growthScore, s.profitabilityScore, s.revenueLatest, s.revenuePrev, s.revenueGrowthPct, s.operatingResultLatest, s.operatingMarginPct, s.latestYear, s.reason, Date.now()],
  });
}

export async function setCompanyStatus(id: number, status: CompanyStatus): Promise<void> {
  const c = await db();
  await c.execute({ sql: 'UPDATE companies SET status = ?, updated_at = ? WHERE id = ?', args: [status, Date.now(), id] });
}

export async function setCompanyNotes(id: number, notes: string | null): Promise<void> {
  const c = await db();
  await c.execute({ sql: 'UPDATE companies SET notes = ?, updated_at = ? WHERE id = ?', args: [notes, Date.now(), id] });
}

// Manual override for when Brønnøysund has no `hjemmeside` for a company —
// upsertCompany's COALESCE keeps this on future refreshes unless the
// register later reports a website of its own.
export async function setCompanyWebsite(id: number, website: string | null): Promise<void> {
  const c = await db();
  await c.execute({ sql: 'UPDATE companies SET website = ?, updated_at = ? WHERE id = ?', args: [website, Date.now(), id] });
}

// «Bedriftsmøte» tab on the company page: date, preparation notes and the
// summary afterwards. One meeting per company for now.
export async function setCompanyMeeting(
  id: number,
  m: { date: string | null; location: string | null; attendees: string | null; prep: string | null; during: string | null; notes: string | null },
): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `UPDATE companies SET meeting_date = ?, meeting_location = ?, meeting_attendees = ?, meeting_prep = ?,
            meeting_during = ?, meeting_notes = ?, updated_at = ? WHERE id = ?`,
    args: [m.date, m.location, m.attendees, m.prep, m.during, m.notes, Date.now(), id],
  });
}

// The company's own page that lists its people, set by an admin when the
// crawler doesn't find it (framo.com/contact). Saving it queues the company
// for a new contact read on the next AI run.
export async function setCompanyContactPage(id: number, url: string | null): Promise<void> {
  const c = await db();
  await c.execute({
    sql: 'UPDATE companies SET contact_page_url = ?, contacts_scraped_at = NULL, updated_at = ? WHERE id = ?',
    args: [url, Date.now(), id],
  });
}

// Auto-filled from Brønnøysund's roller API during enrichment (lib/scan.ts) —
// the one contact field that comes from an official source rather than admin entry.
// `ceoChanged` stamps `ceo_changed_at` so the UI can flag a leadership change as a
// sales trigger — a fresh decision-maker is often more open to a new pitch. Only
// set on an actual swap, never on the first-ever sighting of a name.
export async function setCompanyCeo(id: number, ceoName: string | null, ceoChanged = false): Promise<void> {
  const c = await db();
  if (ceoChanged) {
    await c.execute({
      sql: 'UPDATE companies SET ceo_name = ?, ceo_changed_at = ? WHERE id = ?',
      args: [ceoName, Date.now(), id],
    });
  } else {
    await c.execute({ sql: 'UPDATE companies SET ceo_name = ? WHERE id = ?', args: [ceoName, id] });
  }
}

// Auto-filled from Brønnøysund's konsernstruktur API during enrichment — null
// for the ~95% of companies with no corporate parent (a 404 upstream, not an
// error). Storing just the immediate parent (not the whole tree) keeps this
// cheap: sibling companies are found by matching on parent_orgnr at read time.
export async function setCompanyParent(
  id: number,
  parentOrgnr: string | null,
  parentName: string | null,
  rootOrgnr: string | null = null,
  rootName: string | null = null,
): Promise<void> {
  const c = await db();
  await c.execute({
    sql: 'UPDATE companies SET parent_orgnr = ?, parent_name = ?, konsern_root_orgnr = ?, konsern_root_name = ? WHERE id = ?',
    args: [parentOrgnr, parentName, rootOrgnr, rootName, id],
  });
}

// Other active companies in our own database that share the same corporate
// parent — the "you already have a foot in this door" list on a company page.
export async function listSiblingCompanies(parentOrgnr: string, excludeOrgnr: string): Promise<{ orgnr: string; name: string }[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT orgnr, name FROM companies WHERE parent_orgnr = ? AND orgnr != ? AND status = 'active' ORDER BY name COLLATE NOCASE`,
    args: [parentOrgnr, excludeOrgnr],
  });
  return res.rows as unknown as { orgnr: string; name: string }[];
}

// Generated by the `ai` orchestrator provider (Gemini) during enrichment —
// best-effort, so a failed/disabled provider just leaves the previous value.
// `analysisJson` is a JSON-encoded LeadAnalysis (lib/orchestrator/providers/ai.ts).
export async function setCompanyAiAnalysis(id: number, analysisJson: string): Promise<void> {
  const c = await db();
  await c.execute({
    sql: 'UPDATE companies SET ai_analysis = ?, ai_analysis_at = ? WHERE id = ?',
    args: [analysisJson, Date.now(), id],
  });
}

export async function listCompanyNews(companyId: number, limit = 6): Promise<CompanyNewsRow[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT * FROM company_news WHERE company_id = ?
          ORDER BY (published_at IS NULL), published_at DESC, fetched_at DESC LIMIT ?`,
    args: [companyId, limit],
  });
  return plain<CompanyNewsRow>(res.rows);
}

// Adds newly found articles (unique per company+url) and prunes ones older
// than ~18 months, keeping the 10 newest. Merges rather than replaces: a
// search that misses an article this month doesn't mean it stopped existing.
// Returns the articles that weren't stored before.
export async function mergeCompanyNews(
  companyId: number,
  items: {
    title: string;
    url: string;
    source: string;
    date: string | null;
    summary: string;
    category: string;
    relevance?: string | null;
    buyingSignal?: boolean;
    question?: string | null;
  }[],
): Promise<typeof items> {
  const c = await db();
  const now = Date.now();
  const existing = new Set(
    (await c.execute({ sql: 'SELECT url FROM company_news WHERE company_id = ?', args: [companyId] })).rows.map((r) =>
      String((r as unknown as { url: string }).url),
    ),
  );
  const fresh = items.filter((n) => !existing.has(n.url));
  const cutoff = new Date(now - 548 * 86_400_000).toISOString().slice(0, 10);
  await c.batch(
    [
      ...fresh.map((n) => ({
        sql: `INSERT OR IGNORE INTO company_news (company_id, title, url, source, published_at, summary, category,
                relevance, is_signal, question, fetched_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          companyId, n.title, n.url, n.source, n.date, n.summary, n.category,
          n.relevance ?? null, n.buyingSignal ? 1 : 0, n.question ?? null, now,
        ],
      })),
      { sql: 'DELETE FROM company_news WHERE company_id = ? AND published_at IS NOT NULL AND published_at < ?', args: [companyId, cutoff] },
      {
        sql: `DELETE FROM company_news WHERE company_id = ? AND id NOT IN (
                SELECT id FROM company_news WHERE company_id = ?
                ORDER BY (published_at IS NULL), published_at DESC, fetched_at DESC LIMIT 10)`,
        args: [companyId, companyId],
      },
      { sql: 'UPDATE companies SET news_checked_at = ? WHERE id = ?', args: [now, companyId] },
    ],
    'write',
  );
  return fresh;
}

// --- Small key/value store (app_meta) ---
export async function getMeta(key: string): Promise<string | null> {
  const c = await db();
  const r = await c.execute({ sql: 'SELECT value FROM app_meta WHERE key = ?', args: [key] });
  return (r.rows[0] as unknown as { value: string } | undefined)?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const c = await db();
  await c.execute({
    sql: 'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    args: [key, value],
  });
}

// --- Job ads (NAV) ---
export interface JobAdRow {
  uuid: string;
  company_id: number;
  employer_name: string | null;
  title: string;
  occupation: string | null;
  location: string | null;
  published: string | null;
  expires: string | null;
  application_due: string | null;
  source_url: string;
  contacts: string | null; // JSON JobAd['contacts']
  is_tech: number;
  active: number;
}

/** Active companies by orgnr, plus the distinctive name words used to pre-filter the feed. */
export async function listCompanyOrgnrIndex(): Promise<{
  byOrgnr: Map<string, number>;
  byId: Map<number, { orgnr: string; name: string }>;
  names: string[];
}> {
  const c = await db();
  const res = await c.execute("SELECT id, orgnr, name FROM companies WHERE status = 'active'");
  const rows = res.rows as unknown as { id: number; orgnr: string; name: string }[];
  return {
    byOrgnr: new Map(rows.map((r) => [r.orgnr, Number(r.id)])),
    byId: new Map(rows.map((r) => [Number(r.id), { orgnr: r.orgnr, name: r.name }])),
    names: rows.map((r) => r.name),
  };
}

export async function getCachedUnderenhetParent(orgnr: string): Promise<{ known: boolean; parent: string | null }> {
  const c = await db();
  const r = await c.execute({ sql: 'SELECT parent_orgnr FROM underenheter WHERE orgnr = ?', args: [orgnr] });
  const row = r.rows[0] as unknown as { parent_orgnr: string | null } | undefined;
  return row ? { known: true, parent: row.parent_orgnr } : { known: false, parent: null };
}

export async function cacheUnderenhetParent(orgnr: string, parent: string | null): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO underenheter (orgnr, parent_orgnr, checked_at) VALUES (?, ?, ?)
          ON CONFLICT(orgnr) DO UPDATE SET parent_orgnr = excluded.parent_orgnr, checked_at = excluded.checked_at`,
    args: [orgnr, parent, Date.now()],
  });
}

/** Returns true when the ad is new to us (for the scan log / notifications). */
export async function upsertJobAd(companyId: number, ad: JobAd): Promise<boolean> {
  const c = await db();
  const before = await c.execute({ sql: 'SELECT 1 FROM job_ads WHERE uuid = ?', args: [ad.uuid] });
  await c.execute({
    sql: `INSERT INTO job_ads (uuid, company_id, employer_orgnr, employer_name, title, job_title, occupation, location,
            published, expires, application_due, source_url, contacts, is_tech, active, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
          ON CONFLICT(uuid) DO UPDATE SET company_id = excluded.company_id, title = excluded.title,
            job_title = excluded.job_title, occupation = excluded.occupation, location = excluded.location,
            published = excluded.published, expires = excluded.expires, application_due = excluded.application_due,
            contacts = excluded.contacts, is_tech = excluded.is_tech, active = 1, updated_at = excluded.updated_at`,
    args: [
      ad.uuid, companyId, ad.employerOrgnr, ad.employerName, ad.title, ad.jobTitle, ad.occupation, ad.location,
      ad.published, ad.expires, ad.applicationDue, ad.sourceUrl, JSON.stringify(ad.contacts), ad.isTech ? 1 : 0, Date.now(),
    ],
  });
  return before.rows.length === 0;
}

/** NAV marks stopped/expired ads INACTIVE; their terms require we stop showing them. */
export async function deactivateJobAds(uuids: string[]): Promise<number> {
  if (!uuids.length) return 0;
  const c = await db();
  let n = 0;
  for (let i = 0; i < uuids.length; i += 200) {
    const chunk = uuids.slice(i, i + 200);
    const r = await c.execute({
      sql: `UPDATE job_ads SET active = 0, contacts = NULL, updated_at = ? WHERE active = 1 AND uuid IN (${chunk.map(() => '?').join(',')})`,
      args: [Date.now(), ...chunk],
    });
    n += r.rowsAffected;
  }
  // Also retire anything past its own expiry date the feed never told us about.
  await c.execute({
    sql: "UPDATE job_ads SET active = 0, contacts = NULL WHERE active = 1 AND expires IS NOT NULL AND expires < ?",
    args: [new Date().toISOString().slice(0, 10)],
  });
  return n;
}

export async function listJobAds(companyIds: number[], activeOnly = true): Promise<JobAdRow[]> {
  if (!companyIds.length) return [];
  const c = await db();
  const res = await c.execute({
    sql: `SELECT * FROM job_ads WHERE company_id IN (${companyIds.map(() => '?').join(',')})
          ${activeOnly ? 'AND active = 1' : ''}
          ORDER BY active DESC, COALESCE(published, '') DESC LIMIT 40`,
    args: companyIds,
  });
  return plain<JobAdRow>(res.rows);
}

// --- Company groups (konsern) ---
// Recomputed from scratch over all active companies — cheap (one pass over
// ~600 rows) and it means a link that disappears (a sold subsidiary) also
// drops the grouping. See lib/groups.ts for the rules.
export async function recomputeGroups(): Promise<number> {
  const c = await db();
  const [cos, people] = await Promise.all([
    c.execute(`SELECT orgnr, name, website, email, ceo_name, parent_orgnr, konsern_root_orgnr, konsern_root_name
               FROM companies WHERE status = 'active'`),
    c.execute(`SELECT co.orgnr, cc.name FROM company_contacts cc JOIN companies co ON co.id = cc.company_id
               WHERE cc.source = 'brreg' AND co.status = 'active'`),
  ]);
  const board = new Map<string, string[]>();
  for (const r of people.rows as unknown as { orgnr: string; name: string }[]) {
    board.set(r.orgnr, [...(board.get(r.orgnr) ?? []), r.name]);
  }
  type Row = {
    orgnr: string; name: string; website: string | null; email: string | null; ceo_name: string | null;
    parent_orgnr: string | null; konsern_root_orgnr: string | null; konsern_root_name: string | null;
  };
  const rows = cos.rows as unknown as Row[];
  const groups = computeGroups(
    rows.map((r) => ({
      orgnr: r.orgnr,
      name: r.name,
      website: r.website,
      email: r.email,
      ceoName: r.ceo_name,
      parentOrgnr: r.parent_orgnr,
      rootOrgnr: r.konsern_root_orgnr,
      rootName: r.konsern_root_name,
      people: board.get(r.orgnr) ?? [],
    })),
  );
  const statements = rows.map((r) => {
    const g = groups.get(r.orgnr);
    return {
      sql: 'UPDATE companies SET group_key = ?, group_basis = ? WHERE orgnr = ?',
      args: [g?.key ?? null, g ? JSON.stringify(g.basis) : null, r.orgnr],
    };
  });
  for (let i = 0; i < statements.length; i += 200) await c.batch(statements.slice(i, i + 200), 'write');
  await c.execute({
    sql: 'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    args: ['groups_computed_at', String(Date.now())],
  });
  return new Set([...groups.values()].map((g) => g.key)).size;
}

// For page loads: recompute only if it's never been done or is over a day
// old (the nightly scan normally does it), so a
// fresh deploy shows groups without waiting for the next scan.
export async function ensureGroupsFresh(maxAgeMs = 26 * 3600_000): Promise<void> {
  const c = await db();
  const r = await c.execute({ sql: 'SELECT value FROM app_meta WHERE key = ?', args: ['groups_computed_at'] });
  const at = Number((r.rows[0] as unknown as { value: string } | undefined)?.value ?? 0);
  if (Date.now() - at > maxAgeMs) await recomputeGroups();
}

export interface GroupMember {
  id: number;
  orgnr: string;
  name: string;
  lead_score: number | null;
  revenue_latest: number | null;
  employees: number | null;
}

export async function listGroupMembers(groupKey: string): Promise<GroupMember[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT co.id, co.orgnr, co.name, co.employees, sc.lead_score, sc.revenue_latest
          FROM companies co ${SCORE_JOIN}
          WHERE co.group_key = ? AND co.status = 'active'
          ORDER BY COALESCE(sc.lead_score, -1) DESC, COALESCE(sc.revenue_latest, 0) DESC`,
    args: [groupKey],
  });
  return plain<GroupMember>(res.rows);
}

export async function setCompanyGeo(
  id: number,
  geo: { lat: number | null; lon: number | null; precision: string | null; forAddress: string },
): Promise<void> {
  const c = await db();
  await c.execute({
    sql: 'UPDATE companies SET lat = ?, lon = ?, geo_precision = ?, geocoded_for = ? WHERE id = ?',
    args: [geo.lat, geo.lon, geo.precision, geo.forAddress, id],
  });
}

export async function setCompanyTech(id: number, tech: unknown): Promise<void> {
  const c = await db();
  await c.execute({ sql: 'UPDATE companies SET tech_json = ? WHERE id = ?', args: [JSON.stringify(tech), id] });
}

export async function setContactsScraped(id: number): Promise<void> {
  const c = await db();
  await c.execute({ sql: 'UPDATE companies SET contacts_scraped_at = ? WHERE id = ?', args: [Date.now(), id] });
}

export async function setAiAttempted(id: number): Promise<void> {
  const c = await db();
  await c.execute({ sql: 'UPDATE companies SET ai_attempted_at = ? WHERE id = ?', args: [Date.now(), id] });
}

// Marks that we've already run the paid Google Search-grounded website
// lookup (ai.findWebsite) for this company, whether or not it found one —
// so it runs at most once per company ever, not on every refresh.
export async function setWebsiteSearchAttempted(id: number): Promise<void> {
  const c = await db();
  await c.execute({
    sql: 'UPDATE companies SET website_search_attempted_at = ? WHERE id = ?',
    args: [Date.now(), id],
  });
}

export interface CompanyContactsInput {
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  cto_name: string | null;
  cto_email: string | null;
  cto_phone: string | null;
  sales_name: string | null;
  sales_email: string | null;
  sales_phone: string | null;
}

// Admin-curated — Brønnøysund has no CTO/sales-manager role, so these are
// filled in by hand (same pattern as `notes`).
export async function setCompanyContacts(id: number, input: CompanyContactsInput): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `UPDATE companies SET
            contact_name = ?, contact_email = ?, contact_phone = ?,
            cto_name = ?, cto_email = ?, cto_phone = ?,
            sales_name = ?, sales_email = ?, sales_phone = ?,
            updated_at = ?
          WHERE id = ?`,
    args: [
      input.contact_name, input.contact_email, input.contact_phone,
      input.cto_name, input.cto_email, input.cto_phone,
      input.sales_name, input.sales_email, input.sales_phone,
      Date.now(), id,
    ],
  });
}

export async function deleteCompany(id: number): Promise<void> {
  const c = await db();
  await c.execute({ sql: 'DELETE FROM companies WHERE id = ?', args: [id] });
}

// Daily discovery (lib/scan.ts discover()) refreshes `last_annual_report`
// (the year Brønnøysund has on file) for every company, regardless of the
// enrichment batch size below — so we already know which companies have a
// newer filing than what's in `financials` before spending a slot on them.
// Those go first; everyone else falls back to oldest-refreshed-first, so a
// small nightly batch still cycles through the whole list over a few weeks
// instead of wasting slots re-fetching accounts that haven't changed.
//
// Only companies that are actually *due* are returned: never refreshed, a
// newer filing on record, or not re-checked in `staleDays`. When nothing is
// due the Brreg pass is empty and the AI pass gets the whole run budget.
export async function listCompaniesToRefresh(limit: number, staleDays = 3): Promise<CompanyWithScore[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT co.*, ${SCORE_COLS} FROM companies co ${SCORE_JOIN}
          LEFT JOIN (SELECT company_id, MAX(year) AS max_year FROM financials GROUP BY company_id) f
            ON f.company_id = co.id
          WHERE co.status = 'active' AND (
            co.last_refreshed_at IS NULL OR co.last_refreshed_at < ?
            OR (co.last_annual_report IS NOT NULL AND CAST(co.last_annual_report AS INTEGER) > COALESCE(f.max_year, 0))
          )
          ORDER BY
            (co.last_annual_report IS NOT NULL AND CAST(co.last_annual_report AS INTEGER) > COALESCE(f.max_year, 0)) DESC,
            (co.last_refreshed_at IS NOT NULL), co.last_refreshed_at ASC, co.name COLLATE NOCASE
          LIMIT ?`,
    args: [Date.now() - staleDays * 86_400_000, limit],
  });
  return plain<CompanyWithScore>(res.rows);
}

// Companies not re-checked in Brreg within `staleDays` — what «Oppdater alt»
// counts down. Deliberately not the full "due" condition above: a company
// whose newer filing Brreg lists but the regnskap API doesn't serve yet stays
// "due" after every check, so that count may never reach zero.
export async function countBrregStale(staleDays = 3): Promise<number> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT COUNT(*) AS n FROM companies
          WHERE status = 'active' AND (last_refreshed_at IS NULL OR last_refreshed_at < ?)`,
    args: [Date.now() - staleDays * 86_400_000],
  });
  return Number((res.rows[0] as unknown as { n: number }).n);
}

// A website we've never successfully read for contacts (and that has none
// stored — rows from before contacts_scraped_at existed count as read).
// A contact page set by an admin always counts (it's set to be read).
// Second half: a site read before the company profile existed (2026-10-07)
// is read once more for it.
const NEEDS_CONTACT_SCRAPE = `(((co.website IS NOT NULL OR co.contact_page_url IS NOT NULL) AND co.contacts_scraped_at IS NULL
  AND (co.contact_page_url IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM company_contacts cc WHERE cc.company_id = co.id AND cc.source = 'nettside')))
  OR (co.website IS NOT NULL AND (co.tech_json IS NULL OR co.tech_json NOT LIKE '%"profile"%')))`;
// News is re-searched every NEWS_REFRESH_DAYS (Google Search-grounded, billed
// per search — 5,000/month free across Gemini 3.x).
export const NEWS_REFRESH_DAYS = 30;
// Paid web searches (news, finding a website) only for companies with at
// least this lead score — a search costs ~10× the analysis itself, and small
// low-score companies rarely have news. lib/scan.ts applies the same limit.
export const SEARCH_MIN_SCORE = 40;
const LATEST_SCORE = `(SELECT lead_score FROM company_scores WHERE company_id = co.id ORDER BY computed_at DESC, id DESC LIMIT 1)`;
const NEWS_DUE = `(COALESCE(${LATEST_SCORE}, 0) >= ${SEARCH_MIN_SCORE} AND (co.news_checked_at IS NULL
  OR co.news_checked_at < CAST(strftime('%s', 'now') AS INTEGER) * 1000 - ${NEWS_REFRESH_DAYS} * 86400000))`;
// «Topp N» filter (admin Datakvalitet + AI queue): the N best customers by
// lead score, a konsern counted once (same unit as the coverage «kunde» view)
// and ranked by its best-scoring member. null = everyone.
export const AI_TOP_N = 50; // nightly AI queue
export const TOP_CHOICES = [50, 100, 200, 500] as const;
export type TopN = (typeof TOP_CHOICES)[number] | null;
export function parseTopN(raw: string | undefined): TopN {
  if (raw === 'alle') return null;
  const n = Number(raw);
  return (TOP_CHOICES as readonly number[]).includes(n) ? (n as TopN) : AI_TOP_N;
}
const RANKED_UNITS = (topN: number) => `SELECT orgnr, gk FROM (
    SELECT c2.orgnr, COALESCE(c2.group_key, 'c' || c2.id) AS gk,
      ROW_NUMBER() OVER (PARTITION BY COALESCE(c2.group_key, 'c' || c2.id)
        ORDER BY COALESCE((SELECT lead_score FROM company_scores WHERE company_id = c2.id ORDER BY computed_at DESC, id DESC LIMIT 1), -1) DESC, c2.id) AS rn,
      COALESCE((SELECT lead_score FROM company_scores WHERE company_id = c2.id ORDER BY computed_at DESC, id DESC LIMIT 1), -1) AS s
    FROM companies c2 WHERE c2.status = 'active'
  ) WHERE rn = 1 ORDER BY s DESC LIMIT ${Math.max(1, Math.floor(topN))}`;
// AI work goes to each top customer's best-scoring company.
const aiEligible = (topN: TopN) => (topN ? `co.orgnr IN (SELECT orgnr FROM (${RANKED_UNITS(topN)}))` : '1 = 1');
// Coverage counts every company of a top customer.
const inTopUnits = (topN: TopN) =>
  topN ? `COALESCE(co.group_key, 'c' || co.id) IN (SELECT gk FROM (${RANKED_UNITS(topN)}))` : '1 = 1';
const AI_PENDING = `(co.ai_analysis_at IS NULL OR ${NEEDS_CONTACT_SCRAPE} OR ${NEWS_DUE})`;

// The AI pass (ai.analyze / findWebsite / extractContacts) is the slow,
// paid part of enrichment — a handful of companies per run at most — so it
// gets its own queue instead of riding along with the Brreg rotation.
// Pending companies first (never analyzed, or a website never read for
// contacts — e.g. one just derived from the email domain), best lead score
// first within that; then everyone else by oldest analysis. Within each
// group the *attempt* time orders the rotation, so a company Gemini keeps
// failing on moves back behind the others instead of blocking the head of
// the queue every run. Among pending ones, those that need an actual
// analysis (none, or older than 30 days) go before news/contacts-only work —
// the analysis is the main value, and the only step that can fall back to
// the free Gemini key when the paid one is capped.
export async function listCompaniesForAi(limit: number, topN: TopN = AI_TOP_N): Promise<CompanyWithScore[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT co.*, ${SCORE_COLS} FROM companies co ${SCORE_JOIN}
          WHERE co.status = 'active' AND ${aiEligible(topN)}
          ORDER BY (NOT ${AI_PENDING}),
            (co.ai_analysis_at IS NOT NULL AND co.ai_analysis_at > ${Date.now() - 30 * 86_400_000}),
            COALESCE(co.ai_attempted_at, co.ai_analysis_at, 0) ASC,
            COALESCE(sc.lead_score, -1) DESC
          LIMIT ?`,
    args: [limit],
  });
  return plain<CompanyWithScore>(res.rows);
}

// What "Kjør AI-køen" counts down: no AI analysis yet, or a website we've
// never read for contacts. Only a success takes a company off the count,
// not a failed attempt.
export async function countAiPending(topN: TopN = AI_TOP_N): Promise<number> {
  const c = await db();
  const res = await c.execute(`SELECT COUNT(*) AS n FROM companies co WHERE co.status = 'active' AND ${aiEligible(topN)} AND ${AI_PENDING}`);
  return Number((res.rows[0] as unknown as { n: number }).n);
}

// --- Scans ---

export interface AiProgress {
  analyses: number;
  newsSearched: number;
  contactsRead: number;
  websiteSearched: number;
}

// What the AI pass has saved since `since` (ms) — polled every few seconds
// by the admin's «AI-vurdering» run so its boxes move during a run, not just
// when each ≤60 s server run returns.
export async function getAiProgressSince(since: number): Promise<AiProgress> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT
            COUNT(CASE WHEN ai_analysis_at >= ? THEN 1 END) AS analyses,
            COUNT(CASE WHEN news_checked_at >= ? THEN 1 END) AS news,
            COUNT(CASE WHEN contacts_scraped_at >= ? THEN 1 END) AS contacts,
            COUNT(CASE WHEN website_search_attempted_at >= ? THEN 1 END) AS websites
          FROM companies`,
    args: [since, since, since, since],
  });
  const r = res.rows[0] as unknown as Record<string, number>;
  return {
    analyses: Number(r.analyses),
    newsSearched: Number(r.news),
    contactsRead: Number(r.contacts),
    websiteSearched: Number(r.websites),
  };
}

// Hides active companies registered outside the scan area (a move out of
// Bergen after discovery). Status 'hidden', so nothing is deleted.
export async function hideOutsideScope(kommunenummer: string[]): Promise<number> {
  if (kommunenummer.length === 0) return 0;
  const c = await db();
  const res = await c.execute({
    sql: `UPDATE companies SET status = 'hidden'
          WHERE status = 'active' AND kommunenummer IS NOT NULL
            AND kommunenummer NOT IN (${kommunenummer.map(() => '?').join(',')})`,
    args: kommunenummer,
  });
  return res.rowsAffected;
}

// Names for the orgnrs in a scan's error list (the errors store only orgnr).
export async function getCompanyNames(orgnrs: string[]): Promise<Record<string, string>> {
  if (orgnrs.length === 0) return {};
  const c = await db();
  const res = await c.execute({
    sql: `SELECT orgnr, name FROM companies WHERE orgnr IN (${orgnrs.map(() => '?').join(',')})`,
    args: orgnrs,
  });
  return Object.fromEntries((res.rows as unknown as { orgnr: string; name: string }[]).map((r) => [r.orgnr, r.name]));
}

export async function startScan(): Promise<number> {
  const c = await db();
  const res = await c.execute({ sql: 'INSERT INTO scans (started_at) VALUES (?)', args: [Date.now()] });
  return Number(res.lastInsertRowid);
}

export async function finishScan(
  id: number,
  data: {
    companiesFound: number;
    companiesUpdated: number;
    financialsFetched: number;
    errors: { scope: string; message: string }[];
    details: unknown;
  },
): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `UPDATE scans SET finished_at = ?, companies_found = ?, companies_updated = ?, financials_fetched = ?, errors = ?, details = ? WHERE id = ?`,
    args: [
      Date.now(),
      data.companiesFound,
      data.companiesUpdated,
      data.financialsFetched,
      JSON.stringify(data.errors),
      JSON.stringify(data.details),
      id,
    ],
  });
}

// `kind` splits the admin views: the nightly cron runs vs. everything
// started by hand (buttons, AI queue, and old rows without details).
export async function listScans(limit = 20, kind?: 'nattlig' | 'manuell'): Promise<Scan[]> {
  const c = await db();
  const isCron = `json_extract(details, '$.trigger') = 'cron'`;
  const where = kind === 'nattlig' ? `WHERE ${isCron}` : kind === 'manuell' ? `WHERE NOT COALESCE(${isCron}, 0)` : '';
  const res = await c.execute({ sql: `SELECT * FROM scans ${where} ORDER BY started_at DESC LIMIT ?`, args: [limit] });
  return res.rows as unknown as Scan[];
}

// --- Audit log ---

export interface AuditEntry {
  id: number;
  at: number;
  actor: string | null;
  action: string;
  target: string | null;
  detail: string | null;
  ip: string | null;
}

export async function insertAudit(e: {
  actor?: string | null;
  action: string;
  target?: string | null;
  detail?: string | null;
  ip?: string | null;
}): Promise<void> {
  try {
    const c = await db();
    await c.execute({
      sql: 'INSERT INTO audit_log (at, actor, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)',
      args: [Date.now(), e.actor ?? null, e.action, e.target ?? null, e.detail ?? null, e.ip ?? null],
    });
  } catch {
    /* never let auditing break the request it's recording */
  }
}

export async function listAudit(limit = 50, range?: { from: number; to: number }): Promise<AuditEntry[]> {
  const c = await db();
  const res = range
    ? await c.execute({
        sql: 'SELECT * FROM audit_log WHERE at >= ? AND at < ? ORDER BY at DESC LIMIT ?',
        args: [range.from, range.to, limit],
      })
    : await c.execute({ sql: 'SELECT * FROM audit_log ORDER BY at DESC LIMIT ?', args: [limit] });
  return res.rows as unknown as AuditEntry[];
}

// --- Durable rate limiting (Turso-backed) ---

export async function rateLimitHitDb(bucket: string, limit: number, windowMs: number): Promise<boolean> {
  const c = await db();
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  await c.execute({
    sql: `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)
          ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1`,
    args: [bucket, windowStart],
  });
  const res = await c.execute({
    sql: 'SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?',
    args: [bucket, windowStart],
  });
  const count = Number((res.rows[0] as unknown as { count: number }).count);
  if (Math.random() < 0.02) {
    await c.execute({ sql: 'DELETE FROM rate_limits WHERE window_start < ?', args: [windowStart - windowMs * 4] });
  }
  return count > limit;
}
