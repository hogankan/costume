"use client";

import { useRef, useState } from "react";
import { IMPORT_FIELDS, type HeaderGuess, type ImportField } from "@/lib/import/headers";
import type { ImportedDancer } from "@/lib/import/parse";
import type { RosterResponse, SheetData } from "./types";
import { Alert, Button, Card, Field, inputClass } from "./ui";

const MEASURE_COLUMNS: (keyof ImportedDancer)[] = [
  "girth",
  "bust",
  "waist",
  "hips",
  "inseam",
  "height",
];

export function StepRoster({
  roster,
  sheet,
  className,
  convertToInches,
  busy,
  error,
  onUpload,
  onSelectSheet,
  onChangeMapping,
  onChangeClassName,
  onToggleConvert,
  onNext,
}: {
  roster: RosterResponse | null;
  sheet: SheetData | null;
  className: string;
  convertToInches: boolean;
  busy: boolean;
  error: string | null;
  onUpload: (file: File) => void;
  onSelectSheet: (index: number) => void;
  onChangeMapping: (mapping: HeaderGuess[]) => void;
  onChangeClassName: (name: string) => void;
  onToggleConvert: (on: boolean) => void;
  onNext: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const sizeable = sheet?.dancers.filter((d) => d.girth != null) ?? [];
  const unsizeable = sheet?.dancers.filter((d) => d.girth == null) ?? [];
  const hasGirthColumn = sheet?.mapping.some((m) => m.field === "girth") ?? false;

  return (
    <div className="space-y-5">
      <Card
        title="1. Upload the class roster"
        subtitle="Whatever you already keep — .xlsx, .csv, or a PDF saved from a spreadsheet. A workbook with a tab per class (costume written on each tab) sizes every class at once."
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) onUpload(file);
          }}
          className={`rounded-xl border-2 border-dashed p-8 text-center transition ${
            dragging
              ? "border-neutral-900 bg-neutral-50 dark:border-white dark:bg-neutral-800"
              : "border-black/15 dark:border-white/20"
          }`}
        >
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Drop the spreadsheet here, or
          </p>
          <div className="mt-3">
            <Button onClick={() => fileInput.current?.click()} disabled={busy}>
              {busy ? "Reading…" : "Choose a file"}
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.csv,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
          {roster ? (
            <p className="mt-4 text-sm font-medium">
              {roster.fileName}
              {roster.sheets.length > 1 ? ` — ${roster.sheets.length} sheets` : ""}
            </p>
          ) : null}
        </div>

        {error ? (
          <div className="mt-4">
            <Alert kind="error">{error}</Alert>
          </div>
        ) : null}
      </Card>

      {sheet ? (
        <>
          <Card
            title="2. Check the columns"
            subtitle="We guessed these from your headers. Correct anything that is wrong — the mapping is remembered per sheet layout."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Class name">
                <input
                  className={inputClass}
                  value={className}
                  placeholder="e.g. Tues 5pm Junior Jazz"
                  onChange={(e) => onChangeClassName(e.target.value)}
                />
              </Field>

              {roster && roster.sheets.length > 1 ? (
                <Field label="Sheet">
                  <select
                    className={inputClass}
                    value={roster.sheets.indexOf(sheet)}
                    onChange={(e) => onSelectSheet(Number(e.target.value))}
                  >
                    {roster.sheets.map((s, i) => (
                      <option key={s.name} value={i}>
                        {s.name} ({s.dancers.length} dancers)
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-white/15">
                    <th className="pb-2 pr-4 font-medium">Your column</th>
                    <th className="pb-2 pr-4 font-medium">Maps to</th>
                    <th className="pb-2 font-medium">First value</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.mapping.map((guess, i) => {
                    const firstRow = sheet.rows[sheet.headerRow + 1] ?? [];
                    const sample = firstRow[guess.index];
                    return (
                      <tr key={`${guess.column}-${i}`} className="border-b border-black/5 dark:border-white/10">
                        <td className="py-2 pr-4 font-medium">
                          {guess.column || <span className="text-neutral-400">(blank)</span>}
                        </td>
                        <td className="py-2 pr-4">
                          <select
                            className={`${inputClass} py-1`}
                            value={guess.field ?? ""}
                            onChange={(e) => {
                              const field = (e.target.value || null) as ImportField | null;
                              const next = sheet.mapping.map((m, j) => {
                                // A field can only be used once, so clear it elsewhere.
                                if (j === i) return { ...m, field, confidence: "exact" as const };
                                return field && m.field === field
                                  ? { ...m, field: null, confidence: "none" as const }
                                  : m;
                              });
                              onChangeMapping(next);
                            }}
                          >
                            <option value="">— ignore —</option>
                            {IMPORT_FIELDS.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 text-neutral-500 dark:text-neutral-400">
                          {sample == null ? "—" : String(sample)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!hasGirthColumn ? (
              <div className="mt-4">
                <Alert kind="error" title="No girth column mapped">
                  Girth decides the size, so nobody can be sized without it. Point one of your
                  columns at <code className="font-mono">girth</code> above.
                </Alert>
              </div>
            ) : null}

            {sheet.detectedUnit === "cm" ? (
              <div className="mt-4">
                <Alert kind="warning" title="This sheet looks like centimetres">
                  <p>
                    The typical girth on this sheet is well above what inches would be. Size charts
                    are in inches.
                  </p>
                  <label className="mt-2 flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={convertToInches}
                      onChange={(e) => onToggleConvert(e.target.checked)}
                    />
                    Convert these measurements to inches
                  </label>
                </Alert>
              </div>
            ) : null}
          </Card>

          <Card
            title={`3. ${sheet.dancers.length} dancers read`}
            subtitle={
              unsizeable.length > 0
                ? `${sizeable.length} can be sized. ${unsizeable.length} ${
                    unsizeable.length === 1 ? "has" : "have"
                  } no girth and will be listed separately.`
                : "Everyone has a girth measurement."
            }
            actions={
              <Button onClick={onNext} disabled={!hasGirthColumn || sizeable.length === 0}>
                Choose the costume →
              </Button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-white/15">
                    <th className="pb-2 pr-3 font-medium">Row</th>
                    <th className="pb-2 pr-3 font-medium">Dancer</th>
                    {MEASURE_COLUMNS.map((c) => (
                      <th key={c} className="pb-2 pr-3 font-medium">
                        {c}
                      </th>
                    ))}
                    <th className="pb-2 font-medium">Color</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.dancers.map((d) => {
                    const bad = d.issues.some((i) => i.severity === "error");
                    return (
                      <tr
                        key={d.rowNumber}
                        className={`border-b border-black/5 dark:border-white/10 ${
                          bad ? "bg-red-50 dark:bg-red-950/40" : ""
                        }`}
                      >
                        <td className="py-1.5 pr-3 text-neutral-400">{d.rowNumber}</td>
                        <td className="py-1.5 pr-3 font-medium">
                          {d.name || <span className="text-red-600">(no name)</span>}
                        </td>
                        {MEASURE_COLUMNS.map((c) => (
                          <td
                            key={c}
                            className={`py-1.5 pr-3 ${
                              c === "girth" && d.girth == null ? "font-semibold text-red-600" : ""
                            }`}
                          >
                            {d[c] == null ? (c === "girth" ? "missing" : "—") : String(d[c])}
                          </td>
                        ))}
                        <td className="py-1.5 text-neutral-500">{d.colorway ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
