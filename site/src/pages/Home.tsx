import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import anime from "animejs";
import { useReveal, revealDelay } from "../lib/reveal";
import { heroWaves, countTo } from "../lib/anime";
import { Reveal, SectionHead, Meter, Chip } from "../components/Reveal";
import { useTickets } from "../state";
import { WARDS } from "../lib/wards";
import { LEXICON_METRICS, slaHoursFor } from "../lib/triage";

const TICKER = [
  "IMD: heavy showers expected in Konkan belt over next 48h",
  "Ward K West · desilting round completed on Lokhandwala back road",
  "Ward M East · suction truck dispatched to Mankhurd RTO road",
  "BMC corpus v2: distilled client lexicon reports " +
    `${Math.round((LEXICON_METRICS.categoryAccuracy ?? 0) * 100)}% category / ` +
    `${Math.round((LEXICON_METRICS.priorityAccuracy ?? 0) * 100)}% priority on held-out BMC data`,
  "Monsoon cell: 1916 helpline active 24×7",
];

const FEATURES = [
  {
    title: "Triage that runs in your browser",
    body: "The BMC-trained lexicon ships inside this page — classify any complaint (pothole, nali, kachra, paani, streetlight, sewage) with zero server. A held-out BMC slice measures the accuracy shown; the layer that decided is always labelled.",
    tag: "Client-side triage",
  },
  {
    title: "Citizen-first ward intelligence",
    body: "Every report is tied to a neutral ward, department, SLA and evidence trail. Citizens can see what is happening and what needs attention next.",
    tag: "Citizen management",
  },
  {
    title: "Live map and risk engine",
    body: "Explore geocoded complaints, spatial clusters, flood signals and neural risk scores in the full operations app. The map shows where attention is needed; the risk engine explains why.",
    tag: "City intelligence",
  },
  {
    title: "Monsoon-first SLA clocks",
    body: "Sewage is 24h, drainage 72h, potholes 72h, graffiti relaxed. Clocks swell during the monsoon so the most hazardous complaints surface first — the way Mumbai actually breaks.",
    tag: "SLA engine",
  },
  {
    title: "Civic Karma for citizens",
    body: "Reports earn points, photos earn more, co-signs rally neighbours and verified fixes pay best. Tiers from Rookie Reporter to Civic Legend keep the ward watching back.",
    tag: "Rewards",
  },
];

export default function Home() {
  useReveal();
  const waveA = useRef<HTMLDivElement>(null);
  const waveB = useRef<HTMLDivElement>(null);
  const waveC = useRef<HTMLDivElement>(null);
  const statRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const { tickets } = useTickets();

  useEffect(() => {
    heroWaves([waveA.current, waveB.current, waveC.current]);
    anime({
      targets: ".hero-line",
      opacity: [0, 1],
      translateY: [26, 0],
      delay: anime.stagger(140, { start: 180 }),
      duration: 900,
      easing: "easeOutExpo",
    });
    anime({
      targets: ".hero-sun",
      scale: [0.6, 1],
      opacity: [0, 1],
      duration: 1200,
      easing: "easeOutExpo",
    });
    const representedWards = new Set(tickets.map((ticket) => ticket.ward)).size;
    const categoryAccuracy = Math.round((LEXICON_METRICS.categoryAccuracy ?? 0) * 100);
    statRefs.current.forEach((el, i) => countTo(el, [tickets.length, representedWards || WARDS.length, categoryAccuracy, slaHoursFor("Sewage", "urgent")][i] ?? 0, 1500));
  }, [tickets.length]);

  const open = tickets.filter((t) => t.status !== "verified").length;

  return (
    <div>
      {/* ------------------------------------------------ hero */}
      <section className="relative overflow-hidden bg-tide-950 text-tide-50">
        {/* anime.js-driven wave layers */}
        <div ref={waveA} className="pointer-events-none absolute -bottom-16 left-0 h-40 w-[120%] rounded-[45%] bg-tide-800/70" />
        <div ref={waveB} className="pointer-events-none absolute -bottom-24 left-0 h-40 w-[120%] rounded-[45%] bg-tide-700/50" />
        <div ref={waveC} className="pointer-events-none absolute -bottom-32 left-0 h-40 w-[120%] rounded-[45%] bg-tide-600/40" />
        <div className="hero-sun pointer-events-none absolute -right-10 top-8 h-36 w-36 rounded-full bg-saffron-400/90 blur-[1px]" />

        <div className="relative mx-auto max-w-6xl px-4 pb-32 pt-20 md:pt-28">
          <p className="hero-line text-xs font-semibold uppercase tracking-[0.25em] text-saffron-300">
            Brihanmumbai Municipal Corporation · Ward Intelligence
          </p>
          <h1 className="font-display hero-line mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            Every <span className="text-saffron-400">gaddha</span>, <span className="text-saffron-400">nali</span> and
            {" "}<span className="text-saffron-400">kachra</span> point — triaged before the tide turns.
          </h1>
          <p className="hero-line mt-6 max-w-2xl text-lg text-tide-200">
            CivicLens classifies, prioritizes and routes citizen complaints with a
            BMC/Mumbai-trained lexicon that runs entirely in your browser — with a
            neutral ward workflow, live map, risk engine and transparent citizen ledger.
          </p>
          <div className="hero-line mt-9 flex flex-wrap gap-3">
            <Link
              to="/report"
              className="min-h-touch rounded-xl bg-saffron-500 px-6 py-3 font-semibold text-tide-950 shadow-lift transition-transform hover:-translate-y-0.5"
            >
              Report an issue
            </Link>
            <Link
              to="/track"
              className="min-h-touch rounded-xl border border-tide-400/60 px-6 py-3 font-semibold text-tide-100 transition-colors hover:bg-tide-800"
            >
              Track a report
            </Link>
          </div>

          <div className="hero-line mt-14 grid grid-cols-2 gap-6 md:grid-cols-4">
            {[
              { label: "complaints in the live queue", v: 0 },
              { label: "wards represented in reports", v: 1 },
              { label: "category accuracy on held-out BMC slice", v: 2, suffix: "%" },
              { label: "sewage SLA (hours)", v: 3 },
            ].map((s, i) => (
              <div key={s.label}>
                <div className="font-display text-3xl font-semibold text-tide-50 md:text-4xl">
                  <span ref={(el) => (statRefs.current[i] = el)}>0</span>
                  {s.suffix ?? ""}
                </div>
                <div className="mt-1 text-xs uppercase tracking-wider text-tide-400">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ live ticker */}
      <div className="overflow-hidden border-y border-saffron-200 bg-saffron-50 py-2.5">
        <div className="marquee-track whitespace-nowrap text-sm text-saffron-800">
          {[0, 1].map((k) => (
            <span key={k} className="mx-8 inline-flex gap-10">
              {TICKER.map((t, i) => (
                <span key={i}>◉ {t}</span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------ features */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <SectionHead
          eyebrow="What makes it CivicLens"
          title="A triage stack that never needs a server to be useful"
          sub="The full ML stack lives in the main repo (Python SVM + CNN). This site distills that corpus into a browser-run lexicon — the same taxonomy, routing and SLA math, zero infrastructure."
        />
        <div className="grid gap-5 md:grid-cols-2">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 90} className="well group p-6 transition-shadow hover:shadow-lift">
              <Chip tone="medium">{f.tag}</Chip>
              <h3 className="font-display mt-3 text-xl font-semibold text-tide-950">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-tide-600">{f.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ pipeline / transparency */}
      <section className="bg-tide-950 py-20 text-tide-100">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal className="mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-saffron-300">Pipeline · inspectable by design</p>
            <h2 className="font-display mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Three layers, always labelled
            </h2>
            <p className="mt-3 max-w-2xl text-tide-300">
              Judges (and citizens) can see exactly which layer classified each ticket —
              the same contract as the full-stack app.
            </p>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { k: "L1", t: "Distilled BMC lexicon", d: "Salience-weighted keywords learned from the BMC/Mumbai corpus. Held-out category accuracy shown live.", badge: `~${Math.round((LEXICON_METRICS.categoryAccuracy ?? 0) * 100)}% cat` },
              { k: "L2", t: "Mumbai rule engine", d: "Hand-written Hinglish + MCGM jargon rules catch what the lexicon misses — nali, gaddha, ganda paani.", badge: "Hinglish-aware" },
              { k: "L3", t: "Manual review", d: "No signal → ward officer queue. Never a silent wrong answer.", badge: "Always safe" },
            ].map((L, i) => (
              <Reveal key={L.k} delay={i * 110} className="well-deep p-6">
                <div className="flex items-center justify-between">
                  <span className="font-display text-2xl text-saffron-400">{L.k}</span>
                  <span className="chip border-tide-600 bg-tide-800 text-tide-100">{L.badge}</span>
                </div>
                <h3 className="font-display mt-3 text-lg font-semibold text-tide-50">{L.t}</h3>
                <p className="mt-2 text-sm text-tide-300">{L.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ live demo board */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <SectionHead
          eyebrow="Live from the demo ward"
          title="The queue right now"
          sub="Seeded Mumbai demo tickets — file a new one and it joins this board instantly."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {tickets.slice(0, 3).map((t, i) => (
            <Reveal key={t.id} delay={i * 90} className="well p-5">
              <div className="flex items-center justify-between text-xs text-tide-500">
                <span className="font-mono">#CL-{1000 + t.id}</span>
                <Chip tone={t.priority}>{t.priority.toUpperCase()}</Chip>
              </div>
              <p className="mt-3 line-clamp-2 text-sm font-medium text-tide-900">{t.text}</p>
              <div className="mt-4">
                <Meter pct={Math.round(t.confidence * 100)} label={`${t.category} · confidence ${Math.round(t.confidence * 100)}% · ${t.sourceLayer}`} />
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={280} className="mt-8 flex flex-wrap items-center gap-3">
          <Link to="/track" className="rounded-xl bg-tide-950 px-5 py-2.5 text-sm font-semibold text-tide-50 hover:bg-tide-800">
            Track a ticket
          </Link>
          <span className="text-sm text-tide-500">{open} open reports · {tickets.length} total reports</span>
        </Reveal>
      </section>

      {/* ------------------------------------------------ CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-4">
        <Reveal className="well-deep relative overflow-hidden p-10 text-center">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-saffron-500/20 blur-2xl" />
          <h2 className="font-display text-3xl font-semibold text-tide-50 md:text-4xl">
            Ten seconds to make your ward visible.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-tide-300">
            Snap the pothole, say the location, hit send. The lexicon does the rest —
            category, priority, department, SLA clock.
          </p>
          <Link
            to="/report"
            className="mt-8 inline-block min-h-touch rounded-xl bg-saffron-500 px-8 py-3.5 font-semibold text-tide-950 shadow-lift transition-transform hover:-translate-y-0.5"
          >
            Report an issue →
          </Link>
        </Reveal>
      </section>
    </div>
  );
}
