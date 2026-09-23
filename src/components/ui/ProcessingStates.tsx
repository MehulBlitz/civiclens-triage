"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

/**
 * ProcessingStates — meaningful AI progress, never a bare "Loading…".
 * Each stage maps to what the pipeline actually does server-side
 * (ingest → normalize → geocode/validate → cluster → risk model → twin).
 * Advance timing is a *representation*, the real work happens in the API.
 */

const STAGES = [
  { key: "ingest", label: "Ingesting signals", hint: "raw text → signal" },
  { key: "normalize", label: "Normalizing data", hint: "cleaning + tagging" },
  { key: "validate", label: "Validating location", hint: "Nominatim geocode" },
  { key: "cluster", label: "Clustering incident", hint: "duplicate fusion" },
  { key: "risk", label: "Running risk model", hint: "civic NN inference" },
  { key: "twin", label: "Updating civic twin", hint: "map + 3D sync" }
] as const;

const STAGE_MS = 420;

export default function ProcessingStates({ active }: { active: boolean }) {
  const [stage, setStage] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      setStage(0);
      if (timer.current) clearInterval(timer.current);
      return;
    }
    setStage(0);
    let i = 0;
    timer.current = setInterval(() => {
      i = Math.min(i + 1, STAGES.length - 1);
      setStage(i);
      if (i === STAGES.length - 1 && timer.current) clearInterval(timer.current);
    }, STAGE_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [active]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
          role="status"
          aria-live="polite"
        >
          <div className="mt-3 rounded-lg border border-blue-100 bg-blue-100/40 px-3 py-2.5">
            <div className="space-y-1.5">
              {STAGES.map((s, i) => {
                const done = i < stage;
                const current = i === stage;
                return (
                  <div key={s.key} className="flex items-center gap-2">
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[8px] font-bold ${
                        done
                          ? "border-blue-500 bg-blue-500 text-white"
                          : current
                            ? "border-blue-400 bg-white text-blue-600"
                            : "border-[color:var(--line-strong)] bg-white text-ink-300"
                      }`}
                    >
                      {done ? "✓" : current ? "•" : ""}
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        done || current ? "text-blue-800" : "text-ink-300"
                      }`}
                    >
                      {s.label}
                    </span>
                    {current && (
                      <span className="text-[10px] text-ink-400">
                        {s.hint}
                      </span>
                    )}
                    {current && (
                      <span className="ml-auto h-0.5 w-10 overflow-hidden rounded-full bg-blue-200">
                        <span className="block h-full w-1/3 animate-stage-sweep rounded-full bg-blue-500" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
