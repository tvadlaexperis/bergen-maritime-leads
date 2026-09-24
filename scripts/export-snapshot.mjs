// Dumps the current local.db companies + financials + latest score to
// data/companies-snapshot.json. lib/db.ts ensureSeeded() and build-db.mjs load
// this into any empty database, so a fresh deployment (incl. the ephemeral /tmp
// DB on Vercel before Turso is wired up) shows real data immediately.
//
//   npm run dev  (then, in another terminal)  npm run scan:local -- --full
//   npm run db:snapshot

import { createClient } from '@libsql/client';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'local.db');
const OUT = path.join(__dirname, '..', 'data', 'companies-snapshot.json');

const db = createClient({ url: `file:${DB_PATH}` });

const COMPANY_COLS = [
  'orgnr', 'name', 'org_form', 'nace1_code', 'nace1_text', 'nace2_code', 'nace2_text',
  'nace3_code', 'nace3_text', 'sector_code', 'sector_text', 'employees', 'website', 'phone', 'email',
  'address', 'postnummer', 'poststed', 'kommune', 'kommunenummer', 'registered_at',
  'established_at', 'last_annual_report', 'in_mva', 'bankrupt', 'under_liquidation',
  'matched_code', 'matched_label', 'matched_group', 'manual_entry', 'status', 'notes',
  'ceo_name', 'contact_name', 'contact_email', 'contact_phone',
  'cto_name', 'cto_email', 'cto_phone', 'sales_name', 'sales_email', 'sales_phone',
];

const companies = (await db.execute('SELECT * FROM companies ORDER BY name COLLATE NOCASE')).rows;
const out = [];

for (const co of companies) {
  const company = Object.fromEntries(COMPANY_COLS.map((k) => [k, co[k] ?? null]));

  const financials = (
    await db.execute({ sql: 'SELECT * FROM financials WHERE company_id = ? ORDER BY year DESC', args: [co.id] })
  ).rows.map((f) => ({
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

  const score = (
    await db.execute({ sql: 'SELECT * FROM company_scores WHERE company_id = ? ORDER BY computed_at DESC LIMIT 1', args: [co.id] })
  ).rows[0];

  out.push({
    company,
    financials,
    score: score
      ? {
          lead_score: score.lead_score,
          size_score: score.size_score,
          revenue_score: score.revenue_score,
          growth_score: score.growth_score,
          profitability_score: score.profitability_score,
          revenue_latest: score.revenue_latest,
          revenue_prev: score.revenue_prev,
          revenue_growth_pct: score.revenue_growth_pct,
          operating_margin_pct: score.operating_margin_pct,
          latest_year: score.latest_year,
          reason: score.reason,
        }
      : null,
  });
}

writeFileSync(OUT, JSON.stringify({ generatedAt: Date.now(), companies: out }, null, 1));
const fin = out.reduce((n, c) => n + c.financials.length, 0);
console.log(`Wrote ${OUT}: ${out.length} companies, ${fin} financial rows.`);
