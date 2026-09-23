"use client";

import { useState } from "react";
import type { Complaint } from "@/lib/schema";

/**
 * Signal channels panel — demonstrates the multi-channel intake story:
 *
 *   WhatsApp  — official Business API webhook (opt-in). "Simulate" posts a
 *               realistic citizen message to /api/channels/whatsapp.
 *   X/Twitter — official-API pattern. "Simulate" posts public posts to
 *               /api/channels/x, treated as signals needing corroboration.
 *   News/RSS  — free feeds watched for civic relevance. "Fetch candidates"
 *               hits /api/channels/news GET; reviewing + accepting POSTs them.
 *
 * Every channel feeds the SAME triage pipeline; provenance is recorded per row.
 */

const DEMO_WHATSAPP = [
  { text: "Namaste, sewage water has entered our house in 5th Cross Jayanagar, 3 days now, children getting sick please help", location: "Jayanagar, Bengaluru" },
  { text: "The streetlights near HSR Sector 1 park are not working from last week, very dark in morning walks", location: "HSR Layout, Bengaluru" }
];

const DEMO_X = [
  { text: "HUGE sinkhole opened up near Silk Board junction after last night rain, traffic chaos, avoid the area!! #bengalurutraffic", location: "Silk Board, Bengaluru" },
  { text: "Day 5 of no garbage pickup in Rajajinagar 1st block. Rats everywhere now. @communal_officer do something", location: "Rajajinagar, Bengaluru" }
];

type Props = {
  onTriaged: (created: Complaint[]) => void;
};

export default function ChannelsPanel({ onTriaged }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newsCandidates, setNewsCandidates] = useState<
    { title: string; description: string; civicScore: number }[]
  >([]);

  const postDemo = async (channel: "whatsapp" | "x") => {
    setBusy(channel);
    setError(null);
    setResult(null);
    try {
      const url =
        channel === "whatsapp" ? "/api/channels/whatsapp" : "/api/channels/x";
      const payload =
        channel === "whatsapp"
          ? { from: "+91-98xxxxxxx", text: DEMO_WHATSAPP[0].text, location: DEMO_WHATSAPP[0].location }
          : { posts: DEMO_X };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await res.json()) as { triaged?: unknown[]; created?: number[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `${channel} intake failed`);
      setResult(
        channel === "whatsapp"
          ? `WhatsApp message triaged → ticket #${(data.triaged?.[0] as { ticketId?: number })?.ticketId ?? "?"}`
          : `X posts triaged → ${(data.triaged ?? []).length} signals processed`
      );
      void refreshAfter(channel);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Channel error");
    } finally {
      setBusy(null);
    }
  };

  const refreshAfter = async (channel: string) => {
    // Give the DB a beat, then refresh via the normal complaints endpoint.
    const res = await fetch("/api/complaints", { cache: "no-store" });
    const data = (await res.json()) as { complaints: Complaint[] };
    onTriaged(data.complaints);
    setResult((r) => r ?? `${channel} channel OK`);
  };

  const fetchNews = async () => {
    setBusy("news");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/channels/news", { cache: "no-store" });
      const data = (await res.json()) as {
        candidates?: { title: string; description: string; civicScore: number }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "News fetch failed");
      setNewsCandidates((data.candidates ?? []).slice(0, 5));
      if ((data.candidates ?? []).length === 0) {
        setResult("No civic-relevant headlines in the feeds right now.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "News error");
    } finally {
      setBusy(null);
    }
  };

  const acceptNews = async (idx: number) => {
    setBusy(`news-${idx}`);
    try {
      const item = newsCandidates[idx];
      const res = await fetch("/api/channels/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ title: item.title, description: item.description }] })
      });
      const data = (await res.json()) as { created?: number[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Triage failed");
      setNewsCandidates((c) => c.filter((_, i) => i !== idx));
      setResult(`News item triaged → ticket #${data.created?.[0] ?? "?"}`);
      void refreshAfter("news");
    } catch (e) {
      setError(e instanceof Error ? e.message : "News triage error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-bold text-slate-900">Signal channels</h2>
        <p className="text-xs text-slate-500">
          WhatsApp (opt-in) · X public posts · News RSS — all through the same triage pipeline
        </p>
      </div>

      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void postDemo("whatsapp")}
            disabled={busy !== null}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
          >
            {busy === "whatsapp" ? "Sending…" : "WhatsApp ⌁ simulate"}
          </button>
          <button
            type="button"
            onClick={() => void postDemo("x")}
            disabled={busy !== null}
            className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          >
            {busy === "x" ? "Posting…" : "X ⌁ simulate posts"}
          </button>
          <button
            type="button"
            onClick={fetchNews}
            disabled={busy !== null}
            className="rounded-lg border border-civic-300 bg-civic-50 px-3 py-1.5 text-xs font-bold text-civic-700 transition hover:bg-civic-100 disabled:opacity-50"
          >
            {busy === "news" ? "Scanning feeds…" : "News ⌁ fetch RSS"}
          </button>
        </div>

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {error}
          </p>
        )}
        {result && !error && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
            {result}
          </p>
        )}

        {newsCandidates.length > 0 && (
          <div className="space-y-2 rounded-lg border border-civic-100 bg-civic-50/50 px-3 py-2.5">
            <p className="label text-civic-700">Civic-relevant headlines (moderate → triage)</p>
            {newsCandidates.map((n, i) => (
              <div key={n.title} className="flex items-start gap-2 rounded-lg bg-white px-2.5 py-2 text-xs">
                <span className="rounded bg-civic-100 px-1.5 py-0.5 font-bold text-civic-700">
                  {n.civicScore}
                </span>
                <span className="min-w-0 flex-1 text-slate-700">{n.title}</span>
                <button
                  type="button"
                  onClick={() => void acceptNews(i)}
                  disabled={busy !== null}
                  className="shrink-0 rounded bg-civic-700 px-2 py-1 font-semibold text-white hover:bg-civic-800 disabled:opacity-50"
                >
                  {busy === `news-${i}` ? "…" : "Triage"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
