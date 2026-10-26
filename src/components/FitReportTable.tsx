"use client";

import { useState } from "react";
import { formatRange } from "@/lib/sizing/range";
import {
  MEASURE_LABELS,
  REPORT_MEASURES,
  type CellTone,
  type FitReport,
} from "@/lib/report/fitReport";
import { Button } from "./ui";

/**
 * One class's fit report: each dancer's measurements beside the chart range for
 * the size being ordered and the size each measurement fits on its own,
 * colour-coded, with what does not line up spelled out.
 */

export const TONE_STYLE: Record<CellTone, string> = {
  green: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100",
  yellow: "bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-100",
  red: "bg-rose-200 text-rose-950 font-semibold dark:bg-rose-950 dark:text-rose-100",
  blue: "bg-sky-100 text-sky-900 font-semibold dark:bg-sky-950 dark:text-sky-100",
  grey: "text-neutral-400",
  none: "text-neutral-700 dark:text-neutral-300",
};

const SOURCE_LABEL = { added: "added in app", edited: "edited" } as const;

export function FitReportTable({
  report,
  onEdit,
}: {
  report: FitReport;
  /** Shows an Edit button per dancer when given. */
  onEdit?: (rowNumber: number) => void;
}) {
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const multiPiece = report.charts.length > 1;
  const rows = onlyAlerts ? report.rows.filter((r) => r.alerts.length > 0) : report.rows;
  const { summary } = report;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>
          <span className="font-medium">{summary.sized} dancers sized</span> ·{" "}
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
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-white/15">
              <th className="pb-2 pr-2 font-medium">Dancer</th>
              {multiPiece ? <th className="pb-2 pr-2 font-medium">Piece</th> : null}
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
            {rows.map((r, i) => {
              // A dancer with several pieces gets one row per piece; only the
              // first shows the name and the Edit button.
              const first = i === 0 || rows[i - 1].rowNumber !== r.rowNumber;
              return (
                <tr
                  key={`${r.rowNumber}-${r.styleNumber ?? "none"}`}
                  className={`align-top ${first ? "border-t border-black/10 dark:border-white/15" : ""}`}
                >
                  <td className="py-1.5 pr-2">
                    {first ? (
                      <>
                        <span className="font-medium">{r.name}</span>
                        {r.source ? (
                          <span className="ml-1 rounded bg-violet-100 px-1 text-[11px] text-violet-900 dark:bg-violet-950 dark:text-violet-200">
                            {SOURCE_LABEL[r.source]}
                          </span>
                        ) : null}
                        {onEdit ? (
                          <button
                            type="button"
                            onClick={() => onEdit(r.rowNumber)}
                            className={`mt-0.5 block text-xs underline ${
                              r.notSized
                                ? "font-semibold text-rose-700 dark:text-rose-300"
                                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                            }`}
                          >
                            {r.notSized ? "Add measurements" : "Edit"}
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </td>
                  {multiPiece ? (
                    <td className="py-1.5 pr-2 text-xs">
                      {r.styleNumber ? (
                        <>
                          <span className="font-medium">{r.styleNumber}</span>
                          <span className="block text-neutral-500">{r.costumeName}</span>
                        </>
                      ) : null}
                    </td>
                  ) : null}
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
                          r.notSized ? "text-neutral-400" : TONE_STYLE[c.tone]
                        }`}
                      >
                        <span className={c.measure === "girth" ? "font-semibold" : ""}>{c.text}</span>
                        {c.range && !r.notSized ? (
                          <span className="block text-[11px] opacity-70">
                            {r.size}: {formatRange(c.range)}
                          </span>
                        ) : null}
                        {c.fitsSize && !r.notSized ? (
                          <span className="block text-[11px] font-medium">fits {c.fitsSize}</span>
                        ) : null}
                      </div>
                    </td>
                  ))}
                  <td className="py-1.5 pl-2 text-xs">
                    {r.alerts.length === 0 ? (
                      <span className="text-emerald-700 dark:text-emerald-300">All lined up</span>
                    ) : (
                      <ul className="space-y-0.5 text-rose-800 dark:text-rose-200">
                        {r.alerts.map((a, j) => (
                          <li key={j}>{a}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
        <Legend tone="green" text="✓ fits the size ordered" />
        <Legend tone="yellow" text={'off by 2" or less (alterable) · inseam right on (no room to grow)'} />
        <Legend tone="red" text={'needs attention · inseam over the leg, or 4"+ under'} />
        <Legend tone="blue" text="▼ under by more — roomy" />
        <span>&quot;fits&quot; = the size that measurement alone would pick. Girth decides.</span>
      </div>
    </div>
  );
}

function Legend({ tone, text }: { tone: CellTone; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-5 rounded ${TONE_STYLE[tone]}`} />
      <span>{text}</span>
    </span>
  );
}
