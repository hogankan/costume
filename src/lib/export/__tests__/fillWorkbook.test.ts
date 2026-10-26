import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { fillGrid, fillXlsx } from "../fillWorkbook";

async function styledWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Jazz");
  ws.addRow(["Jazz class"]);
  ws.addRow(["#", "Name", "Size", "Girth"]);
  ws.addRow([1, "Ella", null, 45]);
  ws.addRow([2, "Mia", null, 50]);
  ws.getCell("B4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } };
  ws.getColumn(2).width = 22;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("fillXlsx", () => {
  it("writes each size into the Size column on the dancer's own row", async () => {
    const out = await fillXlsx(await styledWorkbook(), [
      {
        sheetName: "Jazz",
        headerRow: 1,
        sizeColumn: 2,
        headerCount: 4,
        sizes: [
          { rowNumber: 3, value: "MC" },
          { rowNumber: 4, value: "LC (16179G)" },
        ],
      },
    ]);

    const rows = XLSX.utils.sheet_to_json<unknown[]>(XLSX.read(out).Sheets.Jazz, { header: 1 });
    expect(rows[2]).toEqual([1, "Ella", "MC", 45]);
    expect(rows[3]).toEqual([2, "Mia", "LC (16179G)", 50]);
  });

  it("keeps the studio's formatting", async () => {
    const out = await fillXlsx(await styledWorkbook(), [
      { sheetName: "Jazz", headerRow: 1, sizeColumn: 2, headerCount: 4, sizes: [{ rowNumber: 4, value: "LC" }] },
    ]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Jazz")!;
    expect((ws.getCell("B4").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFFCE4D6");
    expect(ws.getColumn(2).width).toBe(22);
  });

  it("adds a Size column when the sheet has none", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Tap");
    ws.addRow(["Name", "Girth"]);
    ws.addRow(["Ella", 45]);
    const out = await fillXlsx(Buffer.from(await wb.xlsx.writeBuffer()), [
      { sheetName: "Tap", headerRow: 0, sizeColumn: null, headerCount: 2, sizes: [{ rowNumber: 2, value: "MC" }] },
    ]);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(XLSX.read(out).Sheets.Tap, { header: 1 });
    expect(rows).toEqual([
      ["Name", "Girth", "Size"],
      ["Ella", 45, "MC"],
    ]);
  });
});

describe("fillGrid", () => {
  it("rebuilds a CSV or PDF grid as a workbook with sizes filled in", () => {
    const out = fillGrid(
      [{ name: "Page 2", rows: [["Ballet"], ["Name", "Size", "Girth"], ["Ella", null, "45"]] }],
      [{ sheetName: "Page 2", headerRow: 1, sizeColumn: 1, headerCount: 3, sizes: [{ rowNumber: 3, value: "MC" }] }],
    );
    const book = XLSX.read(out);
    expect(book.SheetNames).toEqual(["Page 2"]);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets["Page 2"], { header: 1 });
    expect(rows[2]).toEqual(["Ella", "MC", "45"]);
  });
});
