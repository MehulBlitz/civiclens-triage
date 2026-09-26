"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Complaint } from "@/lib/schema";
import type { Status } from "@/lib/civic";
import {
  DEPARTMENT_CONTACT,
  PRIORITY_STYLE,
  SOURCE_LAYER_LABEL,
  SOURCE_LABEL,
  STATUS_STYLE,
  slaState
} from "@/lib/civic";
import AnimatedNumber from "./ui/AnimatedNumber";
import ProvenanceChain from "./ui/ProvenanceChain";

type Evidence = { feature: string; kind: string; contribution: number };
type Explain = {
  category: string;
  priority: string;
  category_probabilities: Record<string, number>;
  priority_probabilities: Record<string, number>;
  category_evidence: { supports: Evidence[]; against: Evidence[] };
  priority_evidence: { supports: Evidence[]; against: Evidence[] };
};

type Props = {
  complaint: Complaint | null;
  onStatusChange: (id: number, status: Status) => void;
  saving: boolean;
};

const STATUS_FLOW: Status[] = ["open", "in_progress", "resolved"];

/** Renders supporting/contradicting evidence chips from the /explain endpoint. */
function EvidenceRow({ label, evidence }: { label: string; evidence: { supports: Evidence[]; against: Evidence[] } }) {
  if (!evidence?.supports?.length && !evidence?.against?.length) return null;
  return (
    <div>
      <p className="label">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {evidence.supports.slice(0, 6).map((ev) => (
          <span
            key={`s-${ev.feature}`}
            className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
            title={`${ev.kind} · contributes +${ev.contribution.toFixed(3)}`}
          >
            ↑ {ev.feature}
          </span>
        ))}
        {evidence.against.slice(0, 3).map((ev) => (
          <span
            key={`a-${ev.feature}`}
            className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500"
            title={`${ev.kind} · contributes ${ev.contribution.toFixed(3)}`}
          >
            ↓ {ev.feature}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProbBar({ dist, chosen }: { dist: Record<string, number>; chosen: string }) {
  const rows = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 text-[11px]">
          <span className={`w-20 shrink-0 truncate ${k === chosen ? "font-bold text-blue-800" : "text-ink-400"}`}>
            {k}
          </span>
          <div className="meter flex-1">
            <span
              className={`block h-full rounded-full transition-[width] duration-500 ease-swift ${
                k === chosen ? "bg-blue-600" : "bg-ink-300"
              }`}
              style={{ width: `${Math.round(v * 100)}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-ink-500">{Math.round(v * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

const TRUST_BAND_STYLE: Record<string, { chip: string; bar: string; label: string }> = {
  high: { chip: "border-emerald-200 bg-emerald-50 text-emerald-700", bar: "bg-emerald-500", label: "High trust" },
  medium: { chip: "border-sky-200 bg-sky-50 text-sky-700", bar: "bg-sky-500", label: "Medium trust" },
  low: { chip: "border-amber-200 bg-amber-50 text-amber-700", bar: "bg-amber-500", label: "Low trust" },
  untrusted: { chip: "border-rose-200 bg-rose-50 text-rose-700", bar: "bg-rose-500", label: "Untrusted" },
};

const BREAKDOWN_LABELS: Record<string, string> = {
  image_forensics: "Image forensics",
  image_text_consistency: "Image ↔ text match",
  geolocation: "Geolocation",
  crowd_corroboration: "Crowd corroboration",
  source_reputation: "Source reputation",
  duplicate_check: "Duplicate check",
};

/** Evidence trust: composite score + per-signal breakdown + inspection flags. */
function TrustCard({ complaint }: { complaint: Complaint }) {
  const band = complaint.trustBand ?? "medium";
  const style = TRUST_BAND_STYLE[band] ?? TRUST_BAND_STYLE.medium;
  let breakdown: Record<string, number> = {};
  let flags: string[] = [];
  try {
    if (complaint.trustBreakdown) breakdown = JSON.parse(complaint.trustBreakdown);
    if (complaint.trustFlags) flags = JSON.parse(complaint.trustFlags);
  } catch {
    // corrupted JSON — show score only
  }
  const pct = Math.round((complaint.trustScore ?? 0) * 100);
  const cnnAgrees =
    complaint.cnnCategory != null && complaint.cnnCategory === complaint.category;

  return (
    <div className="rounded-lg border border-[color:var(--line)] px-3 py-2.5" style={{ background: "var(--paper-sunken)" }}>
      <div className="flex items-center justify-between">
        <p className="label">Evidence trust</p>
        <span className={`chip ${style.chip}`}>
          {style.label} · {pct}%
        </span>
      </div>
      <div className="meter mt-1.5">
        <span
          className={`block h-full rounded-full ${style.bar}`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>

      {complaint.cnnCategory && (
        <p className="mt-2 text-xs text-ink-700">
          Photo model: <span className="font-bold">{complaint.cnnCategory}</span>
          {complaint.cnnSeverity != null && (
            <> · degradation {Math.round(complaint.cnnSeverity * 100)}%</>
          )}
          {cnnAgrees ? (
            <span className="ml-1 font-semibold text-emerald-600">✓ agrees with text</span>
          ) : (
            <span className="ml-1 font-semibold text-amber-600">⚠ differs from text</span>
          )}
        </p>
      )}

      {Object.keys(breakdown).length > 0 && (
        <div className="mt-2 space-y-1">
          {Object.entries(breakdown)
            .filter(([k]) => BREAKDOWN_LABELS[k])
            .map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-[11px]">
                <span className="w-32 shrink-0 text-ink-500">{BREAKDOWN_LABELS[k]}</span>
                <div className="meter flex-1">
                  <span
                    className="block h-full rounded-full bg-blue-500/70"
                    style={{ width: `${Math.round(v * 100)}%` }}
                  />
                </div>
                <span className="w-8 text-right text-ink-500">{Math.round(v * 100)}%</span>
              </div>
            ))}
        </div>
      )}

      {flags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {flags.map((f) => (
            <span
              key={f}
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600"
              title="Forensic inspection flag"
            >
              {f}
            </span>
          ))}
        </div>
      )}
      {complaint.imagePhash && (
        <p className="mt-1.5 text-[10px] text-ink-400" title={complaint.imagePhash}>
          pHash {complaint.imagePhash.slice(0, 8)}… · {complaint.visionSource === "python_service" ? "Python forensics service" : "on-device forensics"}
        </p>
      )}
    </div>
  );
}

export default function DetailPanel({ complaint, onStatusChange, saving }: Props) {
  const [explain, setExplain] = useState<Explain | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [showExplain, setShowExplain] = useState(false);

  useEffect(() => {
    setExplain(null);
    setExplainError(null);
    setShowExplain(false);
    if (!complaint) return;
    let alive = true;
    setShowExplain(true);
    (async () => {
      try {
        const res = await fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: complaint.rawText })
        });
        if (!res.ok) throw new Error(`Explain unavailable (${res.status})`);
        const data = (await res.json()) as Explain;
        if (alive) setExplain(data);
      } catch (e) {
        if (alive) setExplainError(e instanceof Error ? e.message : "Explain failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, [complaint]);

  if (!complaint) {
    return (
      <section className="card px-5 py-8 text-center">
        <p className="text-sm font-semibold text-ink-700">Nothing selected</p>
        <p className="mt-1 text-sm text-ink-400">
          Pick a complaint from the queue or map to see the full triage record.
        </p>
      </section>
    );
  }

  // Long records collapse cleanly on mobile; desktop expands by default.

  const p = PRIORITY_STYLE[complaint.priority] ?? PRIORITY_STYLE.medium;
  const s = STATUS_STYLE[complaint.status];
  const confidencePct = Math.round(complaint.confidence * 100);
  const sla = slaState(complaint.priority, complaint.createdAt, complaint.status);
  const contact = DEPARTMENT_CONTACT[complaint.routeTo];

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-5 py-3"
        style={{ background: "var(--paper-sunken)" }}>
        <div className="flex flex-wrap items-center gap-2">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={complaint.priority}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.2 }}
              className={`chip ${p.chip}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${p.dot} ${complaint.priority === "urgent" ? "animate-urgent-pulse" : ""}`} />
              {p.label}
            </motion.span>
          </AnimatePresence>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={complaint.status}
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 3 }}
              transition={{ duration: 0.2 }}
              className={`chip ${s?.chip ?? ""}`}
            >
              {s?.label ?? complaint.status}
            </motion.span>
          </AnimatePresence>
        </div>
        <span className="text-[11px] font-semibold text-ink-400">#{complaint.id}</span>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div>
          <p className="label">AI summary</p>
          <p className="mt-1 text-sm font-medium leading-relaxed text-slate-800">
            {complaint.summary}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="label">Category</p>
            <p className="mt-0.5 font-semibold text-slate-800">{complaint.category}</p>
          </div>
          <div className="rounded-lg px-3 py-2" style={{ background: "var(--paper-sunken)" }}>
            <p className="label">Confidence</p>
            <div className="mt-1 flex items-center gap-2">
              <div className="meter flex-1">
                <span
                  className="block h-full rounded-full bg-blue-600"
                  style={{ width: `${confidencePct}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-ink-700">
                <AnimatedNumber value={confidencePct} format={(v) => `${Math.round(v)}%`} />
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-civic-100 bg-civic-50 px-3 py-2.5">
          <p className="label text-civic-700">Routed to</p>
          <p className="mt-0.5 text-sm font-bold text-civic-900">{complaint.routeTo}</p>
          <p className="mt-0.5 text-xs text-civic-700">
            {complaint.locationText || "No location extracted"}{" "}
            {complaint.lat != null && complaint.lng != null
              ? `· ${complaint.lat.toFixed(4)}, ${complaint.lng.toFixed(4)}`
              : "· not on map"}
          </p>
          {contact && (
            <p className="mt-1 text-xs text-civic-700">
              ☎ {contact.helpline} · {contact.email}
              <span className="block text-civic-600">{contact.eta}</span>
            </p>
          )}
        </div>

        {/* SLA clock — the deadline physically draining */}
        {complaint.status !== "resolved" && (
          <div>
            <div className="flex items-center justify-between">
              <p className="label">SLA clock</p>
              <span
                className={`text-[11px] font-bold ${
                  sla.breached ? "text-rose-600" : sla.fraction >= 0.7 ? "text-amber-600" : "text-emerald-600"
                }`}
              >
                {sla.label}
              </span>
            </div>
            <div className="meter mt-1">
              <span
                className={`block h-full rounded-full ${
                  sla.breached ? "bg-rose-500" : sla.fraction >= 0.7 ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${Math.max(2, Math.round(sla.fraction * 100))}%` }}
              />
            </div>
          </div>
        )}

        {/* Crowd clustering */}
        {(complaint.reportCount ?? 1) > 1 && (
          <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">
              {complaint.escalatedAt ? "⚡ Auto-escalated hotspot" : "🔥 Crowd-confirmed cluster"}
            </p>
            <p className="mt-1 text-xs text-violet-900">
              <span className="font-bold">×{complaint.reportCount} citizens</span> reported
              this same issue — merged into one ticket{" "}
              {complaint.escalatedAt ? "and priority auto-raised." : ""}
            </p>
            {complaint.duplicateTexts && (
              <details className="mt-1.5">
                <summary className="cursor-pointer text-[11px] font-semibold text-violet-700 hover:text-violet-900">
                  Show {complaint.duplicateTexts.split("\n").filter(Boolean).length} merged citizen reports
                </summary>
                <ul className="mt-1 space-y-1">
                  {complaint.duplicateTexts
                    .split("\n")
                    .filter(Boolean)
                    .map((t, i) => (
                      <li key={i} className="rounded bg-white/70 px-2 py-1 text-[11px] text-violet-900">
                        “{t}”
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {complaint.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={complaint.imageUrl}
            alt="Complaint evidence photo"
            className="h-44 w-full rounded-lg border border-slate-200 object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}

        {/* Evidence trust card — CNN + forensics verdict on the photo */}
        {complaint.trustScore != null && (
          <TrustCard complaint={complaint} />
        )}

        <div>
          <p className="label">Raw complaint text</p>
          <p className="well mt-1 max-h-36 overflow-y-auto whitespace-pre-wrap bg-ink-900 px-3 py-2.5 text-xs leading-relaxed text-slate-100"
            style={{ background: "#12203a", borderColor: "#0b1526" }}>
            {complaint.rawText}
          </p>
        </div>

        {/* Provenance: source → incident, fully traceable */}
        <ProvenanceChain complaint={complaint} />

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span className="rounded bg-slate-100 px-1.5 py-0.5">
            {SOURCE_LABEL[complaint.source] ?? complaint.source}
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5">
            {SOURCE_LAYER_LABEL[complaint.sourceLayer] ?? complaint.sourceLayer}
          </span>
        </div>

        {/* ML explainability */}
        {showExplain && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Why the AI decided this
              </p>
              <button
                type="button"
                onClick={() => setShowExplain((v) => !v)}
                className="text-[11px] font-semibold text-civic-700 hover:text-civic-900"
              >
                {showExplain ? "Hide" : "Show"}
              </button>
            </div>
            {explainError && (
              <p className="mt-1.5 text-[11px] text-slate-400">
                {explainError} — showing the stored decision only.
              </p>
            )}
            {!explain && !explainError && (
              <p className="mt-1.5 text-[11px] text-slate-400">Loading model explanation…</p>
            )}
            {explain && (
              <div className="mt-2 space-y-3">
                <div>
                  <p className="label">Category probabilities</p>
                  <div className="mt-1">
                    <ProbBar dist={explain.category_probabilities} chosen={explain.category} />
                  </div>
                </div>
                <div>
                  <p className="label">Priority probabilities</p>
                  <div className="mt-1">
                    <ProbBar dist={explain.priority_probabilities} chosen={explain.priority} />
                  </div>
                </div>
                <EvidenceRow label="Category evidence" evidence={explain.category_evidence} />
                <EvidenceRow label="Priority evidence" evidence={explain.priority_evidence} />
              </div>
            )}
          </div>
        )}

        <div>
          <p className="label">Status</p>
          {/* Touch-friendly: 44px+ tall targets, grid on narrow screens */}
          <div className="mt-2 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            {STATUS_FLOW.map((st) => {
              const active = complaint.status === st;
              const style = STATUS_STYLE[st];
              return (
                <button
                  key={st}
                  type="button"
                  disabled={saving}
                  onClick={() => onStatusChange(complaint.id, st)}
                  aria-pressed={active}
                  className={`btn-tactile min-h-touch ${
                    active ? "btn-tactile-primary" : ""
                  } rounded-lg sm:rounded-full sm:px-3 sm:py-1 ${
                    active ? "" : "text-ink-500"
                  }`}
                >
                  {style.label}
                </button>
              );
            })}
            {complaint.status === "needs_review" && (
              <span className="col-span-3 inline-flex min-h-touch items-center justify-center rounded-full border border-violet-300 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 sm:col-span-1">
                Awaiting manual triage
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
