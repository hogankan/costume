import type { ExtractedChart } from "./schema";

/**
 * Anomaly detection on a freshly extracted chart.
 *
 * The point is not to accept or reject the extraction automatically - a human
 * confirms every chart - but to aim their eye at the cells most likely to be
 * wrong, so review is a spot-check rather than a full re-transcription.
 */

export type IssueSeverity = "error" | "warning" | "info";

export interface ChartIssue {
  severity: IssueSeverity;
  message: string;
  /** Size code the issue attaches to, when it is row-specific. */
  code?: string;
  field?: string;
}

/**
 * Plausible girth range for a dance costume in inches. Girth is measured over
 * the shoulder, through the crotch and back, so even the smallest toddler size
 * is well over 20 inches. A value outside this band almost always means a
 * misplaced decimal point or a centimetre chart read as inches.
 */
const PLAUSIBLE_GIRTH = { min: 25, max: 80 };

const MEASURES = ["bust", "waist", "hips", "inseam", "height"] as const;

export function validateExtractedChart(chart: ExtractedChart): ChartIssue[] {
  const issues: ChartIssue[] = [];
  const rows = [...chart.rows].sort((a, b) => a.ordinal - b.ordinal);

  // Girth on any chart that prints it; Weissman's boys and mens charts have no
  // girth column at all and declare chest instead.
  const primary = chart.primaryMeasurement ?? "girth";
  const primaryName = primary.charAt(0).toUpperCase() + primary.slice(1);
  const band = (row: (typeof rows)[number]) => row[primary] ?? { min: null, max: null };

  if (rows.length === 0) {
    return [{ severity: "error", message: "No size rows were extracted from this chart." }];
  }

  // --- per-row sanity -------------------------------------------------------
  const seen = new Map<string, number>();
  for (const row of rows) {
    const code = row.code.trim().toUpperCase();
    seen.set(code, (seen.get(code) ?? 0) + 1);

    if (band(row).min === null && band(row).max === null) {
      issues.push({
        severity: "error",
        code: row.code,
        field: primary,
        message: `${row.code} has no ${primary} range. ${primaryName} is what decides the size on this chart, so this row cannot be used.`,
      });
    }

    for (const field of ["girth", ...MEASURES] as const) {
      const r = row[field];
      if (!r) continue;
      if (r.min !== null && r.max !== null && r.min > r.max) {
        issues.push({
          severity: "error",
          code: row.code,
          field,
          message: `${row.code} ${field} reads ${r.min}-${r.max}, which is backwards.`,
        });
      }
    }

    // The plausibility band is about girth specifically; a chest-based chart has
    // a different sane range, so only girth charts get this check.
    if (primary !== "girth") continue;
    for (const bound of ["min", "max"] as const) {
      const v = band(row)[bound];
      if (v === null) continue;
      if (v < PLAUSIBLE_GIRTH.min || v > PLAUSIBLE_GIRTH.max) {
        issues.push({
          severity: "warning",
          code: row.code,
          field: "girth",
          message: `${row.code} girth ${bound} of ${v}" is outside the plausible range for a costume (${PLAUSIBLE_GIRTH.min}-${PLAUSIBLE_GIRTH.max}"). Check for a misread decimal point or a centimetre chart.`,
        });
      }
    }
  }

  for (const [code, count] of seen) {
    if (count > 1) {
      issues.push({
        severity: "error",
        code,
        message: `Size code ${code} appears ${count} times. Long variants such as ICL must be transcribed as their own code, not repeated.`,
      });
    }
  }

  // --- ordinals -------------------------------------------------------------
  const expected = rows.map((_, i) => i);
  const actual = rows.map((r) => r.ordinal);
  if (actual.join(",") !== expected.join(",")) {
    issues.push({
      severity: "warning",
      message: `Ordinals are ${actual.join(", ")} rather than a run from 0. Size order determines what "the next size up" means.`,
    });
  }

  // --- direction and monotonicity -------------------------------------------
  // Printed order is not always girth order: Revolution lists PA (Petite Adult,
  // girth 53-57) between XXLC (56-58) and SA (55-58), because it is a
  // differently-proportioned size rather than the next size up. One such step
  // backwards is normal; a chart where most steps go backwards was read upside
  // down, which is a different and much worse problem.
  const backwards: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];
    if (band(prev).min !== null && band(cur).min !== null && band(cur).min! < band(prev).min!) {
      backwards.push(cur.code);
    }
  }

  if (rows.length > 2 && backwards.length > (rows.length - 1) / 2) {
    issues.push({
      severity: "error",
      field: primary,
      message: `${primaryName} decreases across most of this chart (${backwards.join(", ")}). It has almost certainly been read in the wrong direction.`,
    });
  } else {
    for (const code of backwards) {
      issues.push({
        severity: "warning",
        code,
        field: primary,
        message: `${code} has a lower ${primary} than the size printed before it. That is normal for a specialty size such as Petite Adult, which sits mid-table; the matcher orders by girth regardless.`,
      });
    }
  }

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];

    // A gap means some dancers fall between printed sizes. Legitimate on some
    // charts, but often a dropped digit.
    if (band(prev).max !== null && band(cur).min !== null && band(cur).min! > band(prev).max!) {
      issues.push({
        severity: "info",
        code: cur.code,
        field: primary,
        message: `${primaryName} gap between ${prev.code} (to ${band(prev).max}") and ${cur.code} (from ${band(cur).min}"). Dancers landing in the gap will be rounded up.`,
      });
    }
  }

  // --- long-variant sanity --------------------------------------------------
  const codes = new Set(rows.map((r) => r.code.trim().toUpperCase()));
  for (const row of rows) {
    const code = row.code.trim().toUpperCase();
    if (!/^[A-Z]*[SIML]C?L$|^[A-Z]+L$/.test(code)) continue;
    const base = code.slice(0, -1);
    if (!codes.has(base)) continue;
    const baseRow = rows.find((r) => r.code.trim().toUpperCase() === base);
    if (!baseRow) continue;
    // A long size should reach further in girth than its base; if it does not,
    // the two were probably conflated.
    if (
      band(row).max !== null &&
      band(baseRow).max !== null &&
      band(row).max! <= band(baseRow).max!
    ) {
      issues.push({
        severity: "warning",
        code: row.code,
        field: primary,
        message: `${row.code} is a long size but does not reach further in ${primary} than ${baseRow.code}. Check that the two rows were not conflated.`,
      });
    }
  }

  return issues;
}

export const hasBlockingIssue = (issues: ChartIssue[]): boolean =>
  issues.some((i) => i.severity === "error");
