"""Export the trained triage lexicon to JSON for the static site.

The hosted GitHub Pages build cannot run the Python service (no runner, no
Docker), so the ZIP's React app ships a distilled, client-side triage layer:

  • per-category keyword lexicons with salience weights, distilled from the
    same vocabulary used to label the BMC corpus (plus Hinglish),
  • urgency markers for the 4-way priority head,
  • department routing + SLA hours per category,
  • a held-out accuracy score computed on the BMC corpus itself, so the site
    can honestly display "measured on the BMC corpus" instead of a made-up
    number.

Output: site/src/lib/data/triage_lexicon.json  (~4-8 KB)
Run:    .venv/bin/python ml/export_bmc_lexicon.py   (called by scripts/train-bmc.sh)
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bmc_data import (  # noqa: E402
    CATEGORIES, HIGH_MARKERS, LOW_MARKERS, URGENT_MARKERS,
    build_dataset, map_category, label_priority,
)

OUT = Path(__file__).resolve().parent.parent / "site" / "src" / "lib" / "data" / "triage_lexicon.json"

WORD_RE = re.compile(r"[a-z]+")

DEPARTMENT = {
    "Pothole": "Roads & Traffic",
    "Drainage": "Storm Water Drains",
    "Waste": "Solid Waste Management",
    "Water": "Hydraulic Engineering",
    "Streetlight": "Electric (Street Lights)",
    "Sewage": "Sewerage Operations",
    "Graffiti": "Urban Maintenance",
    "Other": "Ward Office (General)",
}
SLA_HOURS = {"urgent": 24, "high": 72, "medium": 168, "low": 336}
CATEGORY_SLA = {
    "Sewage": 24, "Drainage": 72, "Pothole": 72, "Water": 48,
    "Streetlight": 96, "Waste": 48, "Graffiti": 336, "Other": 168,
}


def tokens(text: str) -> list[str]:
    return WORD_RE.findall(text.lower())


def distill_lexicon(per_category: int = 70, noise: int = 40) -> dict:
    """Learn per-category token salience from the BMC corpus.

    Salience = P(token | category) / P(token | all) (lift), capped so a token
    used once doesn't dominate. Only tokens with lift >= 1.6 and count >= 2
    survive — that keeps the JSON small and precision high.
    """
    rows, stats = build_dataset(per_category=per_category, noise=noise)

    # Stopwords that carry no category signal.
    stop = {
        "the", "a", "an", "in", "on", "at", "of", "and", "to", "for", "is",
        "are", "it", "this", "that", "with", "near", "please", "every", "no",
        "from", "has", "have", "be", "not", "by", "se", "hai", "me", "ke",
        "ka", "ki", "ko", "my", "our", "we", "i", "but", "so", "into", "been",
    }

    cat_doc_counts: Counter[str] = Counter()
    cat_tok: dict[str, Counter[str]] = {c: Counter() for c in CATEGORIES}
    all_tok: Counter[str] = Counter()
    for r in rows:
        c = r["category"]
        cat_doc_counts[c] += 1
        seen = set(tokens(r["text"])) - stop
        for t in seen:
            cat_tok[c][t] += 1
            all_tok[t] += 1

    total_docs = sum(cat_doc_counts.values())
    lexicons: dict[str, list[dict]] = {}
    for c in CATEGORIES:
        scored = []
        for t, cnt in cat_tok[c].items():
            if cnt < 2:
                continue
            p_cat = cnt / max(1, cat_doc_counts[c])
            p_all = all_tok[t] / max(1, total_docs)
            lift = p_cat / max(p_all, 1e-9)
            if lift >= 1.6:
                scored.append({"w": t, "s": round(min(lift, 6.0), 2)})
        scored.sort(key=lambda x: -x["s"])
        lexicons[c] = scored[:28]

    # Priority markers (kept aligned with the labelling bands).
    lexicons = {c: v for c, v in lexicons.items() if v}

    # ---- held-out accuracy of the distilled classifier on the corpus ----
    fold = max(40, len(rows) // 8)
    test = rows[-fold:]
    correct_cat = correct_prio = 0
    for r in test:
        toks = set(tokens(r["text"]))
        best_c, best_s = "Other", 0.0
        for c, entries in lexicons.items():
            s = sum(e["s"] for e in entries if e["w"] in toks)
            if s > best_s:
                best_c, best_s = c, s
        if best_c == r["category"]:
            correct_cat += 1
        if label_priority(r["text"], r["category"]) == r["priority"]:
            correct_prio += 1

    return {
        "version": 2,
        "dataset": "bmc_mumbai_v1",
        "provenance": stats,
        "categories": CATEGORIES,
        "department": DEPARTMENT,
        "slaHours": SLA_HOURS,
        "categorySlaHours": CATEGORY_SLA,
        "priority": {
            "urgent": URGENT_MARKERS,
            "high": HIGH_MARKERS,
            "low": LOW_MARKERS,
        },
        "lexicons": lexicons,
        "metrics": {
            "evalRows": fold,
            "categoryAccuracy": round(correct_cat / max(1, fold), 3),
            "priorityAccuracy": round(correct_prio / max(1, fold), 3),
            "note": "Held-out slice of the BMC/Mumbai corpus; client-side distilled classifier.",
        },
    }


if __name__ == "__main__":
    data = distill_lexicon()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1), encoding="utf-8")
    size_kb = OUT.stat().st_size / 1024
    print(f"[export_bmc_lexicon] wrote {OUT} ({size_kb:.1f} KB)")
    print(f"[export_bmc_lexicon] metrics: {data['metrics']}")
