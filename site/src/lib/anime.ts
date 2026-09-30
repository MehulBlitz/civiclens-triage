/**
 * Anime.js helpers — typed wrappers over animejs@3 used across the site.
 * Kept in one module so every animation shares the same easing "voice"
 * (easeOutExpo for entrances, easeInOutQuad for loops).
 */
import anime from "animejs";

/** Count a numeric node up to `to` with an eased tick. */
export function countTo(el: HTMLElement | null, to: number, duration = 1400) {
  if (!el) return;
  const obj = { n: 0 };
  anime({
    targets: obj,
    n: to,
    round: 1,
    duration,
    easing: "easeOutExpo",
    update: () => {
      el.textContent = obj.n.toLocaleString("en-IN");
    },
  });
}

/** Sweep a progress meter (child <span>) to a 0-100 width. */
export function sweepMeter(el: HTMLElement | null, pct: number, delay = 0) {
  if (!el) return;
  anime({
    targets: el,
    width: [0, `${Math.max(2, Math.min(100, pct))}%`],
    delay,
    duration: 1100,
    easing: "easeInOutQuad",
  });
}

/** Staggered entrance for a list of cards. */
export function staggerIn(els: HTMLElement[] | NodeListOf<HTMLElement>, delay = 70) {
  if (!els || (els as NodeListOf<HTMLElement>).length === 0) return;
  anime({
    targets: Array.from(els as never as HTMLElement[]),
    opacity: [0, 1],
    translateY: [18, 0],
    delay: anime.stagger(delay),
    duration: 750,
    easing: "easeOutExpo",
  });
}

/** Gentle perpetual drift for the hero wave layers. */
export function heroWaves(els: (HTMLElement | null)[]) {
  const valid = els.filter(Boolean) as HTMLElement[];
  if (!valid.length) return;
  anime({
    targets: valid,
    translateX: [{ value: 26, duration: 3400 }, { value: -26, duration: 3400 }],
    translateY: [{ value: -6, duration: 2400 }, { value: 6, duration: 2400 }],
    direction: "alternate",
    loop: true,
    easing: "easeInOutSine",
    delay: anime.stagger(420),
  });
}

/** Pulse a dot (live status) — scale + opacity loop. */
export function pulseDot(el: HTMLElement | null) {
  if (!el) return;
  anime({
    targets: el,
    scale: [1, 1.9],
    opacity: [0.9, 0],
    direction: "normal",
    loop: true,
    duration: 1600,
    easing: "easeOutQuad",
  });
}
