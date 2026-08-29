"use client";

import type { ImportedDancer } from "@/lib/import/parse";
import type { ExportAssignment } from "@/lib/export/orderSheet";
import type { Flag, MeasurementKey, SizeRow } from "@/lib/sizing/types";
import { formatRange } from "@/lib/sizing/range";
import type { UsedChart } from "./types";
import { Card } from "./ui";

const COLUMNS: MeasurementKey[] = ["girth", "bust", "waist", "hips", "inseam", "height"];

/**
 * The class as it was uploaded, with every measurement that fell outside the
 * assigned size highlighted in place.
 *
 * This is the view that makes a recommendation checkable at a glance: a studio
 * can see the whole class as a grid and spot immediately who is out of range and
 * on which dimension, instead of reading the reasoning dancer by dancer.
 */
export function MeasurementsTable({
  dancers,
  assignments,
  chart,
  overrides,
}: {
  dancers: ImportedDancer[];
  assignments: ExportAssignment[];
  chart: UsedChart;
  overrides: Record<string, { size: string; reason: string }>;
}) {
  const byRow = new Map<number, ExportAssignment>();
  for (const a of assignments) if (a.rowNumber != null) byRow.set(a.rowNumber, a);

  const rowFor = (code: string): SizeRow | undefined =>
    chart.rows.find((r) => r.code.toUpperCase() === code.toUpperCase());

  return (
    <Card
      title="Class measurements"
      subtitle="Every measurement outside the assigned size is highlighted, with how far out it is."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-white/15">
              <th className="pb-2 pr-3 font-medium">Row</th>
              <th className="pb-2 pr-3 font-medium">Dancer</th>
              <th className="pb-2 pr-3 font-medium">Size</th>
              {COLUMNS.map((c) => (
                <th
                  key={c}
                  className={`pb-2 pr-3 ${
                    c === "girth"
                      ? "font-semibold text-neutral-700 dark:text-neutral-300"
                      : "font-medium"
                  }`}
                >
                  {c}
                  {c === "girth" ? " ★" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dancers.map((d) => {
              const assignment = byRow.get(d.rowNumber);
              const size = assignment
                ? overrides[assignment.dancerName]?.size || assignment.recommendedSize
                : null;
              const sizeRow = size ? rowFor(size) : undefined;

              // Flags carry the exact range and distance, so reuse them rather
              // than recomputing the comparison here.
              const flagFor = new Map<string, Flag>();
              for (const f of assignment?.flags ?? []) {
                // Garment-spec notes carry no direction, so they are not
                // deviations and must not be marked as over or under.
                if (f.code === "MEASUREMENT_OUT_OF_RANGE" && f.measure && f.direction) {
                  flagFor.set(f.measure, f);
                }
              }

              return (
                <tr
                  key={d.rowNumber}
                  className={`border-b border-black/5 dark:border-white/10 ${
                    assignment ? "" : "bg-neutral-50 text-neutral-400 dark:bg-neutral-900/60"
                  }`}
                >
                  <td className="py-1.5 pr-3 text-neutral-400">{d.rowNumber}</td>
                  <td className="py-1.5 pr-3 font-medium">
                    {d.name || <span className="text-red-600">(no name)</span>}
                  </td>
                  <td className="py-1.5 pr-3">
                    {size ? (
                      <span className="font-mono font-semibold">{size}</span>
                    ) : (
                      <span className="text-xs italic">not sized</span>
                    )}
                  </td>

                  {COLUMNS.map((c) => {
                    const value = c === "girth" ? d.girth : d[c];
                    const flag = flagFor.get(c);
                    const range = sizeRow?.[c];

                    if (value == null) {
                      return (
                        <td key={c} className="py-1.5 pr-3">
                          {c === "girth" ? (
                            <span className="font-semibold text-red-600">missing</span>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                      );
                    }

                    // Girth decided the size, so it is marked as the driver
                    // rather than as a problem.
                    if (c === "girth") {
                      return (
                        <td key={c} className="py-1.5 pr-3">
                          <span
                            className="inline-block rounded bg-neutral-900 px-1.5 py-0.5 font-semibold tabular-nums text-white dark:bg-white dark:text-neutral-900"
                            title={
                              range
                                ? `${size} girth range ${formatRange(range)} — girth decided this size`
                                : undefined
                            }
                          >
                            {value}
                          </span>
                          {range ? (
                            <span className="ml-1 text-xs text-neutral-500">
                              {formatRange(range)}
                            </span>
                          ) : null}
                        </td>
                      );
                    }

                    if (!flag) {
                      return (
                        <td key={c} className="py-1.5 pr-3 tabular-nums">
                          {value}
                        </td>
                      );
                    }

                    const over = flag.direction === "over";
                    return (
                      <td key={c} className="py-1.5 pr-3">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums ${
                            over
                              ? "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200"
                              : "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200"
                          }`}
                          title={flag.message}
                        >
                          {value} {over ? "▲" : "▼"}
                          {flag.delta}
                        </span>
                        {range ? (
                          <span className="ml-1 text-xs text-neutral-500">
                            {formatRange(range)}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-neutral-600 dark:text-neutral-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block rounded bg-neutral-900 px-1.5 py-0.5 font-semibold text-white dark:bg-white dark:text-neutral-900">
            45
          </span>
          girth — decides the size
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-900 dark:bg-rose-950 dark:text-rose-200">
            ▲
          </span>
          above the size&apos;s range — costume may need letting out
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-200">
            ▼
          </span>
          below the range — costume will be roomy, can be taken in
        </span>
      </div>

      <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
        Highlighted cells never change the recommended size. Girth alone decides it, because a
        costume that is too short in girth cannot be worn or altered.
      </p>
    </Card>
  );
}
