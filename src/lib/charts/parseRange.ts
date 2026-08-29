import type { ExtractedRange } from "./schema";

/**
 * Parse a size-chart cell as a person would type it while reading the chart.
 *
 * Charts print ranges in several forms and typing them as two separate numbers
 * doubles the number of fields and the number of chances to make a mistake, so a
 * single cell accepts whatever the chart itself shows.
 */
export function parseRangeInput(raw: string): ExtractedRange | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null; // the chart has no such column

  // Strip inch marks and unit words; keep digits, separators and fractions.
  const s = trimmed
    .replace(/["”″]/g, " ")
    .replace(/\b(in|inch|inches|cm)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const num = (t: string): number | null => {
    const cleaned = t.trim();
    // Mixed fraction, e.g. "43 1/2"
    const mixed = /^(\d+(?:\.\d+)?)\s+(\d+)\s*\/\s*(\d+)$/.exec(cleaned);
    if (mixed) {
      const d = Number(mixed[3]);
      return d === 0 ? null : Number(mixed[1]) + Number(mixed[2]) / d;
    }
    const vulgar: Record<string, number> = {
      "¼": 0.25, "½": 0.5, "¾": 0.75,
      "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
    };
    for (const [glyph, value] of Object.entries(vulgar)) {
      if (cleaned.endsWith(glyph)) {
        const head = cleaned.slice(0, -glyph.length).trim();
        if (head === "") return value;
        return /^\d+$/.test(head) ? Number(head) + value : null;
      }
    }
    return /^\d+(?:\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
  };

  // "46 and up" / "46+"
  const openTop = /^(.+?)\s*(?:\+|and up|and over|up)$/i.exec(s);
  if (openTop) {
    const min = num(openTop[1]);
    return min === null ? "invalid" : { min, max: null };
  }

  // "up to 46" / "under 46"
  const openBottom = /^(?:up to|under|below)\s+(.+)$/i.exec(s);
  if (openBottom) {
    const max = num(openBottom[1]);
    return max === null ? "invalid" : { min: null, max };
  }

  // "43-46", "43 – 46", "43 to 46"
  const range = /^(.+?)\s*(?:-|–|—|to)\s*(.+)$/i.exec(s);
  if (range) {
    const min = num(range[1]);
    const max = num(range[2]);
    if (min === null || max === null) return "invalid";
    return { min, max };
  }

  // A single value means the chart printed one number for that size.
  const single = num(s);
  return single === null ? "invalid" : { min: single, max: single };
}

/** Render a stored range back into the compact form the chart uses. */
export function formatRangeInput(r: ExtractedRange | null): string {
  if (!r) return "";
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))));
  if (r.min === null && r.max === null) return "";
  if (r.min === null) return `up to ${fmt(r.max as number)}`;
  if (r.max === null) return `${fmt(r.min)}+`;
  if (r.min === r.max) return fmt(r.min);
  return `${fmt(r.min)}-${fmt(r.max)}`;
}
