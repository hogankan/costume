import { describe, expect, it } from "vitest";
import { resolveChart, type ChartCandidate } from "../resolve";

/**
 * Vocabularies as Weissman publishes them on its SIZESET page, plus Revolution's
 * single combined child-and-adult chart.
 */
const weissmanGirls: ChartCandidate = {
  id: "w-girls",
  variant: "child-girls",
  sizeCodes: ["T", "XXSC", "XSC", "SC", "IC", "ICL", "MC", "MCL", "LC", "XLC", "XXLC"],
};
const weissmanWomens: ChartCandidate = {
  id: "w-womens",
  variant: "adult-womens",
  sizeCodes: ["XSA", "XSAL", "SA", "SAL", "MA", "LA", "XLA", "XXLA", "XXXLA"],
};
const weissmanChildUnisex: ChartCandidate = {
  id: "w-child-unisex",
  variant: "child-unisex",
  sizeCodes: ["XSC", "SC", "IC", "MC", "LC", "XLC"],
};
const weissmanBoys: ChartCandidate = {
  id: "w-boys",
  variant: "child-boys",
  sizeCodes: ["XSC", "SC", "IC", "MC", "LC", "XLC"],
};

const weissman = [weissmanGirls, weissmanWomens, weissmanChildUnisex, weissmanBoys];

const revolutionStandard: ChartCandidate = {
  id: "rev-standard",
  variant: "child-and-adult",
  sizeCodes: ["XSC", "SC", "MC", "LC", "XLC", "XXLC", "SA", "MA", "LA", "XLA", "XXLA"],
};

/**
 * Revolution's real situation, found by crawling: a general chart and a
 * male/unisex chart whose size codes are a strict SUBSET of the general one.
 */
const revGeneral: ChartCandidate = {
  id: "revolution/child-and-adult",
  variant: "child-and-adult",
  sizeCodes: ["XSC", "SC", "MC", "LC", "XLC", "XXLC", "SA", "MA", "LA", "XLA", "XXLA"],
  sourceImageUrl: "https://cdn.example/costumechart.jpg",
};
const revMale: ChartCandidate = {
  id: "revolution/male-unisex",
  variant: "male-unisex",
  sizeCodes: ["XSC", "SC", "MC", "LC", "XLC", "SA", "MA", "LA", "XLA"],
  sourceImageUrl: "https://cdn.example/maleunisexchart.jpg",
};

describe("resolving by the product's own chart image", () => {
  it("uses the linked chart image, which size codes alone cannot settle", () => {
    // The male/unisex codes are a subset of the general chart's, so both charts
    // "cover" them. Only the linked image distinguishes the two.
    const result = resolveChart(
      revMale.sizeCodes,
      [revGeneral, revMale],
      undefined,
      "https://cdn.example/maleunisexchart.jpg",
    );
    expect(result.chart?.id).toBe("revolution/male-unisex");
    expect(result.confidence).toBe("exact");
  });

  it("without the image, a reduced size range resolves to the WRONG chart", () => {
    // This is the case that makes the image signal necessary. 11 costumes in the
    // real catalogue are ordinary girls' styles that simply do not come in XXL,
    // so their codes match the male/unisex vocabulary exactly. Size codes alone
    // send them to the male chart, which is the wrong garment.
    const girlsStyleWithoutXXL = ["XSC", "SC", "MC", "LC", "XLC", "SA", "MA", "LA", "XLA"];

    const guessed = resolveChart(girlsStyleWithoutXXL, [revGeneral, revMale]);
    expect(guessed.chart?.id).toBe("revolution/male-unisex");

    // With the linked image it lands on the right one.
    const resolved = resolveChart(
      girlsStyleWithoutXXL,
      [revGeneral, revMale],
      undefined,
      "https://cdn.example/costumechart.jpg",
    );
    expect(resolved.chart?.id).toBe("revolution/child-and-adult");
    expect(resolved.confidence).toBe("exact");
  });

  it("falls back to size codes when the linked image is not in the library", () => {
    const result = resolveChart(
      revGeneral.sizeCodes,
      [revGeneral, revMale],
      undefined,
      "https://cdn.example/some-chart-we-have-not-seen.jpg",
    );
    expect(result.chart?.id).toBe("revolution/child-and-adult");
  });
});

describe("resolveChart", () => {
  it("resolves Revolution's combined chart from a real costume's sizes", () => {
    // The exact vocabulary scraped from style 27776.
    const result = resolveChart(
      ["XSC", "SC", "MC", "LC", "XLC", "XXLC", "SA", "MA", "LA", "XLA", "XXLA"],
      [revolutionStandard],
    );
    expect(result.chart?.id).toBe("rev-standard");
    expect(result.confidence).toBe("exact");
  });

  it("picks the girls chart when long variants are offered", () => {
    // ICL and MCL appear only in the girls vocabulary.
    const result = resolveChart(["IC", "ICL", "MC", "MCL", "LC"], weissman);
    expect(result.chart?.id).toBe("w-girls");
  });

  it("picks the women's chart for adult sizes", () => {
    const result = resolveChart(["SA", "MA", "LA", "XLA"], weissman);
    expect(result.chart?.id).toBe("w-womens");
  });

  it("asks a human when two charts genuinely share a vocabulary", () => {
    // Boys and child-unisex publish identical codes; guessing would mis-size a class.
    const result = resolveChart(["SC", "IC", "MC", "LC"], [weissmanChildUnisex, weissmanBoys]);
    expect(result.chart).toBeNull();
    expect(result.confidence).toBe("ambiguous");
    expect(result.candidates.map((c) => c.id).sort()).toEqual(["w-boys", "w-child-unisex"]);
  });

  it("uses a product category hint to break that tie", () => {
    const result = resolveChart(
      ["SC", "IC", "MC", "LC"],
      [weissmanChildUnisex, weissmanBoys],
      "Boys & Mens Jazz Costumes",
    );
    expect(result.chart?.id).toBe("w-boys");
    expect(result.confidence).toBe("high");
  });

  it("prefers the most specific chart over a broader superset", () => {
    const result = resolveChart(["XSC", "SC", "IC", "MC", "LC", "XLC"], [
      weissmanGirls,
      weissmanChildUnisex,
    ]);
    // Both cover the codes, but child-unisex matches the vocabulary exactly.
    expect(result.chart?.id).toBe("w-child-unisex");
    expect(result.confidence).toBe("exact");
  });

  it("reports which sizes no chart accounts for", () => {
    const result = resolveChart(["SC", "IC", "ZZZ"], weissman);
    expect(result.confidence).toBe("unmatched");
    expect(result.chart).toBeNull();
    expect(result.unmatchedCodes).toContain("ZZZ");
  });

  it("normalises case and whitespace", () => {
    const result = resolveChart([" sa ", "ma", "LA", "xla"], weissman);
    expect(result.chart?.id).toBe("w-womens");
  });

  it("handles an empty library without throwing", () => {
    const result = resolveChart(["SC"], []);
    expect(result.confidence).toBe("unmatched");
    expect(result.reason).toMatch(/No charts are in the library/);
  });

  it("handles a costume with no sizes", () => {
    const result = resolveChart([], weissman);
    expect(result.confidence).toBe("unmatched");
  });
});

describe("costumes whose sizes span two charts", () => {
  // A Wish Come True prints child and adult girls' sizes as separate charts.
  const child: ChartCandidate = {
    id: "aw-child",
    variant: "girls-child",
    sizeCodes: ["2T", "XXSC", "XSC", "SC", "ISC", "MC", "IMC", "LC", "XLC", "XXLC"],
  };
  const adult: ChartCandidate = {
    id: "aw-adult",
    variant: "girls-adult",
    sizeCodes: ["SA", "MA", "LA", "XLA", "XXLA", "3XLA", "4XLA"],
  };
  const boys: ChartCandidate = {
    id: "aw-boys",
    variant: "boys",
    sizeCodes: ["2T", "XXSC", "XSC", "SC", "MC", "LC", "SA", "MA", "LA", "XLA", "XXLA"],
  };
  // Style 24182 Jackson, as its product page lists it.
  const jackson = ["SC", "ISC", "MC", "IMC", "LC", "XLC", "XXLC", "SA", "MA", "LA", "XLA", "XXLA", "3XLA", "4XLA"];

  it("uses both charts when together they cover every size", () => {
    const res = resolveChart(jackson, [adult, boys, child]);
    expect(res.chart).toBeNull();
    expect(res.combined?.map((c) => c.id).sort()).toEqual(["aw-adult", "aw-child"]);
    expect(res.reason).toMatch(/two charts/);
  });

  it("still prefers a single chart that covers everything", () => {
    const res = resolveChart(["SC", "MC", "SA"], [adult, boys, child]);
    expect(res.chart?.id).toBe("aw-boys");
    expect(res.combined).toBeUndefined();
  });

  it("does not pair charts that both claim the same size", () => {
    const res = resolveChart(["SC", "SA", "3XLA"], [boys, adult]);
    expect(res.combined).toBeUndefined();
    expect(res.confidence).toBe("unmatched");
  });
});
