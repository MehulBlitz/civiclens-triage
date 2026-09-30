/**
 * Anime.js-powered scroll-reveal engine — the "ScrollTide" pattern.
 *
 * `useReveal()` observes every `.reveal` element inside the document and adds
 * `.is-in` when it enters the viewport; the CSS transition + the per-element
 * `--reveal-delay` custom property create the staggered tide-in effect.
 * Anime.js is then used for the hero choreography (wave drift, counter ticks,
 * meter sweeps) where timeline sequencing matters.
 *
 * Reduced-motion users get everything visible immediately (CSS handles it).
 */
import { useEffect } from "react";

export function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach((el) => io.observe(el));

    // Re-scan after route paints (new pages add new .reveal nodes).
    const t = window.setTimeout(() => {
      document
        .querySelectorAll<HTMLElement>(".reveal:not(.is-in)")
        .forEach((el) => io.observe(el));
    }, 350);

    return () => {
      window.clearTimeout(t);
      io.disconnect();
    };
  });
}

/** Stagger helper: spreads N siblings over a 90ms cascade. */
export function revealDelay(i: number, step = 90): React.CSSProperties {
  return { ["--reveal-delay" as never]: `${Math.min(i * step, 720)}ms` } as React.CSSProperties;
}
