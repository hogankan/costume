import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildFitReport, fitsSize, reportOverrideKey, type ReportChart } from "../fitReport";
import { buildFitWorkbook } from "../fitWorkbook";
import { fitReportHtml } from "../fitHtml";
import type { ExportAssignment } from "../../export/orderSheet";
import type { ImportedDancer } from "../../import/parse";

const chart: ReportChart = {
  styleNumber: "H745",
  costumeName: "Cozy",
  id: "test/girls",
  label: "Test girls chart",
  rows: [
    { code: "SC", ordinal: 0, girth: { min: 40, max: 44 }, bust: { min: 22, max: 24 }, waist: { min: 20, max: 22 }, inseam: { min: 19, max: 19 } },
    { code: "MC", ordinal: 1, girth: { min: 46, max: 48 }, bust: { min: 25, max: 27 }, waist: { min: 22, max: 24 }, inseam: { min: 23, max: 23 } },
  ],
};

const pants: ReportChart = {
  styleNumber: "13182",
  costumeName: "Pants",
  id: "test/boys",
  label: "Test boys chart",
  rows: [
    { code: "SC", ordinal: 0, girth: { min: 40, max: 45 }, waist: { min: 20, max: 23 } },
    { code: "MC", ordinal: 1, girth: { min: 45, max: 50 }, waist: { min: 23, max: 25 } },
  ],
};

const dancer = (rowNumber: number, name: string, m: Partial<ImportedDancer>): ImportedDancer => ({
  rowNumber,
  name,
  issues: [],
  ...m,
});

const assigned = (
  rowNumber: number,
  name: string,
  size: string,
  styleNumber = "H745",
): ExportAssignment => ({
  className: "Jazz",
  dancerName: name,
  rowNumber,
  companyName: "A Wish Come True",
  styleNumber,
  costumeName: styleNumber === "H745" ? "Cozy" : "Pants",
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
    expect(cell("Ella", "girth")).toMatchObject({ status: "fits", tone: "green", range: { min: 40, max: 44 } });
    expect(cell("Ella", "bust")).toMatchObject({ status: "fits", tone: "green", text: "23 ✓" });
    expect(row("Ella").alerts).toEqual([]);
  });

  it("writes the size each measurement fits on its own", () => {
    expect(cell("Ella", "bust").fitsSize).toBe("SC");
    expect(cell("Mia", "bust").fitsSize).toBe("MC");
    // 22 is on both the SC and MC waist ranges.
    expect(fitsSize("waist", 22, chart.rows)).toBe("SC/MC");
    expect(fitsSize("girth", 38, chart.rows)).toBe("below SC");
    expect(fitsSize("girth", 50, chart.rows)).toBe("above MC");
    expect(fitsSize("girth", 45, chart.rows)).toBe("between SC and MC");
  });

  it("alerts when a measurement is too far out to be a simple seam", () => {
    expect(cell("Mia", "bust")).toMatchObject({ status: "over", tone: "red", delta: 3, text: "27 ▲3" });
    expect(row("Mia").alerts.join()).toMatch(/Chest 27" is 3" over SC/);
  });

  it("marks a small miss yellow but does not raise it as an alert", () => {
    expect(cell("Zoe", "waist")).toMatchObject({ status: "slightly-over", tone: "yellow", delta: 1 });
    expect(row("Zoe").alerts).toEqual([]);
  });

  it("lists dancers who could not be sized, with the reason", () => {
    expect(row("Ana")).toMatchObject({ notSized: "No girth measurement on file." });
  });

  it("counts dancers", () => {
    expect(report.summary).toEqual({ sized: 3, clean: 2, withAlerts: 1, notSized: 1 });
  });
});

describe("inseam against the garment's leg length", () => {
  // The SC leg is cut to 19".
  const inseamRow = (inseam: number) =>
    buildFitReport({
      className: "Jazz",
      dancers: [dancer(2, "Ella", { girth: 42, inseam })],
      assignments: [assigned(2, "Ella", "SC")],
      skipped: [],
      charts: [chart],
    }).rows[0];

  it.each([
    [20, "red", true, /too short/],
    [19, "yellow", false, /no room to grow/],
    [18, "green", false, /room to grow/],
    [15.5, "green", false, /room to grow/],
    [15, "red", true, /too long/],
  ])("inseam %s is %s", (inseam, tone, alerted, note) => {
    const r = inseamRow(inseam);
    const c = r.cells.find((x) => x.measure === "inseam")!;
    expect(c.tone).toBe(tone);
    expect(c.note).toMatch(note);
    expect(r.alerts.some((a) => /Inseam/.test(a))).toBe(alerted);
  });

  it("suggests the smallest size whose leg leaves room to grow", () => {
    expect(fitsSize("inseam", 17, chart.rows)).toBe("SC");
    // MC's 23" leg would be 4" too long, so the exact SC is the fit.
    expect(fitsSize("inseam", 19, chart.rows)).toBe("SC");
    expect(fitsSize("inseam", 20, chart.rows)).toBe("MC");
    expect(fitsSize("inseam", 23, chart.rows)).toBe("MC");
    expect(fitsSize("inseam", 24, chart.rows)).toBe("none");
  });
});

describe("several costume pieces", () => {
  const report = buildFitReport({
    className: "Santa Train",
    dancers: [dancer(2, "Theo", { girth: 44, waist: 24, source: "added" })],
    assignments: [assigned(2, "Theo", "SC"), assigned(2, "Theo", "SC", "13182")],
    skipped: [],
    charts: [chart, pants],
    overrides: { [reportOverrideKey(2, "13182")]: { size: "MC", reason: "longer legs" } },
  });

  it("gives a dancer one row per piece, each against its own chart", () => {
    expect(report.rows.map((r) => [r.styleNumber, r.size])).toEqual([
      ["H745", "SC"],
      ["13182", "MC"],
    ]);
    expect(report.rows[0].cells.find((c) => c.measure === "waist")?.range).toEqual({ min: 20, max: 22 });
    expect(report.rows[1].cells.find((c) => c.measure === "waist")?.range).toEqual({ min: 23, max: 25 });
  });

  it("applies an override to one piece only", () => {
    expect(report.rows[0].alerts.join()).not.toMatch(/Ordered/);
    expect(report.rows[1].alerts.join()).toMatch(/Ordered MC instead of the recommended SC - longer legs/);
  });

  it("counts the dancer once and keeps the added-in-app tag", () => {
    expect(report.summary.sized).toBe(1);
    expect(report.rows.every((r) => r.source === "added")).toBe(true);
  });
});

describe("report downloads", () => {
  const report = buildFitReport({
    className: "Jazz <Seniors>",
    sheetName: "Jazz - Ms K",
    dancers: [
      dancer(2, "Ella", { girth: 42, bust: 23 }),
      dancer(3, "Mia", { girth: 43, bust: 27 }),
    ],
    assignments: [assigned(2, "Ella", "SC"), assigned(3, "Mia", "SC")],
    skipped: [],
    charts: [chart],
  });

  it("writes a summary tab and a tab per class, with the fits size in each box", async () => {
    const book = XLSX.read(await buildFitWorkbook([report]));
    expect(book.SheetNames).toEqual(["Summary", "Jazz - Ms K"]);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets["Jazz - Ms K"], { header: 1 });
    const mia = rows.find((r) => r[1] === "Mia")!;
    expect(mia).toContain('27 ▲3\nSC: 22-24"\nfits MC');
  });

  it("prints one page per class and escapes what came from the sheet", () => {
    const html = fitReportHtml([report, { ...report, className: "Tap" }], "Holiday");
    expect(html.match(/<section>/g)).toHaveLength(2);
    expect(html).toContain("Jazz &lt;Seniors&gt;");
    expect(html).toContain("print-color-adjust: exact");
    expect(html).toContain("fits MC");
  });
});
