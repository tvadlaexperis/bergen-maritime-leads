"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { runAiQueueAction, aiProgressAction } from "./actions";
import type { AiProgress } from "@/lib/db";
import ConfirmDialog from "./ConfirmDialog";
import { publishLiveRun } from "./LiveRun";
import { groupScanErrors } from "@/lib/scanErrors";

/** Window event the confirm card (NextAiRun) fires to start the AI run. */
export const START_AI_EVENT = "admin-start-ai";

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
  aiService,
  onStatus,
}: {
  initialRemaining: number;
  aiEnabled: boolean;
  /** Which model runs the queue, e.g. "Claude Haiku" or "Gemini". */
  aiService: string;
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
  // The confirm card in «Siste kjøringer» (NextAiRun) starts the same run.
  const runRef = useRef<() => void>(() => {});
  useEffect(() => {
    const on = () => runRef.current();
    window.addEventListener(START_AI_EVENT, on);
    return () => window.removeEventListener(START_AI_EVENT, on);
  }, []);
  const [lastError, setLastError] = useState<string | null>(null);
  // Counts saved since the run started, polled every 4 s — each server run
  // takes up to a minute, and the boxes should move during it.
  const startedAtRef = useRef(0);
  const [live, setLive] = useState<AiProgress | null>(null);
  useEffect(() => {
    if (!running) return;
    const tick = () =>
      aiProgressAction(startedAtRef.current)
        .then(setLive)
        .catch(() => {});
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [running]);

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
    startedAtRef.current = Date.now();
    setLive(null);
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
            `Stoppet: ${aiService}-kvoten eller -kreditten er brukt opp. Ingenting er ødelagt; køen fortsetter når det er fylt på. ${r.firstError ?? ""}`,
          );
          break;
        }
        if (r.rateLimited && !didWork) {
          rateLimitWaits++;
          if (rateLimitWaits > 5) {
            setMsg(
              `Stoppet: ${aiService} avviser fortsatt (kvote brukt opp?). ${r.firstError ?? ""}`,
            );
            break;
          }
          setMsg(`${aiService} sier «for mange kall» — venter før neste kjøring.`);
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

  runRef.current = () => {
    if (!running && aiEnabled) run();
  };

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
        // The larger of the polled count and the finished runs' sums — the
        // poll is ahead during a run, the sums are exact once it's done.
        { label: "AI-vurderinger", service: aiService, cost: "betalt", done: Math.max(totals.analyses, live?.analyses ?? 0) },
        { label: "Nyhetssøk", service: `${aiService} + websøk`, cost: "betalt", done: Math.max(totals.newsSearched, live?.newsSearched ?? 0) },
        { label: "Nettsider lest for kontakter", service: `nettsiden + ${aiService}`, cost: "betalt", done: Math.max(totals.scraped, live?.contactsRead ?? 0) },
        { label: "Nettsidesøk utført", service: `${aiService} + websøk`, cost: "betalt", done: Math.max(totals.websites, live?.websiteSearched ?? 0) },
      ],
    });
  }, [running, totals, msg, status, lastError, aiService, live]);

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
          Bruker {aiService} og <strong>koster penger</strong>.
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
