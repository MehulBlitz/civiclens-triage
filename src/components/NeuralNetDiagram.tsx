"use client";

import { useMemo } from "react";
import type { RiskPrediction } from "@/lib/nn/infer";
import { NN_ARCHITECTURE, NN_METRICS } from "@/lib/nn/infer";
import weightsFile from "@/lib/nn/weights.json";

/**
 * The neural city — the actual Civic Incident Neural Network drawn live.
 * Node glow = real activation values from the last forward pass; edges are
 * thinned to the strongest input→h1 paths to stay readable. Below: the risk
 * distribution and the honest NN-vs-rule-baseline comparison.
 */

const LEVEL_STYLE: Record<string, { text: string; bar: string; chip: string }> = {
  LOW: { text: "text-sky-700", bar: "bg-sky-400", chip: "border-sky-200 bg-sky-50 text-sky-700" },
  MEDIUM: { text: "text-amber-700", bar: "bg-amber-400", chip: "border-amber-200 bg-amber-50 text-amber-700" },
  HIGH: { text: "text-orange-700", bar: "bg-orange-500", chip: "border-orange-200 bg-orange-50 text-orange-700" },
  CRITICAL: { text: "text-rose-700", bar: "bg-rose-600", chip: "border-rose-200 bg-rose-50 text-rose-700" },
};

function LayerColumn({
  values,
  x,
  color,
  maxNodes = 12
}: {
  values: number[];
  x: number;
  color: string;
  maxNodes?: number;
}) {
  const shown = values.slice(0, maxNodes);
  const n = shown.length;
  const height = 150;
  const gap = n > 1 ? height / (n - 1) : 0;
  const max = Math.max(0.0001, ...shown.map(Math.abs));
  return (
    <g>
      {shown.map((v, i) => {
        const y = 75 - height / 2 + i * gap;
        const intensity = Math.min(1, Math.abs(v) / max);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={3 + intensity * 3}
            fill={color}
            opacity={0.25 + intensity * 0.75}
          />
        );
      })}
      {n > maxNodes && (
        <text x={x} y={170} textAnchor="middle" fontSize="8" fill="#94a3b8">
          +{values.length - maxNodes}
        </text>
      )}
    </g>
  );
}

function Edges({
  fromX,
  toX,
  from,
  to,
  color,
  maxEdges = 24
}: {
  fromX: number;
  toX: number;
  from: number[];
  to: number[];
  color: string;
  maxEdges?: number;
}) {
  const edges = useMemo(() => {
    const pairs: { i: number; j: number; w: number }[] = [];
    // Draw all-to-all only when narrow; else sample deterministically.
    const stride = Math.max(1, Math.ceil((from.length * to.length) / maxEdges));
    let count = 0;
    for (let i = 0; i < from.length && count < maxEdges; i++) {
      for (let j = 0; j < to.length && count < maxEdges; j += stride) {
        pairs.push({ i, j, w: (from[i] + to[j]) / 2 });
        count++;
      }
    }
    return pairs;
  }, [from, to, maxEdges]);

  const maxW = Math.max(0.0001, ...edges.map((e) => e.w));
  const height = 150;
  const yOf = (idx: number, len: number) =>
    len > 1 ? 75 - height / 2 + (idx * height) / (len - 1) : 75;

  return (
    <g>
      {edges.map((e, k) => (
        <line
          key={k}
          x1={fromX}
          y1={yOf(e.i, from.length)}
          x2={toX}
          y2={yOf(e.j, to.length)}
          stroke={color}
          strokeWidth={0.5 + (e.w / maxW) * 1.5}
          opacity={0.08 + (e.w / maxW) * 0.3}
        />
      ))}
    </g>
  );
}

export default function NeuralNetDiagram({
  prediction,
  situationLabel
}: {
  prediction: RiskPrediction | null;
  situationLabel: string;
}) {
  const arch = NN_ARCHITECTURE;
  const metrics = NN_METRICS;
  const featureOrder = (weightsFile as { feature_order?: string[] }).feature_order ?? [];
  const act = prediction?.activations;
  const level = prediction?.level ?? "LOW";
  const style = LEVEL_STYLE[level] ?? LEVEL_STYLE.LOW;

  const columns =
    act && act.hidden1.length > 0
      ? [act.input, act.hidden1, act.hidden2, act.hidden3, act.output]
      : [Array.from({ length: 10 }, () => 0.5), [], [], [], []];

  const xs = [60, 160, 260, 360, 460];
  const colors = ["#0ea5e9", "#1f668c", "#1c5271", "#7c3aed", level === "CRITICAL" ? "#e11d48" : "#f59e0b"];

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Neural city — live network</h2>
          <p className="text-xs text-slate-500">
            Civic Incident NN · 10→{arch[1]}→{arch[2]}→{arch[3]}→4 · activation glow = real forward pass
          </p>
        </div>
        <span className={`chip ${style.chip}`}>{level} risk</span>
      </div>

      <div className="space-y-3 px-5 py-4">
        <svg viewBox="0 0 520 190" className="h-[190px] w-full">
          {/* edges */}
          {columns[0].length > 0 && (
            <Edges fromX={xs[0]} toX={xs[1]} from={columns[0]} to={columns[1]} color="#1f668c" />
          )}
          {columns[1].length > 0 && (
            <Edges fromX={xs[1]} toX={xs[2]} from={columns[1]} to={columns[2]} color="#1c5271" />
          )}
          {columns[2].length > 0 && (
            <Edges fromX={xs[2]} toX={xs[3]} from={columns[2]} to={columns[3]} color="#7c3aed" />
          )}
          {columns[3].length > 0 && (
            <Edges fromX={xs[3]} toX={xs[4]} from={columns[3]} to={columns[4]} color="#f59e0b" />
          )}
          {/* nodes */}
          <LayerColumn values={columns[0]} x={xs[0]} color={colors[0]} maxNodes={10} />
          <LayerColumn values={columns[1]} x={xs[1]} color={colors[1]} />
          <LayerColumn values={columns[2]} x={xs[2]} color={colors[2]} />
          <LayerColumn values={columns[3]} x={xs[3]} color={colors[3]} />
          <LayerColumn values={columns[4]} x={xs[4]} color={colors[4]} maxNodes={4} />

          <text x={60} y={185} textAnchor="middle" fontSize="9" fill="#64748b">features (10)</text>
          <text x={460} y={185} textAnchor="middle" fontSize="9" fill="#64748b">risk (4)</text>
          <text x={260} y={12} textAnchor="middle" fontSize="9" fill="#94a3b8">
            {situationLabel}
          </text>
        </svg>

        {/* Risk distribution */}
        {prediction && (
          <div className="space-y-1.5">
            {prediction.probabilities.map(({ level: lvl, p }) => {
              const s = LEVEL_STYLE[lvl] ?? LEVEL_STYLE.LOW;
              const chosen = lvl === prediction.level;
              return (
                <div key={lvl} className="flex items-center gap-2 text-[11px]">
                  <span className={`w-16 shrink-0 font-semibold ${chosen ? s.text : "text-ink-400"}`}>
                    {lvl}
                  </span>
                  <div className="meter flex-1">
                    <span
                      className={`block h-full rounded-full ${chosen ? s.bar : "bg-ink-300"}`}
                      style={{ width: `${Math.max(2, Math.round(p * 100))}%` }}
                    />
                  </div>
                  <span className="w-9 shrink-0 text-right text-ink-500">
                    {Math.round(p * 100)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Input inspection: normalized feature values (0–1) */}
        {prediction && prediction.activations.input.length > 0 && (
          <details className="rounded-lg border border-[color:var(--line)] px-3 py-2" style={{ background: "var(--paper-sunken)" }}>
            <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-ink-500">
              Inspect inputs · normalized feature values
            </summary>
            <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {prediction.activations.input.map((v, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <span className="w-28 shrink-0 truncate text-ink-500">
                    {featureOrder[i] ?? `feature_${i}`}
                  </span>
                  <div className="meter flex-1" style={{ height: 4 }}>
                    <span
                      className="block h-full rounded-full bg-blue-500"
                      style={{ width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right font-semibold text-ink-700">
                    {v.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-ink-400">
              Visualization of model architecture and inference flow — not an
              expose of internal reasoning.
            </p>
          </details>
        )}

        {/* NN vs rules comparison + provenance */}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="label">Neural net</p>
            <p className={`mt-0.5 font-bold ${style.text}`}>{level}</p>
            <p className="text-slate-400">
              held-out acc {Math.round(metrics.nn_accuracy * 100)}%
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="label">Rule baseline</p>
            <p className="mt-0.5 font-bold text-slate-600">
              {prediction?.baselineLevel ?? "—"}
            </p>
            <p className="text-slate-400">
              rules acc {Math.round(metrics.rule_baseline_accuracy * 100)}%
            </p>
          </div>
        </div>

        {prediction && prediction.topSignals.length > 0 && (
          <div>
            <p className="label">Top contributing signals</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {prediction.topSignals.map((s) => (
                <span
                  key={s.feature}
                  className="rounded-full border border-civic-200 bg-civic-50 px-2 py-0.5 text-[11px] font-medium text-civic-800"
                >
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
