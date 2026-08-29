import { describe, expect, it } from "vitest";
import { buildManualCostume, splitList } from "../manual";
import { VendorScrapeError } from "../types";

describe("splitList", () => {
  it.each([
    ["XSC, SC, MC, LC", ["XSC", "SC", "MC", "LC"]],
    ["XSC SC MC", ["XSC SC MC"]], // single spaces are part of one entry
    ["XSC\nSC\nMC", ["XSC", "SC", "MC"]],
    ["XSC / SC / MC", ["XSC", "SC", "MC"]],
    ["Purple | Red", ["Purple", "Red"]],
    ["XSC,  SC ,MC ", ["XSC", "SC", "MC"]],
  ])("splits %o", (input, expected) => {
    expect(splitList(input)).toEqual(expected);
  });

  it("drops duplicates and blanks", () => {
    expect(splitList("SC,,SC, MC,")).toEqual(["SC", "MC"]);
  });
});

describe("buildManualCostume", () => {
  const base = { styleNumber: "V2528Y", name: "Velvet Cutout", sizes: "SC, IC, MC, LC" };

  it("builds a costume from pasted values", () => {
    const costume = buildManualCostume({ ...base, colors: "Ruby, Emerald" });
    expect(costume.styleNumber).toBe("V2528Y");
    expect(costume.availableSizes).toEqual(["SC", "IC", "MC", "LC"]);
    expect(costume.colorways.map((c) => c.name)).toEqual(["Ruby", "Emerald"]);
  });

  it("upper-cases size codes so they match chart vocabularies", () => {
    const costume = buildManualCostume({ ...base, sizes: "sc, ic, mc" });
    expect(costume.availableSizes).toEqual(["SC", "IC", "MC"]);
  });

  it("allows a costume with no colourways", () => {
    expect(buildManualCostume(base).colorways).toEqual([]);
  });

  it("requires a style number", () => {
    expect(() => buildManualCostume({ ...base, styleNumber: "  " })).toThrow(VendorScrapeError);
  });

  it("requires a name", () => {
    expect(() => buildManualCostume({ ...base, name: "" })).toThrow(VendorScrapeError);
  });

  it("requires at least one size, since sizes identify the chart", () => {
    expect(() => buildManualCostume({ ...base, sizes: "  " })).toThrow(/at least one orderable size/i);
  });

  it("carries a chart image URL through to the extraction pipeline", () => {
    const costume = buildManualCostume({
      ...base,
      chartImageUrl: "  https://example.com/chart.jpg  ",
    });
    expect(costume.chartImageUrl).toBe("https://example.com/chart.jpg");
  });
});
