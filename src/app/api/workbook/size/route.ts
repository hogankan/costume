import { NextResponse } from "next/server";
import { runSizing, UnconfirmedChartError, type RunCostume } from "@/lib/sizing/run";
import { combineCharts, findChart, loadLibrary } from "@/lib/charts/library";
import type { SizeChart } from "@/lib/sizing/types";
import type { ImportedDancer } from "@/lib/import/parse";
import type { ExportAssignment } from "@/lib/export/orderSheet";
import type { SkippedDancer } from "@/lib/sizing/run";
import type { SizingOptions } from "@/lib/sizing/types";

/**
 * Size every class in a workbook in one request.
 *
 * A class can have two costume groups - the main costume and an alternate
 * (usually the boys' version) - each sized against its own chart. Each group is
 * an ordinary single-class run, so the matching rules are exactly the ones the
 * single-class screen uses, including refusing an unconfirmed chart.
 */

interface GroupInput {
  costume: RunCostume;
  /** One chart, or several for a costume whose sizes span charts. */
  chartIds?: string[];
  /** Older single-chart form. */
  chartId?: string;
  dancers: ImportedDancer[];
}

interface ClassInput {
  key: string;
  className: string;
  groups: GroupInput[];
}

export interface UsedChartSummary {
  /** The costume style this chart sized. */
  styleNumber: string;
  costumeName: string;
  id: string;
  label: string;
  variant: string;
  sourceImageUrl: string | null;
  notes: string[];
  rows: SizeChart["rows"];
}

export interface ClassSizeResult {
  key: string;
  className: string;
  assignments: ExportAssignment[];
  skipped: SkippedDancer[];
  charts: UsedChartSummary[];
  error?: string;
}

const summarise = (
  chart: SizeChart,
  labels: string[],
  sourceImageUrl: string | null,
  costume: RunCostume,
): UsedChartSummary => ({
  styleNumber: costume.styleNumber,
  costumeName: costume.name,
  id: chart.id,
  label: labels.join(" + "),
  variant: chart.variant,
  sourceImageUrl,
  notes: chart.notes ?? [],
  rows: chart.rows,
});

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { classes?: ClassInput[]; options?: SizingOptions };
    const library = loadLibrary();
    const results: ClassSizeResult[] = [];

    for (const cls of body.classes ?? []) {
      const result: ClassSizeResult = {
        key: cls.key,
        className: cls.className,
        assignments: [],
        skipped: [],
        charts: [],
      };
      try {
        for (const group of cls.groups) {
          if (group.dancers.length === 0) continue;
          const ids = group.chartIds?.length ? group.chartIds : group.chartId ? [group.chartId] : [];
          const charts = ids.map((id) => findChart(library, id));
          if (charts.length === 0 || charts.some((c) => !c)) {
            throw new Error(
              `No size chart chosen for ${group.costume.styleNumber}. Pick one before sizing.`,
            );
          }
          const found = charts.filter((c) => c !== undefined);
          const chart = combineCharts(found);
          const run = runSizing({
            className: cls.className,
            costume: group.costume,
            chart,
            dancers: group.dancers,
            options: body.options,
          });
          result.assignments.push(...run.assignments);
          result.skipped.push(...run.skipped);
          result.charts.push(
            summarise(
              chart,
              found.map((c) => c.label),
              found.length === 1 ? found[0].sourceImageUrl || null : null,
              group.costume,
            ),
          );
        }
      } catch (err) {
        result.assignments = [];
        result.skipped = [];
        result.error =
          err instanceof UnconfirmedChartError || err instanceof Error
            ? err.message
            : String(err);
      }
      results.push(result);
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
