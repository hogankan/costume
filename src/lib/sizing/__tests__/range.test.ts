import { describe, expect, it } from "vitest";
import { contains, distanceOutside, formatRange, hi, lo } from "../range";

describe("formatRange", () => {
  it("renders a range", () => {
    expect(formatRange({ min: 44, max: 47 })).toBe('44-47"');
  });

  it("renders a single printed value as one number, not a range", () => {
    // Charts print inseam as one number - the garment's dimension. "18-18"
    // reads as a transcription mistake.
    expect(formatRange({ min: 18, max: 18 })).toBe('18"');
  });

  it("renders open ends the way charts print them", () => {
    expect(formatRange({ min: 46, max: null })).toBe('46"+');
    expect(formatRange({ min: null, max: 46 })).toBe('up to 46"');
    expect(formatRange({ min: null, max: null })).toBe("any");
  });
});

describe("range bounds", () => {
  it("treats a null end as unbounded, not zero", () => {
    expect(lo({ min: null, max: 46 })).toBe(Number.NEGATIVE_INFINITY);
    expect(hi({ min: 46, max: null })).toBe(Number.POSITIVE_INFINITY);
    expect(contains({ min: 46, max: null }, 900)).toBe(true);
    expect(contains({ min: null, max: 46 }, -900)).toBe(true);
  });

  it("measures how far a value sits outside a range", () => {
    expect(distanceOutside({ min: 44, max: 47 }, 49)).toBe(2);
    expect(distanceOutside({ min: 44, max: 47 }, 42)).toBe(2);
    expect(distanceOutside({ min: 44, max: 47 }, 45)).toBe(0);
  });
});
