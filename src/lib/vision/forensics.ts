/**
 * Image forensics — pure TypeScript fallbacks mirroring ml/forensics.py.
 *
 * Three independent signals per evidence photo:
 *   1. EXIF integrity  — camera identity, capture timestamp, GPS presence,
 *                        editing-software tags, stripped-metadata tell.
 *   2. Error-Level Analysis — simulated via 8×8 block error variance: tampered
 *                        regions compress differently from their surroundings.
 *   3. DCT perceptual hash — 64-bit pHash so the same photo submitted twice is
 *                        recognized even after resize/recompression.
 *
 * These functions run in the browser (client-side preview before submit) and
 * on the server as a degraded path when the Python forensics service is
 * unreachable. The Python implementation remains the authority: richer ELA
 * (true JPEG re-encode) and full IFD parsing.
 */
import { CATEGORIES } from "../civic";

// ---------------------------------------------------------------------------
// pHash: 32×32 DCT-II, keep low 8×8, threshold at median of AC terms
// ---------------------------------------------------------------------------

const P = 32;
const LOW = 8;

/** Precomputed DCT-II orthonormal basis: C[k][n] = c(k) cos((2n+1)kπ/2N). */
function buildDctMatrix(n: number): number[][] {
  const m: number[][] = [];
  for (let k = 0; k < n; k++) {
    const row: number[] = [];
    const ck = k === 0 ? Math.sqrt(1 / n) : Math.sqrt(2 / n);
    for (let x = 0; x < n; x++) row.push(ck * Math.cos(((2 * x + 1) * k * Math.PI) / (2 * n)));
    m.push(row);
  }
  return m;
}

const DCT = buildDctMatrix(P);

/**
 * 64-bit DCT pHash as 16 hex chars. `pixels` row-major [0,1], any size.
 * Mirrors forensics.py::perceptual_hash (median over non-DC terms).
 */
export function perceptualHash(pixels: Float64Array, w: number, h: number): string {
  // Downsample to 32×32 by area-averaging.
  const small = new Float64Array(P * P);
  for (let i = 0; i < P; i++) {
    const sy0 = Math.floor((i * h) / P);
    const sy1 = Math.max(sy0 + 1, Math.floor(((i + 1) * h) / P));
    for (let j = 0; j < P; j++) {
      const sx0 = Math.floor((j * w) / P);
      const sx1 = Math.max(sx0 + 1, Math.floor(((j + 1) * w) / P));
      let sum = 0;
      let n = 0;
      for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) { sum += pixels[y * w + x]; n++; }
      small[i * P + j] = n ? sum / n : 0;
    }
  }

  // 2D DCT via row transforms then column transforms.
  const tmp = new Float64Array(P * P);
  for (let i = 0; i < P; i++) {
    for (let k = 0; k < P; k++) {
      let sum = 0;
      for (let x = 0; x < P; x++) sum += DCT[k][x] * small[i * P + x];
      tmp[i * P + k] = sum;
    }
  }
  const freq = new Float64Array(P * P);
  for (let k = 0; k < P; k++) {
    for (let j = 0; j < P; j++) {
      let sum = 0;
      for (let y = 0; y < P; y++) sum += DCT[k][y] * tmp[y * P + j];
      freq[k * P + j] = sum;
    }
  }

  // Median of the 63 AC terms in the top-left 8×8.
  const ac: number[] = [];
  for (let k = 0; k < LOW; k++) for (let l = 0; l < LOW; l++) if (k + l > 0) ac.push(freq[k * P + l]);
  ac.sort((a, b) => a - b);
  const med = ac[ac.length >> 1];

  let value = 0;
  for (let k = 0; k < LOW; k++) {
    for (let l = 0; l < LOW; l++) {
      value = (value << 1) | (freq[k * P + l] > med ? 1 : 0);
    }
  }
  return value.toString(16).padStart(16, "0");
}

export function hammingDistance(h1: string, h2: string): number {
  let dist = 0;
  for (let i = 0; i < 16; i++) {
    let x =
      parseInt(h1[i] ?? "0", 16) ^ parseInt(h2[i] ?? "0", 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

export function phashSimilarity(h1: string, h2: string): number {
  return 1 - hammingDistance(h1, h2) / 64;
}

// ---------------------------------------------------------------------------
// EXIF: minimal JPEG APP1/Exif parser (TIFF structure) — enough for integrity
// signals: Make, Model, Software, DateTime(Original), GPS IFD presence.
// ---------------------------------------------------------------------------

export type ExifSummary = {
  make: string | null;
  model: string | null;
  software: string | null;
  capturedAt: string | null;
  hasGps: boolean;
  tagCount: number;
};

const EDITOR_SOFTWARE = [
  "photoshop", "adobe", "lightroom", "gimp", "snapseed", "canva",
  "picsart", "facetune", "pixelmator", "affinity", "illustrator",
  "after effects", "figma", "paint.net", "paint 3d", "mspaint",
  "krita", "darktable", "polarr", "vsco", "meitu", "b612",
];

/** Returns null for non-JPEG inputs (PNG/WebP typically carry no EXIF in browsers). */
export function parseExif(buf: ArrayBuffer): ExifSummary | null {
  const v = new DataView(buf);
  if (buf.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null; // not JPEG

  let offset = 2;
  while (offset + 4 < buf.byteLength) {
    if (v.getUint8(offset) !== 0xff) break;
    const marker = v.getUint8(offset + 1);
    const size = v.getUint16(offset + 2);
    if (marker === 0xe1 && offset + 4 + 6 <= buf.byteLength) {
      const sig = String.fromCharCode(...new Uint8Array(buf, offset + 4, 6));
      if (sig === "Exif\0\0") {
        return parseTiff(buf, offset + 10);
      }
    }
    offset += 2 + size;
  }
  return { make: null, model: null, software: null, capturedAt: null, hasGps: false, tagCount: 0 };
}

function parseTiff(buf: ArrayBuffer, base: number): ExifSummary | null {
  try {
    const v = new DataView(buf);
    const bom = v.getUint16(base);
    const little = bom === 0x4949;
    if (!little && bom !== 0x4d4d) return null;
    const u16 = (o: number) => v.getUint16(base + o, little);
    const u32 = (o: number) => v.getUint32(base + o, little);

    const ifd0Off = u32(4);
    const out: ExifSummary = { make: null, model: null, software: null, capturedAt: null, hasGps: false, tagCount: 0 };
    let exifIfdOff = 0;
    let gpsIfdOff = 0;

    const readIfd = (off: number): number => {
      const count = u16(off);
      out.tagCount += count;
      for (let i = 0; i < count; i++) {
        const e = off + 2 + i * 12;
        const tag = u16(e);
        const type = u16(e + 2);
        const num = u32(e + 4);
        const valOff = num <= 4 ? e + 8 : base + u32(e + 8);
        const readStr = () => {
          const bytes = new Uint8Array(buf, valOff, Math.min(num, 128));
          return new TextDecoder("ascii").decode(bytes).replace(/\0.*$/, "").trim();
        };
        if (tag === 0x010f) out.make = readStr();
        else if (tag === 0x0110) out.model = readStr();
        else if (tag === 0x0131) out.software = readStr();
        else if (tag === 0x0132) out.capturedAt = readStr();
        else if (tag === 0x8769) exifIfdOff = u32(e + 8);
        else if (tag === 0x8825) gpsIfdOff = u32(e + 8);
      }
      return u32(off + 2 + count * 12);
    };

    let next = readIfd(ifd0Off);
    if (exifIfdOff) {
      const e = exifIfdOff;
      const cnt = u16(e);
      out.tagCount += cnt;
      for (let i = 0; i < cnt; i++) {
        const ent = e + 2 + i * 12;
        const tag = u16(ent);
        const num = u32(ent + 4);
        const valOff = num <= 4 ? ent + 8 : base + u32(ent + 8);
        if (tag === 0x9003 || tag === 0x9004) {
          const bytes = new Uint8Array(buf, valOff, Math.min(num, 32));
          out.capturedAt = new TextDecoder("ascii").decode(bytes).replace(/\0.*$/, "").trim();
        }
      }
      void next;
    }
    if (gpsIfdOff) {
      out.hasGps = true;
      const cnt = u16(gpsIfdOff);
      out.tagCount += cnt;
    }
    return out;
  } catch {
    return null;
  }
}

export type ExifAssessment = {
  integrity: number;
  flags: string[];
  editedBy: string | null;
  hasCamera: boolean;
  hasTimestamp: boolean;
  hasGps: boolean;
};

export function assessExifJs(summary: ExifSummary | null): ExifAssessment {
  const flags: string[] = [];
  if (!summary) {
    return { integrity: 0.2, flags: ["no_exif_or_non_jpeg"], editedBy: null, hasCamera: false, hasTimestamp: false, hasGps: false };
  }
  const blob = `${summary.software ?? ""} ${summary.make ?? ""} ${summary.model ?? ""}`.toLowerCase();
  let editedBy: string | null = null;
  for (const ed of EDITOR_SOFTWARE) {
    if (blob.includes(ed)) { editedBy = ed; break; }
  }
  const hasCamera = Boolean(summary.make || summary.model);
  const hasTimestamp = Boolean(summary.capturedAt);
  const hasGps = summary.hasGps;

  if (editedBy) flags.push(`edited_software:${editedBy}`);
  if (summary.tagCount === 0) flags.push("metadata_stripped");
  else if (!hasCamera) flags.push("no_camera_identity");
  if (!hasTimestamp) flags.push("no_capture_timestamp");
  if (!hasGps) flags.push("no_gps_exif");

  let integrity = 0;
  if (hasCamera) integrity += 0.3;
  if (hasTimestamp) integrity += 0.3;
  if (hasGps) integrity += 0.2;
  if (!editedBy) integrity += 0.2;
  return { integrity: Math.min(1, integrity), flags, editedBy, hasCamera, hasTimestamp, hasGps };
}

// ---------------------------------------------------------------------------
// Block error analysis (ELA surrogate): JPEG re-encode isn't available
// server-side in TS, so we measure high-frequency energy concentration.
// Spliced regions have atypically sharp block-boundary discontinuities.
// ---------------------------------------------------------------------------

export type ElaAssessment = {
  meanError: number;
  errorStd: number;
  hotspotConcentration: number;
  tamperSuspicion: number;
  flags: string[];
};

export function blockErrorAnalysis(pixels: Float64Array, w: number, h: number): ElaAssessment {
  // Laplacian-style high-pass response as a proxy for recompression error.
  const resp: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const c = pixels[y * w + x];
      const lap = 4 * c - pixels[y * w + x - 1] - pixels[y * w + x + 1] - pixels[(y - 1) * w + x] - pixels[(y + 1) * w + x];
      resp.push(Math.abs(lap));
    }
  }
  const mean = resp.reduce((a, b) => a + b, 0) / Math.max(1, resp.length);
  const variance = resp.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, resp.length);
  const std = Math.sqrt(variance);
  const thr = mean + 3 * std;
  const hot = resp.filter((v) => v > thr).length;
  const concentration = resp.length ? hot / resp.length : 0;
  const suspicion = Math.min(1, (std / 12) * 0.6 + concentration * 6);
  const flags: string[] = [];
  if (suspicion > 0.55) flags.push("ela_hotspots");
  if (mean < 0.01 && std < 0.02) flags.push("ela_suspiciously_uniform");
  return {
    meanError: round4(mean),
    errorStd: round4(std),
    hotspotConcentration: round4(concentration),
    tamperSuspicion: round4(suspicion),
    flags,
  };
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Shared trust composition — mirrors forensics.py::compose_trust_score
// ---------------------------------------------------------------------------

export type TrustInput = {
  forensics: { exifIntegrity: number; elaSuspicion: number; flags: string[] } | null;
  cnnCategory: string | null;
  cnnConfidence: number | null;
  textCategory: string | null;
  lat: number | null;
  lng: number | null;
  source: string;
  reportCount: number;
  knownPhashes: string[];
  hasText: boolean;
};

export const SOURCE_REPUTATION: Record<string, number> = {
  whatsapp: 0.75, email: 0.7, manual: 0.7, x: 0.55, tweet: 0.55,
  news: 0.8, social: 0.5, bulk: 0.4,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function trustBand(score: number): "high" | "medium" | "low" | "untrusted" {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  if (score >= 0.3) return "low";
  return "untrusted";
}

export function composeTrustJs(input: TrustInput): {
  score: number;
  band: ReturnType<typeof trustBand>;
  breakdown: Record<string, number>;
  flags: string[];
} {
  const flags: string[] = [];
  const breakdown: Record<string, number> = {};
  const weights: Record<string, number> = {
    image_forensics: 0,
    image_text_consistency: 0,
    geolocation: 0.15,
    crowd_corroboration: 0.15,
    source_reputation: 0.1,
    duplicate_check: 0.05,
  };

  if (input.forensics) {
    const forensicSignal = 0.55 * input.forensics.exifIntegrity + 0.45 * (1 - input.forensics.elaSuspicion);
    breakdown.image_forensics = Math.round(forensicSignal * 1000) / 1000;
    weights.image_forensics = 0.35;
    flags.push(...input.forensics.flags);
  } else {
    breakdown.image_forensics = 0.5;
    flags.push("no_evidence_photo");
  }

  if (input.cnnCategory && input.textCategory) {
    const consistent = input.cnnCategory.toLowerCase() === input.textCategory.toLowerCase();
    let consistency = 1.0;
    if (!consistent) {
      consistency = 0.15;
      flags.push(`image_text_mismatch:${input.cnnCategory}_vs_${input.textCategory}`);
    }
    const conf = clamp01(input.cnnConfidence ?? 0.6);
    breakdown.image_text_consistency = Math.round((0.3 + 0.7 * consistency * conf) * 1000) / 1000;
    weights.image_text_consistency = 0.2;
  } else {
    breakdown.image_text_consistency = 0.5;
    if (!input.cnnCategory) flags.push("cnn_unavailable");
  }

  let geo = 0.4;
  if (input.lat != null && input.lng != null) {
    if (input.lat >= 6.0 && input.lat <= 37.5 && input.lng >= 68.0 && input.lng <= 97.5) geo = 0.9;
    else { geo = 0.3; flags.push("geo_out_of_region"); }
  } else flags.push("no_geolocation");
  breakdown.geolocation = geo;

  breakdown.crowd_corroboration =
    Math.round(clamp01(Math.log1p(Math.max(0, input.reportCount - 1)) / Math.log(12)) * 1000) / 1000;

  breakdown.source_reputation = SOURCE_REPUTATION[input.source] ?? 0.5;

  let dupSignal = 1.0;
  if (input.forensics && input.knownPhashes.length) {
    // The caller supplies the current photo's pHash via forensics.flags side-
    // channel is not possible — instead knownPhashes are compared by the
    // caller, who passes the resulting duplicate penalty through flags.
    void input.knownPhashes;
  }
  breakdown.duplicate_check = dupSignal;
  if (!input.hasText) flags.push("no_text");

  const active = Object.entries(weights).filter(([, w]) => w > 0);
  const totalW = active.reduce((a, [, w]) => a + w, 0);
  let score = active.reduce((a, [k, w]) => a + breakdown[k] * (w / totalW), 0);

  if (flags.some((f) => f.startsWith("photo_reused"))) score = Math.min(score, 0.25);
  if (flags.some((f) => f.startsWith("edited_software"))) score = Math.min(score, 0.55);
  if (flags.includes("ela_hotspots")) score = Math.min(score, 0.6);

  return {
    score: Math.round(clamp01(score) * 1000) / 1000,
    band: trustBand(score),
    breakdown,
    flags: [...new Set(flags)].sort(),
  };
}

// Re-export so callers can reference categories without importing civic twice.
export { CATEGORIES as CNN_CATEGORY_LIST };
