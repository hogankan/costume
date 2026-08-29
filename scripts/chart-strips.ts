/**
 * Download a chart image and cut it into readable horizontal strips.
 * Transcribing from a downscaled full view invites digit errors; strips keep the
 * numbers legible.
 *
 *   npx tsx scripts/chart-strips.ts <url> <outPrefix> [strips]
 */
import sharp from "sharp";
import { fetchChartImage } from "../src/lib/charts/extract";

async function main() {
  const [url, prefix, stripsArg] = process.argv.slice(2);
  const strips = Number(stripsArg ?? 4);

  const img = await fetchChartImage(url);
  const meta = await sharp(img.bytes).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  console.log(`${url.split("/").pop()}  ${w}x${h}  ${(img.bytes.length / 1024).toFixed(0)}KB`);

  const bandHeight = Math.ceil(h / strips);
  for (let i = 0; i < strips; i++) {
    const top = i * bandHeight;
    const height = Math.min(bandHeight, h - top);
    if (height <= 0) break;
    const out = `${prefix}-${i}.png`;
    await sharp(img.bytes)
      .extract({ left: 0, top, width: w, height })
      .resize({ width: Math.min(w * 2, 2400) })
      .png()
      .toFile(out);
    console.log(`  ${out}`);
  }
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
