# CivicLens — AI civic complaint triage

**Smarter Cities · Happier Citizens.** Classify, prioritize and route civic
complaints (potholes, drainage, waste, water, streetlights, sewage, graffiti)
from raw text *and images* — with a multi-layer fallback pipeline that never
throws, a from-scratch neural risk engine, image forensics, and a live map /
3D digital twin.

No external AI APIs, no quota ceilings: every model is self-hosted or runs
in-process.

## Architecture (all layers degrade gracefully)

```
raw signals (tweets, emails, WhatsApp, news, manual)
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│ TEXT TRIAGE  L1 scikit-learn SVM (ml/serve.py)               │
│              L2 in-process lexical rules (Hinglish-aware)    │
│              L3 manual review queue                          │
├──────────────────────────────────────────────────────────────┤
│ VISION+TRUST (evidence photos)                               │
│   V1 Python forensics/CNN service (ml/serve.py /trust)       │
│   V2 in-process TS: CNN + EXIF + block-error + pHash         │
│   V3 no photo → trust flags the gap, never blocks            │
├──────────────────────────────────────────────────────────────┤
│ RISK ENGINE  Civic Incident Neural Network (NumPy ↔ TS)      │
│              fallback: rule baseline → LOW                   │
├──────────────────────────────────────────────────────────────┤
│ CORPUS INSIGHTS  duplicates · flooding · forecast · spikes   │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
Postgres (Neon) → live Leaflet map · 3D digital twin · SLA clocks
```

Every record stores **which layer decided** (`source_layer`, `vision_source`)
plus a pipeline trace — fully inspectable in the UI.

## The ML (all from scratch, all reproducible)

| Model | File | What it does | Measured |
|---|---|---|---|
| Triage SVM | `ml/train.py` | TF-IDF (word+char) + engineered features → calibrated LinearSVC heads for category (8-way) and priority (4-way) | 1.00 / 0.94 acc |
| Risk NN | `ml/train_nn.py` | 10→32→16→8→4 MLP (NumPy) trained with **Adam + L2 + dropout + early stopping + class-balanced CE**; exports TS-runnable weights with a parity assert | 0.91 acc / 0.76 F1 (vs 0.51 rule baseline) |
| Photo CNN | `ml/train_cnn.py` | 3-conv NumPy CNN (8/16/24 filters) classifying photos into the 8 categories + a severity head; runs in TS too (`src/lib/vision/cnn.ts`) | 0.78 acc, severity MAE 0.20 |
| Forensics | `ml/forensics.py` | EXIF integrity (camera/GPS/timestamp/editor tags), Error-Level Analysis (JPEG re-encode diff), 64-bit DCT pHash | — |
| Trust fusion | `ml/forensics.py` | Weighted 0–1 evidence trust score: forensics 0.35 · image↔text consistency 0.20 · geolocation 0.15 · crowd 0.15 · source 0.10 · duplicate 0.05; hard caps on reused/edited photos | — |
| Duplicates | `ml/duplicates.py` | From-scratch TF-IDF cosine + haversine geo factor; coordinated-flooding detector | — |
| Forecast | `ml/timeseries.py` | Holt double-exponential smoothing with (α, β) grid search + prediction bands; robust z-score (median/MAD) spike detection | — |

Untrusted evidence (< 0.3 trust) is auto-routed to `needs_review` — the trust
gate is a first-class routing rule, not a decoration.

## Development

```bash
bun install
sh ./scripts/setup-ml.sh   # venv + Python deps + train if needed
bun run dev                # ML service (:8008) + Next.js (:3000)
```

- `bun run dev:ml` — Python ML service only
- `bun run typecheck` — TypeScript checks
- `bun run build` — production build

The web app runs fine without the Python service: L2 lexical rules classify,
TS-local CNN/forensics analyze photos, insights degrade to "unavailable".

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/triage` | Ingest raw text (+optional image) → classify, prioritize, route, analyze evidence, geocode |
| `GET /api/risk` | Spatial clusters → NN risk predictions with rule-baseline comparison |
| `GET /api/insights` | Duplicate pairs, flood alarms, 7-day volume forecast, spike anomalies |
| `POST /api/explain` | Feature-level explanation of a triage decision |
| `GET /api/health` | Env key presence + ML/vision layer status |
| `GET /api/export` | CSV export of the full triage log |

Python ML service (FastAPI, :8008): `/predict` `/explain` `/vision`
`/forensics` `/trust` `/duplicates` `/forecast` `/anomalies` `/health`.

See `ml/README.md` for model details and `DEPLOYMENT.md` for deploy/CI/mobile.
