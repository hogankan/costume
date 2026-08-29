/**
 * Verify every chart in the manifest is still reachable and still an image.
 * Run this before seeding, and periodically - vendors move their assets.
 *
 *   npx tsx scripts/check-manifest.ts
 */
import { CHART_MANIFEST } from "../src/lib/charts/manifest";
import { fetchChartImage, prepareForVision } from "../src/lib/charts/extract";

async function main() {
  let failures = 0;
  for (const src of CHART_MANIFEST) {
    try {
      const img = await fetchChartImage(src.url);
      const ready = await prepareForVision(img);
      const kb = (n: number) => `${(n / 1024).toFixed(0)}KB`;
      const resized = ready.bytes.length !== img.bytes.length;
      console.log(
        `OK    ${src.companySlug}/${src.variant}`.padEnd(38) +
          `${kb(img.bytes.length).padStart(8)}` +
          (resized ? ` -> ${kb(ready.bytes.length).padStart(7)} (downscaled)` : "") +
          `  ${img.hash.slice(0, 12)}`,
      );
    } catch (err) {
      failures++;
      console.log(
        `FAIL  ${src.companySlug}/${src.variant}  ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  console.log(`\n${CHART_MANIFEST.length - failures}/${CHART_MANIFEST.length} reachable.`);
  if (failures > 0) process.exitCode = 1;
}

main();
