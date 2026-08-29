"use client";

import type { SizingOptions } from "@/lib/sizing/types";
import { Card, Field, inputClass } from "./ui";

/**
 * The rules that decide a size, exposed rather than buried.
 *
 * The point of this app is a sizing rule you can defend and a list of the
 * dancers who need a human decision. Both depend on thresholds, so the studio
 * sets them and sees the effect immediately, instead of trusting a number
 * somebody hardcoded.
 */
export function SizingRules({
  options,
  counts,
  busy,
  onChange,
}: {
  options: Required<SizingOptions>;
  /** How the current settings split the class. */
  counts: { blocking: number; warning: number; ok: number };
  busy: boolean;
  onChange: (next: Required<SizingOptions>) => void;
}) {
  return (
    <Card
      title="Sizing rules"
      subtitle="Girth decides the size and rounds up. These control what gets held back for a human to look at."
    >
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
        <Field
          label="Flag when within"
          hint="How close to the top of a size counts as needing a re-measure. Larger catches more dancers."
        >
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={3}
              step={0.25}
              value={options.borderThreshold}
              disabled={busy}
              onChange={(e) =>
                onChange({ ...options, borderThreshold: Number(e.target.value) })
              }
              className="flex-1 accent-neutral-900 dark:accent-white"
            />
            <span className="w-14 text-right font-mono text-sm tabular-nums">
              {options.borderThreshold}&quot;
            </span>
          </div>
        </Field>

        <Field
          label="Growth allowance"
          hint="Inches added to girth before matching, for orders placed months before the recital. Weissman suggests 1.5-2&quot;."
        >
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={3}
              step={0.25}
              value={options.girthGrowthAllowance}
              disabled={busy}
              onChange={(e) =>
                onChange({ ...options, girthGrowthAllowance: Number(e.target.value) })
              }
              className="flex-1 accent-neutral-900 dark:accent-white"
            />
            <span className="w-14 text-right font-mono text-sm tabular-nums">
              {options.girthGrowthAllowance === 0
                ? "off"
                : `+${options.girthGrowthAllowance}"`}
            </span>
          </div>
        </Field>

        <Field
          label="Alteration limit"
          hint="How far bust, waist or hips may sit outside the size before it is worth attention. These can be altered, so a small gap is a seam, not a decision."
        >
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.5}
              value={options.alterationThreshold}
              disabled={busy}
              onChange={(e) =>
                onChange({ ...options, alterationThreshold: Number(e.target.value) })
              }
              className="flex-1 accent-neutral-900 dark:accent-white"
            />
            <span className="w-14 text-right font-mono text-sm tabular-nums">
              {options.alterationThreshold}&quot;
            </span>
          </div>
        </Field>

        <Field
          label="On a shared size boundary"
          hint="When a girth belongs to two sizes at once, as printed charts often allow."
        >
          <select
            className={inputClass}
            value={options.boundaryPolicy}
            disabled={busy}
            onChange={(e) =>
              onChange({
                ...options,
                boundaryPolicy: e.target.value as Required<SizingOptions>["boundaryPolicy"],
              })
            }
          >
            <option value="round-up">Round up — too-small girth cannot be altered</option>
            <option value="chart-literal">Take the smaller size the chart allows</option>
          </select>
        </Field>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-600 dark:text-neutral-400">
          {busy ? "Re-sizing…" : "With these rules:"}
        </span>
        <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {counts.ok} clean
        </span>
        <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {counts.warning} to check
        </span>
        <span className="rounded bg-red-100 px-2 py-0.5 font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">
          {counts.blocking} blocking
        </span>
      </div>

      <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
        None of these can override girth. They change which dancers are held back for review,
        not which measurement decides the size.
      </p>
    </Card>
  );
}
