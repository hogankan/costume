import type { ClassSheet } from "../import/workbook";
import type { ImportedDancer, MeasureField } from "../import/parse";
import type { ClassSizeResult } from "@/app/api/workbook/size/route";

/**
 * Shapes shared by the browser and the server for saved shows. Plain data only;
 * nothing here touches the database, so the workbook screen can import it.
 */

export interface SavedOverride {
  size: string;
  reason: string;
}

/** One class as stored: the upload as it was, and the class as it stands now. */
export interface SavedClassPayload {
  sheetName: string;
  className: string;
  position: number;
  /** The class exactly as uploaded. Never changes once the show is created. */
  original: ClassSheet;
  state: {
    dancers: ImportedDancer[];
    /** The workbook screen's costume groups and pieces, including looked-up costume data. */
    groups: unknown;
    alternateRows: number[];
  };
  results: ClassSizeResult | null;
  /** Current overrides keyed `${rowNumber}|${styleNumber}`. */
  overrides: Record<string, SavedOverride>;
}

export interface OverrideEventInput {
  sheetName: string;
  rowNumber: number;
  dancerName: string;
  styleNumber: string;
  recommendedSize: string;
  /** null when an override was removed. */
  toSize: string | null;
  reason: string | null;
}

export interface SavedShow {
  id: string;
  name: string;
  sourceFileName: string;
  sourceFileKind: "xlsx" | "csv" | "pdf";
  classes: SavedClassPayload[];
}

export interface ShowSummary {
  id: string;
  name: string;
  sourceFileName: string;
  classCount: number;
  sizedCount: number;
  createdBy: string;
  updatedAt: string;
}

export interface HistoryEvent {
  dancerName: string;
  styleNumber: string;
  recommendedSize: string;
  toSize: string | null;
  reason: string | null;
  by: string;
  at: string;
}

export interface DancerChange {
  name: string;
  kind: "added" | "edited";
  /** e.g. `Girth: blank → 42` */
  changes: string[];
}

export interface ClassHistory {
  events: HistoryEvent[];
  dancerChanges: DancerChange[];
  updatedBy: string | null;
  updatedAt: string | null;
}

export const MEASURE_NAMES: Record<MeasureField, string> = {
  girth: "Girth",
  bust: "Chest",
  waist: "Waist",
  hips: "Hips",
  inseam: "Inseam",
  height: "Height",
};
