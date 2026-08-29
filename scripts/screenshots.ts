/**
 * Drive the real UI in a browser and capture each step.
 *
 *   npx tsx scripts/screenshots.ts [baseUrl]
 *
 * Writes to docs/screenshots/. This doubles as a smoke test of the whole flow:
 * if a step's selector never appears, the run fails rather than saving a blank
 * picture of a broken page.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3947";
const OUT = "docs/screenshots";
const ROSTER = "sample-data/junior-jazz-roster.xlsx";

async function main() {
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 2,
  });

  // Surface client-side failures instead of hanging on a selector that will
  // never appear because the page threw while rendering.
  page.on("pageerror", (err) => console.error(`  PAGE ERROR: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error(`  CONSOLE ERROR: ${msg.text()}`);
  });

  const shot = async (name: string) => {
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log(`  ${OUT}/${name}.png`);
  };

  console.log("1. Empty state");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Drop the spreadsheet here");
  await shot("1-upload");

  console.log("2. Roster mapped");
  await page.setInputFiles('input[type="file"]', ROSTER);
  await page.waitForSelector("text=Check the columns", { timeout: 20000 });
  await page.waitForSelector("text=Ella Rodriguez");
  await page.fill('input[placeholder="e.g. Tues 5pm Junior Jazz"]', "Tues 5pm Junior Jazz");
  await shot("2-roster");

  console.log("3. Costume found by style number");
  await page.click("text=Choose the costume →");
  await page.waitForSelector("text=Which costume is this class wearing?");
  await page.fill('input[placeholder*="27776"]', "27776");
  await page.click("text=Find costume");
  await page.waitForSelector("text=YOU CAN'T STOP THE BEAT", { timeout: 30000 });
  await shot("3-costume");

  console.log("4. Results, sized against the real chart");
  await page.click("text=Size this class →");
  await page.waitForSelector("text=What will be ordered", { timeout: 30000 });
  await shot("4-results");

  await browser.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
