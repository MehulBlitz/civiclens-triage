export const CATEGORIES = [
  "Pothole",
  "Drainage",
  "Waste",
  "Water",
  "Streetlight",
  "Sewage",
  "Graffiti",
  "Other"
] as const;

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "needs_review"
] as const;
export type Status = (typeof STATUSES)[number];

export const DEPARTMENTS = [
  "Roads & Transport",
  "Stormwater & Drainage",
  "Sanitation Services",
  "Water Board",
  "Electricals (Street Lighting)",
  "Water & Sewerage",
  "Urban Maintenance",
  "General Grievance Cell"
] as const;

export const CATEGORY_DEPARTMENT: Record<string, string> = {
  Pothole: "Roads & Transport",
  Drainage: "Stormwater & Drainage",
  Waste: "Sanitation Services",
  Water: "Water Board",
  Streetlight: "Electricals (Street Lighting)",
  Sewage: "Water & Sewerage",
  Graffiti: "Urban Maintenance",
  Other: "General Grievance Cell"
};

export const PRIORITY_RANK: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1
};

export const PRIORITY_STYLE: Record<
  string,
  { label: string; chip: string; dot: string; hex: string }
> = {
  urgent: {
    label: "Urgent",
    chip: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-600",
    hex: "#e11d48"
  },
  high: {
    label: "High",
    chip: "border-orange-200 bg-orange-50 text-orange-700",
    dot: "bg-orange-500",
    hex: "#f97316"
  },
  medium: {
    label: "Medium",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
    hex: "#f59e0b"
  },
  low: {
    label: "Low",
    chip: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
    hex: "#0ea5e9"
  }
};

export const STATUS_STYLE: Record<
  string,
  { label: string; chip: string }
> = {
  open: { label: "Open", chip: "border-slate-200 bg-slate-100 text-slate-700" },
  in_progress: {
    label: "In progress",
    chip: "border-sky-200 bg-sky-50 text-sky-700"
  },
  resolved: {
    label: "Resolved",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700"
  },
  needs_review: {
    label: "Needs review",
    chip: "border-violet-200 bg-violet-50 text-violet-700"
  }
};

/** Which pipeline layer produced this classification — shown to judges. */
export const SOURCE_LAYER_LABEL: Record<string, string> = {
  seed: "Seed data",
  ml_model: "L1 · ML model",
  rules: "L2 · Rule engine",
  manual: "L3 · Manual review"
};

export const SOURCE_LABEL: Record<string, string> = {
  tweet: "Tweet / X",
  email: "Email",
  social: "Social post",
  manual: "Web form",
  bulk: "Bulk import",
  whatsapp: "WhatsApp (opt-in)",
  x: "X / Twitter",
  news: "News / RSS"
};

/** SLA targets in hours by priority — used for the breach clocks. */
export const SLA_HOURS: Record<string, number> = {
  urgent: 24,
  high: 72,
  medium: 168,
  low: 336
};

/** Department contact info — makes routing actionable, not just a label. */
export const DEPARTMENT_CONTACT: Record<
  string,
  { helpline: string; email: string; eta: string }
> = {
  "Roads & Transport": {
    helpline: "1800-425-2677",
    email: "roads@city.gov",
    eta: "potholes patched within 24h when urgent"
  },
  "Stormwater & Drainage": {
    helpline: "1800-425-2678",
    email: "stormwater@city.gov",
    eta: "desilting crews dispatched on high+"
  },
  "Sanitation Services": {
    helpline: "1800-425-2679",
    email: "sanitation@city.gov",
    eta: "auto-rerun of skipped routes next morning"
  },
  "Water Board": {
    helpline: "1800-425-2680",
    email: "water@city.gov",
    eta: "burst mains attended within 6h"
  },
  "Electricals (Street Lighting)": {
    helpline: "1800-425-2681",
    email: "lighting@city.gov",
    eta: "night patrol verifies dark stretches"
  },
  "Water & Sewerage": {
    helpline: "1800-425-2682",
    email: "sewerage@city.gov",
    eta: "overflow suction truck within 4h when urgent"
  },
  "Urban Maintenance": {
    helpline: "1800-425-2683",
    email: "maintenance@city.gov",
    eta: "scheduled repaint cycles"
  },
  "General Grievance Cell": {
    helpline: "1800-425-2684",
    email: "grievance@city.gov",
    eta: "triaged by a human officer"
  }
};

/** SLA state of a complaint: fraction of its deadline consumed. */
export function slaState(
  priority: string,
  createdAt: string | Date,
  status: string
): {
  deadline: Date;
  hoursLeft: number;
  fraction: number;
  breached: boolean;
  label: string;
} {
  const target = SLA_HOURS[priority] ?? 168;
  const created = new Date(createdAt).getTime();
  const deadline = new Date(created + target * 3_600_000);
  if (status === "resolved") {
    return {
      deadline,
      hoursLeft: 0,
      fraction: 0,
      breached: false,
      label: "Resolved"
    };
  }
  const elapsedH = (Date.now() - created) / 3_600_000;
  const fraction = Math.max(0, Math.min(1, elapsedH / target));
  const hoursLeft = Math.max(0, target - elapsedH);
  const breached = fraction >= 1;
  const label = breached
    ? `SLA breached · ${Math.round(elapsedH - target)}h overdue`
    : hoursLeft < 24
      ? `SLA · ${Math.round(hoursLeft)}h left`
      : `SLA · ${Math.round(hoursLeft / 24)}d left`;
  return { deadline, hoursLeft, fraction, breached, label };
}

export function relativeTime(iso: string | Date): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
