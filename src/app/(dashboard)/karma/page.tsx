"use client";

import { useCallback, useEffect, useState } from "react";
import { KARMA_POINTS, KARMA_TIERS } from "@/lib/civic";

type LeaderRow = {
  citizen: string;
  points: number;
  tier: { name: string; color: string; next: string | null; toNext: number };
};

type LedgerRow = {
  id: number;
  citizen: string;
  action: string;
  points: number;
  complaintId: number | null;
  createdAt: string;
};

const ACTION_LABEL: Record<string, { label: string; icon: string }> = {
  report: { label: "Filed a report", icon: "📝" },
  photo_evidence: { label: "Photo evidence", icon: "📸" },
  resolution_proof: { label: "Resolution proof", icon: "✅" },
  cosign: { label: "Co-signed a petition", icon: "🤝" }
};

function tierOf(points: number) {
  let tier = KARMA_TIERS[0];
  for (const t of KARMA_TIERS) if (points >= t.min) tier = t;
  const next = KARMA_TIERS.find((t) => t.min > points) ?? null;
  return { name: tier.name, color: tier.color, next: next?.name ?? null, toNext: next ? next.min - points : 0 };
}

export default function KarmaPage() {
  const [board, setBoard] = useState<LeaderRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/karma", { cache: "no-store" });
      const data = (await res.json()) as { leaderboard: LeaderRow[]; ledger: LedgerRow[] };
      setBoard(data.leaderboard ?? []);
      setLedger(data.ledger ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const max = Math.max(1, ...board.map((b) => b.points));

  return (
    <div className="space-y-5">
      <section className="card overflow-hidden bg-civic-950">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-black text-white">Civic Karma</h1>
            <p className="mt-0.5 text-xs text-civic-200">
              Earn points for every report, photo, co-sign and verified resolution — redeemable against
              property-tax rebates and transit passes in the pilot policy.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(KARMA_POINTS).map(([k, v]) => (
              <span key={k} className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-amber-300">
                {k.replace(/_/g, " ")} +{v}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <section className="card px-4 py-4 sm:px-5 xl:col-span-7">
          <h2 className="text-sm font-bold text-ink-900">Citizen leaderboard</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Points accumulate across every civic action. Tiers: {KARMA_TIERS.map((t) => t.name).join(" → ")}
          </p>
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-400">Loading karma board…</p>
          ) : board.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No karma events yet — file a report with a photo, or co-sign an open complaint, to start earning.
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {board.map((row, i) => {
                const tier = tierOf(row.points);
                return (
                  <li key={row.citizen} className="rounded-xl border border-[color:var(--line)] bg-white px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-civic-100 text-xs font-black text-civic-800">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-900">{row.citizen}</span>
                      <span className={`text-[11px] font-bold uppercase tracking-wide ${tier.color}`}>{tier.name}</span>
                      <span className="text-lg font-black text-amber-600">{row.points}</span>
                    </div>
                    <div className="meter mt-2">
                      <span className="block h-full rounded-full bg-gradient-to-r from-civic-500 to-amber-400" style={{ width: `${Math.max(4, (row.points / max) * 100)}%` }} />
                    </div>
                    {tier.next && (
                      <p className="mt-1 text-[11px] text-ink-400">
                        {tier.toNext} points to {tier.next}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card px-4 py-4 sm:px-5 xl:col-span-5">
          <h2 className="text-sm font-bold text-ink-900">Ledger</h2>
          <p className="mt-0.5 text-xs text-ink-500">Every point event is inspectable — full audit trail.</p>
          {ledger.length === 0 && !loading ? (
            <p className="py-8 text-center text-sm text-slate-400">Ledger is empty.</p>
          ) : (
            <ul className="mt-3 max-h-[480px] space-y-1.5 overflow-y-auto pr-1">
              {ledger.map((e) => {
                const a = ACTION_LABEL[e.action] ?? { label: e.action, icon: "•" };
                return (
                  <li key={e.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
                    <span aria-hidden>{a.icon}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-ink-900">{e.citizen}</span>{" "}
                      <span className="text-ink-500">{a.label.toLowerCase()}</span>
                      {e.complaintId ? (
                        <span className="text-civic-700"> · #{e.complaintId}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-bold text-emerald-600">+{e.points}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
