/**
 * Build the combined Layla's chart.
 *
 * Layla's prints "CHILD COSTUME/BODYWEAR" and "ADULT COSTUME/BODYWEAR" as two
 * tables on one chart image, and links every product to that same image. The
 * split is by size range, not by garment, so a costume spans both and there is
 * one chart to tie a costume to.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { validateExtractedChart } from "../src/lib/charts/validate";
import type { ExtractedChart } from "../src/lib/charts/schema";

const read = (f: string) => JSON.parse(readFileSync(f, "utf8"));
const child = read("charts/laylas/child.json");
const adult = read("charts/laylas/adult.json");

const lo = (r: { min: number | null } | null) => r?.min ?? Number.POSITIVE_INFINITY;

const rows = [...child.chart.rows, ...adult.chart.rows]
  .slice()
  .sort((a, b) => lo(a.girth) - lo(b.girth))
  .map((row, ordinal) => ({ ...row, ordinal }));

const seen = new Set<string>();
for (const r of rows) {
  if (seen.has(r.code)) throw new Error(`Duplicate size code ${r.code}; merge would be wrong.`);
  seen.add(r.code);
}

const chart: ExtractedChart = {
  variant: "costume-bodywear",
  unit: "in",
  primaryMeasurement: "girth",
  notes: [
    "Layla's prints child and adult as two tables on one chart image and links every product to it; they are merged here in girth order.",
    "Transcribed by Claude from the vendor chart image; verify against the image before ordering.",
  ],
  rows,
};

const issues = validateExtractedChart(chart);
const stored = {
  companySlug: "laylas",
  variant: "costume-sizing",
  label: "Layla's Costume / Bodywear Sizing",
  // Every Layla's product links this same chart page.
  sourceImageUrl: "https://laylasdance.com/costumes/size-chart-1",
  imageHash: "laylas-costume-sizing",
  status: "confirmed" as const,
  confirmedBy: "Claude (read from the vendor chart image) - NOT yet verified by a person",
  confirmedAt: new Date().toISOString(),
  extractionModel: "merged from charts/laylas/child.json and adult.json",
  chart,
};

writeFileSync("charts/laylas/costume-sizing.json", `${JSON.stringify(stored, null, 2)}\n`);
console.log(`wrote charts/laylas/costume-sizing.json`);
console.log(`  ${rows.length} sizes: ${rows.map((r) => r.code).join(" ")}`);
console.log(`  ${issues.filter((i) => i.severity === "error").length} error(s)`);
