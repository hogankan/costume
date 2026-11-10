import {
  fetchHtml,
  VendorScrapeError,
  type ScrapedColorway,
  type ScrapedCostume,
  type VendorAdapter,
} from "./types";

/**
 * Weissman (weissmans.com).
 *
 * Their catalogue listing is rendered client-side, which made this look like the
 * hardest vendor. The product pages are not: each one embeds a product object
 * with the style number, name, orderable sizes, colours and - usefully - the
 * size chart the product uses. Plain fetch, no browser.
 *
 * The object's variable name is not stable: it was `var jsonProductLite = {...}`
 * until November 2026, when it became `var product = {...}` with the same fields.
 * So the page is searched for whichever object carries a style and sizes,
 * rather than for one particular name.
 *
 * A bare style number also resolves: `weissmans.com/19912.aspx` serves the same
 * page as the long categorised URL, so no catalogue crawl is needed to look a
 * costume up.
 */

const SLUG = "weissman";
const BASE = "https://www.weissmans.com";

/** `https://www.weissmans.com/19912.aspx` */
export const weissmanProductUrl = (styleNumber: string): string =>
  `${BASE}/${styleNumber.trim()}.aspx`;

interface WeissmanProductLite {
  Style?: string;
  Name?: string;
  /** e.g. "~/SizeCharts/BaleraWeissman.ascx" - which chart the product uses. */
  SizeChart?: string;
  CanonicalURL?: string;
  Brand?: string;
  IsDiscontinued?: boolean;
  Sizes?: { Size?: string; SizeCode?: string; SizeFriendlyName?: string }[];
  Colors?: { Color?: string; ColorCode?: string }[];
}

/**
 * Pull the embedded product object out of the page.
 *
 * Every `var <name> = {` is tried in turn, and the first object that parses and
 * has a style number and a size list wins. That covers both names Weissman has
 * used and survives the next rename.
 */
export function extractProductLite(html: string): WeissmanProductLite | null {
  const candidates = /var\s+[A-Za-z_$][\w$]*\s*=\s*\{/g;
  for (let m = candidates.exec(html); m; m = candidates.exec(html)) {
    const json = objectAt(html, m.index + m[0].length - 1);
    if (!json) continue;
    try {
      const parsed = JSON.parse(json) as WeissmanProductLite;
      if (typeof parsed?.Style === "string" && Array.isArray(parsed.Sizes)) return parsed;
    } catch {
      // Not JSON (ordinary script), keep looking.
    }
  }
  return null;
}

/**
 * The text of the `{...}` object starting at `start`.
 *
 * Brace-matched rather than regex-captured: the JSON contains the product
 * description as HTML, so any pattern that stops at the first `}` or `</script>`
 * truncates it.
 */
function objectAt(html: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i++) {
    const ch = html[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

export const weissmanAdapter: VendorAdapter = {
  slug: SLUG,

  parseStyleNumber(input: string): string | null {
    const trimmed = input.trim();
    const direct = /^\d{4,6}$/.exec(trimmed);
    if (direct) return direct[0];
    // From a product URL, long or short: /19912.aspx, /showtime/.../19912.aspx
    const fromUrl = /\/(\d{4,6})\.aspx/i.exec(trimmed);
    if (fromUrl) return fromUrl[1];
    const embedded = /\b(\d{4,6})\b/.exec(trimmed);
    return embedded ? embedded[1] : null;
  },

  parse(html: string, url: string): ScrapedCostume {
    const product = extractProductLite(html);
    if (!product) {
      throw new VendorScrapeError(
        `${SLUG}: no product data found on ${url}. The site layout may have changed.`,
      );
    }

    const styleNumber = (product.Style ?? "").trim();
    const name = (product.Name ?? "").trim();
    if (!styleNumber || !name) {
      throw new VendorScrapeError(
        `${SLUG}: product data on ${url} has no style number or name.`,
      );
    }

    const availableSizes = (product.Sizes ?? [])
      .map((s) => (s.Size ?? "").trim())
      .filter((s) => s.length > 0);

    if (availableSizes.length === 0) {
      throw new VendorScrapeError(
        `${SLUG}: ${styleNumber} lists no sizes. It may be discontinued.`,
      );
    }

    const colorways: ScrapedColorway[] = (product.Colors ?? [])
      .map((c) => {
        const name = (c.Color ?? "").trim();
        const code = (c.ColorCode ?? "").trim();
        return name ? { name, ...(code ? { code } : {}) } : null;
      })
      .filter((c): c is ScrapedColorway => c !== null);

    return {
      styleNumber,
      name,
      productUrl: url,
      availableSizes,
      colorways,
      // The product names its own chart, which is far better than inferring one
      // from size codes - Weissman's girls and child-unisex charts share a
      // vocabulary and cannot be told apart by codes alone.
      ...(product.SizeChart ? { chartImageUrl: product.SizeChart } : {}),
      categoryHint: [product.Brand, product.CanonicalURL].filter(Boolean).join(" "),
    };
  },

  async scrape(url: string): Promise<ScrapedCostume> {
    return this.parse(await fetchHtml(url, SLUG), url);
  },
};
