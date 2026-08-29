import { NextResponse } from "next/server";
import { convertToInches, readRoster } from "@/lib/import/parse";
import type { HeaderGuess } from "@/lib/import/headers";

/**
 * Re-derive dancers after the user corrects the column mapping or opts into a
 * unit conversion. Operates on the grid already returned by /api/roster, so the
 * file is uploaded only once.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      rows: unknown[][];
      headerRow: number;
      mapping: HeaderGuess[];
      convertToInches?: boolean;
    };

    if (!Array.isArray(body.rows)) {
      return NextResponse.json({ error: "No sheet data supplied." }, { status: 400 });
    }

    const result = readRoster(body.rows, body.headerRow ?? 0, body.mapping ?? []);

    return NextResponse.json(
      body.convertToInches
        ? { ...result, dancers: convertToInches(result.dancers), converted: true }
        : { ...result, converted: false },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
