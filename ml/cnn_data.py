"""Procedural photo generator for the CivicLens CNN.

Each of the 8 categories gets a distinctive synthetic visual signature on a
noisy grayscale street-photo canvas (48x48). The CNN learns category-typical
texture/layout structure — proving the conv pipeline end-to-end without an
external dataset. Severity is a smooth function of how "bad" the artifact was
drawn, so the severity head has real signal to regress.

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
    base = rng.uniform(0.35, 0.75)
    img = np.full((IMG, IMG), base)
    img += rng.normal(0, 0.05, (IMG, IMG))  # sensor noise
    # Vignette: photos are darker at edges.
    yy, xx = np.mgrid[0:IMG, 0:IMG]
    r = np.sqrt((yy - IMG / 2) ** 2 + (xx - IMG / 2) ** 2) / (IMG / 2)
    img *= 1.0 - 0.25 * r ** 2
    return np.clip(img, 0, 1)


def _draw_pothole(rng):
    img = _canvas(rng)
    sev = rng.uniform(0.1, 1.0)
    cy, cx = rng.integers(12, 36, 2)
    r = 5 + int(9 * sev)  # bigger crater = more severe
    yy, xx = np.mgrid[0:IMG, 0:IMG]
    disc = (yy - cy) ** 2 + (xx - cx) ** 2 <= r ** 2
    img[disc] *= 1.0 - 0.75 * sev  # dark cavity
    rim = disc ^ ((yy - cy) ** 2 + (xx - cx) ** 2 <= (r + 2) ** 2)
    img[rim] += 0.2 * sev  # broken asphalt rim
    return img, sev


def _draw_drainage(rng):
    img = _canvas(rng)
    sev = rng.uniform(0.1, 1.0)
    # Horizontal water bands across lower half.
    band_h = 4 + int(10 * sev)
    y0 = int(IMG * 0.55)
    img[y0:y0 + band_h, :] *= 1.0 - 0.5 * sev
    for yy in range(y0, y0 + band_h):
        if yy % 3 == 0:
            img[yy, :] += 0.25  # specular streaks
    return img, sev


def _draw_waste(rng):
    img = _canvas(rng)
    sev = rng.uniform(0.1, 1.0)
    n = int(10 + 40 * sev)
    for _ in range(n):
        cy = int(rng.integers(4, IMG - 4))
        cx = int(rng.integers(4, IMG - 4))
        s = int(rng.integers(1, 3))
        img[cy:cy + s, cx:cx + s] = rng.uniform(0.05, 0.25)  # dark litter bits
    # Heap shadow
    cy, cx = rng.integers(14, 34, 2)
    img[cy:cy + 10, cx:cx + 12] *= 1.0 - 0.35 * sev
    return img, sev


def _draw_water(rng):
    img = _canvas(rng)
    sev = rng.uniform(0.1, 1.0)
    # Burst pipe: bright vertical jet + spreading pool.
    cx = int(rng.integers(16, 32))
    img[:, cx - 1:cx + 2] += 0.5 * (0.4 + 0.6 * sev)
    pool_y = int(IMG * 0.7)
    img[pool_y:, :] = np.clip(img[pool_y:, :] + 0.3 * sev, 0, 1)
    return img, sev


def _draw_streetlight(rng):
    img = _canvas(rng)
    sev = rng.uniform(0.1, 1.0)
    # Dark frame; small bright lamp point when "working".
    img *= 0.35
    if rng.random() > sev * 0.7:
        cy, cx = rng.integers(8, 16), rng.integers(20, 28)
        img[cy - 1:cy + 2, cx - 1:cx + 2] = 0.95  # lamp glow
        img[cy - 3:cy + 4, cx - 3:cx + 4] += 0.2
    # Unlit pole
    px = int(rng.integers(10, 38))
    img[:, px] *= 0.6
    return img, sev


def _draw_sewage(rng):
    img = _canvas(rng)
    sev = rng.uniform(0.1, 1.0)
    # Dark overflow spill around a manhole circle.
    cy, cx = rng.integers(16, 32, 2)
    yy, xx = np.mgrid[0:IMG, 0:IMG]
    disc = (yy - cy) ** 2 + (xx - cx) ** 2 <= 36
    img[disc] *= 1.0 - 0.7
    spill = ((yy - cy) ** 2 + (xx - cx) ** 2 <= 36 * (1 + sev)) & ~disc
    img[spill] *= 1.0 - 0.5 * sev
    return img, sev


def _draw_graffiti(rng):
    img = _canvas(rng)
    sev = rng.uniform(0.1, 1.0)
    # Bright spray strokes on a wall band.
    strokes = int(2 + 8 * sev)
    for _ in range(strokes):
        y0 = int(rng.integers(6, IMG - 10))
        x0 = int(rng.integers(2, IMG - 12))
        ln = int(rng.integers(4, 12))
        img[y0:y0 + 2, x0:x0 + ln] = rng.uniform(0.7, 1.0)
    return img, sev


def _draw_other(rng):
    img = _canvas(rng)
    sev = rng.uniform(0.1, 1.0)
    # Generic object blob, no civic signature.
    cy, cx = rng.integers(12, 36, 2)
    s = int(3 + 6 * sev)
    img[cy:cy + s, cx:cx + s] += 0.15
    return img, sev


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
