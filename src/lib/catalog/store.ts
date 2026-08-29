import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CatalogProduct, CatalogSummary, CompanyCatalog } from "./types";

/**
 * Catalogue storage: one JSON file per company per season, committed to the repo.
 *
 * Kept as files rather than only in a database for the same reason the chart
 * library is: this is reference data that a whole season's orders depend on, and
 * a diff makes any change to it visible in review instead of silent.
 *
 * Products are written sorted by style number so re-crawling an unchanged
 * catalogue produces no diff at all.
 */

export const CATALOG_DIR = "catalog";

const pathFor = (season: string, companySlug: string, root = CATALOG_DIR) =>
  join(root, season, `${companySlug}.json`);

export function saveCatalog(catalog: CompanyCatalog, root = CATALOG_DIR): string {
  const sorted: CompanyCatalog = {
    ...catalog,
    products: [...catalog.products].sort((a, b) =>
      a.styleNumber.localeCompare(b.styleNumber, undefined, { numeric: true }),
    ),
  };
  const p = pathFor(catalog.season, catalog.companySlug, root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(sorted, null, 2)}\n`);
  return p;
}

export function loadCatalog(
  season: string,
  companySlug: string,
  root = CATALOG_DIR,
): CompanyCatalog | null {
  const p = pathFor(season, companySlug, root);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as CompanyCatalog;
  } catch {
    return null;
  }
}

/** Every season that has at least one crawled company. */
export function listSeasons(root = CATALOG_DIR): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();
}

export function listCatalogs(season: string, root = CATALOG_DIR): CompanyCatalog[] {
  const dir = join(root, season);
  if (!existsSync(dir)) return [];
  const out: CompanyCatalog[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(readFileSync(join(dir, file), "utf8")) as CompanyCatalog);
    } catch {
      // A corrupt file must not hide the rest of the catalogue.
    }
  }
  return out.sort((a, b) => a.companySlug.localeCompare(b.companySlug));
}

export const summarise = (c: CompanyCatalog): CatalogSummary => ({
  season: c.season,
  companySlug: c.companySlug,
  companyName: c.companyName,
  crawledAt: c.crawledAt,
  productCount: c.products.length,
  failureCount: c.failures.length,
});

/** Look one costume up without touching the network. */
export function findProduct(
  season: string,
  companySlug: string,
  styleNumber: string,
  root = CATALOG_DIR,
): CatalogProduct | null {
  const catalog = loadCatalog(season, companySlug, root);
  if (!catalog) return null;
  const wanted = styleNumber.trim().toLowerCase();
  return (
    catalog.products.find((p) => p.styleNumber.trim().toLowerCase() === wanted) ?? null
  );
}

/**
 * Substring search over style number and name, for picking a costume in the UI
 * without knowing its number.
 */
export function searchProducts(
  season: string,
  query: string,
  options: { companySlug?: string; limit?: number; root?: string } = {},
): { companySlug: string; companyName: string; product: CatalogProduct }[] {
  const { companySlug, limit = 50, root = CATALOG_DIR } = options;
  const q = query.trim().toLowerCase();
  const catalogs = listCatalogs(season, root).filter(
    (c) => !companySlug || c.companySlug === companySlug,
  );

  const hits: { companySlug: string; companyName: string; product: CatalogProduct }[] = [];
  for (const c of catalogs) {
    for (const product of c.products) {
      if (
        q.length === 0 ||
        product.styleNumber.toLowerCase().includes(q) ||
        product.name.toLowerCase().includes(q)
      ) {
        hits.push({ companySlug: c.companySlug, companyName: c.companyName, product });
      }
    }
  }

  // An exact style-number match is almost always what was meant.
  hits.sort((a, b) => {
    const ax = a.product.styleNumber.toLowerCase() === q ? 0 : 1;
    const bx = b.product.styleNumber.toLowerCase() === q ? 0 : 1;
    return ax - bx || a.product.styleNumber.localeCompare(b.product.styleNumber, undefined, { numeric: true });
  });

  return hits.slice(0, limit);
}
