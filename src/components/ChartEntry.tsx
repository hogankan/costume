"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { parseRangeInput } from "@/lib/charts/parseRange";
import type { ChartIssue } from "@/lib/charts/validate";
import type { ExtractedChart, ExtractedRange } from "@/lib/charts/schema";
import { Alert, Button, Card, Field, inputClass } from "./ui";

/**
 * Type a vendor's size chart in by hand.
 *
 * This is the path that needs no API key. The vendor's own chart image sits
 * beside the table so the numbers can be copied straight across, and the size
 * codes are pre-filled from the costume that sent you here, so in the common case
 * the only thing to do is fill in numbers.
 */

const MEASURES = ["girth", "bust", "waist", "hips", "inseam", "height"] as const;
type Measure = (typeof MEASURES)[number];

interface Row {
  code: string;
  label: string;
  values: Record<Measure, string>;
}

const blankRow = (code = ""): Row => ({
  code,
  label: "",
  values: { girth: "", bust: "", waist: "", hips: "", inseam: "", height: "" },
});

export function ChartEntry({
  companySlug,
  companyName,
  suggestedVariant,
  chartImageUrl,
  sizeCodes,
  onSaved,
  onCancel,
}: {
  companySlug: string;
  companyName: string;
  suggestedVariant: string;
  chartImageUrl?: string;
  /** Size codes the costume offers, used to pre-fill the rows. */
  sizeCodes: string[];
  onSaved: (chartId: string) => void;
  onCancel: () => void;
}) {
  const [variant, setVariant] = useState(suggestedVariant);
  const [rows, setRows] = useState<Row[]>(() =>
    sizeCodes.length > 0 ? sizeCodes.map((c) => blankRow(c)) : [blankRow(), blankRow(), blankRow()],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ChartIssue[]>([]);

  const setCell = (i: number, key: Measure, value: string) =>
    setRows((prev) =>
      prev.map((r, j) => (j === i ? { ...r, values: { ...r.values, [key]: value } } : r)),
    );

  /** Which cells the user has typed something unparseable into. */
  const badCells = useMemo(() => {
    const bad = new Set<string>();
    rows.forEach((r, i) => {
      for (const m of MEASURES) {
        if (parseRangeInput(r.values[m]) === "invalid") bad.add(`${i}.${m}`);
      }
    });
    return bad;
  }, [rows]);

  const filledRows = rows.filter((r) => r.code.trim() !== "");
  const missingGirth = filledRows.filter((r) => r.values.girth.trim() === "");

  async function save() {
    setSaving(true);
    setError(null);
    setIssues([]);

    try {
      const chart: ExtractedChart = {
        variant,
        unit: "in",
        // Manual entry currently covers girth charts; a chart with no girth
        // column would need this switched to "bust".
        primaryMeasurement: "girth",
        notes: [],
        rows: filledRows.map((r, ordinal) => {
          const range = (m: Measure): ExtractedRange | null => {
            const parsed = parseRangeInput(r.values[m]);
            return parsed === "invalid" || parsed === null ? null : parsed;
          };
          const girth = range("girth");
          return {
            code: r.code.trim().toUpperCase(),
            label: r.label.trim() || null,
            ordinal,
            girth: girth ?? { min: null, max: null },
            bust: range("bust"),
            waist: range("waist"),
            hips: range("hips"),
            inseam: range("inseam"),
            height: range("height"),
          };
        }),
      };

      const res = await fetch("/api/charts/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companySlug,
          variant,
          label: `${companyName} ${variant}`,
          sourceImageUrl: chartImageUrl ?? "",
          chart,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIssues(data.issues ?? []);
        throw new Error(data.error);
      }
      onSaved(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Type in the size chart"
      subtitle="Copy the numbers from the vendor's chart. Ranges go in as the chart prints them — 43-46, 46+, up to 46."
      actions={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving || filledRows.length === 0 || badCells.size > 0 || missingGirth.length > 0}
          >
            {saving ? "Saving…" : "Save chart"}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div>
          <Field label="Chart name" hint="Used as the filename, so keep it recognisable.">
            <input
              className={inputClass}
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
            />
          </Field>

          {chartImageUrl ? (
            <div className="mt-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                The vendor&apos;s chart
              </p>
              <a href={chartImageUrl} target="_blank" rel="noreferrer" title="Open full size">
                <Image
                  src={chartImageUrl}
                  alt="Vendor size chart"
                  width={840}
                  height={600}
                  unoptimized
                  className="h-auto w-full rounded-lg border border-black/10 bg-white dark:border-white/15"
                />
              </a>
              <p className="mt-1 text-xs text-neutral-500">
                Click to open it full size in a new tab.
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <Alert kind="info">
                This costume did not name a chart image, so type the numbers from wherever the
                vendor publishes them.
              </Alert>
            </div>
          )}
        </div>

        <div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-white/15">
                  <th className="pb-2 pr-2 font-medium">Size</th>
                  {MEASURES.map((m) => (
                    <th
                      key={m}
                      className={`pb-2 pr-2 ${m === "girth" ? "font-semibold text-neutral-700 dark:text-neutral-300" : "font-medium"}`}
                    >
                      {m}
                      {m === "girth" ? " *" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-black/5 dark:border-white/10">
                    <td className="py-1 pr-2">
                      <input
                        className={`${inputClass} w-20 py-1 font-mono`}
                        value={row.code}
                        placeholder="MC"
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r, j) => (j === i ? { ...r, code: e.target.value } : r)),
                          )
                        }
                      />
                    </td>
                    {MEASURES.map((m) => {
                      const bad = badCells.has(`${i}.${m}`);
                      const needsGirth = m === "girth" && row.code.trim() !== "" && row.values.girth.trim() === "";
                      return (
                        <td key={m} className="py-1 pr-2">
                          <input
                            className={`${inputClass} w-24 py-1 ${
                              bad || needsGirth
                                ? "border-red-500 focus:border-red-500 dark:border-red-500"
                                : ""
                            }`}
                            value={row.values[m]}
                            placeholder={m === "girth" ? "43-46" : ""}
                            onChange={(e) => setCell(i, m, e.target.value)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setRows((p) => [...p, blankRow()])}>
              Add a size
            </Button>
            {rows.length > 1 ? (
              <Button variant="ghost" onClick={() => setRows((p) => p.slice(0, -1))}>
                Remove last
              </Button>
            ) : null}
          </div>

          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            Girth is required on every size — it is the measurement that decides the size. Leave a
            column blank if the chart does not print it.
          </p>

          {badCells.size > 0 ? (
            <div className="mt-3">
              <Alert kind="error" title={`${badCells.size} cell(s) could not be read`}>
                Use the form the chart prints: <code className="font-mono">43-46</code>,{" "}
                <code className="font-mono">46</code>, <code className="font-mono">46+</code> or{" "}
                <code className="font-mono">up to 46</code>.
              </Alert>
            </div>
          ) : null}

          {missingGirth.length > 0 ? (
            <div className="mt-3">
              <Alert kind="warning" title="Every size needs a girth range">
                Missing on: {missingGirth.map((r) => r.code).join(", ")}
              </Alert>
            </div>
          ) : null}

          {error ? (
            <div className="mt-3">
              <Alert kind="error" title="Could not save">
                <p>{error}</p>
                {issues.length > 0 ? (
                  <ul className="mt-2 list-disc pl-5">
                    {issues
                      .filter((i) => i.severity === "error")
                      .map((i, n) => (
                        <li key={n}>{i.message}</li>
                      ))}
                  </ul>
                ) : null}
              </Alert>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
