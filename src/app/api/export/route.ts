import {
  buildOrderWorkbook,
  workbookToBuffer,
  type ExportAssignment,
} from "@/lib/export/orderSheet";

/** Build the order workbook and send it back as a download. */
export async function POST(req: Request) {
  const { assignments, fileName } = (await req.json()) as {
    assignments: ExportAssignment[];
    fileName?: string;
  };

  const buffer = workbookToBuffer(buildOrderWorkbook(assignments ?? []));
  const name = (fileName ?? "costume-order").replace(/[^a-z0-9._-]+/gi, "-");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}.xlsx"`,
    },
  });
}
