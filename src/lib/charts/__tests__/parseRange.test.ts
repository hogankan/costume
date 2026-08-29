import { describe, expect, it } from "vitest";
import { formatRangeInput, parseRangeInput } from "../parseRange";

describe("parseRangeInput", () => {
  it.each([
    ["43-46", { min: 43, max: 46 }],
    ["43 - 46", { min: 43, max: 46 }],
    ["43 – 46", { min: 43, max: 46 }], // en dash
    ["43 to 46", { min: 43, max: 46 }],
    ['43"-46"', { min: 43, max: 46 }],
    ["43-46 in", { min: 43, max: 46 }],
    ["43.5-46.5", { min: 43.5, max: 46.5 }],
    ["43 1/2 - 46", { min: 43.5, max: 46 }],
    ["43½-46", { min: 43.5, max: 46 }],
  ])("parses the range %o", (input, expected) => {
    expect(parseRangeInput(input)).toEqual(expected);
  });

  it("treats a single number as a one-value range", () => {
    expect(parseRangeInput("46")).toEqual({ min: 46, max: 46 });
  });

  it.each([
    ["46+", { min: 46, max: null }],
    ["46 and up", { min: 46, max: null }],
    ["46 and over", { min: 46, max: null }],
  ])("handles the open top %o", (input, expected) => {
    expect(parseRangeInput(input)).toEqual(expected);
  });

  it.each([
    ["up to 46", { min: null, max: 46 }],
    ["under 46", { min: null, max: 46 }],
  ])("handles the open bottom %o", (input, expected) => {
    expect(parseRangeInput(input)).toEqual(expected);
  });

  it("returns null for a blank cell, meaning the chart has no such column", () => {
    expect(parseRangeInput("")).toBeNull();
    expect(parseRangeInput("   ")).toBeNull();
  });

  it.each(["abc", "43-", "-46", "43 - abc", "??"])(
    "rejects unparseable input %o rather than guessing",
    (input) => {
      expect(parseRangeInput(input)).toBe("invalid");
    },
  );
});

describe("formatRangeInput", () => {
  it.each([
    [{ min: 43, max: 46 }, "43-46"],
    [{ min: 43.5, max: 46 }, "43.5-46"],
    [{ min: 46, max: 46 }, "46"],
    [{ min: 46, max: null }, "46+"],
    [{ min: null, max: 46 }, "up to 46"],
    [null, ""],
  ])("renders %o as %o", (input, expected) => {
    expect(formatRangeInput(input)).toBe(expected);
  });

  it("round-trips through the parser", () => {
    for (const text of ["43-46", "46", "46+", "up to 46", "43.5-46.5"]) {
      expect(formatRangeInput(parseRangeInput(text) as never)).toBe(text);
    }
  });
});
