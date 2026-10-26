"use client";

import { useEffect, useRef, useState } from "react";
import { WorkbookView } from "./WorkbookView";
import { Alert, Button, Card } from "./ui";
import type { ChartInfo, RosterResponse } from "./types";

/**
 * Upload a measurement sheet - a workbook with a tab per class, a single class
 * roster, a CSV, or a PDF saved from a spreadsheet - and size every class in it.
 */
export function Wizard() {
  const [roster, setRoster] = useState<RosterResponse | null>(null);
  const [uploadId, setUploadId] = useState(0);
  const [charts, setCharts] = useState<ChartInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/charts")
      .then((r) => r.json())
      .then((d) => setCharts(d.charts ?? []))
      .catch(() => setCharts([]));
  }, []);

  async function handleUpload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/roster", { method: "POST", body: form });
      const data: RosterResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (!data.classes.some((c) => c.kind === "class")) {
        throw new Error(
          "Couldn't find a measurement table in that file. Each class needs a header row with a Girth column.",
        );
      }
      setRoster(data);
      setUploadId((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRoster(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8">
      <header className="mb-7">
        <h1 className="text-xl font-semibold tracking-tight">Costume Sizing</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
          Upload your measurement sheet (.xlsx, .csv or PDF) and every class is sized, with the
          dancers who need a second look called out. Girth decides the size and rounds up, because
          a costume that is too short in girth cannot be worn or altered.
        </p>
      </header>

      {roster ? (
        <WorkbookView
          key={uploadId}
          roster={roster}
          charts={charts}
          onStartOver={() => {
            setRoster(null);
            setError(null);
          }}
        />
      ) : (
        <Card
          title="Upload the measurement sheet"
          subtitle="A workbook with a tab per class (costume written on each tab) sizes every class at once. A single class roster works too."
        >
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleUpload(file);
            }}
            className={`rounded-xl border-2 border-dashed p-8 text-center transition ${
              dragging
                ? "border-neutral-900 bg-neutral-50 dark:border-white dark:bg-neutral-800"
                : "border-black/15 dark:border-white/20"
            }`}
          >
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Drop the file here, or
            </p>
            <div className="mt-3">
              <Button onClick={() => fileInput.current?.click()} disabled={busy}>
                {busy ? "Reading…" : "Choose a file"}
              </Button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls,.csv,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />
          </div>
          {error ? (
            <div className="mt-4">
              <Alert kind="error">{error}</Alert>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
