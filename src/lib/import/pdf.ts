import { getDocumentProxy } from "unpdf";
import type { ParsedSheet } from "./parse";
import { guessMapping } from "./headers";

/**
 * Read a PDF of a measurement sheet - the kind saved from Excel or Google
 * Sheets - back into the same grid of cells a spreadsheet upload produces, one
 * "sheet" per page. Everything after this point (header detection, the costume
 * line, sizing) is shared with the spreadsheet path.
 *
 * Only the PDF's own text is used. A scanned or photographed sheet has no text
 * layer and is rejected with a clear message rather than guessed at, because a
 * misread girth silently produces a costume that cannot be worn.
 */

export class PdfReadError extends Error {}

interface Item {
  text: string;
  x: number;
  y: number;
  width: number;
}

interface Line {
  y: number;
  items: Item[];
}

/** Text on the same printed row can sit a fraction of a point apart. */
const LINE_TOLERANCE = 2.5;
/** Header words closer than this are one header ("First" + "Name"). */
const HEADER_JOIN_GAP = 4;

const PAGE_FOOTER = /^(.*?)\s*[—–-]\s*page\s+\d+\s+of\s+\d+\s*$/i;

export async function parsePdf(data: ArrayBuffer | Buffer | Uint8Array): Promise<ParsedSheet[]> {
  const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data);
  let pdf;
  try {
    pdf = await getDocumentProxy(bytes);
  } catch (err) {
    throw new PdfReadError(
      `That PDF could not be opened (${err instanceof Error ? err.message : String(err)}).`,
    );
  }

  const sheets: ParsedSheet[] = [];
  let anyText = false;

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const raw of content.items as { str?: string; transform?: number[]; width?: number }[]) {
      const text = raw.str?.trim();
      if (!text || !raw.transform) continue;
      items.push({ text, x: raw.transform[4], y: raw.transform[5], width: raw.width ?? 0 });
    }
    if (items.length > 0) anyText = true;
    sheets.push(pageToSheet(items, n));
  }

  if (!anyText) {
    throw new PdfReadError(
      "This PDF has no readable text - it looks like a scan or a photo. Export the sheet from Excel or Google Sheets (as .xlsx, .csv, or a PDF saved from there) and upload that instead.",
    );
  }
  return sheets;
}

function groupLines(items: Item[]): Line[] {
  // PDF y runs upwards, so the top of the page has the largest y.
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const item of sorted) {
    const line = lines.find((l) => Math.abs(l.y - item.y) <= LINE_TOLERANCE);
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => b.y - a.y);
}

/** Join header words that sit right next to each other into one header. */
function joinHeaderItems(items: Item[]): Item[] {
  const out: Item[] = [];
  for (const item of items) {
    const prev = out[out.length - 1];
    if (prev && item.x - (prev.x + prev.width) < HEADER_JOIN_GAP) {
      prev.text = `${prev.text} ${item.text}`;
      prev.width = item.x + item.width - prev.x;
    } else {
      out.push({ ...item });
    }
  }
  return out;
}

/** The table header is the line that names girth and at least three other fields. */
function findHeaderLine(lines: Line[]): number {
  for (let i = 0; i < lines.length; i++) {
    const headers = joinHeaderItems(lines[i].items).map((it) => it.text);
    const mapped = guessMapping(headers).filter((g) => g.field !== null);
    if (mapped.some((g) => g.field === "girth") && mapped.length >= 4) return i;
  }
  return -1;
}

function pageToSheet(items: Item[], pageNumber: number): ParsedSheet {
  let name = `Page ${pageNumber}`;
  const body: Item[] = [];
  for (const item of items) {
    const footer = PAGE_FOOTER.exec(item.text);
    if (footer) {
      if (footer[1].trim()) name = footer[1].trim();
      continue;
    }
    body.push(item);
  }

  const lines = groupLines(body);
  const headerIdx = findHeaderLine(lines);

  // No recognisable table: keep each line's text in reading order so the page
  // is still visible (and ignored, if it is a summary).
  if (headerIdx < 0) {
    return { name, rows: lines.map((l) => l.items.map((it) => it.text)) };
  }

  const headers = joinHeaderItems(lines[headerIdx].items);
  const centers = headers.map((h) => h.x + h.width / 2);

  const rows: unknown[][] = [];
  for (let i = 0; i < headerIdx; i++) rows.push(lines[i].items.map((it) => it.text));
  rows.push(headers.map((h) => h.text));

  // A table row always has at least two cells (a number and a name, say). A lone
  // line under the table is a footnote, not a dancer.
  const tableLines = lines.slice(headerIdx + 1).filter((l) => l.items.length >= 2);
  const columnOf = assignColumns(tableLines, centers);
  for (const line of tableLines) {
    const row: (string | null)[] = headers.map(() => null);
    for (const item of line.items) {
      const col = columnOf.get(item)!;
      row[col] = row[col] ? `${row[col]} ${item.text}` : item.text;
    }
    rows.push(row);
  }

  return { name, rows };
}

/**
 * Work out which column each piece of text belongs to.
 *
 * Spreadsheets left-align names but centre numbers and headers, so a short name
 * ("Al") can sit closer to the previous column's header than its own. Text that
 * shares a left edge down the page is one column, so those items are placed
 * together, by the centre of everything in that stack.
 */
function assignColumns(lines: Line[], centers: number[]): Map<Item, number> {
  const stacks = new Map<number, Item[]>();
  for (const line of lines) {
    for (const item of line.items) {
      const key = Math.round(item.x);
      const stack = stacks.get(key) ?? [];
      stack.push(item);
      stacks.set(key, stack);
    }
  }

  const nearest = (x: number) =>
    centers.reduce((best, c, i) => (Math.abs(c - x) < Math.abs(centers[best] - x) ? i : best), 0);

  const out = new Map<Item, number>();
  for (const stack of stacks.values()) {
    const left = Math.min(...stack.map((it) => it.x));
    const right = Math.max(...stack.map((it) => it.x + it.width));
    const col = nearest((left + right) / 2);
    for (const item of stack) out.set(item, col);
  }
  return out;
}
