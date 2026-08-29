import * as XLSX from "xlsx";
import type { HeaderGuess, ImportField } from "./headers";

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

/**
 * Parse a measurement cell.
 *
 * Handles plain numbers, decimals, inch marks, and the mixed fractions that turn
 * up constantly on tailoring sheets ("44 1/2", "44½").
 */
export function parseMeasurement(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  let s = String(raw).trim();
  if (s.length === 0) return null;

  // Vulgar fractions.
  const VULGAR: Record<string, number> = {
    "¼": 0.25,
    "½": 0.5,
    "¾": 0.75,
    "⅛": 0.125,
    "⅜": 0.375,
    "⅝": 0.625,
    "⅞": 0.875,
    "⅓": 1 / 3,
    "⅔": 2 / 3,
  };
  let vulgarBonus = 0;
  for (const [glyph, value] of Object.entries(VULGAR)) {
    if (s.includes(glyph)) {
      vulgarBonus = value;
      s = s.replace(glyph, " ");
    }
  }

  s = s.replace(/["”″]/g, " ").replace(/\b(in|inch|inches|cm)\b/gi, " ").trim();

  // "44 1/2"
  const mixed = /^(-?\d+(?:\.\d+)?)\s+(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (mixed) {
    const denom = Number(mixed[3]);
    if (denom === 0) return null;
    return Number(mixed[1]) + Number(mixed[2]) / denom;
  }

  // "1/2"
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (frac) {
    const denom = Number(frac[2]);
    return denom === 0 ? null : Number(frac[1]) / denom;
  }

  const plain = /^-?\d+(?:\.\d+)?$/.exec(s);
  if (plain) return Number(plain[0]) + vulgarBonus;

  // A bare vulgar fraction such as "½".
  if (vulgarBonus > 0 && s.length === 0) return vulgarBonus;

  return null;
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
    const name = resolveName(row, text);
    if (!name) {
      issues.push({ severity: "error", message: "No dancer name on this row.", field: "name" });
    }

    const dancer: ImportedDancer = {
      rowNumber: i + 1,
      name: name ?? "",
      externalId: text(row, "externalId"),
      colorway: text(row, "colorway"),
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
          "No girth measurement. Girth decides the size, so this dancer cannot be sized until it is recorded.",
      });
    }

    dancers.push(dancer);
  }

  return { dancers, detectedUnit: detectUnit(dancers), skippedRows };
}

function resolveName(
  row: unknown[],
  text: (row: unknown[], field: ImportField) => string | undefined,
): string | undefined {
  const whole = text(row, "name");
  if (whole) return whole;
  // Sheets frequently split the name across two columns.
  const first = text(row, "firstName");
  const last = text(row, "lastName");
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined.length > 0 ? joined : undefined;
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
