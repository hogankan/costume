/**
 * Cross-check the Layla's transcription against the chart's own centimetre row.
 *
 *   npx tsx scripts/crosscheck-laylas.ts
 *
 * Layla's publishes its chart only as an image, so unlike Weissman there is no
 * HTML table to verify the transcription against. The chart does print every
 * measurement twice though - once in inches, once in centimetres - and those two
 * rows were read independently. Converting one into the other catches a misread
 * digit, because a wrong inch value will not agree with its centimetre twin.
 *
 * Tolerance is deliberately loose: vendors round centimetre columns by hand, so
 * exact agreement is not expected. A discrepancy larger than a rounding error is
 * what matters.
 */
import { readFileSync } from "node:fs";

const CM_PER_INCH = 2.54;
/** Vendors round cm columns inconsistently; beyond this is a misread, not rounding. */
const TOLERANCE_CM = 2.0;

/** Centimetre rows as printed on the chart, read separately from the inch rows. */
const CM_GIRTH: Record<string, [number, number]> = {
  // Child
  XXSC: [86, 94],
  XSC: [95, 104],
  SC: [105, 112],
  MC: [113, 125],
  LC: [126, 137],
  XLC: [137, 145],
  XXLC: [148, 152],
  // Adult
  XSA: [134, 141],
  SA: [142, 148],
  MA: [149, 156],
  LA: [157, 163],
  XLA: [164, 171],
  "2XLA": [172, 178],
  "3XLA": [180, 185],
};

const stored = JSON.parse(readFileSync("charts/laylas/costume-sizing.json", "utf8"));

let worst = 0;
let mismatches = 0;

console.log("size    inches        -> cm      chart cm     diff");
for (const row of stored.chart.rows) {
  const printed = CM_GIRTH[row.code];
  if (!printed) {
    console.log(`${row.code.padEnd(7)} no centimetre row to check against`);
    continue;
  }

  const converted: [number, number] = [
    row.girth.min * CM_PER_INCH,
    row.girth.max * CM_PER_INCH,
  ];
  const diff = [
    Math.abs(converted[0] - printed[0]),
    Math.abs(converted[1] - printed[1]),
  ];
  const off = Math.max(...diff);
  worst = Math.max(worst, off);

  const flag = off > TOLERANCE_CM ? "  <-- CHECK" : "";
  if (off > TOLERANCE_CM) mismatches++;

  console.log(
    `${row.code.padEnd(7)} ${`${row.girth.min}-${row.girth.max}`.padEnd(8)} -> ` +
      `${converted.map((c) => c.toFixed(1)).join("-").padEnd(13)} ` +
      `${`${printed[0]}-${printed[1]}`.padEnd(11)} ${off.toFixed(1)}cm${flag}`,
  );
}

console.log(
  `\nworst disagreement ${worst.toFixed(1)}cm (${(worst / CM_PER_INCH).toFixed(2)}"), ` +
    `${mismatches} beyond the ${TOLERANCE_CM}cm tolerance`,
);
if (mismatches > 0) process.exitCode = 1;
