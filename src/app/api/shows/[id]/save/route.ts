import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { saveClasses } from "@/lib/shows/store";
import type { OverrideEventInput, SavedClassPayload } from "@/lib/shows/types";

/** Save changed classes of a show, plus any override changes as history. */
export async function POST(req: Request, ctx: RouteContext<"/api/shows/[id]/save">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to save shows." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as {
      classes?: SavedClassPayload[];
      overrideEvents?: OverrideEventInput[];
    };
    const ok = await saveClasses(user, id, body.classes ?? [], body.overrideEvents ?? []);
    if (!ok) return NextResponse.json({ error: "That show no longer exists." }, { status: 404 });
    return NextResponse.json({ savedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not save: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
