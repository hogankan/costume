/**
 * Read a vendor size chart out of its image and print it for eye-checking.
 *
 *   npx tsx scripts/extract-chart.ts <image-url>
 *
 * Every size recommendation the app makes rests on these numbers, so this output
 * is meant to be diffed by eye against the chart image itself before the chart is
 * confirmed into the library.
 */
import "dotenv/config";
import { fetchChartImage, extractChart } from "../src/lib/charts/extract";
import { validateExtractedChart } from "../src/lib/charts/validate";

const REVOLUTION_STANDARD =
  "https://cdn11.bigcommerce.com/s-m12047qc85/product_images/uploaded_images/costumechart.jpg";

const fmt = (v: number | null) => (v === null ? "-" : String(v));
const range = (r: { min: number | null; max: number | null } | null) =>
  r === null ? "-" : `${fmt(r.min)}-${fmt(r.max)}`;

async function main() {
  const url = process.argv.find((a) => a.startsWith("http")) ?? REVOLUTION_STANDARD;

  const fetchOnly = process.argv.includes("--fetch-only");

  if (!fetchOnly && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is not set. Add it to .env before running chart extraction.",
    );
    process.exit(1);
  }

  console.log(`Fetching ${url}`);
  const image = await fetchChartImage(url);
  console.log(
    `  ${image.mediaType}, ${(image.bytes.length / 1024).toFixed(0)} KB, sha256 ${image.hash.slice(0, 16)}...`,
  );

  if (fetchOnly) {
    console.log("  --fetch-only: stopping before extraction.");
    return;
  }

  console.log("Extracting (this takes a moment)...\n");
  const result = await extractChart(image);
  const { chart } = result;

  console.log(`Variant: ${chart.variant}`);
  console.log(`Unit:    in${result.convertedFromCm ? " (converted from cm)" : ""}`);
  console.log(`Rows:    ${chart.rows.length}\n`);

  const header = ["#", "CODE", "GIRTH", "BUST", "WAIST", "HIPS", "INSEAM", "HEIGHT"];
  const body = chart.rows
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((r) => [
      String(r.ordinal),
      r.code,
      range(r.girth),
      range(r.bust),
      range(r.waist),
      range(r.hips),
      range(r.inseam),
      range(r.height),
    ]);

  const widths = header.map((h, i) =>
    Math.max(h.length, ...body.map((row) => row[i].length)),
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();

  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of body) console.log(line(row));

  if (chart.notes.length > 0) {
    console.log("\nNotes printed on the chart:");
    for (const n of chart.notes) console.log(`  - ${n}`);
  }

  const issues = validateExtractedChart(chart);
  console.log(`\nValidation: ${issues.length} issue(s)`);
  for (const i of issues) {
    const where = i.code ? ` [${i.code}${i.field ? `.${i.field}` : ""}]` : "";
    console.log(`  ${i.severity.toUpperCase()}${where} ${i.message}`);
  }

  console.log(
    "\nCompare this table against the chart image before confirming it into the library.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
