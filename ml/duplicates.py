"""Duplicate-complaint detector — TF-IDF cosine + geo-distance, from scratch.

No scikit-learn needed: a hand-rolled TF-IDF (the corpus is the open complaint
queue itself, re-embedded on demand) + great-circle distance. Detects:

  • likely duplicate reports of the same incident (same text, same area)
  • coordinated flooding: many near-identical complaints across different
    locations in a short window (spam / campaign signal)

Complements the Jaccard merge already in src/lib/persist.ts (that one runs
inside the web process; this one runs inside the ML service where the full
corpus + smarter weighting live). Surfaced via ml/serve.py::/duplicates.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any

TOKEN_RE = re.compile(r"[a-z0-9]+")

STOPWORDS = {
    "the", "and", "for", "with", "this", "that", "from", "have", "has",
    "was", "were", "are", "not", "but", "our", "you", "your", "please",
    "there", "here", "near", "very", "its", "been", "still", "dear",
    "regards", "hello", "team", "sir", "madam", "kindly", "city", "area",
    "water", "road",  # too generic across the civic corpus
}


def tokenize(text: str) -> list[str]:
    words = TOKEN_RE.findall(text.lower())
    return [w for w in words if len(w) > 2 and w not in STOPWORDS]


def _tfidf_matrix(docs: list[list[str]]) -> list[dict[str, float]]:
    """From-scratch TF-IDF rows (L2-normalized) for cosine similarity."""
    n = len(docs)
    df: Counter[str] = Counter()
    for doc in docs:
        df.update(set(doc))
    rows: list[dict[str, float]] = []
    for doc in docs:
        tf = Counter(doc)
        row = {w: (c / max(1, len(doc))) * math.log((n + 1) / (df[w] + 1)) for w, c in tf.items()}
        norm = math.sqrt(sum(v * v for v in row.values())) or 1.0
        rows.append({w: v / norm for w, v in row.items()})
    return rows


def _cosine(a: dict[str, float], b: dict[str, float]) -> float:
    if len(a) > len(b):
        a, b = b, a
    return sum(v * b.get(w, 0.0) for w, v in a.items())


def haversine_km(lat1, lng1, lat2, lng2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _geo_factor(d_km: float) -> float:
    """1.0 at 0km, 0.5 at ~500m, decays to ~0 beyond 2km."""
    return math.exp(-d_km / 0.7)


def find_duplicates(
    complaints: list[dict[str, Any]],
    similarity_threshold: float = 0.55,
    max_pairs: int = 50,
) -> dict[str, Any]:
    """Score every pair of complaints; report likely-duplicate pairs.

    Each complaint dict: {id, rawText, category, lat, lng, createdAt}.
    Pair score = 0.7 * cosine + 0.3 * geo factor, within the same category.
    """
    docs = [tokenize(c.get("rawText", "")) for c in complaints]
    rows = _tfidf_matrix(docs)

    pairs: list[dict[str, Any]] = []
    for i in range(len(complaints)):
        for j in range(i + 1, len(complaints)):
            a, b = complaints[i], complaints[j]
            if a.get("category") != b.get("category"):
                continue
            cos = _cosine(rows[i], rows[j])
            if cos < 0.05:
                continue
            if a.get("lat") is None or b.get("lat") is None:
                geo_f = 0.5  # unknown distance -> neutral
            else:
                d = haversine_km(a["lat"], a.get("lng") or 0.0, b["lat"], b.get("lng") or 0.0)
                geo_f = _geo_factor(d)
            score = 0.7 * cos + 0.3 * geo_f
            if score >= similarity_threshold:
                pairs.append({
                    "a": a.get("id"),
                    "b": b.get("id"),
                    "cosine": round(cos, 4),
                    "score": round(score, 4),
                    "same_area": geo_f >= 0.5,
                })
    pairs.sort(key=lambda p: -p["score"])
    return {
        "n_complaints": len(complaints),
        "threshold": similarity_threshold,
        "duplicate_pairs": pairs[:max_pairs],
        "n_duplicates": len(pairs),
    }


def detect_flooding(
    complaints: list[dict[str, Any]],
    window_minutes: int = 120,
    min_similar: int = 5,
) -> dict[str, Any]:
    """Coordinated-flooding detector.

    Within a sliding time window, complaints that are textually near-identical
    to >= min_similar others but scattered across locations (> 1.5km apart or
    unknown) are a spam/campaign signal.
    """
    docs = [tokenize(c.get("rawText", "")) for c in complaints]
    rows = _tfidf_matrix(docs)
    times = [c.get("createdAt") for c in complaints]

    flooded_ids: set[int] = set()
    for i in range(len(complaints)):
        similar_recent = 0
        locations = []
        for j in range(len(complaints)):
            if i == j:
                continue
            cos = _cosine(rows[i], rows[j])
            if cos < 0.7:
                continue
            ti, tj = times[i], times[j]
            if ti and tj:
                try:
                    dt = abs(_to_ts(ti) - _to_ts(tj))
                    if dt > window_minutes * 60:
                        continue
                except Exception:  # noqa: BLE001 — malformed timestamps skip
                    continue
            similar_recent += 1
            if complaints[j].get("lat") is not None:
                locations.append((complaints[j]["lat"], complaints[j].get("lng") or 0.0))
        if similar_recent >= min_similar:
            # Scattered?
            scattered = len(locations) >= 2 and _spread_km(locations) > 1.5
            if scattered or not locations:
                flooded_ids.add(complaints[i].get("id"))

    return {
        "window_minutes": window_minutes,
        "min_similar": min_similar,
        "flooded_ids": sorted(flooded_ids),
        "n_flooded": len(flooded_ids),
        "suspicious": len(flooded_ids) >= min_similar,
    }


def _spread_km(points: list[tuple[float, float]]) -> float:
    """Max pairwise distance of a small point set."""
    worst = 0.0
    for i in range(len(points)):
        for j in range(i + 1, len(points)):
            worst = max(worst, haversine_km(*points[i], *points[j]))
    return worst


def _to_ts(t: Any) -> float:
    if isinstance(t, (int, float)):
        return float(t) / 1000.0 if float(t) > 1e11 else float(t)
    from datetime import datetime
    s = str(t).replace("Z", "+00:00")
    return datetime.fromisoformat(s).timestamp()
