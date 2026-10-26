/**
 * Work out which chart in the library applies to a costume.
 *
 * A costume's orderable size codes are the discriminator. Weissman publishes its
 * vocabularies explicitly - girls run T/XXSC/XSC/SC/IC/ICL/MC/MCL/LC/XLC/XXLC,
 * women's run XSA/SA/SAL/MA/LA/XLA/XXLA - so the codes a product offers usually
 * identify the chart outright, with no separate lookup table.
 *
 * Where two charts genuinely share a vocabulary the resolver returns candidates
 * rather than guessing, and a human picks once. Guessing here would mis-size an
 * entire class silently, which is exactly the failure this app exists to prevent.
 */

export interface ChartCandidate {
  id: string;
  variant: string;
  sizeCodes: string[];
  label?: string;
  /** The chart image this entry was read from, if known. */
  sourceImageUrl?: string;
}

export type ResolutionConfidence = "exact" | "high" | "ambiguous" | "unmatched";

export interface ChartResolution {
  /** Null whenever a human must choose - `ambiguous` or `unmatched`. */
  chart: ChartCandidate | null;
  /**
   * Set when no single chart covers the costume but two charts do between
   * them - a costume made in both child and adult sizes, which vendors print
   * as separate charts. Both are used together.
   */
  combined?: ChartCandidate[];
  confidence: ResolutionConfidence;
  /** Ranked alternatives to show in the picker. */
  candidates: ChartCandidate[];
  /** Size codes no candidate chart could account for. */
  unmatchedCodes: string[];
  reason: string;
}

const norm = (s: string) => s.trim().toUpperCase();

export function resolveChart(
  availableSizes: string[],
  charts: ChartCandidate[],
  categoryHint?: string,
  /**
   * The chart image the product page itself links to. When present this settles
   * the question outright, and it is the only thing that can: Revolution's
   * male/unisex chart uses a strict subset of the standard chart's size codes,
   * so no amount of size-code comparison could tell those two apart.
   */
  productChartImageUrl?: string,
): ChartResolution {
  if (productChartImageUrl) {
    const exact = charts.find((c) => c.sourceImageUrl === productChartImageUrl);
    if (exact) {
      return {
        chart: exact,
        confidence: "exact",
        candidates: [exact],
        unmatchedCodes: [],
        reason: `The product page links this chart image directly (${exact.variant}).`,
      };
    }
  }

  const wanted = new Set(availableSizes.map(norm).filter((s) => s.length > 0));

  if (wanted.size === 0) {
    return {
      chart: null,
      confidence: "unmatched",
      candidates: [],
      unmatchedCodes: [],
      reason: "The costume lists no orderable sizes, so no chart can be matched.",
    };
  }
  if (charts.length === 0) {
    return {
      chart: null,
      confidence: "unmatched",
      candidates: [],
      unmatchedCodes: [...wanted],
      reason: "No charts are in the library for this company yet.",
    };
  }

  const scored = charts
    .map((chart) => {
      const codes = new Set(chart.sizeCodes.map(norm));
      const covered = [...wanted].filter((c) => codes.has(c));
      const union = new Set([...wanted, ...codes]);
      return {
        chart,
        covered: covered.length,
        /** Does the chart account for every size the costume offers? */
        complete: covered.length === wanted.size,
        /** Rewards the most specific chart rather than the broadest. */
        similarity: covered.length / union.size,
        missing: [...wanted].filter((c) => !codes.has(c)),
      };
    })
    .sort(
      (a, b) =>
        Number(b.complete) - Number(a.complete) ||
        b.similarity - a.similarity ||
        b.covered - a.covered,
    );

  const complete = scored.filter((s) => s.complete);

  if (complete.length === 0) {
    const pair = coveringPair(wanted, charts);
    if (pair) {
      const [a, b] = pair;
      return {
        chart: null,
        combined: pair,
        confidence: "high",
        candidates: pair,
        unmatchedCodes: [],
        reason: `This costume comes in sizes from two charts: ${a.variant} (${sharedCodes(wanted, a).join(", ")}) and ${b.variant} (${sharedCodes(wanted, b).join(", ")}). Both are used.`,
      };
    }
    const best = scored[0];
    return {
      chart: null,
      confidence: "unmatched",
      candidates: scored.slice(0, 4).map((s) => s.chart),
      unmatchedCodes: best.missing,
      reason: `No chart covers every orderable size. The closest, ${best.chart.variant}, is missing ${best.missing.join(", ")}.`,
    };
  }

  if (complete.length === 1) {
    return {
      chart: complete[0].chart,
      confidence: complete[0].similarity === 1 ? "exact" : "high",
      candidates: [complete[0].chart],
      unmatchedCodes: [],
      reason: `Size codes ${[...wanted].join(", ")} are covered only by the ${complete[0].chart.variant} chart.`,
    };
  }

  // Several charts cover the vocabulary. Prefer an exact vocabulary match, then
  // a category hint from the product page, before giving up and asking.
  const exact = complete.filter((s) => s.similarity === 1);
  if (exact.length === 1) {
    return {
      chart: exact[0].chart,
      confidence: "exact",
      candidates: complete.map((s) => s.chart),
      unmatchedCodes: [],
      reason: `Size codes match the ${exact[0].chart.variant} chart exactly.`,
    };
  }

  if (categoryHint) {
    const hint = categoryHint.toLowerCase();
    const hinted = complete.filter((s) =>
      hintTokens(s.chart.variant).some((t) => hint.includes(t)),
    );
    if (hinted.length === 1) {
      return {
        chart: hinted[0].chart,
        confidence: "high",
        candidates: complete.map((s) => s.chart),
        unmatchedCodes: [],
        reason: `Several charts share these size codes; the product category "${categoryHint}" points at ${hinted[0].chart.variant}.`,
      };
    }
  }

  return {
    chart: null,
    confidence: "ambiguous",
    candidates: complete.map((s) => s.chart),
    unmatchedCodes: [],
    reason: `Size codes ${[...wanted].join(", ")} are covered by ${complete.length} charts (${complete.map((s) => s.chart.variant).join(", ")}). Pick the right one once and it will be remembered for this costume.`,
  };
}

const sharedCodes = (wanted: Set<string>, chart: ChartCandidate) => {
  const codes = new Set(chart.sizeCodes.map(norm));
  return [...wanted].filter((c) => codes.has(c));
};

/**
 * Two charts that between them cover every size, without both claiming the
 * same size code (which would make "MC" mean two different things). Only an
 * unambiguous pair is returned; anything else is left for a person to pick.
 */
function coveringPair(
  wanted: Set<string>,
  charts: ChartCandidate[],
): [ChartCandidate, ChartCandidate] | null {
  const pairs: [ChartCandidate, ChartCandidate][] = [];
  for (let i = 0; i < charts.length; i++) {
    for (let j = i + 1; j < charts.length; j++) {
      const a = sharedCodes(wanted, charts[i]);
      const b = sharedCodes(wanted, charts[j]);
      if (a.length === 0 || b.length === 0) continue;
      if (a.some((c) => b.includes(c))) continue;
      if (a.length + b.length === wanted.size) pairs.push([charts[i], charts[j]]);
    }
  }
  return pairs.length === 1 ? pairs[0] : null;
}

/** Turn a variant slug into words a product category might contain. */
function hintTokens(variant: string): string[] {
  return variant
    .split("-")
    .filter((t) => t.length > 2)
    .flatMap((t) => (t.endsWith("s") ? [t, t.slice(0, -1)] : [t]));
}
