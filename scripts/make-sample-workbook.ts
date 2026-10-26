/**
 * Write a sample costume workbook - one tab per class with the costume written
 * above each table - plus a PDF of it, laid out like the sizing sheets studios
 * actually send. Names and measurements are invented.
 *
 *   npx tsx scripts/make-sample-workbook.ts
 *
 * Writes sample-data/holiday-costume-workbook.xlsx and .pdf. The PDF is also the
 * fixture the PDF reader is tested against, so regenerate both together.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { chromium } from "playwright";

const OUT = "sample-data";
const BASE = `${OUT}/holiday-costume-workbook`;

interface Dancer {
  first: string | number;
  last: string;
  show?: string;
  m?: [number, number, number, number, number, number]; // chest waist hips girth inseam height
  note?: string;
}

interface ClassTab {
  tab: string;
  title: string;
  teacher: string;
  classLabel: string;
  costume: string;
  notes: string;
  withShow: boolean;
  dancers: Dancer[];
}

const CLASSES: ClassTab[] = [
  {
    tab: "Jingle Hop - Ms Ana 3-4",
    title: "Jingle Hop (Sample Song) — Ballet",
    teacher: "Ana",
    classLabel: "3/4 year olds — Sundays",
    costume: "A Wish 10096Y  //  16179G (boy)",
    notes: "Boys wear the guy top.",
    withShow: true,
    dancers: [
      { first: "Avery", last: "Lindqvist", show: "12:00pm", m: [23, 21, 23, 41, 16, 42] },
      { first: "Theo", last: "Marchetti", show: "12:00pm", m: [23, 23, 24, 40, 16, 40] },
      { first: "Bo", last: "Ng", show: "12:00pm", m: [22, 21, 23, 38, 14, 38] },
      { first: "Clementine", last: "Oyelaran", show: "12:00pm", note: "Measurements not taken yet" },
      { first: "Ivy", last: "Pellegrino", show: "3:00pm", m: [26, 24, 29, 45, 20, 46] },
      { first: "Juniper", last: "Quist", show: "3:00pm", m: [24, 22, 24, 44, 19, 43] },
    ],
  },
  {
    tab: "Snow Day - Mr Lee 5-6",
    title: "Snow Day (Sample Song) — Tap",
    teacher: "Lee",
    classLabel: "5/6 year olds — Sundays",
    costume: "NOT SELECTED YET",
    notes: "—",
    withShow: true,
    dancers: [
      { first: "Marisol", last: "Abernathy", show: "12:00pm", m: [23, 23, 26, 45, 22, 50] },
      // Excel turned this dancer's name into a date.
      { first: 46174, last: "Brightwater", show: "6:00pm", m: [27, 25, 29, 46, 23, 54] },
      { first: "Odessa", last: "Carrow", show: "6:00pm", note: "On class roster but NOT on measurement sheet" },
    ],
  },
  {
    tab: "Musical Theater - Weiss",
    title: "Musical Theater",
    teacher: "—",
    classLabel: "Musical Theater",
    costume: "Weissman 19544",
    notes: "With black jazz shoes",
    withShow: false,
    dancers: [
      { first: "Rowan", last: "Delacroix", m: [30, 26, 33, 55, 27, 59] },
      { first: "Saoirse", last: "Esposito", m: [35, 32, 37, 60, 36, 63] },
      { first: "Tamsin", last: "Fairweather", m: [33, 28, 37, 59, 25, 61] },
    ],
  },
  {
    tab: "Intermediate - Ms Kay",
    title: "Rockin' Sample Song — Jazz",
    teacher: "Kay",
    classLabel: "Intermediate — Saturdays",
    costume: "NOT SELECTED YET",
    notes: "—",
    withShow: false,
    dancers: [
      // Same dancer as Musical Theater, with an inseam that disagrees.
      { first: "Saoirse", last: "Esposito", m: [35, 32, 37, 60, 26, 63] },
      { first: "Ulla", last: "Gunnarsdottir", note: "Measurements not taken yet" },
    ],
  },
];

const FOOTNOTE =
  "Measurements in inches. Size column left blank to fill in. Orange rows = missing measurements.";

function headerRow(c: ClassTab): string[] {
  return [
    "#",
    ...(c.withShow ? ["Show"] : []),
    "First Name",
    "Last Name",
    "Size",
    "Chest",
    "Waist",
    "Hips",
    "Girth",
    "Inseam",
    "Height",
    "Notes",
  ];
}

function tableRows(c: ClassTab): unknown[][] {
  return c.dancers.map((d, i) => [
    i + 1,
    ...(c.withShow ? [d.show ?? null] : []),
    d.first,
    d.last,
    null,
    ...(d.m ?? [null, null, null, null, null, null]),
    d.note ?? null,
  ]);
}

function classSheet(c: ClassTab): XLSX.WorkSheet {
  const rows: unknown[][] = [
    [c.title],
    ["Teacher", c.teacher],
    ["Class", c.classLabel],
    ["COSTUME", c.costume],
    ["Costume notes", c.notes],
    [],
    headerRow(c),
    ...tableRows(c),
    [],
    [FOOTNOTE],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // The date-as-name dancer is a real date cell, as Excel would store it.
  for (let r = 7; r < 7 + c.dancers.length; r++) {
    const col = c.withShow ? 2 : 1;
    const ref = XLSX.utils.encode_cell({ r, c: col });
    if (typeof ws[ref]?.v === "number") ws[ref].z = "yyyy-mm-dd hh:mm";
  }
  return ws;
}

function summarySheet(): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet([
    ["Holiday Costumes — by Dance"],
    [],
    ["Sheet", "Dance / Song", "Teacher", "Costume", "# Dancers", "Missing measurements"],
    ...CLASSES.map((c) => [
      c.tab,
      c.title,
      c.teacher,
      c.costume,
      c.dancers.length,
      c.dancers.filter((d) => !d.m).length,
    ]),
  ]);
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!);

/** Render each tab as a page, the way Excel's "Save as PDF" lays it out. */
function html(): string {
  const pages = [
    `<section><h1>Holiday Costumes — by Dance</h1>
      <table><tr>${["Sheet", "Dance / Song", "Teacher", "Costume", "# Dancers"].map((h) => `<th>${h}</th>`).join("")}</tr>
      ${CLASSES.map((c) => `<tr><td class="l">${esc(c.tab)}</td><td class="l">${esc(c.title)}</td><td class="l">${esc(c.teacher)}</td><td class="l">${esc(c.costume)}</td><td>${c.dancers.length}</td></tr>`).join("")}
      </table><p class="foot">Summary — Page 1 of ${CLASSES.length + 1}</p></section>`,
    ...CLASSES.map((c, p) => {
      const head = headerRow(c);
      const body = tableRows(c)
        .map(
          (r) =>
            `<tr>${r
              .map((v, i) => {
                const name = head[i] === "First Name" || head[i] === "Last Name" || head[i] === "Notes";
                const text =
                  typeof v === "number" && head[i] === "First Name" ? "2026-06-01 00:00:" : v;
                return `<td class="${name ? "l" : ""}">${esc(text)}</td>`;
              })
              .join("")}</tr>`,
        )
        .join("");
      return `<section><h1>${esc(c.title)}</h1>
        <div class="meta"><b>Teacher</b> ${esc(c.teacher)}</div>
        <div class="meta"><b>Class</b> ${esc(c.classLabel)}</div>
        <div class="meta"><b>COSTUME</b> ${esc(c.costume)}</div>
        <div class="meta"><b>Costume notes</b> ${esc(c.notes)}</div>
        <table><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${body}</table>
        <p class="note">${FOOTNOTE}</p>
        <p class="foot">${esc(c.tab)} — Page ${p + 2} of ${CLASSES.length + 1}</p></section>`;
    }),
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font: 10px Arial, sans-serif; margin: 0; }
    section { page-break-after: always; position: relative; height: 7.5in; padding: 0.3in; }
    h1 { font-size: 13px; margin: 0 0 4px; }
    .meta b { display: inline-block; width: 90px; }
    table { border-collapse: collapse; margin-top: 10px; }
    th { background: #1f3864; color: #fff; padding: 1px 10px; text-align: center; }
    td { border: 1px solid #ccc; padding: 1px 10px; text-align: center; min-width: 26px; }
    td.l { text-align: left; min-width: 60px; }
    .note { color: #888; font-style: italic; margin-top: 14px; }
    .foot { position: absolute; bottom: 0.2in; left: 0; right: 0; text-align: center; }
  </style></head><body>${pages.join("")}</body></html>`;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summarySheet(), "Summary");
  for (const c of CLASSES) XLSX.utils.book_append_sheet(wb, classSheet(c), c.tab);
  writeFileSync(`${BASE}.xlsx`, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
  console.log(`  ${BASE}.xlsx`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html());
  await page.pdf({ path: `${BASE}.pdf`, format: "Letter", landscape: true, printBackground: true });
  await browser.close();
  console.log(`  ${BASE}.pdf`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
