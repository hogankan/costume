"use client";

import { useState } from "react";
import type { ClassHistory } from "@/lib/shows/types";
import { Alert, Button } from "./ui";

const when = (iso: string) =>
  new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * A saved class's history: every override (original recommendation, the size
 * chosen, who, when and why) and how the dancers differ from the uploaded sheet.
 */
export function HistoryPanel({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ClassHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHistory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4">
      <Button variant="secondary" onClick={toggle}>
        {open ? "Hide history" : "History"}
      </Button>
      {open ? (
        <div className="mt-3 space-y-4 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15">
          {loading ? <p className="text-neutral-500">Loading…</p> : null}
          {error ? <Alert kind="error">{error}</Alert> : null}
          {history ? (
            <>
              {history.updatedBy && history.updatedAt ? (
                <p className="text-neutral-600 dark:text-neutral-400">
                  Last changed by {history.updatedBy}, {when(history.updatedAt)}.
                </p>
              ) : null}

              <div>
                <p className="font-semibold">Size overrides</p>
                {history.events.length === 0 ? (
                  <p className="text-neutral-600 dark:text-neutral-400">
                    No overrides — every dancer has the recommended size.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {history.events.map((e, i) => (
                      <li key={i}>
                        <span className="font-medium">{e.dancerName}</span>{" "}
                        <span className="text-neutral-500">({e.styleNumber})</span>:{" "}
                        {e.toSize ? (
                          <>
                            recommended <span className="font-mono">{e.recommendedSize}</span>,
                            changed to <span className="font-mono font-semibold">{e.toSize}</span>
                            {e.reason ? <> — “{e.reason}”</> : " — no reason given"}
                          </>
                        ) : (
                          <>
                            override removed, back to{" "}
                            <span className="font-mono">{e.recommendedSize}</span>
                          </>
                        )}
                        <span className="text-neutral-500">
                          {" "}
                          · {e.by}, {when(e.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="font-semibold">Changed since the sheet was uploaded</p>
                {history.dancerChanges.length === 0 ? (
                  <p className="text-neutral-600 dark:text-neutral-400">
                    No dancers added or edited.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {history.dancerChanges.map((d, i) => (
                      <li key={i}>
                        <span className="font-medium">{d.name}</span>{" "}
                        <span className="text-neutral-500">
                          ({d.kind === "added" ? "added in app" : "edited"})
                        </span>
                        : {d.changes.join("; ") || "no measurements"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
