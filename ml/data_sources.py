"""Real civic 311 dataset loaders — the "many datasets" pillar.

Fetches real, labeled municipal service-request data from open city data
portals (Socrata/CKAN APIs) and maps each record into CivicLens' 8-way
category taxonomy. Every loader:

  • uses a short, column-projected Socrata query (server-side filtering),
  • degrades gracefully (returns [] on network/quota errors — training then
    falls back to the synthetic corpus, so `bun run ml:train` never breaks),
  • caches raw pulls under ml/data/cache/*.json so repeated training runs
    don't re-hit the portals,
  • records provenance (source, resource id) for every row.

Priority labels are derived deterministically from complaint type/descriptor
keyword bands (same philosophy as the synthetic corpus: labels come from text
signals, so the classifier learns genuinely predictive structure).

Verified working resources (checked 2026-09):
  NYC      311 Service Requests from 2010 to Present   erm2-nwe9  (22.6M+)
  Chicago  311 Service Requests                        v6vf-nfxy  (14.7M+)
  Boston   311 Service Requests (CKAN datastore)       254adca6-...

Usage:
  python3 ml/data_sources.py                 # probe all sources, print counts
  python3 ml/data_sources.py --fetch         # download + cache + map to CSV
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
CACHE_DIR = DATA_DIR / "cache"

UA = "CivicLens-Training/1.0 (open-data triage research)"
TIMEOUT = 30

# ---------------------------------------------------------------------------
# Taxonomy mapping — city-specific complaint types -> CivicLens 8-way labels
# ---------------------------------------------------------------------------

CATEGORIES = [
    "Pothole", "Drainage", "Waste", "Water",
    "Streetlight", "Sewage", "Graffiti", "Other",
]

# Keyword bands over the combined "complaint_type + descriptor" text.
# Ordered: first match wins (specific before generic).
KEYWORD_MAP: list[tuple[str, list[str]]] = [
    ("Pothole", ["pothole", "street condition", "road defect", "road surface",
                 "pavement", "crater", "street defect"]),
    ("Drainage", ["drain", "waterlogging", "water logged", "flood", "catch basin",
                  "storm water", "stormwater", "gutter", "clogged"]),
    ("Waste", ["litter", "garbage", "trash", "waste", "dumpster", "debris",
               "missed collection", "illegal dumping", "recycling", "sanitation"]),
    ("Water", ["water leak", "water supply", "water quality", "hydrant",
               "water main", "no water", "low pressure", "water system"]),
    ("Streetlight", ["street light", "streetlight", "lamp", "lighting",
                     "light out", "dark street", "signal light"]),
    ("Sewage", ["sewer", "sewage", "manhole", "overflow", "effluent",
                "blocked drain line", "backed up"]),
    ("Graffiti", ["graffiti", "vandalism", "poster", "defaced", "sticker"]),
]

# Priority bands from urgency keywords in type/descriptor text.
URGENT_WORDS = [
    "accident", "emergency", "immediately", "hazard", "danger", "collapse",
    "live wire", "electrocut", "hit and run", "injur", "gas leak",
]
HIGH_WORDS = [
    "blocked", "overflow", "burst", "flood", "waterlogged", "leak", "broken",
    "failed", "outage", "dark", "contaminated", "dead",
]
LOW_WORDS = ["cosmetic", "minor", "request", "inquiry", "suggestion", "abandoned"]


def map_category(complaint_type: str, descriptor: str) -> str:
    blob = f"{complaint_type} {descriptor}".lower()
    for cat, words in KEYWORD_MAP:
        if any(w in blob for w in words):
            return cat
    return "Other"


def label_priority(complaint_type: str, descriptor: str, category: str) -> str:
    blob = f"{complaint_type} {descriptor}".lower()
    if any(w in blob for w in URGENT_WORDS):
        return "urgent"
    if category == "Sewage":  # sewage is a baseline health hazard
        return "high"
    if any(w in blob for w in HIGH_WORDS):
        return "high"
    if any(w in blob for w in LOW_WORDS):
        return "low"
    return "medium"


# ---------------------------------------------------------------------------
# HTTP helper (stdlib only — training env has no extra requirements)
# ---------------------------------------------------------------------------

def _http_json(url: str, retries: int = 2) -> list | dict | None:
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8", errors="replace"))
        except Exception:  # noqa: BLE001 — network errors must not kill training
            if attempt == retries:
                return None
            time.sleep(1.5 * (attempt + 1))
    return None


# ---------------------------------------------------------------------------
# Source definitions
# ---------------------------------------------------------------------------

SOURCES: dict[str, dict] = {
    "nyc311": {
        "kind": "socrata",
        "domain": "data.cityofnewyork.us",
        "resource": "erm2-nwe9",
        "select": "unique_key,created_date,complaint_type,descriptor,incident_address,city,borough",
        "where": "created_date > '2025-01-01T00:00:00'",
        "city_label": "New York",
    },
    "chi311": {
        "kind": "socrata",
        "domain": "data.cityofchicago.org",
        "resource": "v6vf-nfxy",
        "select": "sr_number,created_date,sr_type,sr_short_code,street_address,city,ward",
        "city_label": "Chicago",
    },
}

BOSTON_RESOURCE = "254adca6-64ab-4c5c-9fc0-a6da622be185"


def _socrata_rows(src: dict, limit: int) -> list[dict]:
    """Pull up to `limit` recent rows from a Socrata dataset (two pages max)."""
    base = f"https://{src['domain']}/resource/{src['resource']}.json"
    out: list[dict] = []
    offset, page = 0, 500
    while len(out) < limit and offset < 2000:
        params = {
            "$select": src["select"],
            "$limit": min(page, limit - len(out)),
            "$offset": offset,
            "$order": "created_date DESC",
        }
        if src.get("where"):
            params["$where"] = src["where"]
        url = f"{base}?{urllib.parse.urlencode(params)}"
        rows = _http_json(url)
        if not isinstance(rows, list) or not rows:
            break
        out.extend(rows)
        offset += len(rows)
    return out[:limit]


def _boston_rows(limit: int) -> list[dict]:
    """Pull rows from Boston's CKAN datastore (records come newest-first)."""
    out: list[dict] = []
    offset, page = 0, 500
    while len(out) < limit and offset < 2000:
        url = (
            "https://data.boston.gov/api/3/action/datastore_search"
            f"?resource_id={BOSTON_RESOURCE}&limit={min(page, limit - len(out))}&offset={offset}"
        )
        payload = _http_json(url)
        if not isinstance(payload, dict):
            break
        records = (payload.get("result") or {}).get("records") or []
        if not records:
            break
        out.extend(records)
        offset += len(records)
    return out[:limit]


# ---------------------------------------------------------------------------
# Normalization -> CivicLens rows
# ---------------------------------------------------------------------------

_ROW_KEYS = ("text", "category", "priority", "source_dataset")


def _mkrow(text: str, category: str, priority: str, src: str) -> dict | None:
    text = re.sub(r"\s+", " ", (text or "").strip())
    if len(text) < 12:  # too short to carry signal
        return None
    return {"text": text, "category": category, "priority": priority, "source_dataset": src}


def normalize_socrata(rows: list[dict], src: dict) -> list[dict]:
    """Socrata rows use complaint_type/descriptor (NYC) or sr_type (Chicago)."""
    out = []
    for r in rows:
        ctype = r.get("complaint_type") or r.get("sr_type") or ""
        desc = r.get("descriptor") or r.get("sr_short_code") or ""
        loc = r.get("incident_address") or r.get("street_address") or ""
        city = r.get("city") or src.get("city_label", "")
        if not ctype:
            continue
        text = f"{ctype}: {desc} reported near {loc}, {city}".replace("near ,", "in")
        cat = map_category(ctype, desc)
        out.append(_mkrow(text, cat, label_priority(ctype, desc, cat), src["resource"]) or None)
    return [r for r in out if r]


def normalize_boston(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        topic = r.get("case_topic") or r.get("type") or ""
        desc = r.get("subject") or r.get("case_title") or r.get("reason") or ""
        loc = r.get("location_street_name") or ""
        if not topic:
            continue
        text = f"{topic}: {desc} reported near {loc}, Boston".replace("near ,", "in")
        cat = map_category(topic, desc)
        out.append(_mkrow(text, cat, label_priority(topic, desc, cat), BOSTON_RESOURCE) or None)
    return [r for r in out if r]


# ---------------------------------------------------------------------------
# Cache + fetch entry points
# ---------------------------------------------------------------------------

def _cache_path(key: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{key}.json"


def load_source(key: str, limit: int, refresh: bool = False) -> list[dict]:
    """Fetch one source (with cache) and return normalized CivicLens rows."""
    cp = _cache_path(key)
    if not refresh and cp.exists():
        try:
            return json.loads(cp.read_text())
        except Exception:  # noqa: BLE001 — corrupt cache refetches below
            pass

    if key == "boston311":
        raw = _boston_rows(limit)
        rows = normalize_boston(raw)
    elif key in SOURCES:
        raw = _socrata_rows(SOURCES[key], limit)
        rows = normalize_socrata(raw, SOURCES[key])
    else:
        raise ValueError(f"unknown dataset key: {key}")

    cp.write_text(json.dumps(rows))
    return rows


def available_sources() -> list[str]:
    return [*SOURCES.keys(), "boston311"]


def fetch_all(per_source: int = 1000, refresh: bool = False) -> dict[str, list[dict]]:
    return {key: load_source(key, per_source, refresh) for key in available_sources()}


def write_real_csv(path: Path | None = None, per_source: int = 1000) -> Path | None:
    """Write the mapped real-data rows to ml/data/real_complaints.csv."""
    all_rows: list[dict] = []
    counts: dict[str, int] = {}
    for key in available_sources():
        try:
            rows = load_source(key, per_source)
        except Exception as e:  # noqa: BLE001 — one dead portal must not stop the rest
            print(f"[data_sources] {key} failed: {e}", file=sys.stderr)
            continue
        counts[key] = len(rows)
        all_rows.extend(rows)

    if not all_rows:
        return None
    path = path or DATA_DIR / "real_complaints.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(_ROW_KEYS))
        w.writeheader()
        w.writerows(all_rows)
    print(f"[data_sources] real rows: {counts} -> {path}")
    return path


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true", help="download and cache real datasets")
    ap.add_argument("--refresh", action="store_true", help="bypass cache")
    ap.add_argument("--per-source", type=int, default=1000)
    args = ap.parse_args()

    if args.fetch:
        write_real_csv(per_source=args.per_source)
    else:
        # Probe: how many rows does each source expose right now?
        for key in available_sources():
            if key == "boston311":
                p = _http_json(
                    "https://data.boston.gov/api/3/action/datastore_search"
                    f"?resource_id={BOSTON_RESOURCE}&limit=1"
                )
                n = ((p or {}).get("result") or {}).get("total") if isinstance(p, dict) else None
            else:
                src = SOURCES[key]
                p = _http_json(
                    f"https://{src['domain']}/resource/{src['resource']}.json?$select=count(1)"
                )
                n = p[0].get("count_1") if isinstance(p, list) and p else None
            print(f"{key}: {'OK' if n else 'UNAVAILABLE'} total={n}")
