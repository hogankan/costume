"use client";

import { useState } from "react";
import { FORM_MEASURES, type DancerForm } from "@/lib/import/manualDancer";
import { Alert, Button, inputClass } from "./ui";

const LABELS: Record<(typeof FORM_MEASURES)[number], string> = {
  girth: "Girth ★",
  bust: "Chest",
  waist: "Waist",
  hips: "Hips",
  inseam: "Inseam",
  height: "Height",
};

/**
 * Type in a dancer's measurements - a new student, or one the sheet had blank.
 * Accepts the same forms a sheet does: 44, 44.5, 44 1/2, 44½.
 */
export function DancerFormPanel({
  title,
  initial,
  errors,
  onSave,
  onCancel,
}: {
  title: string;
  initial: DancerForm;
  errors: string[];
  onSave: (form: DancerForm) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<DancerForm>(initial);
  const set = (field: keyof DancerForm, value: string) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <form
      className="rounded-lg border border-violet-300 bg-violet-50/50 p-3 dark:border-violet-800 dark:bg-violet-950/30"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
    >
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <label className="col-span-2 sm:col-span-4 lg:col-span-1">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
            Name
          </span>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            autoFocus={!form.name}
          />
        </label>
        {FORM_MEASURES.map((m) => (
          <label key={m}>
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
              {LABELS[m]}
            </span>
            <input
              className={inputClass}
              inputMode="decimal"
              placeholder="in"
              value={form[m]}
              onChange={(e) => set(m, e.target.value)}
              autoFocus={Boolean(form.name) && m === "girth" && !form.girth}
            />
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Inches. Girth is needed to size; the rest are checked against the chart.
      </p>
      {errors.length > 0 ? (
        <div className="mt-2">
          <Alert kind="error">
            <ul className="space-y-0.5">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button type="submit">Save</Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
