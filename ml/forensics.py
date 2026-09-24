"""Image forensics & evidence trust scoring — pure NumPy/PIL, no external APIs.

Three independent signals per evidence photo, plus the composite trust score:

  1. EXIF integrity     — camera make/model, original timestamp, GPS presence,
                          editing-software tags (Photoshop/GIMP/Snapseed/…),
                          and the "stripped metadata" tell (screenshots,
                          re-saved forwards, messenger uploads).
  2. Error-Level Analysis (ELA) — re-encode as JPEG q90 and diff; tampered
                          regions re-compress at a different error level than
                          the rest of the image. We report mean error, error
                          spread and the number of localized hotspots.
  3. Perceptual hash    — 64-bit DCT pHash so the same photo submitted again
                          (different filenames, sizes) can be recognized.

compose_trust_score() fuses the signals with context (geolocation, crowd
corroboration, source reputation, text-image consistency from the CNN) into a
0–1 trust score with a fully inspectable breakdown — the CivicLens
differentiator: not just classification, evidence *provenance*.

Used by ml/serve.py::/forensics and ::/trust.
"""
from __future__ import annotations

import io
import math
import re
from datetime import datetime, timezone
from typing import Any

import numpy as np
from PIL import Image
from scipy.fft import dctn

# ---------------------------------------------------------------------------
# Editing-software fingerprints (case-insensitive substring match on EXIF
# Software / Make / Model / UserComment tags).
# ---------------------------------------------------------------------------

EDITOR_SOFTWARE = [
    "photoshop", "adobe", "lightroom", "gimp", "snapseed", "canva",
    "picsart", "facetune", "pixelmator", "affinity", "illustrator",
    "after effects", "figma", "paint.net", "paint 3d", "mspaint",
    "krita", "darktable", "polarr", "vsco", "meitu", "b612",
]

# Sources where a citizen identity is known/verified vs anonymous.
SOURCE_REPUTATION: dict[str, float] = {
    "whatsapp": 0.75,
    "email": 0.7,
    "manual": 0.7,
    "x": 0.55,
    "tweet": 0.55,
    "news": 0.8,
    "social": 0.5,
    "bulk": 0.4,
}

PHASH_SIZE = 32
PHASH_LOW = 8


# ---------------------------------------------------------------------------
# Loading & hashing
# ---------------------------------------------------------------------------

def load_image(data: bytes) -> Image.Image:
    """Decode image bytes. Raises ValueError on undecodable input."""
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
        return img
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"undecodable image: {e}") from e


def perceptual_hash(img: Image.Image) -> str:
    """64-bit DCT pHash (hex). Robust to resize, recompression, small crops."""
    g = img.convert("L").resize((PHASH_SIZE, PHASH_SIZE), Image.LANCZOS)
    a = np.asarray(g, dtype=np.float64)
    d = dctn(a, type=2, norm="ortho")[:PHASH_LOW, :PHASH_LOW]
    med = float(np.median(d[1:, 1:]))  # ignore DC term for the median
    bits = (d > med).flatten()
    # pack 64 bits -> 16 hex chars
    value = 0
    for b in bits:
        value = (value << 1) | int(b)
    return f"{value:016x}"


def hamming_distance(h1: str, h2: str) -> int:
    """Bit distance between two hex pHashes (0 = identical evidence)."""
    return bin(int(h1, 16) ^ int(h2, 16)).count("1")


def phash_similarity(h1: str, h2: str) -> float:
    """1.0 = same image, 0.0 = maximally different (64-bit space)."""
    return 1.0 - hamming_distance(h1, h2) / 64.0


# ---------------------------------------------------------------------------
# EXIF integrity
# ---------------------------------------------------------------------------

def _exif_dict(img: Image.Image) -> dict[int, Any]:
    try:
        exif = img.getexif()
        raw = {k: v for k, v in exif.items()}
        # IFD sub-dirs: Exif (34665) holds DateTimeOriginal etc.
        try:
            sub = exif.get_ifd(34665)
            raw.update({k: v for k, v in sub.items()})
            gps = exif.get_ifd(34853)
            if gps:
                raw[34853] = dict(gps)
        except Exception:  # noqa: BLE001 — malformed IFDs must not crash us
            pass
        return raw
    except Exception:  # noqa: BLE001
        return {}


def assess_exif(img: Image.Image, submitted_at: str | None = None) -> dict[str, Any]:
    """EXIF-based authenticity signals with human-readable flags."""
    flags: list[str] = []
    raw = _exif_dict(img)
    make = str(raw.get(271, "") or "").strip()
    model = str(raw.get(272, "") or "").strip()
    software = str(raw.get(305, "") or "").strip()
    date_tag = str(raw.get(36867) or raw.get(306) or "").strip()
    has_gps = bool(raw.get(34853))

    edited_by = None
    blob = f"{software} {make} {model}".lower()
    for editor in EDITOR_SOFTWARE:
        if editor in blob:
            edited_by = editor
            break
    if edited_by:
        flags.append(f"edited_software:{edited_by}")

    has_camera = bool(make or model)
    if not raw:
        flags.append("metadata_stripped")
    elif not has_camera:
        flags.append("no_camera_identity")

    age_days: float | None = None
    future_timestamp = False
    if date_tag:
        for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
            try:
                taken = datetime.strptime(date_tag[:19], fmt).replace(tzinfo=timezone.utc)
                now = datetime.now(timezone.utc)
                age_days = (now - taken).total_seconds() / 86400.0
                if age_days < -1:
                    future_timestamp = True
                    flags.append("future_timestamp")
                elif submitted_at:
                    sub = datetime.fromisoformat(submitted_at.replace("Z", "+00:00"))
                    skew = (sub - taken).total_seconds() / 86400.0
                    if skew > 60:
                        flags.append("stale_photo:>60d_before_submission")
                    elif skew < -1:
                        flags.append("photo_taken_after_submission")
                break
            except ValueError:
                continue
    elif raw:
        flags.append("no_capture_timestamp")

    if not has_gps:
        flags.append("no_gps_exif")

    # Positive integrity signal: full camera + timestamp + GPS is the
    # profile of an on-device original photograph.
    integrity = 0.0
    if has_camera:
        integrity += 0.3
    if date_tag and age_days is not None and not future_timestamp:
        integrity += 0.3
    if has_gps:
        integrity += 0.2
    if not edited_by:
        integrity += 0.2

    return {
        "make": make or None,
        "model": model or None,
        "software": software or None,
        "captured_at": date_tag or None,
        "captured_age_days": None if age_days is None else round(age_days, 1),
        "has_gps": has_gps,
        "edited_by": edited_by,
        "integrity": round(min(1.0, integrity), 3),
        "flags": flags,
    }


# ---------------------------------------------------------------------------
# Error-Level Analysis
# ---------------------------------------------------------------------------

def error_level_analysis(img: Image.Image) -> dict[str, Any]:
    """Re-encode as JPEG q90 and diff — tampered regions light up.

    Returns mean error, error spread (std) and hotspot concentration.
    A uniformly-compressed original yields low, evenly spread error;
    spliced-in patches produce localized high-error clusters.
    """
    rgb = img.convert("RGB")
    buf = io.BytesIO()
    rgb.save(buf, format="JPEG", quality=90)
    buf.seek(0)
    resaved = Image.open(buf)
    resaved.load()

    a = np.asarray(rgb, dtype=np.float64)
    b = np.asarray(resaved, dtype=np.float64)
    diff = np.abs(a - b)

    mean_err = float(diff.mean())
    std_err = float(diff.std())
    thr = mean_err + 3.0 * std_err
    hotspots = int((diff.max(axis=2) > thr).sum())

    # Concentration: what fraction of the error energy sits in hotspots.
    energy = float(diff.sum())
    hotspot_energy = float(diff[diff.max(axis=2) > thr].sum()) if hotspots else 0.0
    concentration = hotspot_energy / energy if energy > 0 else 0.0

    # Heuristic tamper suspicion: high spread + concentrated hotspots.
    suspicion = min(1.0, (std_err / 12.0) * 0.6 + concentration * 0.6)
    flags: list[str] = []
    if suspicion > 0.55:
        flags.append("ela_hotspots")
    if mean_err < 0.35 and std_err < 0.5:
        # Extremely uniform = possibly AI-generated / heavily processed flat image
        flags.append("ela_suspiciously_uniform")

    return {
        "mean_error": round(mean_err, 4),
        "error_std": round(std_err, 4),
        "hotspot_pixels": hotspots,
        "hotspot_concentration": round(concentration, 4),
        "tamper_suspicion": round(suspicion, 3),
        "flags": flags,
    }


# ---------------------------------------------------------------------------
# Full forensic assessment
# ---------------------------------------------------------------------------

def assess_image(data: bytes, submitted_at: str | None = None) -> dict[str, Any]:
    """All forensic signals for one evidence photo."""
    img = load_image(data)
    w, h = img.size
    exif = assess_exif(img, submitted_at)
    ela = error_level_analysis(img)
    ph = perceptual_hash(img)

    # Tiny images (thumbnails) and screenshots are weak evidence.
    flags = list(exif["flags"])
    if w < 200 or h < 200:
        flags.append("low_resolution")
        exif["integrity"] = round(exif["integrity"] * 0.7, 3)
    if (w, h) in ((1080, 1920), (1080, 2400), (1170, 2532), (1284, 2778)):
        flags.append("screen_dimensions")

    return {
        "width": w,
        "height": h,
        "exif": exif,
        "ela": ela,
        "phash": ph,
        "flags": sorted(set(flags)),
    }


# ---------------------------------------------------------------------------
# Composite trust score
# ---------------------------------------------------------------------------

def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def compose_trust_score(
    *,
    forensics: dict[str, Any] | None,
    cnn_category: str | None,
    cnn_severity_confidence: float | None,
    text_category: str | None,
    lat: float | None,
    lng: float | None,
    source: str = "manual",
    report_count: int = 1,
    known_phashes: list[str] | None = None,
    has_text: bool = True,
) -> dict[str, Any]:
    """Fuse forensic + contextual signals into a 0–1 trust score.

    Weights (sum to 1.0, documented so the UI can render the breakdown):
      image forensics 0.35 · image-text consistency 0.20 · geolocation 0.15
      crowd corroboration 0.15 · source reputation 0.10 · duplicate evidence 0.05

    Every component degrades gracefully — no photo, no CNN, no location:
    the missing signal's weight redistributes and the flag list says so.
    """
    flags: list[str] = []
    breakdown: dict[str, float] = {}

    # 1) Image forensics ------------------------------------------------------
    if forensics is not None:
        f_exif = forensics["exif"]["integrity"]
        f_ela = 1.0 - forensics["ela"]["tamper_suspicion"]
        forensic_signal = 0.55 * f_exif + 0.45 * f_ela
        flags.extend(forensics["flags"])
        breakdown["image_forensics"] = round(forensic_signal, 3)
        w_forensics = 0.35
    else:
        forensic_signal = 0.5  # neutral prior; weight redistributes
        breakdown["image_forensics"] = 0.5
        w_forensics = 0.0
        flags.append("no_evidence_photo")

    # 2) Image-text consistency (CNN category vs text classifier category) ----
    if cnn_category and text_category:
        consistent = cnn_category.lower() == text_category.lower()
        consistency = 1.0 if consistent else 0.15
        conf = cnn_severity_confidence if cnn_severity_confidence is not None else 0.6
        consistency = 0.3 + 0.7 * consistency * _clamp01(conf)
        if not consistent:
            flags.append(f"image_text_mismatch:{cnn_category}_vs_{text_category}")
        breakdown["image_text_consistency"] = round(consistency, 3)
        w_consistency = 0.20
    else:
        consistency = 0.5
        breakdown["image_text_consistency"] = 0.5
        w_consistency = 0.0
        if not cnn_category:
            flags.append("cnn_unavailable")

    # 3) Geolocation ----------------------------------------------------------
    geo = 0.4  # neutral when absent
    if lat is not None and lng is not None:
        # Inside plausible bounds (roughly India-wide box; demo honesty note:
        # a real deployment would use the city bounding box).
        if 6.0 <= lat <= 37.5 and 68.0 <= lng <= 97.5:
            geo = 0.9
        else:
            geo = 0.3
            flags.append("geo_out_of_region")
    else:
        flags.append("no_geolocation")
    breakdown["geolocation"] = round(geo, 3)

    # 4) Crowd corroboration --------------------------------------------------
    crowd = _clamp01(math.log1p(max(0, report_count - 1)) / math.log(12))
    breakdown["crowd_corroboration"] = round(crowd, 3)

    # 5) Source reputation ----------------------------------------------------
    rep = SOURCE_REPUTATION.get(source, 0.5)
    breakdown["source_reputation"] = round(rep, 3)

    # 6) Duplicate evidence (pHash vs previously seen photos) -----------------
    dup_signal = 1.0
    if forensics and known_phashes:
        best = max((phash_similarity(forensics["phash"], k) for k in known_phashes),
                   default=0.0)
        if best >= 0.94:
            dup_signal = 0.05
            flags.append("photo_reused:phash_match")
        elif best >= 0.86:
            dup_signal = 0.5
            flags.append("photo_similar:possible_reuse")
    breakdown["duplicate_check"] = round(dup_signal, 3)
    if not has_text:
        flags.append("no_text")

    # Weighted fusion with redistribution of unavailable-signal weight.
    weights = {
        "image_forensics": w_forensics,
        "image_text_consistency": w_consistency,
        "geolocation": 0.15,
        "crowd_corroboration": 0.15,
        "source_reputation": 0.10,
        "duplicate_check": 0.05,
    }
    active = {k: v for k, v in weights.items() if v > 0}
    total_w = sum(active.values())
    score = sum(breakdown[k] * (w / total_w) for k, w in active.items())

    # Hard penalties for hard flags.
    if any(f.startswith("photo_reused") for f in flags):
        score = min(score, 0.25)
    if any(f.startswith("edited_software") for f in flags):
        score = min(score, 0.55)
    if "ela_hotspots" in flags:
        score = min(score, 0.6)

    return {
        "score": round(_clamp01(score), 3),
        "band": trust_band(score),
        "breakdown": breakdown,
        "flags": sorted(set(flags)),
    }


def trust_band(score: float) -> str:
    if score >= 0.75:
        return "high"
    if score >= 0.5:
        return "medium"
    if score >= 0.3:
        return "low"
    return "untrusted"
