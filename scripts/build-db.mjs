// Creates the schema and seeds the admin + guest users. Idempotent.
//
// Local:      node scripts/build-db.mjs
// Production: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/build-db.mjs
//
// Companies come from a scan (scripts/scan-local.mjs or the /api/cron/scan
// endpoint), or from data/companies-snapshot.json which is loaded here and by
// lib/db.ts ensureSeeded() into any empty database.

import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'local.db');

function getClient() {
  return process.env.TURSO_DATABASE_URL
    ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
    : createClient({ url: `file:${DB_PATH}` });
}

const SCHEMA = `
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
    website TEXT, phone TEXT,
    address TEXT, postnummer TEXT, poststed TEXT,
    kommune TEXT, kommunenummer TEXT,
    registered_at TEXT, established_at TEXT, last_annual_report TEXT,
    in_mva INTEGER NOT NULL DEFAULT 0,
    bankrupt INTEGER NOT NULL DEFAULT 0,
    under_liquidation INTEGER NOT NULL DEFAULT 0,
    matched_code TEXT, matched_label TEXT, matched_group TEXT,
    manual_entry INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    ceo_name TEXT,
    contact_name TEXT, contact_email TEXT, contact_phone TEXT,
    cto_name TEXT, cto_email TEXT, cto_phone TEXT,
    sales_name TEXT, sales_email TEXT, sales_phone TEXT,
    discovered_at INTEGER NOT NULL,
    last_refreshed_at INTEGER,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS financials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    currency TEXT,
    revenue REAL, operating_result REAL, pretax_result REAL, profit REAL,
    equity REAL, total_assets REAL, total_debt REAL,
    fetched_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_financials_company_year ON financials(company_id, year);

  CREATE TABLE IF NOT EXISTS company_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    lead_score INTEGER NOT NULL,
    size_score INTEGER NOT NULL, revenue_score INTEGER NOT NULL,
    growth_score INTEGER NOT NULL, profitability_score INTEGER NOT NULL,
    revenue_latest REAL, revenue_prev REAL, revenue_growth_pct REAL, operating_margin_pct REAL,
    latest_year INTEGER, reason TEXT,
    computed_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scores_company_computed ON company_scores(company_id, computed_at);

  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    companies_found INTEGER NOT NULL DEFAULT 0,
    companies_updated INTEGER NOT NULL DEFAULT 0,
    financials_fetched INTEGER NOT NULL DEFAULT 0,
    errors TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    actor TEXT, action TEXT NOT NULL, target TEXT, detail TEXT, ip TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);

  CREATE TABLE IF NOT EXISTS rate_limits (
    bucket TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (bucket, window_start)
  );
`;

async function seedUser(db, { email, hash, password, role, name, defaultEmail, defaultPassword }) {
  const addr = (email || defaultEmail || '').toLowerCase();
  if (!addr) return;
  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [addr] });
  if (existing.rows[0]) {
    console.log(`${name} already exists: ${addr}`);
    return;
  }
  let pwHash = hash;
  let note = `Seeded ${name.toLowerCase()}`;
  if (!pwHash) {
    const pw = password || defaultPassword;
    if (!pw) return;
    pwHash = bcrypt.hashSync(pw, 12);
    if (!password) note = `Seeded ${name.toLowerCase()}: ${addr} / ${pw}  (DEV ONLY)`;
  }
  await db.execute({
    sql: `INSERT INTO users (email, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [addr, pwHash, name, role, Date.now()],
  });
  console.log(`${note}: ${addr}`);
}

async function loadSnapshot(db) {
  if (process.env.SKIP_SNAPSHOT === '1') return;
  let snapshot;
  try {
    snapshot = JSON.parse(readFileSync(new URL('../data/companies-snapshot.json', import.meta.url), 'utf8'));
  } catch {
    console.log('Snapshot: none committed — skipping.');
    return;
  }
  const existing = await db.execute('SELECT COUNT(*) AS n FROM companies');
  if (Number(existing.rows[0].n) > 0) {
    console.log('Snapshot: skipped (companies already populated).');
    return;
  }
  const now = Date.now();
  const cols = [
    'orgnr', 'name', 'org_form', 'nace1_code', 'nace1_text', 'nace2_code', 'nace2_text',
    'nace3_code', 'nace3_text', 'sector_code', 'sector_text', 'employees', 'website', 'phone',
    'address', 'postnummer', 'poststed', 'kommune', 'kommunenummer', 'registered_at',
    'established_at', 'last_annual_report', 'in_mva', 'bankrupt', 'under_liquidation',
    'matched_code', 'matched_label', 'matched_group', 'manual_entry', 'status', 'notes',
    'ceo_name', 'contact_name', 'contact_email', 'contact_phone',
    'cto_name', 'cto_email', 'cto_phone', 'sales_name', 'sales_email', 'sales_phone',
  ];
  let n = 0;
  for (const entry of snapshot.companies) {
    const co = entry.company;
    await db.execute({
      sql: `INSERT INTO companies (${cols.join(',')}, discovered_at, updated_at, last_refreshed_at)
            VALUES (${cols.map(() => '?').join(',')}, ?, ?, ?) ON CONFLICT(orgnr) DO NOTHING`,
      args: [...cols.map((k) => (co[k] === undefined ? null : co[k])), now, now, now],
    });
    const id = Number((await db.execute({ sql: 'SELECT id FROM companies WHERE orgnr = ?', args: [String(co.orgnr)] })).rows[0]?.id);
    if (!id) continue;
    n++;
    for (const f of entry.financials ?? []) {
      await db.execute({
        sql: `INSERT INTO financials (company_id, year, currency, revenue, operating_result, pretax_result, profit, equity, total_assets, total_debt, fetched_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(company_id, year) DO NOTHING`,
        args: [id, f.year, f.currency, f.revenue, f.operatingResult, f.pretaxResult, f.profit, f.equity, f.totalAssets, f.totalDebt, now],
      });
    }
    if (entry.score) {
      const s = entry.score;
      await db.execute({
        sql: `INSERT INTO company_scores (company_id, lead_score, size_score, revenue_score, growth_score, profitability_score, revenue_latest, revenue_prev, revenue_growth_pct, operating_margin_pct, latest_year, reason, computed_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [id, s.lead_score, s.size_score, s.revenue_score, s.growth_score, s.profitability_score, s.revenue_latest, s.revenue_prev, s.revenue_growth_pct, s.operating_margin_pct, s.latest_year, s.reason, now],
      });
    }
  }
  console.log(`Snapshot: loaded ${n} companies.`);
}

async function main() {
  const db = getClient();
  await db.executeMultiple(SCHEMA);
  await seedUser(db, {
    email: process.env.ADMIN_EMAIL, hash: process.env.ADMIN_PASSWORD_HASH, password: process.env.ADMIN_PASSWORD,
    role: 'admin', name: 'Admin', defaultEmail: 'admin@example.com', defaultPassword: 'changeme123',
  });
  await seedUser(db, {
    email: process.env.GUEST_EMAIL, hash: process.env.GUEST_PASSWORD_HASH, password: process.env.GUEST_PASSWORD,
    role: 'viewer', name: 'Guest',
  });
  await loadSnapshot(db);
  console.log('Database ready at', process.env.TURSO_DATABASE_URL || DB_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
