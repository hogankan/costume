import {
  VendorScrapeError,
  type ScrapedColorway,
  type ScrapedCostume,
  type VendorAdapter,
} from "./types";

/**
 * The escape hatch.
 *
 * Two of the four target vendors cannot be scraped from Node: A Wish Come True's
 * server sends an incomplete TLS certificate chain (browsers and curl accept it,
 * Node rejects it with UNABLE_TO_VERIFY_LEAF_SIGNATURE), and Layla's returns 403
 * to Node's fetch while accepting the identical request from curl, so it is
 * fingerprinting more than the user-agent string.
 *
 * Rather than let either of those block an order, a costume can be entered by
 * hand. This also covers the case that matters most in practice: a vendor
 * redesigns their site mid-season and every scraper breaks at once. The studio
 * types in what they can already see on the page and carries on.
 */

const SLUG = "manual";

export interface ManualCostumeInput {
  styleNumber: string;
  name: string;
  productUrl?: string;
  /** Comma, space or newline separated - studios paste this straight off the page. */
  sizes: string;
  colors?: string;
  chartImageUrl?: string;
  categoryHint?: string;
}

/** Split a pasted list on commas, newlines, slashes or runs of whitespace. */
export function splitList(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[,\n\r/|]+/)
        .flatMap((part) => part.split(/\s{2,}/))
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  );
}

export function buildManualCostume(input: ManualCostumeInput): ScrapedCostume {
  const styleNumber = input.styleNumber.trim();
  if (!styleNumber) {
    throw new VendorScrapeError("A style number is required to order a costume.");
  }
  const name = input.name.trim();
  if (!name) {
    throw new VendorScrapeError("A costume name is required.");
  }

  const availableSizes = splitList(input.sizes).map((s) => s.toUpperCase());
  if (availableSizes.length === 0) {
    throw new VendorScrapeError(
      "At least one orderable size is required; sizes are what identify the right chart.",
    );
  }

  const colorways: ScrapedColorway[] = splitList(input.colors ?? "").map((name) => ({ name }));

  return {
    styleNumber,
    name,
    productUrl: input.productUrl?.trim() || "",
    availableSizes,
    colorways,
    ...(input.chartImageUrl?.trim() ? { chartImageUrl: input.chartImageUrl.trim() } : {}),
    ...(input.categoryHint?.trim() ? { categoryHint: input.categoryHint.trim() } : {}),
  };
}

/**
 * Present the manual path through the same interface as the scrapers, so callers
 * do not branch on how a costume was obtained.
 */
export const manualAdapter: VendorAdapter = {
  slug: SLUG,

  parseStyleNumber(input: string): string | null {
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : null;
  },

  parse(): ScrapedCostume {
    throw new VendorScrapeError(
      "Manual costumes are entered with buildManualCostume(), not parsed from a page.",
    );
  },

  async scrape(): Promise<ScrapedCostume> {
    throw new VendorScrapeError(
      "Manual costumes are entered with buildManualCostume(), not scraped.",
    );
  },
};
