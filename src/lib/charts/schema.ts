import { z } from "zod";

/**
 * Shape the model must return when reading a vendor's size-chart image.
 *
 * Every optional field is `.nullable()` rather than `.optional()` because strict
 * structured outputs require each declared key to be present; a missing column on
 * the printed chart comes back as an explicit null instead of an absent key.
 */

export const ExtractedRange = z.object({
  min: z.number().nullable().describe("Low end of the printed range; null if the chart left it open."),
  max: z.number().nullable().describe("High end of the printed range; null if the chart left it open."),
});

export const ExtractedRow = z.object({
  code: z
    .string()
    .describe(
      'Exact size code as printed, e.g. "MC". Long variants such as "ICL", "MCL", "SAL" are DISTINCT sizes and must be their own rows - never merge them into the base code.',
    ),
  label: z.string().nullable().describe('Spelled-out name if printed, e.g. "Medium Child".'),
  ordinal: z.number().int().describe("0-based position in the chart, smallest size first."),
  girth: ExtractedRange,
  bust: ExtractedRange.nullable().describe("Bust or chest. Null if the chart has no such column."),
  waist: ExtractedRange.nullable(),
  hips: ExtractedRange.nullable(),
  inseam: ExtractedRange.nullable(),
  height: ExtractedRange.nullable(),
});

export const ExtractedChart = z.object({
  variant: z
    .string()
    .describe(
      'Which population this chart covers, as a slug: "child-girls", "child-boys", "child-unisex", "adult-womens", "adult-mens", "adult-unisex", or "other".',
    ),
  unit: z.enum(["in", "cm"]).describe("Unit of the numbers as printed on the chart."),
  primaryMeasurement: z
    .enum(["girth", "bust", "waist", "hips", "inseam", "height"])
    .nullable()
    .describe(
      'The measurement that decides the size. "girth" whenever the chart prints it. Some charts - typically boys and mens, whose costumes are two-piece - have no girth column at all and are sized on chest; those return "bust".',
    ),
  rows: z.array(ExtractedRow).describe("One entry per size row, smallest first."),
  notes: z
    .array(z.string())
    .describe(
      "Any caveat printed on the chart that a numeric matcher could not infer, e.g. that a size fits a larger child rather than a petite adult.",
    ),
});

export type ExtractedChart = z.infer<typeof ExtractedChart>;
export type ExtractedRow = z.infer<typeof ExtractedRow>;
export type ExtractedRange = z.infer<typeof ExtractedRange>;

export const EXTRACTION_PROMPT = `You are reading a dance-costume size chart from an image so that a studio can order costumes that actually fit. Transcribe it exactly. Accuracy matters more than completeness: a misread digit puts a child in a costume she cannot wear on recital day.

Rules:

1. Transcribe only what is printed. Never interpolate a missing value, never "tidy up" a range, and never infer a row that is not shown.

2. Ranges appear in several forms. Normalise all of them to {min, max}:
   - "43-46", "43 - 46", "43–46" (en dash) -> {min: 43, max: 46}
   - a single number "46" -> {min: 46, max: 46}
   - "46 and up", "46+" -> {min: 46, max: null}
   - "up to 46", "under 46" -> {min: null, max: 46}
   - fractions like "43 1/2" -> 43.5

3. LONG SIZES ARE SEPARATE SIZES. Codes ending in L such as ICL, MCL, LCL, SAL, XSAL are their own rows with their own girth, NOT annotations on IC, MC, SA. If the chart shows both IC and ICL, emit two rows. This is the single most common transcription error on these charts and it produces unwearable recommendations.

4. Charts may run either way: sizes down the rows with measurements across the columns, or sizes across the columns with measurements down the rows. Work out the orientation before transcribing, and check that the girth values increase as sizes get larger - if they do not, you have read the chart in the wrong direction.

5. Report the unit exactly as printed. Do not convert. If the chart prints both inches and centimetres, transcribe the INCHES and set unit to "in".

6. ordinal is 0-based, smallest size first, following the order the chart itself presents. Where regular and long sizes interleave, keep the chart's own ordering.

7. Put any printed caveat into notes verbatim - for example a note that certain sizes are cut for a larger child rather than a petite adult. These carry ordering rules that the numbers alone do not.

Transcribe the chart now.`;
