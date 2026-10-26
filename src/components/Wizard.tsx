"use client";

import { useCallback, useEffect, useState } from "react";
import type { HeaderGuess } from "@/lib/import/headers";
import type { ScrapedCostume } from "@/lib/vendors/types";
import type { ChartResolution } from "@/lib/charts/resolve";
import type { ExportAssignment } from "@/lib/export/orderSheet";
import type { SkippedDancer } from "@/lib/sizing/run";
import { DEFAULT_SIZING_OPTIONS, type SizingOptions } from "@/lib/sizing/types";
import { StepRoster } from "./StepRoster";
import { StepCostume } from "./StepCostume";
import { StepResults } from "./StepResults";
import { WorkbookView } from "./WorkbookView";
import { Steps } from "./ui";
import type {
  ChartInfo,
  CostumeResponse,
  RosterResponse,
  SizeResponse,
  SheetData,
  UsedChart,
} from "./types";

const STEPS = ["Roster", "Costume & chart", "Results"];

/** Display names for the order sheet, which groups by company. */
const COMPANY_NAMES: Record<string, string> = {
  revolution: "Revolution",
  weissman: "Weissman",
  awishcometrue: "A Wish Come True",
  laylas: "Layla's",
};

export function Wizard() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestManual, setSuggestManual] = useState(false);

  // Step 1
  const [roster, setRoster] = useState<RosterResponse | null>(null);
  /** The uploaded file, kept so its own workbook can be returned with sizes filled in. */
  const [file, setFile] = useState<File | null>(null);
  /** A workbook can still be sized one tab at a time if the user prefers. */
  const [singleClass, setSingleClass] = useState(false);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [className, setClassName] = useState("");
  const [convertToIn, setConvertToIn] = useState(false);

  // Step 2
  const [companySlug, setCompanySlug] = useState("revolution");
  const [costume, setCostume] = useState<ScrapedCostume | null>(null);
  const [resolution, setResolution] = useState<ChartResolution | null>(null);
  const [charts, setCharts] = useState<ChartInfo[]>([]);
  const [chartId, setChartId] = useState("");
  const [defaultColorway, setDefaultColorway] = useState("");
  const [source, setSource] = useState<"catalog" | "scraped" | "manual" | null>(null);
  /** Partial costume from a vendor that withheld its size list. */
  const [prefill, setPrefill] = useState<
    { styleNumber: string; name: string; sizes: string; colors: string } | null
  >(null);

  // Step 3
  const [assignments, setAssignments] = useState<ExportAssignment[]>([]);
  const [skipped, setSkipped] = useState<SkippedDancer[]>([]);
  const [usedChart, setUsedChart] = useState<UsedChart | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { size: string; reason: string }>>({});
  const [sizingOptions, setSizingOptions] =
    useState<Required<SizingOptions>>(DEFAULT_SIZING_OPTIONS);

  const sheet: SheetData | null = roster?.sheets[sheetIndex] ?? null;

  useEffect(() => {
    fetch("/api/charts")
      .then((r) => r.json())
      .then((d) => setCharts(d.charts ?? []))
      .catch(() => setCharts([]));
  }, []);

  /** Re-derive dancers from the grid we already hold. */
  const remap = useCallback(
    async (index: number, mapping: HeaderGuess[], convert: boolean) => {
      if (!roster) return;
      const target = roster.sheets[index];
      setBusy(true);
      try {
        const res = await fetch("/api/roster/remap", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            rows: target.rows,
            headerRow: target.headerRow,
            mapping,
            convertToInches: convert,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setRoster({
          ...roster,
          sheets: roster.sheets.map((s, i) =>
            i === index
              ? { ...s, mapping, dancers: data.dancers, detectedUnit: data.detectedUnit }
              : s,
          ),
        });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [roster],
  );

  async function handleUpload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/roster", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setRoster(data);
      setFile(file);
      setSingleClass(false);
      setSheetIndex(data.selectedSheet);
      const chosen: SheetData = data.sheets[data.selectedSheet];
      // A centimetre sheet is converted by default; the user can turn it off.
      setConvertToIn(chosen.detectedUnit === "cm");
      if (!className) setClassName(file.name.replace(/\.[^.]+$/, ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRoster(null);
    } finally {
      setBusy(false);
    }
  }

  async function lookupCostume(input: string) {
    setBusy(true);
    setError(null);
    setSuggestManual(false);
    try {
      const res = await fetch("/api/costume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, companySlug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSuggestManual(Boolean(data.suggestManual));
        // Some vendors give up the costume but not its size list. Hand what we
        // did find to the manual form so only the sizes need typing.
        if (data.needsSizes && data.costume) {
          setPrefill({
            styleNumber: data.costume.styleNumber,
            name: data.costume.name,
            sizes: "",
            colors: "",
          });
        }
        throw new Error(data.error);
      }
      setPrefill(null);
      applyCostume(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function manualCostume(input: {
    styleNumber: string;
    name: string;
    sizes: string;
    colors: string;
  }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/costume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "manual", ...input, companySlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      applyCostume(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function applyCostume(data: CostumeResponse) {
    setCostume(data.costume);
    setResolution(data.resolution);
    setSource(data.source ?? null);
    if (data.companySlug) setCompanySlug(data.companySlug);
    // Accept an unambiguous match automatically; otherwise leave it for the user.
    setChartId(data.resolution.chart?.id ?? "");
    setDefaultColorway(data.costume.colorways[0]?.name ?? "");
    setSuggestManual(false);
  }

  /**
   * A chart was just typed in. Reload the library so it appears in the picker,
   * and select it, since it is the chart this costume named.
   */
  async function handleChartSaved(newChartId: string) {
    try {
      const res = await fetch("/api/charts");
      const data = await res.json();
      setCharts(data.charts ?? []);
    } catch {
      // The chart is saved regardless; the list will refresh on the next load.
    }
    setChartId(newChartId);
    setError(null);
  }

  async function run() {
    if (!sheet || !costume) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/size", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          className: className || "Untitled class",
          chartId,
          options: sizingOptions,
          dancers: sheet.dancers,
          costume: {
            companyName: COMPANY_NAMES[companySlug] ?? companySlug,
            styleNumber: costume.styleNumber,
            name: costume.name,
            availableSizes: costume.availableSizes,
            defaultColorway: defaultColorway || undefined,
          },
        }),
      });
      const data: SizeResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error);

      setAssignments(data.assignments);
      setSkipped(data.skipped);
      setUsedChart(data.chart);
      setOverrides({});
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Re-size the class after the studio changes a rule. Overrides are kept: a
   * human decision about a dancer should survive a threshold being nudged.
   */
  async function reSize(next: Required<SizingOptions>) {
    setSizingOptions(next);
    if (!sheet || !costume || !chartId) return;

    setBusy(true);
    try {
      const res = await fetch("/api/size", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          className: className || "Untitled class",
          chartId,
          options: next,
          dancers: sheet.dancers,
          costume: {
            companyName: COMPANY_NAMES[companySlug] ?? companySlug,
            styleNumber: costume.styleNumber,
            name: costume.name,
            availableSizes: costume.availableSizes,
            defaultColorway: defaultColorway || undefined,
          },
        }),
      });
      const data: SizeResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAssignments(data.assignments);
      setSkipped(data.skipped);
      setUsedChart(data.chart);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function exportWorkbook() {
    setBusy(true);
    try {
      const withOverrides: ExportAssignment[] = assignments.map((a) => {
        const o = overrides[a.dancerName];
        return o?.size
          ? { ...a, overrideSize: o.size, overrideReason: o.reason || undefined }
          : a;
      });

      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assignments: withOverrides,
          fileName: `${className || "costume"}-order`,
        }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(className || "costume").replace(/[^a-z0-9._-]+/gi, "-")}-order.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8">
      <header className="mb-7">
        <h1 className="text-xl font-semibold tracking-tight">Costume Sizing</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
          Upload a class roster or a whole costume workbook (.xlsx, .csv or PDF), and get a size for
          every dancer — with the ones who need a human decision called out. Girth decides the size and rounds up, because a
          costume that is too short in girth cannot be worn or altered.
        </p>
        {roster?.workbook && !singleClass ? null : (
          <div className="mt-4">
            <Steps current={step} labels={STEPS} />
          </div>
        )}
      </header>

      {roster?.workbook && !singleClass ? (
        <WorkbookView
          key={`${roster.fileName}-${file?.lastModified ?? 0}`}
          roster={roster}
          file={file}
          charts={charts}
          onStartOver={() => {
            setRoster(null);
            setFile(null);
            setError(null);
            setStep(1);
          }}
          onSingleClass={() => {
            setSingleClass(true);
            setStep(1);
          }}
        />
      ) : null}

      {(!roster?.workbook || singleClass) && step === 1 ? (
        <StepRoster
          roster={roster}
          sheet={sheet}
          className={className}
          convertToInches={convertToIn}
          busy={busy}
          error={error}
          onUpload={handleUpload}
          onSelectSheet={(i) => {
            setSheetIndex(i);
            setConvertToIn(roster?.sheets[i].detectedUnit === "cm");
          }}
          onChangeMapping={(mapping) => remap(sheetIndex, mapping, convertToIn)}
          onChangeClassName={setClassName}
          onToggleConvert={(on) => {
            setConvertToIn(on);
            if (sheet) remap(sheetIndex, sheet.mapping, on);
          }}
          onNext={() => {
            setError(null);
            setStep(2);
          }}
        />
      ) : null}

      {(!roster?.workbook || singleClass) && step === 2 ? (
        <StepCostume
          companySlug={companySlug}
          costume={costume}
          resolution={resolution}
          source={source}
          charts={charts}
          chartId={chartId}
          defaultColorway={defaultColorway}
          busy={busy}
          error={error}
          suggestManual={suggestManual}
          onChangeCompany={(slug) => {
            setCompanySlug(slug);
            setCostume(null);
            setResolution(null);
            setSource(null);
            setChartId("");
          }}
          prefill={prefill}
          onLookup={lookupCostume}
          onManual={manualCostume}
          onChangeChart={setChartId}
          onChangeColorway={setDefaultColorway}
          onChartSaved={handleChartSaved}
          onBack={() => {
            setError(null);
            setStep(1);
          }}
          onRun={run}
        />
      ) : null}

      {(!roster?.workbook || singleClass) && step === 3 ? (
        <StepResults
          assignments={assignments}
          skipped={skipped}
          dancers={sheet?.dancers ?? []}
          chart={usedChart}
          availableSizes={costume?.availableSizes ?? []}
          overrides={overrides}
          sizingOptions={sizingOptions}
          onChangeSizingOptions={reSize}
          busy={busy}
          onOverride={(dancer, size, reason) =>
            setOverrides((prev) => {
              const next = { ...prev };
              if (!size) delete next[dancer];
              else next[dancer] = { size, reason };
              return next;
            })
          }
          onBack={() => setStep(2)}
          onExport={exportWorkbook}
        />
      ) : null}
    </div>
  );
}
