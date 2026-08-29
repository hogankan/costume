import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCatalogPage, revolutionAdapter } from "../revolution";
import { VendorScrapeError } from "../types";

/**
 * Parsed against a real page captured from revolutiondance.com. If Revolution
 * redesigns, this test fails here rather than silently mis-sizing a whole class.
 */
const FIXTURE_URL = "https://www.revolutiondance.com/you-cant-stop-the-beat/";
const html = readFileSync(
  join(__dirname, "..", "__fixtures__", "revolution-27776.html"),
  "utf8",
);

describe("revolution adapter", () => {
  const result = revolutionAdapter.parse(html, FIXTURE_URL);

  it("reads the style number and name from the page title", () => {
    expect(result.styleNumber).toBe("27776");
    expect(result.name).toBe("YOU CAN'T STOP THE BEAT");
  });

  it("reads every orderable size, in chart order", () => {
    expect(result.availableSizes).toEqual([
      "XSC",
      "SC",
      "MC",
      "LC",
      "XLC",
      "XXLC",
      "SA",
      "MA",
      "LA",
      "XLA",
      "XXLA",
    ]);
  });

  it("reads the colourways, which the order sheet needs alongside size", () => {
    expect(result.colorways.length).toBeGreaterThan(0);
    expect(result.colorways.map((c) => c.name)).toContain("Purple");
    expect(result.colorways.map((c) => c.name)).toContain("Red");
    // Every colourway carries the BigCommerce option id for ordering.
    expect(result.colorways.every((c) => c.code)).toBe(true);
  });

  it("finds the size chart image used to seed the chart library", () => {
    expect(result.chartImageUrl).toBe(
      "https://cdn11.bigcommerce.com/s-m12047qc85/product_images/uploaded_images/costumechart.jpg",
    );
  });

  it("does not confuse colour swatches or the ship-date field with sizes", () => {
    expect(result.availableSizes).not.toContain("Purple");
    expect(result.availableSizes.some((s) => /\d{4}/.test(s))).toBe(false);
  });

  it("handles lettered style numbers like the RC range", () => {
    // Found by crawling the real catalogue: 59 of 407 products use an RC prefix,
    // and a digits-only pattern rejected every one of them.
    const rc = revolutionAdapter.parse(
      html.replace(
        "<title> 27776 | YOU CAN&#x27;T STOP THE BEAT </title>",
        "<title> RC26984 | ON THE RUN </title>",
      ),
      FIXTURE_URL,
    );
    expect(rc.styleNumber).toBe("RC26984");
    expect(rc.name).toBe("ON THE RUN");
  });

  it("fails loudly rather than silently when the layout changes", () => {
    expect(() => revolutionAdapter.parse("<html><title>nope</title></html>", FIXTURE_URL)).toThrow(
      VendorScrapeError,
    );
  });

  it("fails when a page has a valid title but no size options", () => {
    expect(() =>
      revolutionAdapter.parse("<html><title> 27776 | A COSTUME </title></html>", FIXTURE_URL),
    ).toThrow(/no size options/);
  });
});

describe("revolution style number parsing", () => {
  it.each([
    ["27776", "27776"],
    ["  27776  ", "27776"],
    ["https://www.revolutiondance.com/you-cant-stop-the-beat/?sku=27776", "27776"],
    ["27776 | YOU CAN'T STOP THE BEAT", "27776"],
    ["RC26984", "RC26984"],
    ["rc26984", "RC26984"],
    ["RC26984 | ON THE RUN", "RC26984"],
  ])("parses %s", (input, expected) => {
    expect(revolutionAdapter.parseStyleNumber(input)).toBe(expected);
  });

  it("returns null when there is no style number to find", () => {
    expect(revolutionAdapter.parseStyleNumber("no digits here")).toBeNull();
  });
});

describe("revolution catalogue listing", () => {
  const catalogHtml = readFileSync(
    join(__dirname, "..", "__fixtures__", "revolution-catalog-p1.html"),
    "utf8",
  );
  const listings = parseCatalogPage(catalogHtml);

  it("finds every product card on a listing page", () => {
    expect(listings.length).toBeGreaterThan(10);
  });

  it("pulls the style number out of the product image filename", () => {
    // The listing markup has no SKU element; the image is named 27776_all_1_w__*.jpg
    expect(listings.every((l) => /^\d{4,6}$/.test(l.styleNumber ?? ""))).toBe(true);
  });

  it("reads name and price range from the card link", () => {
    const one = listings.find((l) => l.styleNumber === "27801");
    expect(one?.name).toBe("UN-BREAK MY HEART");
    expect(one?.priceRange).toBe("$49.95 - $59.95");
    expect(one?.productUrl).toBe("https://www.revolutiondance.com/un-break-my-heart/");
  });

  it("returns nothing for a page past the end of the catalogue", () => {
    expect(parseCatalogPage("<html><body>no cards here</body></html>")).toEqual([]);
  });
});
