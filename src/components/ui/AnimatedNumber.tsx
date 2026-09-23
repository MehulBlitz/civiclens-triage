"use client";

import { useEffect, useRef } from "react";
import anime from "animejs";

/**
 * AnimatedNumber — a metric that visibly transitions old → new.
 * anime.js tween communicates "data just changed" instead of a silent re-render.
 * Reduced motion: renders the value instantly (CSS media query also guards).
 */
export default function AnimatedNumber({
  value,
  format,
  className,
  duration = 700
}: {
  value: number;
  format?: (v: number) => string;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const fromRef = useRef(value);
  const fmt =
    format ??
    ((v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1)));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const from = fromRef.current;
    const to = value;
    fromRef.current = value;
    if (from === to) {
      el.textContent = fmt(to);
      return;
    }

    const obj = { v: from };
    const anim = anime({
      targets: obj,
      v: to,
      duration,
      easing: "easeOutExpo",
      update: () => {
        el.textContent = fmt(obj.v);
      }
    });
    return () => anim.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {fmt(value)}
    </span>
  );
}
