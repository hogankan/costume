import { describe, expect, it } from "vitest";
import { runSizing, UnconfirmedChartError, type RunCostume } from "../run";
import { childGirlsChart, REGULAR_CHILD_SIZES } from "./fixtures";
import type { ImportedDancer } from "../../import/parse";

const costume: RunCostume = {
  companyName: "Weissman",
  styleNumber: "10504",
  name: "BIGGER IS BETTER",
  availableSizes: REGULAR_CHILD_SIZES,
  defaultColorway: "Purple",
};

const dancer = (over: Partial<ImportedDancer> = {}): ImportedDancer => ({
  rowNumber: 2,
  name: "Ella Rodriguez",
  girth: 45,
  issues: [],
  ...over,
});

const run = (dancers: ImportedDancer[], chart = childGirlsChart) =>
  runSizing({ className: "Tues 5pm Junior Jazz", costume, chart, dancers });

describe("runSizing", () => {
  it("sizes a whole class against one costume", () => {
    const { assignments, skipped } = run([
      dancer({ name: "Ella", girth: 45 }),
      dancer({ name: "Maya", girth: 49, rowNumber: 3 }),
    ]);
    expect(skipped).toEqual([]);
    expect(assignments.map((a) => [a.dancerName, a.recommendedSize])).toEqual([
      ["Ella", "IC"],
      ["Maya", "MC"],
    ]);
  });

  it("refuses to size against a chart no human has confirmed", () => {
    const draft = { ...childGirlsChart, status: "draft" as const };
    expect(() => run([dancer()], draft)).toThrow(UnconfirmedChartError);
  });

  it("skips a dancer with no girth rather than guessing a size", () => {
    const { assignments, skipped } = run([
      dancer({ name: "Measured", girth: 45 }),
      dancer({ name: "Unmeasured", girth: undefined, rowNumber: 7 }),
    ]);
    expect(assignments).toHaveLength(1);
    expect(skipped).toEqual([
      {
        dancerName: "Unmeasured",
        rowNumber: 7,
        reason: "No girth measurement on file; girth decides the size.",
      },
    ]);
  });

  it("applies the class default colour but lets a dancer override it", () => {
    const { assignments } = run([
      dancer({ name: "Ella" }),
      dancer({ name: "Soloist", colorway: "Red", rowNumber: 3 }),
    ]);
    expect(assignments[0].colorway).toBe("Purple");
    expect(assignments[1].colorway).toBe("Red");
  });

  it("carries flags and rationale through to the export row", () => {
    const { assignments } = run([dancer({ girth: 60 })]);
    expect(assignments[0].flags.some((f) => f.severity === "blocking")).toBe(true);
    expect(assignments[0].rationale).toMatch(/exceeds the largest orderable size/);
  });

  it("reports a dancer it cannot size rather than aborting the whole class", () => {
    const narrowCostume: RunCostume = { ...costume, availableSizes: ["ZZZ"] };
    const { assignments, skipped } = runSizing({
      className: "Tues 5pm Junior Jazz",
      costume: narrowCostume,
      chart: childGirlsChart,
      dancers: [dancer()],
    });
    expect(assignments).toHaveLength(0);
    expect(skipped[0].reason).toMatch(/do not intersect/);
  });

  it("names a dancer by row when the sheet had no name", () => {
    const { assignments } = run([dancer({ name: "", rowNumber: 12 })]);
    expect(assignments[0].dancerName).toBe("(row 12)");
  });
});
