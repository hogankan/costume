"use client";

import { useState } from "react";
import Image from "next/image";
import type { SizeRow } from "@/lib/sizing/types";
import { formatRange } from "@/lib/sizing/range";
import type { UsedChart } from "./types";
import { Button, Card } from "./ui";

const MEASURES = ["bust", "waist", "hips", "inseam", "height"] as const;

/**
 * The chart these sizes actually came from.
 *
 * Shown above the recommendations so a studio can check the reasoning against
 * the source table rather than taking the app's word for it. Sizes the costume
 * does not offer are struck through, because a chart row that cannot be ordered
 * is a common source of confusion when the recommendation "skips" a size.
 */
export function ChartTable({
  chart,
  availableSizes,
  usage,
}: {
  chart: UsedChart;
  availableSizes: string[];
  /** How many dancers landed on each size code. */
  usage: Record<string, number>;
}) {
  const [showImage, setShowImage] = useState(false);
  const orderable = new Set(availableSizes.map((s) => s.trim().toUpperCase()));

  return (
    <Card
      title="Size chart used"
      subtitle={
        <>
          <span className="font-mono">{chart.id}</span> · {chart.rows.length} sizes · all
          measurements in inches
        </>
      }
      actions={
        chart.sourceImageUrl ? (
          <Button variant="secondary" onClick={() => setShowImage((v) => !v)}>
            {showImage ? "Hide original image" : "Show original image"}
          </Button>
        ) : undefined
      }
    >
      {showImage && chart.sourceImageUrl ? (
        <div className="mb-4 overflow-x-auto rounded-lg border border-black/10 bg-white p-2 dark:border-white/15">
          {/* The vendor's own chart, for eye-checking the transcription. */}
          <Image
            src={chart.sourceImageUrl}
            alt={`${chart.label} size chart`}
            width={1600}
            height={1000}
            unoptimized
            className="h-auto w-full max-w-none"
          />
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-white/15">
              <th className="pb-2 pr-3 font-medium">Size</th>
              <th className="pb-2 pr-3 font-semibold text-neutral-700 dark:text-neutral-300">
                Girth
              </th>
              {MEASURES.map((m) => (
                <th key={m} className="pb-2 pr-3 font-medium">
                  {m}
                </th>
              ))}
              <th className="pb-2 font-medium">Dancers</th>
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((row: SizeRow) => {
              const canOrder = orderable.has(row.code.toUpperCase());
              const count = usage[row.code] ?? 0;
              return (
                <tr
                  key={row.code}
                  className={`border-b border-black/5 dark:border-white/10 ${
                    count > 0
                      ? "bg-emerald-50 dark:bg-emerald-950/40"
                      : !canOrder
                        ? "text-neutral-400 dark:text-neutral-600"
                        : ""
                  }`}
                >
                  <td className="py-1.5 pr-3">
                    <span
                      className={`font-mono font-semibold ${!canOrder ? "line-through" : ""}`}
                      title={canOrder ? undefined : "This costume is not offered in this size"}
                    >
                      {row.code}
                    </span>
                    {row.label ? (
                      <span className="ml-2 text-xs text-neutral-500">{row.label}</span>
                    ) : null}
                  </td>
                  {/* Girth is the measurement that decides the size, so it leads. */}
                  <td className="py-1.5 pr-3 font-semibold tabular-nums">
                    {formatRange(row.girth)}
                  </td>
                  {MEASURES.map((m) => (
                    <td key={m} className="py-1.5 pr-3 tabular-nums text-neutral-600 dark:text-neutral-400">
                      {row[m] ? formatRange(row[m]) : "—"}
                    </td>
                  ))}
                  <td className="py-1.5">
                    {count > 0 ? (
                      <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                        {count}
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {chart.notes.length > 0 ? (
        <div className="mt-4 space-y-2">
          {chart.notes.map((n, i) => (
            <p key={i} className="text-sm text-neutral-600 dark:text-neutral-400">
              <span className="font-medium">Chart note:</span> {n}
            </p>
          ))}
        </div>
      ) : null}

      <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
        Green rows are sizes this class actually needs. Struck-through codes exist on the chart but
        are not offered for this costume.
      </p>
    </Card>
  );
}
