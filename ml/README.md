# CivicLens ML — self-hosted models

Every model is trained and served locally (no external AI APIs, no quota
ceilings). All inference degrades gracefully: if the Python service is
unreachable, TypeScript fallbacks take over — the app never breaks.

## Architecture

```
raw complaint text (tweet / email / social post)   evidence photo (optional)
        │                                                 │
        ▼                                                 ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ L1 · Triage SVM (train.py)   │   │ V1 · Vision service          │
│  TF-IDF word 1-2 + char 3-5  │   │  CNN (train_cnn.py) → 8-way  │
│  + 8 engineering features    │   │   category + severity head   │
│  Calibrated LinearSVC heads: │   │  forensics.py: EXIF integrity│
│   • category  (8-way)        │   │   + ELA tamper + DCT pHash   │
│   • priority  (4-way)        │   │  → composite 0-1 TRUST score │
└──────────────────────────────┘   └──────────────────────────────┘
        │ ok                              │ ok
        ▼                                 ▼
   complaint stored (source_layer)   trust stored (trust_score/band/
        │ on unreachable              flags/phash, vision_source)
        ▼                                 │ on unreachable
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ L2 · Lexical rules           │   │ V2 · TS fallbacks            │
│  src/lib/triage/lexical.ts   │   │  src/lib/vision/cnn.ts       │
│  in-process, no network      │   │  src/lib/vision/forensics.ts │
└──────────────────────────────┘   │  (same weights & algorithms) │
        │ no keyword match         └──────────────────────────────┘
        ▼
   L3 · manual review (needs_review)
```

**Trust gate:** evidence scoring `untrusted` (< 0.3) auto-routes the complaint
to the manual-review queue — trust is a routing rule, not a decoration.

## Files

| File | Purpose |
|---|---|
| `generate_dataset.py` | Synthetic-but-realistic text corpus (tweets, emails, Hinglish) with deterministic severity labels |
| `train.py` | TF-IDF + engineering features → calibrated LinearSVC heads; saves `models/triage_bundle.joblib` |
| `train_nn.py` | **Civic Incident Neural Network** — NumPy MLP (10→32→16→8→4) trained with **Adam + L2 + dropout + early stopping + class-balanced CE**; predicts incident risk from 10 engineered features; exports TS weights to `src/lib/nn/weights.json` with a NumPy↔TS parity assert. Held-out: 0.911 acc / 0.761 F1 vs 0.512 rule baseline |
| `sweep_nn.py` | Hyperparameter sweep (lr × dropout × L2) for the risk NN |
| `cnn_data.py` | Procedural photo generator — 8 category visual signatures + severity signal |
| `train_cnn.py` | **From-scratch NumPy CNN** (Conv 8/16/24 → Dense 64 → 8-way softmax + severity head, hand-written backprop) classifying evidence photos; 0.78 acc, severity MAE 0.20 |
| `export_cnn_ts.py` | Exports CNN weights to `src/lib/vision/cnn_weights.json` + generates a NumPy↔TS parity probe |
| `forensics.py` | EXIF integrity (camera/timestamp/GPS/editor tags), **Error-Level Analysis** (JPEG q90 re-encode diff), 64-bit **DCT pHash**, and `compose_trust_score()` — weighted fusion of forensics 0.35 · image↔text consistency 0.20 · geo 0.15 · crowd 0.15 · source 0.10 · duplicate 0.05 with hard caps on reused/edited photos |
| `duplicates.py` | From-scratch TF-IDF cosine + haversine duplicate detection + coordinated-flooding detector |
| `timeseries.py` | Holt double-exponential smoothing (α/β grid search, prediction bands) + robust z-score (median/MAD) spike detection |
| `serve.py` | FastAPI: `/health` `/predict` `/explain` `/vision` `/forensics` `/trust` `/duplicates` `/forecast` `/anomalies` |
| `requirements.txt` | Pinned Python deps (scikit-learn, NumPy, SciPy, Pillow, FastAPI) |

## Quick start

```bash
sh ./scripts/setup-ml.sh     # venv + deps + train (idempotent)
sh ./scripts/start-ml.sh     # serve on :8008 (ML_PORT to override)
```

Re-train everything from scratch:

```bash
.venv/bin/python ml/train.py        # triage SVM
.venv/bin/python ml/train_nn.py     # risk NN (+ refreshes src/lib/nn/weights.json)
.venv/bin/python ml/train_cnn.py    # photo CNN
.venv/bin/python ml/export_cnn_ts.py  # refresh src/lib/vision/cnn_weights.json
```

## TypeScript inference parity

- Risk NN: `src/lib/nn/infer.ts` — weights JSON regenerated on every
  `train_nn.py` run; forward pass asserted equal to NumPy (atol 1e-6).
- Photo CNN: `src/lib/vision/cnn.ts` — weights JSON from `export_cnn_ts.py`;
  a parity probe (`ml/models/cnn_ts_probe.json`) pins the expected softmax
  output for `default_rng(123).random((1,1,48,48))`.
- Forensics: `src/lib/vision/forensics.ts` mirrors EXIF assessment, pHash and
  block-error analysis; the Python service remains the authority for true
  JPEG-re-encode ELA.
- Trust: `composeTrustJs` mirrors `compose_trust_score` component weights.

## Integration

- `src/lib/triage/ml.ts` → `POST /predict` (4 s timeout) for text triage.
- `src/lib/vision/index.ts` → `POST /trust` (6 s timeout) for evidence
  analysis; falls back to fully local TS decode (jpeg-js) + CNN + forensics.
- `src/app/api/insights/route.ts` → `/duplicates` `/forecast` `/anomalies`.
- Next.js reads `ML_SERVICE_URL` (default `http://127.0.0.1:8008`).

## Measured performance

| Head / Model | Accuracy | Macro-F1 | Note |
|---|---|---|---|
| Triage category (8-way) | 1.000 | 1.000 | held-out, synthetic corpus |
| Triage priority (4-way) | 0.940 | 0.938 | held-out |
| Risk NN (4-way) | 0.911 | 0.761 | Adam+L2+dropout+early-stop, class-balanced |
| Rule baseline (risk) | 0.512 | — | honest "before" for the NN |
| Photo CNN (8-way) | 0.785 | 0.770 | procedural photos, severity MAE 0.20 |

These are pipeline-validation numbers on self-generated data — they prove the
training/serving/fallback machinery works end-to-end; real-world accuracy
needs a labeled civic dataset.
