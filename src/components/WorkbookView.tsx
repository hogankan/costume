"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClassSheet } from "@/lib/import/workbook";
import type { LookupResult } from "@/lib/costume/lookup";
import type { ExportAssignment } from "@/lib/export/orderSheet";
import type { Flag } from "@/lib/sizing/types";
import type { CostumeLookupOutcome } from "@/app/api/workbook/costumes/route";
import type { ClassSizeResult } from "@/app/api/workbook/size/route";
import type { FillTarget } from "@/lib/export/fillWorkbook";
import { Alert, Button, Card, SeverityBadge, inputClass } from "./ui";
import { COMPANIES, type ChartInfo, type RosterResponse } from "./types";
import { buildFitReport, type FitReport } from "@/lib/report/fitReport";
import { FitReportTable } from "./FitReportTable";
import { fitReportHtml } from "@/lib/report/fitHtml";

/**
 * Size a whole costume workbook at once: one card per class, with the costume
 * read from the class's own tab. Classes that are not ready (no costume chosen,
 * no measurements) are shown and skipped rather than blocking the rest.
 */

const COMPANY_NAMES: Record<string, string> = Object.fromEntries(
  COMPANIES.map((c) => [c.slug, c.name]),
);

interface CostumeSlot {
  companySlug: string;
  input: string;
  status: "idle" | "loading" | "ok" | "error";
  lookup?: LookupResult;
  error?: string;
  /** One chart, or several when the costume's sizes span charts. */
  chartIds: string[];
  colorway: string;
}

interface ClassState {
  key: string;
  cls: ClassSheet;
  primary: CostumeSlot;
  /** Second costume for some dancers, usually the boys' version. */
  alternate: (CostumeSlot & { label: string }) | null;
  /** Row numbers ticked to wear the alternate costume. */
  alternateRows: number[];
}

type Overrides = Record<string, { size: string; reason: string }>;

const overrideKey = (classKey: string, a: Pick<ExportAssignment, "rowNumber" | "dancerName">) =>
  `${classKey}|${a.rowNumber ?? a.dancerName}`;

const severityOf = (flags: Flag[]): "blocking" | "warning" | "ok" =>
  flags.some((f) => f.severity === "blocking")
    ? "blocking"
    : flags.some((f) => f.severity === "warning")
      ? "warning"
      : "ok";

function emptySlot(companySlug: string, input = ""): CostumeSlot {
  return { companySlug, input, status: "idle", chartIds: [], colorway: "" };
}

function initialState(classes: ClassSheet[]): ClassState[] {
  return classes
    .filter((c) => c.kind === "class")
    .map((cls) => {
      const parsed = cls.costume;
      const selected = parsed.status === "selected";
      return {
        key: cls.sheetName,
        cls,
        primary: selected
          ? emptySlot(parsed.companySlug, parsed.primary)
          : emptySlot("awishcometrue"),
        alternate:
          selected && parsed.alternate
            ? {
                ...emptySlot(parsed.companySlug, parsed.alternate.style),
                label: parsed.alternate.label,
              }
            : null,
        alternateRows: cls.suggestedAlternate,
      };
    });
}

function applyOutcome(slot: CostumeSlot, outcome: CostumeLookupOutcome | undefined): CostumeSlot {
  if (!outcome) return { ...slot, status: "error", error: "No answer for this costume." };
  if (!outcome.ok) return { ...slot, status: "error", error: outcome.error, lookup: undefined };
  return {
    ...slot,
    status: "ok",
    error: undefined,
    lookup: outcome,
    companySlug: outcome.companySlug,
    // Only an unambiguous match is accepted automatically; otherwise a person picks.
    chartIds: outcome.resolution.combined
      ? outcome.resolution.combined.map((c) => c.id)
      : outcome.resolution.chart
        ? [outcome.resolution.chart.id]
        : [],
    colorway: outcome.costume.colorways[0]?.name ?? "",
  };
}

async function lookupMany(
  items: { companySlug: string; style: string }[],
): Promise<Record<string, CostumeLookupOutcome>> {
  const res = await fetch("/api/workbook/costumes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.results;
}

const slotKey = (s: CostumeSlot) => `${s.companySlug}:${s.input.trim()}`;

function slotReady(slot: CostumeSlot | null): boolean {
  return Boolean(slot && slot.status === "ok" && slot.chartIds.length > 0);
}

function classStatus(c: ClassState): { label: string; tone: "ok" | "warn" | "muted" } {
  const sizeable = c.cls.dancers.filter((d) => d.girth != null).length;
  if (sizeable === 0) return { label: "No measurements", tone: "muted" };
  if (!c.primary.input.trim()) return { label: "Costume not selected yet", tone: "muted" };
  if (c.primary.status === "loading" || c.alternate?.status === "loading")
    return { label: "Looking up costume…", tone: "muted" };
  if (c.primary.status === "error") return { label: "Costume not found", tone: "warn" };
  if (c.primary.status !== "ok") return { label: "Look up the costume", tone: "warn" };
  if (c.primary.chartIds.length === 0) return { label: "Pick a size chart", tone: "warn" };
  if (c.alternate && c.alternateRows.length > 0 && !slotReady(c.alternate))
    return { label: `Fix the ${c.alternate.label} costume`, tone: "warn" };
  return { label: "Ready", tone: "ok" };
}

/**
 * Everything a class's sizes depend on. When this changes after sizing, the
 * shown sizes no longer match what is on screen.
 */
function signature(c: ClassState): string {
  const slot = (s: CostumeSlot | null) =>
    s ? [s.companySlug, s.lookup?.costume.styleNumber, [...s.chartIds].sort(), s.colorway] : null;
  return JSON.stringify([
    slot(c.primary),
    c.alternate ? slot(c.alternate) : null,
    c.alternate ? [...c.alternateRows].sort((a, b) => a - b) : [],
  ]);
}

/** The fit report for one sized class, with the studio's overrides applied. */
function reportFor(c: ClassState, result: ClassSizeResult, overrides: Overrides): FitReport {
  const byRow: Record<number, { size: string; reason: string }> = {};
  for (const a of result.assignments) {
    const o = overrides[overrideKey(c.key, a)];
    if (o?.size && a.rowNumber != null) byRow[a.rowNumber] = o;
  }
  return buildFitReport({
    className: c.cls.className,
    sheetName: c.cls.sheetName,
    teacher: c.cls.meta.teacher,
    dancers: c.cls.dancers,
    assignments: result.assignments,
    skipped: result.skipped,
    charts: result.charts,
    overrides: byRow,
  });
}

export function WorkbookView({
  roster,
  file,
  charts,
  onStartOver,
  onSingleClass,
}: {
  roster: RosterResponse;
  file: File | null;
  charts: ChartInfo[];
  onStartOver: () => void;
  onSingleClass: () => void;
}) {
  const [classes, setClasses] = useState<ClassState[]>(() => initialState(roster.classes));
  const [results, setResults] = useState<Record<string, ClassSizeResult>>({});
  /** What each class looked like when it was sized, to spot out-of-date results. */
  const [sizedAs, setSizedAs] = useState<Record<string, string>>({});
  /** Classes to size as soon as their costume lookups finish. */
  const [pending, setPending] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherTabs = roster.classes.filter((c) => c.kind === "other").map((c) => c.sheetName);

  const update = (key: string, fn: (c: ClassState) => ClassState) =>
    setClasses((prev) => prev.map((c) => (c.key === key ? fn(c) : c)));

  // Look up every costume named on the sheet once, as soon as the file is read.
  useEffect(() => {
    const slots = classes.flatMap((c) => [c.primary, c.alternate].filter(Boolean) as CostumeSlot[]);
    const items = slots
      .filter((s) => s.input.trim() && s.status === "idle")
      .map((s) => ({ companySlug: s.companySlug, style: s.input.trim() }));
    if (items.length === 0) return;

    const markLoading = (s: CostumeSlot) =>
      s.input.trim() && s.status === "idle" ? { ...s, status: "loading" as const } : s;
    setClasses((prev) =>
      prev.map((c) => ({
        ...c,
        primary: markLoading(c.primary),
        alternate: c.alternate ? { ...c.alternate, ...markLoading(c.alternate) } : null,
      })),
    );

    lookupMany(items)
      .then((found) =>
        setClasses((prev) =>
          prev.map((c) => ({
            ...c,
            primary:
              c.primary.status === "loading"
                ? applyOutcome(c.primary, found[slotKey(c.primary)])
                : c.primary,
            alternate:
              c.alternate && c.alternate.status === "loading"
                ? { ...c.alternate, ...applyOutcome(c.alternate, found[slotKey(c.alternate)]) }
                : c.alternate,
          })),
        ),
      )
      .then(() => setPending(classes.map((c) => c.key)))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    // Runs once per upload; later lookups are triggered per class.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function relookup(key: string, which: "primary" | "alternate") {
    const c = classes.find((x) => x.key === key);
    const slot = c?.[which];
    if (!c || !slot || !slot.input.trim()) return;
    update(key, (x) => ({ ...x, [which]: { ...x[which]!, status: "loading" } }));
    try {
      const found = await lookupMany([{ companySlug: slot.companySlug, style: slot.input.trim() }]);
      update(key, (x) => ({
        ...x,
        [which]: { ...x[which]!, ...applyOutcome(x[which]!, found[slotKey(slot)]) },
      }));
      // Show sizes straight away once the costume is found.
      setPending((prev) => (prev.includes(key) ? prev : [...prev, key]));
    } catch (err) {
      update(key, (x) => ({
        ...x,
        [which]: {
          ...x[which]!,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  }

  const ready = classes.filter((c) => classStatus(c).tone === "ok");

  async function sizeClasses(list: ClassState[]) {
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const payload = list.map((c) => {
        const alt = new Set(c.alternate ? c.alternateRows : []);
        const groupFor = (slot: CostumeSlot, dancers: ClassSheet["dancers"]) => ({
          chartIds: slot.chartIds,
          dancers,
          costume: {
            companyName: COMPANY_NAMES[slot.companySlug] ?? slot.companySlug,
            styleNumber: slot.lookup!.costume.styleNumber,
            name: slot.lookup!.costume.name,
            availableSizes: slot.lookup!.costume.availableSizes,
            defaultColorway: slot.colorway || undefined,
          },
        });
        const groups = [groupFor(c.primary, c.cls.dancers.filter((d) => !alt.has(d.rowNumber)))];
        if (c.alternate && alt.size > 0) {
          groups.push(groupFor(c.alternate, c.cls.dancers.filter((d) => alt.has(d.rowNumber))));
        }
        return { key: c.key, className: c.cls.className, groups };
      });

      const res = await fetch("/api/workbook/size", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classes: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const next: Record<string, ClassSizeResult> = {};
      for (const r of data.results as ClassSizeResult[]) next[r.key] = r;
      setResults((prev) => ({ ...prev, ...next }));
      setSizedAs((prev) => ({
        ...prev,
        ...Object.fromEntries(list.map((c) => [c.key, signature(c)])),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const sizeAll = () => sizeClasses(ready);

  // Size queued classes once their lookups have settled. A class that is not
  // ready (no chart picked yet, say) just drops out of the queue.
  useEffect(() => {
    if (pending.length === 0 || busy) return;
    const settled = classes.filter(
      (c) =>
        pending.includes(c.key) &&
        c.primary.status !== "loading" &&
        c.alternate?.status !== "loading",
    );
    if (settled.length === 0) return;
    setPending((prev) => prev.filter((k) => !settled.some((c) => c.key === k)));
    sizeClasses(settled.filter((c) => classStatus(c).tone === "ok"));
  }, [pending, classes, busy]);

  /** Every sized dancer across the workbook, with any override applied. */
  const allAssignments = useMemo(() => {
    const out: ExportAssignment[] = [];
    for (const r of Object.values(results)) {
      for (const a of r.assignments) {
        const o = overrides[overrideKey(r.key, a)];
        out.push(
          o?.size ? { ...a, overrideSize: o.size, overrideReason: o.reason || undefined } : a,
        );
      }
    }
    return out;
  }, [results, overrides]);

  async function download(res: Response, fallbackName: string) {
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Download failed (HTTP ${res.status}).`);
    }
    const disposition = res.headers.get("content-disposition") ?? "";
    const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadOrder() {
    setBusy(true);
    try {
      const base = roster.fileName.replace(/\.[^.]+$/, "");
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignments: allAssignments, fileName: `${base}-order` }),
      });
      await download(res, `${base}-order.xlsx`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  /** Reports for every sized class, or just one. */
  const reportsFor = (only?: ClassState): FitReport[] =>
    (only ? [only] : classes)
      .filter((c) => results[c.key] && !results[c.key].error)
      .map((c) => reportFor(c, results[c.key], overrides));

  /**
   * Open the report as its own page and print it. The page is built here, in
   * the click, so the browser treats the new tab as something the user asked for.
   */
  function printReport(only?: ClassState) {
    const reports = reportsFor(only);
    if (reports.length === 0) return;
    const title = only ? only.cls.className : `${roster.fileName} - fit report`;
    const url = URL.createObjectURL(
      new Blob([fitReportHtml(reports, title)], { type: "text/html" }),
    );
    const win = window.open(url, "_blank");
    if (!win) setError("Your browser blocked the print window. Allow pop-ups for this page and try again.");
    // Long enough for the new tab to load it; the URL only lives in memory.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function downloadReport(only?: ClassState) {
    setBusy(true);
    try {
      const reports = reportsFor(only);
      const res = await fetch("/api/export/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reports,
          fileName: only ? only.cls.sheetName : roster.fileName,
        }),
      });
      await download(res, "fit report.xlsx");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function downloadFilled() {
    setBusy(true);
    try {
      const targets: FillTarget[] = classes
        .filter((c) => results[c.key] && !results[c.key].error)
        .map((c) => {
          const altStyle = c.alternate?.lookup?.costume.styleNumber;
          return {
            sheetName: c.cls.sheetName,
            headerRow: c.cls.headerRow,
            sizeColumn: c.cls.sizeColumn,
            headerCount: c.cls.headers.length,
            sizes: results[c.key].assignments.map((a) => {
              const o = overrides[overrideKey(c.key, a)];
              const size = o?.size || a.recommendedSize;
              // Say which costume a boy's size is for, so it cannot be misread.
              const value = altStyle && a.styleNumber === altStyle ? `${size} (${altStyle})` : size;
              return { rowNumber: a.rowNumber ?? 0, value };
            }),
          };
        });

      const form = new FormData();
      const sendOriginal = roster.fileKind === "xlsx" && file;
      if (sendOriginal) form.append("file", file);
      form.append(
        "payload",
        JSON.stringify({
          targets,
          fileName: roster.fileName,
          // A CSV or PDF has no workbook to edit, so its grid is rebuilt instead.
          sheets: sendOriginal
            ? []
            : roster.sheets
                .filter((s) => targets.some((t) => t.sheetName === s.name))
                .map((s) => ({ name: s.name, rows: s.rows })),
        }),
      );
      const res = await fetch("/api/export/filled", { method: "POST", body: form });
      await download(res, "sized.xlsx");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const sizedCount = allAssignments.length;
  const hasResults = Object.keys(results).length > 0;

  return (
    <div className="space-y-5">
      <Card
        title={roster.fileName}
        subtitle={
          <>
            {classes.length} classes found
            {otherTabs.length > 0 ? ` · ignored: ${otherTabs.join(", ")}` : ""}
            {roster.fileKind === "pdf" ? " · read from PDF" : ""}
          </>
        }
        actions={
          <>
            <Button variant="ghost" onClick={onSingleClass}>
              Size one tab at a time
            </Button>
            <Button variant="secondary" onClick={onStartOver}>
              Upload a different file
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={sizeAll} disabled={busy || ready.length === 0}>
            {busy ? "Working…" : `Size ${ready.length} ready class${ready.length === 1 ? "" : "es"}`}
          </Button>
          {hasResults ? (
            <>
              <Button variant="secondary" onClick={downloadOrder} disabled={busy || sizedCount === 0}>
                Download order sheet
              </Button>
              <Button variant="secondary" onClick={() => downloadReport()} disabled={busy || sizedCount === 0}>
                Download fit report (all classes)
              </Button>
              <Button variant="secondary" onClick={() => printReport()} disabled={busy || sizedCount === 0}>
                Print all classes
              </Button>
              <Button variant="secondary" onClick={downloadFilled} disabled={busy || sizedCount === 0}>
                Download {roster.fileKind === "xlsx" ? "my workbook" : "sheet"} with sizes filled in
              </Button>
              <span className="text-sm text-neutral-600 dark:text-neutral-400">
                {sizedCount} dancers sized
              </span>
            </>
          ) : (
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              Classes without a costume or measurements are skipped, not guessed at.
            </span>
          )}
        </div>
        {error ? (
          <div className="mt-4">
            <Alert kind="error">{error}</Alert>
          </div>
        ) : null}
      </Card>

      {classes.map((c) => (
        <ClassCard
          key={c.key}
          state={c}
          charts={charts}
          result={results[c.key]}
          stale={Boolean(results[c.key]) && sizedAs[c.key] !== signature(c)}
          onSize={() => sizeClasses([c])}
          onPrint={() => printReport(c)}
          onDownload={() => downloadReport(c)}
          overrides={overrides}
          busy={busy}
          onChange={(fn) => update(c.key, fn)}
          onLookup={(which) => relookup(c.key, which)}
          onOverride={(k, size, reason) =>
            setOverrides((prev) => {
              const next = { ...prev };
              if (!size) delete next[k];
              else next[k] = { size, reason };
              return next;
            })
          }
        />
      ))}
    </div>
  );
}

function ClassCard({
  state,
  charts,
  result,
  stale,
  onSize,
  onPrint,
  onDownload,
  overrides,
  busy,
  onChange,
  onLookup,
  onOverride,
}: {
  state: ClassState;
  charts: ChartInfo[];
  result?: ClassSizeResult;
  stale: boolean;
  onSize: () => void;
  onPrint: () => void;
  onDownload: () => void;
  overrides: Overrides;
  busy: boolean;
  onChange: (fn: (c: ClassState) => ClassState) => void;
  onLookup: (which: "primary" | "alternate") => void;
  onOverride: (key: string, size: string, reason: string) => void;
}) {
  const { cls } = state;
  const status = classStatus(state);
  const sizeable = cls.dancers.filter((d) => d.girth != null);
  const notMeasured = cls.dancers.length - sizeable.length;
  const warnings = cls.dancers.flatMap((d) =>
    d.issues
      .filter((i) => i.severity === "warning")
      .map((i) => ({ name: d.name || `row ${d.rowNumber}`, message: i.message })),
  );
  const [showBoys, setShowBoys] = useState(false);

  const tone = {
    ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    warn: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    muted: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  }[status.tone];

  return (
    <Card
      title={cls.className}
      subtitle={
        <>
          {cls.sheetName}
          {cls.meta.teacher ? ` · ${cls.meta.teacher}` : ""} · {cls.dancers.length} dancers
          {notMeasured > 0 ? ` · ${notMeasured} not measured` : ""}
          {cls.converted ? " · converted from cm" : ""}
        </>
      }
      actions={<span className={`rounded px-2 py-1 text-xs font-semibold ${tone}`}>{status.label}</span>}
    >
      {cls.meta.costumeNotes ? (
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          <span className="font-medium">Costume notes:</span> {cls.meta.costumeNotes}
        </p>
      ) : null}

      <div className="space-y-3">
        <CostumeRow
          label="Costume"
          slot={state.primary}
          charts={charts}
          onChange={(slot) => onChange((c) => ({ ...c, primary: { ...c.primary, ...slot } }))}
          onLookup={() => onLookup("primary")}
        />
        {state.alternate ? (
          <CostumeRow
            label={`${state.alternate.label} costume`}
            slot={state.alternate}
            charts={charts}
            onChange={(slot) =>
              onChange((c) => ({ ...c, alternate: c.alternate ? { ...c.alternate, ...slot } : null }))
            }
            onLookup={() => onLookup("alternate")}
          />
        ) : null}
      </div>

      {state.alternate ? (
        <div className="mt-4 rounded-lg border border-black/10 p-3 dark:border-white/15">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-medium">
                {state.alternateRows.length} dancer{state.alternateRows.length === 1 ? "" : "s"}
              </span>{" "}
              will wear the {state.alternate.label} costume ({state.alternate.input}).
              {state.alternateRows.length === 0 ? (
                <span className="block text-amber-700 dark:text-amber-300">
                  Nobody is ticked yet, so everyone will be sized in {state.primary.input}.
                </span>
              ) : null}
            </p>
            <Button variant="secondary" onClick={() => setShowBoys((v) => !v)}>
              {showBoys ? "Done" : `Choose who wears the ${state.alternate.label} costume`}
            </Button>
          </div>
          {showBoys ? (
            <ul className="mt-3 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {cls.dancers.map((d) => {
                const checked = state.alternateRows.includes(d.rowNumber);
                return (
                  <li key={d.rowNumber}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          onChange((c) => ({
                            ...c,
                            alternateRows: e.target.checked
                              ? [...c.alternateRows, d.rowNumber]
                              : c.alternateRows.filter((r) => r !== d.rowNumber),
                          }))
                        }
                      />
                      <span>{d.name || `Row ${d.rowNumber}`}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="mt-4">
          <Alert kind="warning" title="Check the sheet">
            <ul className="space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i}>
                  <span className="font-medium">{w.name}:</span> {w.message}
                </li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}

      {status.tone === "ok" && (!result || stale) ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15">
          <Button onClick={onSize} disabled={busy}>
            {busy ? "Sizing…" : result ? "Size again" : "Size this class"}
          </Button>
          <span className={stale ? "text-amber-700 dark:text-amber-300" : "text-neutral-600 dark:text-neutral-400"}>
            {stale
              ? "You changed this class after it was sized, so the sizes below are out of date."
              : "Costume and chart are set."}
          </span>
        </div>
      ) : null}

      {result ? (
        <ClassResults
          state={state}
          result={result}
          onPrint={onPrint}
          onDownload={onDownload}
          overrides={overrides}
          busy={busy}
          onOverride={onOverride}
        />
      ) : null}
    </Card>
  );
}

function CostumeRow({
  label,
  slot,
  charts,
  onChange,
  onLookup,
}: {
  label: string;
  slot: CostumeSlot;
  charts: ChartInfo[];
  onChange: (slot: Partial<CostumeSlot>) => void;
  onLookup: () => void;
}) {
  const costume = slot.lookup?.costume;
  const options = charts.filter((c) => c.companySlug === slot.companySlug && c.status === "confirmed");

  return (
    <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/50">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
            {label}
          </span>
          <select
            className={inputClass}
            value={slot.companySlug}
            onChange={(e) => onChange({ companySlug: e.target.value, status: "idle", lookup: undefined, chartIds: [] })}
          >
            {COMPANIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-48 flex-1">
          <input
            className={inputClass}
            placeholder="Style number or product URL"
            value={slot.input}
            onChange={(e) => onChange({ input: e.target.value, status: "idle" })}
            onKeyDown={(e) => {
              if (e.key === "Enter") onLookup();
            }}
          />
        </div>
        <Button
          variant="secondary"
          onClick={onLookup}
          disabled={!slot.input.trim() || slot.status === "loading"}
        >
          {slot.status === "loading" ? "Looking up…" : "Look up"}
        </Button>
      </div>

      {slot.status === "error" ? (
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">{slot.error}</p>
      ) : null}

      {costume ? (
        <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <div className="min-w-48 flex-1">
            <p className="font-medium">
              {costume.styleNumber} {costume.name}
            </p>
            <p className="text-xs text-neutral-500">
              {costume.availableSizes.length > 0
                ? `Sizes: ${costume.availableSizes.join(", ")}`
                : "Vendor does not list sizes - the whole chart is used."}
            </p>
          </div>
          <fieldset className="w-72">
            <legend className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
              Size chart{slot.chartIds.length > 1 ? "s (used together)" : ""}
            </legend>
            <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-black/15 bg-white px-2 py-1.5 dark:border-white/20 dark:bg-neutral-800">
              {options.map((c) => (
                <label key={c.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={slot.chartIds.includes(c.id)}
                    onChange={(e) =>
                      onChange({
                        chartIds: e.target.checked
                          ? [...slot.chartIds, c.id]
                          : slot.chartIds.filter((id) => id !== c.id),
                      })
                    }
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {costume.colorways.length > 0 ? (
            <label className="w-40">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                Colour
              </span>
              <select
                className={inputClass}
                value={slot.colorway}
                onChange={(e) => onChange({ colorway: e.target.value })}
              >
                {costume.colorways.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {slot.chartIds.length === 0 && slot.lookup ? (
            <p className="w-full text-xs text-amber-700 dark:text-amber-300">
              {slot.lookup.resolution.reason} Tick the chart that matches this class - or more
              than one if the costume&apos;s sizes run across charts.
            </p>
          ) : slot.lookup?.resolution.combined &&
            slot.chartIds.length === slot.lookup.resolution.combined.length ? (
            <p className="w-full text-xs text-neutral-600 dark:text-neutral-400">
              {slot.lookup.resolution.reason}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ClassResults({
  state,
  result,
  onPrint,
  onDownload,
  overrides,
  busy,
  onOverride,
}: {
  state: ClassState;
  result: ClassSizeResult;
  onPrint: () => void;
  onDownload: () => void;
  overrides: Overrides;
  busy: boolean;
  onOverride: (key: string, size: string, reason: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState<"report" | "sizes">("report");
  if (result.error) {
    return (
      <div className="mt-4">
        <Alert kind="error" title="This class could not be sized">
          {result.error}
        </Alert>
      </div>
    );
  }

  /** Sizes the studio could switch a dancer to, for this dancer's costume. */
  const sizesFor = (styleNumber: string): string[] => {
    const slot = [state.primary, state.alternate].find(
      (s) => s?.lookup?.costume.styleNumber === styleNumber,
    );
    const listed = slot?.lookup?.costume.availableSizes ?? [];
    if (listed.length > 0) return listed;
    const chart = result.charts.find((c) => c.styleNumber === styleNumber);
    return chart?.rows.map((r) => r.code) ?? [];
  };

  const all = [...result.assignments].sort((a, b) => (a.rowNumber ?? 0) - (b.rowNumber ?? 0));
  const altStyle = state.alternate?.lookup?.costume.styleNumber;
  const toCheck = all.filter(
    (a) => severityOf(a.flags) !== "ok" || overrides[overrideKey(state.key, a)]?.size,
  );
  const rows = showAll ? all : toCheck;

  const tabs = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="inline-flex rounded-lg border border-black/10 p-0.5 text-sm dark:border-white/15">
        {(
          [
            ["report", "Fit report"],
            ["sizes", "Sizes & overrides"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded-md px-3 py-1 font-medium ${
              view === v
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onPrint} disabled={busy}>
          Print this class
        </Button>
        <Button variant="secondary" onClick={onDownload} disabled={busy}>
          Download this class
        </Button>
      </div>
    </div>
  );

  if (view === "report") {
    return (
      <div className="mt-4">
        {tabs}
        <FitReportTable report={reportFor(state, result, overrides)} />
      </div>
    );
  }

  return (
    <div className="mt-4">
      {tabs}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>
          <span className="font-medium">{all.length} sized</span>
          {" · "}
          {toCheck.length} to check
          {result.skipped.length > 0 ? ` · ${result.skipped.length} not sized` : ""}
        </p>
        <Button variant="ghost" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show only dancers to check" : `Show all ${all.length} dancers`}
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Every size fell cleanly inside its chart range.
        </p>
      ) : null}
      <div className={`overflow-x-auto ${rows.length === 0 ? "hidden" : ""}`}>
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-white/15">
              <th className="pb-2 pr-3 font-medium">Status</th>
              <th className="pb-2 pr-3 font-medium">Dancer</th>
              <th className="pb-2 pr-3 font-medium">Girth</th>
              <th className="pb-2 pr-3 font-medium">Size</th>
              <th className="pb-2 pr-3 font-medium">Override</th>
              <th className="pb-2 font-medium">Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const k = overrideKey(state.key, a);
              const override = overrides[k];
              return (
                <tr key={k} className="border-b border-black/5 align-top dark:border-white/10">
                  <td className="py-2 pr-3">
                    <SeverityBadge severity={severityOf(a.flags)} />
                  </td>
                  <td className="py-2 pr-3 font-medium">
                    {a.dancerName}
                    <span className="block text-xs font-normal text-neutral-500">
                      {altStyle && a.styleNumber === altStyle ? `${a.styleNumber} · ` : ""}
                      {a.colorway ?? "—"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{a.rawGirth}&quot;</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`font-mono font-semibold ${override?.size ? "text-neutral-400 line-through" : ""}`}
                    >
                      {a.recommendedSize}
                    </span>
                    {override?.size ? (
                      <span className="ml-2 font-mono font-semibold">{override.size}</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      className={`${inputClass} py-1`}
                      value={override?.size ?? ""}
                      disabled={busy}
                      onChange={(e) => onOverride(k, e.target.value, override?.reason ?? "")}
                    >
                      <option value="">— keep —</option>
                      {sizesFor(a.styleNumber).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    {override?.size ? (
                      <input
                        className={`${inputClass} mt-1 py-1`}
                        placeholder="Reason (required)"
                        value={override.reason}
                        onChange={(e) => onOverride(k, override.size, e.target.value)}
                      />
                    ) : null}
                  </td>
                  <td className="py-2 text-neutral-600 dark:text-neutral-400">
                    <p>{a.rationale}</p>
                    {a.flags
                      .filter((f) => f.severity !== "info")
                      .map((f, i) => (
                        <p
                          key={i}
                          className={`mt-1 ${
                            f.severity === "blocking"
                              ? "font-medium text-red-700 dark:text-red-300"
                              : "text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          {f.message}
                        </p>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {result.skipped.length > 0 ? (
        <div className="mt-3 text-sm">
          <p className="font-medium">Not sized ({result.skipped.length}):</p>
          <ul className="mt-1 space-y-0.5 text-neutral-600 dark:text-neutral-400">
            {result.skipped.map((s) => (
              <li key={`${s.rowNumber}-${s.dancerName}`}>
                {s.dancerName} — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
