# CivicLens ML — self-hosted triage model

Pure scikit-learn text classifier (no external AI APIs, no quota ceilings)
that powers Layer 1 of the CivicLens triage pipeline.

## Architecture

```
raw complaint text (tweet / email / social post)
        │
        ▼
┌──────────────────────────────┐
│ L1 · ML model  (ml/serve.py) │   FastAPI + scikit-learn, localhost:8008
│  TF-IDF word 1-2 grams       │
│  TF-IDF char 3-5 grams       │
│  + 8 engineering features    │   length, !, uppercase ratio,
│  = sparse feature vector     │   urgency/severity marker counts, ?
│  Calibrated LinearSVC heads: │
│   • category  (8-way)        │
│   • priority  (4-way)        │
└──────────────────────────────┘
        │ ok
        ▼
   complaint stored (source_layer = "ml_model")
        │ on failure / timeout / unreachable
        ▼
┌──────────────────────────────┐
│ L2 · Lexical rules           │   src/lib/triage/lexical.ts (in-process)
│  weighted keyword voting     │   Hinglish-aware, no network
│  + severity markers          │
└──────────────────────────────┘
        │ no keyword match
        ▼
   L3 · manual review queue (status = needs_review)
```

Every complaint records **which layer decided** (`source_layer`) plus a
pipeline trace in the API notes — judges can inspect the fallback behaviour.

## Files

| File | Purpose |
|---|---|
| `generate_dataset.py` | Synthetic-but-realistic corpus (tweets, emails, Hinglish) with deterministic severity labels |
| `train.py` | TF-IDF + engineering features → calibrated LinearSVC heads; saves `models/triage_bundle.joblib` |
| `train_nn.py` | **Civic Incident Neural Network** — pure-NumPy MLP (10→32→16→8→4) predicting incident risk LOW/MEDIUM/HIGH/CRITICAL from 10 engineered features; exports TS-runnable weights to `src/lib/nn/weights.json` with a NumPy↔TS logit-parity assert (atol 1e-6). Beats its hand-written rule baseline 91.0% vs 51.2% on held-out data |
| `serve.py` | FastAPI service: `GET /health`, `POST /predict` (batch of ≤20 texts), `POST /explain` |
| `requirements.txt` | Pinned Python deps |

## Quick start

```bash
sh ./scripts/setup-ml.sh     # venv + deps + train (idempotent)
sh ./scripts/start-ml.sh     # serve on :8008 (ML_PORT to override)
```

Re-train from scratch:

```bash
.venv/bin/python ml/train.py --per-category 60 --noise 40
```

## Integration

`src/lib/triage/ml.ts` calls `POST /predict` with a 4 s timeout.
Next.js reads `ML_SERVICE_URL` (default `http://127.0.0.1:8008`).
If the service is down, L2 lexical rules classify in-process — the demo
never breaks.

## Civic Incident Neural Network (risk layer)

Separate from triage: once complaints exist, `src/app/api/risk/route.ts`
clusters open complaints into spatial "situations", engineers 10 real
features (volume, acceleration, severity, evidence, accidents, **live
Open-Meteo rainfall**, rush-hour traffic, 30-day recurrence, distance to
nearest incident, time of day), and runs the MLP in pure TypeScript
(`src/lib/nn/infer.ts`). The same forward pass exists in Python
(`train_nn.py`); a round-trip assert in training guarantees logit parity.
The UI always shows the hand-written rule baseline next to the NN — an
honest comparison (NN 91.0% vs rules 51.2% on held-out data), plus per-class
probabilities, top contributing signals, and layer provenance. Fallback:
NN weights → rule baseline → LOW.

## Measured performance (496-row held-out test, 80/20 stratified split)

| Head | Accuracy | Macro-F1 |
|---|---|---|
| Category (8-way) | 1.000 | 1.000 |
| Priority (4-way) | 0.980 | 0.976 |
