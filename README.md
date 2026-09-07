# Maritim Bergen — salgs-leads

Internal sales-prospecting tool. Scans the **maritime sector in Bergen** using the
official Norwegian company registers (Brønnøysundregistrene) and ranks companies by
a transparent **lead score** for sales prioritisation.

- **Enhetsregisteret** — company name, industry (NACE), employee count, address, status
- **Regnskapsregisteret** — annual accounts: revenue (omsetning), operating result, equity
- Each company links out to its **proff.no** and **Brønnøysund** pages

Free, keyless, and within the registers' open-data terms. proff.no is built on the same
registry data — this tool goes straight to the source.

## Stack

Next.js 14 (App Router, Server Actions, Route Handlers) · libSQL / Turso · jose + bcrypt
auth (roles `viewer` / `admin`) · CSP middleware · Vercel + Vercel Cron. Same template
as the sibling `ship-predictions-app`. The **orchestrator pattern** (`lib/orchestrator`)
routes namespaced tools (`brreg.searchEnheter`, `brreg.getRegnskap`, `score.compute`) to
isolated providers, in-process for now but MCP-shaped for later extraction.

## The lead score

`0.35·size + 0.30·revenue + 0.20·growth + 0.15·profitability`, each sub-score 0–100:

| Sub-score | From | Curve |
| --- | --- | --- |
| Size | employees | log, 1 → ~0, 100 → ~65, 500 → 100 |
| Revenue | latest driftsinntekter | log, 2 MNOK → ~10, 1 mrd → 100 |
| Growth | revenue YoY | −25 % → 0, 0 % → 45, +25 % → 90 |
| Profitability | operating margin | −15 % → 0, 0 % → 40, +12 % → 100 |

Bands: **high ≥ 66**, mid 40–65, low < 40. Tune the weights/curves in `lib/score.ts`;
tune the scan universe (municipalities + NACE codes) in `data/maritime-sectors.mjs`.

## Local dev

```bash
npm install
cp .env.local.example .env.local          # set SESSION_SECRET at minimum
npm run db:build                          # schema + seed users (+ snapshot if present)
npm run dev                               # http://localhost:3000
# in another terminal, populate real data:
npm run scan:local -- --full
npm run db:snapshot                       # commit data/companies-snapshot.json
```

## Deploy

`npx vercel deploy --prod`. Set in Vercel project env: `SESSION_SECRET`, `CRON_SECRET`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, optionally `GUEST_EMAIL` / `GUEST_PASSWORD_HASH`,
`SCAN_BATCH`. The nightly cron (`vercel.json`, 05:00 UTC) hits `/api/cron/scan`.

**Production database:** without `TURSO_DATABASE_URL` the prod DB is an ephemeral
`/tmp` file — the committed snapshot keeps the list populated, but new scans and the
audit log don't persist across instances. Provision Turso and set
`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` to fix.

See [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) for the as-built detail.
