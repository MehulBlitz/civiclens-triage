"""Train the CivicLens triage models.

Pipeline (pure scikit-learn, no external AI API):
  - TF-IDF over word 1-2 grams + character n-grams (3-5) + engineering features
    (char length, exclamation count, uppercase ratio, severity/urgency markers)
  - Linear SVM one-vs-rest heads for category (8-way) and priority (4-way)
  - Calibrated probabilities for the confidence field
  - Saved as a single bundle: ml/models/triage_bundle.joblib

Usage:
  python3 ml/train.py [--per-category 60] [--noise 40]
"""
from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

import joblib
import numpy as np
from scipy.sparse import hstack, csr_matrix
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import classification_report, accuracy_score, f1_score
from sklearn.svm import LinearSVC
from sklearn.model_selection import train_test_split

from generate_dataset import build_dataset

MODELS_DIR = Path(__file__).resolve().parent / "models"

CATEGORIES = [
    "Pothole", "Drainage", "Waste", "Water",
    "Streetlight", "Sewage", "Graffiti", "Other",
]

URGENT_MARKERS = [
    "urgent", "emergency", "accident", "fell", "children", "school",
    "hospital", "unsafe", "health hazard", "immediately", "today",
    "life risk", "collapse", "gir gaye", "live wire", "electrocut",
]
HIGH_MARKERS = [
    "dangerous", "huge", "massive", "giant", "deep", "crater", "choked",
    "blocked", "waterlogged", "overflowing", "unbearable", "gushing",
    "burst", "dead for", "no water", "weeks", "days", "contaminated",
]
LOW_MARKERS = ["minor", "small", "cosmetic", "suggestion", "whenever", "no rush"]
HINGLISH_MARKERS = [
    "gaddha", "nali", "kachra", "paani", "bijli", "kripya", "jaldi",
    "bhai", "deewar", "saaf", "gir gaye", "ghoomti",
]

WORD_RE = re.compile(r"[a-z]+")


def extract_features(texts: list[str]) -> csr_matrix:
    """Dense-engineering features stacked next to the TF-IDF vectors."""
    mat = np.zeros((len(texts), 8), dtype=np.float64)
    for i, t in enumerate(texts):
        low = t.lower()
        words = WORD_RE.findall(low)
        mat[i, 0] = min(len(t) / 400.0, 1.0)
        mat[i, 1] = min(t.count("!") / 5.0, 1.0)
        mat[i, 2] = sum(ch.isupper() for ch in t) / max(len(t), 1)
        mat[i, 3] = sum(1 for m in URGENT_MARKERS if m in low) / 6.0
        mat[i, 4] = sum(1 for m in HIGH_MARKERS if m in low) / 6.0
        mat[i, 5] = sum(1 for m in LOW_MARKERS if m in low) / 3.0
        mat[i, 6] = sum(1 for m in HINGLISH_MARKERS if m in low) / 3.0
        mat[i, 7] = min(t.count("?") / 4.0, 1.0)
    return csr_matrix(mat)


def make_vectorizers():
    word_tfidf = TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, 2),
        min_df=2,
        max_features=20000,
        sublinear_tf=True,
    )
    char_tfidf = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 5),
        min_df=2,
        max_features=30000,
        sublinear_tf=True,
    )
    return word_tfidf, char_tfidf


def build_matrix(vectorizers, texts: list[str], fit: bool):
    word_tfidf, char_tfidf = vectorizers
    if fit:
        w = word_tfidf.fit_transform(texts)
        c = char_tfidf.fit_transform(texts)
    else:
        w = word_tfidf.transform(texts)
        c = char_tfidf.transform(texts)
    return hstack([w, c, extract_features(texts)]).tocsr()


def train_head(X_train, y_train, seed: int):
    base = LinearSVC(C=1.0, class_weight="balanced", random_state=seed, dual="auto")
    return CalibratedClassifierCV(base, method="sigmoid", cv=3)


def evaluate(name: str, pipe, X_test, y_test, labels: list[str]) -> dict:
    pred = pipe.predict(X_test)
    proba = pipe.predict_proba(X_test)
    conf = proba.max(axis=1)
    print(f"\n=== {name} ===")
    print(classification_report(y_test, pred, labels=labels, zero_division=0))
    print(f"accuracy={accuracy_score(y_test, pred):.3f} "
          f"macro_f1={f1_score(y_test, pred, average='macro', zero_division=0):.3f} "
          f"avg_conf={conf.mean():.3f}")
    return {
        "accuracy": float(accuracy_score(y_test, pred)),
        "macro_f1": float(f1_score(y_test, pred, average="macro", zero_division=0)),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-category", type=int, default=60)
    ap.add_argument("--noise", type=int, default=40)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    t0 = time.time()
    rows = build_dataset(per_category=args.per_category, noise=args.noise, seed=args.seed)
    texts = [r["text"] for r in rows]
    y_cat = [r["category"] for r in rows]
    y_pri = [r["priority"] for r in rows]
    print(f"dataset: {len(rows)} rows "
          f"({args.per_category}/category + {args.noise} noise)")

    idx = np.arange(len(rows))
    idx_train, idx_test = train_test_split(
        idx, test_size=0.2, random_state=args.seed, stratify=y_cat
    )
    tr_texts = [texts[i] for i in idx_train]
    te_texts = [texts[i] for i in idx_test]

    vec = make_vectorizers()
    X_tr = build_matrix(vec, tr_texts, fit=True)
    X_te = build_matrix(vec, te_texts, fit=False)

    cat_head = train_head(X_tr, [y_cat[i] for i in idx_train], args.seed)
    cat_head.fit(X_tr, [y_cat[i] for i in idx_train])
    cat_metrics = evaluate(
        "category", cat_head, X_te, [y_cat[i] for i in idx_test], CATEGORIES
    )

    pri_head = train_head(X_tr, [y_pri[i] for i in idx_train], args.seed)
    pri_head.fit(X_tr, [y_pri[i] for i in idx_train])
    pri_metrics = evaluate(
        "priority", pri_head, X_te, [y_pri[i] for i in idx_test],
        ["low", "medium", "high", "urgent"],
    )

    # Refit both heads on the FULL dataset with the tuned vocabulary.
    X_full = build_matrix(vec, texts, fit=False)
    cat_full = train_head(X_full, y_cat, args.seed)
    cat_full.fit(X_full, y_cat)
    pri_full = train_head(X_full, y_pri, args.seed)
    pri_full.fit(X_full, y_pri)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    bundle_path = MODELS_DIR / "triage_bundle.joblib"
    joblib.dump(
        {
            "version": 3,
            "trained_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "n_samples": len(rows),
            "word_tfidf": vec[0],
            "char_tfidf": vec[1],
            "category_head": cat_full,
            "priority_head": pri_full,
            "categories": CATEGORIES,
            "metrics": {"category": cat_metrics, "priority": pri_metrics},
        },
        bundle_path,
    )
    print(f"\nsaved -> {bundle_path} ({bundle_path.stat().st_size / 1024:.0f} KB) "
          f"in {time.time() - t0:.1f}s")
    print(json.dumps({"category": cat_metrics, "priority": pri_metrics}))


if __name__ == "__main__":
    main()
