import * as cheerio from "cheerio";
import {
  fetchHtml,
  VendorScrapeError,
  type CatalogListing,
  type ScrapedColorway,
  type ScrapedCostume,
  type VendorAdapter,
} from "./types";

/**
 * Revolution Dancewear (revolutiondance.com).
 *
 * A BigCommerce Stencil store. Product options are rendered as attribute groups
 * labelled by `data-product-attribute-label`, which gives a stable hook for both
 * sizes ("set-rectangle") and colours ("swatch") without depending on class
 * names that a theme update would churn.
 */

const SLUG = "revolution";
const BASE = "https://www.revolutiondance.com";

/**
 * `<title> 27776 | YOU CAN'T STOP THE BEAT </title>`
 *
 * Style numbers are usually bare digits, but Revolution also ships lettered
 * ranges such as `RC26984`, so the prefix is optional rather than assumed away.
 * Older styles can be as short as two digits ("37 | I Enjoy Being A Girl"), so
 * the digit run is not assumed to be four or more either.
 */
const TITLE_PATTERN = /^\s*([A-Z]{0,4}\d{1,6})\s*\|\s*(.+?)\s*$/;

/** Revolution's own brand within the store's faceted navigation. */
const BRAND_ID = 39;
const CATALOG_URL = `${BASE}/dance-costumes/?_bc_fsnf=1&brand=${BRAND_ID}`;

export const revolutionAdapter: VendorAdapter = {
  slug: SLUG,

  /**
   * Walk the catalogue listing pages.
   *
   * Pagination is a plain `?page=N`; a page past the end still renders the site
   * chrome but contains no product cards, which is the stop condition. Requests
   * are spaced out deliberately - this runs once a season, so there is no reason
   * to hammer their servers.
   */
  async listCatalog({ maxPages = 40, delayMs = 400 } = {}): Promise<CatalogListing[]> {
    const seen = new Map<string, CatalogListing>();

    for (let page = 1; page <= maxPages; page++) {
      const html = await fetchHtml(`${CATALOG_URL}&page=${page}`, SLUG);
      const listings = parseCatalogPage(html);
      if (listings.length === 0) break;

      let added = 0;
      for (const l of listings) {
        if (!seen.has(l.productUrl)) {
          seen.set(l.productUrl, l);
          added++;
        }
      }
      // A page that repeats the previous one means pagination has stopped
      // advancing; stop rather than looping to maxPages.
      if (added === 0) break;

      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }

    return [...seen.values()];
  },

  parseStyleNumber(input: string): string | null {
    const trimmed = input.trim();
    // Accept a bare style number, with or without a letter prefix, or pull one
    // out of a pasted URL or page title.
    const direct = /^[A-Za-z]{0,4}\d{4,6}$/.exec(trimmed);
    if (direct) return direct[0].toUpperCase();
    const embedded = /\b([A-Za-z]{0,4}\d{4,6})\b/.exec(trimmed);
    return embedded ? embedded[1].toUpperCase() : null;
  },

  parse(html: string, url: string): ScrapedCostume {
    const $ = cheerio.load(html);

    const title = $("title").first().text();
    const matched = TITLE_PATTERN.exec(title);
    if (!matched) {
      throw new VendorScrapeError(
        `${SLUG}: could not read a style number and name from the page title (${JSON.stringify(title.trim())}). The site layout may have changed.`,
      );
    }
    const [, styleNumber, name] = matched;

    const availableSizes = optionValues($, "size");
    if (availableSizes.length === 0) {
      throw new VendorScrapeError(
        `${SLUG}: no size options found on ${url}. The site layout may have changed, or this product may be sold out of every size.`,
      );
    }

    const colorways: ScrapedColorway[] = $(
      '[data-product-attribute-label="color"] .form-option-variant--color',
    )
      .map((_, el) => {
        const $el = $(el);
        const label = ($el.attr("title") ?? $el.text()).trim();
        const code = $el.closest("label").attr("data-product-attribute-value");
        return label ? { name: label, ...(code ? { code } : {}) } : null;
      })
      .get()
      .filter((c): c is ScrapedColorway => c !== null);

    const chartImageUrl = $("#sizeChartModal img").first().attr("src")?.trim();

    return {
      styleNumber,
      name: name.trim(),
      productUrl: url,
      availableSizes,
      colorways: dedupeByName(colorways),
      ...(chartImageUrl ? { chartImageUrl } : {}),
    };
  },

  async scrape(url: string): Promise<ScrapedCostume> {
    return this.parse(await fetchHtml(url, SLUG), url);
  },
};

/**
 * Read the values of one BigCommerce attribute group. Scoping to the group's
 * label avoids picking up colour swatches or the ship-date field.
 */
function optionValues($: cheerio.CheerioAPI, label: string): string[] {
  const values = $(`[data-product-attribute-label="${label}"] .form-option-variant`)
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((v) => v.length > 0);
  return Array.from(new Set(values));
}

function dedupeByName(colorways: ScrapedColorway[]): ScrapedColorway[] {
  const seen = new Set<string>();
  return colorways.filter((c) => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Revolution product URLs are slugs, so a style number alone needs a lookup. */
export function revolutionSearchUrl(styleNumber: string): string {
  return `${BASE}/search.php?search_query=${encodeURIComponent(styleNumber)}`;
}

/** Extract the product cards from one catalogue listing page. */
export function parseCatalogPage(html: string): CatalogListing[] {
  const $ = cheerio.load(html);
  const out: CatalogListing[] = [];

  $("article.card").each((_, el) => {
    const $card = $(el);
    const link = $card.find("a.card-figure__link").first();
    const productUrl = link.attr("href")?.trim();
    if (!productUrl) return;

    // aria-label reads "NAME,Price range from $49.95 to $59.95".
    const aria = link.attr("aria-label") ?? "";
    const [namePart, pricePart] = aria.split(/,(?=\s*Price)/);
    const price = /from\s+(\$[\d.,]+)\s+to\s+(\$[\d.,]+)/.exec(pricePart ?? "");
    const single = /(\$[\d.,]+)/.exec(pricePart ?? "");

    const imageUrl = $card.find("img").first().attr("src")?.trim();
    // Most image filenames lead with the style number - 27776_all_1_w__*.jpg, or
    // RC26991_black_1_w__*.jpg for the RC range. Some are opaque hashes with no
    // style number at all, which is fine: this is only a convenience for the
    // listing view. The product page's title is the authoritative source.
    const styleFromImage = /\/([A-Z]{0,3}\d{4,6})_/.exec(imageUrl ?? "")?.[1];

    out.push({
      productUrl,
      name: namePart?.trim() || undefined,
      styleNumber: styleFromImage,
      priceRange: price ? `${price[1]} - ${price[2]}` : (single?.[1] ?? undefined),
      imageUrl,
    });
  });

  return out;
}
