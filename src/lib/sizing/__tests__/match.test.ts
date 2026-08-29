import { describe, expect, it } from "vitest";
import { matchSize, SizingError } from "../match";
import type { Flag, FlagCode, SizeChart } from "../types";
import {
  ALL_CHILD_SIZES,
  REGULAR_CHILD_SIZES,
  childGirlsChart,
  gappyChart,
  openEndedChart,
} from "./fixtures";

const codes = (flags: Flag[]): FlagCode[] => flags.map((f) => f.code);
const has = (flags: Flag[], code: FlagCode) => codes(flags).includes(code);

describe("girth is the binding constraint", () => {
  it("escalates to the larger size even when EVERY other measurement fits the smaller one", () => {
    // This dancer is a textbook SC on bust, waist, hips and inseam. Only her
    // girth pushes her into IC. A "closest overall fit" matcher would return SC
    // and hand her a costume she physically cannot get into.
    const result = matchSize(
      { girth: 44.5, bust: 24.5, waist: 22.5, hips: 26, inseam: 21 },
      childGirlsChart,
      REGULAR_CHILD_SIZES,
    );

    expect(result.size).toBe("IC");

    // ...and the measurements that "wanted" SC are reported, not silently dropped.
    const advisory = result.flags.filter((f) => f.code === "MEASUREMENT_OUT_OF_RANGE");
    expect(advisory.map((f) => f.measure).sort()).toEqual([
      "bust",
      "hips",
      "inseam",
      "waist",
    ]);
    expect(advisory.every((f) => f.direction === "under")).toBe(true);
  });

  it("never lets an out-of-range advisory measurement change the recommended size", () => {
    const slim = matchSize({ girth: 49, bust: 20, waist: 18, hips: 20 }, childGirlsChart, REGULAR_CHILD_SIZES);
    const broad = matchSize({ girth: 49, bust: 40, waist: 38, hips: 40 }, childGirlsChart, REGULAR_CHILD_SIZES);

    expect(slim.size).toBe("MC");
    expect(broad.size).toBe("MC");
  });

  it("rejects a dancer with no girth on file", () => {
    expect(() =>
      matchSize({ girth: Number.NaN, bust: 26 }, childGirlsChart, REGULAR_CHILD_SIZES),
    ).toThrow(SizingError);
  });
});

describe("rounding up", () => {
  it("rounds a gap between printed sizes up to the larger size", () => {
    const result = matchSize({ girth: 44 }, gappyChart, ["A", "B"]);
    expect(result.size).toBe("B");
    expect(has(result.flags, "PRIMARY_IN_GAP")).toBe(true);
  });

  it("rounds up when girth sits exactly on a boundary two sizes share", () => {
    // Weissman prints IC as 44-47 and MC as 47-51, so 47 belongs to both.
    const result = matchSize({ girth: 47 }, childGirlsChart, REGULAR_CHILD_SIZES);
    expect(result.size).toBe("MC");
    expect(has(result.flags, "PRIMARY_ON_BOUNDARY")).toBe(true);
  });

  it("honours chart-literal policy when the studio prefers the printed reading", () => {
    const result = matchSize({ girth: 47 }, childGirlsChart, REGULAR_CHILD_SIZES, {
      boundaryPolicy: "chart-literal",
    });
    expect(result.size).toBe("IC");
    expect(has(result.flags, "PRIMARY_ON_BOUNDARY")).toBe(true);
  });
});

describe("out-of-chart dancers", () => {
  it("flags girth above the largest orderable size as blocking", () => {
    const result = matchSize({ girth: 60 }, childGirlsChart, REGULAR_CHILD_SIZES);
    expect(result.size).toBe("LC");
    const flag = result.flags.find((f) => f.code === "PRIMARY_ABOVE_RANGE");
    expect(flag?.severity).toBe("blocking");
    expect(flag?.delta).toBe(5);
  });

  it("flags girth below the smallest orderable size", () => {
    const result = matchSize({ girth: 35 }, childGirlsChart, REGULAR_CHILD_SIZES);
    expect(result.size).toBe("XSC");
    expect(has(result.flags, "PRIMARY_BELOW_RANGE")).toBe(true);
  });

  it("treats an open-ended top row as unbounded rather than as zero", () => {
    const result = matchSize({ girth: 90 }, openEndedChart, ["SA", "MA"]);
    expect(result.size).toBe("MA");
    expect(has(result.flags, "PRIMARY_ABOVE_RANGE")).toBe(false);
    // An unbounded edge cannot be "borderline" - there is no edge to be near.
    expect(has(result.flags, "PRIMARY_BORDERLINE_HIGH")).toBe(false);
  });
});

describe("border detection", () => {
  it("flags a dancer exactly at the border threshold", () => {
    // IC runs 44-47; girth 46 is exactly 1.0" under the top, the default threshold.
    const result = matchSize({ girth: 46 }, childGirlsChart, REGULAR_CHILD_SIZES);
    expect(result.size).toBe("IC");
    const flag = result.flags.find((f) => f.code === "PRIMARY_BORDERLINE_HIGH");
    expect(flag?.delta).toBe(1);
  });

  it("does not flag a dancer comfortably inside a size", () => {
    const result = matchSize({ girth: 45.5 }, childGirlsChart, REGULAR_CHILD_SIZES);
    expect(has(result.flags, "PRIMARY_BORDERLINE_HIGH")).toBe(false);
    expect(has(result.flags, "PRIMARY_BORDERLINE_LOW")).toBe(false);
  });

  it("treats nearness to the BOTTOM of a size as information, not a warning", () => {
    // A roomy costume can be taken in; only nearness to the top is a real risk.
    // Keeping this off the exceptions list is what stops alarm fatigue.
    const result = matchSize({ girth: 44.5 }, childGirlsChart, REGULAR_CHILD_SIZES);
    const low = result.flags.find((f) => f.code === "PRIMARY_BORDERLINE_LOW");
    expect(low?.severity).toBe("info");
    expect(result.flags.filter((f) => f.severity === "warning")).toEqual([]);
  });

  it("does not add a redundant zero-distance flag on a shared boundary", () => {
    const result = matchSize({ girth: 47 }, childGirlsChart, REGULAR_CHILD_SIZES);
    expect(has(result.flags, "PRIMARY_ON_BOUNDARY")).toBe(true);
    expect(has(result.flags, "PRIMARY_BORDERLINE_LOW")).toBe(false);
  });

  it("respects a widened border threshold", () => {
    const result = matchSize({ girth: 45.5 }, childGirlsChart, REGULAR_CHILD_SIZES, {
      borderThreshold: 2,
    });
    expect(has(result.flags, "PRIMARY_BORDERLINE_HIGH")).toBe(true);
    expect(has(result.flags, "PRIMARY_BORDERLINE_LOW")).toBe(true);
  });
});

describe("long sizes", () => {
  it("puts a tall slim dancer in ICL rather than MC", () => {
    // Girth 48.5 fits both ICL (47-50) and MC (47-51). Her bust, waist and hips
    // are IC-shaped and her inseam is long, so ICL is the right garment.
    const result = matchSize(
      { girth: 48.5, bust: 27, waist: 24.5, hips: 28, inseam: 26 },
      childGirlsChart,
      ALL_CHILD_SIZES,
    );
    expect(result.size).toBe("ICL");
    expect(has(result.flags, "AMBIGUOUS_SIZE")).toBe(true);
    // The whole point of picking ICL: nothing ends up out of range.
    expect(has(result.flags, "MEASUREMENT_OUT_OF_RANGE")).toBe(false);
  });

  it("puts a broader dancer of the same girth in MC", () => {
    const result = matchSize(
      { girth: 48.5, bust: 30, waist: 26, hips: 31, inseam: 24 },
      childGirlsChart,
      ALL_CHILD_SIZES,
    );
    expect(result.size).toBe("MC");
  });
});

describe("orderable sizes", () => {
  it("treats an empty size list as the whole chart", () => {
    // Layla's keeps its per-costume size list behind a trade login. Refusing to
    // size at all would be worse than sizing against the full published range,
    // as long as the interface says the range was not confirmed.
    const result = matchSize({ girth: 45 }, childGirlsChart, []);
    expect(result.size).toBe("IC");
  });

  it("still restricts to a list when one is given", () => {
    const result = matchSize({ girth: 45 }, childGirlsChart, ["SC"]);
    expect(result.size).toBe("SC");
  });

  it("never recommends a size the costume does not offer", () => {
    // Girth 49 would be MC, but this costume stops at IC.
    const result = matchSize({ girth: 49 }, childGirlsChart, ["XSC", "SC", "IC"]);
    expect(result.size).toBe("IC");
    expect(has(result.flags, "PRIMARY_ABOVE_RANGE")).toBe(true);
  });

  it("matches size codes case- and whitespace-insensitively", () => {
    const result = matchSize({ girth: 45 }, childGirlsChart, [" ic ", "sc"]);
    expect(result.size).toBe("IC");
  });

  it("throws when the costume and the chart share no sizes", () => {
    expect(() => matchSize({ girth: 45 }, childGirlsChart, ["XXXL"])).toThrow(SizingError);
  });
});

describe("growth allowance", () => {
  it("is off by default", () => {
    const result = matchSize({ girth: 46 }, childGirlsChart, REGULAR_CHILD_SIZES);
    expect(result.size).toBe("IC");
    expect(result.matchedGirth).toBe(46);
    expect(has(result.flags, "GROWTH_ALLOWANCE_APPLIED")).toBe(false);
  });

  it("shifts the match up when opted into, and reports both girths", () => {
    const result = matchSize({ girth: 46 }, childGirlsChart, REGULAR_CHILD_SIZES, {
      girthGrowthAllowance: 1.5,
    });
    expect(result.size).toBe("MC");
    expect(result.rawGirth).toBe(46);
    expect(result.matchedGirth).toBe(47.5);
    expect(has(result.flags, "GROWTH_ALLOWANCE_APPLIED")).toBe(true);
    expect(result.rationale).toContain("46");
    expect(result.rationale).toContain("47.5");
  });
});

describe("how a garment spec reads", () => {
  it("keeps garment-spec notes out of the rationale sentence", () => {
    // They carry no direction or distance, and rendered as "inseam 23 undefined
    // by -Infinity" when the rationale tried to describe them as deviations.
    const chart: typeof childGirlsChart = {
      ...childGirlsChart,
      rows: childGirlsChart.rows.map((r) => ({ ...r, inseam: { min: 25, max: 25 } })),
    };
    const result = matchSize(
      { girth: 45, bust: 27, waist: 24.5, hips: 28, inseam: 21 },
      chart,
      REGULAR_CHILD_SIZES,
    );
    expect(result.rationale).not.toMatch(/undefined|Infinity|NaN/);
    expect(result.rationale).toContain("All other measurements are in range.");
  });
});

describe("advisory deviations and the exceptions list", () => {
  it("treats a small deviation as information, since it is a seam not a decision", () => {
    // Half an inch of waist can be taken in. Against real charts this kind of
    // flag outnumbered genuine girth risks 14 to 4 and buried them.
    const result = matchSize(
      { girth: 45, bust: 27, waist: 25.5, hips: 28 },
      childGirlsChart,
      REGULAR_CHILD_SIZES,
    );
    const waist = result.flags.find((f) => f.measure === "waist");
    expect(waist?.severity).toBe("info");
    expect(result.flags.filter((f) => f.severity === "warning")).toEqual([]);
  });

  it("raises a deviation big enough to need real alteration", () => {
    const result = matchSize(
      { girth: 45, bust: 33, waist: 24.5, hips: 28 },
      childGirlsChart,
      REGULAR_CHILD_SIZES,
    );
    const bust = result.flags.find((f) => f.measure === "bust");
    expect(bust?.severity).toBe("warning");
    expect(bust?.message).toMatch(/need altering/);
  });

  it("lets the studio set where that line sits", () => {
    const m = { girth: 45, bust: 30, waist: 24.5, hips: 28 };
    const lenient = matchSize(m, childGirlsChart, REGULAR_CHILD_SIZES, {
      alterationThreshold: 5,
    });
    const strict = matchSize(m, childGirlsChart, REGULAR_CHILD_SIZES, {
      alterationThreshold: 0.5,
    });
    expect(lenient.flags.find((f) => f.measure === "bust")?.severity).toBe("info");
    expect(strict.flags.find((f) => f.measure === "bust")?.severity).toBe("warning");
  });

  it("never lets an advisory deviation change the size, however large", () => {
    const huge = matchSize({ girth: 45, bust: 44 }, childGirlsChart, REGULAR_CHILD_SIZES);
    expect(huge.size).toBe("IC");
  });
});

describe("single-value chart cells", () => {
  it("treats a single printed value as the garment's dimension, not a fit range", () => {
    // Revolution prints INSEAM as one number per size - the length the costume
    // is cut to. Flagging every dancer whose leg differs from it made a whole
    // class look like it needed review.
    const chart: typeof childGirlsChart = {
      ...childGirlsChart,
      rows: childGirlsChart.rows.map((r) => ({ ...r, inseam: { min: 25, max: 25 } })),
    };

    const result = matchSize(
      { girth: 45, bust: 27, waist: 24.5, hips: 28, inseam: 21 },
      chart,
      REGULAR_CHILD_SIZES,
    );

    const inseam = result.flags.find((f) => f.measure === "inseam");
    expect(inseam?.severity).toBe("info");
    expect(inseam?.message).toMatch(/garment is cut to 25"/);
    // It must not appear on the exceptions list.
    expect(result.flags.filter((f) => f.severity === "warning")).toEqual([]);
  });

  it("still flags a genuine range that the dancer falls outside", () => {
    const result = matchSize(
      { girth: 45, bust: 40 },
      childGirlsChart,
      REGULAR_CHILD_SIZES,
    );
    const bust = result.flags.find((f) => f.measure === "bust");
    expect(bust?.severity).toBe("warning");
    expect(bust?.direction).toBe("over");
  });
});

describe("reporting", () => {
  it("notes advisory measurements that are missing from the sheet", () => {
    const result = matchSize({ girth: 45 }, childGirlsChart, REGULAR_CHILD_SIZES);
    const missing = result.flags.filter((f) => f.code === "MISSING_MEASUREMENT");
    expect(missing.map((f) => f.measure).sort()).toEqual([
      "bust",
      "height",
      "hips",
      "inseam",
      "waist",
    ]);
  });

  it("writes a rationale a studio could show a parent", () => {
    const result = matchSize(
      { girth: 45, bust: 30, waist: 24.5, hips: 28, inseam: 23 },
      childGirlsChart,
      REGULAR_CHILD_SIZES,
    );
    expect(result.rationale).toBe(
      'Girth 45" falls in IC (Intermediate Child) 44-47". Advisory only: bust 30" over by 2". Girth decides the size.',
    );
  });

  it("says so plainly when everything fits", () => {
    const result = matchSize(
      { girth: 45, bust: 27, waist: 24.5, hips: 28, inseam: 23, height: 55 },
      childGirlsChart,
      REGULAR_CHILD_SIZES,
    );
    expect(result.rationale).toContain("All other measurements are in range.");
  });
});

describe("charts with no girth column", () => {
  /**
   * Weissman's boys and mens charts print no girth at all - those costumes are
   * two-piece, so there is no shoulder-to-crotch dimension to constrain - and
   * are sized on chest instead. The chart declares that rather than the matcher
   * guessing, so a chart that merely lost its girth column in transcription
   * still fails loudly.
   */
  const boysChart: SizeChart = {
    id: "weissman/boys",
    companySlug: "weissman",
    variant: "child-boys",
    status: "confirmed",
    primaryMeasurement: "bust",
    rows: [
      { code: "SC", ordinal: 0, girth: { min: null, max: null }, bust: { min: 24, max: 26 }, waist: { min: 23, max: 24 }, hips: { min: 25, max: 27 } },
      { code: "IC", ordinal: 1, girth: { min: null, max: null }, bust: { min: 26, max: 27.5 }, waist: { min: 24, max: 25 }, hips: { min: 27, max: 28.5 } },
      { code: "MC", ordinal: 2, girth: { min: null, max: null }, bust: { min: 27.5, max: 29.5 }, waist: { min: 25, max: 27.5 }, hips: { min: 28.5, max: 31.5 } },
    ],
  };
  const boysSizes = ["SC", "IC", "MC"];

  it("sizes on chest when the chart declares it", () => {
    const result = matchSize({ girth: 45, bust: 27 }, boysChart, boysSizes);
    expect(result.size).toBe("IC");
    expect(result.rationale).toMatch(/^Bust 27"/);
  });

  it("ignores girth entirely on such a chart", () => {
    // A wildly different girth must not change the answer, because this chart
    // has no girth to compare against.
    const a = matchSize({ girth: 30, bust: 27 }, boysChart, boysSizes);
    const b = matchSize({ girth: 70, bust: 27 }, boysChart, boysSizes);
    expect(a.size).toBe(b.size);
  });

  it("requires the declared measurement, not girth", () => {
    expect(() => matchSize({ girth: 45 }, boysChart, boysSizes)).toThrow(/Bust is required/);
  });

  it("still rounds up out of a gap on the declared measurement", () => {
    const gappy: SizeChart = {
      ...boysChart,
      rows: [
        { code: "SC", ordinal: 0, girth: { min: null, max: null }, bust: { min: 24, max: 26 } },
        { code: "MC", ordinal: 1, girth: { min: null, max: null }, bust: { min: 28, max: 30 } },
      ],
    };
    const result = matchSize({ girth: 45, bust: 27 }, gappy, ["SC", "MC"]);
    expect(result.size).toBe("MC");
    expect(has(result.flags, "PRIMARY_IN_GAP")).toBe(true);
  });

  it("defaults to girth when a chart declares nothing", () => {
    const result = matchSize({ girth: 45, bust: 40 }, childGirlsChart, REGULAR_CHILD_SIZES);
    expect(result.size).toBe("IC");
    expect(result.rationale).toMatch(/^Girth 45"/);
  });
});
