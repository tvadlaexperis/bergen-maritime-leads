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
- **Daglig leder + styre** — auto-filled from `data.brreg.no/enhetsregisteret/api/enheter/{orgnr}/roller`
  in the Brreg pass (`brregPass()` in `lib/scan.ts`). Daglig leder goes to `companies.ceo_name`;
  styreleder/nestleder/styremedlemmer go to `company_contacts` with `source = 'brreg'`
  (varamedlemmer, revisor, regnskapsfører skipped). Only names are read; birth dates in the
  roller payload are deliberately not stored. `lib/brreg.ts#parseRoller`.
- **Firma-e-post** — Enhetsregisteret's `epostadresse` → `companies.email`, read by the Brreg
  pass (`getEnhet`, alongside regnskap/roller/konsern) and discovery. Shown on the Sentralbord row.
  Brreg only has it for ~1 in 5 companies.
- **Nettside fra e-postdomene** — no website on record + a non-free-mail email domain
  (`websiteFromEmail`) → the site is fetched and stored only if it mentions the company
  (`siteMentionsCompany`: org.nr, full name, or a distinctive name word). Rejects a manager's /
  parent's domain (post@obos.no on a boat-harbour co-op). Free; ~22 extra sites locally.
- **Kontakter fra nettside** — `ai.extractContacts` reads the homepage + up to 4 subpages
  (`contactPageCandidates`: best menu links, www-tolerant, topped up with /kontakt, /om-oss,
  /ansatte …); `contacts_scraped_at` records a completed read. A website never read puts the
  company back in the AI queue (`AI_PENDING` in `lib/db.ts`); its analysis is only redone if
  older than 30 days;
  `company_contacts` with `source = 'nettside'`. Each source is replaced independently
  (`replaceContacts(companyId, source, rows)`); an empty scrape never wipes a non-empty list.
- **LinkedIn** — search *links* only (`lib/brreg.ts#linkedin*`): a person search next to each
  named contact, plus company / IT-leder / HR searches. No API calls or scraping — LinkedIn has
  no open people API and its ToS forbids automated access; the salesperson clicks through in
  their own logged-in session / Sales Navigator.
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
   Upserts are batched (`upsertCompanies()`, 100 per Turso round-trip).
2. **Brreg pass** (free, fast) — only companies that are *due* (never refreshed, newer
   filing on record, or not checked in 3 days; `full` = everyone), staleness-ordered
   (`listCompaniesToRefresh`, capped by `SCAN_BATCH`, default 150). Nothing due → skipped,
   and the AI pass gets the whole budget. 6 companies in parallel, until 30 s into the
   run (50 s if AI is off): regnskap + roller + konsern in parallel, then `score.compute`.
   Measured locally: all 615 companies in 26 s.
3. **AI pass** (Gemini, slow) — its own queue (`listCompaniesForAi`: never-attempted
   first, highest lead score first, then oldest `ai_attempted_at`), up to `SCAN_AI_BATCH`
   (default 12) companies in waves of 6. Admin «Kjør AI-køen» (`RunAiQueueButton` →
   `runAiQueueAction`) calls AI-only runs back to back from the browser until no
   never-attempted company is left, stopping after two runs with zero successful analyses.
   Cost (Gemini 3.6 Flash, Sept 2026): ~10k in / ~2k out tokens per company ≈ $0.015, and
   `findWebsite` search grounding stays inside the 5,000 free searches/month. Per company, `ai.analyze` runs alongside
   `ai.findWebsite` → `ai.extractContacts`; every call's timeout is clipped to the run's
   hard stop at 54 s so the function always finishes and writes its `scans` row.
   Previously all of this ran sequentially per company inside the Brreg loop, which made
   chunks outlive the 60 s limit — contacts and most Brreg data never got written.
4. `scans.details` (JSON, `ScanDetails` in `lib/scan.ts`) records per-step counts and a
   per-company list of what changed; admin → Skann shows it (click a row).
5. Admin → Logg filters by period (I dag / I går / 7 / 30 dager / Alle), Bergen-midnight
   boundaries (`osloDayStart` in `app/format.ts`).
6. Cron: discovery on Mondays (or `?discovery=1`), passes 2–3 every night. Admin "Kjør
   skann" = passes 2–3; "Full oppdatering" = discovery + passes 2–3.

## Deploy state
- **LIVE:** https://bergen-maritime-leads.vercel.app — Vercel project
  `torvad/bergen-maritime-leads`. Deploy: `npx vercel deploy --prod`.
- Prod env set: `SESSION_SECRET`, `CRON_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`,
  `GUEST_EMAIL`, `GUEST_PASSWORD_HASH`, `SCAN_BATCH=700`, `DB_PATH=/tmp/bml.db`
  (Vercel's `/var/task` is read-only — the libSQL file **must** live in `/tmp`).
- Nightly cron 05:00 UTC → `/api/cron/scan` (Brreg pass + AI pass; discovery on Mondays).
- First deploy 2026-09-07 with a committed 614-company snapshot from a local full scan.
- **Open item — Turso.** Prod DB is an ephemeral `/tmp` file until
  `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` are set. The committed
  `data/companies-snapshot.json` keeps the list populated on cold instances; without
  Turso, new scans + the audit log don't persist or share across instances.
- **Open item — SSO.** Auth is a shared admin password + optional guest link. Auth.js
  (Google/Entra) is the intended upgrade.
