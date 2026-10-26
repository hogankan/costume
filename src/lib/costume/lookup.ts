import { revolutionAdapter } from "../vendors/revolution";
import { awishcometrueAdapter } from "../vendors/awishcometrue";
import { weissmanAdapter, weissmanProductUrl } from "../vendors/weissman";
import { laylasAdapter } from "../vendors/laylas";
import { VendorScrapeError, type ScrapedCostume, type VendorAdapter } from "../vendors/types";
import { listCatalogs, listSeasons } from "../catalog/store";
import { loadLibrary, toCandidate } from "../charts/library";
import { resolveChart, type ChartResolution } from "../charts/resolve";
import type { CatalogProduct } from "../catalog/types";

/**
 * Find one costume from a style number or product URL, and work out which size
 * chart applies to it.
 *
 * The crawled catalogue is consulted first, so a style number resolves instantly
 * and without contacting the vendor. Live scraping is the fallback for a costume
 * that predates the last crawl or belongs to a vendor with no crawler.
 */

export const ADAPTERS: Record<string, VendorAdapter> = {
  revolution: revolutionAdapter,
  awishcometrue: awishcometrueAdapter,
  weissman: weissmanAdapter,
  laylas: laylasAdapter,
};

/** Display names, used on the order sheet which groups by company. */
export const COMPANY_NAMES: Record<string, string> = {
  revolution: "Revolution",
  weissman: "Weissman",
  awishcometrue: "A Wish Come True",
  laylas: "Layla's",
};

/**
 * Vendors where a bare style number can be turned into a product URL directly,
 * so no crawled catalogue is needed to look a costume up.
 */
const STYLE_URL_BUILDERS: Record<string, (style: string) => string> = {
  weissman: weissmanProductUrl,
};

export type CostumeSource = "catalog" | "scraped";

export interface LookupResult {
  costume: ScrapedCostume;
  resolution: ChartResolution;
  companySlug: string;
  source: CostumeSource;
}

/** A lookup that failed in a way the user can act on. */
export class CostumeLookupError extends Error {
  constructor(
    message: string,
    readonly suggestManual: boolean,
    readonly status = 400,
  ) {
    super(message);
  }
}

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

/** Search the crawled catalogues for a style number or product URL. */
function findInCatalog(
  input: string,
  season: string | undefined,
  companySlug?: string,
): { product: CatalogProduct; companySlug: string; companyName: string } | null {
  const target = season ?? listSeasons()[0];
  if (!target) return null;

  const needle = input.trim().toLowerCase();
  const isUrl = /^https?:\/\//.test(needle);

  for (const catalog of listCatalogs(target)) {
    if (companySlug && !isUrl && catalog.companySlug !== companySlug) continue;
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

export async function lookupCostume(opts: {
  input: string;
  companySlug: string;
  season?: string;
  /**
   * Only search this company's catalogue. Set when the company is known for
   * certain (it was written on the sheet), so a style number shared by two
   * vendors cannot resolve to the wrong one.
   */
  strictCompany?: boolean;
}): Promise<LookupResult> {
  const input = opts.input.trim();
  let companySlug = opts.companySlug;
  if (!input) {
    throw new CostumeLookupError("Enter a style number or a product page URL.", false);
  }

  let costume: ScrapedCostume;
  let source: CostumeSource;

  const hit = findInCatalog(input, opts.season, opts.strictCompany ? companySlug : undefined);
  const adapter = ADAPTERS[companySlug];

  if (hit) {
    costume = toScraped(hit.product);
    companySlug = hit.companySlug;
    source = "catalog";
  } else if (/^https?:\/\//.test(input)) {
    // Not crawled yet, but we have the page - fetch it directly.
    if (!adapter) {
      throw new CostumeLookupError(
        `${companySlug} has no scraper, and that URL is not in the crawled catalogue. Enter the costume by hand.`,
        true,
      );
    }
    costume = await adapter.scrape(input);
    source = "scraped";
  } else {
    const style = adapter?.parseStyleNumber(input) ?? input;
    const buildUrl = STYLE_URL_BUILDERS[companySlug];
    let url: string | null = buildUrl ? buildUrl(style) : null;
    // Some vendors need their own site search to turn a number into a page.
    if (!url && adapter?.findProductUrl) url = await adapter.findProductUrl(style);

    if (!url || !adapter) {
      throw new CostumeLookupError(
        `Style number ${JSON.stringify(input)} could not be found for ${COMPANY_NAMES[companySlug] ?? companySlug}. Paste the product page URL instead, or enter the costume by hand.`,
        true,
        404,
      );
    }
    costume = await adapter.scrape(url);
    source = "scraped";
  }

  return { costume, resolution: resolveFor(costume, companySlug), companySlug, source };
}

/**
 * The chart image the product page links to settles which chart applies; size
 * codes are only a fallback, because some vendors' charts share a vocabulary
 * and cannot be told apart by codes alone.
 */
function resolveFor(costume: ScrapedCostume, companySlug: string): ChartResolution {
  const library = loadLibrary().filter(
    (c) => c.status === "confirmed" && c.companySlug === companySlug,
  );
  return resolveChart(
    costume.availableSizes,
    library.map(toCandidate),
    costume.categoryHint,
    costume.chartImageUrl,
  );
}

/** Whether a failed lookup is worth retrying with a pasted product URL. */
export function suggestsManual(err: unknown): boolean {
  if (err instanceof CostumeLookupError) return err.suggestManual;
  const message = err instanceof Error ? err.message : String(err);
  return err instanceof VendorScrapeError || /fetch|TLS|certificate|403/i.test(message);
}
