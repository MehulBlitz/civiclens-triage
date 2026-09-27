"""Procedural photo generator for the CivicLens CNN (v2).

Each of the 8 categories gets distinctive synthetic visual signatures on a
noisy grayscale street-photo canvas (48x48). v2 adds the variation the first
corpus lacked — multiple signature *variants* per category, background/texture
diversity, per-image brightness/contrast jitter and defocus blur — so the CNN
must learn invariant structure instead of memorizing one drawing per class.
Severity stays a smooth function of how "bad" the artifact was drawn.

v3 (round-4 confusion surgery): every signature gets a *visibility floor* so
low-severity samples never degenerate to a plain canvas (which the classifier
had been dumping into "Other"), and cues are made mutually exclusive —
graffiti strokes are bright *with a dark paint outline* (inverse of a
pothole's bright rim), litter is mid-tone clustered fragments with no big
dark shadow (which used to mimic cavities/bands), and "Other" blobs are
capped mid-bright with a drop shadow instead of unbounded brightness.

Mirrors what a real transfer-learning photo model would learn from images:
craters (dark discs), waterlogging (horizontal specular bands), litter
(scattered clusters), bright lamp points, dark unlit frames, graffiti
strokes, clean edges, generic blobs.
"""
from __future__ import annotations

import numpy as np

IMG = 48
SEED = 42
CATEGORIES = [
    "Pothole", "Drainage", "Waste", "Water",
    "Streetlight", "Sewage", "Graffiti", "Other",
]


def _canvas(rng: np.random.Generator) -> np.ndarray:
    """Background with v2 diversity: texture style + brightness/contrast jitter."""
    style = rng.integers(0, 3)
    if style == 0:
        base = rng.uniform(0.35, 0.75)
        img = np.full((IMG, IMG), base)
        img += rng.normal(0, 0.05, (IMG, IMG))  # sensor noise
    elif style == 1:
        # Grainy asphalt: smoother, slightly darker
        base = rng.uniform(0.25, 0.6)
        img = rng.normal(base, 0.03, (IMG, IMG))
    else:
        # Paved tiles: faint grid
        base = rng.uniform(0.4, 0.7)
        img = np.full((IMG, IMG), base)
        img[::8, :] += 0.08
        img[:, ::8] += 0.08
        img += rng.normal(0, 0.04, (IMG, IMG))
    # Vignette: photos are darker at edges.
    yy, xx = np.mgrid[0:IMG, 0:IMG]
    r = np.sqrt((yy - IMG / 2) ** 2 + (xx - IMG / 2) ** 2) / (IMG / 2)
    img *= 1.0 - 0.25 * r ** 2
    # v2: per-image brightness/contrast jitter (photography conditions).
    img = img * rng.uniform(0.9, 1.1) + rng.uniform(-0.05, 0.05)
    return np.clip(img, 0, 1)


def _blur(img: np.ndarray, rng: np.random.Generator, strength: float = 1.0) -> np.ndarray:
    """3x3 box blur (defocus) applied with probability-driven strength."""
    if rng.random() > 0.22 * strength:
        return img
    pad = np.pad(img, 1, mode="edge")
    out = np.zeros_like(img)
    for dy in range(3):
        for dx in range(3):
            out += pad[dy:dy + IMG, dx:dx + IMG]
    return out / 9.0


def _draw_pothole(rng):
    img = _canvas(rng)
    sev = rng.uniform(0.1, 1.0)
    cy, cx = rng.integers(10, 38, 2)
    r = 4 + int(10 * sev)  # bigger crater = more severe
    yy, xx = np.mgrid[0:IMG, 0:IMG]
    # v2: elliptical craters at random aspect + rotation-ish skew
    ry = r * rng.uniform(0.7, 1.3)
    rx = r * rng.uniform(0.7, 1.3)
    disc = ((yy - cy) / ry) ** 2 + ((xx - cx) / rx) ** 2 <= 1
    img[disc] *= 1.0 - (0.45 + 0.3 * sev)  # v3: dark cavity with a floor
    rim = disc ^ (((yy - cy) / ry) ** 2 + ((xx - cx) / rx) ** 2 <= 1.2 ** 2)
    img[rim] += 0.15 + 0.15 * sev  # v5: strong bright rim (pothole's signature)
    # v2: fill debris specks inside deep craters
    if sev > 0.6:
        for _ in range(int(4 * sev)):
            py = int(rng.integers(max(0, cy - 3), min(IMG, cy + 4)))
            px = int(rng.integers(max(0, cx - 3), min(IMG, cx + 4)))
            img[py, px] += 0.25
    return _blur(img, rng), sev


def _draw_drainage(rng):
    img = _canvas(rng)
    sev = rng.uniform(0.1, 1.0)
    # Horizontal water bands across lower half (v2: band top varies).
    band_h = 5 + int(10 * sev)
    y0 = int(IMG * rng.uniform(0.45, 0.62))
    img[y0:y0 + band_h, :] *= 1.0 - (0.3 + 0.25 * sev)  # v3: visibility floor
    img[y0, :] += 0.3  # v3: bright water line at the band's top edge
    for yy in range(y0, min(IMG, y0 + band_h)):
        if yy % 3 == 0:
            img[yy, :] += 0.3 * rng.uniform(0.7, 1.2)  # specular streaks
    # v2: subtle ripple variation (kept weak so the band cue dominates)
    if rng.random() < 0.5:
        phase = rng.uniform(0, np.pi)
        for xx in range(IMG):
            img[min(IMG - 1, y0 + 2):, xx] *= 1.0 + 0.03 * np.sin(0.4 * xx + phase)
    return _blur(img, rng), sev


def _draw_waste(rng):
    img = _canvas(rng)
    sev = rng.uniform(0.1, 1.0)
    # v5: litter = MANY small DARK fragments (bags, bins, debris) scattered
    # around a pile center. Distinct from a pothole (one big cavity + rim) by
    # speckle count, and from Other/Waste-mid-tone by darkness.
    cy, cx = rng.integers(12, 36, 2)
    n = int(15 + 45 * sev)
    for _ in range(n):
        py = int(np.clip(rng.normal(cy, 7), 2, IMG - 4))
        px = int(np.clip(rng.normal(cx, 8), 2, IMG - 4))
        s = int(rng.integers(1, 4))
        img[py:py + s, px:px + s] = rng.uniform(0.08, 0.22)
    for _ in range(int(3 + 8 * sev)):  # strays away from the pile
        py = int(rng.integers(4, IMG - 4))
        px = int(rng.integers(4, IMG - 4))
        img[py:py + 2, px:px + 2] = rng.uniform(0.1, 0.25)
    return _blur(img, rng), sev


def _draw_water(rng):
    img = _canvas(rng)
    sev = rng.uniform(0.1, 1.0)
    # Burst pipe: bright vertical jet + spreading pool (v2: jet angle drifts).
    cx = int(rng.integers(14, 34))
    drift = int(rng.integers(-3, 4))
    for yy in range(IMG):
        jx = cx + int(drift * yy / IMG)
        img[yy, max(0, jx - 1):min(IMG, jx + 2)] += 0.5 * (0.4 + 0.6 * sev)
    pool_y = int(IMG * rng.uniform(0.6, 0.78))
    img[pool_y:, :] = np.clip(img[pool_y:, :] + 0.3 * sev, 0, 1)
    return _blur(img, rng), sev


def _draw_streetlight(rng):
    img = _canvas(rng)
    sev = rng.uniform(0.1, 1.0)
    # Dark frame; small bright lamp point when "working".
    img *= 0.35
    if rng.random() > sev * 0.7:
        cy, cx = rng.integers(6, 18), rng.integers(18, 30)
        img[cy - 1:cy + 2, cx - 1:cx + 2] = 0.95  # lamp glow
        img[cy - 3:cy + 4, cx - 3:cx + 4] += 0.2
    # Unlit pole (v2: pole position/width varies)
    px = int(rng.integers(8, 40))
    pw = int(rng.integers(1, 3))
    img[:, px:px + pw] *= 0.6
    return _blur(img, rng), sev


def _draw_sewage(rng):
    img = _canvas(rng)
    sev = rng.uniform(0.1, 1.0)
    # Dark overflow spill around a manhole circle — the spill RING outside the
    # disc is the distinguishing signal vs a pothole's single dark cavity.
    cy, cx = rng.integers(14, 34, 2)
    rad = 6
    yy, xx = np.mgrid[0:IMG, 0:IMG]
    disc = (yy - cy) ** 2 + (xx - cx) ** 2 <= rad ** 2
    img[disc] *= 1.0 - 0.7
    spill = ((yy - cy) ** 2 + (xx - cx) ** 2 <= rad ** 2 * (1 + sev)) & ~disc
    img[spill] *= 1.0 - 0.5 * sev
    # v2: flow streaks downhill from the manhole
    for _ in range(int(2 + 4 * sev)):
        fy = int(rng.integers(cy, IMG - 1)) if cy < IMG - 2 else cy
        fx = int(max(0, min(IMG - 3, cx + rng.integers(-4, 5))))
        img[fy:min(IMG, fy + 3), fx:fx + 2] *= 0.75
    return _blur(img, rng), sev


def _draw_graffiti(rng):
    img = _canvas(rng)
    sev = rng.uniform(0.1, 1.0)
    strokes = int(3 + 8 * sev)  # v5: denser coverage — walls, not dots
    for _ in range(strokes):
        y0 = int(rng.integers(8, IMG - 14))
        x0 = int(rng.integers(3, IMG - 20))
        ln = int(rng.integers(8, 20))  # v5: long strokes = line structures
        # v2: diagonal/thick variants. v3: every stroke gets a DARK paint
        # outline around a BRIGHT core — mutually exclusive with a pothole's
        # bright rim on a dark cavity, and distinct from Other blobs.
        if rng.random() < 0.4:
            for k in range(ln):
                yy = min(IMG - 2, y0 + k // 2)
                xx = min(IMG - 2, x0 + k)
                img[yy - 1:yy + 3, xx:xx + 2] = 0.18
                img[yy:yy + 2, xx:xx + 2] = rng.uniform(0.85, 1.0)
        else:
            img[y0 - 1:y0 + 3, x0 - 1:x0 + ln + 1] = 0.18
            img[y0:y0 + 2, x0:x0 + ln] = rng.uniform(0.85, 1.0)
    return _blur(img, rng), sev


def _draw_other(rng):
    img = _canvas(rng)
    sev = rng.uniform(0.1, 1.0)
    # Generic object blob, no civic signature (v2: round or rectangular,
    # mid-gray +0.18 so it reads as "object on a street", not dark cavity).
    cy, cx = rng.integers(10, 34, 2)
    s = int(4 + 6 * sev)
    if rng.random() < 0.5:
        img[cy:cy + s, cx:cx + s] += rng.uniform(0.12, 0.2)  # v3: capped tone
        img[cy, cx:cx + s] += 0.08  # top highlight edge
        img[cy + s:cy + s + 2, cx + 1:cx + s + 2] *= 0.72  # v3: drop shadow
    else:
        yy, xx = np.mgrid[0:IMG, 0:IMG]
        blob = ((yy - cy) ** 2 + (xx - cx) ** 2) <= s ** 2
        img[blob] += rng.uniform(0.12, 0.2)
        img[blob & ((yy - cy) ** 2 + (xx - cx) ** 2 <= max(1, s - 2) ** 2)] += 0.08
        shadow = ((yy - cy - 2) ** 2 + ((xx - cx - 1) * 1.2) ** 2) <= (s + 1) ** 2
        img[shadow & ~blob] *= 0.75  # v3: soft drop shadow offset from blob
    return _blur(img, rng), sev


_GENERATORS = [
    _draw_pothole, _draw_drainage, _draw_waste, _draw_water,
    _draw_streetlight, _draw_sewage, _draw_graffiti, _draw_other,
]


def generate_dataset(n_per_class: int = 96, seed: int = SEED):
    """Returns X (N,1,48,48), y (N,), severity (N,)."""
    rng = np.random.default_rng(seed)
    X, y, sev = [], [], []
    for ci, gen in enumerate(_GENERATORS):
        for _ in range(n_per_class):
            img, s = gen(rng)
            X.append(img[None, :, :])  # (1,H,W)
            y.append(ci)
            sev.append(s)
    X = np.asarray(X, dtype=np.float64)
    y = np.asarray(y, dtype=np.int64)
    sev = np.asarray(sev, dtype=np.float64)
    return X, y, sev


def augment_flip(x: np.ndarray) -> np.ndarray:
    """Horizontal flip — the one augmentation that preserves all signatures."""
    return x[:, :, :, ::-1]


def augment_shift(x: np.ndarray, rng: np.random.Generator, max_px: int = 2) -> np.ndarray:
    """Random ±max_px translation (zero-padded) — position invariance."""
    n, c, h, w = x.shape
    out = np.zeros_like(x)
    for i in range(n):
        dy = int(rng.integers(-max_px, max_px + 1))
        dx = int(rng.integers(-max_px, max_px + 1))
        ys = slice(max(0, -dy), min(h, h - dy))
        xs = slice(max(0, -dx), min(w, w - dx))
        yd = slice(max(0, dy), min(h, h + dy))
        xd = slice(max(0, dx), min(w, w + dx))
        for ch in range(c):
            out[i, ch, yd, xd] = x[i, ch, ys, xs]
    return out
