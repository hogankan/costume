import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtractedChart } from "./schema";
import type { SizeChart, SizeRow, Range } from "../sizing/types";
import type { ChartCandidate } from "./resolve";

/**
 * The on-disk chart library.
 *
 * Charts live in the repository rather than only in a database so that the
 * numbers every size recommendation rests on are reviewable in a diff. A chart
 * is a draft until a person has compared it against its source image, and the
 * sizing engine refuses to run against a draft.
 */

const CHARTS_DIR = "charts";

export interface StoredChart {
  companySlug: string;
  variant: string;
  label: string;
  sourceImageUrl: string;
  imageHash: string;
  status: "draft" | "confirmed";
  confirmedBy?: string;
  confirmedAt?: string;
  extractedAt?: string;
  extractionModel?: string;
  chart: ExtractedChart;
}

export interface LibraryChart extends StoredChart {
  id: string;
}

export function loadLibrary(root = CHARTS_DIR): LibraryChart[] {
  if (!existsSync(root)) return [];
  const out: LibraryChart[] = [];

  for (const company of readdirSync(root, { withFileTypes: true })) {
    if (!company.isDirectory()) continue;
    const dir = join(root, company.name);
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const stored = JSON.parse(readFileSync(join(dir, file), "utf8")) as StoredChart;
        out.push({
          ...stored,
          id: `${company.name}/${file.replace(/\.json$/, "")}`,
        });
      } catch {
        // A malformed chart file must not take down the whole library listing;
        // it simply does not appear as an option.
      }
    }
  }

  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Only confirmed charts may be sized against. */
export const confirmedCharts = (charts: LibraryChart[]): LibraryChart[] =>
  charts.filter((c) => c.status === "confirmed");

export const findChart = (charts: LibraryChart[], id: string): LibraryChart | undefined =>
  charts.find((c) => c.id === id);

/** Size codes a chart covers, for matching a costume's vocabulary against it. */
export const toCandidate = (c: LibraryChart): ChartCandidate => ({
  id: c.id,
  variant: c.variant,
  label: c.label,
  sizeCodes: c.chart.rows.map((r) => r.code),
  // Carried through so a product that links its own chart image resolves
  // exactly, rather than being inferred from size codes.
  sourceImageUrl: c.sourceImageUrl || undefined,
});

/** Convert a stored chart into the shape the matcher consumes. */
export function toSizeChart(c: LibraryChart): SizeChart {
  const range = (r: { min: number | null; max: number | null } | null): Range | undefined =>
    r === null ? undefined : { min: r.min, max: r.max };

  const rows: SizeRow[] = c.chart.rows
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((row) => ({
      code: row.code,
      label: row.label ?? undefined,
      ordinal: row.ordinal,
      girth: { min: row.girth.min, max: row.girth.max },
      bust: range(row.bust),
      waist: range(row.waist),
      hips: range(row.hips),
      inseam: range(row.inseam),
      height: range(row.height),
    }));

  return {
    id: c.id,
    companySlug: c.companySlug,
    variant: c.variant,
    status: c.status,
    rows,
    notes: c.chart.notes,
    primaryMeasurement: c.chart.primaryMeasurement ?? undefined,
  };
}

/**
 * Write a chart to the library.
 *
 * Used by manual entry, where a person has read the vendor's chart image and
 * typed the numbers in. That counts as confirmed by definition - there is no
 * extraction to review - but it still goes through the same validator, because a
 * typo in a girth range is exactly as damaging as a misread one.
 */
export function saveChart(chart: StoredChart, root = CHARTS_DIR): string {
  const p = join(root, chart.companySlug, `${chart.variant}.json`);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(chart, null, 2)}
`);
  return p;
}
