import * as cheerio from "cheerio";
import { Agent, fetch as undiciFetch } from "undici";
import {
  VendorScrapeError,
  type CatalogListing,
  type ScrapedColorway,
  type ScrapedCostume,
  type VendorAdapter,
} from "./types";

/**
 * Layla's Dance Costumes (laylasdance.com).
 *
 * Their server rejects Node with a 403 while accepting the identical request
 * from curl. It is not the user-agent or any header - a full browser header set
 * still gets a 403. It is the TLS handshake: Node offers a different cipher
 * suite order to a browser's, and presenting Chrome's order gets a 200. So this
 * needs no headless browser, just a correctly shaped handshake.
 *
 * What the public site will NOT give up is the size list: Layla's is a
 * trade supplier and gates sizes and prices behind a studio login ("Please Login
 * to see Price"). So a lookup here returns the style number and name, and the
 * sizes have to be entered from the studio's own order form.
 */

const SLUG = "laylas";
const BASE = "https://laylasdance.com";

/**
 * Chrome's cipher suite order. Offering Node's default order is what triggers
 * the 403; this is a handshake fingerprint, not an attempt to hide anything -
 * the request is an ordinary read of a public catalogue page.
 */
const CHROME_CIPHERS = [
  "TLS_AES_128_GCM_SHA256",
  "TLS_AES_256_GCM_SHA384",
  "TLS_CHACHA20_POLY1305_SHA256",
  "ECDHE-ECDSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES128-GCM-SHA256",
  "ECDHE-ECDSA-AES256-GCM-SHA384",
  "ECDHE-RSA-AES256-GCM-SHA384",
  "ECDHE-ECDSA-CHACHA20-POLY1305",
  "ECDHE-RSA-CHACHA20-POLY1305",
  "ECDHE-RSA-AES128-SHA",
  "ECDHE-RSA-AES256-SHA",
  "AES128-GCM-SHA256",
  "AES256-GCM-SHA384",
].join(":");

const browserLike = new Agent({ allowH2: true, connect: { ciphers: CHROME_CIPHERS } });

/** `<h1>L3627 - GOOD MORNING</h1>` */
const H1_PATTERN = /^\s*([A-Z]{0,3}\d{3,6}[A-Z]?)\s*[-–]\s*(.+?)\s*$/i;

async function fetchPage(url: string): Promise<string> {
  const res = await undiciFetch(url, {
    dispatcher: browserLike,
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) {
    throw new VendorScrapeError(
      `${SLUG}: could not fetch ${url} (HTTP ${res.status}).`,
    );
  }
  return res.text();
}

const CATALOG_URL = `${BASE}/costumes/dance-costumes.html`;

/**
 * Product tiles on a listing page, which carry everything a lookup needs: the
 * style number, the name and the URL. No per-product fetch is required, which
 * also means the login gate on the product page never comes into it.
 */
export function parseCatalogPage(html: string): CatalogListing[] {
  const $ = cheerio.load(html);
  const out = new Map<string, CatalogListing>();

  $("a.product-item-photo, a.product-item-link").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href) return;

    const style = /\/costumes\/([a-z]{0,3}\d{3,6}[a-z]?)-[^/]*\.html$/i.exec(href)?.[1];
    if (!style) return;

    // The image alt reads "L3627 - GOOD MORNING".
    const alt = ($(el).find("img").first().attr("alt") ?? "").replace(/\s+/g, " ").trim();
    const name = /^[A-Z]{0,3}\d{3,6}[A-Z]?\s*[-–]\s*(.+)$/i.exec(alt)?.[1] ?? alt;

    const code = style.toUpperCase();
    if (!out.has(code)) {
      out.set(code, {
        productUrl: href,
        styleNumber: code,
        name: name || undefined,
        imageUrl: $(el).find("img").first().attr("src")?.trim(),
      });
    }
  });

  return [...out.values()];
}

export const laylasAdapter: VendorAdapter = {
  slug: SLUG,

  /**
   * Walk the costume listing. Pages are `?p=N`; a page that adds no new styles
   * is the stop condition, since past the end the site repeats the last page
   * rather than returning nothing.
   */
  async listCatalog({ maxPages = 60, delayMs = 400 } = {}): Promise<CatalogListing[]> {
    const seen = new Map<string, CatalogListing>();

    for (let page = 1; page <= maxPages; page++) {
      const url = page === 1 ? CATALOG_URL : `${CATALOG_URL}?p=${page}`;
      const listings = parseCatalogPage(await fetchPage(url));
      if (listings.length === 0) break;

      let added = 0;
      for (const l of listings) {
        const key = l.styleNumber ?? l.productUrl;
        if (!seen.has(key)) {
          seen.set(key, l);
          added++;
        }
      }
      if (added === 0) break;

      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }

    return [...seen.values()];
  },

  parseStyleNumber(input: string): string | null {
    const trimmed = input.trim();
    const direct = /^[A-Za-z]{0,3}\d{3,6}[A-Za-z]?$/.exec(trimmed);
    if (direct) return direct[0].toUpperCase();
    // From a product URL like /costumes/l3627-good-morning.html
    const fromUrl = /\/([a-z]{0,3}\d{3,6}[a-z]?)-/i.exec(trimmed);
    if (fromUrl) return fromUrl[1].toUpperCase();
    const embedded = /\b([A-Za-z]{0,3}\d{3,6}[A-Za-z]?)\b/.exec(trimmed);
    return embedded ? embedded[1].toUpperCase() : null;
  },

  parse(html: string, url: string): ScrapedCostume {
    const $ = cheerio.load(html);

    const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
    const matched = H1_PATTERN.exec(h1);
    if (!matched) {
      throw new VendorScrapeError(
        `${SLUG}: could not read a style number and name from the heading (${JSON.stringify(h1)}). The site layout may have changed.`,
      );
    }
    const [, styleNumber, name] = matched;

    // Sizes are behind the trade login, so none are returned. The caller is
    // expected to collect them rather than assume the full chart range, which
    // would risk recommending a size the costume is not made in.
    const colorways: ScrapedColorway[] = [];

    return {
      styleNumber: styleNumber.toUpperCase(),
      name,
      productUrl: url,
      availableSizes: [],
      colorways,
      categoryHint: $("title").first().text().trim(),
    };
  },

  async scrape(url: string): Promise<ScrapedCostume> {
    return this.parse(await fetchPage(url), url);
  },
};

export const laylasBase = BASE;
