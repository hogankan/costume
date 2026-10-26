/**
 * Inseam is printed on costume charts as a single number per size: how long the
 * garment's leg is cut, not a range the dancer must fall inside. The studio's
 * rule for comparing a dancer against it:
 *
 *   dancer longer than the garment        -> too short (alert)
 *   dancer exactly the garment length     -> right on, no room to grow (caution)
 *   garment up to (not including) 4" longer -> good
 *   garment 4" or more longer             -> too long (alert)
 *
 * Shared by the sizing engine and the fit report so both say the same thing.
 */

/** A garment this much longer than the dancer's leg is too long. */
export const INSEAM_TOO_LONG = 4;

export type InseamFit = "too-short" | "exact" | "good" | "too-long";

export function inseamFit(dancer: number, garment: number): InseamFit {
  const room = garment - dancer;
  if (room < 0) return "too-short";
  if (room === 0) return "exact";
  if (room < INSEAM_TOO_LONG) return "good";
  return "too-long";
}
