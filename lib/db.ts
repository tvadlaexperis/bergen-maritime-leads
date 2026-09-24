import { createClient, type Client, type InStatement } from '@libsql/client';
import path from 'path';
import type { Role, CompanyStatus, CompanyFinancials } from './types';

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
];

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
  total: number;
  withFinancials: number;
  withGrowth: number;
  withAiAnalysis: number;
  withWebsite: number;
  withWebsiteContacts: number;
  withCeo: number;
  withEmail: number;
  withBoard: number;
}

// One query, not `listCompaniesWithScore()` + counting in JS — this is a
// dashboard tile that admin/page.tsx renders on every load, so it should
// cost roughly what countActiveCompanies() already costs, not a full
// 621-row-with-joins fetch just to read a handful of coverage numbers.
export async function getDataCoverage(): Promise<DataCoverage> {
  const c = await db();
  const res = await c.execute(`
    SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN EXISTS (SELECT 1 FROM financials f WHERE f.company_id = co.id) THEN 1 END) AS with_financials,
      COUNT(CASE WHEN (SELECT COUNT(DISTINCT year) FROM financials f WHERE f.company_id = co.id) >= 2 THEN 1 END) AS with_growth,
      COUNT(CASE WHEN co.ai_analysis IS NOT NULL THEN 1 END) AS with_ai_analysis,
      COUNT(CASE WHEN co.website IS NOT NULL THEN 1 END) AS with_website,
      COUNT(CASE WHEN EXISTS (SELECT 1 FROM company_contacts cc WHERE cc.company_id = co.id AND cc.source = 'nettside') THEN 1 END) AS with_website_contacts,
      COUNT(CASE WHEN co.ceo_name IS NOT NULL THEN 1 END) AS with_ceo,
      COUNT(CASE WHEN co.email IS NOT NULL THEN 1 END) AS with_email,
      COUNT(CASE WHEN EXISTS (SELECT 1 FROM company_contacts cc WHERE cc.company_id = co.id AND cc.source = 'brreg') THEN 1 END) AS with_board
    FROM companies co
    WHERE co.status = 'active'
  `);
  const r = res.rows[0] as unknown as Record<string, number>;
  return {
    total: Number(r.total),
    withFinancials: Number(r.with_financials),
    withGrowth: Number(r.with_growth),
    withAiAnalysis: Number(r.with_ai_analysis),
    withWebsite: Number(r.with_website),
    withWebsiteContacts: Number(r.with_website_contacts),
    withCeo: Number(r.with_ceo),
    withEmail: Number(r.with_email),
    withBoard: Number(r.with_board),
  };
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
};

export type CoverageMode = 'har' | 'mangler';

export function isCoverageMode(v: string): v is CoverageMode {
  return v === 'har' || v === 'mangler';
}

export async function listCompaniesForCoverage(
  category: CoverageCategory,
  mode: CoverageMode = 'har',
): Promise<{ orgnr: string; name: string }[]> {
  const c = await db();
  // Parens around the whole fragment matter — e.g. growth's fragment is a
  // numeric subquery compared with >= 2; NOT must wrap the full comparison,
  // not just the subquery, or it'd coerce the count to a boolean first.
  const where = mode === 'har' ? COVERAGE_WHERE[category] : `NOT (${COVERAGE_WHERE[category]})`;
  const res = await c.execute(
    `SELECT orgnr, name FROM companies co WHERE co.status = 'active' AND ${where} ORDER BY name COLLATE NOCASE`,
  );
  return res.rows as unknown as { orgnr: string; name: string }[];
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
export async function setCompanyParent(id: number, parentOrgnr: string | null, parentName: string | null): Promise<void> {
  const c = await db();
  await c.execute({
    sql: 'UPDATE companies SET parent_orgnr = ?, parent_name = ? WHERE id = ?',
    args: [parentOrgnr, parentName, id],
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

// The AI pass (ai.analyze / findWebsite / extractContacts) is the slow,
// paid part of enrichment — a handful of companies per run at most — so it
// gets its own queue instead of riding along with the Brreg rotation: never-
// analyzed companies first — never-attempted before previously-failed, best
// lead score first within that — then the oldest analysis. The sales team
// sees the top of the list covered first. Within each group the *attempt*
// time orders the rotation, so a company Gemini keeps failing on moves back
// behind the others instead of blocking the head of the queue every run.
export async function listCompaniesForAi(limit: number): Promise<CompanyWithScore[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT co.*, ${SCORE_COLS} FROM companies co ${SCORE_JOIN}
          WHERE co.status = 'active'
          ORDER BY (co.ai_analysis_at IS NOT NULL), COALESCE(co.ai_attempted_at, co.ai_analysis_at, 0) ASC,
            COALESCE(sc.lead_score, -1) DESC
          LIMIT ?`,
    args: [limit],
  });
  return plain<CompanyWithScore>(res.rows);
}

// Companies with no AI analysis yet — what "Kjør AI-køen" counts down. Only
// a successful analysis takes a company off this count, not a failed attempt.
export async function countAiPending(): Promise<number> {
  const c = await db();
  const res = await c.execute("SELECT COUNT(*) AS n FROM companies WHERE status = 'active' AND ai_analysis_at IS NULL");
  return Number((res.rows[0] as unknown as { n: number }).n);
}

export interface Freshness {
  total: number;
  brregWeek: number;
  brregMonth: number;
  brregNever: number;
  aiMonth: number;
  aiNever: number;
}

// How current the data is, for the admin Skann panel — the "Datadekning"
// view answers *whether* we have something, this answers *how old* it is.
export async function getFreshness(): Promise<Freshness> {
  const c = await db();
  const now = Date.now();
  const week = now - 7 * 86_400_000;
  const month = now - 30 * 86_400_000;
  const res = await c.execute({
    sql: `SELECT
            COUNT(*) AS total,
            COUNT(CASE WHEN last_refreshed_at >= ? THEN 1 END) AS brreg_week,
            COUNT(CASE WHEN last_refreshed_at >= ? THEN 1 END) AS brreg_month,
            COUNT(CASE WHEN last_refreshed_at IS NULL THEN 1 END) AS brreg_never,
            COUNT(CASE WHEN ai_analysis_at >= ? THEN 1 END) AS ai_month,
            COUNT(CASE WHEN ai_analysis_at IS NULL THEN 1 END) AS ai_never
          FROM companies WHERE status = 'active'`,
    args: [week, month, month],
  });
  const r = res.rows[0] as unknown as Record<string, number>;
  return {
    total: Number(r.total),
    brregWeek: Number(r.brreg_week),
    brregMonth: Number(r.brreg_month),
    brregNever: Number(r.brreg_never),
    aiMonth: Number(r.ai_month),
    aiNever: Number(r.ai_never),
  };
}

// --- Scans ---

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

export async function listScans(limit = 20): Promise<Scan[]> {
  const c = await db();
  const res = await c.execute({ sql: 'SELECT * FROM scans ORDER BY started_at DESC LIMIT ?', args: [limit] });
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
