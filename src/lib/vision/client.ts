/**
 * Browser-side instant image analysis (Canvas API — no server round-trip).
 *
 * When a citizen attaches an evidence photo, this runs BEFORE submission:
 *   • decodes via <img> + Canvas (any browser-supported format),
 *   • downscales to 48×48 grayscale and runs the same TS CNN,
 *   • computes the DCT pHash + block-error suspicion locally,
 *   • returns a preview of category, severity and integrity flags.
 *
 * The authoritative analysis (full-size EXIF/ELA + trust composition against
 * the corpus) still happens server-side in /api/triage — this is the instant
 * feedback layer that makes the ML visible during the demo.
 */
import { cnnForward, toTensor48, type CnnResult } from "./cnn";
import { blockErrorAnalysis, perceptualHash, type ElaAssessment } from "./forensics";

export type ClientPreview = {
  ok: boolean;
  reason?: string;
  cnn: CnnResult | null;
  phash: string | null;
  ela: ElaAssessment | null;
  width: number;
  height: number;
};

export async function analyzeImageClient(file: File): Promise<ClientPreview> {
  const empty: ClientPreview = {
    ok: false, reason: "decode_failed", cnn: null, phash: null,
    ela: null, width: 0, height: 0,
  };
  if (typeof document === "undefined") return { ...empty, reason: "no_dom" };

  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("img load failed"));
        el.src = url;
      });

      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) return empty;

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return { ...empty, reason: "no_canvas" };
      ctx.drawImage(img, 0, 0);

      const data = ctx.getImageData(0, 0, w, h).data;
      const gray = new Float64Array(w * h);
      for (let i = 0; i < w * h; i++) {
        gray[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
      }

      let cnn: CnnResult | null = null;
      try {
        cnn = cnnForward(toTensor48(gray, w, h));
      } catch {
        cnn = null;
      }
      const phash = perceptualHash(gray, w, h);
      const ela = blockErrorAnalysis(gray, w, h);

      return { ok: true, cnn, phash, ela, width: w, height: h };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return empty;
  }
}
