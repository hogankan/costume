import { describe, expect, it } from "vitest";
import { dancerChanges } from "../changes";
import type { ImportedDancer } from "../../import/parse";

const d = (rowNumber: number, name: string, m: Partial<ImportedDancer> = {}): ImportedDancer => ({
  rowNumber,
  name,
  issues: [],
  ...m,
});

describe("dancerChanges", () => {
  it("lists measurements filled in, changed, and dancers added since upload", () => {
    const original = [d(8, "Evelyn Schuster"), d(9, "Aspen Slate", { girth: 45, waist: 24 })];
    const current = [
      d(8, "Evelyn Schuster", { girth: 42, bust: 23, source: "edited" }),
      d(9, "Aspen Slate", { girth: 45, waist: 24 }),
      d(100001, "New Dancer", { girth: 44.5, source: "added" }),
    ];
    expect(dancerChanges(original, current)).toEqual([
      { name: "Evelyn Schuster", kind: "edited", changes: ["Girth: blank → 42", "Chest: blank → 23"] },
      { name: "New Dancer", kind: "added", changes: ["Girth: 44.5"] },
    ]);
  });

  it("notes a corrected name", () => {
    const changes = dancerChanges([d(24, "2026-06-01 Myers")], [d(24, "June Myers")]);
    expect(changes[0].changes).toEqual(["Name: 2026-06-01 Myers → June Myers"]);
  });
});
