"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClassSheet } from "@/lib/import/workbook";
import type { ImportedDancer } from "@/lib/import/parse";
import type { LookupResult } from "@/lib/costume/lookup";
import type { ExportAssignment } from "@/lib/export/orderSheet";
import type { Flag } from "@/lib/sizing/types";
import type { CostumeLookupOutcome } from "@/app/api/workbook/costumes/route";
import type { ClassSizeResult } from "@/app/api/workbook/size/route";
import { buildFitReport, reportOverrideKey, type FitReport } from "@/lib/report/fitReport";
import { fitReportHtml } from "@/lib/report/fitHtml";
import {
  ADDED_ROW_BASE,
  buildManualDancer,
  formFromDancer,
  type DancerForm,
} from "@/lib/import/manualDancer";
import { Alert, Button, Card, SeverityBadge, inputClass } from "./ui";
import { COMPANIES, type ChartInfo, type RosterResponse } from "./types";
import { FitReportTable } from "./FitReportTable";
import { DancerFormPanel } from "./DancerForm";

/**
 * Size a whole costume workbook: one card per class, with the costume read from
 * the class's own tab. A class can dress two groups of dancers differently (the
 * boys, usually) and each group's costume can have several pieces - a top and
 * pants - each sized against its own chart. Classes that are not ready are
 * shown and skipped rather than blocking the rest.
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

interface Piece extends CostumeSlot {
  id: string;
}

interface Group {
  /** "main" dresses everyone not ticked for "alt". */
  id: "main" | "alt";
  /** For the alternate group: "Boys", or whatever the sheet called it. */
  label: string;
  pieces: Piece[];
}

interface ClassState {
  key: string;
  cls: ClassSheet;
  groups: Group[];
  /** Row numbers ticked to wear the alternate group's costume. Never guessed. */
  alternateRows: number[];
}

type Overrides = Record<string, { size: string; reason: string }>;

let nextPieceId = 0;
const newPiece = (companySlug: string, input = ""): Piece => ({
  id: `p${++nextPieceId}`,
  companySlug,
  input,
  status: "idle",
  chartIds: [],
  colorway: "",
});

const overrideKey = (classKey: string, rowNumber: number | undefined, styleNumber: string) =>
  `${classKey}|${rowNumber ?? "?"}|${styleNumber}`;

const severityOf = (flags: Flag[]): "blocking" | "warning" | "ok" =>
  flags.some((f) => f.severity === "blocking")
    ? "blocking"
    : flags.some((f) => f.severity === "warning")
      ? "warning"
      : "ok";

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function altLabel(label: string): string {
  if (/\b(boys?|guys?|male|men)\b/i.test(label)) return "Boys";
  return label === "alternate" ? "Second group" : capitalise(label);
}

function groupTitle(c: ClassState, g: Group): string {
  if (g.id === "alt") return `${g.label}' costume`;
  return c.groups.some((x) => x.id === "alt") ? "Girls' costume" : "Costume";
}

function initialState(classes: ClassSheet[]): ClassState[] {
  return classes
    .filter((c) => c.kind === "class")
    .map((cls) => {
      const parsed = cls.costume;
      const selected = parsed.status === "selected";
      const company = selected ? parsed.companySlug : "awishcometrue";
      const groups: Group[] = [
        {
          id: "main",
          label: "",
          pieces: selected ? parsed.pieces.map((p) => newPiece(company, p)) : [newPiece(company)],
        },
      ];
      if (selected && parsed.alternate) {
        groups.push({
          id: "alt",
          label: altLabel(parsed.alternate.label),
          pieces: parsed.alternate.pieces.map((p) => newPiece(company, p)),
        });
      }
      return { key: cls.sheetName, cls, groups, alternateRows: cls.suggestedAlternate };
    });
}

const filled = (pieces: Piece[]) => pieces.filter((p) => p.input.trim());
const mainGroup = (c: ClassState) => c.groups.find((g) => g.id === "main")!;
const altGroup = (c: ClassState) => c.groups.find((g) => g.id === "alt");
const allPieces = (c: ClassState) => c.groups.flatMap((g) => g.pieces);

/** Pieces that will actually be sized: the alternate only matters once someone is ticked. */
function activePieces(c: ClassState): Piece[] {
  const alt = altGroup(c);
  return [
    ...filled(mainGroup(c).pieces),
    ...(alt && c.alternateRows.length > 0 ? filled(alt.pieces) : []),
  ];
}

function applyOutcome(slot: Piece, outcome: CostumeLookupOutcome | undefined): Piece {
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

function classStatus(c: ClassState): { label: string; tone: "ok" | "warn" | "muted" } {
  const sizeable = c.cls.dancers.filter((d) => d.girth != null).length;
  if (sizeable === 0) return { label: "No measurements", tone: "muted" };
  if (filled(mainGroup(c).pieces).length === 0)
    return { label: "Costume not selected yet", tone: "muted" };
  const alt = altGroup(c);
  if (alt && c.alternateRows.length > 0 && filled(alt.pieces).length === 0)
    return { label: `Enter the ${alt.label.toLowerCase()}' costume`, tone: "warn" };
  const active = activePieces(c);
  if (active.some((p) => p.status === "loading"))
    return { label: "Looking up costume…", tone: "muted" };
  if (active.some((p) => p.status === "error")) return { label: "Costume not found", tone: "warn" };
  if (active.some((p) => p.status !== "ok")) return { label: "Look up the costume", tone: "warn" };
  if (active.some((p) => p.chartIds.length === 0))
    return { label: "Pick a size chart", tone: "warn" };
  return { label: "Ready", tone: "ok" };
}

/**
 * Everything a class's sizes depend on. When this changes after sizing, the
 * shown sizes no longer match what is on screen.
 */
function signature(c: ClassState): string {
  return JSON.stringify([
    activePieces(c).map((p) => [
      p.companySlug,
      p.lookup?.costume.styleNumber,
      [...p.chartIds].sort(),
      p.colorway,
    ]),
    [...c.alternateRows].sort((a, b) => a - b),
    c.cls.dancers.map((d) => [d.rowNumber, d.name, d.girth, d.bust, d.waist, d.hips, d.inseam, d.height]),
  ]);
}

/** The fit report for one sized class, with the studio's overrides applied. */
function reportFor(c: ClassState, result: ClassSizeResult, overrides: Overrides): FitReport {
  const byPiece: Record<string, { size: string; reason: string }> = {};
  for (const a of result.assignments) {
    const o = overrides[overrideKey(c.key, a.rowNumber, a.styleNumber)];
    if (o?.size && a.rowNumber != null) byPiece[reportOverrideKey(a.rowNumber, a.styleNumber)] = o;
  }
  return buildFitReport({
    className: c.cls.className,
    sheetName: c.cls.sheetName,
    teacher: c.cls.meta.teacher,
    dancers: c.cls.dancers,
    assignments: result.assignments,
    skipped: result.skipped,
    charts: result.charts,
    overrides: byPiece,
  });
}

export function WorkbookView({
  roster,
  charts,
  onStartOver,
}: {
  roster: RosterResponse;
  charts: ChartInfo[];
  onStartOver: () => void;
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

  const updatePiece = (key: string, pieceId: string, fn: (p: Piece) => Piece) =>
    update(key, (c) => ({
      ...c,
      groups: c.groups.map((g) => ({
        ...g,
        pieces: g.pieces.map((p) => (p.id === pieceId ? fn(p) : p)),
      })),
    }));

  const queue = (key: string) =>
    setPending((prev) => (prev.includes(key) ? prev : [...prev, key]));

  // Look up every costume named on the sheet once, as soon as the file is read,
  // then size whatever is ready.
  useEffect(() => {
    const items = classes
      .flatMap(allPieces)
      .filter((p) => p.input.trim() && p.status === "idle")
      .map((p) => ({ companySlug: p.companySlug, style: p.input.trim() }));
    if (items.length === 0) {
      setPending(classes.map((c) => c.key));
      return;
    }

    const markLoading = (p: Piece): Piece =>
      p.input.trim() && p.status === "idle" ? { ...p, status: "loading" } : p;
    setClasses((prev) =>
      prev.map((c) => ({
        ...c,
        groups: c.groups.map((g) => ({ ...g, pieces: g.pieces.map(markLoading) })),
      })),
    );

    lookupMany(items)
      .then((found) =>
        setClasses((prev) =>
          prev.map((c) => ({
            ...c,
            groups: c.groups.map((g) => ({
              ...g,
              pieces: g.pieces.map((p) =>
                p.status === "loading" ? applyOutcome(p, found[slotKey(p)]) : p,
              ),
            })),
          })),
        ),
      )
      .then(() => setPending(classes.map((c) => c.key)))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    // Runs once per upload; later lookups are triggered per piece.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function relookup(key: string, pieceId: string) {
    const piece = classes
      .find((x) => x.key === key)
      ?.groups.flatMap((g) => g.pieces)
      .find((p) => p.id === pieceId);
    if (!piece || !piece.input.trim()) return;
    updatePiece(key, pieceId, (p) => ({ ...p, status: "loading" }));
    try {
      const found = await lookupMany([{ companySlug: piece.companySlug, style: piece.input.trim() }]);
      updatePiece(key, pieceId, (p) => applyOutcome(p, found[slotKey(piece)]));
      // Show sizes straight away once the costume is found.
      queue(key);
    } catch (err) {
      updatePiece(key, pieceId, (p) => ({
        ...p,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  async function sizeClasses(list: ClassState[]) {
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const payload = list.map((c) => {
        const alt = altGroup(c);
        const altRows = new Set(alt ? c.alternateRows : []);
        const groupFor = (piece: Piece, dancers: ImportedDancer[]) => ({
          chartIds: piece.chartIds,
          dancers,
          costume: {
            companyName: COMPANY_NAMES[piece.companySlug] ?? piece.companySlug,
            styleNumber: piece.lookup!.costume.styleNumber,
            name: piece.lookup!.costume.name,
            availableSizes: piece.lookup!.costume.availableSizes,
            defaultColorway: piece.colorway || undefined,
          },
        });
        const mainDancers = c.cls.dancers.filter((d) => !altRows.has(d.rowNumber));
        const altDancers = c.cls.dancers.filter((d) => altRows.has(d.rowNumber));
        const groups = [
          ...filled(mainGroup(c).pieces).map((p) => groupFor(p, mainDancers)),
          ...(alt && altDancers.length > 0
            ? filled(alt.pieces).map((p) => groupFor(p, altDancers))
            : []),
        ];
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

  // Size queued classes once their lookups have settled. A class that is not
  // ready (no chart picked yet, say) just drops out of the queue.
  useEffect(() => {
    if (pending.length === 0 || busy) return;
    const settled = classes.filter(
      (c) => pending.includes(c.key) && !allPieces(c).some((p) => p.status === "loading"),
    );
    if (settled.length === 0) return;
    setPending((prev) => prev.filter((k) => !settled.some((c) => c.key === k)));
    sizeClasses(settled.filter((c) => classStatus(c).tone === "ok"));
  }, [pending, classes, busy]);

  /** Save a dancer typed into the app, then re-size their class. */
  function saveDancer(key: string, dancer: ImportedDancer) {
    update(key, (c) => {
      const exists = c.cls.dancers.some((d) => d.rowNumber === dancer.rowNumber);
      const dancers = exists
        ? c.cls.dancers.map((d) => (d.rowNumber === dancer.rowNumber ? dancer : d))
        : [...c.cls.dancers, dancer];
      return { ...c, cls: { ...c.cls, dancers } };
    });
    queue(key);
  }

  /** Every sized dancer across the workbook, with any override applied. */
  const allAssignments = useMemo(() => {
    const out: ExportAssignment[] = [];
    for (const r of Object.values(results)) {
      for (const a of r.assignments) {
        const o = overrides[overrideKey(r.key, a.rowNumber, a.styleNumber)];
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
  function printReport(only: ClassState) {
    const reports = reportsFor(only);
    if (reports.length === 0) return;
    const url = URL.createObjectURL(
      new Blob([fitReportHtml(reports, only.cls.className)], { type: "text/html" }),
    );
    const win = window.open(url, "_blank");
    if (!win) setError("Your browser blocked the print window. Allow pop-ups for this page and try again.");
    // Long enough for the new tab to load it; the URL only lives in memory.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function downloadReport(only?: ClassState) {
    setBusy(true);
    try {
      const res = await fetch("/api/export/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reports: reportsFor(only),
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

  const sizedClasses = classes.filter((c) => results[c.key] && !results[c.key].error);
  const waiting = classes.filter((c) => !sizedClasses.includes(c));
  const anyEdits = classes.some((c) => c.cls.dancers.some((d) => d.source));

  return (
    <div className="space-y-5">
      <Card
        title={roster.fileName}
        subtitle={
          <>
            {classes.length} class{classes.length === 1 ? "" : "es"}
            {otherTabs.length > 0 ? ` · ignored: ${otherTabs.join(", ")}` : ""}
            {roster.fileKind === "pdf" ? " · read from PDF" : ""}
          </>
        }
        actions={
          <Button variant="ghost" onClick={onStartOver}>
            Upload a different file
          </Button>
        }
      >
        <Alert
          kind={waiting.length === 0 ? "success" : "info"}
          title={`${sizedClasses.length} of ${classes.length} classes sized`}
        >
          {waiting.length === 0 ? (
            "Every class is sized."
          ) : (
            <ul className="mt-1 space-y-0.5">
              {waiting.map((c) => (
                <li key={c.key}>
                  <span className="font-medium">{c.cls.sheetName}</span> — {classStatus(c).label}
                </li>
              ))}
            </ul>
          )}
        </Alert>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={downloadOrder} disabled={busy || allAssignments.length === 0}>
            Download order sheet
          </Button>
          <Button
            variant="secondary"
            onClick={() => downloadReport()}
            disabled={busy || allAssignments.length === 0}
          >
            Download fit report (all classes)
          </Button>
        </div>

        {anyEdits ? (
          <p className="mt-3 text-sm text-violet-800 dark:text-violet-200">
            Dancers added or edited here stay until you close or refresh this page — update your
            spreadsheet too.
          </p>
        ) : null}
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
          overrides={overrides}
          busy={busy}
          onChange={(fn) => update(c.key, fn)}
          onChangePiece={(pieceId, patch) =>
            updatePiece(c.key, pieceId, (p) => ({ ...p, ...patch }))
          }
          onLookup={(pieceId) => relookup(c.key, pieceId)}
          onSize={() => sizeClasses([c])}
          onPrint={() => printReport(c)}
          onDownload={() => downloadReport(c)}
          onSaveDancer={(d) => saveDancer(c.key, d)}
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

type Editing = { mode: "add" } | { mode: "edit"; rowNumber: number } | null;

function ClassCard({
  state,
  charts,
  result,
  stale,
  overrides,
  busy,
  onChange,
  onChangePiece,
  onLookup,
  onSize,
  onPrint,
  onDownload,
  onSaveDancer,
  onOverride,
}: {
  state: ClassState;
  charts: ChartInfo[];
  result?: ClassSizeResult;
  stale: boolean;
  overrides: Overrides;
  busy: boolean;
  onChange: (fn: (c: ClassState) => ClassState) => void;
  onChangePiece: (pieceId: string, patch: Partial<Piece>) => void;
  onLookup: (pieceId: string) => void;
  onSize: () => void;
  onPrint: () => void;
  onDownload: () => void;
  onSaveDancer: (d: ImportedDancer) => void;
  onOverride: (key: string, size: string, reason: string) => void;
}) {
  const { cls } = state;
  const status = classStatus(state);
  const notMeasured = cls.dancers.filter((d) => d.girth == null);
  const warnings = cls.dancers.flatMap((d) =>
    d.issues
      .filter((i) => i.severity === "warning")
      .map((i) => ({ name: d.name || `row ${d.rowNumber}`, message: i.message })),
  );
  const [showBoys, setShowBoys] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const alt = altGroup(state);

  const tone = {
    ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    warn: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    muted: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  }[status.tone];

  const editingDancer =
    editing?.mode === "edit" ? cls.dancers.find((d) => d.rowNumber === editing.rowNumber) : undefined;

  function startEdit(next: Editing) {
    setFormErrors([]);
    setEditing(next);
  }

  function save(form: DancerForm) {
    const rowNumber =
      editingDancer?.rowNumber ??
      Math.max(ADDED_ROW_BASE, ...cls.dancers.map((d) => d.rowNumber)) + 1;
    const { dancer, errors } = buildManualDancer(form, { existing: editingDancer, rowNumber });
    if (!dancer) {
      setFormErrors(errors);
      return;
    }
    onSaveDancer(dancer);
    setEditing(null);
    setFormErrors([]);
  }

  const setGroups = (fn: (groups: Group[]) => Group[]) =>
    onChange((c) => ({ ...c, groups: fn(c.groups) }));

  const firstCompany = mainGroup(state).pieces[0]?.companySlug ?? "awishcometrue";

  return (
    <Card
      title={cls.className}
      subtitle={
        <>
          {cls.sheetName}
          {cls.meta.teacher ? ` · ${cls.meta.teacher}` : ""} · {cls.dancers.length} dancers
          {notMeasured.length > 0 ? ` · ${notMeasured.length} not measured` : ""}
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

      <div className="space-y-4">
        {state.groups.map((g) => (
          <div key={g.id}>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{groupTitle(state, g)}</h3>
              {g.id === "alt" ? (
                <Button
                  variant="ghost"
                  onClick={() =>
                    onChange((c) => ({
                      ...c,
                      groups: c.groups.filter((x) => x.id !== "alt"),
                      alternateRows: [],
                    }))
                  }
                >
                  Remove {g.label.toLowerCase()}&apos; costume
                </Button>
              ) : null}
            </div>
            <div className="space-y-2">
              {g.pieces.map((p, i) => (
                <CostumeRow
                  key={p.id}
                  label={g.pieces.length > 1 ? `Piece ${i + 1}` : "Style"}
                  slot={p}
                  charts={charts}
                  onChange={(patch) => onChangePiece(p.id, patch)}
                  onLookup={() => onLookup(p.id)}
                  onRemove={
                    g.pieces.length > 1
                      ? () =>
                          setGroups((groups) =>
                            groups.map((x) =>
                              x.id === g.id
                                ? { ...x, pieces: x.pieces.filter((y) => y.id !== p.id) }
                                : x,
                            ),
                          )
                      : undefined
                  }
                />
              ))}
            </div>
            <button
              type="button"
              className="mt-1.5 text-sm font-medium text-neutral-600 underline hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              onClick={() =>
                setGroups((groups) =>
                  groups.map((x) =>
                    x.id === g.id
                      ? {
                          ...x,
                          pieces: [...x.pieces, newPiece(x.pieces[0]?.companySlug ?? firstCompany)],
                        }
                      : x,
                  ),
                )
              }
            >
              + Add another piece (e.g. pants)
            </button>
          </div>
        ))}

        {!alt ? (
          <Button
            variant="secondary"
            onClick={() =>
              setGroups((groups) => [
                ...groups,
                { id: "alt", label: "Boys", pieces: [newPiece(firstCompany)] },
              ])
            }
          >
            + Add a boys&apos; costume
          </Button>
        ) : null}
      </div>

      {alt ? (
        <div className="mt-4 rounded-lg border border-black/10 p-3 dark:border-white/15">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-medium">
                {state.alternateRows.length} dancer{state.alternateRows.length === 1 ? "" : "s"}
              </span>{" "}
              will wear the {alt.label.toLowerCase()}&apos; costume.
              {state.alternateRows.length === 0 ? (
                <span className="block text-amber-700 dark:text-amber-300">
                  Nobody is ticked yet, so everyone will be sized in the main costume.
                </span>
              ) : null}
            </p>
            <Button variant="secondary" onClick={() => setShowBoys((v) => !v)}>
              {showBoys ? "Done" : `Choose who wears the ${alt.label.toLowerCase()}' costume`}
            </Button>
          </div>
          {showBoys ? (
            <ul className="mt-3 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {cls.dancers.map((d) => (
                <li key={d.rowNumber}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={state.alternateRows.includes(d.rowNumber)}
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
              ))}
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

      {/* Dancers who can't be sized yet, with a way to fill them in. Once the
          class is sized the report has an Edit button on every row instead. */}
      {!result && notMeasured.length > 0 ? (
        <div className="mt-4 text-sm">
          <p className="font-medium">Not measured yet:</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {notMeasured.map((d) => (
              <li key={d.rowNumber}>
                <button
                  type="button"
                  onClick={() => startEdit({ mode: "edit", rowNumber: d.rowNumber })}
                  className="rounded border border-rose-300 px-2 py-0.5 text-rose-800 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-950"
                >
                  {d.name || `Row ${d.rowNumber}`} — add measurements
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4">
        {editing ? (
          <DancerFormPanel
            key={editing.mode === "edit" ? editing.rowNumber : "add"}
            title={editingDancer ? `Edit ${editingDancer.name || "dancer"}` : "Add a dancer"}
            initial={formFromDancer(editingDancer)}
            errors={formErrors}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Button variant="secondary" onClick={() => startEdit({ mode: "add" })}>
            + Add dancer
          </Button>
        )}
      </div>

      {status.tone === "ok" && (!result || stale) ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15">
          <Button onClick={onSize} disabled={busy}>
            {busy ? "Sizing…" : result ? "Size again" : "Size this class"}
          </Button>
          <span
            className={
              stale ? "text-amber-700 dark:text-amber-300" : "text-neutral-600 dark:text-neutral-400"
            }
          >
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
          overrides={overrides}
          busy={busy}
          onPrint={onPrint}
          onDownload={onDownload}
          onEdit={(rowNumber) => startEdit({ mode: "edit", rowNumber })}
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
  onRemove,
}: {
  label: string;
  slot: CostumeSlot;
  charts: ChartInfo[];
  onChange: (slot: Partial<CostumeSlot>) => void;
  onLookup: () => void;
  onRemove?: () => void;
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
            onChange={(e) =>
              onChange({ companySlug: e.target.value, status: "idle", lookup: undefined, chartIds: [] })
            }
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
        {onRemove ? (
          <Button variant="ghost" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
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
  overrides,
  busy,
  onPrint,
  onDownload,
  onEdit,
  onOverride,
}: {
  state: ClassState;
  result: ClassSizeResult;
  overrides: Overrides;
  busy: boolean;
  onPrint: () => void;
  onDownload: () => void;
  onEdit: (rowNumber: number) => void;
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

  /** Sizes the studio could switch a dancer to, for this piece. */
  const sizesFor = (styleNumber: string): string[] => {
    const piece = allPieces(state).find((p) => p.lookup?.costume.styleNumber === styleNumber);
    const listed = piece?.lookup?.costume.availableSizes ?? [];
    if (listed.length > 0) return listed;
    const chart = result.charts.find((c) => c.styleNumber === styleNumber);
    return chart?.rows.map((r) => r.code) ?? [];
  };

  const multiPiece = result.charts.length > 1;
  const all = [...result.assignments].sort((a, b) => (a.rowNumber ?? 0) - (b.rowNumber ?? 0));
  const toCheck = all.filter(
    (a) =>
      severityOf(a.flags) !== "ok" ||
      overrides[overrideKey(state.key, a.rowNumber, a.styleNumber)]?.size,
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
        <FitReportTable report={reportFor(state, result, overrides)} onEdit={onEdit} />
      </div>
    );
  }

  return (
    <div className="mt-4">
      {tabs}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>
          <span className="font-medium">{all.length} sizes</span>
          {" · "}
          {toCheck.length} to check
          {result.skipped.length > 0 ? ` · ${result.skipped.length} not sized` : ""}
        </p>
        <Button variant="ghost" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show only dancers to check" : `Show all ${all.length}`}
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Every size fell cleanly inside its chart range.
        </p>
      ) : (
        <div className="overflow-x-auto">
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
                const k = overrideKey(state.key, a.rowNumber, a.styleNumber);
                const override = overrides[k];
                return (
                  <tr key={k} className="border-b border-black/5 align-top dark:border-white/10">
                    <td className="py-2 pr-3">
                      <SeverityBadge severity={severityOf(a.flags)} />
                    </td>
                    <td className="py-2 pr-3 font-medium">
                      {a.dancerName}
                      <span className="block text-xs font-normal text-neutral-500">
                        {multiPiece ? `${a.styleNumber} ${a.costumeName} · ` : ""}
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
      )}

      {result.skipped.length > 0 ? (
        <div className="mt-3 text-sm">
          <p className="font-medium">Not sized ({result.skipped.length}):</p>
          <ul className="mt-1 space-y-0.5 text-neutral-600 dark:text-neutral-400">
            {result.skipped.map((s) => (
              <li key={`${s.rowNumber}-${s.dancerName}`}>
                {s.dancerName} — {s.reason}{" "}
                <button
                  type="button"
                  className="text-rose-700 underline dark:text-rose-300"
                  onClick={() => onEdit(s.rowNumber)}
                >
                  Add measurements
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
