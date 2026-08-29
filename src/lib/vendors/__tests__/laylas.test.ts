import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { laylasAdapter } from "../laylas";
import { VendorScrapeError } from "../types";

/** Parsed against a real page captured from laylasdance.com. */
const FIXTURE_URL = "https://laylasdance.com/costumes/l3627-good-morning.html";
const html = readFileSync(join(__dirname, "..", "__fixtures__", "laylas-l3627.html"), "utf8");

describe("layla's adapter", () => {
  const result = laylasAdapter.parse(html, FIXTURE_URL);

  it("reads the style number and name from the heading", () => {
    expect(result.styleNumber).toBe("L3627");
    expect(result.name).toBe("GOOD MORNING");
  });

  it("returns no sizes, because they sit behind the trade login", () => {
    // Guessing the full chart range here would risk recommending a size the
    // costume is not made in, which is the one thing availableSizes prevents.
    expect(result.availableSizes).toEqual([]);
  });

  it("fails loudly when the heading is not a style and name", () => {
    expect(() => laylasAdapter.parse("<html><h1>Just a title</h1></html>", FIXTURE_URL)).toThrow(
      VendorScrapeError,
    );
  });
});

describe("layla's style numbers", () => {
  it.each([
    ["L3627", "L3627"],
    ["l3627", "L3627"],
    ["3627", "3627"],
    ["https://laylasdance.com/costumes/l3627-good-morning.html", "L3627"],
  ])("parses %s", (input, expected) => {
    expect(laylasAdapter.parseStyleNumber(input)).toBe(expected);
  });

  it("returns null when there is nothing to find", () => {
    expect(laylasAdapter.parseStyleNumber("no digits")).toBeNull();
  });
});
