import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useReveal, revealDelay } from "../lib/reveal";
import { Reveal, SectionHead, Meter, Chip } from "../components/Reveal";
import { NAGARSEVAKS, WARDS, zoneList, escalationUrl } from "../lib/wards";
import { useTickets } from "../state";

type SortKey = "sla" | "response" | "resolved" | "open";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "sla", label: "SLA compliance" },
  { key: "response", label: "Fastest response" },
  { key: "resolved", label: "Most resolved" },
  { key: "open", label: "Most open (needs eyes)" },
];

export default function Directory() {
  useReveal();
  const [q, setQ] = useState("");
  const [zone, setZone] = useState("All");
  const [sort, setSort] = useState<SortKey>("sla");
  const { tickets } = useTickets();

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = NAGARSEVAKS.filter((n) => {
      const hay = `${n.name} ${n.ward} ${n.wardName} ${n.party} ${n.zone}`.toLowerCase();
      return (zone === "All" || n.zone === zone) && (!needle || hay.includes(needle));
    });
    const cmp: Record<SortKey, (a: typeof list[number], b: typeof list[number]) => number> = {
      sla: (a, b) => b.slaCompliance - a.slaCompliance,
      response: (a, b) => a.avgResponseHours - b.avgResponseHours,
      resolved: (a, b) => b.complaintsResolved - a.complaintsResolved,
      open: (a, b) => b.complaintsOpen - a.complaintsOpen,
    };
    return [...list].sort(cmp[sort]);
  }, [q, zone, sort]);

  const openByWard = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tickets) if (t.status !== "verified") m[t.ward] = (m[t.ward] ?? 0) + 1;
    return m;
  }, [tickets]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <SectionHead
        eyebrow="Ward governance"
        title="The Nagarsevak Directory"
        sub="Every ward corporator with their accountability ledger — resolved vs open pool, average response hours, SLA compliance — and a WhatsApp escalation that goes straight to their phone. Representative rows are demo data; the ward/zone structure is the real MCGM map."
      />

      {/* controls */}
      <Reveal className="well mb-8 flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, ward (e.g. K West), party…"
          className="min-h-touch flex-1 rounded-lg border border-tide-300 bg-white px-3 text-sm outline-none focus:border-tide-600"
          aria-label="Search nagarsevaks"
        />
        <select
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          className="min-h-touch rounded-lg border border-tide-300 bg-white px-3 text-sm"
          aria-label="Filter by zone"
        >
          {["All", ...zoneList()].map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="min-h-touch rounded-lg border border-tide-300 bg-white px-3 text-sm"
          aria-label="Sort by"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </Reveal>

      <div className="grid gap-5 md:grid-cols-2">
        {rows.map((n, i) => {
          const demoOpen = openByWard[n.ward] ?? 0;
          return (
            <Reveal key={n.id} delay={i * 70} className="well flex flex-col p-5 transition-shadow hover:shadow-lift">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-semibold text-tide-950">{n.name}</h3>
                  <p className="text-sm text-tide-600">
                    {n.designation} · Ward {n.ward} — {n.wardName}
                  </p>
                </div>
                <Chip tone="low">{n.party}</Chip>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-tide-50 py-2">
                  <div className="text-lg font-semibold text-emerald-700">{n.complaintsResolved}</div>
                  <div className="text-[10px] uppercase tracking-wide text-tide-500">resolved</div>
                </div>
                <div className="rounded-lg bg-tide-50 py-2">
                  <div className="text-lg font-semibold text-rose-600">{n.complaintsOpen + demoOpen}</div>
                  <div className="text-[10px] uppercase tracking-wide text-tide-500">open pool</div>
                </div>
                <div className="rounded-lg bg-tide-50 py-2">
                  <div className="text-lg font-semibold text-tide-900">{n.avgResponseHours}h</div>
                  <div className="text-[10px] uppercase tracking-wide text-tide-500">avg response</div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <Meter pct={n.slaCompliance * 100} tone="emerald" label={`SLA compliance ${Math.round(n.slaCompliance * 100)}%`} />
                <Meter pct={n.responseRate * 100} tone="tide" label={`Response rate ${Math.round(n.responseRate * 100)}%`} />
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <a
                  href={escalationUrl(n)}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-touch rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  WhatsApp escalate
                </a>
                <Link
                  to={`/nagarsevak/${n.id}`}
                  className="min-h-touch rounded-lg border border-tide-300 px-4 py-2 text-sm font-semibold text-tide-800 hover:bg-tide-50"
                >
                  Ward profile →
                </Link>
                <span className="ml-auto text-xs text-tide-400">{n.office.split(",").slice(-1)[0]?.trim()}</span>
              </div>
            </Reveal>
          );
        })}
      </div>

      {rows.length === 0 && (
        <Reveal className="well p-10 text-center text-tide-500">
          No nagarsevak matches “{q}”. Try a ward code like <em>K West</em> or <em>M East</em>.
        </Reveal>
      )}

      <Reveal delay={200} className="mt-10">
        <p className="text-xs leading-relaxed text-tide-400">
          Wards covered: {WARDS.length} across {zoneList().length} zones. Demo metrics are
          illustrative for the hackathon build; wire the full-stack app's Postgres ledger for
          live numbers.
        </p>
      </Reveal>
    </div>
  );
}
