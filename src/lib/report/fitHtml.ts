import { formatRange } from "../sizing/range";
import { MEASURE_LABELS, REPORT_MEASURES, type CellStatus, type FitReport } from "./fitReport";

/**
 * The fit report as a standalone, printable page: one class per printed page,
 * landscape, with the colours forced on (browsers drop background colours when
 * printing unless told otherwise) and nothing from the app's own controls.
 */

const COLOURS: Record<CellStatus, string> = {
  fits: "#e2f0d9",
  "slightly-over": "#fff2cc",
  "slightly-under": "#fff2cc",
  over: "#f8cbad",
  under: "#ddebf7",
  garment: "transparent",
  "not-on-chart": "transparent",
  "not-measured": "#f2f2f2",
};

const esc = (v: unknown): string =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );

function classSection(report: FitReport): string {
  const multiStyle = report.charts.length > 1;
  const s = report.summary;

  const head = [
    "Dancer",
    ...(multiStyle ? ["Costume"] : []),
    "Size",
    ...REPORT_MEASURES.map((m) => (m === "girth" ? "Girth ★" : MEASURE_LABELS[m])),
    "What to check",
  ];

  const body = report.rows
    .map((r) => {
      const size = r.notSized
        ? `<em class="muted">not sized</em>`
        : `<b>${esc(r.size)}</b>${r.recommendedSize !== r.size ? `<div class="small">was ${esc(r.recommendedSize)}</div>` : ""}`;
      const cells = r.cells
        .map((c) => {
          const bg = r.notSized ? "transparent" : COLOURS[c.status];
          const range = c.range && !r.notSized ? `<div class="small">${esc(formatRange(c.range))}</div>` : "";
          const strong = c.measure === "girth" || c.status === "over" || c.status === "under";
          return `<td class="m" style="background:${bg}">${strong ? `<b>${esc(c.text)}</b>` : esc(c.text)}${range}</td>`;
        })
        .join("");
      const alerts =
        r.alerts.length === 0
          ? `<span class="ok">All lined up</span>`
          : `<ul>${r.alerts.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>`;
      return `<tr${r.notSized ? ' class="notsized"' : ""}><td><b>${esc(r.name)}</b></td>${
        multiStyle ? `<td>${esc(r.styleNumber ?? "")}</td>` : ""
      }<td>${size}</td>${cells}<td class="alerts">${alerts}</td></tr>`;
    })
    .join("");

  const charts = report.charts
    .map((chart) => {
      const rows = chart.rows
        .map((sr) => {
          const count = report.rows.filter(
            (r) => r.styleNumber === chart.styleNumber && r.size?.toUpperCase() === sr.code.toUpperCase(),
          ).length;
          return `<tr${count ? ' class="used"' : ""}><td><b>${esc(sr.code)}</b></td>${REPORT_MEASURES.map(
            (m) => `<td class="m">${sr[m] ? esc(formatRange(sr[m]!)) : ""}</td>`,
          ).join("")}<td class="m">${count || ""}</td></tr>`;
        })
        .join("");
      return `<div class="chart"><h3>Size chart: ${esc(chart.label)} — ${esc(chart.styleNumber)}${
        chart.costumeName ? ` ${esc(chart.costumeName)}` : ""
      }</h3><table><thead><tr><th>Size</th>${REPORT_MEASURES.map((m) => `<th>${MEASURE_LABELS[m]}</th>`).join(
        "",
      )}<th>Dancers</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    })
    .join("");

  return `<section>
    <h1>${esc(report.className)}</h1>
    <p class="meta">${report.sheetName ? `${esc(report.sheetName)} · ` : ""}${
      report.teacher ? `Teacher: ${esc(report.teacher)} · ` : ""
    }${report.charts
      .map((c) => `${esc(c.styleNumber)}${c.costumeName ? ` ${esc(c.costumeName)}` : ""}`)
      .join(" / ")}</p>
    <p class="meta"><b>${s.sized} sized</b> · ${s.clean} all lined up · <b>${s.withAlerts} to check</b>${
      s.notSized ? ` · ${s.notSized} not sized` : ""
    }</p>
    <table class="report"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>
    ${legend()}
    ${charts}
  </section>`;
}

function legend(): string {
  const items: [string, string][] = [
    [COLOURS.fits, "✓ inside the chart range"],
    [COLOURS["slightly-over"], "▲▼ off by 2\" or less — alterable"],
    [COLOURS.over, "▲ over by more — needs attention"],
    [COLOURS.under, "▼ under by more — roomy / long"],
  ];
  return `<p class="legend">${items
    .map(([bg, t]) => `<span><i style="background:${bg}"></i>${esc(t)}</span>`)
    .join("")}<span>Girth decides the size. Single numbers (like inseam) are how the garment is cut.</span></p>`;
}

export function fitReportHtml(reports: FitReport[], title: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: landscape; margin: 0.4in; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  body { font: 10.5px/1.3 -apple-system, "Segoe UI", Arial, sans-serif; color: #111; margin: 16px; }
  section + section { break-before: page; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  h3 { font-size: 12px; margin: 14px 0 4px; }
  .meta { margin: 0 0 4px; color: #333; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #1f3864; color: #fff; font-weight: 600; padding: 3px 5px; text-align: left; }
  td { border: 1px solid #d0d0d0; padding: 2px 5px; vertical-align: top; }
  td.m, th.m { text-align: center; white-space: nowrap; }
  .report th:nth-child(n+3):not(:last-child) { text-align: center; }
  .small { font-size: 9px; color: #555; }
  .muted { color: #777; }
  .ok { color: #2e7d32; }
  td.alerts { color: #9c2a00; min-width: 240px; }
  td.alerts ul { margin: 0; padding-left: 14px; }
  tr { break-inside: avoid; }
  tr.notsized td { background: #fce4d6; color: #555; }
  .chart table { width: auto; }
  .chart tr.used td { font-weight: 600; }
  .legend { margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 4px 14px; color: #444; }
  .legend i { display: inline-block; width: 18px; height: 10px; margin-right: 4px; border: 1px solid #ccc; vertical-align: -1px; }
  .toolbar { margin-bottom: 12px; }
  @media print { .toolbar { display: none; } body { margin: 0; } }
</style></head>
<body>
<div class="toolbar"><button onclick="window.print()">Print</button></div>
${reports.map(classSection).join("\n")}
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 250); });</script>
</body></html>`;
}
