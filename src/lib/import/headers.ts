/**
 * Map a studio's own spreadsheet columns onto the fields the sizer needs.
 *
 * Studios keep their measurements in whatever shape they already use, so the app
 * guesses a mapping, shows it for confirmation, and remembers the answer. The
 * guess is deliberately conservative: a wrong auto-map that nobody notices is far
 * worse than an unmapped column the user has to point at.
 */

export const IMPORT_FIELDS = [
  "name",
  "firstName",
  "lastName",
  "externalId",
  "girth",
  "bust",
  "waist",
  "hips",
  "inseam",
  "height",
  "colorway",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Girth is the only field a dancer cannot be sized without. */
export const REQUIRED_FIELDS: ImportField[] = ["girth"];

/**
 * Synonyms are matched against a normalised header (lower-cased, punctuation and
 * unit suffixes stripped). Order matters only for readability.
 */
const SYNONYMS: Record<ImportField, string[]> = {
  name: ["name", "dancer", "student", "dancer name", "student name", "full name", "child"],
  firstName: ["first", "first name", "fname", "given name"],
  lastName: ["last", "last name", "lname", "surname", "family name"],
  externalId: ["id", "student id", "dancer id", "studentid", "number", "student number"],
  girth: ["girth", "g", "torso", "shoulder to crotch"],
  bust: ["bust", "chest", "chest bust", "bust chest"],
  waist: ["waist", "natural waist"],
  hips: ["hip", "hips", "hip circumference"],
  inseam: ["inseam", "in seam", "leg", "leg length"],
  height: ["height", "ht", "tall"],
  colorway: ["color", "colour", "costume color", "costume colour", "shade"],
};

/** Headers that look like measurements but are not the ones we want. */
const NEGATIVE = ["shoe", "sock", "tights", "head", "hat", "glove", "age", "grade", "phone", "email"];

export interface HeaderGuess {
  column: string;
  index: number;
  field: ImportField | null;
  confidence: "exact" | "likely" | "none";
}

const normalise = (header: string): string =>
  header
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // drop "(in)", "(inches)"
    .replace(/\b(in|inch|inches|cm|centimeters?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Guess a field for each column. A field is never assigned twice: the strongest
 * match wins and later columns fall back to their next-best option.
 */
export function guessMapping(headers: string[]): HeaderGuess[] {
  const scored = headers.map((column, index) => {
    const n = normalise(column);
    const candidates: { field: ImportField; confidence: "exact" | "likely" }[] = [];

    if (n && !NEGATIVE.some((bad) => n.includes(bad))) {
      for (const field of IMPORT_FIELDS) {
        const synonyms = SYNONYMS[field];
        if (synonyms.includes(n)) {
          candidates.push({ field, confidence: "exact" });
        } else if (
          synonyms.some((s) => s.length > 2 && (n.includes(s) || s.includes(n)))
        ) {
          candidates.push({ field, confidence: "likely" });
        }
      }
    }
    return { column, index, candidates };
  });

  const taken = new Set<ImportField>();
  const result: HeaderGuess[] = headers.map((column, index) => ({
    column,
    index,
    field: null,
    confidence: "none" as const,
  }));

  // Exact matches first, so a column headed "Waist" always beats one headed
  // "Waistband notes" for the waist field.
  for (const level of ["exact", "likely"] as const) {
    for (const s of scored) {
      if (result[s.index].field) continue;
      const pick = s.candidates.find((c) => c.confidence === level && !taken.has(c.field));
      if (!pick) continue;
      taken.add(pick.field);
      result[s.index] = {
        column: s.column,
        index: s.index,
        field: pick.field,
        confidence: level,
      };
    }
  }

  return result;
}

/**
 * Locate the header row. Studios often put a title, a date, or a blank line above
 * the real headers, so the first row is not reliable.
 */
export function detectHeaderRow(rows: unknown[][], searchDepth = 10): number {
  let best = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(rows.length, searchDepth); i++) {
    const cells = rows[i].map((c) => (c == null ? "" : String(c)));
    const guesses = guessMapping(cells);
    const mapped = guesses.filter((g) => g.field !== null).length;
    const nonEmpty = cells.filter((c) => c.trim().length > 0).length;
    // Recognised fields dominate; non-empty cells break ties.
    const score = mapped * 10 + nonEmpty;
    if (mapped > 0 && score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

export function missingRequired(mapping: HeaderGuess[]): ImportField[] {
  const present = new Set(mapping.map((m) => m.field).filter(Boolean) as ImportField[]);
  return REQUIRED_FIELDS.filter((f) => !present.has(f));
}

/** A stable fingerprint of a sheet's headers, so a mapping can be remembered. */
export function headerFingerprint(headers: string[]): string {
  return headers
    .map((h) => normalise(h))
    .filter((h) => h.length > 0)
    .sort()
    .join("|");
}
