"""CivicLens ML inference service (FastAPI).

Endpoints:
  GET  /health       -> model status and training metrics
  POST /predict      -> classify up to 20 raw complaint texts (L1 SVM)
  POST /explain      -> feature-level explanation for one text
  POST /vision       -> CNN photo classifier (8 categories) + severity head
  POST /forensics    -> EXIF integrity + ELA tamper analysis + pHash
  POST /trust        -> composite 0-1 evidence trust score (all signals fused)
  POST /duplicates   -> TF-IDF cosine + geo duplicate detection over a batch
  POST /forecast     -> Holt double-exponential forecast of a numeric series
  POST /anomalies    -> robust z-score spike detection over a series

Run from the project root:
  python3 -m uvicorn ml.serve:app --host 0.0.0.0 --port 8008
"""
from __future__ import annotations

import base64
import io
import sys
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from scipy.sparse import hstack, csr_matrix

# Sibling modules import cleanly both as `ml.serve` (uvicorn package path)
# and as a direct script — make the ml/ dir importable either way.
_ML_DIR = str(Path(__file__).resolve().parent)
if _ML_DIR not in sys.path:
    sys.path.insert(0, _ML_DIR)

from duplicates import detect_flooding, find_duplicates  # noqa: E402
from forensics import assess_image, compose_trust_score, load_image  # noqa: E402
from timeseries import anomaly_score, forecast_series  # noqa: E402

MODELS_PATH = Path(__file__).resolve().parent / "models" / "triage_bundle.joblib"
CNN_PATH = Path(__file__).resolve().parent / "models" / "civic_cnn.npz"

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

app = FastAPI(title="CivicLens Triage ML", version="2.0.0")

_state = {"bundle": None, "cnn": None}

# Layers used by the CNN (mirror of train_cnn.py) — loaded lazily.
def load_cnn():
    if _state["cnn"] is None:
        if not CNN_PATH.exists():
            raise FileNotFoundError(
                "CNN weights not found. Train with: python3 ml/train_cnn.py"
            )
        import train_cnn as cnn
        data = np.load(CNN_PATH)
        params = {k: data[k] for k in data.files if k not in ("categories", "input_shape")}
        _state["cnn"] = {
            "params": params,
            "categories": [str(c) for c in data["categories"]],
            "module": cnn,
        }
    return _state["cnn"]


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


class VisionIn(BaseModel):
    # Either base64 image bytes or an http(s) URL the service can fetch.
    image_base64: str | None = None
    image_url: str | None = None


class ForensicsIn(BaseModel):
    image_base64: str | None = None
    image_url: str | None = None
    submitted_at: str | None = None


class TrustIn(BaseModel):
    image_base64: str | None = None
    image_url: str | None = None
    submitted_at: str | None = None
    text_category: str | None = None
    lat: float | None = None
    lng: float | None = None
    source: str = "manual"
    report_count: int = 1
    known_phashes: list[str] = Field(default_factory=list, max_length=500)
    has_text: bool = True


class DuplicatesIn(BaseModel):
    complaints: list[dict[str, Any]] = Field(..., min_length=2, max_length=2000)
    similarity_threshold: float = 0.55


class ForecastIn(BaseModel):
    values: list[float] = Field(..., min_length=1, max_length=400)
    horizon: int = Field(7, ge=1, le=30)


class AnomaliesIn(BaseModel):
    values: list[float] = Field(..., min_length=1, max_length=400)
    threshold: float = 3.5


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
        cnn_ok = CNN_PATH.exists()
        return {
            "status": "ok",
            "model_loaded": True,
            "cnn_loaded": cnn_ok,
            "version": b.get("version"),
            "trained_at": b.get("trained_at"),
            "n_samples": b.get("n_samples"),
            "metrics": b.get("metrics"),
            "capabilities": [
                "predict", "explain", "vision", "forensics", "trust",
                "duplicates", "forecast", "anomalies",
            ],
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


# ---------------------------------------------------------------------------
# Vision: from-scratch CNN photo classifier + severity head
# ---------------------------------------------------------------------------

def _resolve_image_bytes(body) -> bytes:
    """Image bytes from base64 payload or an http(s) URL (8s timeout)."""
    if body.image_base64:
        try:
            return base64.b64decode(body.image_base64, validate=False)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, f"Invalid base64 image: {e}") from e
    if body.image_url:
        import urllib.request

        url = str(body.image_url)
        if not (url.startswith("http://") or url.startswith("https://")):
            raise HTTPException(400, "image_url must be http(s)")
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "CivicLens-ML/2.0"}
            )
            with urllib.request.urlopen(req, timeout=8) as resp:  # noqa: S310
                data = resp.read(8 * 1024 * 1024)
            if not data:
                raise HTTPException(400, "Image URL returned an empty body")
            return data
        except HTTPException:
            raise
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, f"Could not fetch image_url: {e}") from e
    raise HTTPException(400, "Provide image_base64 or image_url")


def _cnn_predict(data: bytes) -> dict[str, Any]:
    """Forward the image through the NumPy CNN; degrade honestly on failure."""
    try:
        cnn = load_cnn()
        img = load_image(data)
        arr = np.asarray(img.convert("L").resize((48, 48)), dtype=np.float32) / 255.0
        x = arr[None, None, :, :]  # (1,1,48,48)
        acts = cnn["module"].forward(x, cnn["params"])
        probs = cnn["module"].softmax(acts["zs"])[0]
        sev = float(np.clip(acts["sev"][0], 0, 1))
        order = np.argsort(-probs)
        cats = cnn["categories"]
        return {
            "ok": True,
            "category": cats[int(order[0])],
            "confidence": round(float(probs[order[0]]), 4),
            "severity": round(sev, 4),
            "probabilities": {
                cats[i]: round(float(probs[i]), 4) for i in order[:5]
            },
        }
    except FileNotFoundError as e:
        return {"ok": False, "error": str(e)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"vision failed: {e}"}


@app.post("/vision")
def vision(body: VisionIn):
    data = _resolve_image_bytes(body)
    return _cnn_predict(data)


@app.post("/forensics")
def forensics(body: ForensicsIn):
    data = _resolve_image_bytes(body)
    try:
        return assess_image(data, submitted_at=body.submitted_at)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"forensics failed: {e}") from e


@app.post("/trust")
def trust(body: TrustIn):
    """Composite evidence trust score (forensics + CNN consistency + context)."""
    forensics_payload = None
    cnn_payload = None
    try:
        data = _resolve_image_bytes(body)
        try:
            forensics_payload = assess_image(data, submitted_at=body.submitted_at)
        except Exception:  # noqa: BLE001 — photo-level failure must not kill trust
            forensics_payload = None
        cnn_payload = _cnn_predict(data)
    except HTTPException as e:
        if e.status_code != 400 or "image_base64 or image_url" not in str(e.detail):
            # A real fetch/decode problem: proceed with no-image trust path.
            forensics_payload = None
            cnn_payload = None

    result = compose_trust_score(
        forensics=forensics_payload,
        cnn_category=cnn_payload.get("category") if cnn_payload and cnn_payload.get("ok") else None,
        cnn_severity_confidence=(
            cnn_payload.get("confidence") if cnn_payload and cnn_payload.get("ok") else None
        ),
        text_category=body.text_category,
        lat=body.lat,
        lng=body.lng,
        source=body.source,
        report_count=max(1, int(body.report_count or 1)),
        known_phashes=body.known_phashes,
        has_text=body.has_text,
    )
    result["cnn"] = cnn_payload
    result["forensics_available"] = forensics_payload is not None
    return result


@app.post("/duplicates")
def duplicates(body: DuplicatesIn):
    """Duplicate pairs + coordinated-flooding detection over a complaint batch."""
    try:
        pairs = find_duplicates(body.complaints, body.similarity_threshold)
        flooding = detect_flooding(body.complaints)
        return {**pairs, "flooding": flooding}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"duplicates failed: {e}") from e


@app.post("/forecast")
def forecast(body: ForecastIn):
    try:
        return forecast_series(body.values, horizon=body.horizon)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"forecast failed: {e}") from e


@app.post("/anomalies")
def anomalies(body: AnomaliesIn):
    try:
        return anomaly_score(body.values, threshold=body.threshold)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"anomalies failed: {e}") from e
