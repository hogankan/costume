/**
 * Measurement parsing with no spreadsheet dependency, so the browser can use it
 * for measurements typed into the app as well as the server for uploaded sheets.
 */

/**
 * Parse a measurement cell.
 *
 * Handles plain numbers, decimals, inch marks, and the mixed fractions that turn
 * up constantly on tailoring sheets ("44 1/2", "44½").
 */
export function parseMeasurement(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  let s = String(raw).trim();
  if (s.length === 0) return null;

  // Vulgar fractions.
  const VULGAR: Record<string, number> = {
    "¼": 0.25,
    "½": 0.5,
    "¾": 0.75,
    "⅛": 0.125,
    "⅜": 0.375,
    "⅝": 0.625,
    "⅞": 0.875,
    "⅓": 1 / 3,
    "⅔": 2 / 3,
  };
  let vulgarBonus = 0;
  for (const [glyph, value] of Object.entries(VULGAR)) {
    if (s.includes(glyph)) {
      vulgarBonus = value;
      s = s.replace(glyph, " ");
    }
  }

  s = s.replace(/["”″]/g, " ").replace(/\b(in|inch|inches|cm)\b/gi, " ").trim();

  // "44 1/2"
  const mixed = /^(-?\d+(?:\.\d+)?)\s+(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (mixed) {
    const denom = Number(mixed[3]);
    if (denom === 0) return null;
    return Number(mixed[1]) + Number(mixed[2]) / denom;
  }

  // "1/2"
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (frac) {
    const denom = Number(frac[2]);
    return denom === 0 ? null : Number(frac[1]) / denom;
  }

  const plain = /^-?\d+(?:\.\d+)?$/.exec(s);
  if (plain) return Number(plain[0]) + vulgarBonus;

  // A bare vulgar fraction such as "½".
  if (vulgarBonus > 0 && s.length === 0) return vulgarBonus;

  return null;
}
