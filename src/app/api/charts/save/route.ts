import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { saveChart, type StoredChart } from "@/lib/charts/library";
import { validateExtractedChart } from "@/lib/charts/validate";
import { ExtractedChart } from "@/lib/charts/schema";

/**
 * Save a size chart typed in by hand.
 *
 * Manual entry is the path that needs no API key: a person reads the vendor's
 * chart image and types the numbers. It is stored as confirmed - a human did the
 * reading, so there is nothing to review afterwards - but it is validated first,
 * because a typo in a girth range does the same damage as a misread one.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const parsed = ExtractedChart.safeParse(body.chart);
    if (!parsed.success) {
      return NextResponse.json(
        { error: `Chart is not in the expected shape: ${parsed.error.issues[0]?.message}` },
        { status: 400 },
      );
    }

    const issues = validateExtractedChart(parsed.data);
    const blocking = issues.filter((i) => i.severity === "error");
    if (blocking.length > 0) {
      return NextResponse.json(
        { error: "This chart has problems that must be fixed first.", issues },
        { status: 400 },
      );
    }

    const companySlug = String(body.companySlug ?? "").trim();
    const variant = String(body.variant ?? "").trim();
    if (!companySlug || !variant) {
      return NextResponse.json(
        { error: "A company and a chart name are both required." },
        { status: 400 },
      );
    }

    const sourceImageUrl = String(body.sourceImageUrl ?? "").trim();
    const stored: StoredChart = {
      companySlug,
      variant,
      label: String(body.label ?? variant),
      sourceImageUrl,
      // Manual charts have no downloaded bytes to hash, so the image URL itself
      // is the identity. Resolution matches on that URL either way.
      imageHash: createHash("sha256")
        .update(sourceImageUrl || `${companySlug}/${variant}`)
        .digest("hex"),
      status: "confirmed",
      confirmedBy: String(body.confirmedBy ?? "manual entry"),
      confirmedAt: new Date().toISOString(),
      chart: parsed.data,
    };

    const path = saveChart(stored);
    return NextResponse.json({ ok: true, path, issues, id: `${companySlug}/${variant}` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
