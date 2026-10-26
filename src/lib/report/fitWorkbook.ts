import ExcelJS from "exceljs";
import { formatRange } from "../sizing/range";
import {
  MEASURE_LABELS,
  REPORT_MEASURES,
  type CellStatus,
  type FitReport,
} from "./fitReport";

/**
 * The fit report as a workbook: a summary tab, then one tab per class showing
 * each dancer's measurements against the chart row for their size, colour-coded,
 * with the chart rows themselves underneath for checking.
 */

const FILL: Record<CellStatus, string | null> = {
  fits: "FFE2F0D9", // green
  "slightly-over": "FFFFF2CC", // pale amber
  "slightly-under": "FFFFF2CC",
  over: "FFF8CBAD", // red-orange
  under: "FFDDEBF7", // blue
  garment: null,
  "not-on-chart": null,
  "not-measured": "FFF2F2F2",
};

const HEADER_FILL = "FF1F3864";
const NOT_SIZED_FILL = "FFFCE4D6";

const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD0D0D0" } },
  bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
  left: { style: "thin", color: { argb: "FFD0D0D0" } },
  right: { style: "thin", color: { argb: "FFD0D0D0" } },
};

export async function buildFitWorkbook(reports: FitReport[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  addSummary(wb, reports);
  const used = new Set<string>(["summary"]);
  for (const report of reports) addClassSheet(wb, report, sheetName(report, used));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function headerRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = solid(HEADER_FILL);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thin;
  });
}

function addSummary(wb: ExcelJS.Workbook, reports: FitReport[]) {
  const ws = wb.addWorksheet("Summary");
  ws.addRow(["Fit report — every measurement against the size chart"]).font = { bold: true, size: 14 };
  ws.addRow([]);
  headerRow(ws.addRow(["Class", "Tab", "Costume", "Sized", "All lined up", "To check", "Not sized"]));
  for (const r of reports) {
    const row = ws.addRow([
      r.className,
      r.sheetName ?? "",
      r.charts.map((c) => `${c.styleNumber}${c.costumeName ? ` ${c.costumeName}` : ""}`).join(" / "),
      r.summary.sized,
      r.summary.clean,
      r.summary.withAlerts,
      r.summary.notSized,
    ]);
    row.eachCell((c) => (c.border = thin));
    if (r.summary.withAlerts > 0) row.getCell(6).fill = solid(FILL["slightly-over"]!);
    if (r.summary.notSized > 0) row.getCell(7).fill = solid(NOT_SIZED_FILL);
  }
  ws.columns = [{ width: 48 }, { width: 26 }, { width: 40 }, { width: 8 }, { width: 13 }, { width: 10 }, { width: 10 }];
  addLegend(ws, ws.rowCount + 2);
}

function addLegend(ws: ExcelJS.Worksheet, at: number) {
  const items: [string, string | null][] = [
    ["✓ inside the chart range for the size ordered", FILL.fits],
    ["▲/▼ outside by 2\" or less — a seam's worth, alterable", FILL["slightly-over"]],
    ["▲ over by more than 2\" (or girth over) — needs attention", FILL.over],
    ["▼ under by more than 2\" — costume will be roomy / long", FILL.under],
    ["— not measured", FILL["not-measured"]],
    ["Girth decides the size. Other measurements never change it.", null],
  ];
  ws.getCell(at, 1).value = "Key";
  ws.getCell(at, 1).font = { bold: true };
  items.forEach(([text, fill], i) => {
    const cell = ws.getCell(at + 1 + i, 1);
    cell.value = text;
    if (fill) cell.fill = solid(fill);
  });
}

function addClassSheet(wb: ExcelJS.Workbook, report: FitReport, name: string) {
  const ws = wb.addWorksheet(name);
  ws.addRow([report.className]).font = { bold: true, size: 14 };
  if (report.teacher) ws.addRow(["Teacher", report.teacher]);
  for (const c of report.charts) {
    ws.addRow([
      "Costume",
      `${c.styleNumber}${c.costumeName ? ` ${c.costumeName}` : ""} — sized on ${c.label}`,
    ]);
  }
  ws.addRow([
    "Result",
    `${report.summary.sized} sized · ${report.summary.clean} all lined up · ${report.summary.withAlerts} to check · ${report.summary.notSized} not sized`,
  ]);
  ws.addRow([]);

  const multiStyle = report.charts.length > 1;
  const head = [
    "Sheet row",
    "Dancer",
    ...(multiStyle ? ["Costume"] : []),
    "Size",
    ...REPORT_MEASURES.map((m) => (m === "girth" ? "Girth ★" : MEASURE_LABELS[m])),
    "What to check",
  ];
  headerRow(ws.addRow(head));
  const firstMeasureCol = multiStyle ? 5 : 4;

  for (const r of report.rows) {
    const row = ws.addRow([
      r.rowNumber,
      r.name,
      ...(multiStyle ? [r.styleNumber ?? ""] : []),
      r.notSized ? "not sized" : r.recommendedSize !== r.size ? `${r.size} (was ${r.recommendedSize})` : r.size,
      ...r.cells.map((c) => (c.range ? `${c.text}   (${formatRange(c.range)})` : c.text)),
      r.alerts.join("\n"),
    ]);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = thin;
      cell.alignment = { vertical: "top", wrapText: true };
    });
    row.getCell(firstMeasureCol - 1).font = { bold: true };
    if (r.notSized) {
      row.eachCell({ includeEmpty: true }, (cell) => (cell.fill = solid(NOT_SIZED_FILL)));
      continue;
    }
    r.cells.forEach((c, i) => {
      const fill = FILL[c.status];
      const cell = row.getCell(firstMeasureCol + i);
      if (fill) cell.fill = solid(fill);
      cell.note = c.note;
      cell.alignment = { vertical: "top", horizontal: "center", wrapText: true };
      if (c.measure === "girth") cell.font = { bold: true };
    });
    if (r.alerts.length > 0) row.getCell(head.length).font = { color: { argb: "FF9C2A00" } };
  }

  ws.columns = [
    { width: 9 },
    { width: 22 },
    ...(multiStyle ? [{ width: 10 }] : []),
    { width: 12 },
    ...REPORT_MEASURES.map(() => ({ width: 16 })),
    { width: 70 },
  ];
  ws.views = [{ state: "frozen", ySplit: ws.rowCount - report.rows.length, xSplit: 2 }];

  // The chart rows this class was sized against, so every range above can be
  // checked against the vendor's own numbers.
  for (const chart of report.charts) {
    const usedSizes = new Set(
      report.rows.filter((r) => r.styleNumber === chart.styleNumber && r.size).map((r) => r.size!.toUpperCase()),
    );
    ws.addRow([]);
    ws.addRow([`Size chart: ${chart.label} (${chart.styleNumber})`]).font = { bold: true };
    headerRow(ws.addRow(["", "Size", ...REPORT_MEASURES.map((m) => MEASURE_LABELS[m]), "Dancers in this size"]));
    for (const sr of chart.rows) {
      const count = report.rows.filter(
        (r) => r.styleNumber === chart.styleNumber && r.size?.toUpperCase() === sr.code.toUpperCase(),
      ).length;
      const row = ws.addRow([
        "",
        sr.code,
        ...REPORT_MEASURES.map((m) => (sr[m] ? formatRange(sr[m]!) : "")),
        count || "",
      ]);
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col > 1) cell.border = thin;
      });
      if (usedSizes.has(sr.code.toUpperCase())) row.font = { bold: true };
    }
  }
}

/** Excel tab names: 31 characters, no []:*?/\ and unique. */
function sheetName(report: FitReport, used: Set<string>): string {
  const base = (report.sheetName || report.className).replace(/[[\]:*?/\\]/g, " ").slice(0, 31).trim() || "Class";
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}
