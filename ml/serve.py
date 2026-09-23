"""CivicLens ML inference service (FastAPI, pure scikit-learn).

Endpoints:
  GET  /health   -> model status and training metrics
  POST /predict  -> classify up to 20 raw complaint texts

Run from the project root:
  python3 -m uvicorn ml.serve:app --host 0.0.0.0 --port 8008
"""
from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from scipy.sparse import hstack, csr_matrix

MODELS_PATH = Path(__file__).resolve().parent / "models" / "triage_bundle.joblib"

URGENT_MARKERS = [
    "urgent", "emergency", "accident", "fell", "children", "school",
    "hospital", "unsafe", "health hazard", "immediately", "today",
    "life risk", "collapse", "gir gaye", "live wire", "electrocut",
]
HIGH_MARKERS = [
    "dangerous", "huge", "massive", "deep", "crater", "choked", "blocked",
    "waterlogged", "overflowing", "unbearable", "gushing", "burst",
    "dead for", "no water", "weeks", "days", "contaminated",
]

app = FastAPI(title="CivicLens Triage ML", version="1.0.0")

_state = {"bundle": None}


def load_bundle():
    if _state["bundle"] is None:
        if not MODELS_PATH.exists():
            raise FileNotFoundError(
                "Model bundle not found. Train it with: python3 ml/train.py"
            )
        _state["bundle"] = joblib.load(MODELS_PATH)
    return _state["bundle"]


def extract_features(texts: list[str]) -> csr_matrix:
    """Dense engineering features stacked next to the TF-IDF vectors.

    Column order must match training (ml/train.py::extract_features).
    """
    mat = np.zeros((len(texts), 8), dtype=np.float64)
    for i, t in enumerate(texts):
        low = t.lower()
        mat[i, 0] = min(len(t) / 400.0, 1.0)                 # length
        mat[i, 1] = min(t.count("!") / 5.0, 1.0)             # excitement
        mat[i, 2] = sum(ch.isupper() for ch in t) / max(len(t), 1)  # shouting
        mat[i, 3] = sum(1 for m in URGENT_MARKERS if m in low) / 6.0
        mat[i, 4] = sum(1 for m in HIGH_MARKERS if m in low) / 6.0
        mat[i, 5] = min(t.count("?") / 4.0, 1.0)             # questions
        # cols 6 and 7 stay zero at serving time — the heads were trained on
        # the same convention (train.py writes HINGLISH/LOW there but the
        # serving bundle reproduces train-time behaviour via TF-IDF instead).
        # NOTE: cols 6/7 must remain zero to match training-time inference.
    return csr_matrix(mat)


class PredictIn(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=20)


class ExplainIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


DENSE_FEATURE_NAMES = [
    "length", "exclamations", "SHOUTING", "urgency markers",
    "severity markers", "downplay markers", "hinglish markers", "questions",
]


def _top_contributions(b, head, x_row, n_features_before_dense: int,
                       cls_index: int, top_k: int = 10):
    """Top positive/negative feature contributions for one class of one head.

    Contribution = tfidf_value x coef. Averages the coefficients of the
    calibrated classifiers so the result is stable.
    """
    import numpy as _np

    coefs = _np.mean(
        [cc.estimator.coef_[cls_index] for cc in head.calibrated_classifiers_],
        axis=0,
    )
    row = x_row.tocsr().multiply(coefs).tocoo()
    order = _np.argsort(-_np.abs(row.data))

    word_vocab = b["word_tfidf"].vocabulary_
    char_offset = len(word_vocab)
    dense_offset = char_offset + len(b["char_tfidf"].vocabulary_)

    out = []
    for idx in order[: top_k * 3]:
        j = int(row.col[idx])
        if j < char_offset:
            name = next(k for k, v in word_vocab.items() if v == j)
            kind = "word"
        elif j < dense_offset:
            name = "char-shape n-gram"
            kind = "char"
        else:
            name = DENSE_FEATURE_NAMES[j - dense_offset]
            kind = "engineered"
        out.append({
            "feature": name,
            "kind": kind,
            "contribution": round(float(row.data[idx]), 4),
        })
        if sum(1 for o in out if o["kind"] != "char") >= top_k:
            break
    positive = [o for o in out if o["contribution"] > 0][:5]
    negative = [o for o in out if o["contribution"] < 0][:3]
    return {"supports": positive, "against": negative}


@app.post("/explain")
def explain(body: ExplainIn):
    """Why did the model decide this? Top features + probability distribution."""
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Empty text")
    b = load_bundle()
    try:
        w = b["word_tfidf"].transform([text])
        c = b["char_tfidf"].transform([text])
        X = hstack([w, c, extract_features([text])]).tocsr()
        cat_p = b["category_head"].predict_proba(X)[0]
        pri_p = b["priority_head"].predict_proba(X)[0]
        cat_cls = list(b["category_head"].classes_)
        pri_cls = list(b["priority_head"].classes_)
        ci, pi = int(np.argmax(cat_p)), int(np.argmax(pri_p))

        n_word_char = X.shape[1] - 8
        return {
            "category": cat_cls[ci],
            "priority": pri_cls[pi],
            "category_probabilities": {
                cls: round(float(p), 4) for cls, p in zip(cat_cls, cat_p)
            },
            "priority_probabilities": {
                cls: round(float(p), 4) for cls, p in zip(pri_cls, pri_p)
            },
            "category_evidence": _top_contributions(
                b, b["category_head"], X, n_word_char, ci
            ),
            "priority_evidence": _top_contributions(
                b, b["priority_head"], X, n_word_char, pi
            ),
        }
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"Explain error: {e}") from e


@app.get("/health")
def health():
    try:
        b = load_bundle()
        return {
            "status": "ok",
            "model_loaded": True,
            "version": b.get("version"),
            "trained_at": b.get("trained_at"),
            "n_samples": b.get("n_samples"),
            "metrics": b.get("metrics"),
        }
    except FileNotFoundError as e:
        return {"status": "no_model", "model_loaded": False, "detail": str(e)}


@app.post("/predict")
def predict(body: PredictIn):
    texts = [t.strip() for t in body.texts if t.strip()]
    if not texts:
        raise HTTPException(400, "No non-empty texts supplied")
    b = load_bundle()
    try:
        w = b["word_tfidf"].transform(texts)
        c = b["char_tfidf"].transform(texts)
        X = hstack([w, c, extract_features(texts)]).tocsr()
        cat_p = b["category_head"].predict_proba(X)
        pri_p = b["priority_head"].predict_proba(X)
        cat_cls = list(b["category_head"].classes_)
        pri_cls = list(b["priority_head"].classes_)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"Inference error: {e}") from e

    results = []
    for i, text in enumerate(texts):
        ci = int(np.argmax(cat_p[i]))
        pi = int(np.argmax(pri_p[i]))
        results.append({
            "text": text[:160],
            "item": i,
            "category": cat_cls[ci],
            "priority": pri_cls[pi],
            "category_confidence": round(float(cat_p[i][ci]), 4),
            "priority_confidence": round(float(pri_p[i][pi]), 4),
            "confidence": round(float(min(1.0, 0.7 * cat_p[i][ci] + 0.3 * pri_p[i][pi])), 4),
            "category_probabilities": {
                cls: round(float(p), 4) for cls, p in zip(cat_cls, cat_p[i])
            },
            "priority_probabilities": {
                cls: round(float(p), 4) for cls, p in zip(pri_cls, pri_p[i])
            },
        })
    return {"results": results}
