/**
 * Write sample class rosters so the app can be tried without a real studio file.
 *   npx tsx scripts/make-sample-roster.ts
 *
 * Each one is deliberately messy in a different way, because real studio sheets
 * are, and the import path needs to survive all of it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

const OUT = "sample-data";

function writeSheet(file: string, sheetName: string, rows: unknown[][], widths: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  writeFileSync(`${OUT}/${file}`, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
  console.log(`  ${OUT}/${file}`);
}

mkdirSync(OUT, { recursive: true });
console.log("Sample rosters:");

/**
 * 1. The everyday case, in inches.
 *
 * Awkward in the ordinary ways: a title row above the headers, a blank row in the
 * middle, "44 1/2" fractions, a dancer nobody has measured yet, and a soloist in
 * a different colour. Also contains the case that matters most - Sofia Patel,
 * whose bust, waist, hips and inseam all fit a smaller size than her girth does.
 */
writeSheet(
  "junior-jazz-roster.xlsx",
  "Roster",
  [
    ["Junior Jazz - Spring Recital Measurements", null, null, null, null, null, null],
    [null, null, null, null, null, null, null],
    ["Dancer Name", "Girth", "Chest", "Waist", "Hip", "Inseam", "Color"],
    ["Ella Rodriguez", 45, 27, 24.5, 28, 23, null],
    ["Maya Chen", 47, 28, 25, 29, 24, null],
    ["Sofia Patel", 44.5, 24.5, 22.5, 26, 21, null],
    ["Ava Thompson", 60, 33, 29, 34, 29, null],
    ["Lily Nguyen", null, 27, 24, 28, 23, null],
    ["Grace Kim", 46, 27, 24.5, 28, 23, null],
    [null, null, null, null, null, null, null],
    ["Zoe Martin", "44 1/2", 26.5, 24, 27.5, 22.5, "Red"],
    ["Hannah Brooks", "45 1/2", 27, 24.5, 28, 23, null],
    ["Priya Shah", 49, 29, 26, 30, 25, null],
    ["Nora Whitfield", 52, 31.5, 27.5, 32.5, 26, null],
  ],
  [22, 9, 9, 9, 9, 9, 10],
);

/**
 * 2. A centimetre sheet of adult dancers.
 *
 * Exercises unit detection: the app should notice these are centimetres and offer
 * to convert, rather than treating 145 as inches.
 */
writeSheet(
  "senior-tap-roster-cm.xlsx",
  "Seniors",
  [
    ["Dancer Name", "Girth", "Bust", "Waist", "Hips", "Inseam"],
    ["Olivia Reed", 152, 86, 69, 91, 74],
    ["Chloe Adams", 158, 91, 72, 95, 76],
    ["Isla Fraser", 165, 94, 76, 99, 78],
    ["Ruth Okafor", 171, 99, 81, 104, 79],
    ["Sadie Kohl", 149, 84, 67, 89, 73],
  ],
  [22, 9, 9, 9, 9, 9],
);

/**
 * 3. Headers that do not say what the app expects.
 *
 * The name is split across two columns, "G" is girth, and there is a shoe-size
 * column that must NOT be mistaken for a body measurement. Written as CSV because
 * plenty of studios export exactly this.
 */
const csv = [
  ["First", "Last", "Student ID", "G", "Chest/Bust", "Natural Waist", "Hip", "Shoe Size"],
  ["Amelia", "Novak", "S-1041", 41.5, 24, 22.5, 25.5, "1Y"],
  ["Beatrix", "Lin", "S-1042", 39, 22.5, 21.5, 24, "12.5"],
  ["Caro", "Mendes", "S-1043", 43, 25, 23, 26.5, "1.5Y"],
  ["Delphine", "Osei", "S-1044", "40½", 23, 22, 25, "13"],
  ["Esme", "Hartley", "S-1045", 44, 25.5, 23.5, 27, "2Y"],
]
  .map((r) => r.join(","))
  .join("\n");

writeFileSync(`${OUT}/mini-ballet-roster.csv`, `${csv}\n`);
console.log(`  ${OUT}/mini-ballet-roster.csv`);

console.log("\nUpload any of these at the first step.");
