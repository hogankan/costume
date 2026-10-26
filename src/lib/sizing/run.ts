import { matchSize, SizingError } from "./match";
import type { SizeChart, SizingOptions } from "./types";
import type { ImportedDancer } from "../import/parse";
import type { ExportAssignment } from "../export/orderSheet";

/**
 * Size a whole class against its costume.
 *
 * A class is the ordering unit: every dancer on the roster gets the same
 * costume, though individual dancers may take a different colourway.
 */

export class UnconfirmedChartError extends Error {}

export interface RunCostume {
  companyName: string;
  styleNumber: string;
  name: string;
  /** Codes orderable for this costume, which may be narrower than the chart. */
  availableSizes: string[];
  /** Applied to any dancer whose row did not name a colour. */
  defaultColorway?: string;
}

export interface RunInput {
  className: string;
  costume: RunCostume;
  chart: SizeChart;
  dancers: ImportedDancer[];
  options?: SizingOptions;
}

export interface SkippedDancer {
  dancerName: string;
  rowNumber: number;
  reason: string;
}

export interface RunResult {
  assignments: ExportAssignment[];
  /** Dancers who could not be sized at all, and why. */
  skipped: SkippedDancer[];
}

export function runSizing(input: RunInput): RunResult {
  const { className, costume, chart, dancers, options } = input;

  // The whole point of the confirmation step is that nothing may be ordered off
  // a chart no human has checked against its image.
  if (chart.status !== "confirmed") {
    throw new UnconfirmedChartError(
      `Chart "${chart.id}" (${chart.companySlug} ${chart.variant}) has not been confirmed. ` +
        `Review it against its source image before sizing ${className}.`,
    );
  }

  const assignments: ExportAssignment[] = [];
  const skipped: SkippedDancer[] = [];

  for (const dancer of dancers) {
    if (dancer.girth == null) {
      skipped.push({
        dancerName: dancer.name || `(row ${dancer.rowNumber})`,
        rowNumber: dancer.rowNumber,
        reason: dancer.notes
          ? `No girth measurement on file (sheet says: "${dancer.notes}").`
          : "No girth measurement on file; girth decides the size.",
      });
      continue;
    }

    try {
      const result = matchSize(
        {
          girth: dancer.girth,
          bust: dancer.bust,
          waist: dancer.waist,
          hips: dancer.hips,
          inseam: dancer.inseam,
          height: dancer.height,
        },
        chart,
        costume.availableSizes,
        options,
      );

      assignments.push({
        className,
        dancerName: dancer.name || `(row ${dancer.rowNumber})`,
        rowNumber: dancer.rowNumber,
        companyName: costume.companyName,
        styleNumber: costume.styleNumber,
        costumeName: costume.name,
        colorway: dancer.colorway ?? costume.defaultColorway,
        recommendedSize: result.size,
        rawGirth: result.rawGirth,
        matchedGirth: result.matchedGirth,
        rationale: result.rationale,
        flags: result.flags,
      });
    } catch (err) {
      if (err instanceof SizingError) {
        skipped.push({
          dancerName: dancer.name || `(row ${dancer.rowNumber})`,
          rowNumber: dancer.rowNumber,
          reason: err.message,
        });
        continue;
      }
      throw err;
    }
  }

  return { assignments, skipped };
}
