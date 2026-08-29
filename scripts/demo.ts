/**
 * End-to-end walk through the whole pipeline, with edge cases planted on purpose.
 *
 *   npx tsx scripts/demo.ts
 *
 * Builds two class spreadsheets in memory (one in inches, one in centimetres,
 * from two different costume companies), runs them through the real import,
 * matching and export code, and writes the order workbook to ./tmp.
 *
 * NOTE ON THE CHARTS: the size numbers below are illustrative fixtures, not the
 * vendors' real published charts. Real charts are read out of the vendor chart
 * images by scripts/extract-chart.ts and confirmed by a human before use.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { detectHeaderRow, guessMapping } from "../src/lib/import/headers";
import { convertToInches, parseWorkbook, readRoster } from "../src/lib/import/parse";
import { runSizing, type RunCostume } from "../src/lib/sizing/run";
import { buildOrderWorkbook, workbookToBuffer } from "../src/lib/export/orderSheet";
import type { SizeChart } from "../src/lib/sizing/types";
import type { ExportAssignment } from "../src/lib/export/orderSheet";

const childChart: SizeChart = {
  id: "demo-child-girls",
  companySlug: "demo",
  variant: "child-girls",
  status: "confirmed",
  rows: [
    { code: "XSC", label: "X-Small Child", ordinal: 0, girth: { min: 38, max: 41 }, bust: { min: 22, max: 23 }, waist: { min: 21, max: 22 }, hips: { min: 23, max: 25 }, inseam: { min: 17, max: 20 } },
    { code: "SC", label: "Small Child", ordinal: 1, girth: { min: 41, max: 44 }, bust: { min: 24, max: 25 }, waist: { min: 22, max: 23 }, hips: { min: 25, max: 27 }, inseam: { min: 19, max: 22 } },
    { code: "IC", label: "Intermediate Child", ordinal: 2, girth: { min: 44, max: 47 }, bust: { min: 26, max: 28 }, waist: { min: 24, max: 25 }, hips: { min: 27, max: 29 }, inseam: { min: 22, max: 25 } },
    { code: "MC", label: "Medium Child", ordinal: 3, girth: { min: 47, max: 51 }, bust: { min: 28, max: 31 }, waist: { min: 25, max: 27 }, hips: { min: 29, max: 32 }, inseam: { min: 22, max: 28 } },
    { code: "LC", label: "Large Child", ordinal: 4, girth: { min: 51, max: 55 }, bust: { min: 31, max: 33 }, waist: { min: 27, max: 29 }, hips: { min: 32, max: 34 }, inseam: { min: 24, max: 30 } },
  ],
};

const adultChart: SizeChart = {
  id: "demo-adult-womens",
  companySlug: "demo",
  variant: "adult-womens",
  status: "confirmed",
  rows: [
    { code: "SA", label: "Small Adult", ordinal: 0, girth: { min: 55, max: 58 }, bust: { min: 32, max: 34 }, waist: { min: 25, max: 27 }, hips: { min: 34, max: 36 } },
    { code: "MA", label: "Medium Adult", ordinal: 1, girth: { min: 58, max: 61 }, bust: { min: 34, max: 36 }, waist: { min: 27, max: 29 }, hips: { min: 36, max: 38 } },
    { code: "LA", label: "Large Adult", ordinal: 2, girth: { min: 61, max: 64 }, bust: { min: 36, max: 38 }, waist: { min: 29, max: 31 }, hips: { min: 38, max: 40 } },
  ],
};

const HEADERS = ["Dancer Name", "Girth", "Chest", "Waist", "Hip", "Inseam", "Color"];

/** Inches. Every row here is a case the matcher must get right. */
const juniorJazzRows: unknown[][] = [
  ["Junior Jazz - Spring Recital Measurements", null, null, null, null, null, null],
  [null, null, null, null, null, null, null],
  HEADERS,
  // Clean: everything lands inside IC.
  ["Ella Rodriguez", 45, 27, 24.5, 28, 23, null],
  // Girth exactly on the IC/MC boundary - must round UP to MC.
  ["Maya Chen", 47, 28, 25, 29, 24, null],
  // THE critical case: bust/waist/hips/inseam all fit SC, but girth says IC.
  ["Sofia Patel", 44.5, 24.5, 22.5, 26, 21, null],
  // Girth beyond the largest orderable size - blocking, needs a custom order.
  ["Ava Thompson", 60, 33, 29, 34, 29, null],
  // Not measured yet - must be reported, never guessed.
  ["Lily Nguyen", null, 27, 24, 28, 23, null],
  // 1" under the top of IC - borderline, worth a re-measure.
  ["Grace Kim", 46, 27, 24.5, 28, 23, null],
  // Fractional entry, and the soloist in a contrasting colour.
  ["Zoe Martin", "44 1/2", 26.5, 24, 27.5, 22.5, "Red"],
  [null, null, null, null, null, null, null],
  ["Hannah Brooks", "45½", 27, 24.5, 28, 23, null],
];

/** Centimetres, a different company, adult sizes. */
const seniorTapRows: unknown[][] = [
  HEADERS,
  ["Olivia Reed", 145, 86, 69, 91, 74, null],
  ["Chloe Adams", 152, 91, 72, 95, 76, null],
  ["Isla Fraser", 157, 94, 76, 99, 78, null],
];

function importClass(rows: unknown[][], sheetName: string) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const [sheet] = parseWorkbook(buf);
  const headerRow = detectHeaderRow(sheet.rows);
  const headers = sheet.rows[headerRow].map((c) => String(c ?? ""));
  const mapping = guessMapping(headers);
  const parsed = readRoster(sheet.rows, headerRow, mapping);

  const dancers =
    parsed.detectedUnit === "cm" ? convertToInches(parsed.dancers) : parsed.dancers;
  return { ...parsed, dancers, headerRow, mapping };
}

function main() {
  const all: ExportAssignment[] = [];
  const allSkipped: { className: string; dancerName: string; reason: string }[] = [];

  const classes: {
    className: string;
    rows: unknown[][];
    costume: RunCostume;
    chart: SizeChart;
  }[] = [
    {
      className: "Tues 5pm Junior Jazz",
      rows: juniorJazzRows,
      chart: childChart,
      costume: {
        companyName: "Revolution",
        styleNumber: "27776",
        name: "YOU CAN'T STOP THE BEAT",
        availableSizes: ["XSC", "SC", "IC", "MC", "LC"],
        defaultColorway: "Purple",
      },
    },
    {
      className: "Wed 6pm Senior Tap",
      rows: seniorTapRows,
      chart: adultChart,
      costume: {
        companyName: "Weissman",
        styleNumber: "10504",
        name: "BIGGER IS BETTER",
        availableSizes: ["SA", "MA", "LA"],
        defaultColorway: "Black",
      },
    },
  ];

  for (const c of classes) {
    const imported = importClass(c.rows, c.className);
    console.log(`\n=== ${c.className} ===`);
    console.log(
      `  ${c.costume.companyName} ${c.costume.styleNumber} ${c.costume.name}`,
    );
    console.log(
      `  header row ${imported.headerRow}, unit detected: ${imported.detectedUnit}` +
        (imported.detectedUnit === "cm" ? " (converted to inches)" : ""),
    );
    console.log(
      `  mapped columns: ${imported.mapping
        .filter((m) => m.field)
        .map((m) => `${m.column}->${m.field}`)
        .join(", ")}`,
    );

    const { assignments, skipped } = runSizing({
      className: c.className,
      costume: c.costume,
      chart: c.chart,
      dancers: imported.dancers,
    });

    for (const a of assignments) {
      const worst = a.flags.find((f) => f.severity === "blocking")
        ? "BLOCKING"
        : a.flags.find((f) => f.severity === "warning")
          ? "check"
          : "ok";
      console.log(
        `  ${worst.padEnd(8)} ${a.dancerName.padEnd(18)} ${a.recommendedSize.padEnd(4)} ${String(a.rawGirth).padStart(5)}"  ${a.colorway}`,
      );
      for (const f of a.flags.filter((f) => f.severity !== "info")) {
        console.log(`             - ${f.message}`);
      }
    }
    for (const s of skipped) {
      console.log(`  SKIPPED  ${s.dancerName.padEnd(18)} ${s.reason}`);
      allSkipped.push({ className: c.className, ...s });
    }

    all.push(...assignments);
  }

  mkdirSync("tmp", { recursive: true });
  const out = "tmp/costume-order.xlsx";
  writeFileSync(out, workbookToBuffer(buildOrderWorkbook(all)));

  const blocking = all.filter((a) => a.flags.some((f) => f.severity === "blocking")).length;
  const warnings = all.filter(
    (a) =>
      !a.flags.some((f) => f.severity === "blocking") &&
      a.flags.some((f) => f.severity === "warning"),
  ).length;

  console.log(
    `\n${all.length} sized, ${blocking} blocking, ${warnings} to check, ${allSkipped.length} skipped.`,
  );
  console.log(`Order workbook written to ${out}`);
}

main();
