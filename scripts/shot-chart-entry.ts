/** Capture the manual chart-entry screen for review. */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3947";

async function main() {
  mkdirSync("docs/screenshots", { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.setInputFiles('input[type="file"]', "sample-data/junior-jazz-roster.xlsx");
  await page.waitForSelector("text=Check the columns", { timeout: 20000 });
  await page.click("text=Choose the costume →");
  await page.fill('input[placeholder*="27776"]', "27776");
  await page.click("text=Find costume");
  await page.waitForSelector("text=This chart has not been recorded yet", { timeout: 30000 });
  await page.click("text=Type the chart in");
  await page.waitForSelector("text=Type in the size chart", { timeout: 20000 });
  // Wait for the vendor chart image to actually finish decoding, rather than
  // guessing at a delay - it is the whole point of this screen.
  await page.waitForFunction(
    () => {
      const img = document.querySelector('img[alt="Vendor size chart"]') as HTMLImageElement | null;
      return Boolean(img && img.complete && img.naturalWidth > 0);
    },
    { timeout: 30000 },
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: "docs/screenshots/4-chart-entry.png", fullPage: true });
  console.log("docs/screenshots/4-chart-entry.png");
  await browser.close();
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
