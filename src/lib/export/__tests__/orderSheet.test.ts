import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildOrderWorkbook,
  effectiveSize,
  workbookToBuffer,
  type ExportAssignment,
} from "../orderSheet";
import type { Flag } from "../../sizing/types";

const flag = (severity: Flag["severity"], message: string): Flag => ({
  code: "MEASUREMENT_OUT_OF_RANGE",
  severity,
  message,
});

function assignment(over: Partial<ExportAssignment> = {}): ExportAssignment {
  return {
    className: "Tues 5pm Junior Jazz",
    dancerName: "Ella Rodriguez",
    companyName: "Revolution",
    styleNumber: "27776",
    costumeName: "YOU CAN'T STOP THE BEAT",
    colorway: "Purple",
    recommendedSize: "MC",
    rawGirth: 47.5,
    matchedGirth: 47.5,
    rationale: 'Girth 47.5" falls in MC 47-51".',
    flags: [],
    ...over,
  };
}

/** Read one sheet back out of a built workbook as a grid. */
function sheet(wb: XLSX.WorkBook, name: string): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
    header: 1,
    blankrows: true,
    defval: null,
  }) as unknown[][];
}

const cells = (rows: unknown[][]) => rows.map((r) => r.map((c) => (c == null ? "" : String(c))));

describe("order summary", () => {
  it("aggregates by company, style, colour and size", () => {
    const wb = buildOrderWorkbook([
      assignment({ dancerName: "Ella", recommendedSize: "MC", colorway: "Purple" }),
      assignment({ dancerName: "Maya", recommendedSize: "MC", colorway: "Purple" }),
      assignment({ dancerName: "Sofia", recommendedSize: "LC", colorway: "Purple" }),
    ]);
    const rows = cells(sheet(wb, "Order Summary"));

    const mc = rows.find((r) => r[1] === "27776" && r[4] === "MC");
    expect(mc?.[5]).toBe("2");
    expect(mc?.[6]).toBe("Ella, Maya");

    const lc = rows.find((r) => r[1] === "27776" && r[4] === "LC");
    expect(lc?.[5]).toBe("1");
  });

  it("keeps colourways of the same costume as separate order lines", () => {
    // A soloist in a contrasting colour is a different line item to the vendor.
    const wb = buildOrderWorkbook([
      assignment({ dancerName: "Ella", colorway: "Purple" }),
      assignment({ dancerName: "Maya", colorway: "Purple" }),
      assignment({ dancerName: "Sofia", colorway: "Red" }),
    ]);
    const rows = cells(sheet(wb, "Order Summary"));

    expect(rows.find((r) => r[3] === "Purple" && r[4] === "MC")?.[5]).toBe("2");
    expect(rows.find((r) => r[3] === "Red" && r[4] === "MC")?.[5]).toBe("1");
  });

  it("separates companies so each block can be submitted on its own", () => {
    const wb = buildOrderWorkbook([
      assignment({ companyName: "Revolution", styleNumber: "27776" }),
      assignment({
        companyName: "Weissman",
        styleNumber: "10504",
        costumeName: "BIGGER IS BETTER",
        dancerName: "Maya",
        className: "Wed 6pm Senior Tap",
      }),
    ]);
    const rows = cells(sheet(wb, "Order Summary"));
    const companies = rows.slice(1).map((r) => r[0]).filter((c) => c && c !== "TOTAL");
    expect(new Set(companies)).toEqual(new Set(["Revolution", "Weissman"]));
    // A blank spacer row sits between the two company blocks.
    expect(rows.some((r) => r.every((c) => c === ""))).toBe(true);
  });

  it("counts every dancer in the total", () => {
    const wb = buildOrderWorkbook([
      assignment({ dancerName: "A" }),
      assignment({ dancerName: "B", recommendedSize: "LC" }),
      assignment({ dancerName: "C", companyName: "Weissman" }),
    ]);
    const rows = cells(sheet(wb, "Order Summary"));
    expect(rows.find((r) => r[0] === "TOTAL")?.[5]).toBe("3");
  });

  it("orders the overridden size, not the recommended one", () => {
    const wb = buildOrderWorkbook([
      assignment({ recommendedSize: "MC", overrideSize: "LC", overrideReason: "Still growing" }),
    ]);
    const rows = cells(sheet(wb, "Order Summary"));
    expect(rows.some((r) => r[4] === "LC")).toBe(true);
    expect(rows.some((r) => r[4] === "MC")).toBe(false);
  });
});

describe("exceptions sheet", () => {
  it("lists blocking problems before warnings", () => {
    const wb = buildOrderWorkbook([
      assignment({ dancerName: "Warned", flags: [flag("warning", "Hips over range.")] }),
      assignment({
        dancerName: "Blocked",
        flags: [flag("blocking", "Girth exceeds the largest orderable size.")],
      }),
    ]);
    const rows = cells(sheet(wb, "Exceptions"));
    expect(rows[1][0]).toBe("BLOCKING");
    expect(rows[1][1]).toBe("Blocked");
    expect(rows[2][0]).toBe("WARNING");
  });

  it("leaves informational notes off the exceptions list", () => {
    const wb = buildOrderWorkbook([
      assignment({ dancerName: "Fine", flags: [flag("info", "No height on file.")] }),
    ]);
    const rows = cells(sheet(wb, "Exceptions"));
    expect(rows.some((r) => r.includes("Fine"))).toBe(false);
    expect(rows[1].join(" ")).toMatch(/No dancers were flagged/);
  });

  it("says plainly when nothing needs attention", () => {
    const wb = buildOrderWorkbook([assignment()]);
    const rows = cells(sheet(wb, "Exceptions"));
    expect(rows[1].join(" ")).toMatch(/No dancers were flagged/);
  });
});

describe("master roster", () => {
  /** Look columns up by header, so adding a column does not break these tests. */
  function byHeader(rows: string[][], rowIndex: number) {
    const headers = rows[0];
    return (name: string) => rows[rowIndex][headers.indexOf(name)];
  }

  it("records an override with its reason and what it replaced", () => {
    const wb = buildOrderWorkbook([
      assignment({
        recommendedSize: "MC",
        overrideSize: "LC",
        overrideReason: "Mum asked for room to grow",
        rowNumber: 7,
      }),
    ]);
    const rows = cells(sheet(wb, "Master Roster"));
    const col = byHeader(rows, 1);

    expect(col("Recommended")).toBe("MC");
    expect(col("Override")).toBe("LC");
    expect(col("Ordered")).toBe("LC");
    expect(col("Rationale / Override reason")).toMatch(/OVERRIDE: Mum asked for room to grow/);
    expect(col("Rationale / Override reason")).toMatch(/was MC/);
  });

  it("points back at the row the dancer came from in the uploaded sheet", () => {
    const wb = buildOrderWorkbook([assignment({ rowNumber: 12 })]);
    const rows = cells(sheet(wb, "Master Roster"));
    expect(byHeader(rows, 1)("Row")).toBe("12");
  });

  it("leaves the row blank when the assignment did not carry one", () => {
    const wb = buildOrderWorkbook([assignment()]);
    const rows = cells(sheet(wb, "Master Roster"));
    expect(byHeader(rows, 1)("Row")).toBe("");
  });

  it("carries the rationale through when there is no override", () => {
    const wb = buildOrderWorkbook([assignment()]);
    const rows = cells(sheet(wb, "Master Roster"));
    expect(byHeader(rows, 1)("Rationale / Override reason")).toBe(
      'Girth 47.5" falls in MC 47-51".',
    );
  });
});

describe("by class sheet", () => {
  it("groups dancers under their class with size and colour", () => {
    const wb = buildOrderWorkbook([
      assignment({ className: "A Class", dancerName: "Zoe" }),
      assignment({ className: "A Class", dancerName: "Amy" }),
      assignment({ className: "B Class", dancerName: "Beth" }),
    ]);
    const rows = cells(sheet(wb, "By Class"));
    // Alphabetical within a class.
    expect(rows[1][1]).toBe("Amy");
    expect(rows[2][1]).toBe("Zoe");
    expect(rows.some((r) => r[0] === "B Class" && r[1] === "Beth")).toBe(true);
  });
});

describe("workbook", () => {
  it("writes all four sheets to a real xlsx buffer", () => {
    const buf = workbookToBuffer(buildOrderWorkbook([assignment()]));
    expect(buf.length).toBeGreaterThan(0);
    const reread = XLSX.read(buf, { type: "buffer" });
    expect(reread.SheetNames).toEqual([
      "Order Summary",
      "By Class",
      "Master Roster",
      "Exceptions",
    ]);
  });

  it("handles an empty season without throwing", () => {
    const rows = cells(sheet(buildOrderWorkbook([]), "Order Summary"));
    expect(rows.find((r) => r[0] === "TOTAL")?.[5]).toBe("0");
  });
});

describe("effectiveSize", () => {
  it("prefers an override", () => {
    expect(effectiveSize(assignment({ recommendedSize: "MC", overrideSize: "LC" }))).toBe("LC");
  });

  it("ignores a blank override", () => {
    expect(effectiveSize(assignment({ recommendedSize: "MC", overrideSize: "  " }))).toBe("MC");
  });
});
