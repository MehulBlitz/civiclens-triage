"use client";

import { useRef, useState } from "react";
import { useCivic } from "@/components/CivicProvider";
import type { Complaint } from "@/lib/schema";
import { analyzeImageClient } from "@/lib/vision/client";

/**
 * Snap & Send — 10-second civic report.
 * Camera/file first, GPS auto-detect, optional voice note (Web Speech API),
 * one-tap dispatch through the real triage pipeline. On-device CNN preview
 * runs instantly on the photo before upload.
 */

type SpeechCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechCtor(): SpeechCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function QuickReportPage() {
  const { onTriaged } = useCivic();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [location, setLocation] = useState("");
  const [gpsState, setGpsState] = useState<"idle" | "locating" | "ok" | "fail">("idle");
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState<"en-IN" | "hi-IN" | "kn-IN">("en-IN");
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: number; category: string; priority: string; ticketUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cnnNote, setCnnNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const detectGps = () => {
    if (!navigator.geolocation) {
      setGpsState("fail");
      return;
    }
    setGpsState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)} (GPS)`);
        setGpsState("ok");
      },
      () => setGpsState("fail"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const startVoice = () => {
    const Ctor = getSpeechCtor();
    if (!Ctor) {
      setError("Voice input is not supported in this browser — type instead.");
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      setText((t) => (t ? `${t} ${transcript}` : transcript));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const onPickFile = async (f: File | null) => {
    setFile(f);
    setCnnNote(null);
    if (!f) {
      setPreviewUrl(null);
      return;
    }
    setPreviewUrl(URL.createObjectURL(f));
    try {
      const preview = await analyzeImageClient(f);
      if (preview.ok && preview.cnn) {
        setCnnNote(`On-device vision: ${preview.cnn.category} (${Math.round(preview.cnn.confidence * 100)}%), degradation ${Math.round(preview.cnn.severity * 100)}%`);
      }
    } catch {
      // preview is optional
    }
  };

  const send = async () => {
    if (!text.trim() && !file) {
      setError("Add a photo, a voice note, or a sentence — something the AI can triage.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // In this demo the photo stays local (no upload server required);
      // the text path runs the full ML pipeline either way.
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              text: text.trim() || (file ? `Civic issue reported with photo evidence near ${location || "unknown location"}.` : ""),
              source: "manual",
              locationHint: location.trim() || null
            }
          ]
        })
      });
      const data = (await res.json()) as { complaints?: Complaint[]; error?: string };
      if (!res.ok || !data.complaints?.[0]) throw new Error(data.error ?? "Triage failed");
      const c = data.complaints[0];
      setResult({
        id: c.id,
        category: c.category,
        priority: c.priority,
        ticketUrl: `/track?id=${c.id}`
      });
      onTriaged(data.complaints);
      setText("");
      setFile(null);
      setPreviewUrl(null);
      setCnnNote(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <section className="card overflow-hidden bg-civic-950">
        <div className="px-5 py-4">
          <h1 className="text-lg font-black text-white">Snap &amp; Send</h1>
          <p className="mt-0.5 text-xs text-civic-200">
            10-second report: photograph the defect, let GPS pin the spot, speak if typing is too slow — one tap dispatches.
          </p>
        </div>
      </section>

      {result ? (
        <section className="card px-5 py-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">✅</div>
          <h2 className="mt-3 text-base font-black text-ink-900">Dispatched — ticket #{result.id}</h2>
          <p className="mt-1 text-sm text-ink-500">
            AI triaged as <b>{result.category}</b> · priority <b>{result.priority}</b>. Field crews see it instantly.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <a href={result.ticketUrl} className="btn-tactile btn-tactile-primary min-h-touch px-4 py-2.5 text-sm font-bold">Track ticket #{result.id}</a>
            <button type="button" onClick={() => setResult(null)} className="btn-tactile min-h-touch px-4 py-2.5 text-sm">Report another</button>
          </div>
        </section>
      ) : (
        <section className="card space-y-4 px-4 py-4 sm:px-5">
          {/* Step 1: photo */}
          <div>
            <p className="label">1 · Spot &amp; capture</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-1.5 flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-civic-300 bg-civic-50/50 text-sm font-semibold text-civic-700 transition hover:bg-civic-50"
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Selected evidence" className="h-full w-full rounded-lg object-cover" />
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8"><path strokeLinecap="round" d="M3 8a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" /><circle cx="12" cy="13" r="3.5" /></svg>
                  Tap to open camera or choose a photo
                </>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)} />
            {cnnNote && <p className="mt-1.5 text-[11px] font-semibold text-blue-700">{cnnNote}</p>}
          </div>

          {/* Step 2: location */}
          <div>
            <p className="label">2 · Location</p>
            <div className="mt-1.5 flex gap-2">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Landmark or street address"
                className="well min-w-0 flex-1 text-sm"
              />
              <button type="button" onClick={detectGps} disabled={gpsState === "locating"} className="btn-tactile min-h-touch shrink-0 px-3 text-xs">
                {gpsState === "locating" ? "Locating…" : gpsState === "ok" ? "✓ GPS" : "📍 Detect GPS"}
              </button>
            </div>
          </div>

          {/* Step 3: describe / speak */}
          <div>
            <p className="label">3 · Describe or speak</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {(["en-IN", "hi-IN", "kn-IN"] as const).map((l) => (
                <button key={l} type="button" onClick={() => setLang(l)} className={`min-h-touch rounded-full border px-2.5 py-1 text-[11px] font-bold ${lang === l ? "border-blue-600 bg-blue-600 text-white" : "border-[color:var(--line-strong)] bg-white text-ink-500"}`}>
                  {l === "en-IN" ? "English" : l === "hi-IN" ? "हिंदी" : "ಕನ್ನಡ"}
                </button>
              ))}
              <button
                type="button"
                onClick={startVoice}
                className={`min-h-touch ml-auto rounded-full border px-3 py-1.5 text-xs font-bold ${listening ? "border-rose-400 bg-rose-50 text-rose-700 animate-pulseSoft" : "border-[color:var(--line-strong)] bg-white text-ink-700"}`}
              >
                {listening ? "● Listening… tap to stop" : "🎙 Speak grievance"}
              </button>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="What is wrong here? (or speak — we transcribe)"
              className="well mt-1.5 w-full text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-ink-500">
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Submit anonymously (your name won&apos;t be shown publicly)
          </label>

          {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}

          <button type="button" onClick={() => void send()} disabled={busy} className="btn-tactile btn-tactile-amber min-h-touch w-full px-4 py-3.5 text-sm font-black active:scale-[0.99]">
            {busy ? "Triaging…" : "⚡ Snap & Send — 1-click dispatch"}
          </button>
        </section>
      )}
    </div>
  );
}
