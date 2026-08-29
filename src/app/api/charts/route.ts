import { NextResponse } from "next/server";
import { loadLibrary, toCandidate } from "@/lib/charts/library";

/**
 * List the chart library. Only confirmed charts can be sized against, but drafts
 * are listed too so the UI can explain why a chart is unavailable rather than
 * silently omitting it.
 */
export async function GET() {
  const charts = loadLibrary().map((c) => ({
    id: c.id,
    label: c.label,
    companySlug: c.companySlug,
    variant: c.variant,
    status: c.status,
    sizeCodes: toCandidate(c).sizeCodes,
    rowCount: c.chart.rows.length,
    notes: c.chart.notes,
  }));

  return NextResponse.json({ charts });
}
