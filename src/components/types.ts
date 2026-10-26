import type { ClassSheet } from "@/lib/import/workbook";

export interface RosterResponse {
  fileName: string;
  fileKind: "xlsx" | "csv" | "pdf";
  /** Every tab read as a class, with the costume written on it. */
  classes: ClassSheet[];
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

export const COMPANIES = [
  { slug: "revolution", name: "Revolution" },
  { slug: "weissman", name: "Weissman" },
  { slug: "awishcometrue", name: "A Wish Come True" },
  { slug: "laylas", name: "Layla's" },
] as const;
