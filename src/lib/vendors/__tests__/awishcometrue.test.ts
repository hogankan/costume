import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { awishcometrueAdapter } from "../awishcometrue";
import { VendorScrapeError } from "../types";

/** Parsed against a real page captured from awishcometrue.com. */
const FIXTURE_URL = "https://awishcometrue.com/27364-friendship-and-magic";
const html = readFileSync(
  join(__dirname, "..", "__fixtures__", "awishcometrue-27364.html"),
  "utf8",
);

describe("a wish come true adapter", () => {
  const result = awishcometrueAdapter.parse(html, FIXTURE_URL);

  it("reads the style number and name from the heading", () => {
    expect(result.styleNumber).toBe("27364");
    expect(result.name).toBe("Friendship and Magic");
  });

  it("reads the orderable sizes from the variant table", () => {
    expect(result.availableSizes).toEqual([
      "XSC",
      "SC",
      "ISC",
      "MC",
      "IMC",
      "LC",
      "XLC",
      "XXLC",
    ]);
  });

  it("reads exactly the colourways, not the size codes", () => {
    // The per-size quantity inputs carry the same data attribute holding a SIZE,
    // so an unscoped selector returned "Aqua, XSC, SC, ISC, ..." here.
    expect(result.colorways.map((c) => c.name)).toEqual(["Aqua", "Lavender", "Candy Pink"]);
  });

  it("strips the vendor's colour number from the name", () => {
    // The visible title is "54 Aqua"; the number is not part of the colour.
    expect(result.colorways.every((c) => !/^\d/.test(c.name))).toBe(true);
    expect(result.colorways[0].code).toBe("54");
  });

  it("keeps colours and sizes disjoint", () => {
    const colours = new Set(result.colorways.map((c) => c.name));
    expect(result.availableSizes.some((s) => colours.has(s))).toBe(false);
  });

  it("finds the size chart image the product points at", () => {
    expect(result.chartImageUrl).toMatch(/SizeCharts/i);
  });

  it("fails loudly rather than silently when the layout changes", () => {
    expect(() => awishcometrueAdapter.parse("<html><h1>nope</h1></html>", FIXTURE_URL)).toThrow(
      VendorScrapeError,
    );
  });

  it("fails when the heading parses but no sizes are present", () => {
    expect(() =>
      awishcometrueAdapter.parse("<html><h1>27364 A Costume</h1></html>", FIXTURE_URL),
    ).toThrow(/no sizes found/);
  });
});

describe("a wish come true style numbers", () => {
  it.each([
    ["27364", "27364"],
    ["27083Y", "27083Y"],
    ["27083y", "27083Y"],
    ["https://awishcometrue.com/27083y-swinging-on-a-star", "27083Y"],
    ["https://awishcometrue.com/27364-friendship-and-magic", "27364"],
  ])("parses %s", (input, expected) => {
    expect(awishcometrueAdapter.parseStyleNumber(input)).toBe(expected);
  });

  it("returns null when there is nothing to find", () => {
    expect(awishcometrueAdapter.parseStyleNumber("no digits here")).toBeNull();
  });
});
