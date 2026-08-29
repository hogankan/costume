/** Validate every chart in the library. */
import { loadLibrary } from "../src/lib/charts/library";
import { validateExtractedChart } from "../src/lib/charts/validate";

for (const c of loadLibrary()) {
  const issues = validateExtractedChart(c.chart);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  console.log(
    `${c.id.padEnd(32)} ${c.status.padEnd(10)} ${c.chart.rows.length} sizes  ${errors.length} error(s)  ${warnings.length} warning(s)`,
  );
  for (const i of [...errors, ...warnings]) console.log(`    ${i.severity.toUpperCase()} ${i.message.slice(0, 110)}`);
}
