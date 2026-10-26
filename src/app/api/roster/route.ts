import { NextResponse } from "next/server";
import { parseWorkbook, type ParsedSheet } from "@/lib/import/parse";
import { parsePdf, PdfReadError } from "@/lib/import/pdf";
import { readCostumeWorkbook } from "@/lib/import/workbook";

/**
 * Accept a studio's roster - a spreadsheet, a CSV, or a PDF saved from one -
 * and hand back every tab read as a class: its dancers, the costume written on
 * it, and anything on the sheet that needs a second look.
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

    return NextResponse.json({
      fileName: file.name,
      fileKind: pdf ? "pdf" : /\.csv$/i.test(file.name) ? "csv" : "xlsx",
      classes: readCostumeWorkbook(sheets),
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
