import {
  MEASUREMENT_KEYS,
  DEFAULT_SIZING_OPTIONS,
  type MeasurementKey,
  type Flag,
  type Measurements,
  type Range,
  type SizeChart,
  type SizeRow,
  type SizingOptions,
  type SizingResult,
} from "./types";
import { contains, distanceOutside, fmt, formatRange, hi, lo } from "./range";
import { inseamFit } from "./inseam";

export class SizingError extends Error {}

/**
 * Recommend a costume size for one dancer.
 *
 * Girth is the binding constraint. It alone selects the size, even when every
 * other measurement fits a smaller one, because girth is measured over the
 * shoulder and through the crotch and is the single dimension a seamstress
 * cannot let out: too-small girth cannot be worn, while a too-large bust or
 * waist can be taken in. Bust, waist, hips, inseam and height are therefore
 * reported as advisory flags and never override the girth decision.
 *
 * The one place advisory measurements participate is as a tiebreak *among sizes
 * that already satisfy girth* - which happens on charts carrying long variants
 * (IC vs ICL), where several rows legitimately contain the same girth. That is
 * not a "closest overall fit" search; girth still gates the candidate set.
 */
export function matchSize(
  m: Measurements,
  chart: SizeChart,
  availableSizes: string[],
  options: SizingOptions = {},
): SizingResult {
  const opts = { ...DEFAULT_SIZING_OPTIONS, ...options };
  const flags: Flag[] = [];

  // Girth on any chart that prints it. Weissman's boys and mens charts have no
  // girth column at all - those costumes are two-piece - so they declare chest.
  const primary: MeasurementKey = chart.primaryMeasurement ?? "girth";
  const advisoryKeys = MEASUREMENT_KEYS.filter((k) => k !== primary);

  const rows = orderableRows(chart, availableSizes, primary);
  if (rows.length === 0) {
    throw new SizingError(
      `No orderable sizes: chart "${chart.id}" and availableSizes [${availableSizes.join(", ")}] do not intersect.`,
    );
  }
  const primaryValue = m[primary];
  if (typeof primaryValue !== "number" || !Number.isFinite(primaryValue)) {
    throw new SizingError(`${cap(primary)} is required to size a dancer against this chart.`);
  }

  const rawGirth = primaryValue;
  const matchedGirth = rawGirth + opts.girthGrowthAllowance;
  if (opts.girthGrowthAllowance > 0) {
    flags.push({
      code: "GROWTH_ALLOWANCE_APPLIED",
      severity: "info",
      message: `Growth allowance of ${fmt(opts.girthGrowthAllowance)}" applied: matched on ${fmt(matchedGirth)}" rather than the measured ${fmt(rawGirth)}".`,
      measure: "girth",
      value: matchedGirth,
      delta: opts.girthGrowthAllowance,
    });
  }

  const { row, reason } = selectByGirth(matchedGirth, rows, m, opts, flags, primary);

  addBorderFlags(matchedGirth, row, opts.borderThreshold, flags, primary);
  addAdvisoryFlags(m, row, flags, advisoryKeys, primary, opts.alterationThreshold);

  return {
    size: row.code,
    ordinal: row.ordinal,
    matchedGirth,
    rawGirth,
    flags,
    rationale: buildRationale(
      matchedGirth,
      rawGirth,
      row,
      reason,
      flags,
      opts.girthGrowthAllowance,
      primary,
    ),
  };
}

type SelectReason =
  | "inside"
  | "gap-rounded-up"
  | "below-smallest"
  | "above-largest"
  | "boundary"
  | "ambiguous";

/**
 * Orderable rows, ordered by girth rather than by printed position.
 *
 * Real charts are not always printed in girth order: Revolution's female chart
 * lists PA (Petite Adult, girth 53-57) between XXLC (56-58) and SA (55-58),
 * because it is a differently-proportioned size rather than the next size up.
 * Gap-rounding and "the largest size" only make sense against girth order, so
 * that is what is used, with the printed ordinal breaking ties.
 */
function orderableRows(
  chart: SizeChart,
  availableSizes: string[],
  primary: MeasurementKey,
): SizeRow[] {
  const wanted = new Set(
    availableSizes.map((s) => s.trim().toUpperCase()).filter((s) => s.length > 0),
  );
  const band = (r: SizeRow) => r[primary] ?? { min: null, max: null };
  // Some vendors do not publish a per-costume size list - Layla's keeps it
  // behind a trade login. An empty list means "the whole chart" rather than
  // "nothing orderable", so a costume can still be sized; the caller is expected
  // to say that the range was not confirmed against the vendor.
  return chart.rows
    .filter((r) => wanted.size === 0 || wanted.has(r.code.trim().toUpperCase()))
    .slice()
    .sort(
      (a, b) =>
        lo(band(a)) - lo(band(b)) || hi(band(a)) - hi(band(b)) || a.ordinal - b.ordinal,
    );
}

function selectByGirth(
  girth: number,
  rows: SizeRow[],
  m: Measurements,
  opts: Required<SizingOptions>,
  flags: Flag[],
  primary: MeasurementKey,
): { row: SizeRow; reason: SelectReason } {
  const band = (r: SizeRow) => r[primary] ?? { min: null, max: null };
  const name = cap(primary);
  const fitting = rows.filter((r) => contains(band(r), girth));

  if (fitting.length === 1) return { row: fitting[0], reason: "inside" };

  if (fitting.length === 0) {
    // Above the largest orderable size: no choice of size can make this work.
    if (girth > hi(band(rows[rows.length - 1]))) {
      const row = rows[rows.length - 1];
      flags.push({
        code: "PRIMARY_ABOVE_RANGE",
        severity: "blocking",
        message: `${name} ${fmt(girth)}" exceeds the largest orderable size ${row.code} (${formatRange(band(row))}). This costume cannot be ordered off the chart for this dancer.`,
        measure: primary,
        value: girth,
        range: band(row),
        direction: "over",
        delta: girth - hi(band(row)),
      });
      return { row, reason: "above-largest" };
    }

    // Otherwise girth sits below some row - either under the whole chart, or in
    // a gap between two printed ranges. Both resolve upward.
    const next = rows.find((r) => girth < lo(band(r))) ?? rows[0];
    if (next.ordinal === rows[0].ordinal) {
      flags.push({
        code: "PRIMARY_BELOW_RANGE",
        severity: "warning",
        message: `${name} ${fmt(girth)}" is below the smallest orderable size ${next.code} (${formatRange(band(next))}). ${next.code} recommended; the costume will run long.`,
        measure: primary,
        value: girth,
        range: band(next),
        direction: "under",
        delta: lo(band(next)) - girth,
      });
      return { row: next, reason: "below-smallest" };
    }
    flags.push({
      code: "PRIMARY_IN_GAP",
      severity: "info",
      message: `${name} ${fmt(girth)}" falls between printed sizes; rounded up to ${next.code} (${formatRange(band(next))}) because too-small girth cannot be altered.`,
      measure: primary,
      value: girth,
      range: band(next),
    });
    return { row: next, reason: "gap-rounded-up" };
  }

  // More than one orderable size contains this girth.
  const sharedBoundary =
    fitting.some((r) => girth === hi(band(r))) &&
    fitting.some((r) => girth === lo(band(r)));

  if (sharedBoundary && opts.boundaryPolicy === "chart-literal") {
    const row = fitting[0];
    flags.push({
      code: "PRIMARY_ON_BOUNDARY",
      severity: "warning",
      message: `${name} ${fmt(girth)}" sits exactly on the boundary between ${fitting.map((r) => r.code).join(" and ")}. Taking ${row.code} per chart-literal policy - verify before ordering.`,
      measure: primary,
      value: girth,
      range: band(row),
    });
    return { row, reason: "boundary" };
  }

  if (sharedBoundary) {
    // Round-up policy: the larger size, because too-small girth is unwearable.
    const row = fitting[fitting.length - 1];
    flags.push({
      code: "PRIMARY_ON_BOUNDARY",
      severity: "warning",
      message: `${name} ${fmt(girth)}" sits exactly on the boundary between ${fitting.map((r) => r.code).join(" and ")}. Rounded up to ${row.code} because too-small girth cannot be altered.`,
      measure: primary,
      value: girth,
      range: band(row),
    });
    return { row, reason: "boundary" };
  }

  // Overlapping tracks (regular vs long). Girth has already gated the set, so
  // the remaining measurements only choose between equally wearable options.
  const row = bestByAdvisoryFit(fitting, m, primary);
  flags.push({
    code: "AMBIGUOUS_SIZE",
    severity: "info",
    message: `${name} ${fmt(girth)}" fits ${fitting.map((r) => `${r.code} (${formatRange(band(r))})`).join(" and ")}. Chose ${row.code} as the best fit on the remaining measurements.`,
    measure: primary,
    value: girth,
  });
  return { row, reason: "ambiguous" };
}

/**
 * Tiebreak among rows that already satisfy girth. Prefers the row where the most
 * advisory measurements also land in range; an outright tie goes to the larger
 * size, consistent with rounding up.
 *
 * Only ever called with a girth-satisfying candidate set, so it cannot select a
 * size whose girth does not fit.
 */
function bestByAdvisoryFit(
  candidates: SizeRow[],
  m: Measurements,
  primary: MeasurementKey,
): SizeRow {
  let best = candidates[0];
  let bestScore = -1;
  for (const row of candidates) {
    let score = 0;
    for (const key of MEASUREMENT_KEYS.filter((k) => k !== primary)) {
      const value = m[key];
      const range = row[key];
      if (value == null || !range) continue;
      if (contains(range, value)) score += 1;
    }
    // `>=` walks toward the larger size on ties, since candidates are sorted.
    if (score >= bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}

function addBorderFlags(
  girth: number,
  row: SizeRow,
  threshold: number,
  flags: Flag[],
  primary: MeasurementKey,
): void {
  const band = row[primary] ?? { min: null, max: null };
  const name = cap(primary);

  // Only meaningful when the value landed inside the row; the gap and
  // out-of-range flags already describe the other cases.
  if (!contains(band, girth)) return;

  const toHigh = hi(band) - girth;
  const toLow = girth - lo(band);

  if (Number.isFinite(toHigh) && toHigh <= threshold) {
    flags.push({
      code: "PRIMARY_BORDERLINE_HIGH",
      severity: "warning",
      message:
        toHigh === 0
          ? `${name} ${fmt(girth)}" is exactly at the top of ${row.code} (${formatRange(band)}). Any growth puts this dancer out of the size - re-measure before ordering.`
          : `${name} ${fmt(girth)}" is only ${fmt(toHigh)}" under the top of ${row.code} (${formatRange(band)}). Re-measure before ordering; a growing dancer may need the next size up.`,
      measure: primary,
      value: girth,
      range: band,
      direction: "over",
      delta: toHigh,
    });
  }
  // Sitting near the BOTTOM of a size is not a risk in the way sitting near the
  // top is: the costume runs slightly roomy, which a seamstress can take in,
  // and when girth rounded up it is the outcome we deliberately chose. Reported
  // as information so it stays off the exceptions list.
  // `toLow > 0` excludes the exact-boundary case, already covered by
  // PRIMARY_ON_BOUNDARY.
  if (Number.isFinite(toLow) && toLow > 0 && toLow <= threshold) {
    flags.push({
      code: "PRIMARY_BORDERLINE_LOW",
      severity: "info",
      message: `${name} ${fmt(girth)}" sits ${fmt(toLow)}" above the bottom of ${row.code} (${formatRange(band)}); the costume will run slightly roomy, which can be taken in.`,
      measure: primary,
      value: girth,
      range: band,
      direction: "under",
      delta: toLow,
    });
  }
}

function addAdvisoryFlags(
  m: Measurements,
  row: SizeRow,
  flags: Flag[],
  advisoryKeys: readonly MeasurementKey[],
  primary: MeasurementKey,
  alterationThreshold: number,
): void {
  const namePrimary = cap(primary);
  for (const key of advisoryKeys) {
    const value = m[key];
    const range: Range | undefined = row[key];
    if (value == null) {
      flags.push({
        code: "MISSING_MEASUREMENT",
        severity: "info",
        message: `No ${key} measurement on file; not checked against ${row.code}.`,
        measure: key,
      });
      continue;
    }
    if (key === "inseam" && range && range.min !== null && range.min === range.max) {
      const flag = inseamFlag(value, range.min, row.code);
      if (flag) flags.push(flag);
      continue;
    }

    if (!range || contains(range, value)) continue;

    // A single printed value is the GARMENT's dimension, not a range the dancer
    // has to fall inside - costume charts print inseam that way. Comparing a
    // dancer against it and calling the difference "out of range" is noise: a
    // shorter dancer simply gets a costume with a longer leg.
    if (range.min !== null && range.min === range.max) {
      flags.push({
        code: "MEASUREMENT_OUT_OF_RANGE",
        severity: "info",
        message: `${cap(key)}: the ${row.code} garment is cut to ${fmt(range.min)}", the dancer measures ${fmt(value)}".`,
        measure: key,
        value,
        range,
      });
      continue;
    }

    const direction = value > hi(range) ? "over" : "under";
    const delta = distanceOutside(range, value);
    // A small deviation is a seam, not a decision: these dimensions can be
    // altered. Only a deviation big enough to mean real alteration work earns a
    // place on the exceptions list, or that list stops being worth reading.
    const needsAttention = delta > alterationThreshold;
    flags.push({
      code: "MEASUREMENT_OUT_OF_RANGE",
      severity: needsAttention ? "warning" : "info",
      message: `${cap(key)} ${fmt(value)}" is ${fmt(delta)}" ${direction} the ${row.code} range (${formatRange(range)})${needsAttention ? " - enough to need altering" : ""} - advisory only; ${namePrimary} decides the size.`,
      measure: key,
      value,
      range,
      direction,
      delta,
    });
  }
}

/** Flag an inseam against the single garment length a chart prints for a size. */
function inseamFlag(value: number, garment: number, code: string): Flag | null {
  const fit = inseamFit(value, garment);
  const base = { code: "MEASUREMENT_OUT_OF_RANGE" as const, measure: "inseam" as const, value, range: { min: garment, max: garment } };
  if (fit === "too-short") {
    const delta = value - garment;
    return {
      ...base,
      severity: "warning",
      direction: "over",
      delta,
      message: `Inseam ${fmt(value)}" is ${fmt(delta)}" longer than the ${code} garment's ${fmt(garment)}" leg - the legs will be too short.`,
    };
  }
  if (fit === "too-long") {
    const delta = garment - value;
    return {
      ...base,
      severity: "warning",
      direction: "under",
      delta,
      message: `Inseam ${fmt(value)}" is ${fmt(delta)}" shorter than the ${code} garment's ${fmt(garment)}" leg - the legs will be too long.`,
    };
  }
  if (fit === "exact") {
    return {
      ...base,
      severity: "info",
      message: `Inseam ${fmt(value)}" is right on the ${code} garment's ${fmt(garment)}" leg - no room to grow.`,
    };
  }
  return null;
}

function buildRationale(
  girth: number,
  rawGirth: number,
  row: SizeRow,
  reason: SelectReason,
  flags: Flag[],
  allowance: number,
  primary: MeasurementKey,
): string {
  const label = row.label ? `${row.code} (${row.label})` : row.code;
  const band = row[primary] ?? { min: null, max: null };
  const name = cap(primary);
  const girthPhrase =
    allowance > 0
      ? `${name} ${fmt(rawGirth)}" + ${fmt(allowance)}" growth allowance = ${fmt(girth)}"`
      : `${name} ${fmt(girth)}"`;

  const head: Record<SelectReason, string> = {
    inside: `${girthPhrase} falls in ${label} ${formatRange(band)}.`,
    "gap-rounded-up": `${girthPhrase} falls between sizes; rounded up to ${label} ${formatRange(band)}.`,
    "below-smallest": `${girthPhrase} is below the smallest orderable size; ${label} ${formatRange(band)} is the closest available.`,
    "above-largest": `${girthPhrase} exceeds the largest orderable size ${label} ${formatRange(band)}.`,
    boundary: `${girthPhrase} sits on a shared size boundary; took ${label} ${formatRange(band)}.`,
    ambiguous: `${girthPhrase} fits more than one size; ${label} ${formatRange(band)} fits the remaining measurements best.`,
  };

  // Only real deviations from a range; the garment-spec notes have no direction
  // or distance to report.
  const outOfRange = flags.filter(
    (f) => f.code === "MEASUREMENT_OUT_OF_RANGE" && f.direction && f.delta != null,
  );
  if (outOfRange.length === 0) {
    return `${head[reason]} All other measurements are in range.`;
  }
  const detail = outOfRange
    .map(
      (f) =>
        `${f.measure} ${fmt(f.value as number)}" ${f.direction} by ${fmt(f.delta as number)}"`,
    )
    .join("; ");
  return `${head[reason]} Advisory only: ${detail}. ${name} decides the size.`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
