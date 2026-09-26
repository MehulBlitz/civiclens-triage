"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Complaint } from "@/lib/schema";

const TwinScene = dynamic(() => import("./TwinScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] w-full items-center justify-center rounded-xl bg-[#0b1c2b] text-sm text-civic-200">
      Raising the digital twin…
    </div>
  )
});

export type TwinQuality = "high" | "low" | "2d";

type Props = {
  items: Complaint[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

const LOW_FPS = 24;
const CHECK_MS = 2500;

/**
 * Twin view controller.
 *
 * Quality ladder (per the performance requirement):
 *   3D HIGH  — full geometry + labels + slow orbit
 *   3D LOW   — fewer meshes, no labels, no orbit (renderer still GPU-friendly)
 *   2D       — leaflet-style fallback marker grid (zero WebGL)
 *
 * Auto-degrade: if the running FPS drops below LOW_FPS after the warmup
 * window, quality steps down automatically. The user can override with the
 * segmented control at any time.
 */
export default function TwinWrapper({ items, selectedId, onSelect }: Props) {
  const [quality, setQuality] = useState<TwinQuality>("high");
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const fpsRef = useRef<number[]>([]);

  // Auto-degrade only from high → low (never silently drops to 2D).
  useEffect(() => {
    if (quality !== "high") return;
    fpsRef.current = [];
    let raf = 0;
    let last = performance.now();
    let frames = 0;

    const loop = (t: number) => {
      frames += 1;
      if (t - last >= 1000) {
        fpsRef.current.push(Math.round((frames * 1000) / (t - last)));
        frames = 0;
        last = t;
        // Warmup: judge only after 3 seconds of samples.
        if (fpsRef.current.length >= 3) {
          const recent = fpsRef.current.slice(-3);
          const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
          if (avg < LOW_FPS) {
            setQuality("low");
            setAutoNote("3D LOW — reduced for smooth operation");
            return; // stop measuring
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [quality, items.length]);

  // rAF only runs when the 3D canvas is mounted; guard for 2D mode.
  useEffect(() => {
    if (quality === "2d") setAutoNote(null);
  }, [quality]);

  const show3d = quality !== "2d";

  return (
    <div>
      <div className="flex items-center justify-end gap-2 px-1 pb-2">
        {autoNote && quality === "low" && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-civic-200">
            {autoNote}
          </span>
        )}
        <div className="seg" role="tablist" aria-label="Twin quality">
          <button
            type="button"
            data-active={quality === "high"}
            onClick={() => {
              setQuality("high");
              setAutoNote(null);
            }}
          >
            3D HIGH
          </button>
          <button
            type="button"
            data-active={quality === "low"}
            onClick={() => {
              setQuality("low");
              setAutoNote(null);
            }}
          >
            3D LOW
          </button>
          <button
            type="button"
            data-active={quality === "2d"}
            onClick={() => {
              setQuality("2d");
              setAutoNote(null);
            }}
          >
            2D
          </button>
        </div>
      </div>

      {show3d ? (
        <TwinScene
          items={items}
          selectedId={selectedId}
          onSelect={onSelect}
          quality={quality}
        />
      ) : (
        <div className="flex h-[320px] w-full flex-wrap content-start gap-2 overflow-y-auto rounded-xl border border-[color:var(--line)] bg-white p-4 sm:h-[420px]">
          {items.length === 0 && (
            <p className="w-full text-center text-sm text-ink-400">
              No complaints in the current filter.
            </p>
          )}
          {items.slice(0, 24).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                c.id === selectedId
                  ? "border-blue-500 bg-blue-100/60 shadow-lift"
                  : "border-[color:var(--line)] bg-white hover:border-blue-300 hover:shadow-card"
              }`}
            >
              <span className="block font-bold text-ink-900">
                #{c.id} · {c.category}
              </span>
              <span className="mt-0.5 block max-w-[220px] truncate text-ink-500">
                {c.locationText || "unlocated"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
