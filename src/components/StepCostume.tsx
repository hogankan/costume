"use client";

import { useState } from "react";
import type { ScrapedCostume } from "@/lib/vendors/types";
import type { ChartResolution } from "@/lib/charts/resolve";
import { ChartEntry } from "./ChartEntry";
import { COMPANIES, type ChartInfo } from "./types";
import { Alert, Button, Card, Field, inputClass } from "./ui";

/**
 * Enter the costume for this class.
 *
 * A style number or a product URL, nothing more. Studios already know which
 * costume each class is wearing, so there is no browsing step. A style number is
 * answered from the crawled catalogue without contacting the vendor at all.
 */
export function StepCostume({
  companySlug,
  costume,
  resolution,
  source,
  charts,
  chartId,
  defaultColorway,
  busy,
  error,
  suggestManual,
  prefill,
  onChangeCompany,
  onLookup,
  onManual,
  onChangeChart,
  onChangeColorway,
  onChartSaved,
  onBack,
  onRun,
}: {
  companySlug: string;
  costume: ScrapedCostume | null;
  resolution: ChartResolution | null;
  source: "catalog" | "scraped" | "manual" | null;
  charts: ChartInfo[];
  chartId: string;
  defaultColorway: string;
  busy: boolean;
  error: string | null;
  suggestManual: boolean;
  /** Style number and name recovered from a vendor that withheld its sizes. */
  prefill: { styleNumber: string; name: string; sizes: string; colors: string } | null;
  onChangeCompany: (slug: string) => void;
  onLookup: (input: string) => void;
  onManual: (input: {
    styleNumber: string;
    name: string;
    sizes: string;
    colors: string;
  }) => void;
  onChangeChart: (id: string) => void;
  onChangeColorway: (name: string) => void;
  onChartSaved: (chartId: string) => void;
  onBack: () => void;
  onRun: () => void;
}) {
  const [input, setInput] = useState("");
  const [entering, setEntering] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ styleNumber: "", name: "", sizes: "", colors: "" });

  // When a lookup recovered the costume but not its sizes, open the manual form
  // already filled in so only the size list is left to type.
  const [lastPrefill, setLastPrefill] = useState<string | null>(null);
  const prefillKey = prefill ? `${prefill.styleNumber}|${prefill.name}` : null;
  if (prefillKey && prefillKey !== lastPrefill) {
    setLastPrefill(prefillKey);
    setManual(prefill!);
    setManualOpen(true);
  }

  const company = COMPANIES.find((c) => c.slug === companySlug);
  const usable = charts.filter((c) => c.status === "confirmed");

  return (
    <div className="space-y-5">
      <Card
        title="Which costume is this class wearing?"
        subtitle="Everyone in the class gets this costume. Different classes can use different companies."
      >
        <div className="grid gap-4 sm:grid-cols-[190px_1fr_auto] sm:items-end">
          <Field label="Company">
            <select
              className={inputClass}
              value={companySlug}
              onChange={(e) => onChangeCompany(e.target.value)}
            >
              {COMPANIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Style number or product URL"
            hint="A style number is answered from the crawled catalogue. A URL is fetched if it has not been crawled."
          >
            <input
              className={inputClass}
              value={input}
              placeholder="27776   or   https://www.revolutiondance.com/…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim() && !busy) onLookup(input);
              }}
            />
          </Field>

          <Button onClick={() => onLookup(input)} disabled={busy || !input.trim()}>
            {busy ? "Finding…" : "Find costume"}
          </Button>
        </div>

        {error ? (
          <div className="mt-4">
            <Alert kind="error" title="Could not find that costume">
              <p>{error}</p>
              {suggestManual ? (
                <p className="mt-2">
                  {company?.scrapable
                    ? "Paste the product page URL, or enter it by hand below."
                    : `${company?.name} has no crawler yet — enter the costume by hand below.`}
                </p>
              ) : null}
            </Alert>
          </div>
        ) : null}

        <div className="mt-4">
          <button
            type="button"
            onClick={() => setManualOpen((v) => !v)}
            className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            {manualOpen ? "Hide manual entry" : "Enter a costume by hand instead"}
          </button>
        </div>

        {manualOpen ? (
          <div className="mt-4 grid gap-4 rounded-lg border border-black/10 p-4 sm:grid-cols-2 dark:border-white/15">
            <Field label="Style number">
              <input
                className={inputClass}
                value={manual.styleNumber}
                onChange={(e) => setManual({ ...manual, styleNumber: e.target.value })}
                placeholder="27776"
              />
            </Field>
            <Field label="Costume name">
              <input
                className={inputClass}
                value={manual.name}
                onChange={(e) => setManual({ ...manual, name: e.target.value })}
                placeholder="You Can't Stop The Beat"
              />
            </Field>
            <Field
              label="Available sizes"
              hint="Comma separated, exactly as the vendor lists them."
            >
              <input
                className={inputClass}
                value={manual.sizes}
                onChange={(e) => setManual({ ...manual, sizes: e.target.value })}
                placeholder="XSC, SC, MC, LC, XLC, XXLC"
              />
            </Field>
            <Field label="Colours" hint="Optional. Comma separated.">
              <input
                className={inputClass}
                value={manual.colors}
                onChange={(e) => setManual({ ...manual, colors: e.target.value })}
                placeholder="Purple, Red"
              />
            </Field>
            <div className="sm:col-span-2">
              <Button variant="secondary" onClick={() => onManual(manual)} disabled={busy}>
                Use this costume
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {costume && entering ? (
        <ChartEntry
          companySlug={companySlug}
          companyName={company?.name ?? companySlug}
          suggestedVariant={
            costume.chartImageUrl
              ? (costume.chartImageUrl.split("/").pop() ?? "chart").replace(/\.[a-z]+$/i, "")
              : "chart"
          }
          chartImageUrl={costume.chartImageUrl}
          sizeCodes={costume.availableSizes}
          onSaved={(id) => {
            setEntering(false);
            onChartSaved(id);
          }}
          onCancel={() => setEntering(false)}
        />
      ) : null}

      {costume && !entering ? (
        <Card
          title={`${costume.styleNumber} — ${costume.name}`}
          subtitle={
            <>
              {source === "catalog"
                ? "From the crawled catalogue"
                : source === "scraped"
                  ? "Fetched from the product page"
                  : "Entered by hand"}
              {" · "}
              {costume.availableSizes.length > 0 ? (
                <>
                  {costume.availableSizes.length} sizes:{" "}
                  <span className="font-mono">{costume.availableSizes.join(", ")}</span>
                </>
              ) : (
                "size list not published by this vendor"
              )}
            </>
          }
        >
          {costume.availableSizes.length === 0 ? (
            <div className="mb-5">
              <Alert kind="warning" title="This vendor does not publish a per-costume size list">
                Sizing will use the whole chart. If this costume is not made in every size, add the
                sizes from your order form using <strong>Enter a costume by hand</strong>, or
                override any dancer who lands on a size you cannot order.
              </Alert>
            </div>
          ) : null}

          {costume.colorways.length > 0 ? (
            <div className="mb-5 max-w-sm">
              <Field
                label="Default colour for this class"
                hint="Individual dancers can differ — put a colour in the sheet's Color column."
              >
                <select
                  className={inputClass}
                  value={defaultColorway}
                  onChange={(e) => onChangeColorway(e.target.value)}
                >
                  {costume.colorways.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : null}

          <div className="max-w-2xl">
            <Field label="Size chart">
              {usable.length === 0 ? (
                <Alert kind="warning" title="This chart has not been recorded yet">
                  <p>
                    This costume names its own chart, but its numbers are not stored, so nothing can
                    be sized against it yet.
                  </p>
                  <div className="mt-3">
                    <Button onClick={() => setEntering(true)}>Type the chart in</Button>
                  </div>
                  <p className="mt-3 text-xs">
                    Or read it automatically: set <code className="font-mono">ANTHROPIC_API_KEY</code>{" "}
                    in <code className="font-mono">.env</code> and run{" "}
                    <code className="font-mono">npm run charts:seed</code>. All 406 Revolution
                    costumes share just two charts, so typing them is a one-time job.
                  </p>
                </Alert>
              ) : (
                <select
                  className={inputClass}
                  value={chartId}
                  onChange={(e) => onChangeChart(e.target.value)}
                >
                  <option value="">— choose a chart —</option>
                  {usable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} · {c.rowCount} sizes
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          {resolution && usable.length > 0 ? (
            <div className="mt-4">
              <Alert
                kind={
                  resolution.confidence === "exact" || resolution.confidence === "high"
                    ? "success"
                    : "warning"
                }
                title={
                  resolution.confidence === "exact" || resolution.confidence === "high"
                    ? "Chart matched"
                    : resolution.confidence === "ambiguous"
                      ? "More than one chart fits — pick one"
                      : "No chart covers these sizes"
                }
              >
                {resolution.reason}
              </Alert>
            </div>
          ) : null}

          <div className="mt-6 flex gap-2">
            <Button variant="secondary" onClick={onBack}>
              ← Back
            </Button>
            <Button onClick={onRun} disabled={busy || !chartId}>
              {busy ? "Sizing…" : "Size this class →"}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
