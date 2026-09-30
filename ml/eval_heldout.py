"""Held-out evaluation of every CivicLens model on data NOT in the training set.

Three batteries:

  A. Text (L1 joblib bundle + the site's distilled lexicon pipeline)
     38 hand-labelled fresh BMC/Mumbai complaints written with phrasing that
     does NOT appear in the training templates (ml/bmc_data.py), the distilled
     lexicon (site/src/lib/data/triage_lexicon.json) or the keyword map — plus
     edge cases (empty, gibberish, Devanagari, typos, ALL-CAPS, non-complaint).

  B. Vision (NumPy CNN, ml/models/civic_cnn.npz)
     Fresh-seed procedural images (seed 9021 vs training seed 42) + out-of-
     distribution stress images (uniform frames, noise, inverted contrast,
     corner-cropped signature, night/overexposed).

  C. Risk (risk_nn.npz) — fresh-seed situations + out-of-range feature values
     beyond the training distribution.

Run:  .venv/bin/python ml/eval_heldout.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

import joblib  # noqa: E402
from serve import extract_features  # noqa: E402  (exact inference feature code)

from scipy.sparse import hstack  # noqa: E402

MODELS = ROOT / "models"
OUT = MODELS / "heldout_eval.json"

# ---------------------------------------------------------------------------
# A. Held-out text battery — phrasing NOT in any training template/lexicon
# ---------------------------------------------------------------------------

# (text, gold_category, gold_priority, note)
TEXT_CASES = [
    # Pothole — fresh nouns: speed breaker, caved in, crater field
    ("The speed breaker on our lane has caved in completely near Shankar Mandir, Chembur. Autos overturn every night.", "Pothole", "high", "no template vocab"),
    ("Fresh tar was put last month but the surface has already caved in opposite the bus depot, Vikhroli.", "Pothole", "medium", ""),
    ("paying road tax and driving on a crater field daily at Saki Naka junction, my bike axle snapped yesterday", "Pothole", "high", "injury-adjacent, no marker word"),
    ("small crater in front of gate 2, Seawoods. not urgent, please fill whenever the crew comes", "Pothole", "low", ""),
    # Drainage — gutter/jammed/rain water stays
    ("Rain water stays on the road outside Dadar station for hours after every shower; two-wheelers spray dirty water on pedestrians.", "Drainage", "high", "severity implied, not stated"),
    ("Our society compound floods knee-deep each monsoon because the storm channel behind the building is full of mud.", "Drainage", "high", ""),
    ("The gutter on the corner of our gully is jammed with plastic; water spills onto the road, Malad East.", "Drainage", "medium", "'gutter' OOV"),
    ("nali jam ahe, paani sadak var yet ahe, Bhandup East — kripaya kraa", "Drainage", "medium", "romanized Marathi"),
    # Waste — safai, dumpster, rats
    ("Safai workers have not visited our lane since Monday; house waste is piling up on the footpath, Ghatkopar.", "Waste", "high", "'safai' OOV"),
    ("The collection truck comes but skips our building's dumpster every time, Charkop.", "Waste", "medium", "'dumpster' OOV"),
    ("Someone dumps hotel leftover food at the corner shop's doorstep nightly; rats everywhere now, Mohammed Ali Road.", "Waste", "high", "implied severity via rats"),
    ("garbage van aaj bhi nahi aaya, kachra ghar ke bahar pada hai, Govandi", "Waste", "medium", "Hinglish"),
    # Water — tanker, cracked line, rusty
    ("Building tanker has not come for five days; we are buying bottled water for cooking, Seven Bungalows.", "Water", "high", "no marker word"),
    ("The main supply line under the footpath cracked near the temple; drinking water is seeping out continuously, Mulund.", "Water", "high", ""),
    ("Municipal tap gives rusty brown liquid every evening; we boil it thrice before use, Wadala.", "Water", "high", "contamination implied"),
    ("paani ka pressure bahut kam hai terrace flat mein, Oshiwara — din bhar ek boond nahi", "Water", "medium", "Hinglish"),
    # Streetlight — pillar light fused, tube lights dead, wire hanging
    ("The pillar light opposite the park gate is fused; that corner is pitch dark by 7pm, Andheri West.", "Streetlight", "high", ""),
    ("Tube lights in the subway are dead again; ladies avoid the underpass after sunset, Kurla.", "Streetlight", "high", "'dead again' no marker"),
    ("New LED fittings installed but half of them blink and switch off; Chembur monsoon is coming.", "Streetlight", "medium", ""),
    ("bijli ka khambha tuta hua hai, wire latka raha hai, bachhon ka school ka rasta hai, Mankhurd", "Streetlight", "urgent", "live-wire urgency, no English marker"),
    # Sewage — toilet water coming up, missing pit cover, creek dumping
    ("Toilet water is coming up in the ground floor bathrooms since morning; there are elders and a newborn at home, Sewri.", "Sewage", "urgent", "health hazard implied, no marker"),
    ("The inspection pit cover is missing outside the dairy; someone will fall in, Kandivali East.", "Sewage", "urgent", "'fall' not 'fell'"),
    ("Gutter water enters the shops on high-tide days; shopkeepers are counting losses, Bhuleshwar.", "Sewage", "high", ""),
    ("Emptying tankers release waste into the creek at night behind our layout, Deonar.", "Sewage", "high", ""),
    # Graffiti — posters, wrote on wall, spray art
    ("Political posters all over the railway subway walls again; paint still wet, Dadar West.", "Graffiti", "low", ""),
    ("Someone wrote on our society's freshly painted boundary wall; we repainted it just before Ganpati, Vile Parle.", "Graffiti", "low", "no graffiti vocab — hardest case"),
    ("Neon spray art on the metro pillar looks nice but it is illegal; please whitelist or remove it, Bandra West.", "Graffiti", "low", ""),
    # Other
    ("A cow has been standing on the flyover approach road since morning; traffic chaos behind it, Sion.", "Other", "medium", ""),
    ("Monsoon tree pruning request: branches will touch the HT wires this year, Dindoshi.", "Other", "medium", ""),
    ("Loudspeaker till 1am from the marriage hall lawn every weekend, Sher-e-Punjab lane, Andheri East.", "Other", "medium", ""),
    ("Two-wheelers ride on the footpath to beat the signal here daily; it is terrifying near the school gate, Vikhroli.", "Other", "high", "serve lists 'school' as urgent"),
    # Edge cases
    ("", "Other", "medium", "EDGE empty"),
    ("asdf qwerty zxcv lorem", "Other", "medium", "EDGE gibberish"),
    ("#MumbaiRains @mybmc please help us sir", "Other", "medium", "EDGE channel-only"),
    ("पाणी नाही आहे दोन दिवसांपासून", "Water", "high", "EDGE pure Devanagari"),
    ("strert light not wrking and potholl on the main raod", "Streetlight", "medium", "EDGE typos"),
    ("URGENT: SEWAGE OVERFLOWING INTO MY HOUSE PLEASE HELP IMMEDIATELY", "Sewage", "urgent", "EDGE all-caps"),
    ("When will the ward office open tomorrow? Need a birth certificate form.", "Other", "low", "EDGE non-complaint query"),
]

# ---------------------------------------------------------------------------
# Site lexicon pipeline — faithful port of site/src/lib/triage.ts
# ---------------------------------------------------------------------------

LEX = json.loads((ROOT.parent / "site/src/lib/data/triage_lexicon.json").read_text())


def _tokens(text: str) -> set[str]:
    import re

    return set(re.findall(r"[a-z]+", text.lower()))


def site_lexicon_layer(text: str):
    toks = _tokens(text)
    lexicons = LEX["lexicons"]
    best = None
    for cat, entries in lexicons.items():
        hits = [e for e in entries if e["w"] in toks]
        if not hits:
            continue
        score = sum(e["s"] for e in hits)
        if best is None or score > best[1]:
            best = (cat, score, hits)
    if best is None:
        return None
    return {
        "category": best[0],
        "confidence": min(0.93, 0.5 + best[1] * 0.06),
        "sourceLayer": "lexicon",
        "signals": sorted(best[2], key=lambda e: -e["s"])[:5],
    }


SITE_RULES = [
    ("Pothole", ["pothole", "gaddha", "crater", "road defect", "road surface", "tar road", "broken road"]),
    ("Drainage", ["drain", "nali", "waterlog", "water log", "flood", "catchpit", "silt", "desilt", "storm water"]),
    ("Waste", ["garbage", "kachra", "trash", "waste", "litter", "dumping", "bin", "sanitation"]),
    ("Water", ["water supply", "no water", "pipeline burst", "water leak", "contaminated", "pressure", "valve", "paani nahi"]),
    ("Streetlight", ["streetlight", "street light", "lamp post", "unlit", "dark street", "light pole", "bijli"]),
    ("Sewage", ["sewage", "sewer", "manhole", "ganda paani", "suction", "chamber", "overflow"]),
    ("Graffiti", ["graffiti", "banner", "flex", "poster", "defaced", "spray paint", "sticker"]),
    ("Other", ["stray dog", "encroachment", "abandoned vehicle", "tree branch", "parking", "footpath", "noise"]),
]


def site_rules_layer(text: str):
    t = text.lower()
    best = None
    for cat, kws in SITE_RULES:
        hits = [k for k in kws if k in t]
        if hits and (best is None or len(hits) > len(best[1])):
            best = (cat, hits)
    if best is None:
        return None
    return {
        "category": best[0],
        "confidence": min(0.8, 0.45 + len(best[1]) * 0.08),
        "sourceLayer": "rules",
        "signals": [{"word": w, "s": 1} for w in best[1]],
    }


def site_priority(text: str, fallback: str) -> str:
    t = text.lower()
    if any(w in t for w in LEX["priority"]["urgent"]):
        return "urgent"
    if any(w in t for w in LEX["priority"]["high"]):
        return "high"
    if any(w in t for w in LEX["priority"]["low"]):
        return "low"
    return fallback


def site_pipeline(text: str) -> dict:
    if not text.strip():
        return {"category": "Other", "priority": "medium", "confidence": 0.15, "sourceLayer": "manual", "signals": []}
    hit = site_lexicon_layer(text) or site_rules_layer(text)
    if hit:
        return {**hit, "priority": site_priority(text, "medium")}
    return {"category": "Other", "priority": "medium", "confidence": 0.25, "sourceLayer": "manual", "signals": []}


# ---------------------------------------------------------------------------
# B. CNN — fresh-seed images + OOD stress
# ---------------------------------------------------------------------------

CATEGORIES = ["Pothole", "Drainage", "Waste", "Water", "Streetlight", "Sewage", "Graffiti", "Other"]


def _np_forward(x: np.ndarray, p: dict) -> tuple[np.ndarray, np.ndarray]:
    """Mirrors ml/train_cnn.py::forward for a batch (N,1,48,48)."""
    import train_cnn as cnn

    acts = cnn.forward(x.astype(np.float32), p)
    return acts["zs"], acts["sev"]


def softmax(z: np.ndarray) -> np.ndarray:
    e = np.exp(z - z.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)


def eval_cnn() -> dict:
    import train_cnn as cnn  # npz key names live there
    import cnn_data

    data = np.load(MODELS / "civic_cnn.npz")
    p = {k: data[k] for k in data.files if k not in ("categories", "input_shape")}

    X, y, sev = cnn_data.generate_dataset(n_per_class=40, seed=9021)
    zs, sev_p = _np_forward(X, p)
    probs = softmax(zs)
    pred = probs.argmax(axis=1)
    conf = probs.max(axis=1)

    per_class = {}
    for ci, cat in enumerate(CATEGORIES):
        m = y == ci
        per_class[cat] = {
            "n": int(m.sum()),
            "acc": round(float((pred[m] == ci).mean()), 4),
            "mean_conf": round(float(conf[m].mean()), 4),
        }
    # top-3 accuracy
    order = np.argsort(-probs, axis=1)
    top3 = np.mean([y[i] in order[i, :3] for i in range(len(y))])

    ood = {}
    rng = np.random.default_rng(5)
    uniform_05 = np.full((1, 1, 48, 48), 0.5)
    night = np.full((1, 1, 48, 48), 0.15)
    overexposed = np.full((1, 1, 48, 48), 0.9)
    noise = np.clip(rng.normal(0.5, 0.3, (1, 1, 48, 48)), 0, 1)
    # inverted-contrast pothole (photo negative) — never seen in training
    inv = 1.0 - X[:1]
    # corner-cropped pothole (signature half outside frame)
    corner = np.zeros_like(X[:1])
    src = X[0, 0]
    corner[0, 0, :24, :24] = src[:24, :24]
    # heavy-blur pothole
    blur = np.repeat(np.repeat(src.reshape(24, 2, 24, 2).mean(axis=(1, 3)), 2, 0), 2, 1)[None, None]

    ood_cases = {
        "uniform_mid_gray": uniform_05,
        "night_frame_0.15": night,
        "overexposed_0.9": overexposed,
        "pure_noise": noise,
        "inverted_contrast_pothole": inv,
        "corner_cropped_pothole": corner,
        "heavy_blur_pothole": blur,
    }
    zs_ood, sev_ood = _np_forward(np.concatenate(list(ood_cases.values()), axis=0), p)
    probs_ood = softmax(zs_ood)
    for i, name in enumerate(ood_cases):
        o = np.argsort(-probs_ood[i])
        ood[name] = {
            "predicted": CATEGORIES[int(o[0])],
            "confidence": round(float(probs_ood[i][o[0]]), 4),
            "top3": {CATEGORIES[int(j)]: round(float(probs_ood[i][j]), 4) for j in o[:3]},
            "severity": round(float(sev_ood[i]), 4),
        }

    sev_mae = float(np.abs(sev_p - sev).mean())
    return {
        "n": int(len(y)),
        "accuracy": round(float((pred == y).mean()), 4),
        "top3_accuracy": round(float(top3), 4),
        "mean_confidence": round(float(conf.mean()), 4),
        "severity_mae": round(sev_mae, 4),
        "per_class": per_class,
        "ood": ood,
    }


# ---------------------------------------------------------------------------
# C. Risk NN — fresh situations + out-of-range features
# ---------------------------------------------------------------------------

FEATURE_ORDER = [
    "complaint_count", "complaint_growth_rate", "severity", "image_confidence",
    "accident_count", "rainfall", "traffic_level", "historical_incidents",
    "distance_to_previous_incident", "time_of_day",
]
RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]


def eval_risk() -> dict:
    import train_nn as nn

    data = np.load(MODELS / "risk_nn.npz")
    p = {k: data[k] for k in data.files}

    rng = np.random.default_rng(777)
    n = 4000
    f = nn.sample_situations(n, 777)
    X = nn.normalize_features(f)
    y = nn.expert_risk(f)
    probs = nn.softmax(nn.forward(X, p)[-1])
    pred = probs.argmax(axis=1)
    adj = float(np.mean(np.abs(pred - y) <= 1))

    # Out-of-range / edge inputs (single rows)
    def row(**kw):
        base = {
            "complaint_count": 10.0, "complaint_growth_rate": 1.0, "severity": 0.5,
            "image_confidence": 0.7, "accident_count": 0.0, "rainfall": 0.0,
            "traffic_level": 0.5, "historical_incidents": 2.0,
            "distance_to_previous_incident": 3.0, "time_of_day": 0.5,
        }
        base.update(kw)
        return [base[k] for k in FEATURE_ORDER]

    edges = {
        "calm_typical": row(),
        "viral_complaint_count_500": row(complaint_count=500.0),
        "zero_complaints": row(complaint_count=0.0),
        "growth_6x_out_of_range": row(complaint_growth_rate=6.0),
        "no_image_evidence": row(image_confidence=0.0),
        "torrential_rain_300mm": row(rainfall=300.0),
        "rain_plus_drainage_severity": row(rainfall=80.0, severity=0.95, traffic_level=0.9),
        "historical_50_out_of_range": row(historical_incidents=50.0),
        "adjacent_incident_50cm": row(distance_to_previous_incident=0.5, complaint_count=40, severity=0.9),
        "far_incident_90km": row(distance_to_previous_incident=90.0),
        "midnight": row(time_of_day=0.0),
        "accidents_5_plus_rain": row(accident_count=5, rainfall=40, severity=0.85, complaint_count=45),
    }
    E = np.array(list(edges.values()))
    Ep = nn.softmax(nn.forward(nn.normalize_features({k: E[:, i] for i, k in enumerate(FEATURE_ORDER)}), p)[-1])
    edge_pred = {name: RISK_LEVELS[int(a)] for name, a in zip(edges, Ep.argmax(axis=1))}
    edge_conf = {name: round(float(Ep[i].max()), 3) for i, name in enumerate(edges)}

    return {
        "n": n,
        "accuracy": round(float((pred == y).mean()), 4),
        "adjacent_tolerance_accuracy": round(adj, 4),
        "edge_cases": edge_pred,
        "edge_confidence": edge_conf,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def eval_text() -> dict:
    b = joblib.load(MODELS / "triage_bundle.joblib")
    texts = [t for t, _, _, _ in TEXT_CASES]
    keep = [i for i, t in enumerate(texts) if t.strip()]
    kept_texts = [texts[i] for i in keep]

    w = b["word_tfidf"].transform(kept_texts)
    c = b["char_tfidf"].transform(kept_texts)
    X = hstack([w, c, extract_features(kept_texts)]).tocsr()
    cat_p = b["category_head"].predict_proba(X)
    cat_cls = list(b["category_head"].classes_)
    pri_p = b["priority_head"].predict_proba(X)
    pri_cls = list(b["priority_head"].classes_)

    results = []
    seen = 0
    cat_correct = pri_correct = pri_adjacent = 0
    total = 0
    for i, (text, gcat, gprio, note) in enumerate(TEXT_CASES):
        if i in keep:
            ci = int(np.argmax(cat_p[seen]))
            pi = int(np.argmax(pri_p[seen]))
            l1_cat, l1_conf = cat_cls[ci], float(cat_p[seen][ci])
            l1_pri, l1_pconf = pri_cls[pi], float(pri_p[seen][pi])
            seen += 1
        else:
            l1_cat, l1_conf, l1_pri, l1_pconf = "Other", 0.0, "medium", 0.0

        site = site_pipeline(text)
        total += 1
        cat_ok_bundle = l1_cat == gcat
        cat_ok_site = site["category"] == gcat
        pri_ok_bundle = l1_pri == gprio
        pri_ok_site = site["priority"] == gprio
        cat_correct += cat_ok_bundle
        pri_correct += pri_ok_bundle
        order = {"low": 0, "medium": 1, "high": 2, "urgent": 3}
        if not pri_ok_bundle and abs(order[l1_pri] - order[gprio]) == 1:
            pri_adjacent += 1
        results.append({
            "note": note,
            "text": text[:90],
            "gold": [gcat, gprio],
            "bundle": [l1_cat, l1_pri, round(l1_conf, 3), round(l1_pconf, 3)],
            "site": [site["category"], site["priority"], round(site["confidence"], 3), site["sourceLayer"]],
            "cat_ok": [bool(cat_ok_bundle), bool(cat_ok_site)],
            "pri_ok": [bool(pri_ok_bundle), bool(pri_ok_site)],
        })

    return {
        "n": total,
        "bundle_category_acc": round(cat_correct / total, 4),
        "bundle_priority_acc": round(pri_correct / total, 4),
        "bundle_priority_adjacent_acc": round((pri_correct + pri_adjacent) / total, 4),
        "site_category_acc": round(sum(1 for r in results if r["cat_ok"][1]) / total, 4),
        "site_priority_acc": round(sum(1 for r in results if r["pri_ok"][1]) / total, 4),
        "cases": results,
    }


def main() -> None:
    print("=== A. Text: L1 bundle + site lexicon on 38 held-out complaints ===")
    text_report = eval_text()
    print(f"bundle  category {text_report['bundle_category_acc']:.3f} | priority {text_report['bundle_priority_acc']:.3f} (adjacent {text_report['bundle_priority_adjacent_acc']:.3f})")
    print(f"site    category {text_report['site_category_acc']:.3f} | priority {text_report['site_priority_acc']:.3f}")
    print("\n--- failures (bundle category wrong) ---")
    for r in text_report["cases"]:
        if not r["cat_ok"][0]:
            print(f"  [{r['gold'][0]}→{r['bundle'][0]}|site:{r['site'][0]}|{r['site'][3]}] {r['text'][:70]}  ({r['note']})")
    print("\n--- priority misses (bundle) ---")
    for r in text_report["cases"]:
        if not r["pri_ok"][0]:
            print(f"  [{r['gold'][1]}→{r['bundle'][1]}|site:{r['site'][1]}] {r['text'][:70]}")

    print("\n=== B. CNN on fresh-seed images + OOD stress ===")
    cnn_report = eval_cnn()
    print(f"n={cnn_report['n']} acc={cnn_report['accuracy']} top3={cnn_report['top3_accuracy']} sevMAE={cnn_report['severity_mae']}")
    for cat, s in cnn_report["per_class"].items():
        print(f"  {cat:<12} acc={s['acc']:.3f} conf={s['mean_conf']:.3f}")
    print("  OOD:")
    for name, o in cnn_report["ood"].items():
        print(f"    {name:<28} -> {o['predicted']:<12} conf={o['confidence']} sev={o['severity']}")

    print("\n=== C. Risk NN on fresh situations + out-of-range features ===")
    risk_report = eval_risk()
    print(f"n={risk_report['n']} acc={risk_report['accuracy']} adjacent={risk_report['adjacent_tolerance_accuracy']}")
    for name, lvl in risk_report["edge_cases"].items():
        print(f"  {name:<32} -> {lvl:<8} conf={risk_report['edge_confidence'][name]}")

    OUT.write_text(json.dumps({"text": text_report, "cnn": cnn_report, "risk": risk_report}, indent=2))
    print(f"\n[wrote {OUT}]")


if __name__ == "__main__":
    main()
