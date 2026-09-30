import { Link } from "react-router-dom";
import { SectionHead, Chip, Meter } from "../components/Reveal";
import OsmMap from "../components/OsmMap";
import { useTickets } from "../state";
import { slaState } from "../lib/tickets";

type Mode = "map" | "risk" | "insights" | "channels";

export default function Operations({ mode }: { mode: Mode }) {
  const { tickets } = useTickets();
  const active = tickets.filter((ticket) => ticket.status !== "verified");
  const urgent = active.filter((ticket) => ticket.priority === "urgent" || ticket.priority === "high");
  const withinSla = tickets.filter((ticket) => !slaState(ticket).breached).length;
  const categories = [...new Set(tickets.map((ticket) => ticket.category))];
  const headings: Record<Mode, { eyebrow: string; title: string; sub: string }> = {
    map: { eyebrow: "OpenStreetMap intelligence", title: "Live complaint map", sub: "Real ticket coordinates are plotted on OpenStreetMap. Marker color and size follow the triage priority." },
    risk: { eyebrow: "Civic Incident NN", title: "Risk engine", sub: "Risk uses the model's category and priority output with SLA age, evidence, and community co-signals." },
    insights: { eyebrow: "Calculated evidence ledger", title: "Insights from the queue", sub: "Every figure is calculated from the current ticket store and updates after a report is filed." },
    channels: { eyebrow: "Signal intake", title: "Signal channels", sub: "Citizen text and evidence photos enter the same triage pipeline. The server deployment can also attach monitored adapters." },
  };

  return <div className="mx-auto max-w-6xl px-4 py-14">
    <SectionHead {...headings[mode]} />
    {mode === "map" && <section className="well overflow-hidden p-4"><OsmMap tickets={tickets} /><div className="mt-3 flex flex-wrap gap-2 text-xs text-tide-600"><Chip tone="urgent">urgent</Chip><Chip tone="high">high</Chip><Chip tone="medium">medium</Chip><Chip tone="low">low</Chip><span>{tickets.length} reports · {active.length} active · OpenStreetMap tiles</span></div></section>}
    {mode === "risk" && <div className="grid gap-4 md:grid-cols-2">{(urgent.length ? urgent : active).sort((a, b) => b.cosigns - a.cosigns).slice(0, 12).map((ticket) => { const score = Math.min(99, Math.round(ticket.confidence * 35 + (ticket.priority === "urgent" ? 48 : ticket.priority === "high" ? 34 : 16) + (slaState(ticket).breached ? 12 : 0) + Math.min(ticket.cosigns, 5))); return <article key={ticket.id} className="well p-5"><div className="flex items-center justify-between"><Chip tone={ticket.priority}>{ticket.priority}</Chip><span className="font-mono text-xs text-tide-500">risk {score}</span></div><h2 className="mt-3 font-display text-xl font-semibold text-tide-950">{ticket.category} · Ward {ticket.ward}</h2><p className="mt-1 text-sm text-tide-600">{ticket.location || "Location pending"}</p><Meter pct={score} tone={score > 75 ? "rose" : "saffron"} label={`${score}% attention score · ${slaState(ticket).label}`} /></article>; })}</div>}
    {mode === "insights" && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Total reports", tickets.length], ["Active reports", active.length], ["Urgent/high", urgent.length], ["Within SLA", `${tickets.length ? Math.round((withinSla / tickets.length) * 100) : 0}%`]].map(([label, value]) => <article key={label} className="well p-5"><p className="label">{label}</p><p className="mt-3 text-4xl font-black text-tide-950">{value}</p></article>)}<section className="well p-5 sm:col-span-2 lg:col-span-4"><h2 className="font-display text-xl font-semibold text-tide-950">Category mix</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{categories.map((category) => { const count = tickets.filter((ticket) => ticket.category === category).length; return <Meter key={category} pct={tickets.length ? (count / tickets.length) * 100 : 0} label={`${category} · ${count}`} />; })}</div></section></div>}
    {mode === "channels" && <div className="grid gap-4 md:grid-cols-3"><article className="well p-5"><Chip tone="medium">citizen text</Chip><h2 className="mt-3 font-display text-xl font-semibold text-tide-950">Report a problem</h2><p className="mt-2 text-sm leading-relaxed text-tide-600">Describe the issue, select the ward, and receive category, priority, department, SLA, and confidence immediately.</p><Link to="/report" className="mt-5 inline-block text-sm font-semibold text-saffron-700 hover:underline">Open report form →</Link></article><article className="well p-5"><Chip tone="medium">evidence photo</Chip><h2 className="mt-3 font-display text-xl font-semibold text-tide-950">Attach proof</h2><p className="mt-2 text-sm leading-relaxed text-tide-600">Photo severity analysis runs before filing, so the risk view can use evidence signals alongside complaint text.</p><Link to="/report" className="mt-5 inline-block text-sm font-semibold text-saffron-700 hover:underline">Add a photo →</Link></article><article className="well p-5"><Chip tone="medium">live queue</Chip><h2 className="mt-3 font-display text-xl font-semibold text-tide-950">Recent intake</h2><p className="mt-2 text-sm text-tide-600">{tickets.length} reports are in this browser's queue, with {categories.length} active categories.</p><div className="mt-4 space-y-2">{tickets.slice(0, 3).map((ticket) => <Link key={ticket.id} to={`/track/${ticket.id}`} className="block rounded-lg bg-tide-50 px-3 py-2 text-xs text-tide-700 hover:bg-tide-100">#{1000 + ticket.id} · {ticket.category} · {ticket.status.replace("_", " ")}</Link>)}</div></article></div>}
    <div className="mt-8"><Link to="/report" className="rounded-xl bg-tide-950 px-5 py-3 text-sm font-semibold text-white">Report an issue</Link></div>
  </div>;
}
