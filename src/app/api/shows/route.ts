import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createShow } from "@/lib/shows/store";
import type { SavedClassPayload } from "@/lib/shows/types";

/** Save an upload as a new show. Signed-in users only. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to save shows." }, { status: 401 });
  try {
    const body = (await req.json()) as {
      name?: string;
      sourceFileName?: string;
      sourceFileKind?: string;
      classes?: SavedClassPayload[];
    };
    if (!Array.isArray(body.classes) || body.classes.length === 0) {
      return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    }
    const id = await createShow(user, {
      name: String(body.name ?? ""),
      sourceFileName: String(body.sourceFileName ?? "upload"),
      sourceFileKind: String(body.sourceFileKind ?? "xlsx"),
      classes: body.classes,
    });
    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not save: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
