import { NextResponse } from "next/server";
import { revolutionAdapter } from "@/lib/vendors/revolution";
import { awishcometrueAdapter } from "@/lib/vendors/awishcometrue";
import { weissmanAdapter, weissmanProductUrl } from "@/lib/vendors/weissman";
import { laylasAdapter } from "@/lib/vendors/laylas";
import { buildManualCostume } from "@/lib/vendors/manual";
import { VendorScrapeError, type ScrapedCostume } from "@/lib/vendors/types";
import { listCatalogs, listSeasons } from "@/lib/catalog/store";
import { loadLibrary, toCandidate } from "@/lib/charts/library";
import { resolveChart } from "@/lib/charts/resolve";
import type { CatalogProduct } from "@/lib/catalog/types";

/**
 * Find one costume from whatever the user typed - a style number or a product
 * URL - and work out which size chart applies to it.
 *
 * The crawled catalogue is consulted first, so a style number resolves instantly
 * and without contacting the vendor. Live scraping is the fallback for a costume
 * that predates the last crawl or belongs to a vendor with no crawler.
 */

const ADAPTERS = {
  revolution: revolutionAdapter,
  awishcometrue: awishcometrueAdapter,
  weissman: weissmanAdapter,
  laylas: laylasAdapter,
};

/**
 * Vendors where a bare style number can be turned into a product URL directly,
 * so no crawled catalogue is needed to look a costume up.
 */
const STYLE_URL_BUILDERS: Record<string, (style: string) => string> = {
  weissman: weissmanProductUrl,
};

function toScraped(p: CatalogProduct): ScrapedCostume {
  return {
    styleNumber: p.styleNumber,
    name: p.name,
    productUrl: p.productUrl,
    availableSizes: p.availableSizes,
    colorways: p.colorways,
    ...(p.chartImageUrl ? { chartImageUrl: p.chartImageUrl } : {}),
    ...(p.categoryHint ? { categoryHint: p.categoryHint } : {}),
  };
}

/** Search every crawled company for a style number or product URL. */
function findInCatalog(
  input: string,
  season: string | undefined,
): { product: CatalogProduct; companySlug: string; companyName: string } | null {
  const target = season ?? listSeasons()[0];
  if (!target) return null;

  const needle = input.trim().toLowerCase();
  const isUrl = /^https?:\/\//.test(needle);

  for (const catalog of listCatalogs(target)) {
    for (const product of catalog.products) {
      const matches = isUrl
        ? product.productUrl.trim().toLowerCase() === needle
        : product.styleNumber.trim().toLowerCase() === needle;
      if (matches) {
        return {
          product,
          companySlug: catalog.companySlug,
          companyName: catalog.companyName,
        };
      }
    }
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    let costume: ScrapedCostume;
    let companySlug: string = body.companySlug ?? "revolution";
    let source: "catalog" | "scraped" | "manual";

    if (body.mode === "manual") {
      costume = buildManualCostume(body);
      source = "manual";
    } else {
      const input = String(body.input ?? "").trim();
      if (!input) {
        return NextResponse.json(
          { error: "Enter a style number or a product page URL." },
          { status: 400 },
        );
      }

      const hit = findInCatalog(input, body.season);
      if (hit) {
        costume = toScraped(hit.product);
        companySlug = hit.companySlug;
        source = "catalog";
      } else if (/^https?:\/\//.test(input)) {
        // Not crawled yet, but we have the page - fetch it directly.
        const adapter = ADAPTERS[companySlug as keyof typeof ADAPTERS];
        if (!adapter) {
          return NextResponse.json(
            {
              error: `${companySlug} has no scraper, and that URL is not in the crawled catalogue. Enter the costume by hand.`,
              suggestManual: true,
            },
            { status: 400 },
          );
        }
        costume = await adapter.scrape(input);
        source = "scraped";
      } else {
        // Some vendors serve a product straight off its style number, which
        // makes a catalogue unnecessary for lookup.
        const buildUrl = STYLE_URL_BUILDERS[companySlug];
        const adapter = ADAPTERS[companySlug as keyof typeof ADAPTERS];
        if (!buildUrl || !adapter) {
          return NextResponse.json(
            {
              error: `Style number ${JSON.stringify(input)} is not in the crawled catalogue. Paste the product page URL instead, or enter the costume by hand.`,
              suggestManual: true,
            },
            { status: 404 },
          );
        }
        const style = adapter.parseStyleNumber(input) ?? input;
        costume = await adapter.scrape(buildUrl(style));
        source = "scraped";
      }
    }

    // The chart image the product page links to settles which chart applies;
    // size codes are only a fallback, because some vendors' charts share a
    // vocabulary and cannot be told apart by codes alone.
    const library = loadLibrary().filter(
      (c) => c.status === "confirmed" && c.companySlug === companySlug,
    );
    const resolution = resolveChart(
      costume.availableSizes,
      library.map(toCandidate),
      costume.categoryHint,
      costume.chartImageUrl,
    );

    return NextResponse.json({ costume, resolution, companySlug, source });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: message,
        suggestManual:
          err instanceof VendorScrapeError || /fetch|TLS|certificate|403/i.test(message),
      },
      { status: 400 },
    );
  }
}
