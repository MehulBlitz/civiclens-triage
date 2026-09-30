/**
 * Demo ticket store — the static site's data layer.
 *
 * GitHub Pages has no Postgres, so the site ships with a seeded set of Mumbai
 * demo tickets (generated from the BMC ward dataset) and persists citizen
 * submissions to localStorage. Every ticket still walks the same lifecycle
 * (open → assigned → in_progress → resolved → verified) and SLA math as the
 * full-stack app, so the demo is honest about scope: "stateless persistence,
 * single-device".
 */
import { classify, slaHoursFor, type Priority } from "./triage";
import { WARDS } from "./wards";

export type Status = "open" | "assigned" | "in_progress" | "resolved" | "verified";

export type Ticket = {
  id: number;
  text: string;
  category: string;
  priority: Priority;
  department: string;
  status: Status;
  ward: string;
  location: string;
  reporter: string;
  createdAt: number;
  confidence: number;
  sourceLayer: "lexicon" | "rules" | "manual";
  signals: { word: string; salience: number }[];
  cosigns: number;
  hasPhoto: boolean;
  timeline: { at: number; label: string }[];
};

const SEEDS: { text: string; ward: string; loc: string; status: Status; ageH: number; cosigns: number; photo: boolean }[] = [
  { text: "Huge pothole on S V Road near the bus stop, Borivali West. Two-wheelers skid every evening during rush hour.", ward: "R Central", loc: "S V Road, Borivali West", status: "in_progress", ageH: 26, cosigns: 11, photo: true },
  { text: "Drainage nali choked near the railway station, Andheri West. Water logging every time it rains for 20 minutes.", ward: "K West", loc: "Near Andheri station, Lokhandwala back road", status: "assigned", ageH: 14, cosigns: 6, photo: true },
  { text: "Garbage not collected for a week in Kurla West. Kachra bins overflowing, stray dogs scattering waste by morning.", ward: "L", loc: "Sakinaka market lane", status: "open", ageH: 40, cosigns: 9, photo: false },
  { text: "Sewage line choked in Govandi — ganda paani backing up into ground-floor toilets. Suction truck needed today itself.", ward: "M East", loc: "Mankhurd RTO road", status: "in_progress", ageH: 8, cosigns: 14, photo: true },
  { text: "Streetlight dead for two weeks near the municipal school, Bandra East. Entire stretch pitch dark after 8pm; women avoid the lane.", ward: "H East", loc: "Near ST depot, Bandra East", status: "assigned", ageH: 60, cosigns: 8, photo: false },
  { text: "No water supply for three days in Ghatkopar West — building taps completely dry.", ward: "N", loc: "Powai ghatkopar road", status: "resolved", ageH: 74, cosigns: 5, photo: false },
  { text: "Illegal banners covering the entire wall after the festival in Dadar West. Request the repaint round.", ward: "G North", loc: "Ranade Road wall", status: "verified", ageH: 120, cosigns: 3, photo: true },
  { text: "Water pipeline burst near Chembur market; clean water gushing into the nali for 6 hours.", ward: "M West", loc: "Chembur market circle", status: "in_progress", ageH: 5, cosigns: 12, photo: true },
];

const REPORTERS = ["A. Khan", "S. Patil", "R. Mehta", "P. Jadhav", "M. Fernandes", "V. Shukla", "N. Sayyed", "D. Rane"];

function buildSeed(): Ticket[] {
  const now = Date.now();
  return SEEDS.map((s, i) => {
    const tri = classify(s.text);
    const createdAt = now - s.ageH * 3_600_000;
    const timeline: Ticket["timeline"] = [{ at: createdAt, label: "Filed" }];
    if (s.status !== "open") timeline.push({ at: createdAt + 2 * 3_600_000, label: "Assigned to crew" });
    if (s.status === "in_progress" || s.status === "resolved" || s.status === "verified")
      timeline.push({ at: createdAt + 6 * 3_600_000, label: "Work in progress" });
    if (s.status === "resolved" || s.status === "verified")
      timeline.push({ at: createdAt + 20 * 3_600_000, label: "Resolution proof submitted" });
    if (s.status === "verified")
      timeline.push({ at: createdAt + 24 * 3_600_000, label: "Verified by ward officer" });
    return {
      id: i + 1,
      text: s.text,
      category: tri.category,
      priority: tri.priority,
      department: tri.department,
      status: s.status,
      ward: s.ward,
      location: s.loc,
      reporter: REPORTERS[i % REPORTERS.length],
      createdAt,
      confidence: tri.confidence,
      sourceLayer: tri.sourceLayer,
      signals: tri.signals,
      cosigns: s.cosigns,
      hasPhoto: s.photo,
      timeline,
    };
  });
}

const LS_KEY = "civiclens_site_tickets_v1";

export function loadTickets(): Ticket[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { tickets: Ticket[]; nextId: number };
      return parsed.tickets;
    }
  } catch {
    /* first run */
  }
  return buildSeed();
}

export function persistTickets(tickets: Ticket[], nextId: number) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ tickets, nextId }));
  } catch {
    /* storage full/blocked — demo keeps running in memory */
  }
}

export function nextTicketId(tickets: Ticket[]): number {
  return tickets.reduce((m, t) => Math.max(m, t.id), 0) + 1;
}

/** File a new citizen report through the client triage pipeline. */
export function fileTicket(
  tickets: Ticket[],
  input: { text: string; location: string; ward: string; reporter: string; hasPhoto: boolean }
): Ticket {
  const tri = classify(input.text);
  const now = Date.now();
  return {
    id: nextTicketId(tickets),
    text: input.text,
    category: tri.category,
    priority: tri.priority,
    department: tri.department,
    status: "open",
    ward: input.ward,
    location: input.location,
    reporter: input.reporter || "Anonymous citizen",
    createdAt: now,
    confidence: tri.confidence,
    sourceLayer: tri.sourceLayer,
    signals: tri.signals,
    cosigns: 0,
    hasPhoto: input.hasPhoto,
    timeline: [{ at: now, label: "Filed" }],
  };
}

/** Advance a ticket one lifecycle step (demo officer/crew simulation). */
export function advanceStatus(s: Status): Status {
  const order: Status[] = ["open", "assigned", "in_progress", "resolved", "verified"];
  const i = order.indexOf(s);
  return order[Math.min(order.length - 1, i + 1)];
}

export function slaState(t: Ticket): { pct: number; breached: boolean; label: string } {
  if (t.status === "verified") return { pct: 100, breached: false, label: "Verified — SLA met" };
  const hours = slaHoursFor(t.category, t.priority);
  const elapsed = (Date.now() - t.createdAt) / 3_600_000;
  const pct = Math.min(100, (elapsed / hours) * 100);
  const breached = pct >= 100;
  const left = Math.max(0, hours - elapsed);
  return {
    pct,
    breached,
    label: breached
      ? `SLA breached · ${Math.round(elapsed - hours)}h overdue`
      : left < 24
        ? `SLA · ${Math.round(left)}h left`
        : `SLA · ${Math.round(left / 24)}d left`,
  };
}

// ---------------------------------------------------------------------------
// Civic Karma (mirrors the main app's ledger, client-side)
// ---------------------------------------------------------------------------

export const KARMA_POINTS = { report: 10, photo: 5, cosign: 2, verified: 20 } as const;

export const KARMA_TIERS: { readonly min: number; readonly name: string }[] = [
  { min: 0, name: "Rookie Reporter" },
  { min: 25, name: "Civic Volunteer" },
  { min: 75, name: "Ward Guardian" },
  { min: 150, name: "City Champion" },
  { min: 300, name: "Civic Legend" },
];

export function tierFor(points: number): { name: string; next: string | null; toNext: number } {
  let tier: { readonly min: number; readonly name: string } = KARMA_TIERS[0];
  for (const t of KARMA_TIERS) if (points >= t.min) tier = t;
  const next = KARMA_TIERS.find((t) => t.min > points) ?? null;
  return { name: tier.name, next: next?.name ?? null, toNext: next ? next.min - points : 0 };
}

const LS_KARMA = "civiclens_site_karma_v1";

export function loadKarma(): number {
  try {
    return Number(localStorage.getItem(LS_KARMA) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function saveKarma(points: number) {
  try {
    localStorage.setItem(LS_KARMA, String(points));
  } catch {
    /* ignore */
  }
}
