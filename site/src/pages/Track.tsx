import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useReveal, revealDelay } from "../lib/reveal";
import { Reveal, SectionHead, Chip, Meter } from "../components/Reveal";
import { useTickets } from "../state";
import { slaState } from "../lib/tickets";
import { NAGARSEVAKS, escalationUrl } from "../lib/wards";

const STEPS = ["Filed", "Assigned to crew", "Work in progress", "Resolution proof", "Verified"];

export default function Track() {
  useReveal();
  const params = useParams();
  const { tickets, cosign, advance } = useTickets();
  const [q, setQ] = useState((params.id ?? "").replace(/\D/g, ""));

  const found = useMemo(() => {
    const n = Number(q);
    return tickets.find((t) => t.id === n) ?? null;
  }, [q, tickets]);

  const recent = useMemo(() => [...tickets].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6), [tickets]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <SectionHead
        eyebrow="Public ledger · no login"
        title="Track a ticket"
        sub="Every ticket's lifecycle and SLA clock, visible to any citizen. Try #CL-1001…1008 from the demo ward."
      />

      <Reveal className="well flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value.replace(/\D/g, ""))}
          placeholder="Ticket number (e.g. 1001 or 1)"
          inputMode="numeric"
          className="min-h-touch flex-1 rounded-lg border border-tide-300 bg-white px-3 text-sm outline-none focus:border-tide-600"
          aria-label="Ticket number"
        />
        <button
          onClick={() => setQ(q)}
          className="min-h-touch rounded-lg bg-tide-950 px-5 py-2 text-sm font-semibold text-tide-50 hover:bg-tide-800"
        >
          Look up
        </button>
      </Reveal>

      {found ? (
        <TicketCard t={found} onCosign={() => cosign(found.id)} onAdvance={() => advance(found.id)} />
      ) : (
        <Reveal className="mt-6">
          <p className="text-sm font-medium text-tide-600">
            {q ? `No ticket #CL-${1000 + Number(q)}` : "Recent tickets in the demo ward:"}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {recent.map((t, i) => (
              <Reveal key={t.id} delay={i * 60}>
                <button
                  onClick={() => setQ(String(t.id))}
                  className="w-full rounded-xl border border-tide-200 bg-white p-3 text-left transition hover:border-tide-400"
                >
                  <div className="flex items-center justify-between text-xs text-tide-500">
                    <span className="font-mono">#CL-{1000 + t.id}</span>
                    <Chip tone={t.priority}>{t.priority.toUpperCase()}</Chip>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-tide-900">{t.text}</p>
                </button>
              </Reveal>
            ))}
          </div>
        </Reveal>
      )}
    </div>
  );
}

function TicketCard({
  t,
  onCosign,
  onAdvance,
}: {
  t: ReturnType<typeof useTickets>["tickets"][number];
  onCosign: () => void;
  onAdvance: () => void;
}) {
  const sla = slaState(t);
  const stepIdx = { open: 0, assigned: 1, in_progress: 2, resolved: 3, verified: 4 }[t.status];
  const rep = NAGARSEVAKS.find((n) => n.ward === t.ward);

  return (
    <Reveal className="well mt-6 p-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-tide-500">
        <span className="font-mono text-sm font-semibold text-tide-900">#CL-{1000 + t.id}</span>
        <Chip tone={t.priority}>{t.priority.toUpperCase()}</Chip>
        <Chip tone={t.status}>{t.status.replace("_", " ")}</Chip>
        <Chip tone="low">{t.category}</Chip>
        <span className={sla.breached ? "font-semibold text-rose-600" : ""}>{sla.label}</span>
      </div>

      <p className="mt-4 font-display text-xl leading-snug text-tide-950">{t.text}</p>
      <p className="mt-1 text-sm text-tide-500">
        {t.location || "Ward " + t.ward} · filed by {t.reporter} · {new Date(t.createdAt).toLocaleString("en-IN")}
      </p>

      <div className="mt-5">
        <Meter pct={sla.pct} tone={sla.breached ? "rose" : t.status === "verified" ? "emerald" : "saffron"} label={sla.label} />
      </div>

      {/* lifecycle stepper */}
      <ol className="mt-6 grid gap-2 sm:grid-cols-5">
        {STEPS.map((s, i) => (
          <li key={s} className="relative">
            <div
              className={`h-1.5 rounded-full ${i <= stepIdx ? "bg-saffron-500" : "bg-tide-100"}`}
              aria-hidden
            />
            <div className={`mt-2 text-xs ${i <= stepIdx ? "font-semibold text-tide-900" : "text-tide-400"}`}>{s}</div>
          </li>
        ))}
      </ol>

      {/* timeline */}
      <div className="mt-6 space-y-2">
        {t.timeline.map((e, i) => (
          <div key={i} className="flex items-center gap-3 text-sm text-tide-600">
            <span className="h-1.5 w-1.5 rounded-full bg-tide-400" />
            <span className="font-medium text-tide-800">{e.label}</span>
            <span className="text-xs text-tide-400">{new Date(e.at).toLocaleString("en-IN")}</span>
          </div>
        ))}
      </div>

      {/* triage provenance */}
      <div className="mt-6 rounded-xl bg-tide-50 p-4 text-xs text-tide-600">
        <p className="font-semibold uppercase tracking-wide text-tide-500">Triage provenance</p>
        <p className="mt-1">
          Classified by <strong className="text-tide-900">{t.sourceLayer}</strong> layer ·
          confidence {Math.round(t.confidence * 100)}% · routed to {t.department}
          {t.hasPhoto ? " · photo evidence accepted" : ""}
        </p>
        {t.signals.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {t.signals.map((s) => (
              <span key={s.word} className="chip border-tide-200 bg-white text-tide-700">{s.word}</span>
            ))}
          </div>
        )}
      </div>

      {/* actions */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button onClick={onCosign} className="min-h-touch rounded-lg bg-saffron-500 px-4 py-2 text-sm font-semibold text-tide-950 hover:bg-saffron-600">
          Co-sign ({t.cosigns}){t.cosigns >= 5 ? " · escalated" : ""}
        </button>
        <button onClick={onAdvance} className="min-h-touch rounded-lg border border-tide-300 px-4 py-2 text-sm font-semibold text-tide-800 hover:bg-tide-50" title="Demo: simulate the ward crew/officer">
          Advance status (demo)
        </button>
        {rep && (
          <a href={escalationUrl(rep, 1000 + t.id)} target="_blank" rel="noreferrer" className="min-h-touch rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            WhatsApp {rep.name.split(" ")[0]}
          </a>
        )}
        <Link to="/nagarsevak" className="text-sm font-medium text-tide-500 hover:text-tide-800">
          Ward directory →
        </Link>
      </div>
      {t.cosigns >= 5 && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          Five co-signatures reached — priority escalation triggered (mirrors the main app's rule).
        </p>
      )}
    </Reveal>
  );
}
