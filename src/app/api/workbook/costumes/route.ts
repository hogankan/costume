import { NextResponse } from "next/server";
import { lookupCostume, suggestsManual, type LookupResult } from "@/lib/costume/lookup";

/**
 * Look up every costume named across a workbook in one go.
 *
 * The same style is often worn by more than one class, so each distinct style
 * is fetched once. Lookups run one after another rather than all at once, to
 * stay polite to vendor sites.
 */

interface Item {
  companySlug: string;
  style: string;
}

export type CostumeLookupOutcome =
  | ({ ok: true } & LookupResult)
  | { ok: false; error: string; suggestManual: boolean };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { items?: Item[]; season?: string };
    const items = Array.isArray(body.items) ? body.items : [];
    const results: Record<string, CostumeLookupOutcome> = {};

    for (const item of items) {
      const key = `${item.companySlug}:${item.style}`;
      if (results[key]) continue;
      try {
        const found = await lookupCostume({
          input: item.style,
          companySlug: item.companySlug,
          season: body.season,
          strictCompany: true,
        });
        results[key] = { ok: true, ...found };
      } catch (err) {
        results[key] = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          suggestManual: suggestsManual(err),
        };
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
