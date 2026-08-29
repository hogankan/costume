import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { EXTRACTION_PROMPT, ExtractedChart } from "./schema";
import type { SizeChart, SizeRow, Range } from "../sizing/types";

export class ChartExtractionError extends Error {}

const EXTRACTION_MODEL = "claude-opus-5";
const CM_PER_INCH = 2.54;

/**
 * Claude Opus 5 accepts images up to 2576 pixels on the long edge and downsamples
 * anything larger, so sending more resolution than this buys nothing while risking
 * the request size limit. Weissman's girls chart in particular ships at ~11MB,
 * which would be rejected outright.
 */
const MAX_LONG_EDGE = 2576;
const MAX_BYTES = 4_500_000;

const SUPPORTED_MEDIA = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
} as const;

export interface FetchedImage {
  bytes: Buffer;
  mediaType: string;
  /** sha256 of the raw bytes - the dedupe key for the chart library. */
  hash: string;
  url: string;
}

/** Download a chart image and hash it, so an already-confirmed chart is never re-read. */
export async function fetchChartImage(url: string): Promise<FetchedImage> {
  const res = await fetch(url, {
    headers: {
      // Some vendor CDNs reject requests without a browser-shaped user agent.
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });
  if (!res.ok) {
    throw new ChartExtractionError(`Could not fetch chart image ${url}: HTTP ${res.status}`);
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  const headerType = res.headers.get("content-type")?.split(";")[0]?.trim();
  const mediaType = headerType?.startsWith("image/") ? headerType : mediaTypeFromUrl(url);

  if (!mediaType) {
    throw new ChartExtractionError(
      `Could not determine an image type for ${url} (content-type: ${headerType ?? "none"}).`,
    );
  }

  return {
    bytes,
    mediaType,
    hash: createHash("sha256").update(bytes).digest("hex"),
    url,
  };
}

function mediaTypeFromUrl(url: string): string | null {
  const ext = new URL(url).pathname.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  return SUPPORTED_MEDIA[ext as keyof typeof SUPPORTED_MEDIA] ?? null;
}

/**
 * Downscale an oversized chart so it fits the vision API, preserving as much
 * detail as the model can actually use. Charts are dense tables, so we keep the
 * maximum resolution the model reads rather than shrinking further for cost.
 */
export async function prepareForVision(image: FetchedImage): Promise<FetchedImage> {
  const meta = await sharp(image.bytes).metadata();
  const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);

  if (longEdge <= MAX_LONG_EDGE && image.bytes.length <= MAX_BYTES) return image;

  let quality = 90;
  let out = await resize(image.bytes, longEdge, quality);
  // Dense tables compress unpredictably; step quality down until it fits.
  while (out.length > MAX_BYTES && quality > 55) {
    quality -= 10;
    out = await resize(image.bytes, longEdge, quality);
  }

  return {
    ...image,
    bytes: out,
    mediaType: "image/jpeg",
    // The hash still identifies the ORIGINAL image, so the library dedupes on
    // what the vendor published rather than on our re-encoding of it.
  };
}

function resize(bytes: Buffer, longEdge: number, quality: number): Promise<Buffer> {
  const pipeline = sharp(bytes);
  if (longEdge > MAX_LONG_EDGE) {
    pipeline.resize({ width: MAX_LONG_EDGE, height: MAX_LONG_EDGE, fit: "inside", withoutEnlargement: true });
  }
  return pipeline.jpeg({ quality }).toBuffer();
}

export interface ExtractionResult {
  chart: ExtractedChart;
  hash: string;
  sourceImageUrl: string;
  model: string;
  /** True when the printed chart was in centimetres and values were converted. */
  convertedFromCm: boolean;
}

/**
 * Read a size chart out of its image.
 *
 * This is the step the whole app rests on: every recommendation downstream is
 * only as good as these numbers, which is why the result is a DRAFT that a human
 * confirms once before any sizing run may use it.
 */
export async function extractChart(
  original: FetchedImage,
  client: Anthropic = new Anthropic(),
): Promise<ExtractionResult> {
  const image = await prepareForVision(original);

  const response = await client.messages.parse({
    model: EXTRACTION_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.mediaType as "image/jpeg",
              data: image.bytes.toString("base64"),
            },
          },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ExtractedChart) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new ChartExtractionError(
      `Model returned no parseable chart for ${image.url} (stop_reason: ${response.stop_reason}).`,
    );
  }

  const convertedFromCm = parsed.unit === "cm";
  return {
    chart: convertedFromCm ? toInches(parsed) : parsed,
    hash: image.hash,
    sourceImageUrl: image.url,
    model: EXTRACTION_MODEL,
    convertedFromCm,
  };
}

/** Charts are stored canonically in inches, whatever the vendor printed. */
function toInches(chart: ExtractedChart): ExtractedChart {
  const conv = (r: { min: number | null; max: number | null } | null) =>
    r === null
      ? null
      : {
          min: r.min === null ? null : round2(r.min / CM_PER_INCH),
          max: r.max === null ? null : round2(r.max / CM_PER_INCH),
        };

  return {
    ...chart,
    unit: "in",
    rows: chart.rows.map((row) => ({
      ...row,
      girth: conv(row.girth) as { min: number | null; max: number | null },
      bust: conv(row.bust),
      waist: conv(row.waist),
      hips: conv(row.hips),
      inseam: conv(row.inseam),
      height: conv(row.height),
    })),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Bridge an extraction result into the shape the matcher consumes. */
export function toSizeChart(
  result: ExtractionResult,
  meta: { id: string; companySlug: string; status?: "draft" | "confirmed" },
): SizeChart {
  const range = (r: { min: number | null; max: number | null } | null): Range | undefined =>
    r === null ? undefined : { min: r.min, max: r.max };

  const rows: SizeRow[] = result.chart.rows.map((row) => ({
    code: row.code,
    label: row.label ?? undefined,
    ordinal: row.ordinal,
    girth: { min: row.girth.min, max: row.girth.max },
    bust: range(row.bust),
    waist: range(row.waist),
    hips: range(row.hips),
    inseam: range(row.inseam),
    height: range(row.height),
  }));

  return {
    id: meta.id,
    companySlug: meta.companySlug,
    variant: result.chart.variant,
    status: meta.status ?? "draft",
    rows,
    notes: result.chart.notes,
  };
}
