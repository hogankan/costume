import type { ScrapedColorway } from "../vendors/types";

/**
 * The season catalogue.
 *
 * Costume ranges are fixed for a season, and a product page's size list is the
 * range the costume is *made* in rather than what happens to be in stock (stock
 * sits behind a login and is not needed for sizing). So the catalogue is crawled
 * once per season and read from disk thereafter - no vendor is hit again just
 * because someone opened a class.
 */

export interface CatalogProduct {
  styleNumber: string;
  name: string;
  productUrl: string;
  /** The size range the costume is made in. */
  availableSizes: string[];
  colorways: ScrapedColorway[];
  /** Chart image this product points at, used to seed the chart library. */
  chartImageUrl?: string;
  /** Free-text price range as shown on the listing, e.g. "$49.95 - $59.95". */
  priceRange?: string;
  /** Product thumbnail, for browsing inside the app. */
  imageUrl?: string;
  categoryHint?: string;
}

export interface CompanyCatalog {
  season: string;
  companySlug: string;
  companyName: string;
  sourceUrl: string;
  crawledAt: string;
  /** Pages walked, so a partial crawl is obvious rather than silent. */
  pagesCrawled: number;
  /** Products the crawler saw but could not parse, with the reason. */
  failures: { url: string; reason: string }[];
  products: CatalogProduct[];
}

export interface CatalogSummary {
  season: string;
  companySlug: string;
  companyName: string;
  crawledAt: string;
  productCount: number;
  failureCount: number;
}
