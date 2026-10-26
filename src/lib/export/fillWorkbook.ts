import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

/**
 * Write each dancer's size back into the studio's own sheet, in the Size
 * column they left blank for it.
 *
 * For an uploaded .xlsx the original file is edited in place with exceljs,
 * which keeps the studio's colours, borders and column widths - SheetJS's free
 * build drops styling on write. For a CSV or PDF there is no workbook to edit,
 * so a new one is built from the grid that was read, one tab per class.
 */

export interface FillTarget {
  sheetName: string;
  /** Row of the table header within the grid (0-based). */
  headerRow: number;
  /** Column of the Size cell within the grid (0-based); null appends one. */
  sizeColumn: number | null;
  /** Number of header cells, used when a Size column has to be appended. */
  headerCount: number;
  /** rowNumber is 1-based within the grid, as ImportedDancer.rowNumber is. */
  sizes: { rowNumber: number; value: string }[];
}

export async function fillXlsx(bytes: Buffer, targets: FillTarget[]): Promise<Buffer> {
  // The grid the dancers were read from starts at the sheet's used range, which
  // is not always A1, so find where each sheet's range begins.
  const origins = new Map<string, { r: number; c: number }>();
  const sheetjs = XLSX.read(bytes, { type: "buffer" });
  for (const name of sheetjs.SheetNames) {
    const ref = sheetjs.Sheets[name]["!ref"];
    origins.set(name, ref ? XLSX.utils.decode_range(ref).s : { r: 0, c: 0 });
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);

  for (const target of targets) {
    const ws = wb.getWorksheet(target.sheetName);
    const origin = origins.get(target.sheetName);
    if (!ws || !origin) continue;

    let col = target.sizeColumn;
    if (col === null) {
      col = target.headerCount;
      ws.getCell(origin.r + target.headerRow + 1, origin.c + col + 1).value = "Size";
    }
    for (const { rowNumber, value } of target.sizes) {
      // rowNumber is 1-based in the grid; ExcelJS rows and columns are 1-based.
      ws.getCell(origin.r + rowNumber, origin.c + col + 1).value = value;
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Build a fresh workbook from grids read out of a CSV or PDF. */
export function fillGrid(
  sheets: { name: string; rows: unknown[][] }[],
  targets: FillTarget[],
): Buffer {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  for (const target of targets) {
    const sheet = sheets.find((s) => s.name === target.sheetName);
    if (!sheet) continue;
    const rows = sheet.rows.map((r) => [...(r ?? [])]);

    let col = target.sizeColumn;
    if (col === null) {
      col = target.headerCount;
      (rows[target.headerRow] ??= [])[col] = "Size";
    }
    for (const { rowNumber, value } of target.sizes) {
      (rows[rowNumber - 1] ??= [])[col] = value;
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(target.sheetName, used));
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Excel sheet names: 31 characters, no []:*?/\ and unique. */
function uniqueSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31).trim() || "Sheet";
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}
