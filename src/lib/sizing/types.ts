/**
 * Core sizing types.
 *
 * Everything here is plain data with no I/O, so the matcher can be exercised
 * exhaustively in tests without a database or a network call.
 */

export const MEASUREMENT_KEYS = [
  "girth",
  "bust",
  "waist",
  "hips",
  "inseam",
  "height",
] as const;

export type MeasurementKey = (typeof MEASUREMENT_KEYS)[number];

/** Advisory measurements are everything girth is not. */
export const ADVISORY_KEYS = MEASUREMENT_KEYS.filter(
  (k): k is Exclude<MeasurementKey, "girth"> => k !== "girth",
);

/**
 * An inclusive range from a printed size chart. `null` means the chart left the
 * end open (typical for the smallest and largest rows), and is treated as
 * unbounded rather than as zero.
 */
export interface Range {
  min: number | null;
  max: number | null;
}

export interface SizeRow {
  /** Vendor size code, e.g. "MC". Long variants such as "MCL" are their own codes. */
  code: string;
  label?: string;
  /** Position within the chart. Defines what "the next size up" means. */
  ordinal: number;
  /** Girth is the only range the matcher requires. */
  girth: Range;
  bust?: Range;
  waist?: Range;
  hips?: Range;
  inseam?: Range;
  height?: Range;
}

export interface SizeChart {
  id: string;
  companySlug: string;
  /** e.g. "child-girls", "adult-womens" */
  variant: string;
  status: "draft" | "confirmed";
  rows: SizeRow[];
  /** Free-text vendor caveats carried through to the UI. */
  notes?: string[];
  /**
   * The measurement that decides the size on this chart. Girth on any chart that
   * prints it, because it is the dimension a costume cannot be altered to fit.
   *
   * Weissman's boys and mens charts print no girth at all - those costumes are
   * two-piece, so there is no shoulder-to-crotch dimension to constrain - and
   * they are sized on chest instead. Declared per chart rather than guessed at,
   * so a chart that simply lost its girth column in transcription fails loudly
   * instead of silently switching to a weaker measurement.
   */
  primaryMeasurement?: MeasurementKey;
}

export interface Measurements {
  girth: number;
  bust?: number;
  waist?: number;
  hips?: number;
  inseam?: number;
  height?: number;
}

export type FlagSeverity = "info" | "warning" | "blocking";

export type FlagCode =
  /** The deciding measurement exceeds the largest orderable size. Unfixable by choosing a size. */
  | "PRIMARY_ABOVE_RANGE"
  /** It is below the smallest orderable size. */
  | "PRIMARY_BELOW_RANGE"
  /** It fell between two sizes; rounded up. */
  | "PRIMARY_IN_GAP"
  /** It sits exactly on a boundary shared by two sizes. */
  | "PRIMARY_ON_BOUNDARY"
  /** It is within the border threshold of an edge of the chosen size. */
  | "PRIMARY_BORDERLINE_HIGH"
  | "PRIMARY_BORDERLINE_LOW"
  /** More than one orderable size contained the girth; chosen by advisory fit. */
  | "AMBIGUOUS_SIZE"
  /** An advisory measurement falls outside the chosen size. Never changes the size. */
  | "MEASUREMENT_OUT_OF_RANGE"
  /** A growth allowance was added to the raw girth before matching. */
  | "GROWTH_ALLOWANCE_APPLIED"
  /** An advisory measurement was absent from the sheet. */
  | "MISSING_MEASUREMENT"
  /** Emitted by a declarative per-vendor rule. */
  | "VENDOR_RULE";

export interface Flag {
  code: FlagCode;
  severity: FlagSeverity;
  /** Human-readable, shown directly in the results table and the export. */
  message: string;
  measure?: MeasurementKey;
  value?: number;
  range?: Range;
  direction?: "over" | "under";
  /** Inches outside the range, or distance to the boundary for borderline flags. */
  delta?: number;
}

export interface SizingOptions {
  /**
   * Inches added to girth before matching, for orders placed months ahead.
   * Weissman suggests 1.5-2". Defaults to 0 so nothing is shifted silently.
   */
  girthGrowthAllowance?: number;
  /** Distance from a size edge that counts as "on the border". */
  borderThreshold?: number;
  /**
   * How far an advisory measurement must fall outside its size before it is
   * worth a human's attention.
   *
   * Bust, waist and hips can be altered, so a small deviation is a seam, not a
   * decision. Below this it is recorded as information; above it, the garment
   * needs real alteration work and is raised as a warning. Without this the
   * exceptions list fills with half-inch waists and stops meaning anything.
   */
  alterationThreshold?: number;
  /**
   * What to do when girth lands exactly on a value two sizes share.
   * "round-up" reflects that too-small girth is unwearable while too-large is
   * alterable. "chart-literal" takes the smaller size the chart nominally allows.
   */
  boundaryPolicy?: "round-up" | "chart-literal";
}

export const DEFAULT_SIZING_OPTIONS: Required<SizingOptions> = {
  girthGrowthAllowance: 0,
  borderThreshold: 1.0,
  alterationThreshold: 2.0,
  boundaryPolicy: "round-up",
};

export interface SizingResult {
  /** The recommended vendor size code. */
  size: string;
  ordinal: number;
  /** Girth actually used for matching, after any growth allowance. */
  matchedGirth: number;
  rawGirth: number;
  flags: Flag[];
  /** Plain-English explanation the studio can defend to a parent. */
  rationale: string;
}
