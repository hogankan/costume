import type { ReactNode } from "react";

/** Shared presentational pieces, kept small and boring on purpose. */

export function Card({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/15 dark:bg-neutral-900">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit";
}) {
  const styles = {
    primary:
      "bg-neutral-900 text-white hover:bg-neutral-700 disabled:bg-neutral-300 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 dark:disabled:bg-neutral-700",
    secondary:
      "border border-black/15 bg-white hover:bg-neutral-50 disabled:opacity-50 dark:border-white/20 dark:bg-neutral-800 dark:hover:bg-neutral-700",
    ghost: "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white",
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${styles}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-white/20 dark:bg-neutral-800 dark:focus:border-white";

export function Alert({
  kind,
  title,
  children,
}: {
  kind: "error" | "warning" | "info" | "success";
  title?: string;
  children: ReactNode;
}) {
  const styles = {
    error:
      "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
    warning:
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
    info: "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100",
    success:
      "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  }[kind];

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-1" : ""}>{children}</div>
    </div>
  );
}

/** Severity pill used in the results table and the exceptions list. */
export function SeverityBadge({ severity }: { severity: "blocking" | "warning" | "ok" }) {
  const styles = {
    blocking: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  }[severity];
  const label = { blocking: "Blocking", warning: "Check", ok: "OK" }[severity];

  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${styles}`}>
      {label}
    </span>
  );
}

export function Steps({ current, labels }: { current: number; labels: string[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {labels.map((label, i) => {
        const n = i + 1;
        const state =
          n === current ? "current" : n < current ? "done" : "todo";
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                state === "current"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : state === "done"
                    ? "bg-emerald-600 text-white"
                    : "bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500"
              }`}
            >
              {state === "done" ? "✓" : n}
            </span>
            <span
              className={
                state === "todo"
                  ? "text-neutral-400 dark:text-neutral-600"
                  : "font-medium"
              }
            >
              {label}
            </span>
            {n < labels.length ? (
              <span className="mx-1 text-neutral-300 dark:text-neutral-700">→</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
