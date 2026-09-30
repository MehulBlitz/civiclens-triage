import { useEffect, useRef } from "react";
import { revealDelay } from "../lib/reveal";
import { sweepMeter } from "../lib/anime";

/**
 * ScrollTide-style reveal wrapper — children rise into view once.
 * `delay` staggers siblings (ms).
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}) {
  const Comp = Tag as React.ElementType;
  return (
    <Comp className={`reveal ${className}`} style={revealDelay(delay / 90)}>
      {children}
    </Comp>
  );
}

/** Section header used across pages — eyebrow + serif display title. */
export function SectionHead({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <Reveal className="mb-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-saffron-600">{eyebrow}</p>
      <h2 className="font-display mt-2 text-3xl font-semibold tracking-tight text-tide-950 md:text-4xl">
        {title}
      </h2>
      {sub && <p className="mt-3 max-w-2xl text-tide-600">{sub}</p>}
    </Reveal>
  );
}

/** Animated SLA/metric meter — sweeps to `pct` when scrolled into view. */
export function Meter({ pct, tone = "saffron", label }: { pct: number; tone?: "saffron" | "tide" | "emerald" | "rose"; label?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          sweepMeter(ref.current, pct);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [pct]);

  const bg =
    tone === "saffron" ? "bg-saffron-500" : tone === "emerald" ? "bg-emerald-500" : tone === "rose" ? "bg-rose-500" : "bg-tide-600";
  return (
    <div>
      <div className="meter" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <span ref={ref} className={bg} style={{ width: 0 }} />
      </div>
      {label && <p className="mt-1 text-xs text-tide-500">{label}</p>}
    </div>
  );
}

const TONES: Record<string, string> = {
  urgent: "border-rose-200 bg-rose-50 text-rose-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-sky-200 bg-sky-50 text-sky-700",
  open: "border-tide-200 bg-tide-50 text-tide-700",
  assigned: "border-indigo-200 bg-indigo-50 text-indigo-700",
  in_progress: "border-sky-200 bg-sky-50 text-sky-700",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  verified: "border-emerald-300 bg-emerald-100 text-emerald-800",
};

export function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`chip ${TONES[tone] ?? TONES.open}`}>{children}</span>;
}

export function priorityLabel(p: string) {
  return p.charAt(0).toUpperCase() + p.slice(1);
}
