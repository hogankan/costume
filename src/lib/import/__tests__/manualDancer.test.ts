import { describe, expect, it } from "vitest";
import { buildManualDancer, formFromDancer, type DancerForm } from "../manualDancer";
import type { ImportedDancer } from "../parse";

const form = (over: Partial<DancerForm>): DancerForm => ({
  name: "Ella Rodriguez",
  girth: "",
  bust: "",
  waist: "",
  hips: "",
  inseam: "",
  height: "",
  ...over,
});

describe("buildManualDancer", () => {
  it("reads measurements written the way a sheet would have them", () => {
    const { dancer, errors } = buildManualDancer(form({ girth: "44 1/2", bust: "26½", inseam: '21"' }), {
      rowNumber: 100001,
    });
    expect(errors).toEqual([]);
    expect(dancer).toMatchObject({ girth: 44.5, bust: 26.5, inseam: 21, source: "added", issues: [] });
  });

  it("can't size a dancer with no girth, and says so", () => {
    const { dancer } = buildManualDancer(form({ bust: "26" }), { rowNumber: 100001 });
    expect(dancer?.issues[0]).toMatchObject({ severity: "error", field: "girth" });
  });

  it("refuses unreadable or implausible values rather than guessing", () => {
    expect(buildManualDancer(form({ girth: "abc" }), { rowNumber: 1 }).errors[0]).toMatch(/Couldn't read girth/);
    // Centimetres typed into an inches box.
    expect(buildManualDancer(form({ girth: "112" }), { rowNumber: 1 }).errors[0]).toMatch(/looks wrong/);
    expect(buildManualDancer(form({ name: " ", girth: "44" }), { rowNumber: 1 }).errors[0]).toMatch(/name/);
  });

  it("keeps the sheet row when filling in a dancer who was on the sheet", () => {
    const existing: ImportedDancer = {
      rowNumber: 15,
      name: "Evelyn Schuster",
      notes: "Measurements not taken yet",
      issues: [{ severity: "error", field: "girth", message: "Not measured" }],
    };
    const { dancer } = buildManualDancer(
      { ...formFromDancer(existing), girth: "41", waist: "21" },
      { existing, rowNumber: existing.rowNumber },
    );
    expect(dancer).toMatchObject({ rowNumber: 15, name: "Evelyn Schuster", girth: 41, source: "edited", issues: [] });
    // The "not taken yet" note no longer applies.
    expect(dancer?.notes).toBeUndefined();
  });
});
