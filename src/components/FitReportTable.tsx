"use client";

import { useState } from "react";
import { formatRange } from "@/lib/sizing/range";
import {
  MEASURE_LABELS,
  REPORT_MEASURES,
  type CellStatus,
  type FitReport,
} from "@/lib/report/fitReport";
import { Button } from "./ui";

/**
 * One class's fit report: each dancer's measurements beside the chart range for
 * the size being ordered, colour-coded, with what does not line up spelled out.
 */

const CELL_STYLE: Record<CellStatus, string> = {
  fits: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100",
  "slightly-over": "bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100",
  "slightly-under": "bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100",
  over: "bg-rose-100 text-rose-900 font-semibold dark:bg-rose-950 dark:text-rose-100",
  under: "bg-sky-100 text-sky-900 font-semibold dark:bg-sky-950 dark:text-sky-100",
  garment: "text-neutral-700 dark:text-neutral-300",
  "not-on-chart": "text-neutral-500",
  "not-measured": "text-neutral-400",
};

export function FitReportTable({ report }: { report: FitReport }) {
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const multiStyle = report.charts.length > 1;
  const rows = onlyAlerts ? report.rows.filter((r) => r.alerts.length > 0) : report.rows;
  const { summary } = report;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>
          <span className="font-medium">{summary.sized} sized</span> ·{" "}
          <span className="text-emerald-700 dark:text-emerald-300">{summary.clean} all lined up</span> ·{" "}
          <span className={summary.withAlerts ? "font-medium text-rose-700 dark:text-rose-300" : ""}>
            {summary.withAlerts} to check
          </span>
          {summary.notSized ? ` · ${summary.notSized} not sized` : ""}
        </p>
        <Button variant="ghost" onClick={() => setOnlyAlerts((v) => !v)}>
          {onlyAlerts ? "Show every dancer" : "Show only dancers to check"}
        </Button>
      </div>

      <p className="mb-2 text-xs text-neutral-500">
        {report.charts
          .map((c) => `${c.styleNumber}${c.costumeName ? ` ${c.costumeName}` : ""}: ${c.label}`)
          .join(" · ")}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-white/15">
              <th className="pb-2 pr-2 font-medium">Dancer</th>
              <th className="pb-2 pr-2 font-medium">Size</th>
              {REPORT_MEASURES.map((m) => (
                <th key={m} className={`pb-2 pr-1 text-center ${m === "girth" ? "font-semibold" : "font-medium"}`}>
                  {MEASURE_LABELS[m]}
                  {m === "girth" ? " ★" : ""}
                </th>
              ))}
              <th className="pb-2 pl-2 font-medium">What to check</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rowNumber} className="border-b border-black/5 align-top dark:border-white/10">
                <td className="py-1.5 pr-2 font-medium">
                  {r.name}
                  {multiStyle && r.styleNumber ? (
                    <span className="block text-xs font-normal text-neutral-500">{r.styleNumber}</span>
                  ) : null}
                </td>
                <td className="py-1.5 pr-2">
                  {r.notSized ? (
                    <span className="text-xs italic text-neutral-500">not sized</span>
                  ) : (
                    <span className="font-mono font-semibold">
                      {r.size}
                      {r.recommendedSize !== r.size ? (
                        <span className="block text-xs font-normal text-neutral-500">
                          was {r.recommendedSize}
                        </span>
                      ) : null}
                    </span>
                  )}
                </td>
                {r.cells.map((c) => (
                  <td key={c.measure} className="px-0.5 py-1">
                    <div
                      title={c.note}
                      className={`rounded px-1.5 py-0.5 text-center tabular-nums ${
                        r.notSized ? "text-neutral-400" : CELL_STYLE[c.status]
                      }`}
                    >
                      <span className={c.measure === "girth" ? "font-semibold" : ""}>{c.text}</span>
                      {c.range && !r.notSized ? (
                        <span className="block text-[11px] opacity-70">{formatRange(c.range)}</span>
                      ) : null}
                    </div>
                  </td>
                ))}
                <td className="py-1.5 pl-2 text-xs">
                  {r.alerts.length === 0 ? (
                    <span className="text-emerald-700 dark:text-emerald-300">All lined up</span>
                  ) : (
                    <ul className="space-y-0.5 text-rose-800 dark:text-rose-200">
                      {r.alerts.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
        <Legend style={CELL_STYLE.fits} text="✓ inside the chart range" />
        <Legend style={CELL_STYLE["slightly-over"]} text={'▲▼ off by 2" or less — alterable'} />
        <Legend style={CELL_STYLE.over} text="▲ over by more — needs attention" />
        <Legend style={CELL_STYLE.under} text="▼ under by more — roomy / long" />
        <span>Single numbers (like inseam) are how the garment is cut, not a fit range.</span>
      </div>
    </div>
  );
}

function Legend({ style, text }: { style: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-5 rounded ${style}`} />
      <span>{text}</span>
    </span>
  );
}
