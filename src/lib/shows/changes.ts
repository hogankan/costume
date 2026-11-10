import type { ImportedDancer, MeasureField } from "../import/parse";
import { MEASURE_NAMES, type DancerChange } from "./types";

const MEASURES: MeasureField[] = ["girth", "bust", "waist", "hips", "inseam", "height"];
const show = (v: number | undefined) => (v == null ? "blank" : String(v));

/** How the class's dancers differ from what the uploaded sheet said. */
export function dancerChanges(original: ImportedDancer[], current: ImportedDancer[]): DancerChange[] {
  const before = new Map(original.map((d) => [d.rowNumber, d]));
  const out: DancerChange[] = [];
  for (const d of current) {
    const was = before.get(d.rowNumber);
    if (!was) {
      out.push({
        name: d.name,
        kind: "added",
        changes: MEASURES.filter((m) => d[m] != null).map((m) => `${MEASURE_NAMES[m]}: ${d[m]}`),
      });
      continue;
    }
    const changes = [
      ...(was.name !== d.name ? [`Name: ${was.name || "blank"} → ${d.name}`] : []),
      ...MEASURES.filter((m) => was[m] !== d[m]).map(
        (m) => `${MEASURE_NAMES[m]}: ${show(was[m])} → ${show(d[m])}`,
      ),
    ];
    if (changes.length > 0) out.push({ name: d.name, kind: "edited", changes });
  }
  return out;
}
