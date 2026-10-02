import Link from "next/link";
import { getCompanyNames, countAiPending, type Scan } from "@/lib/db";
import { aiConfigured, aiSetup } from "@/lib/orchestrator/providers/ai";
import NextAiRun from "./NextAiRun";
import type { ScanDetails } from "@/lib/scan";
import { KOMMUNER, NACE_CODES } from "@/data/maritime-sectors.mjs";
import LiveRun from "./LiveRun";
import ScanHeader from "./ScanHeader";
import { groupScanErrors } from "@/lib/scanErrors";

const TRIGGER_LABEL: Record<ScanDetails["trigger"], string> = {
  cron: "Nattlig",
  manuell: "Manuell",
  full: "Full",
  ai: "AI-kø",
};

function parseDetails(raw: string | null): ScanDetails | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ScanDetails;
  } catch {
    return null;
  }
}

function parseErrors(raw: string | null): { scope: string; message: string }[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as { scope: string; message: string }[];
  } catch {
    return [];
  }
}

// Server-rendered timestamps would otherwise come out in the Vercel
// function's UTC, an hour or two off from what anyone in Bergen expects.
function whenLabel(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Oslo",
  });
  const time = d.toLocaleTimeString("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  });
  return `${date} ${time}`;
}

function statusLabel(s: Scan, d: ScanDetails | null): string {
  if (!s.finished_at)
    return Date.now() - s.started_at > 2 * 60_000 ? "avbrutt" : "kjører";
  return d?.stoppedEarly ? "ferdig · tidsgrense nådd" : "ferdig";
}

// A zero is noise in a wide table of mostly-zero columns — dim it so the
// numbers that actually moved stand out.
function Num({ n }: { n: number | null | undefined }) {
  if (n == null) return <span className="muted">—</span>;
  return <span className={n === 0 ? "muted" : undefined}>{n}</span>;
}

function statsFor(
  d: ScanDetails | null,
  errorCount: number,
): [string, number | null][] {
  return d
    ? [
        ["nye selskaper", d.discovery.ran ? d.discovery.added : null],
        ["sjekket i Brreg", d.brreg.processed],
        ["nye regnskap", d.brreg.newFinancials],
        [
          "ledelse/styre",
          d.brreg.ceoSet + d.brreg.ceoChanged + d.brreg.boardUpdated,
        ],
        ["AI-vurdert", d.ai.enabled ? d.ai.analyses : null],
        ["nyheter", d.ai.enabled ? (d.ai.newsFound ?? null) : null],
        ["stillinger", d.jobs?.enabled ? d.jobs.newAds : null],
        [
          "nettsider",
          (d.ai.enabled ? d.ai.websitesFound : 0) +
            (d.brreg.websiteFromEmail ?? 0),
        ],
        ["kontakter", d.ai.enabled ? d.ai.contactCompanies : null],
        ["feil", errorCount],
      ]
    : [];
}

export default async function ScanPanel({
  scans,
  activeCount,
  selectedScanId,
  nightly = false,
}: {
  /** The «Nattlige kjøringer» tab: cron runs only, no run buttons. */
  nightly?: boolean;
  scans: Scan[];
  activeCount: number;
  selectedScanId: number | null;
}) {
  const aiBatch = Number(process.env.SCAN_AI_BATCH) || 12;
  const shown = scans.find((x) => x.id === selectedScanId) ?? scans[0];
  const idx = Math.max(
    0,
    scans.findIndex((x) => x.id === selectedScanId),
  );
  const base = nightly ? "/admin?view=nattlig&" : "/admin?";
  const older = scans[idx + 1];
  const newer = scans[idx - 1];
  const arrow = (target: Scan | undefined, label: string, glyph: string) =>
    target ? (
      <Link
        href={`${base}scan=${target.id}`}
        scroll={false}
        className="chip"
        aria-label={label}
        title={label}
      >
        {glyph}
      </Link>
    ) : (
      <span className="chip" aria-disabled="true" style={{ opacity: 0.35 }}>
        {glyph}
      </span>
    );
  const shownDetails = shown ? parseDetails(shown.details) : null;
  const nav = shown ? (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      {arrow(older, "Eldre kjøring", "←")}
      {arrow(newer, "Nyere kjøring", "→")}
      <strong style={{ fontSize: "0.9rem" }}>
        {whenLabel(shown.started_at)}
      </strong>
      <span className="muted" style={{ fontSize: "0.78rem" }}>
        {/* No details yet = still running (or cut off); "eldre" only for
            finished runs from before detailed logging. */}
        {shownDetails
          ? TRIGGER_LABEL[shownDetails.trigger]
          : shown.finished_at
            ? "eldre"
            : "kjøring"}{" "}
        ·{" "}
        {statusLabel(shown, shownDetails)} · {idx + 1} av {scans.length}
      </span>
    </span>
  ) : null;
  const nextAi = !nightly && aiConfigured() ? { setup: aiSetup(), remaining: await countAiPending() } : null;
  const names = shown
    ? await getCompanyNames([
        ...new Set(
          parseErrors(shown.errors)
            .map((e) => e.scope.split(" ")[1])
            .filter((o) => /^\d{9}$/.test(o ?? "")),
        ),
      ])
    : {};
  // Warn up top when the most recent run that reached the AI step was
  // blocked by an exhausted quota — otherwise it's only visible by opening
  // that run's details.
  const lastAiScan = scans.find(
    (s) => (parseDetails(s.details)?.ai.processed ?? 0) > 0,
  );
  const lastAiDetails = lastAiScan ? parseDetails(lastAiScan.details) : null;
  const quotaHint =
    lastAiScan && lastAiDetails && lastAiDetails.ai.analyses === 0
      ? (groupScanErrors(parseErrors(lastAiScan.errors)).find((g) =>
          /fakturering/.test(g.hint ?? ""),
        )?.hint ?? null)
      : null;
  return (
    <div className="box" style={{ flex: 1, minHeight: 0 }}>
      <ScanHeader
        title={nightly ? "Nattlige kjøringer" : "Siste kjøringer"}
        nav={nav}
        meta={`nattlig 05:00 UTC · ${(KOMMUNER as { name: string }[]).map((k) => k.name).join(", ")} · ${
          (NACE_CODES as unknown[]).length
        } bransjekoder · ${activeCount} selskaper`}
        info={
          <>
            Hver kjøring har to trinn innenfor et tidsbudsjett på ca. 55
            sekunder. <strong>1. Brønnøysund</strong> (gratis, raskt): regnskap,
            daglig leder, styre, konsern og lead-score for selskaper som ikke er
            sjekket de siste 3 dagene — er alle oppdatert, hoppes trinnet over.{" "}
            <strong>2. AI</strong> (tregt): AI-vurdering, nettsidesøk og
            kontakter fra nettsiden for inntil {aiBatch} selskaper — de som
            aldri er vurdert og har høyest score går først. «Oppdater fra Brreg»
            (gratis) leter etter nye selskaper og kjører trinn 1 til alle er
            sjekket. «AI-vurdering» (koster penger) kjører trinn 2 til køen er
            tom (ca. {aiBatch} selskaper i minuttet). Begge kjører så lenge
            siden er åpen. Den nattlige kjøringen gjør det samme i det små hver
            natt.
          </>
        }
      />
      {quotaHint && (
        <div className="box-pad" style={{ flexShrink: 0 }}>
          <div
            role="alert"
            style={{
              fontSize: "0.8rem",
              padding: "10px 12px",
              borderRadius: "var(--radius-control)",
              border: "1px solid var(--negative)",
              color: "var(--text-primary)",
            }}
          >
            <strong style={{ color: "var(--negative)" }}>
              AI-trinnet stoppes av kvoten hos AI-leverandøren.
            </strong>{" "}
            {quotaHint}
          </div>
        </div>
      )}
      <div className="box-scroll">
        {(() => {
          // One run at a time — the latest by default, arrows step back
          // (older) and forward (newer) through the last runs.
          const s = shown;
          if (!s) return <p className="muted box-pad">Ingen kjøringer ennå.</p>;
          const d = parseDetails(s.details);
          const errors = parseErrors(s.errors);
          const stats = statsFor(d, errors.length);
          return (
            <div className="box-pad" style={{ display: "grid", gap: 14 }}>
              {!nightly && <LiveRun />}
              {nextAi && <NextAiRun setup={nextAi.setup} remaining={nextAi.remaining} />}
              {d?.ai.setup && d.ai.setup.length > 0 && (
                <div>
                  <p style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 8 }}>
                    Hva AI-trinnet prøvde
                  </p>
                  <table className="table" style={{ fontSize: "0.8rem" }}>
                    <thead>
                      <tr>
                        <th>Steg</th>
                        <th>API</th>
                        <th>Modell</th>
                        <th>Kostnad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.ai.setup.map((x) => (
                        <tr key={x.step}>
                          <td>{x.step}</td>
                          <td className="muted">{x.api}</td>
                          <td className="num">{x.model}</td>
                          <td className="muted">{x.cost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {stats.length > 0 && (
                <div>
                  <p style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 8 }}>
                    Lagt til i denne kjøringen
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {stats
                      .filter(([, n]) => n != null)
                      .map(([label, n]) => (
                        <div
                          key={label}
                          className="box box-pad"
                          style={{
                            gap: 4,
                            padding: "10px 12px",
                            borderColor: label === "feil" && n ? "var(--negative)" : undefined,
                          }}
                        >
                          <span
                            className="num"
                            style={{
                              fontSize: "1.15rem",
                              fontWeight: 800,
                              lineHeight: 1,
                              color:
                                label === "feil" && n
                                  ? "var(--negative)"
                                  : n
                                    ? "var(--positive)"
                                    : "var(--text-muted)",
                            }}
                          >
                            {n ? (label === "feil" || label === "sjekket i Brreg" ? n : `+${n}`) : 0}
                          </span>
                          <span style={{ fontSize: "0.74rem", fontWeight: 600 }}>{label}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              <ScanDetailsView
                scan={s}
                details={d}
                errors={errors}
                names={names}
              />
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function ScanDetailsView({
  scan,
  details: d,
  errors,
  names,
}: {
  scan: Scan;
  details: ScanDetails | null;
  errors: { scope: string; message: string }[];
  names: Record<string, string>;
}) {
  if (!d && !scan.finished_at) {
    return (
      <p className="muted" style={{ fontSize: "0.8rem" }}>
        {Date.now() - scan.started_at > 2 * 60_000
          ? "Kjøringen ble avbrutt før den var ferdig (tidsgrensen eller en feil) — ingen detaljer lagret. Neste kjøring tar resten."
          : "Kjøringen pågår — detaljer og resultater vises her når den er ferdig (inntil ca. ett minutt). Last siden på nytt."}
      </p>
    );
  }
  if (!d) {
    return (
      <p className="muted" style={{ fontSize: "0.8rem" }}>
        Denne kjøringen er fra før detaljlogging ble innført:{" "}
        {scan.companies_found} funnet, {scan.financials_fetched} med regnskap
        hentet, {errors.length} feil.
      </p>
    );
  }
  const changed = d.changedCount ?? d.companies.length;
  // AI-only companies can show up as changed without being in the Brreg count.
  const unchanged = Math.max(0, d.brreg.processed - changed);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontSize: "0.8rem",
      }}
    >
      <p>
        {d.discovery.ran && (
          <>
            Enhetsregisteret: {d.discovery.found} maritime selskaper,{" "}
            {d.discovery.added} nye.{" "}
          </>
        )}
        {d.brreg.queued > 0 ? (
          <>
            Brreg: {d.brreg.processed} av {d.brreg.queued} i køen sjekket —{" "}
            {d.brreg.newFinancials} nye regnskap, {d.brreg.ceoSet} daglig leder
            funnet, {d.brreg.ceoChanged} ny daglig leder, {d.brreg.boardUpdated}{" "}
            styrer oppdatert, {d.brreg.scoreChanged} endret score
            {d.brreg.emailFound ? `, ${d.brreg.emailFound} e-poster` : ""}
            {d.brreg.websiteFromEmail
              ? `, ${d.brreg.websiteFromEmail} nettsider fra e-postdomene`
              : ""}
            .{" "}
          </>
        ) : d.trigger !== "ai" ? (
          <>Brreg: ingen selskaper forfalt. </>
        ) : null}
        {d.ai.enabled ? (
          <>
            AI: {d.ai.processed} selskaper — {d.ai.analyses} vurderinger,{" "}
            {d.ai.websitesFound} nettsider funnet, kontakter hos{" "}
            {d.ai.contactCompanies} ({d.ai.contactPeople} personer)
            {d.ai.sitesScraped != null &&
              `, ${d.ai.sitesScraped} nettsider lest`}
            {d.ai.newsSearched != null &&
              `, nyheter søkt for ${d.ai.newsSearched} (${d.ai.newsFound ?? 0} nye artikler)`}
            .
          </>
        ) : (
          <span className="muted">
            AI-trinnet er av for denne kjøringen.
          </span>
        )}{" "}
        {d.jobs?.enabled && (
          <>
            NAV: {d.jobs.pages} sider av stillingsfeeden lest,{" "}
            {d.jobs.candidates} annonser i området sjekket, {d.jobs.newAds} nye
            hos selskapene i lista ({d.jobs.techAds} IT), {d.jobs.deactivated}{" "}
            stengt.{" "}
          </>
        )}
        <span className="muted">Tok {Math.round(d.tookMs / 1000)} s.</span>
      </p>

      {errors.length > 0 && (
        <div>
          <p
            style={{
              fontWeight: 600,
              marginBottom: 8,
              color: "var(--negative)",
            }}
          >
            {errors.length} feil
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {groupScanErrors(errors).map((g) => (
              <div
                key={`${g.step}-${g.message}`}
                style={{
                  borderLeft: "3px solid var(--negative)",
                  paddingLeft: 10,
                }}
              >
                <div>
                  <strong>{g.step}</strong>
                  <span className="muted">
                    {" "}
                    · {g.count} {g.count === 1 ? "gang" : "ganger"}
                    {g.orgnrs.length > 0 &&
                      ` · ${new Set(g.orgnrs).size} selskaper`}
                  </span>
                </div>
                <div className="muted" style={{ overflowWrap: "anywhere" }}>
                  {g.message}
                </div>
                {g.hint && <div style={{ marginTop: 2 }}>{g.hint}</div>}
                {g.orgnrs.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: "0.8rem" }}>
                    {[...new Set(g.orgnrs)].slice(0, 30).map((o, i) => (
                      <span key={o}>
                        {i > 0 && <span className="muted"> · </span>}
                        <Link href={`/company/${o}`} className="link-accent">
                          {names[o] ?? o}
                        </Link>
                      </span>
                    ))}
                    {new Set(g.orgnrs).size > 30 && (
                      <span className="muted">
                        {" "}
                        · og {new Set(g.orgnrs).size - 30} til
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {d.companies.length > 0 ? (
        <div>
          <p style={{ fontWeight: 600, marginBottom: 6 }}>
            Endringer i {changed} selskaper
            {changed > d.companies.length && (
              <span className="muted" style={{ fontWeight: 400 }}>
                {" "}
                (viser {d.companies.length})
              </span>
            )}
            {unchanged > 0 && (
              <span className="muted" style={{ fontWeight: 400 }}>
                {" "}
                · {unchanged} sjekket uten endring
              </span>
            )}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "6px 20px",
            }}
          >
            {d.companies.map((c) => (
              <div key={c.orgnr} style={{ minWidth: 0 }}>
                <Link
                  href={`/company/${c.orgnr}`}
                  className="link-accent"
                  style={{ fontWeight: 600 }}
                >
                  {c.name}
                </Link>
                <span className="muted"> — {c.changes.join(" · ")}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="muted">
          {errors.length > 0
            ? "Ingen endringer."
            : "Ingen endringer — alt som ble sjekket var allerede oppdatert."}
        </p>
      )}
    </div>
  );
}
