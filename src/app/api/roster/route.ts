import { NextResponse } from "next/server";
import { detectHeaderRow, guessMapping } from "@/lib/import/headers";
import { parseWorkbook, readRoster } from "@/lib/import/parse";

/**
 * Accept a studio's class roster and hand back everything the mapping screen
 * needs, in one round trip: the raw grid, the header row we found, the guessed
 * column mapping, and the dancers that mapping produces.
 *
 * The grid comes back with the response so that changing the mapping afterwards
 * is a pure re-derivation and never asks the user to upload the file again.
 */

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No spreadsheet was uploaded." }, { status: 400 });
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

    const sheets = parseWorkbook(Buffer.from(await file.arrayBuffer()));
    if (sheets.length === 0) {
      return NextResponse.json({ error: "That workbook has no sheets." }, { status: 400 });
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

    // Default to whichever sheet yielded the most dancers - studios often keep
    // notes or a summary tab alongside the roster.
    const bestIndex = parsed.reduce(
      (best, s, i) => (s.dancers.length > parsed[best].dancers.length ? i : best),
      0,
    );

    return NextResponse.json({
      fileName: file.name,
      sheets: parsed,
      selectedSheet: bestIndex,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Could not read that file: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 400 },
    );
  }
}
