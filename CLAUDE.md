# Claude Context Guide — Maritim Bergen (bergen-maritime-leads)

## Global personal instructions
@C:\Users\TVadla\.claude\Global Claude TV.md

## What this project is
An internal **sales-prospecting** tool for the **maritime sector in Bergen**. It scans
the official Norwegian company registers (Brønnøysundregistrene) and ranks companies by
a transparent **lead score** so a sales team knows who to approach first.

Built on the sibling `../ship-predictions-app` template (Next.js 14 only, libSQL/Turso,
jose+bcrypt auth, CSP middleware, orchestrator pattern, Vercel + Cron). `README.md` and
`docs/IMPLEMENTATION.md` are the source of truth.

## Key facts
- **Data source:** `data.brreg.no` — Enhetsregisteret (company facts, employees) +
  Regnskapsregisteret (annual accounts / revenue). Free, no key, open data. NOT
  scraping proff.no (blocked + ToS) — proff is built on this same registry.
- **Scan universe:** `data/maritime-sectors.mjs` — municipalities (Bergen 4601) ×
  maritime NACE code prefixes. One edit widens/narrows the whole tool.
- **Lead score:** `lib/score.ts`, pure + unit-tested. `0.35·size + 0.30·revenue +
  0.20·growth + 0.15·profitability`. Bands high ≥ 66 / mid ≥ 40 / low.
- **Orchestrator:** `lib/orchestrator` — providers `brreg`, `score`, `fx`. App code
  calls `orchestrator.callTool(...)`, never a provider or external API directly.
- **Scan engine:** `lib/scan.ts` — `runScan()` (discovery + rotating enrichment batch),
  `refreshCompany(orgnr)`, `addCompanyByOrgnr(orgnr)`. Cron: `/api/cron/scan`.
- **Snapshot:** `data/companies-snapshot.json` (committed) is loaded into any empty DB
  by `lib/db.ts` ensureSeeded() + `build-db.mjs`, so a cold Vercel instance shows real
  data. Regenerate with `npm run db:snapshot` after a local scan.
- UI is in **Norwegian (Bokmål)**. No emoji in the UI.

## Guidance for Claude
- **Next.js only.** No separate backend, no second deployment. App Router + Server
  Actions + Route Handlers + Vercel Cron cover it.
- **Two themes, system default** — tokens in `app/globals.css` (`:root` + `[data-theme]`
  + `prefers-color-scheme`), resolved server-side from a cookie. Maritime blue accent,
  rationed amber `--signal` for high scores only.
- **External data is best-effort** — every provider call is wrapped by the
  orchestrator's timeout + try/catch and degrades to a clear empty state.
- **Security:** app is not public (middleware gates every route); cron route checks
  `CRON_SECRET`; `safeFetch` (SSRF guard) is used for all outbound HTTP; no secret is
  `NEXT_PUBLIC_`; admin gating in middleware + `requireAdmin()`, never only in JSX.
- **Always latest stable major** for framework deps. Read `node_modules/next/…` before
  writing App Router code.
- Keep `README.md` / `docs/IMPLEMENTATION.md` in sync as decisions are made. New env
  vars go in `.env.local.example` with a comment on what breaks without them.
