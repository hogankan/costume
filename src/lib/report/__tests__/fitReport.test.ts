import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildFitReport, type ReportChart } from "../fitReport";
import { buildFitWorkbook } from "../fitWorkbook";
import type { ExportAssignment } from "../../export/orderSheet";
import type { ImportedDancer } from "../../import/parse";

const chart: ReportChart = {
  styleNumber: "H745",
  costumeName: "Cozy",
  id: "test/girls",
  label: "Test girls chart",
  rows: [
    { code: "SC", ordinal: 0, girth: { min: 40, max: 44 }, bust: { min: 22, max: 24 }, waist: { min: 20, max: 22 }, inseam: { min: 18, max: 18 } },
    { code: "MC", ordinal: 1, girth: { min: 46, max: 48 }, bust: { min: 25, max: 27 }, waist: { min: 22, max: 24 }, inseam: { min: 20, max: 20 } },
  ],
};

const dancer = (rowNumber: number, name: string, m: Partial<ImportedDancer>): ImportedDancer => ({
  rowNumber,
  name,
  issues: [],
  ...m,
});

const assigned = (rowNumber: number, name: string, size: string): ExportAssignment => ({
  className: "Jazz",
  dancerName: name,
  rowNumber,
  companyName: "A Wish Come True",
  styleNumber: "H745",
  costumeName: "Cozy",
  recommendedSize: size,
  rawGirth: 0,
  matchedGirth: 0,
  rationale: "",
  flags: [],
});

describe("buildFitReport", () => {
  const report = buildFitReport({
    className: "Jazz",
    dancers: [
      dancer(2, "Ella", { girth: 42, bust: 23, waist: 21, inseam: 17 }),
      dancer(3, "Mia", { girth: 43, bust: 27, waist: 21 }),
      dancer(4, "Zoe", { girth: 47, bust: 26, waist: 25 }),
      dancer(5, "Ana", { notes: "Measurements not taken yet" }),
    ],
    assignments: [assigned(2, "Ella", "SC"), assigned(3, "Mia", "SC"), assigned(4, "Zoe", "MC")],
    skipped: [{ dancerName: "Ana", rowNumber: 5, reason: "No girth measurement on file." }],
    charts: [chart],
  });
  const row = (name: string) => report.rows.find((r) => r.name === name)!;
  const cell = (name: string, m: string) => row(name).cells.find((c) => c.measure === m)!;

  it("shows each measurement against the range for the size ordered", () => {
    expect(cell("Ella", "girth")).toMatchObject({ status: "fits", range: { min: 40, max: 44 } });
    expect(cell("Ella", "bust")).toMatchObject({ status: "fits", text: "23 ✓" });
    expect(row("Ella").alerts).toEqual([]);
  });

  it("treats a single printed number as the garment's cut, not a miss", () => {
    expect(cell("Ella", "inseam").status).toBe("garment");
  });

  it("alerts when a measurement is too far out to be a simple seam", () => {
    expect(cell("Mia", "bust")).toMatchObject({ status: "over", delta: 3, text: "27 ▲3" });
    expect(row("Mia").alerts.join()).toMatch(/Chest 27" is 3" over SC/);
  });

  it("marks a small miss but does not raise it as an alert", () => {
    expect(cell("Zoe", "waist")).toMatchObject({ status: "slightly-over", delta: 1, text: "25 ▲1" });
    expect(row("Zoe").alerts).toEqual([]);
  });

  it("lists dancers who could not be sized, with the reason", () => {
    expect(row("Ana")).toMatchObject({ notSized: "No girth measurement on file." });
  });

  it("checks an overridden dancer against the size actually ordered", () => {
    const overridden = buildFitReport({
      className: "Jazz",
      dancers: [dancer(2, "Ella", { girth: 42, bust: 23, waist: 21 })],
      assignments: [assigned(2, "Ella", "SC")],
      skipped: [],
      charts: [chart],
      overrides: { 2: { size: "MC", reason: "growing" } },
    });
    const r = overridden.rows[0];
    expect(r.size).toBe("MC");
    expect(r.cells[0]).toMatchObject({ measure: "girth", status: "under", delta: 4 });
    expect(r.alerts.join()).toMatch(/Ordered MC instead of the recommended SC - growing/);
  });

  it("counts the class", () => {
    expect(report.summary).toEqual({ sized: 3, clean: 2, withAlerts: 1, notSized: 1 });
  });

  it("writes a summary tab and a tab per class", async () => {
    const book = XLSX.read(await buildFitWorkbook([{ ...report, sheetName: "Jazz - Ms K" }]));
    expect(book.SheetNames).toEqual(["Summary", "Jazz - Ms K"]);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets["Jazz - Ms K"], { header: 1 });
    const mia = rows.find((r) => r[1] === "Mia")!;
    expect(mia).toContain("27 ▲3   (22-24\")");
  });
});

describe("fitReportHtml", () => {
  it("prints one page per class and escapes what came from the sheet", async () => {
    const { fitReportHtml } = await import("../fitHtml");
    const report = buildFitReport({
      className: "Jazz <Seniors>",
      dancers: [dancer(2, "Ella", { girth: 42, bust: 23 })],
      assignments: [assigned(2, "Ella", "SC")],
      skipped: [],
      charts: [chart],
    });
    const html = fitReportHtml([report, { ...report, className: "Tap" }], "Holiday");
    expect(html.match(/<section>/g)).toHaveLength(2);
    expect(html).toContain("Jazz &lt;Seniors&gt;");
    expect(html).toContain("print-color-adjust: exact");
    expect(html).toContain("40-44&quot;");
  });
});
