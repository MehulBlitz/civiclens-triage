"""Brihanmumbai Municipal Corporation (BMC) grievance data — the Mumbai corpus.

Why this exists: the old triage bundle was trained on NYC/Chicago/Boston 311
records — useful signal, wrong city. BMC (a hackathon by BMC) needs a Mumbai
corpus. Research (2026-09) found NO official downloadable BMC complaint CSV:

  • data.gov.in CKAN  — BMC datasets exist (budgets, wards, civic diary) but
    zero machine-readable complaint/grievance tables.
  • data.opencity.in  — group=mumbai has BMC budget/election data; complaints
    only for Bengaluru (BBMP Fix My Street).
  • The real corpus (1.2M MCGM 2018-2024 records) lives in a Kaggle
    competition; manual export required ( licensing).

So this loader ships a 3-tier strategy, in priority order:

  T1  `ml/data/bmc_manual.csv` — place a real BMC/MCGM export here (from the
      Kaggle dump or an RTI/portal export) and it is used as-is. Columns
      accepted (any subset, case-insensitive): text/description/complaint,
      category/type/complaint_type, priority, ward/locality.
  T2  data.gov.in CKAN — `--fetch` probes the national catalog for BMC
      grievance resources and maps any datastore/CSV rows into the CivicLens
      8-way taxonomy. Today it returns 0 rows; kept so a future publication
      is picked up automatically.
  T3  `build_bmc_corpus()` — a BMC-realistic synthetic corpus: Mumbai ward
      names/localities, MCGM department jargon (nali, gaddha, kachra, paani,
      M-seva tokens), Hinglish/Marathi phrasing and monsoon context. Labels
      are derived deterministically from severity/duration text markers so the
      classifier learns genuinely predictive structure (same philosophy as the
      NYC/Chicago/Boston loaders).

Usage:
  python3 ml/bmc_data.py --probe          # show what T1/T2 found
  python3 ml/bmc_data.py --build          # merge tiers -> ml/data/bmc_complaints.csv
  python3 ml/bmc_data.py --build --per-category 80
"""
from __future__ import annotations

import argparse
import csv
import json
import random
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
CACHE_DIR = DATA_DIR / "cache"
OUT_PATH = DATA_DIR / "bmc_complaints.csv"
MANUAL_PATH = DATA_DIR / "bmc_manual.csv"  # T1: drop a real export here

CATEGORIES = [
    "Pothole", "Drainage", "Waste", "Water",
    "Streetlight", "Sewage", "Graffiti", "Other",
]

# ---------------------------------------------------------------------------
# Mumbai vocabulary — wards, localities, channels, Hinglish phrasing
# ---------------------------------------------------------------------------

WARDS = [
    {"ward": "A",      "name": "Colaba–Churchgate",   "zone": "City"},
    {"ward": "C",      "name": "Marine Lines–Malabar Hill", "zone": "City"},
    {"ward": "G North","name": "Dadar–Mahim",         "zone": "City"},
    {"ward": "H East", "name": "Bandra East–Khar",    "zone": "Western Suburbs"},
    {"ward": "K West", "name": "Andheri West–Juhu",   "zone": "Western Suburbs"},
    {"ward": "P North", "name": "Malad–Dahisar",      "zone": "Western Suburbs"},
    {"ward": "R Central", "name": "Borivali–Kandivali", "zone": "Western Suburbs"},
    {"ward": "T",      "name": "Mulund",              "zone": "Eastern Suburbs"},
    {"ward": "S",      "name": "Bhandup–Vikhroli",    "zone": "Eastern Suburbs"},
    {"ward": "N",      "name": "Ghatkopar–Vikhroli",  "zone": "Eastern Suburbs"},
    {"ward": "L",      "name": "Kurla–Sakinaka",      "zone": "Eastern Suburbs"},
    {"ward": "M West", "name": "Chembur",             "zone": "Eastern Suburbs"},
    {"ward": "M East", "name": "Govandi–Mankhurd",    "zone": "Eastern Suburbs"},
    {"ward": "F North", "name": "Matunga–Sion",       "zone": "City"},
]

LOCALITIES = [
    "Andheri West", "Lokhandwala", "Versova", "Juhu", "Bandra West", "Khar West",
    "Santa Cruz West", "Vile Parle East", "Borivali West", "Kandivali East",
    "Malad West", "Dahisar East", "Goregaon East", "Chembur", "Ghatkopar West",
    "Kurla West", "Sakinaka", "Powai", "Bhandup West", "Mulund West",
    "Vikhroli East", "Govandi", "Mankhurd", "Dadar West", "Mahim", "Sion",
    "Matunga East", "Parel", "Worli", "Wadala", "Byculla", "Colaba",
    "Churchgate", "Marine Lines", "Girgaon", "Tardeo", "Dharavi", "Deonar",
    "Marol", "Saki Vihar", "Charkop", "Oshiwara", "Seven Bungalows",
    "Four Bungalows", "Yari Road", "Irla", "Navgaon", "Kajupada", "Ghodapdeo",
    "Antop Hill", "Sewri", "Reay Road", "Bhatwadi", "Parksite", "Kanjurmarg",
]

LANDMARKS = [
    "near the railway station", "outside the metro station", "opposite BEST depot",
    "in front of the municipal school", "behind the ward office", "near the market",
    "beside the flyover", "under the highway bridge", "near the bus stop",
    "on the service road", "at the T-junction", "next to the garden",
    "in the gaothan lane", "behind the community hall", "near the seaface promenade",
]

STREETS = [
    "S V Road", "Linking Road", "Juhu Tara Road", "Veera Desai Road",
    "LBS Marg", "Eastern Express Highway service road", "Gokhale Road",
    "Tilak Road", "Ambedkar Road", "Ranade Road", "Kajupada pipeline road",
    "Mahakali Caves Road", "Marol Maroshi Road", "Navghar Road",
    "Temba Naka", "Ghantali Devi Road", "Dattapada Road", "Eksar Road",
]

# MCGM / M-seva jargon + Hinglish + Marathi words citizens actually type.
HINGLISH = [
    "gaddha", "gaddhe", "nali", "nal", "kachra", "kachara", "paani", "paani nahi",
    "bijli ka khambha", "gir gaye", "bahut din se", "kripya jaldi", "bhai",
    "saaf karo", "bhari ho gaya", "rasta band", "ghoomti hai", "taktakti",
    "dhanda", "bhaari paani", "moti gaddha", "tuta hua", "purna block",
]

CHANNELS = [
    "@mybmc", "@mybmcWardKW", "#MumbaiRains", "#MCGM", "M-seva app complaint",
    "Ward officer email", "24x7 helpline 1916", "WhatsApp to corporator",
]

URGENT_MARKERS = [
    "urgent", "emergency", "accident", "bike skid", "two-wheeler slipped",
    "school children", "hospital", "unsafe", "health hazard", "immediately",
    "today itself", "live wire", "electrocut", "gir gaye", "life risk",
    "collapse", "monsoon starting", "high tide",
]
HIGH_MARKERS = [
    "blocked", "choked", "overflow", "overflowing", "burst", "waterlogged",
    "flood", "flooded", "gushing", "huge", "massive", "deep", "weeks",
    "ten days", "no water", "contaminated", "smell", "mosquito", "dengue",
    "stray dog", "entire lane", "whole building",
]
LOW_MARKERS = ["minor", "small", "cosmetic", "whenever possible", "no rush", "request only"]

# ---------------------------------------------------------------------------
# T3 — BMC-realistic synthetic corpus (labelled from deterministic markers)
# ---------------------------------------------------------------------------

def _fmt(rng: random.Random, tpl: str) -> str:
    return tpl.format(
        loc=rng.choice(LOCALITIES),
        street=rng.choice(STREETS),
        lm=rng.choice(LANDMARKS),
        ward=rng.choice(WARDS),
        dur=rng.choice(["three days", "a week", "two weeks", "ten days", "since last Friday", "a month"]),
        n=rng.randint(2, 14),
        chan=rng.choice(CHANNELS),
        hi=rng.choice(HINGLISH),
    )


TEMPLATES: dict[str, list[str]] = {
    "Pothole": [
        "Huge pothole on {street} {lm}, {loc}. Two-wheelers skid every evening during rush hour. {chan}.",
        "{loc}: {hi} on the road near {lm} — {dur} se hai. Auto drivers refuse this stretch. Please repair before monsoon.",
        "Deep crater {lm}, {loc} filled only with gravel. It reopens every week. Ward {ward} needs a proper tar patch.",
        "Road surface completely broken {lm} in {loc}, craters knee-deep after rain. BMC {chan} logged but no action.",
        "Series of potholes from {street} till {lm}, {loc}. {n} vehicles got punctured this week alone.",
    ],
    "Drainage": [
        "Drainage nali choked {lm}, {loc}. Water logging every time it rains for 20 minutes. {chan}.",
        "{hi} — open nali overflowing {lm}, {loc}, dirty water on the footpath. De-silting requested {dur}.",
        "Storm water drain {lm} {loc} blocked with construction debris; entire lane floods at high tide.",
        "Water logged {dur} outside {lm}, {loc}. Kids wade through sewage-mixed water to reach the municipal school.",
        "Catchpit near {lm}, {loc} is silted up; monsoon rain has nowhere to go. Desilting crew needed in {ward}.",
    ],
    "Waste": [
        "Garbage not collected {dur} in {loc}. Kachra bins {lm} overflowing, stray dogs scattering waste by morning.",
        "Illegal dumping behind {lm}, {loc} — construction kachra and household waste mixed. {chan}.",
        "Household waste piling up {lm} {loc} because the SWM truck skips our lane; {hi} smell unbearable.",
        "Nightly meat-market waste dumped {lm}, {loc}. Please enforce the D+ ward sanitation round.",
        "Kachra point {lm} {loc} has not been lifted for {n} days; mosquito breeding has started.",
    ],
    "Water": [
        "No water supply {dur} in {loc} — building taps completely dry. {chan}.",
        "Water pipeline burst {lm}, {loc}; clean water gushing into the nali for {n} hours. Hydraulic dept please close the valve.",
        "Water supply contaminated {lm} {loc} — paani is yellowish with smell since {dur}. Families falling sick.",
        "Low water pressure in {loc} only after the new connection {lm}; we get 15 minutes of supply.",
        "Leak at the valve chamber {lm} {loc} wasting thousands of litres daily. {hi} report to the ward office got no reply.",
    ],
    "Streetlight": [
        "Streetlight dead {dur} {lm}, {loc}. Entire stretch pitch dark after 8pm; women avoid the lane.",
        "{n} lamp posts not working on {street}, {loc}. {hi} — the whole gaothan lane is unlit.",
        "Streetlight pole leaning dangerously {lm}, {loc} after last week's gusty rain. Live wire exposed at night.",
        "Flickering LED fittings {lm} {loc} — light goes off every 10 minutes. Please replace the panel.",
        "No street lighting at all from {street} till {lm}, {loc}; auto stands there refuse fares after dark.",
    ],
    "Sewage": [
        "Sewage line choked {lm}, {loc} — ganda paani backing up into ground-floor toilets. {chan}.",
        "Manhole overflowing {lm} {loc} for {dur}; raw sewage on the street, dengue risk. This is urgent.",
        "Sewer chamber {lm} {loc} blocked; suction truck needed today itself, families cannot use bathrooms.",
        "Sewage mixing into the drinking water line {lm} {loc} — health hazard. {hi} kripya jaldi dekho.",
        "Open manhole without cover {lm} {loc}, school children pass daily. {n} complaints {dur}, still open.",
    ],
    "Graffiti": [
        "Illegal banners and flex boards {lm}, {loc} covering the entire wall after the festival. {chan}.",
        "Graffiti sprayed over the new wall paint {lm} {loc}; request the Urban Maintenance repaint round.",
        "Posters pasted on every electric pole {lm} {loc} — {n} boards, sponsors visible. Please fine them.",
        "Wall defaced with spray paint {lm} {loc} near the metro pillar; cosmetic but residents want it cleaned.",
        "Stickers all over the bus shelter {lm} {loc}; no rush, but please add it to the weekly clean-up.",
    ],
    "Other": [
        "Stray dog menace {lm}, {loc} — a pack of {n} dogs chases school children every morning.",
        "Abandoned vehicle {dur} {lm} {loc}, tyres removed, becoming a dumping spot.",
        "Tree branch hanging over the electric line {lm} {loc}; gusty wind expected this weekend.",
        "Illegal parking choking the gaothan lane {lm} {loc}; fire tender cannot enter. {chan}.",
        "Footpath encroachment {lm} {loc} forcing pedestrians onto the main carriageway.",
    ],
}

NOISE_TEMPLATES = [
    "Request for a no-objection letter for renovation {lm}, {loc}.",
    "What are the ward office timings for {loc}? {chan}.",
    "Compliment: the garden {lm} {loc} is finally clean, great work by the crew.",
    "Property tax double entry for our flat {lm}, {loc} — please correct.",
    "Suggestion: more benches near the seaface promenade in {loc}.",
]


def label_priority(text: str, category: str) -> str:
    t = text.lower()
    if any(w in t for w in URGENT_MARKERS):
        return "urgent"
    if category == "Sewage":  # baseline health hazard, same rule as data_sources.py
        return "high"
    if any(w in t for w in HIGH_MARKERS):
        return "high"
    if any(w in t for w in LOW_MARKERS):
        return "low"
    return "medium"


def build_bmc_corpus(per_category: int = 70, noise: int = 40, seed: int = 7) -> list[dict]:
    rng = random.Random(seed)
    rows: list[dict] = []
    for cat, tpls in TEMPLATES.items():
        for _ in range(per_category):
            text = _fmt(rng, rng.choice(tpls))
            # occasional Hinglish prefix, like real social posts
            if rng.random() < 0.35:
                text = f"{rng.choice(CHANNELS)} — {text}"
            rows.append({"text": text, "category": cat, "priority": label_priority(text, cat),
                         "source_dataset": "bmc_synthetic"})
    for _ in range(noise):
        text = _fmt(rng, rng.choice(NOISE_TEMPLATES))
        rows.append({"text": text, "category": "Other", "priority": label_priority(text, "Other"),
                     "source_dataset": "bmc_synthetic"})
    rng.shuffle(rows)
    return rows


# ---------------------------------------------------------------------------
# T1 — manual export (Kaggle MCGM dump / RTI CSV)
# ---------------------------------------------------------------------------

_COL_ALIASES = {
    "text": ["text", "description", "complaint", "complaint_text", "details", "content", "body"],
    "category": ["category", "type", "complaint_type", "complainttype", "dept", "department"],
    "priority": ["priority", "urgency", "severity"],
    "ward": ["ward", "locality", "area", "location"],
}


def _pick(row: dict, key: str) -> str:
    lower = {k.lower().strip(): k for k in row}
    for alias in _COL_ALIASES[key]:
        if alias in lower and row[lower[alias]]:
            return str(row[lower[alias]])
    return ""


def load_manual() -> list[dict]:
    if not MANUAL_PATH.exists():
        return []
    out: list[dict] = []
    with MANUAL_PATH.open(encoding="utf-8", errors="replace") as f:
        for r in csv.DictReader(f):
            text = _pick(r, "text")
            if len(text) < 12:
                continue
            cat = _pick(r, "category")
            if cat not in CATEGORIES:
                cat = map_category(cat, _pick(r, "ward"))
            prio = _pick(r, "priority").lower()
            if prio not in ("urgent", "high", "medium", "low"):
                prio = label_priority(text, cat)
            out.append({"text": re.sub(r"\s+", " ", text).strip(), "category": cat,
                        "priority": prio, "source_dataset": "bmc_manual"})
    return out


# ---------------------------------------------------------------------------
# T2 — data.gov.in CKAN probe (auto-picks up future BMC publications)
# ---------------------------------------------------------------------------

GOV_BASE = "https://api.data.gov.in/catalog"  # CKAN-style package search is unstable; probe the public CKAN first
CKAN_BASE = "https://data.gov.in/api/3/action/package_search"


def _http_json(url: str, retries: int = 1) -> list | dict | None:
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "CivicLens-Training/1.0", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=25) as resp:
                return json.loads(resp.read().decode("utf-8", errors="replace"))
        except Exception:  # noqa: BLE001 — probe must never kill training
            if attempt == retries:
                return None
            time.sleep(1.5)
    return None


def fetch_data_gov_in(limit: int = 500) -> list[dict]:
    """Search the national CKAN for BMC grievance resources and map rows.

    Currently 0 machine-readable BMC complaint resources exist, so this
    normally returns []. It is kept so a future publication is adopted
    automatically — the tier order stays honest.
    """
    payload = _http_json(f"{CKAN_BASE}?q=BMC%20complaints&rows=20")
    if not isinstance(payload, dict):
        return []
    results = (payload.get("result") or {}).get("results") or []
    out: list[dict] = []
    for pkg in results:
        org = ((pkg.get("organization") or {}).get("title") or "").lower()
        if not any(k in org for k in ("brihanmumbai", "bmc", "mcgm", "mumbai")):
            continue
        for res in pkg.get("resources", []):
            url = res.get("url") or ""
            if not url.lower().endswith((".csv", "/download")) or "datastore" not in url:
                continue
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "CivicLens-Training/1.0"})
                with urllib.request.urlopen(req, timeout=25) as resp:
                    text = resp.read().decode("utf-8", errors="replace")
                reader = csv.DictReader(text.splitlines())
                for i, r in enumerate(reader):
                    if i >= limit:
                        break
                    t = _pick(r, "text")
                    if len(t) < 12:
                        continue
                    cat = map_category(_pick(r, "category"), _pick(r, "ward"))
                    out.append({"text": re.sub(r"\s+", " ", t).strip(), "category": cat,
                                "priority": label_priority(t, cat), "source_dataset": "bmc_datagov"})
            except Exception:  # noqa: BLE001
                continue
    return out


# ---------------------------------------------------------------------------
# Keyword mapping shared with the rest of the pipeline
# ---------------------------------------------------------------------------

KEYWORD_MAP: list[tuple[str, list[str]]] = [
    ("Pothole", ["pothole", "gaddha", "road defect", "street condition", "crater", "road surface", "tar"]),
    ("Drainage", ["drain", "nali", "waterlog", "water log", "flood", "catchpit", "catch pit", "silt", "desilt", "storm water", "stormwater"]),
    ("Waste", ["garbage", "kachra", "trash", "waste", "litter", "dumping", "bin", "sanitation", "swm"]),
    ("Water", ["water supply", "no water", "pipeline burst", "water leak", "contaminated", "hydraulic", "pressure", "valve"]),
    ("Streetlight", ["streetlight", "street light", "lamp post", "lamp", "lighting", "unlit", "dark"]),
    ("Sewage", ["sewage", "sewer", "manhole", "ganda paani", "suction", "chamber", "overflow"]),
    ("Graffiti", ["graffiti", "banner", "flex", "poster", "defaced", "spray", "sticker"]),
]


def map_category(complaint_type: str, descriptor: str = "") -> str:
    blob = f"{complaint_type} {descriptor}".lower()
    for cat, words in KEYWORD_MAP:
        if any(w in blob for w in words):
            return cat
    return "Other"


# ---------------------------------------------------------------------------
# Merge tiers -> bmc_complaints.csv
# ---------------------------------------------------------------------------

def build_dataset(per_category: int = 70, noise: int = 40, seed: int = 7) -> tuple[list[dict], dict]:
    stats: dict = {}
    rows: list[dict] = []

    manual = load_manual()
    stats["bmc_manual"] = len(manual)
    rows.extend(manual)

    gov = fetch_data_gov_in()
    stats["bmc_datagov"] = len(gov)
    rows.extend(gov)

    synth = build_bmc_corpus(per_category=per_category, noise=noise, seed=seed)
    stats["bmc_synthetic"] = len(synth)
    rows.extend(synth)

    random.Random(seed).shuffle(rows)
    return rows, stats


def write_csv(path: Path = OUT_PATH, per_category: int = 70, noise: int = 40, seed: int = 7) -> Path:
    rows, stats = build_dataset(per_category=per_category, noise=noise, seed=seed)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["text", "category", "priority", "source_dataset"])
        w.writeheader()
        w.writerows(rows)
    print(f"[bmc_data] wrote {len(rows)} rows -> {path}")
    print(f"[bmc_data] provenance: {stats}")
    by_cat: dict[str, int] = {}
    by_prio: dict[str, int] = {}
    for r in rows:
        by_cat[r["category"]] = by_cat.get(r["category"], 0) + 1
        by_prio[r["priority"]] = by_prio.get(r["priority"], 0) + 1
    print(f"[bmc_data] by category: {dict(sorted(by_cat.items()))}")
    print(f"[bmc_data] by priority: {dict(sorted(by_prio.items()))}")
    return path


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="BMC/Mumbai grievance corpus builder")
    ap.add_argument("--probe", action="store_true", help="report tier availability")
    ap.add_argument("--build", action="store_true", help="write ml/data/bmc_complaints.csv")
    ap.add_argument("--per-category", type=int, default=70)
    ap.add_argument("--noise", type=int, default=40)
    args = ap.parse_args()

    if args.probe:
        m = load_manual()
        g = fetch_data_gov_in(limit=20)
        print(f"T1 manual export ({MANUAL_PATH.name}): {len(m)} rows")
        print(f"T2 data.gov.in probe: {len(g)} rows")
        print(f"T3 synthetic fallback: ready (per_category={args.per_category})")
        sys.exit(0)

    if args.build:
        write_csv(per_category=args.per_category, noise=args.noise)
        sys.exit(0)

    ap.print_help()
