import type { HeaderGuess } from "@/lib/import/headers";
import type { ImportedDancer, Unit } from "@/lib/import/parse";
import type { ScrapedCostume } from "@/lib/vendors/types";
import type { ChartResolution } from "@/lib/charts/resolve";
import type { ExportAssignment } from "@/lib/export/orderSheet";
import type { SkippedDancer } from "@/lib/sizing/run";
import type { SizeRow } from "@/lib/sizing/types";

export interface SheetData {
  name: string;
  rows: unknown[][];
  headerRow: number;
  headers: string[];
  mapping: HeaderGuess[];
  dancers: ImportedDancer[];
  detectedUnit: Unit;
  skippedRows: number;
}

export interface RosterResponse {
  fileName: string;
  sheets: SheetData[];
  selectedSheet: number;
}

export interface ChartInfo {
  id: string;
  label: string;
  companySlug: string;
  variant: string;
  status: "draft" | "confirmed";
  sizeCodes: string[];
  rowCount: number;
  notes: string[];
}

export interface CostumeResponse {
  costume: ScrapedCostume;
  resolution: ChartResolution;
  companySlug?: string;
  /** Where the costume came from, shown so the user knows if it was cached. */
  source?: "catalog" | "scraped" | "manual";
}

export interface UsedChart {
  id: string;
  label: string;
  variant: string;
  sourceImageUrl: string | null;
  notes: string[];
  rows: SizeRow[];
}

export interface SizeResponse {
  assignments: ExportAssignment[];
  skipped: SkippedDancer[];
  chart: UsedChart;
}

export const COMPANIES = [
  { slug: "revolution", name: "Revolution", scrapable: true },
  { slug: "weissman", name: "Weissman", scrapable: true },
  { slug: "awishcometrue", name: "A Wish Come True", scrapable: true },
  { slug: "laylas", name: "Layla's", scrapable: true },
] as const;
