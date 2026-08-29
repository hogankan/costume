// Print a built order workbook to the terminal for eye-checking.
//   node scripts/show-workbook.mjs [path] [sheet...]
import * as XLSX from "xlsx";
import * as fs from "node:fs";

// SheetJS's ESM build does not bind fs itself.
XLSX.set_fs(fs);

const [, , file = "tmp/costume-order.xlsx", ...only] = process.argv;
const wb = XLSX.readFile(file);
const sheets = only.length > 0 ? only : wb.SheetNames;

for (const name of sheets) {
  const ws = wb.Sheets[name];
  if (!ws) {
    console.log(`\n(no sheet named ${name})`);
    continue;
  }
  console.log(`\n########## ${name} ##########`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: "" });
  for (const r of rows) console.log(r.map((c) => String(c).slice(0, 56)).join(" | "));
}
