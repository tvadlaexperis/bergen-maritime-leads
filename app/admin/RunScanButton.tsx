"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runScanAction } from "./actions";
import ConfirmDialog from "./ConfirmDialog";

// Buttons only — the result line is reported up via `onStatus` so the
// buttons can sit in the Skann header while the text renders below it.
export default function RunScanButton({
  onStatus,
}: {
  onStatus: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const setMsg = onStatus;
  const [ask, setAsk] = useState<null | "bunt" | "full">(null);

  function run(full: boolean) {
    setMsg(null);
    start(async () => {
      try {
        const r = await runScanAction(full);
        setMsg(r.summary);
        router.refresh();
      } catch {
        setMsg("Skann feilet — sjekk loggene.");
      }
    });
  }

  return (
    <>
      <button
        className="btn btn-ghost btn-sm"
        disabled={busy}
        onClick={() => setAsk("bunt")}
      >
        {busy ? "Skanner…" : "Kjør skann"}
      </button>
      <button
        className="btn btn-ghost btn-sm"
        disabled={busy}
        onClick={() => setAsk("full")}
      >
        Full oppdatering
      </button>
      <ConfirmDialog
        open={ask !== null}
        title={ask === "full" ? "Full oppdatering" : "Kjør skann"}
        confirmLabel="Start"
        onCancel={() => setAsk(null)}
        onConfirm={() => {
          run(ask === "full");
          setAsk(null);
        }}
      >
        {ask === "full" ? (
          <p>
            Leter etter nye maritime selskaper i Brønnøysundregistrene, og
            sjekker deretter alle selskaper på nytt (regnskap, daglig leder,
            styre, e-post, konsern og lead-score), de som er sjekket lengst
            siden først.
          </p>
        ) : (
          <p>
            Sjekker selskaper som ikke er oppdatert fra Brønnøysundregistrene de
            siste 3 dagene: regnskap, daglig leder, styre, e-post, konsern og
            lead-score. Leter ikke etter nye selskaper.
          </p>
        )}
        <p>Én kjøring tar inntil ett minutt. Kjør igjen for å ta resten.</p>
        <p className="muted">Gratis. Bruker ikke AI (Gemini).</p>
      </ConfirmDialog>
    </>
  );
}
