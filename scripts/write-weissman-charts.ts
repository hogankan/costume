/**
 * Write Weissman's six size charts, transcribed from the vendor's own chart
 * images.
 *
 *   npx tsx scripts/write-weissman-charts.ts
 *
 * Kept as a script rather than hand-edited JSON so the transcription is
 * reviewable as a table, close to how the chart itself reads.
 *
 * Two of these charts - BOYS and MENS - print no girth column at all. Those
 * costumes are two-piece, so there is no shoulder-to-crotch dimension to
 * constrain, and they are sized on chest instead. That is declared explicitly
 * per chart rather than inferred, so a chart that merely lost its girth column
 * in transcription still fails loudly.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { validateExtractedChart } from "../src/lib/charts/validate";
import type { ExtractedChart, ExtractedRange } from "../src/lib/charts/schema";

const CDN = "https://d2mf5zk7fvq4ou.cloudfront.net/images/size-charts";

const R = (t: string): ExtractedRange | null => {
  if (!t) return null;
  const m = /^([\d.]+)\s*-\s*([\d.]+)$/.exec(t);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  return { min: Number(t), max: Number(t) };
};

interface Spec {
  file: string;
  variant: string;
  label: string;
  url: string;
  primary: "girth" | "bust";
  codes: string[];
  labels: (string | null)[];
  bust: string[];
  waist: string[];
  hips: string[];
  girth?: string[];
  inseam: string[];
  notes?: string[];
}

const SPECS: Spec[] = [
  {
    file: "girls",
    variant: "girls",
    label: "Weissman Girls Size Chart (inches)",
    url: `${CDN}/child/inches/wts-size-chart-girls-in.jpg`,
    primary: "girth",
    codes: ["T", "XXSC", "XSC", "SC", "IC", "ICL", "MC", "MCL", "LC", "XLC", "XXLC"],
    labels: ["2T", "3T", "4/5", "6/6X", "7/8", "7/8 Long", "10/12", "10/12 Long", "14", "16/18", "20"],
    bust:   ["20-21", "21-22", "22-24", "24-26", "26-28", "26-28", "28-31", "28-31", "31-33", "33-37", "37-39"],
    waist:  ["20-21", "21-22", "22-23", "23-24", "24-25", "24-25", "25-27.5", "25-27.5", "27.5-29.5", "29.5-33", "33-35"],
    hips:   ["20.5-21.5", "21.5-22.5", "22.5-25", "25-27", "27-30", "27-30", "30-33.5", "30-33.5", "33.5-35.5", "35.5-39", "39-41"],
    girth:  ["33-35", "35-37", "37-41", "41-44", "44-47", "47-52", "47-52", "52-54.5", "52-54.5", "54.5-57", "57-58.5"],
    inseam: ["13-14.5", "14.5-16", "16-19.5", "19.5-22.5", "22.5-25", "25-28", "25-28", "28-29.5", "28-29.5", "29.5-30.5", "29.5-30.5"],
    notes: [
      "ICL and MC share the same girth (47-52\"); ICL carries IC's bust and waist with MC's length. The same holds for MCL and LC.",
    ],
  },
  {
    file: "boys",
    variant: "boys",
    label: "Weissman Boys Size Chart (inches)",
    url: `${CDN}/child/inches/wts-size-chart-boys-in.jpg`,
    primary: "bust",
    codes: ["T", "XXSC", "XSC", "SC", "IC", "MC", "LC", "XLC", "XXLC"],
    labels: [null, null, null, null, null, null, null, null, null],
    bust:   ["20-21", "21-22", "22-24", "24-26", "26-27.5", "27.5-29.5", "29.5-31.5", "31.5-34.5", "34.5-36"],
    waist:  ["20-21", "21-22", "22-23", "23-24", "24-25", "25-27.5", "27.5-29", "29-32", "32-33.5"],
    hips:   ["20.5-21.5", "21.5-22.5", "22.5-25", "25-27", "27-28.5", "28.5-31.5", "31.5-33", "33-36", "36-37.5"],
    inseam: ["13-14.5", "14.5-16", "16-19.5", "19.5-22.5", "22.5-25", "25-28.5", "28.5-30.5", "30.5-32", "30.5-32"],
    notes: [
      "This chart prints no girth column - boys costumes are two-piece - so chest decides the size.",
    ],
  },
  {
    file: "child-unisex",
    variant: "child-unisex",
    label: "Weissman Child Unisex Size Chart (inches)",
    url: `${CDN}/child/inches/wts-size-chart-child-unisex-in.jpg`,
    primary: "girth",
    codes: ["T", "XXSC", "XSC", "SC", "IC", "MC", "LC", "XLC", "XXLC"],
    labels: [null, null, null, null, null, null, null, null, null],
    bust:   ["20-21", "21-22", "22-24", "24-26", "26-28", "28-31", "31-33", "33-37", "37-39"],
    waist:  ["20-21", "21-22", "22-23", "23-24", "24-25", "25-27.5", "27.5-29.5", "29.5-33", "33-35"],
    hips:   ["20.5-21.5", "21.5-22.5", "22.5-25", "25-27", "27-30", "30-33.5", "33.5-35.5", "35.5-39", "39-41"],
    girth:  ["33-35", "35-37", "37-41", "41-44", "44-47", "47-52", "52-54.5", "54.5-57", "57-58.5"],
    inseam: ["13-14.5", "14.5-16", "16-19.5", "19.5-22.5", "22.5-25", "25-28", "28-29.5", "29.5-30.5", "29.5-30.5"],
  },
  {
    file: "womens",
    variant: "womens",
    label: "Weissman Womens Size Chart (inches)",
    url: `${CDN}/adult/inches/wts-size-chart-womens-in.jpg`,
    primary: "girth",
    // The chart prints the first column as "XSA/PA". Stored as XSA; a product
    // listing PA would not resolve until a Weissman product page confirms which
    // code they actually use.
    codes: ["XSA", "XSAL", "SA", "SAL", "MA", "LA", "XLA", "XXLA", "XXXLA"],
    labels: ["0/2 (printed XSA/PA)", "0/2 Long", "4/6", "4/6 Long", "8/10", "12/14", "16/18", "20", "22/24"],
    bust:   ["32-34", "32-34", "34-36", "34-36", "36-39", "39-42", "42-45", "45-48", "48-52"],
    waist:  ["24-26", "24-26", "26-28", "26-28", "28-31", "31-34", "34-38", "38-43", "43-47.5"],
    hips:   ["33-35", "33-35", "35-37", "35-37", "37-40", "40-44", "44-48", "48-52", "52-56"],
    girth:  ["55.5-57.5", "57.5-60", "57.5-60", "60-62", "60-62", "62-63", "63-65", "65-68", "68-71"],
    inseam: ["29-33", "32-35", "29-33", "32-35", "29-33", "29-33", "29-33", "29-33", "29-33"],
    notes: [
      "The first column is printed as \"XSA/PA\" and is stored here as XSA. If a costume lists PA, confirm which code Weissman uses on the product page.",
    ],
  },
  {
    file: "mens",
    variant: "mens",
    label: "Weissman Mens Size Chart (inches)",
    url: `${CDN}/adult/inches/wts-size-chart-mens-in.jpg`,
    primary: "bust",
    codes: ["XSA", "SA", "MA", "LA", "XLA", "XXLA"],
    labels: [null, null, null, null, null, null],
    bust:   ["32.5-34.5", "34.5-36.5", "36.5-38.5", "38.5-40.5", "40.5-43", "43-45"],
    waist:  ["29-31", "31-33", "33-35", "35-37", "37-39.5", "39.5-41.5"],
    hips:   ["34-36", "36-38", "38-40", "40-42", "42-44", "44-45"],
    inseam: ["30-33", "30-33", "30-33", "30-33", "30-33", "30-33"],
    notes: [
      "This chart prints no girth column - mens costumes are two-piece - so chest decides the size.",
    ],
  },
  {
    file: "adult-unisex",
    variant: "adult-unisex",
    label: "Weissman Adult Unisex Size Chart (inches)",
    url: `${CDN}/adult/inches/wts-size-chart-adult-unisex-in.jpg`,
    primary: "girth",
    codes: ["XSA", "SA", "MA", "LA", "XLA", "XXLA", "XXXLA"],
    labels: ["printed XSA/PA", null, null, null, null, null, null],
    bust:   ["32-34", "34-36", "36-39", "39-42", "42-45", "45-48", "48-52"],
    waist:  ["24-26", "26-28", "28-31", "31-34", "34-38", "38-43", "43-47.5"],
    hips:   ["33-35", "35-37", "37-40", "40-44", "44-48", "48-52", "52-56"],
    girth:  ["55.5-57.5", "57.5-60", "60-62", "62-63", "63-65", "65-68", "68-71"],
    inseam: ["29-33", "29-33", "29-33", "29-33", "29-33", "29-33", "29-33"],
  },
];

const PROVENANCE =
  "Transcribed by Claude from the vendor chart image during a session; verify against the image before ordering.";

mkdirSync("charts/weissman", { recursive: true });

for (const spec of SPECS) {
  const chart: ExtractedChart = {
    variant: spec.variant,
    unit: "in",
    primaryMeasurement: spec.primary,
    notes: [...(spec.notes ?? []), PROVENANCE],
    rows: spec.codes.map((code, i) => ({
      code,
      label: spec.labels[i],
      ordinal: i,
      girth: spec.girth ? (R(spec.girth[i]) ?? { min: null, max: null }) : { min: null, max: null },
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
    companySlug: "weissman",
    variant: spec.file,
    label: spec.label,
    sourceImageUrl: spec.url,
    imageHash: createHash("sha256").update(spec.url).digest("hex").slice(0, 16),
    status: "confirmed" as const,
    confirmedBy: "Claude (read from the vendor chart image) - NOT yet verified by a person",
    confirmedAt: new Date().toISOString(),
    extractionModel: "read from the chart image in-session, not via the API",
    chart,
  };

  writeFileSync(`charts/weissman/${spec.file}.json`, `${JSON.stringify(stored, null, 2)}\n`);
  console.log(
    `${spec.file.padEnd(14)} ${String(chart.rows.length).padStart(2)} sizes  primary=${spec.primary.padEnd(5)}  ${errors.length} error(s)`,
  );
  for (const i of issues.filter((x) => x.severity !== "info")) {
    console.log(`    ${i.severity.toUpperCase()} ${i.message.slice(0, 105)}`);
  }
}
