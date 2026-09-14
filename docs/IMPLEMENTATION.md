# Implementation — as built

Started 2026-09-07. Cloned from `../ship-predictions-app` (git-tracked files only),
then the domain was replaced: shipyards + news scoring → Bergen maritime companies +
registry data + lead scoring.

## What carried over unchanged
`lib/auth.ts`, `lib/theme.ts`, `lib/rateLimit.ts`, `lib/audit.ts`, `lib/http/safeFetch.ts`,
`middleware.ts` (CSP + route gating), `lib/orchestrator/index.ts`, the `fx` provider,
`app/globals.css`, `ThemeToggle`, `LogoutButton`, login page + `/api/auth/*`,
the guest magic-link flow, `scripts/hash-password.mjs`, `scripts/create-user.mjs`.

## What is new
| Area | File(s) |
| --- | --- |
| Scan universe (kommune × NACE) | `data/maritime-sectors.mjs` (+ `.d.ts`) |
| Registry parsing (pure) | `lib/brreg.ts` |
| Lead score (pure) | `lib/score.ts` |
| DB schema + queries | `lib/db.ts` — tables `companies`, `financials`, `company_scores`, `scans`, `users`, `audit_log`, `rate_limits` |
| Scan engine | `lib/scan.ts` |
| Providers | `lib/orchestrator/providers/brreg.ts`, `…/score.ts`, `…/news.ts` |
| Pages | `app/page.tsx` + `CompanyList.tsx`, `app/company/[orgnr]/`, `app/dashboard/`, `app/admin/`, `app/favoritter/` |
| Cron | `app/api/cron/scan/route.ts` (Vercel cron 05:00 UTC) |
| Scripts | `scripts/build-db.mjs`, `scripts/scan-local.mjs`, `scripts/export-snapshot.mjs` |
| Tests | `lib/score.test.ts`, `lib/brreg.test.ts`, `lib/http/safeFetch.test.ts`, `lib/orchestrator/providers/fx.test.ts`, `…/news.test.ts` |

### Company page: contacts + news
- **Daglig leder** — auto-filled from `data.brreg.no/enhetsregisteret/api/enheter/{orgnr}/roller`
  during enrichment (`enrichCompany()` in `lib/scan.ts`, alongside the regnskap fetch). Only the name
  is read; birth dates in the roller payload are deliberately not stored.
  `lib/brreg.ts#parseDagligLeder`.
- **Kontaktperson / CTO / Salgssjef** — not in any public registry, so these are admin-entered
  free text (name/e-post/telefon) via `AdminControls` → `updateContactsAction` →
  `setCompanyContacts()`. Same pattern as the existing `notes` field.
- **Nyheter** — `lib/orchestrator/providers/news.ts` queries the GDELT DOC 2.0 API
  (`api.gdeltproject.org`, free, keyless) for the company name, 6h `revalidate` cache
  (GDELT rate-limits to ~1 req/5s). `SKIP_NEWS=1` hides the section entirely.
- Both are best-effort like every other provider: a failed/rate-limited news fetch or missing
  roller data degrades to an empty section, never an error.

## Data flow
1. **Discovery** — for each kommune × NACE prefix, page through
   `data.brreg.no/enhetsregisteret/api/enheter`. The register's NACE filter is fuzzy,
   so results are re-filtered with `matchNace()`. Bankrupt entities are dropped.
   Each hit is upserted into `companies`.
2. **Enrichment** — for a rotating batch (oldest `last_refreshed_at` first, size
   `SCAN_BATCH`, default 40 / 20 in prod), fetch
   `data.brreg.no/regnskapsregisteret/regnskap/{orgnr}`, upsert `financials`, then
   `score.compute` → insert a `company_scores` row.
3. The nightly cron does step 1 + a step-2 batch. `?full=1` enriches everything.
   Admin "Kjør skann" / "Full oppdatering" call the same `runScan()`.

## Deploy state
- **LIVE:** https://bergen-maritime-leads.vercel.app — Vercel project
  `torvad/bergen-maritime-leads`. Deploy: `npx vercel deploy --prod`.
- Prod env set: `SESSION_SECRET`, `CRON_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`,
  `GUEST_EMAIL`, `GUEST_PASSWORD_HASH`, `SCAN_BATCH=18`, `DB_PATH=/tmp/bml.db`
  (Vercel's `/var/task` is read-only — the libSQL file **must** live in `/tmp`).
- Nightly cron 05:00 UTC → `/api/cron/scan` (discovery + 18-company enrichment batch).
  Verified from Vercel: enrichment 5 companies / 2.6 s / 0 errors.
- First deploy 2026-09-07 with a committed 614-company snapshot from a local full scan.
- **Open item — Turso.** Prod DB is an ephemeral `/tmp` file until
  `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` are set. The committed
  `data/companies-snapshot.json` keeps the list populated on cold instances; without
  Turso, new scans + the audit log don't persist or share across instances.
- **Open item — SSO.** Auth is a shared admin password + optional guest link. Auth.js
  (Google/Entra) is the intended upgrade.
