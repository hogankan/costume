import { awishcometrueAdapter } from "../vendors/awishcometrue";
import { laylasAdapter } from "../vendors/laylas";
import { revolutionAdapter } from "../vendors/revolution";
import { weissmanAdapter } from "../vendors/weissman";

/**
 * Read the block a studio writes above each class table:
 *
 *   Santa Train (Patty Loveless) — Ballet
 *   Teacher        Julie
 *   Class          3/4 year olds — Sundays
 *   COSTUME        A Wish 10096Y // 16179G (boy)
 *   Costume notes  Barefoot
 *
 * The costume line is what lets a whole workbook be sized without anyone
 * typing the costume in again.
 */

export interface ClassMeta {
  /** First line of the sheet, usually the dance or song name. */
  title?: string;
  teacher?: string;
  classLabel?: string;
  costumeText?: string;
  costumeNotes?: string;
}

export type ParsedCostume =
  | {
      status: "selected";
      companySlug: string;
      /** The main costume's pieces, worn by everyone not marked for the alternate. */
      pieces: string[];
      /** A second costume for some dancers, e.g. the boys' top and pants. */
      alternate?: { pieces: string[]; label: string };
      raw: string;
    }
  | { status: "not-selected"; raw: string }
  | { status: "unreadable"; raw: string; reason: string };

const LABELS: { key: keyof ClassMeta; pattern: RegExp }[] = [
  // Order matters: "Costume notes" must be tested before "Costume".
  { key: "costumeNotes", pattern: /^costume\s*notes?\s*:?$/i },
  { key: "costumeText", pattern: /^costumes?\s*:?$/i },
  { key: "teacher", pattern: /^(teacher|instructor)\s*:?$/i },
  { key: "classLabel", pattern: /^class\s*:?$/i },
];

const PLACEHOLDER = /^[\s—–-]*$/;

const cellText = (c: unknown): string => (c == null ? "" : String(c).trim());

export function readClassMeta(rows: unknown[][], headerRow: number): ClassMeta {
  const meta: ClassMeta = {};

  for (let i = 0; i < Math.min(headerRow, rows.length); i++) {
    const cells = (rows[i] ?? []).map(cellText).filter((c) => c.length > 0);
    if (cells.length === 0) continue;

    const label = LABELS.find((l) => l.pattern.test(cells[0]));
    if (label) {
      const value = cells.slice(1).join(" ").trim();
      if (value && !PLACEHOLDER.test(value) && meta[label.key] === undefined) {
        meta[label.key] = value;
      }
      continue;
    }

    // "Teacher: Julie" written in a single cell.
    const inline = /^([a-z ]+?)\s*:\s*(.+)$/i.exec(cells[0]);
    const inlineLabel = inline && LABELS.find((l) => l.pattern.test(inline[1]));
    if (inline && inlineLabel) {
      if (meta[inlineLabel.key] === undefined) meta[inlineLabel.key] = inline[2].trim();
      continue;
    }

    if (meta.title === undefined) meta.title = cells.join(" ");
  }

  return meta;
}

/** How studios write each vendor's name. Longest names are tried first. */
const VENDOR_ALIASES: { slug: string; pattern: RegExp }[] = [
  { slug: "awishcometrue", pattern: /\b(a\s*wish\s*come\s*true|a\s*wish|awct)\b/i },
  { slug: "weissman", pattern: /\b(weissman|weiss)\b/i },
  { slug: "laylas", pattern: /\b(layla['’]?s|laylas|layla)\b/i },
  { slug: "revolution", pattern: /\b(revolution|rev)\b/i },
];

const STYLE_PARSERS: Record<string, (s: string) => string | null> = {
  awishcometrue: (s) => awishcometrueAdapter.parseStyleNumber(s),
  weissman: (s) => weissmanAdapter.parseStyleNumber(s),
  laylas: (s) => laylasAdapter.parseStyleNumber(s),
  revolution: (s) => revolutionAdapter.parseStyleNumber(s),
};

const NOT_SELECTED = /^(not\s+selected(\s+yet)?|tbd|tba|none|n\/a|pending|\?+)$/i;

/**
 * "A Wish 10096Y // 16179G (boy)" -> A Wish Come True, 10096Y, with 16179G as
 * the boys' alternate.
 */
export function parseCostumeText(raw: string | undefined): ParsedCostume {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text || PLACEHOLDER.test(text) || NOT_SELECTED.test(text)) {
    return { status: "not-selected", raw: text };
  }

  const vendor = VENDOR_ALIASES.find((v) => v.pattern.test(text));
  if (!vendor) {
    return {
      status: "unreadable",
      raw: text,
      reason: "No costume company named (expected A Wish, Weissman, Layla's or Revolution).",
    };
  }

  const rest = text.replace(vendor.pattern, " ");
  const sides = rest.split(/\s*(?:\/\/|\|)\s*|\s+\/\s+/).map((p) => p.trim()).filter(Boolean);
  const parse = STYLE_PARSERS[vendor.slug];

  // Each side of "//" is one group of dancers; within a side, "+", "&", ","
  // or "and" separate the pieces of that costume ("16179G + 13182 (boy)").
  const groups = sides
    .map((side) => {
      const label = /\(([^)]+)\)/.exec(side)?.[1]?.trim();
      const pieces = side
        .replace(/\([^)]*\)/g, " ")
        .split(/\s*(?:\+|&|,|\band\b)\s*/i)
        .map((part) => (part.trim() ? parse(part) : null))
        .filter((style): style is string => style !== null);
      return { pieces, label };
    })
    .filter((g) => g.pieces.length > 0);

  if (groups.length === 0) {
    return { status: "unreadable", raw: text, reason: "No style number found." };
  }

  // The labelled group is the alternate, whichever order it was written in.
  const boyish = (l?: string) => Boolean(l && /\b(boys?|guys?|male|men)\b/i.test(l));
  if (groups.length > 1 && boyish(groups[0].label) && !boyish(groups[1].label)) {
    groups.reverse();
  }
  const [first, second] = groups;
  return {
    status: "selected",
    companySlug: vendor.slug,
    pieces: first.pieces,
    ...(second ? { alternate: { pieces: second.pieces, label: second.label ?? "alternate" } } : {}),
    raw: text,
  };
}
