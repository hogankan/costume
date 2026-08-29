import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  detectHeaderRow,
  guessMapping,
  headerFingerprint,
  missingRequired,
} from "../headers";
import {
  convertToInches,
  detectUnit,
  parseMeasurement,
  parseWorkbook,
  readRoster,
} from "../parse";

describe("guessMapping", () => {
  it("maps a typical studio sheet", () => {
    const mapping = guessMapping([
      "Dancer Name",
      "Girth",
      "Chest",
      "Waist",
      "Hip",
      "Inseam",
    ]);
    expect(mapping.map((m) => m.field)).toEqual([
      "name",
      "girth",
      "bust",
      "waist",
      "hips",
      "inseam",
    ]);
  });

  it("ignores unit suffixes in headers", () => {
    const mapping = guessMapping(["Girth (in)", "Waist (inches)", "Height cm"]);
    expect(mapping.map((m) => m.field)).toEqual(["girth", "waist", "height"]);
  });

  it("handles a name split across two columns", () => {
    const mapping = guessMapping(["First Name", "Last Name", "Girth"]);
    expect(mapping.map((m) => m.field)).toEqual(["firstName", "lastName", "girth"]);
  });

  it("does not mistake shoe size for a body measurement", () => {
    const mapping = guessMapping(["Name", "Shoe Size", "Girth"]);
    expect(mapping[1].field).toBeNull();
  });

  it("never assigns the same field to two columns", () => {
    const mapping = guessMapping(["Waist", "Waist Notes", "Girth"]);
    const fields = mapping.map((m) => m.field).filter(Boolean);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("reports girth as missing when the sheet has no girth column", () => {
    const mapping = guessMapping(["Name", "Chest", "Waist"]);
    expect(missingRequired(mapping)).toEqual(["girth"]);
  });

  it("fingerprints headers stably regardless of order or casing", () => {
    expect(headerFingerprint(["Girth", "Name (full)"])).toBe(
      headerFingerprint(["name", "GIRTH"]),
    );
  });
});

describe("detectHeaderRow", () => {
  it("finds headers below a title and a blank row", () => {
    const rows: unknown[][] = [
      ["Spring Recital 2027 Measurements", null, null],
      [null, null, null],
      ["Dancer", "Girth", "Waist"],
      ["Ella R.", 45, 24],
    ];
    expect(detectHeaderRow(rows)).toBe(2);
  });

  it("returns 0 when the first row is already the header", () => {
    expect(detectHeaderRow([["Name", "Girth"], ["Ella", 45]])).toBe(0);
  });
});

describe("parseMeasurement", () => {
  it.each([
    [44, 44],
    ["44", 44],
    ["44.5", 44.5],
    ['44"', 44],
    ["44 in", 44],
    ["  45  ", 45],
    ["44 1/2", 44.5],
    ["44 3/4", 44.75],
    ["44½", 44.5],
    ["1/2", 0.5],
  ])("parses %o as %o", (input, expected) => {
    expect(parseMeasurement(input)).toBeCloseTo(expected as number, 5);
  });

  it.each([null, undefined, "", "   ", "n/a", "TBD", "not measured"])(
    "returns null for %o",
    (input) => {
      expect(parseMeasurement(input)).toBeNull();
    },
  );
});

const HEADERS = ["Name", "Girth", "Chest", "Waist", "Hip", "Inseam", "Color"];

function roster(rows: unknown[][]) {
  const all = [HEADERS, ...rows];
  return readRoster(all, 0, guessMapping(HEADERS));
}

describe("readRoster", () => {
  it("reads a clean roster", () => {
    const { dancers } = roster([
      ["Ella Rodriguez", 45, 27, 24, 28, 23, "Ruby"],
      ["Maya Chen", "47 1/2", 29, 26, 30, 24, null],
    ]);
    expect(dancers).toHaveLength(2);
    expect(dancers[0]).toMatchObject({ name: "Ella Rodriguez", girth: 45, colorway: "Ruby" });
    expect(dancers[1].girth).toBe(47.5);
    expect(dancers[1].colorway).toBeUndefined();
  });

  it("makes a missing girth a hard error, since girth decides the size", () => {
    const { dancers } = roster([["Unmeasured Dancer", null, 27, 24, 28, 23, null]]);
    const errors = dancers[0].issues.filter((i) => i.severity === "error");
    expect(errors.some((e) => e.field === "girth")).toBe(true);
  });

  it("treats a missing advisory measurement as no issue at all", () => {
    const { dancers } = roster([["Ella", 45, null, null, null, null, null]]);
    expect(dancers[0].issues).toEqual([]);
  });

  it("flags an unreadable girth rather than silently dropping the dancer", () => {
    const { dancers } = roster([["Ella", "ask mom", 27, 24, 28, 23, null]]);
    expect(dancers).toHaveLength(1);
    expect(dancers[0].issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("keeps the original row number so the user can find the row again", () => {
    const { dancers } = roster([
      ["Ella", 45, 27, 24, 28, 23, null],
      ["Maya", 47, 29, 26, 30, 24, null],
    ]);
    expect(dancers.map((d) => d.rowNumber)).toEqual([2, 3]);
  });

  it("skips entirely blank rows without counting them as dancers", () => {
    const { dancers, skippedRows } = roster([
      ["Ella", 45, 27, 24, 28, 23, null],
      [null, null, null, null, null, null, null],
      ["Maya", 47, 29, 26, 30, 24, null],
    ]);
    expect(dancers).toHaveLength(2);
    expect(skippedRows).toBe(1);
  });

  it("joins a name split across first and last columns", () => {
    const headers = ["First", "Last", "Girth"];
    const { dancers } = readRoster(
      [headers, ["Ella", "Rodriguez", 45]],
      0,
      guessMapping(headers),
    );
    expect(dancers[0].name).toBe("Ella Rodriguez");
  });
});

describe("units", () => {
  it("detects a centimetre sheet from the girth distribution", () => {
    const { detectedUnit } = roster([
      ["A", 114, 68, 61, 71, 58, null],
      ["B", 119, 71, 64, 74, 60, null],
      ["C", 122, 74, 66, 76, 62, null],
    ]);
    expect(detectedUnit).toBe("cm");
  });

  it("treats a normal inch sheet as inches", () => {
    const { detectedUnit } = roster([
      ["A", 45, 27, 24, 28, 23, null],
      ["B", 47, 29, 26, 30, 24, null],
    ]);
    expect(detectedUnit).toBe("in");
  });

  it("converts a centimetre roster to inches", () => {
    const { dancers } = roster([["A", 114.3, 68.58, null, null, null, null]]);
    const [converted] = convertToInches(dancers);
    expect(converted.girth).toBeCloseTo(45, 1);
    expect(converted.bust).toBeCloseTo(27, 1);
  });

  it("does not mistake a large adult roster in inches for centimetres", () => {
    // Adult girths run high; they must still read as inches.
    const { detectedUnit } = roster([
      ["A", 62, 40, 34, 42, 30, null],
      ["B", 65, 42, 36, 44, 31, null],
      ["C", 68, 44, 38, 46, 32, null],
    ]);
    expect(detectedUnit).toBe("in");
  });

  it("defaults to inches when nothing was measured", () => {
    expect(detectUnit([])).toBe("in");
  });
});

describe("parseWorkbook", () => {
  it("reads a UTF-8 CSV without mangling accents or fraction glyphs", () => {
    // SheetJS defaults CSV to the Windows codepage, which turns "Chloé"-style
    // names into mojibake and a measurement of 40 1/2 into "40Â½".
    const csv = `Name,Girth\nChloé Nguyễn,40½\n`;
    const sheets = parseWorkbook(Buffer.from(csv, "utf8"));
    const { dancers } = readRoster(sheets[0].rows, 0, guessMapping(["Name", "Girth"]));

    expect(dancers[0].name).toBe("Chloé Nguyễn");
    expect(dancers[0].girth).toBe(40.5);
  });


  it("round-trips a real xlsx file", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Junior Jazz - Measurements", null, null],
      [null, null, null],
      ["Dancer Name", "Girth", "Waist"],
      ["Ella Rodriguez", 45, 24],
      ["Maya Chen", 47.5, 26],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Roster");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const sheets = parseWorkbook(buf);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe("Roster");

    const headerRow = detectHeaderRow(sheets[0].rows);
    expect(headerRow).toBe(2);

    const headers = sheets[0].rows[headerRow].map((c) => String(c ?? ""));
    const { dancers } = readRoster(sheets[0].rows, headerRow, guessMapping(headers));
    expect(dancers.map((d) => d.name)).toEqual(["Ella Rodriguez", "Maya Chen"]);
    expect(dancers.map((d) => d.girth)).toEqual([45, 47.5]);
  });
});
