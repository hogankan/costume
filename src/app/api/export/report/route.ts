import { NextResponse } from "next/server";
import { buildFitWorkbook } from "@/lib/report/fitWorkbook";
import type { FitReport } from "@/lib/report/fitReport";

/** Download the per-class fit report as a workbook. */
export async function POST(req: Request) {
  try {
    const { reports, fileName } = (await req.json()) as {
      reports?: FitReport[];
      fileName?: string;
    };
    const buffer = await buildFitWorkbook(reports ?? []);
    const base = (fileName || "costumes").replace(/\.[^.]+$/, "").replace(/[^a-z0-9._ -]+/gi, "-");

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${base} - fit report.xlsx"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
