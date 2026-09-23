"use client";

import { motion, AnimatePresence } from "motion/react";
import type { Complaint } from "@/lib/schema";
import {
  PRIORITY_STYLE,
  SOURCE_LAYER_LABEL,
  SOURCE_LABEL,
  STATUS_STYLE,
  relativeTime,
  slaState
} from "@/lib/civic";
import AnimatedNumber from "./ui/AnimatedNumber";

type Props = {
  items: Complaint[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

/**
 * Queue list — every card is a living data object:
 *  • entrance: staggered "signal settles" (small → card)
 *  • selection: shared-layout highlight ring moves between cards
 *  • priority change: chip cross-fades + color transitions (MEDIUM → HIGH)
 *  • cluster growth: reportCount counter animates when citizens merge in
 *  • exit: cards leave when filtered out (AnimatePresence, no reload)
 */
const STAGGER = 0.035;

export default function QueueList({ items, selectedId, onSelect }: Props) {
  if (items.length === 0) {
    return (
      <div className="card px-5 py-10 text-center">
        <p className="text-sm font-semibold text-ink-700">
          No complaints match these filters
        </p>
        <p className="mt-1 text-sm text-ink-400">
          Clear a filter, or ingest raw text on the left to triage a new one.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((c, idx) => {
          const p = PRIORITY_STYLE[c.priority] ?? PRIORITY_STYLE.medium;
          const s = STATUS_STYLE[c.status];
          const selected = c.id === selectedId;
          const sla = slaState(c.priority, c.createdAt, c.status);
          return (
            <motion.li
              key={c.id}
              layout
              initial={{ opacity: 0, y: 10, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
              transition={{
                duration: 0.32,
                delay: Math.min(idx * STAGGER, 0.35),
                ease: [0.22, 1, 0.36, 1],
                layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
              }}
            >
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                aria-pressed={selected}
                className={`w-full rounded-xl border bg-white px-4 py-3 text-left transition-shadow duration-200 ${
                  selected
                    ? "border-blue-400 shadow-lift ring-2 ring-blue-100"
                    : "border-[color:var(--line)] shadow-card hover:border-blue-300 hover:shadow-lift"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {/* Priority chip — animates on change via key + motion span */}
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={c.priority}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.18 }}
                      className={`chip ${p.chip}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${p.dot} ${c.priority === "urgent" ? "animate-urgent-pulse" : ""}`} />
                      {p.label}
                    </motion.span>
                  </AnimatePresence>
                  <span className="rounded-full bg-[color:var(--paper-sunken)] px-2 py-0.5 text-[11px] font-semibold text-ink-700">
                    {c.category}
                  </span>
                  <span className={`chip ${s?.chip ?? ""}`}>{s?.label ?? c.status}</span>
                  {(c.reportCount ?? 1) > 1 && (
                    <motion.span
                      layout
                      className={`chip ${
                        c.escalatedAt
                          ? "border-rose-300 bg-rose-100 text-rose-800"
                          : "border-violet-200 bg-violet-50 text-violet-700"
                      }`}
                      title={
                        c.escalatedAt
                          ? "Auto-escalated: crowd confirmations crossed the threshold"
                          : "Near-duplicate citizen reports merged into this ticket"
                      }
                    >
                      {c.escalatedAt ? "⚡ escalated" : "🔥 merged"} ×
                      <AnimatedNumber value={c.reportCount ?? 1} duration={500} />
                    </motion.span>
                  )}
                  <span className="ml-auto text-[11px] text-ink-400">
                    {relativeTime(c.createdAt)}
                  </span>
                </div>

                <p className="mt-2 line-clamp-2 text-sm font-medium text-ink-900">
                  {c.summary}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
                  <span className="inline-flex items-center gap-1">
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
                      <path d="M10 2a6 6 0 0 0-6 6c0 4.5 6 10 6 10s6-5.5 6-10a6 6 0 0 0-6-6Zm0 8.5A2.5 2.5 0 1 1 10 5.5a2.5 2.5 0 0 1 0 5Z" />
                    </svg>
                    {c.locationText || "No location"}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-blue-700">
                    → {c.routeTo}
                  </span>
                  <span>
                    <AnimatedNumber
                      value={Math.round(c.confidence * 100)}
                      format={(v) => `${Math.round(v)}% confidence`}
                      duration={600}
                    />
                  </span>
                  <span className="rounded bg-[color:var(--paper-sunken)] px-1.5 py-0.5 font-medium text-ink-500">
                    {SOURCE_LAYER_LABEL[c.sourceLayer] ?? c.sourceLayer}
                  </span>
                  <span className="text-ink-400">
                    {SOURCE_LABEL[c.source] ?? c.source}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-semibold ${
                      sla.breached
                        ? "bg-rose-100 text-rose-700"
                        : sla.fraction >= 0.7
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {sla.breached ? "⚠ " : "⏱ "}
                    {sla.label}
                  </span>
                </div>
              </button>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
