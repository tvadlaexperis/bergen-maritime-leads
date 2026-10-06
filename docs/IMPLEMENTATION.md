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
- **Contact crawl** — people pages (kontakt, contact, team, ansatte, ledelse, management …) outrank
  «about us» pages; history/privacy/investor/news/careers are never read. Up to 4 pages from the
  homepage, then up to 4 one level deeper (office/department pages, head office/management/Bergen
  first) — wilsonship.no keeps its people on /contacts/office/bergen-headquarter. The deepest pages
  go first in the 40k-character text sent to Gemini; up to 30 people per site.
- **LinkedIn** — search *links* only (`lib/brreg.ts#linkedin*`): a person search next to each
  named contact, plus company / IT-leder / HR searches. No API calls or scraping — LinkedIn has
  no open people API and its ToS forbids automated access; the salesperson clicks through in
  their own logged-in session / Sales Navigator.
- **Kontaktperson / CTO / Salgssjef** — not in any public registry, so these are admin-entered
  free text (name/e-post/telefon) via `AdminControls` → `updateContactsAction` →
  `setCompanyContacts()`. Same pattern as the existing `notes` field.
- **Nyheter (primær)** — `ai.findNews` in the AI pass: Google Search-grounded Gemini call for
  articles from the last 12 months (kontrakt / oppkjøp / investering / ansettelse / ledelse /
  resultat / nybygg / annet, with a one-sentence summary). `lib/companyNews.ts#parseNewsAnswer`
  validates the JSON; every link is fetched (final URL kept after redirects, dropped on 404/410/DNS
  failure, kept on bot walls). Merged into `company_news` (unique per company+url, pruned to 10 /
  18 months), `news_checked_at` refreshed every 30 days (`NEWS_REFRESH_DAYS`, part of
  `AI_PENDING`). Runs *before* `ai.analyze` so buying signals can use it; recent concrete
  articles go to the notification bell. ~1–3 searches per company per month, inside the 5,000
  free/month.
- **Nyheter — parsing:** search-grounded answers carry citation markers ("[1]") around the JSON;
  `findJsonArray` tries every `[`…`]` span instead of first-to-last (which silently returned
  nothing and left news at ~1 %). An answer with no list at all is now a visible scan error.
  The prompt also gets the everyday name and the group name to search with.
- **Utfordringer i bransjen** — `industryChallenges` in the AI analysis: 2–4 segment-level
  challenges (general industry knowledge, explicitly excepted from the "facts only" rule and
  labelled as such in the UI), each with why it can open a conversation. Shown at the bottom
  of «Tilrådd inngang».
- **Konsern (company groups)** — `lib/groups.ts#computeGroups` (pure, tested) links companies by
  (1) the register: same Brreg konsern top parent (`konsern_root_orgnr`, from `parseKonsernstruktur`)
  or parent; (2) the same own web/email domain when the domain contains a distinctive word of both
  names (stops a manager's domain like obos.no merging strangers); (3) shared people — same daglig
  leder + a shared name word, 2 shared people + a word, or 3 regardless. Needed because Brreg's
  konsernstruktur misses many small shipowner families (Misje Rederi/Ecobulk: 404). Stored as
  `group_key` + `group_basis` by `recomputeGroups()` after every scan/refresh (and on a list load
  if over a day old). The list shows one row per group (toggle «Slå sammen konsern»); the company
  page shows the group panel labelled registrert / delvis registrert / sannsynlig, and pulls in the
  other members' website contacts and news. Locally: 615 companies → 360 rows, 70 groups.
- **Rekruttering (NAV)** — `lib/orchestrator/providers/nav.ts` reads NAV's vacancy feed
  (pam-stilling-feed.nav.no) forward from a cursor in `app_meta` (a feed page id; the
  "modified since" query is used only on the very first run, 14 days back, because NAV sometimes
  takes 25 s+ to answer it). Each line is pre-filtered (`lib/jobAds.ts#isCandidate`: in our
  municipalities, or the employer's first distinctive name word matches one of ours), the ad is
  fetched, and its employer — an **underenhet** — is mapped to our company via Brreg
  `/underenheter/{orgnr}` (cached in `underenheter`). Stored in `job_ads`; INACTIVE/expired ads
  are retired (NAV's terms). Shown in «Rekruttering» on the company page (IT roles flagged, whole
  group), contact persons join the contact cards, and the AI analysis gets the active ads as
  buying-signal input. Access: `NAV_FEED_TOKEN` (personal token after a written agreement with
  NAV); `NAV_FEED_USE_PUBLIC_TOKEN=1` is for local testing only. **Limitation found:** the open
  feed does not carry ads imported from external recruitment systems — 35 days of feed had no
  Odfjell ad although arbeidsplassen.no listed three — so coverage of larger employers is partial.
- **Teknologi og kunderelevans** — the website read (`ai.extractContacts`, same call as the
  contacts — no extra cost) also returns technologies explicitly named on the site, plus
  "eget IT-miljø" / "egne digitale produkter" (ja/nei/ukjent). `verifyWebsiteInsights` drops
  anything whose quote isn't in the text we sent or whose source isn't a page we read (spec §3:
  no technology without a source). Stored in `companies.tech_json`. The AI analysis gets it and
  returns `customerCategory` (spec §4: svært aktuell … konkurrent) + `categoryReason`; SaaS isn't
  excluded, consultancy/staffing firms are flagged as possible competitors.
- **Nyheter — commercial reading (spec §7)** — the news search also returns, per article,
  `relevance` (betydning for Experis), `buyingSignal` and `question`; stored on `company_news`
  and shown on the card, labelled "AI-vurdering", apart from the article's own facts.
- New fields fill in as the nightly rotation reaches each company — nothing was re-queued, so
  these additions cost nothing beyond a few extra output tokens per existing call.
- **Kart** — `/kart` (Leaflet, Kartverket grey-tone tiles; CSP img-src allows cache.kartverket.no).
  Coordinates from Kartverket's address API (`lib/orchestrator/providers/geo.ts`), looked up in the
  Brreg pass only when the address changes (`geocoded_for`). GDPR: sole proprietorships are never
  placed (`geo_precision = 'skjult'`); "c/o <person>" addresses and PO boxes are placed by postcode
  only. The initial view frames the Bergen region (50 km from the median).
- **One-off data fixes** run once per database via `ONCE_MIGRATIONS` in `lib/db.ts` (tracked
  in `app_meta`).
- **Nyheter** come only from the AI pass (Gemini + Google Search, stored in `company_news`).
  The live GDELT fallback on the company page was removed: under GDELT's ~1 req/5s limit it
  held page renders for up to 10 s.
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
3. **AI pass** (Claude Haiku 4.5 when `ANTHROPIC_API_KEY` is set, else Gemini; slow) —
   `lib/orchestrator/providers/ai.ts#aiText` routes all four tools; Claude lives in
   `providers/claude.ts` (structured answers via a forced tool, web search via its
   `web_search` tool). Switched to Claude 2026-10-01 after Gemini's prepaid credit ran out.
   Its own queue (`listCompaniesForAi`: never-attempted
   first, highest lead score first, then oldest `ai_attempted_at`), up to `SCAN_AI_BATCH`
   (default 12) companies in waves of 6. The queue only covers the top `AI_TOP_N` (50) leads,
   a konsern counted once (its best member); the admin «AI-vurdering» panel lets you pick
   50/100/200/500. Token use and an estimated cost per run (`lib/aiUsage.ts`, list prices,
   ~10,5 NOK/USD) are stored in `details.ai.usage` and shown live and in «Siste kjøringer». Admin «Oppdater alt» (`RunUpdateAllButton`) is the catch-up
   routine as one click: normal runs (`runScanAction`) until `countBrregStale()` is 0, then
   AI-only runs (`runAiQueueAction`) until `countAiPending()` is 0 — back to back from the
   browser while the page is open. Pauses 60 s on Gemini 429s; stops after two runs that did
   nothing. Day-to-day upkeep needs none of this: the nightly cron runs both passes.
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
