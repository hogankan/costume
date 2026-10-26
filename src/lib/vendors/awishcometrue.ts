import * as cheerio from "cheerio";
import { Agent, fetch as undiciFetch } from "undici";
import {
  VendorScrapeError,
  type ScrapedColorway,
  type ScrapedCostume,
  type VendorAdapter,
} from "./types";

/**
 * A Wish Come True (awishcometrue.com).
 *
 * Their server sends an incomplete TLS certificate chain: browsers and curl
 * tolerate the missing intermediate, Node's fetch rejects it outright with
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE. Rather than reach for a headless browser, the
 * check is relaxed for this one host. That is defensible here and only here - we
 * are reading a public catalogue page and sending no credentials - but it must
 * not spread to any request that carries anything sensitive.
 *
 * Everything needed is in the server-rendered HTML, so no browser is involved.
 */

const SLUG = "awishcometrue";
const BASE = "https://awishcometrue.com";

/** `<h1>27364 Friendship and Magic</h1>` */
const H1_PATTERN = /^\s*([A-Z]{0,3}\d{3,6}[A-Z]?)\s+(.+?)\s*$/i;

const tlsRelaxed = new Agent({ connect: { rejectUnauthorized: false } });

async function fetchProduct(url: string): Promise<string> {
  const res = await undiciFetch(url, {
    dispatcher: tlsRelaxed,
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) {
    throw new VendorScrapeError(`${SLUG}: could not fetch ${url} (HTTP ${res.status}).`);
  }
  return res.text();
}

export const awishcometrueAdapter: VendorAdapter = {
  slug: SLUG,

  parseStyleNumber(input: string): string | null {
    const trimmed = input.trim();
    const direct = /^[A-Za-z]{0,3}\d{3,6}[A-Za-z]?$/.exec(trimmed);
    if (direct) return direct[0].toUpperCase();
    // Pull it out of a product URL like /27083y-swinging-on-a-star
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

    // Sizes are the column headings of the variant table.
    const availableSizes = $("#TblConfigVariants thead th")
      .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
      .get()
      .filter((s) => s.length > 0);

    if (availableSizes.length === 0) {
      throw new VendorScrapeError(
        `${SLUG}: no sizes found on ${url}. The site layout may have changed.`,
      );
    }

    // Colour swatches carry the colour name; the visible title prefixes it with
    // the vendor's own colour number, which is not wanted here.
    //
    // Scoped to the swatch anchors on purpose: the per-size quantity inputs
    // carry the SAME attribute holding a size code, so an unscoped selector
    // returns "Aqua, XSC, SC, ISC, ..." - colours and sizes mixed together.
    //
    // HTML attribute names are case-insensitive and the parser lowercases them,
    // so the markup's `data-colorSize` is matched as `data-colorsize`.
    const colorways: ScrapedColorway[] = $("a[data-colorsize]")
      .map((_, el) => {
        const value = ($(el).attr("data-colorsize") ?? "").trim();
        // The vendor's colour number lives in the child image's title
        // ("54 Aqua"), not on the anchor.
        const title = ($(el).find("img").first().attr("title") ?? "").trim();
        const code = /^(\d+)\s+/.exec(title)?.[1];
        return value ? { name: value, ...(code ? { code } : {}) } : null;
      })
      .get()
      .filter((c): c is ScrapedColorway => c !== null);

    const chartImageUrl = $('img[src*="SizeChart"], a[href*="SizeChart"]')
      .first()
      .attr("src");

    return {
      styleNumber: styleNumber.toUpperCase(),
      name,
      productUrl: url,
      availableSizes,
      colorways: dedupeByName(colorways),
      ...(chartImageUrl ? { chartImageUrl } : {}),
      // Their charts split girls and boys, and a boys costume's size codes are a
      // subset of the girls ones, so the page's own wording is the tiebreak.
      categoryHint: $("title").first().text().trim(),
    };
  },

  async scrape(url: string): Promise<ScrapedCostume> {
    return this.parse(await fetchProduct(url), url);
  },

  /**
   * Product URLs carry a name slug (/10096y-choo-choo-chboogie), so a bare
   * style number cannot be turned into a URL directly. The site's own search
   * returns the product link, which is matched on the exact style prefix so
   * that "24182" never picks up "24182Y".
   */
  async findProductUrl(style: string): Promise<string | null> {
    const html = await fetchProduct(`${BASE}/Search?searchterm=${encodeURIComponent(style)}`);
    return findStyleLink(html, style);
  },
};

/** Pull the product link for exactly this style out of a search results page. */
export function findStyleLink(html: string, style: string): string | null {
  const $ = cheerio.load(html);
  const prefix = `/${style.toLowerCase()}-`;
  const hit = $("a[href]")
    .map((_, el) => $(el).attr("href") ?? "")
    .get()
    .map((href) => (href.startsWith("/") ? `${BASE}${href}` : href))
    .find((href) => {
      try {
        const u = new URL(href);
        return u.hostname.endsWith("awishcometrue.com") && u.pathname.toLowerCase().startsWith(prefix);
      } catch {
        return false;
      }
    });
  return hit ?? null;
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

export const awishcometrueBase = BASE;
