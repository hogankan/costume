import { detectHeaderRow, guessMapping, type HeaderGuess } from "./headers";
import { readClassMeta, parseCostumeText, type ClassMeta, type ParsedCostume } from "./classMeta";
import {
  convertToInches,
  readRoster,
  type ImportedDancer,
  type MeasureField,
  type ParsedSheet,
  type Unit,
} from "./parse";

/**
 * Read a whole costume workbook: one tab per class, each with its costume
 * written above the table, plus whatever summary tabs the studio keeps.
 */

export interface ClassSheet {
  sheetIndex: number;
  sheetName: string;
  /** "other" for tabs with no girth column, such as a summary page. */
  kind: "class" | "other";
  className: string;
  meta: ClassMeta;
  costume: ParsedCostume;
  headerRow: number;
  headers: string[];
  mapping: HeaderGuess[];
  /** Column the studio left blank for the size, filled in on export. */
  sizeColumn: number | null;
  dancers: ImportedDancer[];
  detectedUnit: Unit;
  /** True when the sheet was in centimetres and has been converted. */
  converted: boolean;
  skippedRows: number;
  /** Rows pre-ticked for the alternate (boy) costume from a Gender column or Notes. */
  suggestedAlternate: number[];
}

const MEASURES: MeasureField[] = ["girth", "bust", "waist", "hips", "inseam", "height"];
const MEASURE_LABEL: Record<MeasureField, string> = {
  girth: "Girth",
  bust: "Chest",
  waist: "Waist",
  hips: "Hips",
  inseam: "Inseam",
  height: "Height",
};

/** Two readings of the same dancer further apart than this are worth a look. */
const MISMATCH_INCHES = 2;

export function readCostumeWorkbook(sheets: ParsedSheet[]): ClassSheet[] {
  const classes = sheets.map((sheet, sheetIndex) => readClassSheet(sheet, sheetIndex));
  flagCrossSheetMismatches(classes.filter((c) => c.kind === "class"));
  return classes;
}

function readClassSheet(sheet: ParsedSheet, sheetIndex: number): ClassSheet {
  const headerRow = detectHeaderRow(sheet.rows);
  const headers = (sheet.rows[headerRow] ?? []).map((c) => String(c ?? ""));
  const mapping = guessMapping(headers);
  const roster = readRoster(sheet.rows, headerRow, mapping);
  const meta = readClassMeta(sheet.rows, headerRow);
  const hasGirth = mapping.some((m) => m.field === "girth");
  const converted = roster.detectedUnit === "cm";
  const dancers = converted ? convertToInches(roster.dancers) : roster.dancers;

  const sizeIdx = headers.findIndex((h) => /^\s*size\s*$/i.test(h));

  return {
    sheetIndex,
    sheetName: sheet.name,
    kind: hasGirth && dancers.length > 0 ? "class" : "other",
    className: meta.title || sheet.name,
    meta,
    costume: parseCostumeText(meta.costumeText),
    headerRow,
    headers,
    mapping,
    sizeColumn: sizeIdx >= 0 ? sizeIdx : null,
    dancers,
    detectedUnit: roster.detectedUnit,
    converted,
    skippedRows: roster.skippedRows,
    suggestedAlternate: dancers.filter(looksLikeBoy).map((d) => d.rowNumber),
  };
}

function looksLikeBoy(d: ImportedDancer): boolean {
  if (d.gender && /^\s*(m|male|boy|b)\s*$/i.test(d.gender)) return true;
  return Boolean(d.notes && /\bboy\b/i.test(d.notes));
}

const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, " ").trim();

/**
 * The same dancer on two class tabs should have the same numbers. When they do
 * not, one of them is probably a typo, and only a person can say which.
 */
function flagCrossSheetMismatches(classes: ClassSheet[]): void {
  const seen = new Map<string, { cls: ClassSheet; dancer: ImportedDancer }[]>();
  for (const cls of classes) {
    for (const dancer of cls.dancers) {
      if (!dancer.name) continue;
      const key = nameKey(dancer.name);
      const list = seen.get(key) ?? [];
      list.push({ cls, dancer });
      seen.set(key, list);
    }
  }

  for (const entries of seen.values()) {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        if (a.cls === b.cls) continue;
        for (const field of MEASURES) {
          const va = a.dancer[field];
          const vb = b.dancer[field];
          if (typeof va !== "number" || typeof vb !== "number") continue;
          if (Math.abs(va - vb) < MISMATCH_INCHES) continue;
          a.dancer.issues.push({
            severity: "warning",
            field,
            message: `${MEASURE_LABEL[field]} is ${va} here but ${vb} on "${b.cls.sheetName}". One may be a typo.`,
          });
          b.dancer.issues.push({
            severity: "warning",
            field,
            message: `${MEASURE_LABEL[field]} is ${vb} here but ${va} on "${a.cls.sheetName}". One may be a typo.`,
          });
        }
      }
    }
  }
}
