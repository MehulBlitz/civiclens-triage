import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { countTo, sweepMeter } from "../lib/anime";
import { useReveal, revealDelay } from "../lib/reveal";
import { Reveal, SectionHead } from "../components/Reveal";
import { useTickets } from "../state";
import { KARMA_POINTS, KARMA_TIERS, tierFor } from "../lib/tickets";

export default function Karma() {
  useReveal();
  const { karma, tickets } = useTickets();
  const ptsRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const tier = tierFor(karma);
  const pctToNext = tier.next ? Math.min(100, (karma / (karma + tier.toNext)) * 100) : 100;

  const leaderboard = useRef(
    [
      { name: "A. Khan (Ward L)", pts: 168 },
      { name: "S. Patil (Ward K West)", pts: 141 },
      { name: "R. Mehta (Ward H East)", pts: 96 },
      { name: "M. Fernandes (R Central)", pts: 74 },
      { name: "P. Jadhav (M East)", pts: 52 },
      { name: "V. Shukla (G North)", pts: 34 },
    ].sort((a, b) => b.pts - a.pts)
  ).current;

  useEffect(() => {
    countTo(ptsRef.current, karma, 900);
    sweepMeter(barRef.current, pctToNext, 200);
  }, [karma, pctToNext]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <SectionHead
        eyebrow="Civic Karma"
        title="Citizens who keep the ward honest"
        sub="Every report, photo, co-sign and verified fix earns points. Tiers run from Rookie Reporter to Civic Legend — the same economy as the full-stack app, persisted on this device."
      />

      {/* your card */}
      <Reveal className="well-deep p-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-saffron-300">Your wallet (this device)</p>
            <div className="font-display mt-2 text-5xl font-semibold text-tide-50">
              <span ref={ptsRef}>0</span>
              <span className="ml-2 text-lg text-tide-300">karma</span>
            </div>
            <p className="mt-1 text-tide-300">
              Tier: <strong className="text-saffron-300">{tier.name}</strong>
              {tier.next ? ` · ${tier.toNext} to ${tier.next}` : " · max tier"}
            </p>
          </div>
          <Link
            to="/report"
            className="min-h-touch rounded-xl bg-saffron-500 px-6 py-3 text-center font-semibold text-tide-950 shadow-lift hover:-translate-y-0.5 transition-transform"
          >
            Earn more karma
          </Link>
        </div>
        <div className="meter mt-6 bg-tide-800">
          <span ref={barRef} className="bg-saffron-400" style={{ width: 0 }} />
        </div>
      </Reveal>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {/* leaderboard */}
        <Reveal className="well p-6">
          <h2 className="font-display text-lg font-semibold text-tide-950">Ward leaderboard</h2>
          <ol className="mt-4 space-y-3">
            {leaderboard.map((row, i) => (
              <li key={row.name} className="flex items-center gap-3">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-saffron-500 text-tide-950" : "bg-tide-100 text-tide-700"}`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-tide-900">{row.name}</span>
                <span className="text-sm font-semibold text-tide-700">{row.pts}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-tide-400">Demo ledger — the full app syncs a public Postgres-backed leaderboard.</p>
        </Reveal>

        {/* tiers + rules */}
        <div className="space-y-6">
          <Reveal delay={90} className="well p-6">
            <h2 className="font-display text-lg font-semibold text-tide-950">Tiers</h2>
            <div className="mt-3 space-y-2">
              {KARMA_TIERS.map((t) => (
                <div key={t.name} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${karma >= t.min ? "bg-emerald-50 text-emerald-800" : "bg-tide-50 text-tide-500"}`}>
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs">{t.min}+ pts {karma >= t.min ? "✓" : ""}</span>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={180} className="well p-6">
            <h2 className="font-display text-lg font-semibold text-tide-950">How points land</h2>
            <ul className="mt-3 space-y-2 text-sm text-tide-600">
              <li className="flex justify-between rounded-lg bg-tide-50 px-3 py-2">
                <span>File a report</span><strong className="text-tide-900">+{KARMA_POINTS.report}</strong>
              </li>
              <li className="flex justify-between rounded-lg bg-tide-50 px-3 py-2">
                <span>Attach photo evidence</span><strong className="text-tide-900">+{KARMA_POINTS.photo}</strong>
              </li>
              <li className="flex justify-between rounded-lg bg-tide-50 px-3 py-2">
                <span>Co-sign a neighbour's ticket</span><strong className="text-tide-900">+{KARMA_POINTS.cosign}</strong>
              </li>
              <li className="flex justify-between rounded-lg bg-tide-50 px-3 py-2">
                <span>Verified resolution credit</span><strong className="text-tide-900">+{KARMA_POINTS.verified}</strong>
              </li>
            </ul>
            <p className="mt-3 text-xs text-tide-400">
              {tickets.length} demo tickets currently circulate karma in this ward.
            </p>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
