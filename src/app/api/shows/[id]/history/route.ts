import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { classHistory } from "@/lib/shows/store";

/** A class's override history and edits since upload: `?sheet=<tab name>`. */
export async function GET(req: Request, ctx: RouteContext<"/api/shows/[id]/history">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to see history." }, { status: 401 });
  const { id } = await ctx.params;
  const sheet = new URL(req.url).searchParams.get("sheet") ?? "";
  const history = await classHistory(id, sheet);
  if (!history) return NextResponse.json({ error: "No such class." }, { status: 404 });
  return NextResponse.json(history);
}
