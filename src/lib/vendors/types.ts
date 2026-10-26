/**
 * Vendor adapters scrape catalogue facts only - style number, name, orderable
 * sizes and colours. They deliberately do NOT parse size charts: charts are
 * extracted once into a shared library and referenced, so adding a costume
 * never triggers another extraction.
 */

export interface ScrapedColorway {
  name: string;
  code?: string;
}

export interface ScrapedCostume {
  styleNumber: string;
  name: string;
  productUrl: string;
  /** Codes actually orderable for this costume. Drives chart resolution. */
  availableSizes: string[];
  colorways: ScrapedColorway[];
  /**
   * URL of the chart image this product points at. Used to seed the library the
   * first time a vendor's chart is seen; ignored once that hash is confirmed.
   */
  chartImageUrl?: string;
  /** Secondary signal when size codes alone match more than one chart. */
  categoryHint?: string;
}

/** One entry from a catalogue listing page, before the detail page is fetched. */
export interface CatalogListing {
  productUrl: string;
  name?: string;
  styleNumber?: string;
  priceRange?: string;
  imageUrl?: string;
}

export interface VendorAdapter {
  slug: string;
  /**
   * Walk the vendor's catalogue and yield every product URL. Optional: a vendor
   * with no crawler can still be used through the manual path.
   */
  listCatalog?(options?: { maxPages?: number; delayMs?: number }): Promise<CatalogListing[]>;
  /** Normalise whatever the user typed into a bare style number. */
  parseStyleNumber(input: string): string | null;
  /** Parse an already-fetched page. Pure, so it can be tested against a fixture. */
  parse(html: string, url: string): ScrapedCostume;
  /** Fetch and parse. */
  scrape(url: string): Promise<ScrapedCostume>;
  /**
   * Turn a bare style number into a product URL, for vendors whose URLs cannot
   * be built from the number alone. Null when the vendor has no such product.
   */
  findProductUrl?(style: string): Promise<string | null>;
}

export class VendorScrapeError extends Error {}

export const BROWSER_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

export async function fetchHtml(url: string, slug: string): Promise<string> {
  const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
  if (!res.ok) {
    throw new VendorScrapeError(
      `${slug}: could not fetch ${url} (HTTP ${res.status}). Some vendor sites block plain requests; this costume may need the manual entry path.`,
    );
  }
  return res.text();
}
