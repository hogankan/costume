/**
 * Seed the size-chart library from the vendor chart images.
 *
 *   npx tsx scripts/seed-charts.ts --from-catalog          # every chart the crawled costumes point at
 *   npx tsx scripts/seed-charts.ts --from-catalog --list   # show them without extracting
 *   npx tsx scripts/seed-charts.ts                 # the known manifest
 *   npx tsx scripts/seed-charts.ts --company weissman
 *   npx tsx scripts/seed-charts.ts --force         # re-extract even if stored
 *   npx tsx scripts/seed-charts.ts --confirm revolution/costumechart
 *
 * Charts are written to charts/{company}/{variant}.json and committed. Keeping
 * them in the repository rather than only in the database means the numbers every
 * size recommendation rests on are reviewable in a diff: if an extraction ever
 * changes a girth range, that shows up in code review instead of silently
 * altering what a studio orders.
 *
 * Nothing here confirms a chart automatically. A chart stays a draft until a
 * person has compared it against its image and run --confirm, and the sizing
 * engine refuses to run against a draft.
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { CHART_MANIFEST, type ChartSource } from "../src/lib/charts/manifest";
import { listCatalogs, listSeasons } from "../src/lib/catalog/store";
import { extractChart, fetchChartImage } from "../src/lib/charts/extract";
import { validateExtractedChart } from "../src/lib/charts/validate";
import type { ExtractedChart } from "../src/lib/charts/schema";

const CHARTS_DIR = "charts";

interface StoredChart {
  companySlug: string;
  variant: string;
  label: string;
  sourceImageUrl: string;
  /** sha256 of the vendor's original image; the dedupe key. */
  imageHash: string;
  status: "draft" | "confirmed";
  confirmedBy?: string;
  confirmedAt?: string;
  extractedAt: string;
  extractionModel: string;
  chart: ExtractedChart;
}

const pathFor = (companySlug: string, variant: string) =>
  join(CHARTS_DIR, companySlug, `${variant}.json`);

function read(companySlug: string, variant: string): StoredChart | null {
  const p = pathFor(companySlug, variant);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as StoredChart;
}

function write(stored: StoredChart): string {
  const p = pathFor(stored.companySlug, stored.variant);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(stored, null, 2)}\n`);
  return p;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

/** Mark a reviewed chart as safe to size against. */
function confirm(target: string): void {
  const [companySlug, variant] = target.split("/");
  const stored = read(companySlug, variant);
  if (!stored) {
    console.error(`No stored chart at ${pathFor(companySlug, variant)}. Extract it first.`);
    process.exitCode = 1;
    return;
  }
  const issues = validateExtractedChart(stored.chart);
  const blocking = issues.filter((i) => i.severity === "error");
  if (blocking.length > 0) {
    console.error(`Cannot confirm ${target}; ${blocking.length} blocking issue(s) remain:`);
    for (const i of blocking) console.error(`  ${i.message}`);
    process.exitCode = 1;
    return;
  }
  stored.status = "confirmed";
  stored.confirmedBy = process.env.USER ?? process.env.USERNAME ?? "unknown";
  stored.confirmedAt = new Date().toISOString();
  console.log(`Confirmed ${target} -> ${write(stored)}`);
}

async function seed(source: ChartSource, force: boolean): Promise<void> {
  const existing = read(source.companySlug, source.variant);
  const tag = `${source.companySlug}/${source.variant}`;

  const image = await fetchChartImage(source.url);

  // The hash is of the vendor's published image, so an unchanged chart is never
  // re-read and an already-confirmed one is never quietly replaced.
  if (existing && existing.imageHash === image.hash && !force) {
    console.log(`SKIP  ${tag}  (${existing.status}, image unchanged)`);
    return;
  }
  if (existing && existing.imageHash !== image.hash) {
    console.log(`NOTE  ${tag}  vendor image CHANGED since last extraction - re-reading.`);
  }

  const result = await extractChart(image);
  const issues = validateExtractedChart(result.chart);

  const stored: StoredChart = {
    companySlug: source.companySlug,
    variant: source.variant,
    label: source.label,
    sourceImageUrl: source.url,
    imageHash: image.hash,
    // Any re-extraction returns to draft: the new numbers have not been reviewed.
    status: "draft",
    extractedAt: new Date().toISOString(),
    extractionModel: result.model,
    chart: result.chart,
  };

  const path = write(stored);
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  console.log(
    `DRAFT ${tag}  ${result.chart.rows.length} sizes, ${errors} error(s), ${warnings} warning(s) -> ${path}`,
  );
  for (const i of issues) {
    console.log(`        ${i.severity.toUpperCase()} ${i.message}`);
  }
}

/**
 * Every distinct chart image the crawled costumes actually point at.
 *
 * Preferred over the hardcoded manifest: it seeds exactly the charts this
 * season's costumes use, and it cannot miss one. Crawling Revolution turned up a
 * second chart (male/unisex) that the manifest did not originally know about.
 */
function sourcesFromCatalog(season?: string): ChartSource[] {
  const target = season ?? listSeasons()[0];
  if (!target) return [];

  const byUrl = new Map<string, ChartSource & { usedBy: number }>();
  for (const catalog of listCatalogs(target)) {
    for (const product of catalog.products) {
      const url = product.chartImageUrl;
      if (!url) continue;
      const existing = byUrl.get(url);
      if (existing) {
        existing.usedBy++;
        continue;
      }
      // Name the variant after the image, so the file on disk is traceable back
      // to the exact chart the vendor served.
      const variant = (url.split("/").pop() ?? "chart").replace(/\.[a-z]+$/i, "");
      byUrl.set(url, {
        companySlug: catalog.companySlug,
        variant,
        label: `${catalog.companyName} ${variant}`,
        url,
        usedBy: 1,
      });
    }
  }

  const sources = [...byUrl.values()].sort((a, b) => b.usedBy - a.usedBy);
  for (const s of sources) {
    console.log(`  ${s.companySlug}/${s.variant} - used by ${s.usedBy} costume(s)`);
  }
  return sources;
}

async function main() {
  const confirmTarget = arg("confirm");
  if (confirmTarget) {
    confirm(confirmTarget);
    return;
  }

  const company = arg("company");
  const force = has("force");

  let sources: ChartSource[];
  if (has("from-catalog")) {
    console.log("Charts referenced by the crawled catalogue:");
    sources = sourcesFromCatalog(arg("season"));
    if (sources.length === 0) {
      console.error(
        "No crawled catalogue found. Run `npm run catalog:crawl` first, or drop --from-catalog to use the manifest.",
      );
      process.exitCode = 1;
      return;
    }
  } else {
    sources = CHART_MANIFEST;
  }
  if (company) sources = sources.filter((c) => c.companySlug === company);

  if (has("list")) {
    console.log(`\n${sources.length} chart(s) would be extracted:`);
    for (const s of sources) console.log(`  ${s.companySlug}/${s.variant}  ${s.url}`);
    return;
  }

  // Discovery works offline; only reading the images needs the API.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "\nANTHROPIC_API_KEY is not set, so the chart images cannot be read.\n" +
        "Add it to .env and run this again. Use --list to see what would be extracted.",
    );
    process.exitCode = 1;
    return;
  }

  if (sources.length === 0) {
    console.error(`No charts in the manifest for company ${JSON.stringify(company)}.`);
    process.exitCode = 1;
    return;
  }

  for (const source of sources) {
    try {
      await seed(source, force);
    } catch (err) {
      console.error(
        `FAIL  ${source.companySlug}/${source.variant}  ${err instanceof Error ? err.message : err}`,
      );
      process.exitCode = 1;
    }
  }

  console.log(
    "\nEvery chart above is a DRAFT. Compare each against its image, then run:\n" +
      "  npx tsx scripts/seed-charts.ts --confirm <company>/<variant>",
  );
}

main();
