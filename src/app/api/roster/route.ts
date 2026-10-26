import { NextResponse } from "next/server";
import { detectHeaderRow, guessMapping } from "@/lib/import/headers";
import { parseWorkbook, readRoster, type ParsedSheet } from "@/lib/import/parse";
import { parsePdf, PdfReadError } from "@/lib/import/pdf";
import { isCostumeWorkbook, readCostumeWorkbook } from "@/lib/import/workbook";

/**
 * Accept a studio's roster - a spreadsheet, a CSV, or a PDF saved from one -
 * and hand back everything the next screen needs in one round trip: the raw
 * grid, the header row we found, the guessed column mapping, the dancers that
 * mapping produces, and (for a workbook with a tab per class) each class with
 * the costume written on it.
 *
 * The grid comes back with the response so that changing the mapping afterwards
 * is a pure re-derivation and never asks the user to upload the file again.
 */

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const isPdf = (file: File, bytes: Buffer) =>
  /\.pdf$/i.test(file.name) || bytes.subarray(0, 5).toString("latin1") === "%PDF-";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "That file is empty." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB; the limit is 10MB.` },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const pdf = isPdf(file, bytes);
    const sheets: ParsedSheet[] = pdf ? await parsePdf(bytes) : parseWorkbook(bytes);
    if (sheets.length === 0) {
      return NextResponse.json({ error: "That file has no sheets." }, { status: 400 });
    }

    const parsed = sheets.map((sheet) => {
      const headerRow = detectHeaderRow(sheet.rows);
      const headers = (sheet.rows[headerRow] ?? []).map((c) => String(c ?? ""));
      const mapping = guessMapping(headers);
      const roster = readRoster(sheet.rows, headerRow, mapping);
      return {
        name: sheet.name,
        rows: sheet.rows,
        headerRow,
        headers,
        mapping,
        ...roster,
      };
    });

    const classes = readCostumeWorkbook(sheets);

    // Default to whichever sheet yielded the most dancers - studios often keep
    // notes or a summary tab alongside the roster.
    const bestIndex = parsed.reduce(
      (best, s, i) => (s.dancers.length > parsed[best].dancers.length ? i : best),
      0,
    );

    return NextResponse.json({
      fileName: file.name,
      fileKind: pdf ? "pdf" : /\.csv$/i.test(file.name) ? "csv" : "xlsx",
      sheets: parsed,
      selectedSheet: bestIndex,
      classes,
      workbook: isCostumeWorkbook(classes),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof PdfReadError
            ? err.message
            : `Could not read that file: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 400 },
    );
  }
}
