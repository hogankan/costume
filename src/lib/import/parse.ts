import * as XLSX from "xlsx";
import type { HeaderGuess, ImportField } from "./headers";
import { parseMeasurement } from "./measure";

export { parseMeasurement };

/**
 * Turn a studio's uploaded sheet into dancers the sizer can work with.
 *
 * Real measurement sheets are handwritten transcriptions: values arrive as
 * `44`, `44.5`, `44 1/2`, `44 1/2"`, or with stray whitespace, and rows for
 * dancers who have not been measured yet are simply blank. All of that is
 * normalised here rather than in the matcher.
 */

export type Unit = "in" | "cm";
const CM_PER_INCH = 2.54;

/**
 * Girth is measured over the shoulder, through the crotch and back, so it is a
 * large number: roughly 38-55" for children and up to about 70" for adults, which
 * is 95-180cm. Nothing plausible in inches reaches 80, and nothing plausible in
 * centimetres falls below 90, so the two populations separate cleanly here.
 */
const INCHES_UPPER_BOUND = 80;

export interface RowIssue {
  severity: "error" | "warning";
  message: string;
  field?: ImportField;
}

export interface ImportedDancer {
  /** 1-based row in the original sheet, so the user can find it again. */
  rowNumber: number;
  name: string;
  externalId?: string;
  colorway?: string;
  /** As written on the sheet ("M", "boy", "Girl"); used to pre-tick boy costumes. */
  gender?: string;
  /** The sheet's own Notes cell, e.g. "Measurements not taken yet". */
  notes?: string;
  /** Set when the dancer was added or changed in the app rather than read from the sheet. */
  source?: "added" | "edited";
  girth?: number;
  bust?: number;
  waist?: number;
  hips?: number;
  inseam?: number;
  height?: number;
  issues: RowIssue[];
}

export interface ParsedSheet {
  name: string;
  rows: unknown[][];
}

export function parseWorkbook(data: ArrayBuffer | Buffer): ParsedSheet[] {
  const wb = XLSX.read(data, {
    type: "buffer",
    cellDates: false,
    // CSV defaults to the Windows codepage, which mangles UTF-8: a name like
    // "Chloé" arrives as "ChloÃ©" and a measurement of 40½ as "40Â½", which then
    // fails to parse. Studios export UTF-8, so read it as UTF-8.
    codepage: 65001,
  });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      header: 1,
      // Blank rows are KEPT so a dancer's rowNumber matches the row the user
      // sees in their own spreadsheet. readRoster skips them.
      blankrows: true,
      defval: null,
    }) as unknown[][],
  }));
}

/** The subset of import fields that hold a numeric measurement. */
export type MeasureField = "girth" | "bust" | "waist" | "hips" | "inseam" | "height";

const MEASURE_FIELDS: MeasureField[] = ["girth", "bust", "waist", "hips", "inseam", "height"];

export interface ReadRosterResult {
  dancers: ImportedDancer[];
  /** Unit the sheet appears to be recorded in. */
  detectedUnit: Unit;
  /** Rows skipped because they were entirely blank. */
  skippedRows: number;
}

export function readRoster(
  rows: unknown[][],
  headerRowIndex: number,
  mapping: HeaderGuess[],
): ReadRosterResult {
  const byField = new Map<ImportField, number>();
  for (const g of mapping) {
    if (g.field && !byField.has(g.field)) byField.set(g.field, g.index);
  }

  const cell = (row: unknown[], field: ImportField): unknown => {
    const idx = byField.get(field);
    return idx === undefined ? null : row[idx];
  };
  const text = (row: unknown[], field: ImportField): string | undefined => {
    const v = cell(row, field);
    if (v == null) return undefined;
    const s = String(v).trim();
    return s.length > 0 ? s : undefined;
  };

  const dancers: ImportedDancer[] = [];
  let skippedRows = 0;

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (row.every((c) => c == null || String(c).trim() === "")) {
      skippedRows++;
      continue;
    }

    const issues: RowIssue[] = [];
    const { name, dateLike } = resolveName(row, byField, text);
    const hasMeasurement = MEASURE_FIELDS.some((f) => {
      const v = cell(row, f);
      return v != null && String(v).trim() !== "";
    });

    // A line with no name and no numbers is a footer or a stray note under the
    // table ("Measurements in inches..."), not a dancer.
    if (!name && !hasMeasurement) {
      skippedRows++;
      continue;
    }

    if (!name) {
      issues.push({ severity: "error", message: "No dancer name on this row.", field: "name" });
    }
    if (dateLike) {
      issues.push({
        severity: "warning",
        field: "firstName",
        message: `The name reads as a date (${dateLike}). Excel probably turned the name into a date - check the original sheet.`,
      });
    }

    const dancer: ImportedDancer = {
      rowNumber: i + 1,
      name: name ?? "",
      externalId: text(row, "externalId"),
      colorway: text(row, "colorway"),
      gender: text(row, "gender"),
      notes: text(row, "notes"),
      issues,
    };

    for (const field of MEASURE_FIELDS) {
      const rawCell = cell(row, field);
      if (rawCell == null || String(rawCell).trim() === "") continue;
      const value = parseMeasurement(rawCell);
      if (value === null) {
        issues.push({
          severity: field === "girth" ? "error" : "warning",
          field,
          message: `Could not read ${field} value ${JSON.stringify(String(rawCell))}.`,
        });
        continue;
      }
      dancer[field] = value;
    }

    if (dancer.girth == null) {
      issues.push({
        severity: "error",
        field: "girth",
        message:
          !hasMeasurement && dancer.notes
            ? `Not measured - the sheet says: "${dancer.notes}".`
            : "No girth measurement. Girth decides the size, so this dancer cannot be sized until it is recorded.",
      });
    }

    dancers.push(dancer);
  }

  return { dancers, detectedUnit: detectUnit(dancers), skippedRows };
}

function resolveName(
  row: unknown[],
  byField: Map<ImportField, number>,
  text: (row: unknown[], field: ImportField) => string | undefined,
): { name: string | undefined; dateLike?: string } {
  // Excel silently turns some typed names into dates, which then arrive as a
  // serial number. Show it as a date so the user can recognise what happened.
  let dateLike: string | undefined;
  const readPart = (field: ImportField): string | undefined => {
    const idx = byField.get(field);
    const raw = idx === undefined ? null : row[idx];
    const asDate = excelDateText(raw);
    if (asDate) {
      dateLike = asDate;
      return asDate;
    }
    return text(row, field);
  };

  const whole = readPart("name");
  // Sheets frequently split the name across two columns.
  const joined =
    whole ?? [readPart("firstName"), readPart("lastName")].filter(Boolean).join(" ").trim();
  if (!joined) return { name: undefined, dateLike };

  // A PDF prints the converted date as text, sometimes run into the surname:
  // "2026-06-01 00:00:Myers".
  const leading = /^(\d{4}-\d{2}-\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?:?\s*(.*)$/.exec(joined);
  if (leading) {
    return { name: `${leading[1]} ${leading[2]}`.trim(), dateLike: dateLike ?? leading[1] };
  }
  return { name: joined, dateLike };
}

/** Excel serials for 1990-2100, the range a mis-typed name lands in. */
const EXCEL_DATE_MIN = 32874;
const EXCEL_DATE_MAX = 73051;

/**
 * If a name cell holds a date - an Excel serial number or ISO-looking text -
 * return it as `YYYY-MM-DD`, otherwise undefined.
 */
export function excelDateText(raw: unknown): string | undefined {
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "number" && raw >= EXCEL_DATE_MIN && raw <= EXCEL_DATE_MAX) {
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof raw === "string") {
    const m = /^\s*(\d{4}-\d{2}-\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?:?)?\s*$/.exec(raw);
    if (m) return m[1];
  }
  return undefined;
}

/** Infer inches vs centimetres from the middle of the girth distribution. */
export function detectUnit(dancers: ImportedDancer[]): Unit {
  const girths = dancers
    .map((d) => d.girth)
    .filter((g): g is number => typeof g === "number")
    .sort((a, b) => a - b);
  if (girths.length === 0) return "in";
  const median = girths[Math.floor(girths.length / 2)];
  return median > INCHES_UPPER_BOUND ? "cm" : "in";
}

/** Convert a roster to inches. Charts are stored in inches throughout. */
export function convertToInches(dancers: ImportedDancer[]): ImportedDancer[] {
  const round2 = (n: number) => Math.round((n / CM_PER_INCH) * 100) / 100;
  return dancers.map((d) => {
    const out = { ...d };
    for (const field of MEASURE_FIELDS) {
      const v = out[field];
      if (typeof v === "number") out[field] = round2(v);
    }
    return out;
  });
}
