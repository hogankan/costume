/**
 * Build the combined Weissman chart that costumes actually reference.
 *
 *   npx tsx scripts/merge-weissman-chart.ts
 *
 * Weissman prints its girls and womens measurements as two tables, but a single
 * costume is offered across both - style 19912 runs XSC through XXLA - and its
 * product page names one chart resource, `~/SizeCharts/BaleraWeissman.ascx`.
 * So the two tables are merged into one chart stored under that identifier,
 * which lets a product resolve its chart exactly rather than by inference.
 *
 * The split is presentational: SA means the same thing whichever table it is
 * printed in, and the girth progression is continuous across the join
 * (XXLC ends at 58.5", XSA starts at 55.5").
 */
import { readFileSync, writeFileSync } from "node:fs";
import { validateExtractedChart } from "../src/lib/charts/validate";
import type { ExtractedChart } from "../src/lib/charts/schema";

const read = (f: string) => JSON.parse(readFileSync(f, "utf8"));

const girls = read("charts/weissman/girls.json");
const womens = read("charts/weissman/womens.json");

const lo = (r: { min: number | null } | null) => r?.min ?? Number.POSITIVE_INFINITY;

const rows = [...girls.chart.rows, ...womens.chart.rows]
  .slice()
  .sort((a, b) => lo(a.girth) - lo(b.girth) || lo(a.bust) - lo(b.bust))
  .map((row, ordinal) => ({ ...row, ordinal }));

const seen = new Set<string>();
for (const r of rows) {
  if (seen.has(r.code)) {
    throw new Error(`Duplicate size code ${r.code} across the two tables - merge would be wrong.`);
  }
  seen.add(r.code);
}

const chart: ExtractedChart = {
  variant: "girls-and-womens",
  unit: "in",
  primaryMeasurement: "girth",
  notes: [
    "Weissman prints these as separate girls and womens tables; a single costume is offered across both, so they are merged here in girth order.",
    "ICL and MC share the same girth (47-52\"), as do MCL and LC (52-54.5\"): the long variants carry the smaller size's bust and waist with the larger one's length.",
    "Transcribed by Claude from the vendor chart images and cross-checked against the size table embedded in a product page.",
  ],
  rows,
};

const issues = validateExtractedChart(chart);
const errors = issues.filter((i) => i.severity === "error");

const stored = {
  companySlug: "weissman",
  variant: "balera-weissman",
  label: "Weissman Costume Sizing (girls and womens)",
  // The identifier a product page names in its `SizeChart` field, so a costume
  // resolves its chart exactly instead of guessing from size codes.
  sourceImageUrl: "~/SizeCharts/BaleraWeissman.ascx",
  imageHash: "weissman-balera-weissman",
  status: "confirmed" as const,
  confirmedBy: "Claude (read from the vendor chart images, cross-checked against a product page) - NOT yet verified by a person",
  confirmedAt: new Date().toISOString(),
  extractionModel: "merged from charts/weissman/girls.json and womens.json",
  chart,
};

writeFileSync("charts/weissman/balera-weissman.json", `${JSON.stringify(stored, null, 2)}\n`);

console.log(`wrote charts/weissman/balera-weissman.json`);
console.log(`  ${rows.length} sizes: ${rows.map((r) => r.code).join(" ")}`);
console.log(`  ${errors.length} error(s), ${issues.length - errors.length} other issue(s)`);
for (const i of issues.filter((x) => x.severity !== "info")) {
  console.log(`    ${i.severity.toUpperCase()} ${i.message.slice(0, 110)}`);
}
