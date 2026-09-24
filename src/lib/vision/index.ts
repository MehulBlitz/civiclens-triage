/**
 * Server-side image analysis orchestrator.
 *
 * Given an evidence photo URL (UploadThing), this module:
 *   1. fetches the bytes (bounded, timeout-guarded),
 *   2. decodes JPEG via jpeg-js (PNG falls back to "no forensics" — browsers
 *      strip most metadata from PNGs anyway and UploadThing normalizes to JPEG),
 *   3. runs the TS CNN (8-way category + severity),
 *   4. runs TS forensics (EXIF integrity, block-error suspicion, pHash),
 *   5. composes the trust score, falling back to the Python ML service
 *      (/vision, /forensics, /trust) when reachable — service first, local
 *      always available.
 *
 * Every step degrades independently; the result always carries which layer
 * produced each signal (source_layer pattern, same as the triage pipeline).
 */
import jpeg from "jpeg-js";

import { cnnForward, toTensor48, type CnnResult } from "./cnn";
import {
  assessExifJs,
  blockErrorAnalysis,
  composeTrustJs,
  parseExif,
  perceptualHash,
  phashSimilarity,
  trustBand,
  type ExifAssessment,
  type ElaAssessment,
} from "./forensics";

const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 6 * 1024 * 1024;

export type ImageSignals = {
  ok: boolean;
  reason?: string;
  width?: number;
  height?: number;
  cnn: CnnResult | null;
  cnnSource: "cnn_ts" | "cnn_service" | "unavailable";
  exif: ExifAssessment | null;
  exifRaw: { make: string | null; model: string | null; software: string | null; capturedAt: string | null; hasGps: boolean } | null;
  ela: ElaAssessment | null;
  phash: string | null;
  forensicsSource: "ts_local" | "python_service" | "unavailable";
  flags: string[];
};

/** Fetch image bytes from a URL; returns null on any failure. */
export async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}

/** Decode JPEG bytes to grayscale [0,1] row-major pixels. PNG/WebP -> null. */
export function decodeToGray(bytes: Uint8Array): { pixels: Float64Array; width: number; height: number } | null {
  try {
    const img = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 256 });
    const { width, height, data } = img;
    const pixels = new Float64Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      // Rec.601 luma, normalized.
      pixels[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    return { pixels, width, height };
  } catch {
    return null;
  }
}

/**
 * Analyze one evidence photo fully locally (no Python service needed).
 * Never throws.
 */
export function analyzeImageLocal(bytes: Uint8Array): ImageSignals {
  const flags: string[] = [];
  const exifRaw = parseExif(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const exif = assessExifJs(exifRaw);
  flags.push(...exif.flags);

  const gray = decodeToGray(bytes);
  if (!gray) {
    flags.push("undecodable_image");
    return {
      ok: false,
      reason: "undecodable_image",
      cnn: null,
      cnnSource: "unavailable",
      exif,
      exifRaw: exifRaw ? { ...exifRaw } : null,
      ela: null,
      phash: null,
      forensicsSource: "ts_local",
      flags,
    };
  }

  const { pixels, width, height } = gray;
  if (width < 200 || height < 200) flags.push("low_resolution");

  let cnn: CnnResult | null = null;
  try {
    const tensor = toTensor48(pixels, width, height);
    // TS CNN expects channel-major layout (1,1,48,48): row-major == channel-major for 1 channel.
    cnn = cnnForward(tensor);
  } catch {
    cnn = null;
  }

  const ela = blockErrorAnalysis(pixels, width, height);
  flags.push(...ela.flags);
  const phash = perceptualHash(pixels, width, height);

  return {
    ok: true,
    width,
    height,
    cnn,
    cnnSource: cnn ? "cnn_ts" : "unavailable",
    exif,
    exifRaw: exifRaw ? { ...exifRaw } : null,
    ela,
    phash,
    forensicsSource: "ts_local",
    flags,
  };
}

/** Try the Python ML service first (richer ELA), fall back to local TS. */
export async function analyzeImage(
  imageUrl: string,
  opts: { textCategory?: string | null; source?: string; submittedAt?: string | null } = {}
): Promise<ImageSignals> {
  const bytes = await fetchImageBytes(imageUrl);
  if (!bytes) {
    return {
      ok: false,
      reason: "fetch_failed",
      cnn: null,
      cnnSource: "unavailable",
      exif: null,
      exifRaw: null,
      ela: null,
      phash: null,
      forensicsSource: "unavailable",
      flags: ["image_fetch_failed"],
    };
  }

  // Python service attempt (best-effort, 4s budget like the text classifier).
  const base = process.env.ML_SERVICE_URL ?? "http://127.0.0.1:8008";
  try {
    const res = await fetch(`${base}/trust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_base64: Buffer.from(bytes).toString("base64"),
        text_category: opts.textCategory ?? null,
        source: opts.source ?? "manual",
        submitted_at: opts.submittedAt ?? null,
      }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as {
        score: number;
        band: string;
        breakdown: Record<string, number>;
        flags: string[];
        cnn?: { ok: boolean; category?: string; confidence?: number; severity?: number };
        forensics_available?: boolean;
      };
      const local = analyzeImageLocal(bytes); // for phash/width/height context
      return {
        ok: true,
        width: local.width,
        height: local.height,
        cnn:
          data.cnn?.ok && data.cnn.category
            ? {
                category: data.cnn.category,
                confidence: data.cnn.confidence ?? 0,
                severity: data.cnn.severity ?? 0,
                probabilities: [],
                sourceLayer: "cnn_service",
              }
            : local.cnn,
        cnnSource: data.cnn?.ok ? "cnn_service" : local.cnnSource,
        exif: local.exif,
        exifRaw: local.exifRaw,
        ela: local.ela,
        phash: local.phash,
        forensicsSource: data.forensics_available ? "python_service" : "ts_local",
        flags: [...new Set([...data.flags, ...local.flags])],
      };
    }
  } catch {
    // fall through to local
  }

  return analyzeImageLocal(bytes);
}

export type TrustAssessment = {
  score: number;
  band: ReturnType<typeof trustBand>;
  breakdown: Record<string, number>;
  flags: string[];
};

/**
 * Compose the trust score from local signals + context.
 * `knownPhashes`: previously-seen evidence hashes for duplicate detection.
 */
export function composeTrust(
  signals: ImageSignals,
  ctx: { textCategory: string | null; source: string; reportCount?: number; knownPhashes?: string[]; hasText?: boolean }
): TrustAssessment {
  const flags = [...signals.flags];

  // Duplicate-evidence check against the corpus phashes.
  let dupPenaltyFlag: string | null = null;
  if (signals.phash && ctx.knownPhashes?.length) {
    let best = 0;
    for (const k of ctx.knownPhashes) {
      best = Math.max(best, phashSimilarity(signals.phash, k));
    }
    if (best >= 0.94) dupPenaltyFlag = "photo_reused:phash_match";
    else if (best >= 0.86) dupPenaltyFlag = "photo_similar:possible_reuse";
  }
  if (dupPenaltyFlag) flags.push(dupPenaltyFlag);

  const result = composeTrustJs({
    forensics:
      signals.exif && signals.ela
        ? { exifIntegrity: signals.exif.integrity, elaSuspicion: signals.ela.tamperSuspicion, flags: [] }
        : null,
    cnnCategory: signals.cnn?.category ?? null,
    cnnConfidence: signals.cnn?.confidence ?? null,
    textCategory: ctx.textCategory,
    lat: null,
    lng: null,
    source: ctx.source,
    reportCount: ctx.reportCount ?? 1,
    knownPhashes: [],
    hasText: ctx.hasText ?? true,
  });

  // Re-apply the duplicate penalty to the final score (mirrors Python hard caps).
  let score = result.score;
  if (dupPenaltyFlag === "photo_reused:phash_match") score = Math.min(score, 0.25);
  else if (dupPenaltyFlag === "photo_similar:possible_reuse") score = Math.min(score, 0.6);

  return {
    score,
    band: trustBand(score),
    breakdown: result.breakdown,
    flags: [...new Set([...result.flags, ...(dupPenaltyFlag ? [dupPenaltyFlag] : [])])].sort(),
  };
}
