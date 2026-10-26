import { NextResponse } from "next/server";
import { fillGrid, fillXlsx, type FillTarget } from "@/lib/export/fillWorkbook";

/**
 * Return the studio's own sheet with the Size column filled in.
 *
 * An .xlsx upload is sent back as the original file plus sizes. A CSV or PDF
 * upload has no workbook to edit, so its grid comes back as a new .xlsx.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const payload = JSON.parse(String(form.get("payload") ?? "{}")) as {
      targets?: FillTarget[];
      sheets?: { name: string; rows: unknown[][] }[];
      fileName?: string;
    };
    const targets = payload.targets ?? [];
    const file = form.get("file");

    const buffer =
      file instanceof File && /\.xlsx$/i.test(file.name)
        ? await fillXlsx(Buffer.from(await file.arrayBuffer()), targets)
        : fillGrid(payload.sheets ?? [], targets);

    const base = (payload.fileName || "costumes").replace(/\.[^.]+$/, "");
    const name = `${base.replace(/[^a-z0-9._ -]+/gi, "-")} - sized.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
