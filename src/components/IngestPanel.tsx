"use client";

import { useState } from "react";
import { generateUploadButton } from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core";
import type { Complaint } from "@/lib/schema";
import { analyzeImageClient, type ClientPreview } from "@/lib/vision/client";
import ProcessingStates from "./ui/ProcessingStates";

const TypedUploadButton = generateUploadButton<OurFileRouter>();

const SOURCES = [
  { id: "tweet", label: "Tweet / X" },
  { id: "email", label: "Email" },
  { id: "social", label: "Social post" },
  { id: "manual", label: "Web form" }
] as const;

type Props = {
  onTriaged: (created: Complaint[]) => void;
};

export default function IngestPanel({ onTriaged }: Props) {
  const [text, setText] = useState("");
  const [source, setSource] = useState<string>("tweet");
  const [bulk, setBulk] = useState(false);
  const [locationHint, setLocationHint] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<ClientPreview | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Paste a raw complaint first — a tweet, email or plain text.");
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const texts = bulk
        ? trimmed
            .split(/\n\s*\n/)
            .map((t) => t.trim())
            .filter(Boolean)
        : [trimmed];
      const items = texts.map((t) => ({
        text: t,
        imageUrl: bulk ? null : imageUrl,
        source: bulk ? "bulk" : source,
        locationHint: locationHint.trim()
      }));

      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items })
      });
      const data = (await res.json()) as {
        complaints?: Complaint[];
        error?: string;
        warning?: string;
      };
      if (!res.ok || !data.complaints) {
        throw new Error(data.error ?? "Triage failed");
      }
      onTriaged(data.complaints);
      setNote(
        `Classified ${data.complaints.length} complaint${
          data.complaints.length > 1 ? "s" : ""
        } through the ML triage pipeline.${data.warning ? ` (${data.warning})` : ""}`
      );
      setText("");
      setImageUrl(null);
      setLocationHint("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-sm font-bold text-slate-900">Ingest raw data</h2>
        <p className="text-xs text-slate-500">
          Paste a tweet, email or social post — the self-hosted ML model
          classifies it in milliseconds.
        </p>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSource(s.id);
                if (s.id !== "manual") setBulk(false);
              }}
              className={`min-h-touch rounded-full border px-3 py-1 text-xs font-semibold transition active:scale-95 ${
                source === s.id && !bulk
                  ? "border-blue-700 bg-blue-600 text-white shadow-sm"
                  : "border-[color:var(--line-strong)] bg-white text-ink-500 hover:border-blue-300 hover:text-blue-700"
              }`}
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setBulk((b) => !b)}
            className={`ml-auto min-h-touch rounded-full border px-3 py-1 text-xs font-semibold transition active:scale-95 ${
              bulk
                ? "border-violet-600 bg-violet-600 text-white shadow-sm"
                : "border-[color:var(--line-strong)] bg-white text-ink-500 hover:border-violet-300 hover:text-violet-700"
            }`}
          >
            Bulk paste
          </button>
        </div>

        <div>
          <label className="label" htmlFor="complaint-text">
            {bulk
              ? "Raw messages (separate each with a blank line)"
              : "Raw complaint text"}
          </label>
          <textarea
            id="complaint-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={bulk ? 7 : 5}
            placeholder={
              bulk
                ? "Huge pothole on 100ft Rd, Indiranagar, two bikers fell today!\n\nStreetlight near Varthur has been dead for 2 weeks, pitch dark…"
                : "@citywater the pipeline near Jayanagar 4th T Block is leaking non-stop, water wasting onto the road…"
            }
            className="well mt-1 w-full resize-y text-sm text-ink-900 placeholder:text-ink-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {!bulk && (
          <div>
            <label className="label" htmlFor="location-hint">
              Location hint <span className="normal-case text-slate-400">(optional)</span>
            </label>
            <input
              id="location-hint"
              value={locationHint}
              onChange={(e) => setLocationHint(e.target.value)}
              placeholder="e.g. 27th Main, HSR Layout, Bengaluru"
              className="well mt-1 w-full text-sm text-ink-900 placeholder:text-ink-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        )}

        {!bulk && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3">
            <p className="label">Evidence photo (optional)</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
              <TypedUploadButton
                endpoint="imageUploader"
                appearance={{
                  button:
                    "min-h-touch bg-civic-700 hover:bg-civic-800 text-white ut-uploading:cursor-not-allowed rounded-lg px-3.5 py-2 text-xs font-semibold sm:py-1.5",
                  allowedContent: "text-xs text-slate-500 ut-allowed-content"
                }}
                onClientUploadComplete={(res) => {
                  const url = res?.[0]?.url;
                  setImageUrl(url ?? null);
                  setUploadError(url ? null : "Upload returned no URL");
                }}
                onUploadError={(err: Error) => {
                  setUploadError(
                    `Image upload unavailable: ${err.message}. You can still triage the text.`
                  );
                }}
                onUploadBegin={(name: string) => {
                  // Instant local CNN preview once the file object is available:
                  // the upload button doesn't hand us the File, so we listen for
                  // the user's selection via a hidden input fallback below.
                  void name;
                }}
              />
              <label className="min-h-touch flex cursor-pointer items-center rounded-lg border border-civic-300 bg-white px-3.5 py-2 text-xs font-semibold text-civic-700 transition hover:bg-civic-50 active:scale-95 sm:py-1.5">
                Analyze locally
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setPreview(null);
                    setPreview(await analyzeImageClient(file));
                  }}
                />
              </label>
              {imageUrl && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  ✓ Photo attached
                  <button
                    type="button"
                    onClick={() => {
                      setImageUrl(null);
                      setPreview(null);
                    }}
                    className="text-emerald-600 underline hover:text-emerald-800"
                  >
                    remove
                  </button>
                </span>
              )}
            </div>
            {preview && (
              <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-blue-800">
                  On-device CNN preview {preview.ok ? `· ${preview.width}×${preview.height}` : "· failed"}
                </p>
                {preview.ok && preview.cnn && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 font-semibold text-white">
                      {preview.cnn.category} {Math.round(preview.cnn.confidence * 100)}%
                    </span>
                    <span className="text-blue-700">
                      degradation {Math.round(preview.cnn.severity * 100)}%
                    </span>
                    {preview.ela && preview.ela.tamperSuspicion > 0.55 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                        ⚠ tamper suspicion
                      </span>
                    )}
                    <span className="text-blue-500">phash {preview.phash?.slice(0, 8)}</span>
                  </div>
                )}
              </div>
            )}
            {uploadError && (
              <p className="mt-1 text-xs text-rose-600">{uploadError}</p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="btn-tactile btn-tactile-amber min-h-touch w-full px-4 py-3 text-sm font-bold disabled:cursor-not-allowed sm:py-2.5 active:scale-[0.99]"
        >
          {busy
            ? "Triaging through the pipeline…"
            : bulk
              ? "Triage all pasted messages"
              : "Classify · prioritize · route"}
        </button>

        <ProcessingStates active={busy} />

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {error}
          </p>
        )}
        {note && !error && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
            {note}
          </p>
        )}
      </div>
    </section>
  );
}
