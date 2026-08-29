/**
 * Where each vendor publishes its size charts.
 *
 * The whole library is a small, fixed set of images per company, which is why
 * extraction is a one-time seeding job rather than something that happens when a
 * costume is added. Each entry is read once, confirmed by a human against the
 * image, and then referenced by every costume whose size codes match it.
 *
 * Only body-measurement charts belong here. Shoe-size charts are a different
 * kind of table and are not used for costume sizing.
 */

export interface ChartSource {
  companySlug: string;
  variant: string;
  label: string;
  url: string;
}

const WEISSMAN_CDN = "https://d2mf5zk7fvq4ou.cloudfront.net/images/size-charts";

/**
 * Weissman publishes six body charts, in both inches and centimetres. We seed
 * the inch versions since charts are stored canonically in inches; the cm URLs
 * are the same paths with `/cm/` and a `-cm` suffix.
 */
const WEISSMAN: ChartSource[] = [
  {
    companySlug: "weissman",
    variant: "child-girls",
    label: "Child Girls",
    url: `${WEISSMAN_CDN}/child/inches/wts-size-chart-girls-in.jpg`,
  },
  {
    companySlug: "weissman",
    variant: "child-boys",
    label: "Child Boys",
    url: `${WEISSMAN_CDN}/child/inches/wts-size-chart-boys-in.jpg`,
  },
  {
    companySlug: "weissman",
    variant: "child-unisex",
    label: "Child Unisex",
    url: `${WEISSMAN_CDN}/child/inches/wts-size-chart-child-unisex-in.jpg`,
  },
  {
    companySlug: "weissman",
    variant: "adult-womens",
    label: "Adult Women's",
    url: `${WEISSMAN_CDN}/adult/inches/wts-size-chart-womens-in.jpg`,
  },
  {
    companySlug: "weissman",
    variant: "adult-mens",
    label: "Adult Men's",
    url: `${WEISSMAN_CDN}/adult/inches/wts-size-chart-mens-in.jpg`,
  },
  {
    companySlug: "weissman",
    variant: "adult-unisex",
    label: "Adult Unisex",
    url: `${WEISSMAN_CDN}/adult/inches/wts-size-chart-adult-unisex-in.jpg`,
  },
];

/**
 * Revolution serves two charts, discovered by crawling the catalogue: a general
 * one used by 383 of 403 costumes, and a male/unisex one used by the other 20.
 *
 * The male/unisex size codes are a strict SUBSET of the general chart's, so the
 * two cannot be told apart by size codes alone - which is why resolution prefers
 * the chart image each product page links to.
 */
const REVOLUTION: ChartSource[] = [
  {
    companySlug: "revolution",
    variant: "child-and-adult",
    label: "Costume Sizing",
    url: "https://cdn11.bigcommerce.com/s-m12047qc85/product_images/uploaded_images/costumechart.jpg",
  },
  {
    companySlug: "revolution",
    variant: "male-unisex",
    label: "Male / Unisex Sizing",
    url: "https://cdn11.bigcommerce.com/s-m12047qc85/product_images/uploaded_images/maleunisexchart.jpg",
  },
];

export const CHART_MANIFEST: ChartSource[] = [...REVOLUTION, ...WEISSMAN];

export const manifestFor = (companySlug: string): ChartSource[] =>
  CHART_MANIFEST.filter((c) => c.companySlug === companySlug);

/**
 * Companies whose charts are not yet in the manifest.
 *
 * A Wish Come True's server does not send a complete TLS certificate chain, so
 * Node rejects it with UNABLE_TO_VERIFY_LEAF_SIGNATURE even though browsers and
 * curl accept it. Layla's returns 403 to Node's fetch while accepting curl,
 * so it is fingerprinting more than the user-agent string.
 *
 * Both are reachable through the manual path: paste a chart image URL, or upload
 * the image directly, and it goes through the identical extraction pipeline.
 */
export const MANUAL_ONLY_COMPANIES = ["awishcometrue", "laylas"] as const;
