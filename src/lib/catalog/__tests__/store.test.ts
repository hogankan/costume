import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findProduct,
  listCatalogs,
  listSeasons,
  loadCatalog,
  saveCatalog,
  searchProducts,
  summarise,
} from "../store";
import type { CatalogProduct, CompanyCatalog } from "../types";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "catalog-test-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const product = (over: Partial<CatalogProduct> = {}): CatalogProduct => ({
  styleNumber: "27776",
  name: "YOU CAN'T STOP THE BEAT",
  productUrl: "https://www.revolutiondance.com/you-cant-stop-the-beat/",
  availableSizes: ["XSC", "SC", "MC"],
  colorways: [{ name: "Purple" }],
  ...over,
});

const catalog = (over: Partial<CompanyCatalog> = {}): CompanyCatalog => ({
  season: "2026-2027",
  companySlug: "revolution",
  companyName: "Revolution",
  sourceUrl: "https://www.revolutiondance.com/dance-costumes/",
  crawledAt: "2026-08-27T00:00:00.000Z",
  pagesCrawled: 1,
  failures: [],
  products: [product()],
  ...over,
});

describe("saving and loading", () => {
  it("round-trips a catalogue", () => {
    saveCatalog(catalog(), root);
    const loaded = loadCatalog("2026-2027", "revolution", root);
    expect(loaded?.products).toHaveLength(1);
    expect(loaded?.products[0].styleNumber).toBe("27776");
  });

  it("returns null for a season or company never crawled", () => {
    expect(loadCatalog("1999-2000", "revolution", root)).toBeNull();
    saveCatalog(catalog(), root);
    expect(loadCatalog("2026-2027", "weissman", root)).toBeNull();
  });

  it("sorts products by style number so an unchanged re-crawl produces no diff", () => {
    saveCatalog(
      catalog({
        products: [
          product({ styleNumber: "27801" }),
          product({ styleNumber: "27776" }),
          product({ styleNumber: "9902" }),
        ],
      }),
      root,
    );
    const written = loadCatalog("2026-2027", "revolution", root);
    // Numeric ordering, so 9902 sorts before 27776 rather than after.
    expect(written?.products.map((p) => p.styleNumber)).toEqual(["9902", "27776", "27801"]);
  });

  it("writes stable JSON, so re-saving the same data changes nothing", () => {
    const c = catalog({ products: [product({ styleNumber: "b" }), product({ styleNumber: "a" })] });
    saveCatalog(c, root);
    const first = readFileSync(join(root, "2026-2027", "revolution.json"), "utf8");
    saveCatalog(c, root);
    expect(readFileSync(join(root, "2026-2027", "revolution.json"), "utf8")).toBe(first);
  });

  it("records crawl failures alongside the products", () => {
    saveCatalog(catalog({ failures: [{ url: "https://x/y", reason: "HTTP 500" }] }), root);
    const loaded = loadCatalog("2026-2027", "revolution", root)!;
    expect(loaded.failures).toHaveLength(1);
    expect(summarise(loaded).failureCount).toBe(1);
  });
});

describe("listing", () => {
  it("lists seasons newest first", () => {
    saveCatalog(catalog({ season: "2025-2026" }), root);
    saveCatalog(catalog({ season: "2026-2027" }), root);
    expect(listSeasons(root)).toEqual(["2026-2027", "2025-2026"]);
  });

  it("lists every company crawled for a season", () => {
    saveCatalog(catalog(), root);
    saveCatalog(catalog({ companySlug: "weissman", companyName: "Weissman" }), root);
    expect(listCatalogs("2026-2027", root).map((c) => c.companySlug)).toEqual([
      "revolution",
      "weissman",
    ]);
  });

  it("returns nothing for a season with no catalogues", () => {
    expect(listCatalogs("2026-2027", root)).toEqual([]);
    expect(listSeasons(root)).toEqual([]);
  });
});

describe("lookup", () => {
  beforeEach(() => {
    saveCatalog(
      catalog({
        products: [
          product({ styleNumber: "27776", name: "YOU CAN'T STOP THE BEAT" }),
          product({ styleNumber: "27790", name: "JUST WATCH ME NOW" }),
        ],
      }),
      root,
    );
  });

  it("finds a costume by style number without touching the network", () => {
    expect(findProduct("2026-2027", "revolution", "27790", root)?.name).toBe(
      "JUST WATCH ME NOW",
    );
  });

  it("ignores case and surrounding whitespace", () => {
    expect(findProduct("2026-2027", "revolution", "  27790 ", root)).not.toBeNull();
  });

  it("returns null for a style number not in the catalogue", () => {
    expect(findProduct("2026-2027", "revolution", "00000", root)).toBeNull();
  });
});

describe("search", () => {
  beforeEach(() => {
    saveCatalog(
      catalog({
        products: [
          product({ styleNumber: "27776", name: "YOU CAN'T STOP THE BEAT" }),
          product({ styleNumber: "27790", name: "JUST WATCH ME NOW" }),
          product({ styleNumber: "27791", name: "SUGARTOWN" }),
        ],
      }),
      root,
    );
    saveCatalog(
      catalog({
        companySlug: "weissman",
        companyName: "Weissman",
        products: [product({ styleNumber: "10504", name: "BIGGER IS BETTER" })],
      }),
      root,
    );
  });

  it("searches by name across every company in the season", () => {
    const hits = searchProducts("2026-2027", "bigger", { root });
    expect(hits).toHaveLength(1);
    expect(hits[0].companyName).toBe("Weissman");
  });

  it("searches by style number", () => {
    const hits = searchProducts("2026-2027", "2779", { root });
    expect(hits.map((h) => h.product.styleNumber).sort()).toEqual(["27790", "27791"]);
  });

  it("puts an exact style-number match first", () => {
    const hits = searchProducts("2026-2027", "27791", { root });
    expect(hits[0].product.styleNumber).toBe("27791");
  });

  it("can be scoped to one company", () => {
    const hits = searchProducts("2026-2027", "", { companySlug: "weissman", root });
    expect(hits).toHaveLength(1);
  });

  it("returns everything for an empty query, up to the limit", () => {
    expect(searchProducts("2026-2027", "", { root, limit: 2 })).toHaveLength(2);
    expect(searchProducts("2026-2027", "", { root })).toHaveLength(4);
  });
});
