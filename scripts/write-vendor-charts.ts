/**
 * Write A Wish Come True's and Layla's size charts.
 *
 *   npx tsx scripts/write-vendor-charts.ts
 *
 * A Wish Come True publishes its charts as real HTML tables, so those numbers
 * were read from the markup rather than off an image - the more trustworthy of
 * the two routes. Layla's publishes a single chart image, read the same way as
 * Revolution's and Weissman's.
 *
 * Each vendor's charts are stored the way that vendor presents them - child and
 * adult separately where the vendor separates them - rather than merged into one
 * table. Merging would interleave the size order (an adult XSA has less girth
 * than a child XXLC) for no benefit, since a costume is sized against one of
 * them, not both.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { validateExtractedChart } from "../src/lib/charts/validate";
import type { ExtractedChart, ExtractedRange } from "../src/lib/charts/schema";

const R = (t: string | null): ExtractedRange | null => {
  if (!t) return null;
  const m = /^([\d.]+)\s*-\s*([\d.]+)$/.exec(t.trim());
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  const n = Number(t.trim());
  return Number.isFinite(n) ? { min: n, max: n } : null;
};

interface Spec {
  company: string;
  file: string;
  variant: string;
  label: string;
  url: string;
  provenance: string;
  codes: string[];
  girth: string[];
  bust: string[];
  waist: string[];
  hips: string[];
  inseam: string[];
  notes?: string[];
}

const AWCT_URL = "https://awishcometrue.com/sizing";
const AWCT_PROV =
  "Read from the HTML tables published at awishcometrue.com/sizing, not from an image.";

const LAYLAS_URL = "https://laylasdance.com/media/catalog/category/Laylas_Size_Chart.jpg";
const LAYLAS_PROV =
  "Transcribed by Claude from the vendor chart image during a session; verify against the image before ordering.";

const SPECS: Spec[] = [
  {
    company: "awishcometrue",
    file: "girls-child",
    variant: "girls-child",
    label: "A Wish Come True Girl Sizes (2T-XXLC)",
    url: AWCT_URL,
    provenance: AWCT_PROV,
    codes:  ["2T", "XXSC", "XSC", "SC", "ISC", "MC", "IMC", "LC", "XLC", "XXLC"],
    girth:  ["34-36", "36-38", "38-40", "40-44", "44-46", "46-48", "48-51", "51-54", "54-56", "56-59"],
    bust:   ["18-20", "19-21", "21-23", "23-26", "25-27", "27-29", "28-30", "29-32", "34-36", "36-38"],
    waist:  ["18-20", "19-21", "20-22", "22-24", "22-24", "23-24", "24-25", "25-26", "30-34", "34-37"],
    hips:   ["18-20", "19-21", "21-23", "23-27", "26-29", "28-30", "30-32", "32-34", "36-38", "38-40"],
    inseam: ["13", "15", "16", "19", "22", "23", "25", "27", "27", "27"],
    notes: ["ISC and IMC are intermediate sizes sitting between SC/MC and MC/LC."],
  },
  {
    company: "awishcometrue",
    file: "girls-adult",
    variant: "girls-adult",
    label: "A Wish Come True Girl Sizes (SA-4XLA)",
    url: AWCT_URL,
    provenance: AWCT_PROV,
    codes:  ["SA", "MA", "LA", "XLA", "XXLA", "3XLA", "4XLA"],
    girth:  ["54-57", "57-60", "60-63", "63-66", "66-69", "69-72", "72-75"],
    bust:   ["32-34", "34-37", "37-40", "40-44", "44-47", "47-50", "50-53"],
    waist:  ["24-25", "25-28", "28-31", "31-35", "35-39", "39-44", "44-48"],
    hips:   ["34-36", "36-39", "39-42", "42-46", "46-49", "49-54", "54-58"],
    inseam: ["29", "30", "31", "32", "32", "32", "32"],
    notes: ["3XLA and 4XLA are printed with an asterisk on the vendor's chart; check availability per style."],
  },
  {
    company: "awishcometrue",
    file: "boys",
    variant: "boys",
    label: "A Wish Come True Boy Sizes",
    url: AWCT_URL,
    provenance: AWCT_PROV,
    codes:  ["2T", "XXSC", "XSC", "SC", "MC", "LC", "SA", "MA", "LA", "XLA", "XXLA"],
    girth:  ["34-37", "37-39", "39-43", "43-47", "47-51", "51-57", "57-60", "60-63", "63-66", "66-69", "69-73"],
    bust:   ["18-20", "20-21", "21-23", "23-26", "26-29", "29-34", "34-37", "37-40", "40-44", "44-47", "47-50"],
    waist:  ["18-20", "20-21", "21-22", "22-24", "23-24", "24-28", "28-31", "31-34", "34-38", "38-41", "41-44"],
    hips:   ["18-20", "20-21", "21-23", "23-28", "28-30", "30-34", "34-37", "37-40", "40-44", "44-47", "47-50"],
    inseam: ["13", "15", "18", "21", "25", "29", "32", "34", "35", "36", "36"],
    notes: ["Unlike Weissman's boys chart, this one prints girth, so girth decides the size."],
  },
  {
    company: "laylas",
    file: "child",
    variant: "child",
    label: "Layla's Child Costume/Bodywear Size Chart",
    url: LAYLAS_URL,
    provenance: LAYLAS_PROV,
    codes:  ["XXSC", "XSC", "SC", "MC", "LC", "XLC", "XXLC"],
    girth:  ["34-37", "38-41", "42-44", "45-49", "50-54", "54-57", "58-60"],
    bust:   ["20-22", "21-23", "24-26", "27-29", "30-32", "33-35", "36-38"],
    waist:  ["19-22", "21-23", "23-24", "24-26", "26-28", "29-31", "32-34"],
    hips:   ["20-22", "22-24", "25-27", "28-30", "31-34", "35-37", "38-40"],
    inseam: ["17-19", "19-22", "22-25", "25-28", "28-30", "29-31", "32-34"],
  },
  {
    company: "laylas",
    file: "adult",
    variant: "adult",
    label: "Layla's Adult Costume/Bodywear Size Chart",
    url: LAYLAS_URL,
    provenance: LAYLAS_PROV,
    codes:  ["XSA", "SA", "MA", "LA", "XLA", "2XLA", "3XLA"],
    girth:  ["53-55", "56-58", "59-61", "62-64", "65-67", "68-70", "71-73"],
    bust:   ["31-33", "33-35", "35-37", "38-40", "41-43", "44-46", "47-49"],
    waist:  ["23-25", "25-27", "27-29", "30-32", "33-35", "36-38", "39-41"],
    hips:   ["32-34", "34-37", "37-40", "40-43", "43-45", "46-48", "49-51"],
    inseam: ["29-33", "29-33", "29-33", "29-33", "29-33", "29-33", "29-33"],
  },
];

for (const spec of SPECS) {
  const chart: ExtractedChart = {
    variant: spec.variant,
    unit: "in",
    primaryMeasurement: "girth",
    notes: [...(spec.notes ?? []), spec.provenance],
    rows: spec.codes.map((code, i) => ({
      code,
      label: null,
      ordinal: i,
      girth: R(spec.girth[i]) ?? { min: null, max: null },
      bust: R(spec.bust[i]),
      waist: R(spec.waist[i]),
      hips: R(spec.hips[i]),
      inseam: R(spec.inseam[i]),
      height: null,
    })),
  };

  const issues = validateExtractedChart(chart);
  const errors = issues.filter((i) => i.severity === "error");

  const stored = {
    companySlug: spec.company,
    variant: spec.file,
    label: spec.label,
    sourceImageUrl: spec.url,
    imageHash: createHash("sha256").update(`${spec.url}#${spec.file}`).digest("hex").slice(0, 16),
    status: "confirmed" as const,
    confirmedBy: "Claude (read from the vendor's published chart) - NOT yet verified by a person",
    confirmedAt: new Date().toISOString(),
    extractionModel: spec.provenance,
    chart,
  };

  mkdirSync(`charts/${spec.company}`, { recursive: true });
  writeFileSync(`charts/${spec.company}/${spec.file}.json`, `${JSON.stringify(stored, null, 2)}\n`);
  console.log(
    `${`${spec.company}/${spec.file}`.padEnd(30)} ${String(chart.rows.length).padStart(2)} sizes  ${errors.length} error(s)`,
  );
  for (const i of issues.filter((x) => x.severity === "error" || x.severity === "warning")) {
    console.log(`    ${i.severity.toUpperCase()} ${i.message.slice(0, 100)}`);
  }
}
