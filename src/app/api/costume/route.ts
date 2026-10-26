import { NextResponse } from "next/server";
import {
  CostumeLookupError,
  lookupCostume,
  manualCostume,
  suggestsManual,
} from "@/lib/costume/lookup";

/**
 * Find one costume from whatever the user typed - a style number or a product
 * URL - and work out which size chart applies to it. See lib/costume/lookup.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const companySlug: string = body.companySlug ?? "revolution";

    const result =
      body.mode === "manual"
        ? manualCostume(body, companySlug)
        : await lookupCostume({
            input: String(body.input ?? ""),
            companySlug,
            season: body.season,
          });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        suggestManual: suggestsManual(err),
      },
      { status: err instanceof CostumeLookupError ? err.status : 400 },
    );
  }
}
