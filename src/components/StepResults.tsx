"use client";

import { useMemo } from "react";
import type { ExportAssignment } from "@/lib/export/orderSheet";
import type { SkippedDancer } from "@/lib/sizing/run";
import type { Flag, SizingOptions } from "@/lib/sizing/types";
import { Alert, Button, Card, SeverityBadge, inputClass } from "./ui";
import { ChartTable } from "./ChartTable";
import { MeasurementsTable } from "./MeasurementsTable";
import { SizingRules } from "./SizingRules";
import type { UsedChart } from "./types";
import type { ImportedDancer } from "@/lib/import/parse";

const severityOf = (flags: Flag[]): "blocking" | "warning" | "ok" =>
  flags.some((f) => f.severity === "blocking")
    ? "blocking"
    : flags.some((f) => f.severity === "warning")
      ? "warning"
      : "ok";

const RANK = { blocking: 0, warning: 1, ok: 2 } as const;

export function StepResults({
  assignments,
  skipped,
  dancers,
  chart,
  availableSizes,
  overrides,
  sizingOptions,
  onChangeSizingOptions,
  busy,
  onOverride,
  onBack,
  onExport,
}: {
  assignments: ExportAssignment[];
  skipped: SkippedDancer[];
  dancers: ImportedDancer[];
  chart: UsedChart | null;
  availableSizes: string[];
  overrides: Record<string, { size: string; reason: string }>;
  sizingOptions: Required<SizingOptions>;
  onChangeSizingOptions: (next: Required<SizingOptions>) => void;
  busy: boolean;
  onOverride: (dancerName: string, size: string, reason: string) => void;
  onBack: () => void;
  onExport: () => void;
}) {
  const sorted = useMemo(
    () =>
      [...assignments].sort(
        (a, b) =>
          RANK[severityOf(a.flags)] - RANK[severityOf(b.flags)] ||
          a.dancerName.localeCompare(b.dancerName),
      ),
    [assignments],
  );

  const counts = useMemo(() => {
    const c = { blocking: 0, warning: 0, ok: 0 };
    for (const a of assignments) c[severityOf(a.flags)]++;
    return c;
  }, [assignments]);

  /** How many dancers landed on each chart row, for highlighting the chart. */
  const usage = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of assignments) {
      const size = overrides[a.dancerName]?.size || a.recommendedSize;
      map[size] = (map[size] ?? 0) + 1;
    }
    return map;
  }, [assignments, overrides]);

  /** What actually gets ordered, so the studio can sanity-check the totals. */
  const tally = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of assignments) {
      const size = overrides[a.dancerName]?.size || a.recommendedSize;
      const key = `${size} · ${a.colorway ?? "—"}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  }, [assignments, overrides]);

  return (
    <div className="space-y-5">
      <SizingRules
        options={sizingOptions}
        counts={counts}
        busy={busy}
        onChange={onChangeSizingOptions}
      />

      {chart ? (
        <ChartTable chart={chart} availableSizes={availableSizes} usage={usage} />
      ) : null}

      {chart ? (
        <MeasurementsTable
          dancers={dancers}
          assignments={assignments}
          chart={chart}
          overrides={overrides}
        />
      ) : null}

      <Card
        title="Results"
        subtitle={
          <>
            {counts.ok} clean · {counts.warning} to check · {counts.blocking} blocking
            {skipped.length > 0 ? ` · ${skipped.length} could not be sized` : ""}
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={onBack}>
              ← Back
            </Button>
            <Button onClick={onExport} disabled={busy}>
              {busy ? "Building…" : "Download order sheet"}
            </Button>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
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
              {sorted.map((a) => {
                const severity = severityOf(a.flags);
                const override = overrides[a.dancerName];
                return (
                  <tr
                    key={a.dancerName}
                    className="border-b border-black/5 align-top dark:border-white/10"
                  >
                    <td className="py-2 pr-3">
                      <SeverityBadge severity={severity} />
                    </td>
                    <td className="py-2 pr-3 font-medium">
                      {a.dancerName}
                      <span className="block text-xs font-normal text-neutral-500">
                        {a.colorway ?? "—"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{a.rawGirth}&quot;</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`font-mono font-semibold ${
                          override?.size ? "text-neutral-400 line-through" : ""
                        }`}
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
                        onChange={(e) =>
                          onOverride(a.dancerName, e.target.value, override?.reason ?? "")
                        }
                      >
                        <option value="">— keep —</option>
                        {availableSizes.map((s) => (
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
                          onChange={(e) =>
                            onOverride(a.dancerName, override.size, e.target.value)
                          }
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

        {Object.values(overrides).some((o) => o.size && !o.reason.trim()) ? (
          <div className="mt-4">
            <Alert kind="warning" title="An override has no reason recorded">
              Overrides go into the order sheet&apos;s audit trail. Say why, so next season somebody
              knows it was deliberate.
            </Alert>
          </div>
        ) : null}
      </Card>

      {skipped.length > 0 ? (
        <Card
          title={`${skipped.length} dancer${skipped.length === 1 ? "" : "s"} could not be sized`}
          subtitle="These are left out of the order sheet entirely rather than guessed at."
        >
          <ul className="space-y-1 text-sm">
            {skipped.map((s) => (
              <li key={`${s.rowNumber}-${s.dancerName}`}>
                <span className="font-medium">{s.dancerName}</span>{" "}
                <span className="text-neutral-500">(row {s.rowNumber})</span> — {s.reason}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="What will be ordered" subtitle="Quantities after any overrides.">
        <ul className="flex flex-wrap gap-2 text-sm">
          {tally.map(([key, count]) => (
            <li
              key={key}
              className="flex items-center gap-3 rounded-lg border border-black/10 px-3 py-1.5 dark:border-white/15"
            >
              <span className="font-mono">{key}</span>
              <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white dark:bg-white dark:text-neutral-900">
                {count}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
