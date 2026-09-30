import { useEffect, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { countTo } from "../lib/anime";
import { useReveal, revealDelay } from "../lib/reveal";
import { Reveal, SectionHead, Meter, Chip } from "../components/Reveal";
import { NAGARSEVAKS, escalationUrl } from "../lib/wards";
import { useTickets } from "../state";
import { slaState } from "../lib/tickets";

export default function Profile() {
  useReveal();
  const { id } = useParams();
  const rep = NAGARSEVAKS.find((n) => String(n.id) === id);
  const resolvedRef = useRef<HTMLSpanElement>(null);
  const openRef = useRef<HTMLSpanElement>(null);
  const { tickets } = useTickets();

  const wardTickets = useMemo(
    () => (rep ? tickets.filter((t) => t.ward === rep.ward) : []),
    [rep, tickets]
  );

  useEffect(() => {
    if (!rep) return;
    countTo(resolvedRef.current, rep.complaintsResolved, 1200);
    countTo(openRef.current, rep.complaintsOpen, 1000);
  }, [rep]);

  if (!rep) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="font-display text-2xl text-tide-900">Nagarsevak not found.</p>
        <Link to="/nagarsevak" className="mt-4 inline-block rounded-lg bg-tide-950 px-5 py-2.5 text-sm font-semibold text-tide-50">
          ← Back to the directory
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <Reveal>
        <Link to="/nagarsevak" className="text-sm font-medium text-tide-500 hover:text-tide-800">
          ← All nagarsevaks
        </Link>
      </Reveal>

      {/* identity header */}
      <Reveal delay={90} className="well-deep mt-4 overflow-hidden p-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-saffron-300">
              Ward {rep.ward} · {rep.zone}
            </p>
            <h1 className="font-display mt-2 text-3xl font-semibold text-tide-50 md:text-4xl">{rep.name}</h1>
            <p className="mt-1 text-tide-300">
              {rep.designation} · {rep.party} · {rep.term}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <a
              href={escalationUrl(rep)}
              target="_blank"
              rel="noreferrer"
              className="min-h-touch rounded-xl bg-emerald-600 px-6 py-3 text-center font-semibold text-white hover:bg-emerald-700"
            >
              WhatsApp escalate
            </a>
            <span className="text-center text-xs text-tide-400">{rep.phone}</span>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-4">
          <div>
            <div className="font-display text-3xl text-tide-50"><span ref={resolvedRef}>0</span></div>
            <div className="text-xs uppercase tracking-wider text-tide-400">resolved</div>
          </div>
          <div>
            <div className="font-display text-3xl text-tide-50"><span ref={openRef}>0</span></div>
            <div className="text-xs uppercase tracking-wider text-tide-400">open pool</div>
          </div>
          <div>
            <div className="font-display text-3xl text-tide-50">{rep.avgResponseHours}h</div>
            <div className="text-xs uppercase tracking-wider text-tide-400">avg response</div>
          </div>
          <div>
            <div className="font-display text-3xl text-tide-50">{Math.round(rep.slaCompliance * 100)}%</div>
            <div className="text-xs uppercase tracking-wider text-tide-400">SLA compliance</div>
          </div>
        </div>
      </Reveal>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {/* contact / office */}
        <Reveal className="well p-6">
          <h2 className="font-display text-lg font-semibold text-tide-950">Ward office</h2>
          <p className="mt-2 text-sm leading-relaxed text-tide-600">{rep.office}</p>
          <p className="mt-3 text-sm text-tide-600">{rep.email}</p>
          <div className="mt-4 space-y-2">
            <Meter pct={rep.slaCompliance * 100} tone="emerald" label="SLA compliance" />
            <Meter pct={rep.responseRate * 100} tone="tide" label="Response rate" />
          </div>
        </Reveal>

        {/* live ward tickets */}
        <Reveal delay={100} className="well p-6 md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-tide-950">Live ward queue</h2>
            <Chip tone="open">{wardTickets.length} tickets</Chip>
          </div>
          <div className="mt-4 space-y-3">
            {wardTickets.length === 0 && (
              <p className="text-sm text-tide-500">
                No demo tickets in this ward yet —{" "}
                <Link to="/report" className="font-medium text-saffron-700 underline">
                  file the first one
                </Link>
                .
              </p>
            )}
            {wardTickets.map((t, i) => {
              const sla = slaState(t);
              return (
                <Reveal key={t.id} delay={i * 70} className="rounded-xl border border-tide-200 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-tide-500">
                    <span className="font-mono">#CL-{1000 + t.id}</span>
                    <Chip tone={t.priority}>{t.priority.toUpperCase()}</Chip>
                    <Chip tone={t.status}>{t.status.replace("_", " ")}</Chip>
                    <span className={sla.breached ? "font-semibold text-rose-600" : ""}>{sla.label}</span>
                  </div>
                  <p className="mt-2 text-sm text-tide-900">{t.text}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-tide-400">
                    <span>{t.location}</span>
                    <Link to={`/track/${t.id}`} className="font-medium text-saffron-700 hover:underline">
                      Track →
                    </Link>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </Reveal>
      </div>

      {/* escalation explainer */}
      <Reveal delay={200} className="well mt-8 p-6">
        <h2 className="font-display text-lg font-semibold text-tide-950">How escalation works</h2>
        <ol className="mt-3 grid gap-3 text-sm text-tide-600 md:grid-cols-3">
          <li className="rounded-lg bg-tide-50 p-3">
            <strong className="text-tide-900">1 · Co-sign</strong> — neighbours add weight to a
            ticket; five co-signatures auto-escalate priority.
          </li>
          <li className="rounded-lg bg-tide-50 p-3">
            <strong className="text-tide-900">2 · WhatsApp</strong> — the escalate button opens a
            prefilled chat to the corporator with the ticket reference.
          </li>
          <li className="rounded-lg bg-tide-50 p-3">
            <strong className="text-tide-900">3 · Public ledger</strong> — every response is timed
            on this page, so response-rate pressure builds visibly.
          </li>
        </ol>
      </Reveal>
    </div>
  );
}
