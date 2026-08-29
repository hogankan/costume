/**
 * Crawl a vendor's season catalogue into catalog/{season}/{company}.json.
 *
 *   npx tsx scripts/crawl-catalog.ts                        # every vendor with a crawler
 *   npx tsx scripts/crawl-catalog.ts --company revolution
 *   npx tsx scripts/crawl-catalog.ts --season 2026-2027 --max-pages 3
 *   npx tsx scripts/crawl-catalog.ts --company revolution --resume
 *
 * Costume ranges are fixed for a season and a product page lists the sizes a
 * costume is *made* in rather than live stock, so this runs once per season and
 * everything afterwards reads from disk. Requests are deliberately spaced out.
 */
import "dotenv/config";
import { revolutionAdapter } from "../src/lib/vendors/revolution";
import { laylasAdapter } from "../src/lib/vendors/laylas";
import type { VendorAdapter } from "../src/lib/vendors/types";
import { loadCatalog, saveCatalog } from "../src/lib/catalog/store";
import type { CatalogProduct, CompanyCatalog } from "../src/lib/catalog/types";

interface Vendor {
  slug: string;
  name: string;
  adapter: VendorAdapter;
  sourceUrl: string;
  /**
   * Skip the per-product fetch where the listing already carries everything.
   * Layla's is listing-only: its tiles give style, name and URL, while the
   * product page hides sizes behind a trade login, so fetching each product
   * would cost hundreds of requests and add nothing.
   */
  listingOnly?: boolean;
  /** Chart every costume from this vendor uses, when there is only one. */
  chartUrl?: string;
}

const VENDORS: Vendor[] = [
  {
    slug: "laylas",
    name: "Layla's",
    adapter: laylasAdapter,
    sourceUrl: "https://laylasdance.com/costumes/dance-costumes.html",
    listingOnly: true,
    chartUrl: "https://laylasdance.com/costumes/size-chart-1",
  },
  {
    slug: "revolution",
    name: "Revolution",
    adapter: revolutionAdapter,
    sourceUrl: "https://www.revolutiondance.com/dance-costumes/?_bc_fsnf=1&brand=39",
  },
];

/** A dance season runs across the calendar year boundary. */
function currentSeason(now = new Date()): string {
  const y = now.getFullYear();
  return now.getMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (name: string) => process.argv.includes(`--${name}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function crawl(vendor: Vendor, season: string): Promise<void> {
  if (!vendor.adapter.listCatalog) {
    console.log(`SKIP  ${vendor.slug}: no catalogue crawler; use manual entry.`);
    return;
  }

  const maxPages = Number(arg("max-pages") ?? 40);
  const delayMs = Number(arg("delay") ?? 400);
  const resume = has("resume");

  // Resuming reuses what is already stored, so an interrupted crawl does not
  // start from scratch and re-request pages the vendor already served.
  const existing = resume ? loadCatalog(season, vendor.slug) : null;
  const known = new Map<string, CatalogProduct>();
  for (const p of existing?.products ?? []) known.set(p.productUrl, p);
  if (existing) console.log(`  resuming with ${known.size} product(s) already stored`);

  console.log(`\n=== ${vendor.name} (${season}) ===`);
  console.log("  listing catalogue pages...");
  const listings = await vendor.adapter.listCatalog({ maxPages, delayMs });
  console.log(`  ${listings.length} products listed`);

  const products: CatalogProduct[] = [];
  const failures: { url: string; reason: string }[] = [];

  for (const [i, listing] of listings.entries()) {
    const cached = known.get(listing.productUrl);
    if (cached) {
      products.push(cached);
      continue;
    }

    if (vendor.listingOnly) {
      products.push({
        styleNumber: listing.styleNumber ?? "",
        name: listing.name ?? "",
        productUrl: listing.productUrl,
        // Sizes are not published for this vendor; left empty rather than
        // assumed, and resolved against the whole chart at sizing time.
        availableSizes: [],
        colorways: [],
        chartImageUrl: vendor.chartUrl,
        priceRange: listing.priceRange,
        imageUrl: listing.imageUrl,
      });
      continue;
    }

    try {
      const detail = await vendor.adapter.scrape(listing.productUrl);
      products.push({
        styleNumber: detail.styleNumber,
        name: detail.name,
        productUrl: detail.productUrl,
        availableSizes: detail.availableSizes,
        colorways: detail.colorways,
        chartImageUrl: detail.chartImageUrl,
        priceRange: listing.priceRange,
        imageUrl: listing.imageUrl,
        categoryHint: detail.categoryHint,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push({ url: listing.productUrl, reason });
      console.log(`  FAIL ${listing.productUrl}`);
      console.log(`       ${reason.slice(0, 140)}`);
    }

    const n = i + 1;
    if (n % 10 === 0 || n === listings.length) {
      console.log(`  ${n}/${listings.length} fetched (${failures.length} failed)`);
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  const catalog: CompanyCatalog = {
    season,
    companySlug: vendor.slug,
    companyName: vendor.name,
    sourceUrl: vendor.sourceUrl,
    crawledAt: new Date().toISOString(),
    pagesCrawled: Math.ceil(listings.length / 18),
    failures,
    products,
  };

  const path = saveCatalog(catalog);
  const sizes = new Set(products.flatMap((p) => p.availableSizes));
  const withChart = products.filter((p) => p.chartImageUrl).length;

  console.log(`\n  wrote ${products.length} products -> ${path}`);
  console.log(`  distinct size codes: ${[...sizes].sort().join(", ")}`);
  console.log(`  products naming a size chart: ${withChart}/${products.length}`);
  if (failures.length > 0) console.log(`  ${failures.length} failed (recorded in the file)`);
}

async function main() {
  const season = arg("season") ?? currentSeason();
  const only = arg("company");
  const vendors = only ? VENDORS.filter((v) => v.slug === only) : VENDORS;

  if (vendors.length === 0) {
    console.error(
      `No crawler for ${JSON.stringify(only)}. Available: ${VENDORS.map((v) => v.slug).join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  for (const vendor of vendors) {
    try {
      await crawl(vendor, season);
    } catch (err) {
      console.error(
        `FAIL  ${vendor.slug}: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exitCode = 1;
    }
  }
}

main();
