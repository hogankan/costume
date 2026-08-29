import { NextResponse } from "next/server";
import { runSizing, UnconfirmedChartError, type RunCostume } from "@/lib/sizing/run";
import { findChart, loadLibrary, toSizeChart } from "@/lib/charts/library";
import type { ImportedDancer } from "@/lib/import/parse";
import type { SizingOptions } from "@/lib/sizing/types";

/** Size one class against its costume. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      className: string;
      costume: RunCostume;
      chartId: string;
      dancers: ImportedDancer[];
      options?: SizingOptions;
    };

    const chart = findChart(loadLibrary(), body.chartId);
    if (!chart) {
      return NextResponse.json(
        { error: `No chart in the library with id ${JSON.stringify(body.chartId)}.` },
        { status: 400 },
      );
    }

    const result = runSizing({
      className: body.className || "Untitled class",
      costume: body.costume,
      chart: toSizeChart(chart),
      dancers: body.dancers ?? [],
      options: body.options,
    });

    return NextResponse.json({
      ...result,
      // The full chart travels with the result so the results screen can show
      // exactly which table produced these sizes.
      chart: {
        id: chart.id,
        label: chart.label,
        variant: chart.variant,
        sourceImageUrl: chart.sourceImageUrl || null,
        notes: chart.chart.notes,
        rows: toSizeChart(chart).rows,
      },
    });
  } catch (err) {
    if (err instanceof UnconfirmedChartError) {
      // The confirmation gate is the point, so name it explicitly.
      return NextResponse.json({ error: err.message, unconfirmed: true }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
