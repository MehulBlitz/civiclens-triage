"use client";

import { useEffect, useRef, useState } from "react";
import type { Complaint } from "@/lib/schema";

/**
 * Live demo feed — simulates a city firehose by POSTing a realistic raw
 * citizen message through the REAL triage pipeline every few seconds.
 * Everything shown is actually classified + geocoded + clustered server-side.
 */

const FEED: string[] = [
  "Massive pothole near Forum Mall Koramangala, an auto already got stuck in it! #bengalurupo",
  "Drain overflowing on 100ft Rd Indiranagar since morning, whole stretch stinking @bbmp_probe",
  "Garbage not collected in HSR Sector 3 for 4 days, dogs are spreading the waste everywhere",
  "Water pipeline burst near Jayanagar 4th Block — river flowing on the road, please fix NOW",
  "Streetlight dead at Varthur Main Road bus stop, women feel unsafe walking after 7pm",
  "Sewage water entering homes in Kormangala 5th Block, health hazard with kids around!!",
  "Bhai pothole ke wajah se bike gir gaye near Marathahalli bridge, gir gaye do log theek karo",
  "Kachra ka dher in Malleshwaram 8th Cross for days, smell unbearable, kripya jaldi saaf karo",
  "Graffiti back on the MG Road underpass wall, painted it last month only",
  "No water supply in Whitefield for 3 days straight, flats are tanker-dependent now",
  "Downed electric wire near Indiranagar metro station, live wire sparking on the footpath!",
  "Open manhole on Sarjapur Road near Wipro gate — someone already twisted an ankle",
  "Stray cattle on Outer Ring Road causing jams near Agara, trucks are swerving",
  "Paani supply mein tez smell aa raha hai BTM 2nd Stage mein, contaminated lag raha hai",
  "Tree branch fallen on power lines after last night's rain, Hennur Main Road blocked"
];

const LOCATIONS: string[] = [
  "Koramangala, Bengaluru",
  "Indiranagar, Bengaluru",
  "HSR Layout, Bengaluru",
  "Jayanagar, Bengaluru",
  "Varthur, Whitefield, Bengaluru",
  "Malleshwaram, Bengaluru",
  "Sarjapur Road, Bengaluru",
  "Marathahalli, Bengaluru",
  "BTM Layout, Bengaluru",
  "Hennur, Bengaluru"
];

type FeedItem = {
  key: number;
  text: string;
  category: string;
  priority: string;
  merged: boolean;
  reportCount?: number;
  escalated?: boolean;
};

type Props = {
  onTriaged: (created: Complaint[]) => void;
};

export default function LiveFeed({ onTriaged }: Props) {
  const [on, setOn] = useState(false);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const idx = useRef(0);
  const counter = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    if (!on) return;
    const tick = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const text = FEED[idx.current % FEED.length];
        const locationHint = LOCATIONS[idx.current % LOCATIONS.length];
        idx.current += 1;

        const res = await fetch("/api/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [{ text, source: "social", locationHint }]
          })
        });
        const data = (await res.json()) as {
          complaints?: Complaint[];
          merged?: Record<string, unknown>[];
          error?: string;
        };
        if (!res.ok || !data.complaints?.[0]) {
          throw new Error(data.error ?? "Feed triage failed");
        }
        const row = data.complaints[0];
        const mergedInfo = data.merged?.[0] as
          | { reportCount?: number; escalated?: boolean }
          | undefined;
        onTriaged(data.complaints);
        counter.current += 1;
        setItems((prev) =>
          [
            {
              key: counter.current,
              text,
              category: row.category,
              priority: row.priority,
              merged: Boolean(mergedInfo?.reportCount),
              reportCount: mergedInfo?.reportCount,
              escalated: mergedInfo?.escalated
            },
            ...prev
          ].slice(0, 6)
        );
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Feed error");
      } finally {
        busy.current = false;
      }
    };

    void tick();
    const id = setInterval(() => void tick(), 7000);
    return () => clearInterval(id);
  }, [on, onTriaged]);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Live city feed</h2>
          <p className="text-xs text-slate-500">
            Simulated social-media firehose — every post runs the real ML pipeline
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOn((v) => !v)}
          className={`min-h-touch rounded-full border px-3.5 py-2 text-xs font-bold transition active:scale-95 sm:py-1.5 ${
            on
              ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
              : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          {on ? "■ Stop feed" : "▶ Start live feed"}
        </button>
      </div>

      <div className="px-4 py-3 sm:px-5">
        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {error}
          </p>
        )}
        {items.length === 0 && !on && (
          <p className="py-2 text-center text-xs text-slate-400">
            Press start — raw posts arrive every 7s and are classified, routed and
            clustered in front of you.
          </p>
        )}
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li
              key={it.key}
              className="flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs"
            >
              <span
                className="mt-1 h-2 w-2 shrink-0 rounded-full"
                style={{
                  background:
                    it.priority === "urgent"
                      ? "#e11d48"
                      : it.priority === "high"
                        ? "#f97316"
                        : it.priority === "medium"
                          ? "#f59e0b"
                          : "#0ea5e9"
                }}
              />
              <span className="line-clamp-2 min-w-0 flex-1 text-slate-700" title={it.text}>
                {it.text}
              </span>
              <span className="shrink-0 rounded bg-white px-1.5 py-0.5 font-semibold text-slate-600">
                {it.category}
              </span>
              {it.escalated ? (
                <span className="shrink-0 rounded bg-rose-600 px-1.5 py-0.5 font-bold text-white">
                  ⚡ ×{it.reportCount}
                </span>
              ) : it.merged ? (
                <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-700">
                  ×{it.reportCount}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
