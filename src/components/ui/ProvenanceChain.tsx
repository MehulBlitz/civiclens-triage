"use client";

import { motion } from "motion/react";
import type { Complaint } from "@/lib/schema";
import { SOURCE_LABEL } from "@/lib/civic";

/**
 * ProvenanceChain — where did this insight come from?
 * SOURCE → RAW SIGNAL → CLEANED → VALIDATED → AI ANALYSIS → INCIDENT
 * Every node is inspectable (hover for the actual data at that stage).
 * Critical for social/news-derived signals: judges can trace anything.
 */

type Stage = {
  key: string;
  label: string;
  detail: string | null;
};

function stagesFor(c: Complaint): Stage[] {
  const merged = (c.reportCount ?? 1) > 1;
  return [
    {
      key: "source",
      label: "Source",
      detail: `${SOURCE_LABEL[c.source] ?? c.source}${merged ? ` · ${c.reportCount} citizens` : ""}`
    },
    {
      key: "raw",
      label: "Raw signal",
      detail: c.rawText.slice(0, 90) + (c.rawText.length > 90 ? "…" : "")
    },
    {
      key: "clean",
      label: "Cleaned",
      detail: `normalized text · ${c.rawText.trim().split(/\s+/).length} words`
    },
    {
      key: "validated",
      label: "Validated",
      detail: c.lat != null && c.lng != null
        ? `geocoded ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`
        : c.locationText
          ? `location text: ${c.locationText} (no coordinates)`
          : "no location resolved"
    },
    {
      key: "ai",
      label: "AI analysis",
      detail: `${c.category} · ${c.priority} · confidence ${Math.round(c.confidence * 100)}%`
    },
    ...(c.trustScore != null
      ? [
          {
            key: "vision",
            label: "Vision & trust",
            detail: `CNN ${c.cnnCategory ?? "—"} · trust ${Math.round((c.trustScore ?? 0) * 100)}% (${c.trustBand ?? "—"})${c.visionSource ? ` · ${c.visionSource === "python_service" ? "Python forensics" : "on-device"}` : ""}`
          }
        ]
      : []),
    {
      key: "incident",
      label: "Incident",
      detail: `#${c.id} → ${c.routeTo}${merged ? ` · cluster ×${c.reportCount}` : ""}`
    }
  ];
}

export default function ProvenanceChain({ complaint }: { complaint: Complaint }) {
  const stages = stagesFor(complaint);

  return (
    <div className="rounded-lg border border-[color:var(--line)] bg-paper-sunken px-3 py-2.5"
      style={{ background: "var(--paper-sunken)" }}>
      <p className="label">Data provenance</p>
      <div className="mt-2 space-y-0">
        {stages.map((s, i) => (
          <div key={s.key} className="group relative flex gap-2.5">
            {/* vertical connector */}
            {i < stages.length - 1 && (
              <span
                aria-hidden
                className="absolute left-[6px] top-4 h-[calc(100%-8px)] w-px bg-[color:var(--line-strong)]"
              />
            )}
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.05, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className={`relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${
                i === stages.length - 1
                  ? "border-blue-600 bg-blue-500"
                  : s.detail
                    ? "border-blue-400 bg-white"
                    : "border-[color:var(--line-strong)] bg-white"
              }`}
            />
            <div className="min-w-0 pb-2">
              <p className="text-[11px] font-bold text-ink-700">{s.label}</p>
              {s.detail && (
                <p className="truncate text-[11px] text-ink-500" title={s.detail}>
                  {s.detail}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
