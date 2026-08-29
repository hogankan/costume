import type { SizeChart } from "../types";

/**
 * Test chart modelled on Weissman's child-girls sizing.
 *
 * The IC and MC girth figures (44-47 and 47-51) are Weissman's published
 * numbers; the surrounding rows are plausible fill so the matcher can be
 * exercised at both ends. Two properties of the real charts are deliberately
 * preserved because they drive the interesting behaviour:
 *
 *  - Adjacent rows SHARE a boundary value (IC tops out at 47, MC starts at 47),
 *    so a dancer can land exactly between two sizes.
 *  - The long variant ICL overlaps MC on girth while keeping IC's bust and
 *    waist, which is what makes girth-first matching necessary rather than a
 *    "closest overall fit" search.
 */
export const childGirlsChart: SizeChart = {
  id: "fixture-child-girls",
  companySlug: "weissman",
  variant: "child-girls",
  status: "confirmed",
  rows: [
    {
      code: "XSC",
      label: "X-Small Child",
      ordinal: 0,
      girth: { min: 38, max: 41 },
      bust: { min: 22, max: 23 },
      waist: { min: 21, max: 22 },
      hips: { min: 23, max: 25 },
      inseam: { min: 17, max: 20 },
    },
    {
      code: "SC",
      label: "Small Child",
      ordinal: 1,
      girth: { min: 41, max: 44 },
      bust: { min: 24, max: 25 },
      waist: { min: 22, max: 23 },
      hips: { min: 25, max: 27 },
      inseam: { min: 19, max: 22 },
    },
    {
      code: "IC",
      label: "Intermediate Child",
      ordinal: 2,
      girth: { min: 44, max: 47 },
      bust: { min: 26, max: 28 },
      waist: { min: 24, max: 25 },
      hips: { min: 27, max: 29 },
      inseam: { min: 22, max: 25 },
    },
    {
      code: "ICL",
      label: "Intermediate Child Long",
      ordinal: 3,
      girth: { min: 47, max: 50 },
      bust: { min: 26, max: 28 },
      waist: { min: 24, max: 25 },
      hips: { min: 27, max: 29 },
      inseam: { min: 25, max: 28 },
    },
    {
      code: "MC",
      label: "Medium Child",
      ordinal: 4,
      girth: { min: 47, max: 51 },
      bust: { min: 28, max: 31 },
      waist: { min: 25, max: 27 },
      hips: { min: 29, max: 32 },
      inseam: { min: 22, max: 28 },
    },
    {
      code: "LC",
      label: "Large Child",
      ordinal: 5,
      girth: { min: 51, max: 55 },
      bust: { min: 31, max: 33 },
      waist: { min: 27, max: 29 },
      hips: { min: 32, max: 34 },
      inseam: { min: 24, max: 30 },
    },
  ],
};

export const ALL_CHILD_SIZES = ["XSC", "SC", "IC", "ICL", "MC", "LC"];

/** No long variants - the common case, and the one with no girth overlap. */
export const REGULAR_CHILD_SIZES = ["XSC", "SC", "IC", "MC", "LC"];

/**
 * A chart with a real gap between printed ranges (43 to 45 is unclaimed), to
 * exercise rounding up out of a gap.
 */
export const gappyChart: SizeChart = {
  id: "fixture-gappy",
  companySlug: "fixture",
  variant: "child-girls",
  status: "confirmed",
  rows: [
    { code: "A", ordinal: 0, girth: { min: 40, max: 43 }, bust: { min: 22, max: 24 } },
    { code: "B", ordinal: 1, girth: { min: 45, max: 48 }, bust: { min: 25, max: 27 } },
  ],
};

/** Open-ended top row, as charts often print for their largest size. */
export const openEndedChart: SizeChart = {
  id: "fixture-open-ended",
  companySlug: "fixture",
  variant: "adult-womens",
  status: "confirmed",
  rows: [
    { code: "SA", ordinal: 0, girth: { min: 52, max: 56 } },
    { code: "MA", ordinal: 1, girth: { min: 56, max: null } },
  ],
};

export const draftChart: SizeChart = {
  ...childGirlsChart,
  id: "fixture-draft",
  status: "draft",
};
