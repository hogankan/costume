import type { ExportAssignment } from "../export/orderSheet";
import type { ImportedDancer } from "../import/parse";
import type { SkippedDancer } from "../sizing/run";
import type { MeasurementKey, Range, SizeRow } from "../sizing/types";
import { contains, distanceOutside, fmt, formatRange, hi, lo } from "../sizing/range";
import { inseamFit } from "../sizing/inseam";

/**
 * A per-class fit report: every dancer, every costume piece, every measurement,
 * set against the chart row for the size actually being ordered - and which size
 * that measurement on its own would fit - with what does not line up called out.
 *
 * Pure data, so the screen, the print-out and the workbook show exactly the same
 * thing, in the same colours. The comparison follows the matcher's rules: girth
 * decides, inseam is compared against the garment's leg length, and other
 * measurements only alert once they are far enough out to need real alteration.
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
  /** Inside the size's printed range (or a good inseam length). */
  | "fits"
  /** Exactly the garment's inseam - fits, with no room to grow. */
  | "exact"
  /** Outside the range, but by a seam's worth - alterable without fuss. */
  | "slightly-over"
  | "slightly-under"
  /** Far enough outside to need attention, or girth outside the size. */
  | "over"
  | "under"
  /** The chart prints the garment's own dimension here, not a fit range. */
  | "garment"
  /** The chart has nothing for this measurement. */
  | "not-on-chart"
  | "not-measured";

/** The one colour scheme every view of the report uses. */
export type CellTone = "green" | "yellow" | "red" | "blue" | "grey" | "none";

export interface FitCell {
  measure: MeasurementKey;
  value?: number;
  range?: Range;
  status: CellStatus;
  tone: CellTone;
  /** Inches outside the range (or between leg and garment, for inseam). */
  delta?: number;
  /** Short text for a cell: `41 ✓`, `25 ▲3`. */
  text: string;
  /** Which size this measurement on its own fits: `SC`, `SC/ISC`, `below XSC`. */
  fitsSize?: string;
  /** Plain-English line for an alert list or a tooltip. */
  note: string;
  /** Whether this cell's note belongs on the "what to check" list. */
  alert: boolean;
}

export interface FitRow {
  rowNumber: number;
  name: string;
  /** Set when the dancer was added or changed in the app, not on the sheet. */
  source?: "added" | "edited";
  styleNumber?: string;
  costumeName?: string;
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
  /** Sizes the costume is actually made in; "fits" suggestions stay within them. */
  availableSizes?: string[];
}

export interface FitReport {
  className: string;
  sheetName?: string;
  teacher?: string;
  charts: ReportChart[];
  /** One row per dancer per costume piece; one row for a dancer not sized. */
  rows: FitRow[];
  /** Counted per dancer, not per piece. */
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
  /** Keyed by `${rowNumber}|${styleNumber}`. */
  overrides?: Record<string, { size: string; reason: string }>;
  /** Inches outside a range before it is worth an alert. Matches the sizing rule. */
  alterationThreshold?: number;
}

const DEFAULT_THRESHOLD = 2;

export const reportOverrideKey = (rowNumber: number, styleNumber: string) =>
  `${rowNumber}|${styleNumber}`;

export function buildFitReport(input: FitReportInput): FitReport {
  const threshold = input.alterationThreshold ?? DEFAULT_THRESHOLD;
  const byRow = new Map<number, ExportAssignment[]>();
  for (const a of input.assignments) {
    if (a.rowNumber == null) continue;
    byRow.set(a.rowNumber, [...(byRow.get(a.rowNumber) ?? []), a]);
  }
  const skippedByRow = new Map(input.skipped.map((s) => [s.rowNumber, s]));
  const pieceOrder = input.charts.map((c) => c.styleNumber);

  const rows: FitRow[] = input.dancers.flatMap((d): FitRow[] => {
    const name = d.name || `Row ${d.rowNumber}`;
    const assigned = (byRow.get(d.rowNumber) ?? []).sort(
      (x, y) => pieceOrder.indexOf(x.styleNumber) - pieceOrder.indexOf(y.styleNumber),
    );

    if (assigned.length === 0) {
      const reason = skippedByRow.get(d.rowNumber)?.reason ?? "Not sized.";
      return [
        {
          rowNumber: d.rowNumber,
          name,
          source: d.source,
          cells: REPORT_MEASURES.map((m) => blankCell(m, d[m])),
          alerts: [reason],
          notSized: reason,
        },
      ];
    }

    return assigned.map((a) => {
      const override = input.overrides?.[reportOverrideKey(d.rowNumber, a.styleNumber)];
      const size = override?.size || a.recommendedSize;
      const chart = input.charts.find((c) => c.styleNumber === a.styleNumber) ?? input.charts[0];
      const sizeRow = chart?.rows.find((r) => r.code.toUpperCase() === size.toUpperCase());
      const orderable = orderableRows(chart);

      const cells = REPORT_MEASURES.map((m) => ({
        ...compare(m, d[m], sizeRow, size, threshold),
        fitsSize: d[m] == null ? undefined : fitsSize(m, d[m]!, orderable),
      }));
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
        if (c.alert) alerts.push(c.note);
      }

      return {
        rowNumber: d.rowNumber,
        name,
        source: d.source,
        styleNumber: a.styleNumber,
        costumeName: a.costumeName,
        size,
        recommendedSize: a.recommendedSize,
        overrideReason: override?.reason,
        cells,
        alerts: [...new Set(alerts)],
      };
    });
  });

  // Count dancers, not rows: a dancer with a top and pants is one dancer.
  const dancers = new Map<number, FitRow[]>();
  for (const r of rows) dancers.set(r.rowNumber, [...(dancers.get(r.rowNumber) ?? []), r]);
  const groups = [...dancers.values()];
  const sized = groups.filter((g) => !g[0].notSized);

  return {
    className: input.className,
    sheetName: input.sheetName,
    teacher: input.teacher,
    charts: input.charts,
    rows,
    summary: {
      sized: sized.length,
      clean: sized.filter((g) => g.every((r) => r.alerts.length === 0)).length,
      withAlerts: sized.filter((g) => g.some((r) => r.alerts.length > 0)).length,
      notSized: groups.length - sized.length,
    },
  };
}

function orderableRows(chart: ReportChart | undefined): SizeRow[] {
  if (!chart) return [];
  const wanted = new Set((chart.availableSizes ?? []).map((s) => s.trim().toUpperCase()));
  return wanted.size === 0
    ? chart.rows
    : chart.rows.filter((r) => wanted.has(r.code.trim().toUpperCase()));
}

/**
 * The size a single measurement would pick on its own. Shown beside the size
 * actually ordered, so it is obvious which measurements pull which way.
 */
export function fitsSize(measure: MeasurementKey, value: number, rows: SizeRow[]): string | undefined {
  const withRange = rows
    .map((r) => ({ code: r.code, range: r[measure] }))
    .filter((x): x is { code: string; range: Range } =>
      Boolean(x.range && (x.range.min != null || x.range.max != null)),
    );
  if (withRange.length === 0) return undefined;

  if (measure === "inseam" && withRange.every((x) => x.range.min === x.range.max)) {
    // Smallest size whose leg leaves room to grow; failing that, an exact length.
    const byLength = [...withRange].sort((a, b) => lo(a.range) - lo(b.range));
    const good = byLength.find((x) => inseamFit(value, x.range.min!) === "good");
    if (good) return good.code;
    const exact = byLength.find((x) => inseamFit(value, x.range.min!) === "exact");
    return exact ? exact.code : "none";
  }

  const inside = withRange.filter((x) => contains(x.range, value)).map((x) => x.code);
  if (inside.length > 0) return inside.slice(0, 2).join("/") + (inside.length > 2 ? "/…" : "");

  const sorted = [...withRange].sort((a, b) => lo(a.range) - lo(b.range) || hi(a.range) - hi(b.range));
  if (value < lo(sorted[0].range)) return `below ${sorted[0].code}`;
  const last = [...withRange].sort((a, b) => hi(a.range) - hi(b.range)).at(-1)!;
  if (value > hi(last.range)) return `above ${last.code}`;
  const below = [...sorted].reverse().find((x) => hi(x.range) < value);
  const above = sorted.find((x) => lo(x.range) > value);
  return below && above ? `between ${below.code} and ${above.code}` : undefined;
}

function blankCell(measure: MeasurementKey, value: number | undefined): FitCell {
  return value == null
    ? {
        measure,
        status: "not-measured",
        tone: "grey",
        text: "—",
        note: `No ${MEASURE_LABELS[measure].toLowerCase()} measurement.`,
        alert: false,
      }
    : { measure, value, status: "not-on-chart", tone: "none", text: fmt(value), note: "Not sized.", alert: false };
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
      tone: "grey",
      text: "—",
      note: `No ${label.toLowerCase()} measurement on the sheet.`,
      alert: false,
    };
  }
  const range = sizeRow?.[measure];
  if (!range || (range.min == null && range.max == null)) {
    return {
      measure,
      value,
      status: "not-on-chart",
      tone: "none",
      text: fmt(value),
      note: `The chart gives no ${label.toLowerCase()} for ${size}.`,
      alert: false,
    };
  }

  const single = range.min !== null && range.min === range.max;

  // Inseam is the garment's leg length; the studio's rule decides the colour.
  if (measure === "inseam" && single) {
    const garment = range.min!;
    const fit = inseamFit(value, garment);
    const room = garment - value;
    switch (fit) {
      case "too-short":
        return {
          measure, value, range, status: "over", tone: "red", delta: -room, alert: true,
          text: `${fmt(value)} ▲${fmt(-room)}`,
          note: `Inseam ${fmt(value)}" is ${fmt(-room)}" longer than the ${size} leg (${fmt(garment)}") - the legs will be too short.`,
        };
      case "exact":
        return {
          measure, value, range, status: "exact", tone: "yellow", delta: 0, alert: false,
          text: `${fmt(value)} =`,
          note: `Inseam ${fmt(value)}" is right on the ${size} leg (${fmt(garment)}") - no room to grow.`,
        };
      case "good":
        return {
          measure, value, range, status: "fits", tone: "green", delta: room, alert: false,
          text: `${fmt(value)} ✓`,
          note: `Inseam ${fmt(value)}": the ${size} leg (${fmt(garment)}") is ${fmt(room)}" longer - room to grow.`,
        };
      case "too-long":
        return {
          measure, value, range, status: "under", tone: "red", delta: room, alert: true,
          text: `${fmt(value)} ▼${fmt(room)}`,
          note: `Inseam ${fmt(value)}" is ${fmt(room)}" shorter than the ${size} leg (${fmt(garment)}") - the legs will be too long.`,
        };
    }
  }

  if (contains(range, value)) {
    return {
      measure,
      value,
      range,
      status: "fits",
      tone: "green",
      text: `${fmt(value)} ✓`,
      note: `${label} ${fmt(value)}" is inside ${size} (${formatRange(range)}).`,
      alert: false,
    };
  }

  // Any other single printed number is the garment's own dimension, noted only.
  if (single) {
    return {
      measure,
      value,
      range,
      status: "garment",
      tone: "none",
      text: fmt(value),
      note: `${label}: ${size} is cut to ${fmt(range.min!)}", the dancer measures ${fmt(value)}".`,
      alert: false,
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
  const tone: CellTone = !serious ? "yellow" : over ? "red" : "blue";
  const what =
    measure === "girth"
      ? over
        ? "the costume will be too short in the body and cannot be let out"
        : "the costume will run long in the body"
      : measure === "height"
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
    tone,
    delta,
    text: `${fmt(value)} ${over ? "▲" : "▼"}${fmt(delta)}`,
    note: `${label} ${fmt(value)}" is ${fmt(delta)}" ${over ? "over" : "under"} ${size} (${formatRange(range)}) - ${what}.`,
    alert: serious,
  };
}
