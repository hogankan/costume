import { describe, expect, it } from "vitest";
import { hasBlockingIssue, validateExtractedChart } from "../validate";
import type { ExtractedChart } from "../schema";

const r = (min: number | null, max: number | null) => ({ min, max });

/** A clean chart shaped like Weissman's child-girls sizing, long variant included. */
function baseChart(): ExtractedChart {
  return {
    variant: "child-girls",
    unit: "in",
    primaryMeasurement: "girth",
    notes: [],
    rows: [
      { code: "SC", label: null, ordinal: 0, girth: r(41, 44), bust: r(24, 25), waist: r(22, 23), hips: r(25, 27), inseam: r(19, 22), height: null },
      { code: "IC", label: null, ordinal: 1, girth: r(44, 47), bust: r(26, 28), waist: r(24, 25), hips: r(27, 29), inseam: r(22, 25), height: null },
      { code: "ICL", label: null, ordinal: 2, girth: r(47, 50), bust: r(26, 28), waist: r(24, 25), hips: r(27, 29), inseam: r(25, 28), height: null },
      { code: "MC", label: null, ordinal: 3, girth: r(47, 51), bust: r(28, 31), waist: r(25, 27), hips: r(29, 32), inseam: r(22, 28), height: null },
    ],
  };
}

describe("validateExtractedChart", () => {
  it("passes a clean chart, including legitimate long-size overlap", () => {
    const issues = validateExtractedChart(baseChart());
    expect(issues).toEqual([]);
    expect(hasBlockingIssue(issues)).toBe(false);
  });

  it("rejects a chart with no rows", () => {
    const issues = validateExtractedChart({ ...baseChart(), rows: [] });
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  it("rejects a row with no girth, since girth decides the size", () => {
    const chart = baseChart();
    chart.rows[1].girth = r(null, null);
    const issues = validateExtractedChart(chart);
    expect(hasBlockingIssue(issues)).toBe(true);
    expect(issues.some((i) => i.field === "girth" && i.code === "IC")).toBe(true);
  });

  it("catches a backwards range", () => {
    const chart = baseChart();
    chart.rows[1].girth = r(47, 44);
    const issues = validateExtractedChart(chart);
    expect(issues.some((i) => i.severity === "error" && /backwards/.test(i.message))).toBe(true);
  });

  it("catches a duplicated size code", () => {
    const chart = baseChart();
    chart.rows[2].code = "IC";
    const issues = validateExtractedChart(chart);
    expect(issues.some((i) => i.severity === "error" && /appears 2 times/.test(i.message))).toBe(true);
  });

  it("flags a misplaced decimal point as implausible girth", () => {
    const chart = baseChart();
    chart.rows[0].girth = r(4.1, 4.4);
    const issues = validateExtractedChart(chart);
    expect(issues.some((i) => i.severity === "warning" && /plausible range/.test(i.message))).toBe(true);
  });

  it("catches a chart transcribed in the wrong direction", () => {
    const chart = baseChart();
    chart.rows = [...chart.rows].reverse().map((row, i) => ({ ...row, ordinal: i }));
    const issues = validateExtractedChart(chart);
    expect(
      issues.some((i) => i.severity === "error" && /wrong direction/.test(i.message)),
    ).toBe(true);
  });

  it("allows a single specialty size that sits out of girth order", () => {
    // Revolution prints PA (Petite Adult, girth 53-57) between XXLC (56-58) and
    // SA (55-58). One step backwards is a real chart, not a misreading.
    const chart = baseChart();
    chart.rows.splice(2, 0, {
      code: "PA",
      label: "Petite Adult",
      ordinal: 0,
      girth: r(40, 45),
      bust: r(31, 33),
      waist: null,
      hips: null,
      inseam: null,
      height: null,
    });
    chart.rows = chart.rows.map((row, i) => ({ ...row, ordinal: i }));

    const issues = validateExtractedChart(chart);
    expect(hasBlockingIssue(issues)).toBe(false);
    expect(issues.some((i) => i.severity === "warning" && /specialty size/.test(i.message))).toBe(
      true,
    );
  });

  it("notes a gap between printed sizes without treating it as an error", () => {
    const chart = baseChart();
    chart.rows[1].girth = r(44, 45); // leaves 45-47 unclaimed before ICL
    const issues = validateExtractedChart(chart);
    const gap = issues.find((i) => /gap/i.test(i.message));
    expect(gap?.severity).toBe("info");
    expect(hasBlockingIssue(issues)).toBe(false);
  });

  it("warns when a long variant was conflated with its base size", () => {
    const chart = baseChart();
    chart.rows[2].girth = r(44, 47); // ICL copied from IC
    const issues = validateExtractedChart(chart);
    expect(
      issues.some((i) => i.code === "ICL" && /conflated/.test(i.message)),
    ).toBe(true);
  });

  it("warns when ordinals are not a run from zero", () => {
    const chart = baseChart();
    chart.rows[3].ordinal = 9;
    const issues = validateExtractedChart(chart);
    expect(issues.some((i) => /Ordinals are/.test(i.message))).toBe(true);
  });
});
