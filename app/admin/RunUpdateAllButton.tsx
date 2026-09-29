"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { runAiQueueAction } from "./actions";
import ConfirmDialog from "./ConfirmDialog";
import { publishLiveRun } from "./LiveRun";
import { groupScanErrors } from "@/lib/scanErrors";

type Totals = {
  runs: number;
  processed: number;
  analyses: number;
  contacts: number;
  websites: number;
  news: number;
  newsSearched: number;
  scraped: number;
  errors: number;
};
const ZERO: Totals = {
  runs: 0,
  processed: 0,
  analyses: 0,
  contacts: 0,
  websites: 0,
  news: 0,
  newsSearched: 0,
  scraped: 0,
  errors: 0,
};

// «AI-vurdering»: runs AI-only scans until the AI queue is empty (analysis,
// news, website contacts). Costs Gemini money — Brreg has its own free button. One ≤60s server run after another, for
// as long as this page stays open. Stopping only takes effect between runs —
// the one in flight always finishes and gets logged.
export default function RunUpdateAllButton({
  initialRemaining,
  aiEnabled,
  onStatus,
}: {
  initialRemaining: number;
  aiEnabled: boolean;
  onStatus: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [totals, setTotals] = useState<Totals>(ZERO);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [msg, setMsg] = useState<string | null>(null);
  const [waitLeft, setWaitLeft] = useState(0);
  const stopRef = useRef(false);
  const [ask, setAsk] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Interruptible pause — "Stopp" during a rate-limit wait ends it at once.
  async function pause(seconds: number) {
    for (let left = seconds; left > 0 && !stopRef.current; left--) {
      setWaitLeft(left);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setWaitLeft(0);
  }

  async function run() {
    stopRef.current = false;
    setRunning(true);
    setStopping(false);
    setMsg(null);
    let t = ZERO;
    setTotals(t);
    let idleRuns = 0;
    let rateLimitWaits = 0;
    try {
      while (!stopRef.current) {
        const r = await runAiQueueAction();
        if ("error" in r) {
          setMsg(r.error);
          break;
        }
        t = {
          runs: t.runs + 1,
          processed: t.processed + r.processed,
          analyses: t.analyses + r.analyses,
          contacts: t.contacts + r.contacts,
          websites: t.websites + r.websites,
          news: t.news + r.newsFound,
          newsSearched: t.newsSearched + r.newsSearched,
          scraped: t.scraped + r.scraped,
          errors: t.errors + r.errors,
        };
        setTotals(t);
        setLastError(r.firstError);
        setRemaining(r.remaining);
        router.refresh();
        if (r.remaining === 0) {
          setMsg(
            "Ferdig — alle selskaper er AI-vurdert og alle kjente nettsider er lest.",
          );
          break;
        }
        // Gemini's per-minute quota: back off and carry on rather than stop,
        // up to a point — five waits in a row means the daily quota is gone.
        const didWork = r.analyses > 0 || r.scraped > 0 || r.newsSearched > 0;
        // Quota gone for the month (paid, 402) or the day (free key): stop
        // at once — waiting a minute and retrying only piles up errors.
        if (r.quotaGone && !didWork) {
          setMsg(
            "Stoppet: Gemini-kvoten er brukt opp — den betalte til den nullstilles den 1. i måneden (eller grensen økes i AI Studio), gratisnøkkelen til i morgen. Ingenting er ødelagt; køen fortsetter neste gang.",
          );
          break;
        }
        if (r.rateLimited && !didWork) {
          rateLimitWaits++;
          if (rateLimitWaits > 5) {
            setMsg(
              `Stoppet: Gemini avviser fortsatt (kvote brukt opp?). ${r.firstError ?? ""}`,
            );
            break;
          }
          setMsg("Gemini-kvoten er nådd — venter før neste kjøring.");
          await pause(60);
          continue;
        }
        rateLimitWaits = 0;
        // Two runs in a row with nothing done — no analysis, website read or
        // news search (and not a rate limit) — means something is broken.
        idleRuns = didWork ? 0 : idleRuns + 1;
        if (idleRuns >= 2) {
          setMsg(
            `Stoppet: to kjøringer på rad uten AI-vurdering. Første feil: ${r.firstError ?? "ingen feil registrert"}`,
          );
          break;
        }
        setMsg(null);
      }
      if (stopRef.current) setMsg("Stoppet.");
    } catch {
      setMsg("Kjøringen feilet — prøv igjen, eller se «Siste skann».");
    } finally {
      setRunning(false);
      setStopping(false);
      router.refresh();
    }
  }

  // Status is reported up (see ScanHeader) rather than rendered here, so
  // this can sit in the header next to the other scan buttons.
  let status: string | null = null;
  if (running || totals.runs > 0) {
    const aiPart = `AI: ${totals.analyses} vurdert, ${totals.news} nyheter, ${totals.websites} nettsider, kontakter hos ${totals.contacts}${
      totals.errors ? `, ${totals.errors} feil` : ""
    }, ${remaining} igjen`;
    const now = !running
      ? null
      : waitLeft > 0
        ? `venter ${waitLeft} s`
        : `AI-kjøring ${totals.runs + 1} pågår${
              totals.runs > 0 && totals.processed > 0
                ? ` (ca. ${Math.ceil(remaining / (totals.processed / totals.runs))} min igjen)`
                : ""
            }`;
    status = [
      "AI-vurdering",
      now,
      totals.runs > 0 ? aiPart : null,
      msg,
    ]
      .filter(Boolean)
      .join(" · ");
  } else if (msg) {
    status = msg;
  }
  // The live entry at the top of «Siste kjøringer» (LiveRun) replaces the
  // old one-line status text.
  useEffect(() => onStatus(null), [onStatus]);
  useEffect(() => {
    if (!running && totals.runs === 0 && !msg) return;
    // "ai.findNews 123456789: Gemini HTTP 402 …" → the plain-words hint.
    let error: string | null = null;
    if (lastError) {
      const [scope, ...rest] = lastError.split(": ");
      const g = groupScanErrors([{ scope, message: rest.join(": ") }])[0];
      error = `Siste feil (${g.step}): ${g.hint ?? g.message}`;
    }
    publishLiveRun({
      title: running ? "AI-vurdering pågår" : "AI-vurdering ferdig",
      running,
      status: status?.replace(/^AI-vurdering · /, "") ?? null,
      error,
      steps: [
        { label: "AI-vurderinger", service: "Gemini", cost: "betalt, gratis reserve", done: totals.analyses },
        { label: "Nyhetssøk", service: "Gemini + Google-søk", cost: "betalt", done: totals.newsSearched },
        { label: "Nettsider lest for kontakter", service: "nettsiden + Gemini", cost: "betalt", done: totals.scraped },
        { label: "Nettsider funnet", service: "Gemini + Google-søk", cost: "betalt", done: totals.websites },
      ],
    });
  }, [running, totals, msg, status, lastError]);

  return running ? (
    <button
      className="btn btn-ghost btn-sm"
      disabled={stopping}
      onClick={() => {
        stopRef.current = true;
        setStopping(true);
      }}
    >
      {stopping ? "Stopper…" : "Stopp AI"}
    </button>
  ) : (
    <>
      <ConfirmDialog
        open={ask}
        title="AI-vurdering"
        confirmLabel="Start AI-vurdering"
        onCancel={() => setAsk(false)}
        onConfirm={() => {
          setAsk(false);
          run();
        }}
      >
        <p>
          Lager AI-vurdering, henter nyheter og leser kontakter fra nettsiden
          for {remaining} selskaper i køen, de med høyest score først.
        </p>
        <p>
          Bruker Gemini og <strong>koster penger</strong>, og teller mot utgiftsgrensen i Google AI Studio.
        </p>
        <p className="muted">
          Kjører så lenge siden er åpen, og kan stoppes underveis.
        </p>
      </ConfirmDialog>
      <button
        className="btn btn-ghost btn-sm"
        disabled={!aiEnabled || remaining === 0}
        onClick={() => setAsk(true)}
        title={aiEnabled ? "Kjører AI-køen til den er tom — koster penger" : "AI er ikke konfigurert"}
      >
        AI-vurdering ({remaining})
      </button>
    </>
  );
}
