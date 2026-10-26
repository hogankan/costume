import type { ExportAssignment } from "../export/orderSheet";
import type { ImportedDancer } from "../import/parse";
import type { SkippedDancer } from "../sizing/run";
import type { MeasurementKey, Range, SizeRow } from "../sizing/types";
import { contains, distanceOutside, fmt, formatRange } from "../sizing/range";

/**
 * A per-class fit report: every dancer, every measurement, set against the
 * chart row for the size actually being ordered, with what does not line up
 * called out.
 *
 * Pure data, so the screen and the downloadable workbook show exactly the same
 * thing. The comparison follows the matcher's own rules: girth decides, a single
 * printed value is the garment's cut rather than a fit range, and a deviation is
 * only an alert once it is big enough to need altering.
 */

export const REPORT_MEASURES: MeasurementKey[] = ["girth", "bust", "waist", "hips", "inseam", "height"];

export const MEASURE_LABELS: Record<MeasurementKey, string> = {
  girth: "Girth",
  bust: "Chest",
  waist: "Waist",
  hips: "Hips",
  inseam: "Inseam",
  height: "Height",
};

export type CellStatus =
  /** Inside the size's printed range. */
  | "fits"
  /** Outside the range, but by a seam's worth - alterable without fuss. */
  | "slightly-over"
  | "slightly-under"
  /** Far enough outside to need real alteration work, or girth outside the size. */
  | "over"
  | "under"
  /** The chart prints the garment's own dimension here, not a fit range. */
  | "garment"
  /** The chart has nothing for this measurement. */
  | "not-on-chart"
  | "not-measured";

export interface FitCell {
  measure: MeasurementKey;
  value?: number;
  range?: Range;
  status: CellStatus;
  /** Inches outside the range. */
  delta?: number;
  /** Short text for a cell: `41 ✓`, `25 ▲3`. */
  text: string;
  /** Plain-English line for an alert list or a tooltip. */
  note: string;
}

export interface FitRow {
  rowNumber: number;
  name: string;
  styleNumber?: string;
  /** Size being ordered: an override wins over the recommendation. */
  size?: string;
  recommendedSize?: string;
  overrideReason?: string;
  cells: FitCell[];
  /** What a person should look at for this dancer. Empty means it all lines up. */
  alerts: string[];
  /** Set when the dancer could not be sized at all. */
  notSized?: string;
}

export interface ReportChart {
  /** The style this chart was used for. */
  styleNumber: string;
  costumeName?: string;
  id: string;
  label: string;
  rows: SizeRow[];
}

export interface FitReport {
  className: string;
  sheetName?: string;
  teacher?: string;
  charts: ReportChart[];
  rows: FitRow[];
  summary: { sized: number; clean: number; withAlerts: number; notSized: number };
}

export interface FitReportInput {
  className: string;
  sheetName?: string;
  teacher?: string;
  dancers: ImportedDancer[];
  assignments: ExportAssignment[];
  skipped: SkippedDancer[];
  charts: ReportChart[];
  /** Keyed by row number. */
  overrides?: Record<number, { size: string; reason: string }>;
  /** Inches outside a range before it is worth an alert. Matches the sizing rule. */
  alterationThreshold?: number;
}

const DEFAULT_THRESHOLD = 2;

export function buildFitReport(input: FitReportInput): FitReport {
  const threshold = input.alterationThreshold ?? DEFAULT_THRESHOLD;
  const byRow = new Map<number, ExportAssignment>();
  for (const a of input.assignments) if (a.rowNumber != null) byRow.set(a.rowNumber, a);
  const skippedByRow = new Map(input.skipped.map((s) => [s.rowNumber, s]));

  const rows: FitRow[] = input.dancers.map((d) => {
    const a = byRow.get(d.rowNumber);
    const name = d.name || `Row ${d.rowNumber}`;

    if (!a) {
      const reason = skippedByRow.get(d.rowNumber)?.reason ?? "Not sized.";
      return {
        rowNumber: d.rowNumber,
        name,
        cells: REPORT_MEASURES.map((m) => blankCell(m, d[m])),
        alerts: [reason],
        notSized: reason,
      };
    }

    const override = input.overrides?.[d.rowNumber];
    const size = override?.size || a.recommendedSize;
    const chart = input.charts.find((c) => c.styleNumber === a.styleNumber) ?? input.charts[0];
    const sizeRow = chart?.rows.find((r) => r.code.toUpperCase() === size.toUpperCase());

    const cells = REPORT_MEASURES.map((m) => compare(m, d[m], sizeRow, size, threshold));
    const alerts: string[] = [];

    if (override?.size) {
      alerts.push(
        `Ordered ${override.size} instead of the recommended ${a.recommendedSize}${override.reason ? ` - ${override.reason}` : " (no reason given)"}.`,
      );
    }
    // Girth problems the matcher raised (boundary, borderline, off the chart)
    // apply to the recommended size, so only show them when it is what is ordered.
    if (!override?.size) {
      for (const f of a.flags) {
        if (f.measure && f.measure !== "girth" && f.code === "MEASUREMENT_OUT_OF_RANGE") continue;
        if (f.severity === "warning" || f.severity === "blocking") alerts.push(f.message);
      }
    }
    for (const c of cells) {
      if (c.measure === "girth" && !override?.size) continue;
      if (c.status === "over" || c.status === "under") alerts.push(c.note);
    }

    return {
      rowNumber: d.rowNumber,
      name,
      styleNumber: a.styleNumber,
      size,
      recommendedSize: a.recommendedSize,
      overrideReason: override?.reason,
      cells,
      alerts: dedupe(alerts),
    };
  });

  const sized = rows.filter((r) => !r.notSized);
  return {
    className: input.className,
    sheetName: input.sheetName,
    teacher: input.teacher,
    charts: input.charts,
    rows,
    summary: {
      sized: sized.length,
      clean: sized.filter((r) => r.alerts.length === 0).length,
      withAlerts: sized.filter((r) => r.alerts.length > 0).length,
      notSized: rows.length - sized.length,
    },
  };
}

function blankCell(measure: MeasurementKey, value: number | undefined): FitCell {
  return value == null
    ? { measure, status: "not-measured", text: "—", note: `No ${MEASURE_LABELS[measure].toLowerCase()} measurement.` }
    : { measure, value, status: "not-on-chart", text: fmt(value), note: "Not sized." };
}

function compare(
  measure: MeasurementKey,
  value: number | undefined,
  sizeRow: SizeRow | undefined,
  size: string,
  threshold: number,
): FitCell {
  const label = MEASURE_LABELS[measure];
  if (value == null) {
    return {
      measure,
      status: "not-measured",
      text: "—",
      note: `No ${label.toLowerCase()} measurement on the sheet.`,
    };
  }
  const range = sizeRow?.[measure];
  if (!range || (range.min == null && range.max == null)) {
    return {
      measure,
      value,
      status: "not-on-chart",
      text: fmt(value),
      note: `The chart gives no ${label.toLowerCase()} for ${size}.`,
    };
  }

  if (contains(range, value)) {
    return {
      measure,
      value,
      range,
      status: "fits",
      text: `${fmt(value)} ✓`,
      note: `${label} ${fmt(value)}" is inside ${size} (${formatRange(range)}).`,
    };
  }

  // A single printed number is how long the garment is cut, not a range the
  // dancer must fall in - a shorter dancer just gets a longer leg.
  if (range.min !== null && range.min === range.max) {
    return {
      measure,
      value,
      range,
      status: "garment",
      text: fmt(value),
      note: `${label}: ${size} is cut to ${fmt(range.min)}", the dancer measures ${fmt(value)}".`,
    };
  }

  const over = value > (range.max ?? Infinity);
  const delta = distanceOutside(range, value);
  // Girth outside the ordered size is never a seam's worth: it cannot be altered.
  const serious = measure === "girth" || delta > threshold;
  const status: CellStatus = serious
    ? over
      ? "over"
      : "under"
    : over
      ? "slightly-over"
      : "slightly-under";
  const what =
    measure === "girth"
      ? over
        ? "the costume will be too short in the body and cannot be let out"
        : "the costume will run long in the body"
      : measure === "inseam" || measure === "height"
        ? over
          ? "the costume may be too short"
          : "the costume will run long"
        : over
          ? "needs letting out"
          : "can be taken in";

  return {
    measure,
    value,
    range,
    status,
    delta,
    text: `${fmt(value)} ${over ? "▲" : "▼"}${fmt(delta)}`,
    note: `${label} ${fmt(value)}" is ${fmt(delta)}" ${over ? "over" : "under"} ${size} (${formatRange(range)}) - ${what}.`,
  };
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}
