import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  combineCharts,
  confirmedCharts,
  findChart,
  loadLibrary,
  toCandidate,
  toSizeChart,
  type StoredChart,
} from "../library";

/**
 * These write their own chart files into a temp directory rather than reading
 * the repository's `charts/`, so the suite does not depend on which real vendor
 * charts happen to have been extracted and confirmed.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "chart-library-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const r = (min: number | null, max: number | null) => ({ min, max });

function stored(over: Partial<StoredChart> = {}): StoredChart {
  return {
    companySlug: "revolution",
    variant: "child-and-adult",
    label: "Costume Sizing",
    sourceImageUrl: "https://cdn.example/costumechart.jpg",
    imageHash: "abc123",
    status: "confirmed",
    chart: {
      variant: "child-and-adult",
      unit: "in",
      primaryMeasurement: "girth",
      notes: ["XLC and XXLC are cut to fit a larger child, not a petite adult."],
      rows: [
        { code: "SC", label: "Small Child", ordinal: 0, girth: r(41, 44), bust: r(24, 25), waist: null, hips: null, inseam: null, height: null },
        { code: "IC", label: "Intermediate Child", ordinal: 1, girth: r(44, 47), bust: r(26, 28), waist: null, hips: null, inseam: null, height: null },
        { code: "ICL", label: "Intermediate Child Long", ordinal: 2, girth: r(47, 50), bust: r(26, 28), waist: null, hips: null, inseam: null, height: null },
      ],
    },
    ...over,
  };
}

function write(company: string, variant: string, chart: StoredChart) {
  mkdirSync(join(root, company), { recursive: true });
  writeFileSync(join(root, company, `${variant}.json`), JSON.stringify(chart, null, 2));
}

describe("chart library", () => {
  it("loads charts from disk, keyed by company and variant", () => {
    write("revolution", "child-and-adult", stored());
    const charts = loadLibrary(root);
    expect(charts).toHaveLength(1);
    expect(charts[0].id).toBe("revolution/child-and-adult");
  });

  it("exposes the size-code vocabulary and source image for resolution", () => {
    write("revolution", "child-and-adult", stored());
    const candidate = toCandidate(loadLibrary(root)[0]);
    // The long variant must be its own code, not folded into IC.
    expect(candidate.sizeCodes).toEqual(["SC", "IC", "ICL"]);
    expect(candidate.sourceImageUrl).toBe("https://cdn.example/costumechart.jpg");
  });

  it("converts a stored chart into matcher shape, ordered by ordinal", () => {
    write("revolution", "child-and-adult", stored());
    const chart = toSizeChart(loadLibrary(root)[0]);
    expect(chart.rows.map((row) => row.code)).toEqual(["SC", "IC", "ICL"]);
    expect(chart.rows[1].girth).toEqual({ min: 44, max: 47 });
    expect(chart.notes?.[0]).toMatch(/larger child/);
  });

  it("carries a chart's confirmation status through, so drafts stay unusable", () => {
    write("revolution", "child-and-adult", stored());
    write("revolution", "male-unisex", stored({ variant: "male-unisex", status: "draft" }));

    const all = loadLibrary(root);
    expect(all).toHaveLength(2);
    expect(confirmedCharts(all).map((c) => c.id)).toEqual(["revolution/child-and-adult"]);
  });

  it("finds a chart by id", () => {
    write("weissman", "child-girls", stored({ companySlug: "weissman", variant: "child-girls" }));
    expect(findChart(loadLibrary(root), "weissman/child-girls")?.companySlug).toBe("weissman");
    expect(findChart(loadLibrary(root), "nope/nope")).toBeUndefined();
  });

  it("returns an empty library rather than throwing when nothing is extracted yet", () => {
    expect(loadLibrary(root)).toEqual([]);
    expect(loadLibrary(join(root, "does-not-exist"))).toEqual([]);
  });

  it("skips a malformed chart file instead of failing the whole listing", () => {
    write("revolution", "child-and-adult", stored());
    mkdirSync(join(root, "broken"), { recursive: true });
    writeFileSync(join(root, "broken", "bad.json"), "{ not json");

    expect(loadLibrary(root).map((c) => c.id)).toEqual(["revolution/child-and-adult"]);
  });
});

describe("combineCharts", () => {
  const adult = (over: Partial<StoredChart> = {}) =>
    stored({
      variant: "adult",
      chart: {
        variant: "adult",
        unit: "in",
        primaryMeasurement: "girth",
        notes: [],
        rows: [
          { code: "SA", label: null, ordinal: 0, girth: r(54, 57), bust: null, waist: null, hips: null, inseam: null, height: null },
          { code: "MA", label: null, ordinal: 1, girth: r(57, 60), bust: null, waist: null, hips: null, inseam: null, height: null },
        ],
      },
      ...over,
    });

  it("pools the rows of a child and an adult chart, child first", () => {
    write("awish", "adult", adult());
    write("awish", "child", stored({ variant: "child" }));
    const lib = loadLibrary(root);
    const combined = combineCharts([findChart(lib, "awish/adult")!, findChart(lib, "awish/child")!]);
    expect(combined.rows.map((x) => x.code)).toEqual(["SC", "IC", "ICL", "SA", "MA"]);
    expect(combined.rows.map((x) => x.ordinal)).toEqual([0, 1, 2, 3, 4]);
    expect(combined.status).toBe("confirmed");
  });

  it("is only confirmed when every chart in it is", () => {
    write("awish", "adult", adult({ status: "draft" }));
    write("awish", "child", stored({ variant: "child" }));
    expect(combineCharts(loadLibrary(root)).status).toBe("draft");
  });

  it("refuses two charts that give the same size different measurements", () => {
    write("awish", "a", stored({ variant: "a" }));
    write("awish", "b", stored({ variant: "b" }));
    expect(() => combineCharts(loadLibrary(root))).toThrow(/appears on both/);
  });
});
