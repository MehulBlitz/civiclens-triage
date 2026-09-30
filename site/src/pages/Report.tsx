import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useReveal, revealDelay } from "../lib/reveal";
import { Reveal, SectionHead, Chip, Meter } from "../components/Reveal";
import { classify, analyzePhoto, LEXICON_METRICS, type TriageResult, type VisionPreview } from "../lib/triage";
import { WARDS } from "../lib/wards";
import { useTickets } from "../state";
import { slaHoursFor } from "../lib/triage";

const EXAMPLES = [
  "Huge pothole near Sakinaka signal, bikes skidding every evening, urgent",
  "Nali choked in Dadar West, water logging since last Friday",
  "Streetlight dead for two weeks behind the school in Bandra East",
];

export default function Report() {
  useReveal();
  const { addTicket } = useTickets();
  const [text, setText] = useState("");
  const [location, setLocation] = useState("");
  const [ward, setWard] = useState(WARDS[5].code); // K West default
  const [reporter, setReporter] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [vision, setVision] = useState<VisionPreview | null>(null);
  const [filed, setFiled] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const triage: TriageResult = useMemo(() => classify(text), [text]);
  const dirty = text.trim().length > 0;

  async function onPhoto(f: File | null) {
    setPhoto(f);
    if (!f) {
      setVision(null);
      return;
    }
    setVision(await analyzePhoto(f));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    const t = addTicket({ text, location, ward, reporter, hasPhoto: Boolean(photo) });
    setFiled(t.id);
    setText("");
    setLocation("");
    setPhoto(null);
    setVision(null);
  }

  const slaH = slaHoursFor(triage.category, triage.priority);

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <SectionHead
        eyebrow="Snap & send"
        title="Report a civic issue"
        sub="Type what you see — the BMC-trained lexicon classifies it instantly in your browser, picks the department and starts the SLA clock. No login needed."
      />

      {filed !== null && (
        <Reveal className="well mb-8 border-emerald-300 bg-emerald-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-emerald-800">
                Filed as #CL-{1000 + filed} · +10 karma{photo ? " +5 photo" : ""}
              </p>
              <p className="text-sm text-emerald-700">Saved on this device (static demo persistence).</p>
            </div>
            <Link to={`/track/${filed}`} className="min-h-touch rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              Track it →
            </Link>
          </div>
        </Reveal>
      )}

      <div className="grid gap-6 md:grid-cols-5">
        {/* form */}
        <Reveal className="well p-6 md:col-span-3">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label htmlFor="c-text" className="text-sm font-semibold text-tide-900">What's wrong?</label>
              <textarea
                id="c-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder="e.g. Deep pothole on Linking Road near the bus stop, two-wheelers skidding…"
                className="mt-2 w-full rounded-xl border border-tide-300 bg-white p-3 text-sm outline-none focus:border-tide-600"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setText(ex)}
                    className="rounded-full border border-tide-200 bg-tide-50 px-3 py-1 text-xs text-tide-600 hover:border-tide-400"
                  >
                    try: {ex.slice(0, 34)}…
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="c-loc" className="text-sm font-semibold text-tide-900">Landmark / location</label>
                <input
                  id="c-loc"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Near the market, lane name…"
                  className="mt-2 w-full rounded-xl border border-tide-300 bg-white p-3 text-sm outline-none focus:border-tide-600"
                />
              </div>
              <div>
                <label htmlFor="c-ward" className="text-sm font-semibold text-tide-900">Ward</label>
                <select
                  id="c-ward"
                  value={ward}
                  onChange={(e) => setWard(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-tide-300 bg-white p-3 text-sm"
                >
                  {WARDS.map((w) => (
                    <option key={w.code} value={w.code}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="c-photo" className="text-sm font-semibold text-tide-900">
                Evidence photo <span className="font-normal text-tide-400">(optional, +5 karma)</span>
              </label>
              <input
                id="c-photo"
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
                className="mt-2 block w-full text-sm text-tide-600 file:mr-3 file:min-h-touch file:rounded-lg file:border-0 file:bg-tide-950 file:px-4 file:text-sm file:font-semibold file:text-tide-50"
              />
              {vision?.ok && (
                <p className="mt-2 rounded-lg bg-tide-50 px-3 py-2 text-xs text-tide-600">
                  Photo check: severity {(vision.severity * 100).toFixed(0)}% · {vision.note}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="c-name" className="text-sm font-semibold text-tide-900">
                Your name <span className="font-normal text-tide-400">(optional — anonymous is fine)</span>
              </label>
              <input
                id="c-name"
                value={reporter}
                onChange={(e) => setReporter(e.target.value)}
                placeholder="Anonymous citizen"
                className="mt-2 w-full rounded-xl border border-tide-300 bg-white p-3 text-sm outline-none focus:border-tide-600"
              />
            </div>

            <button
              type="submit"
              disabled={!dirty}
              className="min-h-touch w-full rounded-xl bg-saffron-500 px-6 py-3 font-semibold text-tide-950 shadow-lift transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              File the report
            </button>
          </form>
        </Reveal>

        {/* live triage panel */}
        <Reveal delay={120} className="md:col-span-2">
          <div className="well sticky top-20 p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-tide-950">Live triage</h2>
              <Chip tone={triage.priority}>{triage.priority.toUpperCase()}</Chip>
            </div>

            {dirty ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-tide-50 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-tide-500">Category</div>
                    <div className="font-semibold text-tide-900">{triage.category}</div>
                  </div>
                  <div className="rounded-lg bg-tide-50 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-tide-500">Routes to</div>
                    <div className="font-semibold text-tide-900">{triage.department}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <Meter
                    pct={triage.confidence * 100}
                    tone={triage.sourceLayer === "lexicon" ? "emerald" : triage.sourceLayer === "rules" ? "tide" : "rose"}
                    label={`confidence ${Math.round(triage.confidence * 100)}% · decided by ${triage.sourceLayer}`}
                  />
                </div>

                {triage.signals.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-tide-500">Signals</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {triage.signals.map((s) => (
                        <span key={s.word} className="chip border-saffron-200 bg-saffron-50 text-saffron-800">
                          {s.word} <span className="opacity-60">×{s.salience}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="mt-4 rounded-lg bg-tide-50 p-3 text-xs leading-relaxed text-tide-600">
                  SLA clock: <strong>{slaH}h</strong> for this category/priority. Held-out BMC
                  corpus accuracy: {Math.round((LEXICON_METRICS.categoryAccuracy ?? 0) * 100)}% category ·{" "}
                  {Math.round((LEXICON_METRICS.priorityAccuracy ?? 0) * 100)}% priority.
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-tide-500">
                Start typing — classification appears here as you go, layer-labelled like the
                full-stack app.
              </p>
            )}
          </div>
        </Reveal>
      </div>
    </div>
  );
}
