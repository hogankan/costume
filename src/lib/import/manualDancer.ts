import type { ImportedDancer, MeasureField, RowIssue } from "./parse";
import { parseMeasurement } from "./measure";

/**
 * A dancer typed into the app - a new student, or measurements filled in for
 * someone the sheet had blank - in the same shape as one read from a sheet.
 * No spreadsheet code is imported, so this runs in the browser.
 */

export const FORM_MEASURES: MeasureField[] = ["girth", "bust", "waist", "hips", "inseam", "height"];

export type DancerForm = { name: string } & Record<MeasureField, string>;

/** Added dancers are numbered from here so they never collide with sheet rows. */
export const ADDED_ROW_BASE = 100000;

const LABEL: Record<MeasureField, string> = {
  girth: "Girth",
  bust: "Chest",
  waist: "Waist",
  hips: "Hips",
  inseam: "Inseam",
  height: "Height",
};

/** Plausible inches for each measurement, to catch a typo or a centimetre value. */
const SANE: Record<MeasureField, [number, number]> = {
  girth: [25, 90],
  bust: [12, 60],
  waist: [12, 60],
  hips: [12, 70],
  inseam: [8, 45],
  height: [25, 85],
};

export function formFromDancer(d?: ImportedDancer): DancerForm {
  const v = (n?: number) => (n == null ? "" : String(n));
  return {
    name: d?.name ?? "",
    girth: v(d?.girth),
    bust: v(d?.bust),
    waist: v(d?.waist),
    hips: v(d?.hips),
    inseam: v(d?.inseam),
    height: v(d?.height),
  };
}

export function buildManualDancer(
  form: DancerForm,
  opts: { existing?: ImportedDancer; rowNumber: number },
): { dancer?: ImportedDancer; errors: string[] } {
  const errors: string[] = [];
  const name = form.name.trim();
  if (!name) errors.push("Enter the dancer's name.");

  const values: Partial<Record<MeasureField, number>> = {};
  for (const field of FORM_MEASURES) {
    const raw = form[field].trim();
    if (!raw) continue;
    const value = parseMeasurement(raw);
    if (value === null) {
      errors.push(`Couldn't read ${LABEL[field].toLowerCase()} "${raw}". Use inches, like 44 or 44 1/2.`);
      continue;
    }
    const [min, max] = SANE[field];
    if (value < min || value > max) {
      errors.push(`${LABEL[field]} ${value}" looks wrong (expected ${min}-${max} inches).`);
      continue;
    }
    values[field] = value;
  }
  if (errors.length > 0) return { errors };

  const issues: RowIssue[] = [];
  if (values.girth == null) {
    issues.push({
      severity: "error",
      field: "girth",
      message: "No girth measurement. Girth decides the size, so this dancer cannot be sized until it is recorded.",
    });
  }

  const { existing } = opts;
  const dancer: ImportedDancer = {
    rowNumber: opts.rowNumber,
    name,
    externalId: existing?.externalId,
    colorway: existing?.colorway,
    gender: existing?.gender,
    // The sheet's note ("Measurements not taken yet") no longer applies once
    // measurements have been entered.
    notes: values.girth == null ? existing?.notes : undefined,
    source: existing && existing.source !== "added" ? "edited" : "added",
    ...values,
    issues,
  };
  return { dancer, errors: [] };
}
