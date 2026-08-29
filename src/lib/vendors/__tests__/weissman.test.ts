import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractProductLite, weissmanAdapter, weissmanProductUrl } from "../weissman";
import { VendorScrapeError } from "../types";

/** Parsed against a real page captured from weissmans.com. */
const FIXTURE_URL = "https://www.weissmans.com/19912.aspx";
const html = readFileSync(
  join(__dirname, "..", "__fixtures__", "weissman-19912.html"),
  "utf8",
);

describe("weissman adapter", () => {
  const result = weissmanAdapter.parse(html, FIXTURE_URL);

  it("reads the style number and name from the embedded product data", () => {
    expect(result.styleNumber).toBe("19912");
    expect(result.name).toBe("Silent Treatment");
  });

  it("reads the orderable sizes", () => {
    expect(result.availableSizes).toEqual([
      "XSC", "SC", "IC", "MC", "LC", "XLC", "XXLC", "SA", "MA", "LA", "XLA", "XXLA",
    ]);
  });

  it("reads colourways with their vendor colour code", () => {
    expect(result.colorways).toEqual([{ name: "Blackberry", code: "CBLACKBERY" }]);
  });

  it("carries the chart the product itself names", () => {
    // Weissman's girls and child-unisex charts share a size vocabulary, so the
    // product naming its own chart is the only reliable discriminator.
    expect(result.chartImageUrl).toBe("~/SizeCharts/BaleraWeissman.ascx");
  });

  it("fails loudly when the embedded product data is gone", () => {
    expect(() => weissmanAdapter.parse("<html><body>nothing</body></html>", FIXTURE_URL)).toThrow(
      VendorScrapeError,
    );
  });
});

describe("extractProductLite", () => {
  it("brace-matches past braces inside strings", () => {
    // The real object embeds an HTML description containing braces and quotes;
    // a regex that stops at the first '}' truncates it.
    const tricky = `var jsonProductLite = {"Name":"a } \\" { b","Style":"1"}; more junk`;
    expect(extractProductLite(tricky)).toEqual({ Name: 'a } " { b', Style: "1" });
  });

  it("returns null rather than throwing on malformed data", () => {
    expect(extractProductLite("var jsonProductLite = {oops")).toBeNull();
    expect(extractProductLite("no marker here")).toBeNull();
  });
});

describe("weissman style numbers and urls", () => {
  it("builds a product url from a bare style number", () => {
    expect(weissmanProductUrl("19912")).toBe("https://www.weissmans.com/19912.aspx");
  });

  it.each([
    ["19912", "19912"],
    ["https://www.weissmans.com/19912.aspx", "19912"],
    ["https://www.weissmans.com/showtime/costumes/tap_and_jazz/19912.aspx", "19912"],
  ])("parses %s", (input, expected) => {
    expect(weissmanAdapter.parseStyleNumber(input)).toBe(expected);
  });
});
