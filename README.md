# CivicLens — AI civic complaint triage

**Smarter Cities · Happier Citizens.** Classify, prioritize and route civic
complaints (potholes, drainage, waste, water, streetlights, sewage, graffiti)
from raw text *and images* — with a multi-layer fallback pipeline that never
throws, a from-scratch neural risk engine, image forensics, and a live map /
3D digital twin.

No external AI APIs, no quota ceilings: every model is self-hosted or runs
in-process. **Everything ships in Docker — the full ML stack runs anywhere
with one command.**

## Architecture (all layers degrade gracefully)

```
raw signals (tweets, emails, WhatsApp, news, voice, manual)
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
│ FIELD OPS     officer dispatch → crew claims → proof → verify│
│               (+ Civic Karma for citizens at every step)     │
├──────────────────────────────────────────────────────────────┤
│ CORPUS INSIGHTS  duplicates · flooding · forecast · spikes   │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
Postgres → live Leaflet map · 3D digital twin · SLA clocks · public tracking
```

Every record stores **which layer decided** (`source_layer`, `vision_source`)
plus a pipeline trace — fully inspectable in the UI.

## Product pages

| Page | What it does |
|---|---|
| `/` Overview | Triage queue, ingest (text/voice/bulk), detail panel with explainability |
| `/quick` **Snap & Send** | 10-second report: camera → GPS auto-fill → voice note → one-tap dispatch |
| `/map` Live map | Leaflet map + 3D civic digital twin |
| `/risk` Risk engine | Civic Incident NN with live activations, NN-vs-rules comparison |
| `/radar` **Monsoon radar** | Rain-sensitive clusters × live Open-Meteo rainfall → flood watch |
| `/insights` Insights | Duplicates, coordinated-flooding alarms, forecast, SLA/dept analytics |
| `/karma` **Civic Karma** | Citizen reward points, tiers (Rookie → Civic Legend), public ledger |
| `/representatives` **Nagarsevak directory** | Ward corporators with response metrics + WhatsApp escalation |
| `/worker` **Field crew portal** | Claim tasks, submit before/after resolution proof |
| `/officer` **Officer portal** | Auto-dispatch crews, verify proofs, demand rework |
| `/track` **Track a ticket** | Public no-login lifecycle view (filed → verified) |
| `/channels` Channels | WhatsApp / X / News simulation through the real pipeline |
| `/help` **Help & FAQ** | Searchable answers about triage, SLA, karma |
| `/search` + **⌘K palette** | Global ticket & page search |

## The ML (all from scratch, all reproducible)

**City: BMC / Mumbai.** The triage corpus is now led by the BMC/Mumbai dataset
(`ml/bmc_data.py`) — T1: drop a real MCGM export at `ml/data/bmc_manual.csv`
(the 1.2M-record Kaggle corpus works as-is); T2: data.gov.in CKAN probe
(auto-adopts future BMC publications); T3: BMC-realistic Mumbai corpus with
Hinglish/MCGM vocabulary. Retrain everything with **`sh ./scripts/train-bmc.sh`**.

| Model | File | What it does | Measured |
|---|---|---|---|
| Triage SVM | `ml/train.py` | TF-IDF (word+char) + engineered features → calibrated LinearSVC heads for category (8-way) and priority (4-way); trains on **BMC/Mumbai corpus** + real 311 + synthetic | see `ml/models/triage_metrics.json` after retrain |
| Risk NN | `ml/train_nn.py` | 10→64→32→16→4 MLP (NumPy) trained with **Adam + cosine LR + label smoothing + L2 + dropout + class-balanced CE**; exports TS-runnable weights with a parity assert | 0.897 acc / 0.828 F1 (vs 0.523 rule baseline) |
| Photo CNN | `ml/train_cnn.py` | 3-conv NumPy CNN (12/24/32 filters) classifying photos into the 8 categories + a severity head; runs in TS too (`src/lib/vision/cnn.ts`) | 0.908 acc / 0.896 F1, severity MAE 0.23 |
| Forensics | `ml/forensics.py` | EXIF integrity (camera/GPS/timestamp/editor tags), Error-Level Analysis (JPEG re-encode diff), 64-bit DCT pHash | — |
| Trust fusion | `ml/forensics.py` | Weighted 0–1 evidence trust score with hard caps on reused/edited photos | — |
| Duplicates | `ml/duplicates.py` | From-scratch TF-IDF cosine + haversine geo factor; coordinated-flooding detector | — |
| Forecast | `ml/timeseries.py` | Holt double-exponential smoothing + robust z-score spike detection | — |

Untrusted evidence (< 0.3 trust) is auto-routed to `needs_review` — the trust
gate is a first-class routing rule, not a decoration.

## Field-ops lifecycle (worker → proof → verified)

```
open ──officer/auto──▶ assigned ──crew──▶ resolved(proof) ──officer──▶ verified
  ▲                                                    │
  └────────────────── reject → rework ◀────────────────┘
```

- **Auto-dispatch** matches the complaint's department and picks the
  least-loaded crew member.
- **Proof** = after-photo + work notes (timestamped, visible to citizens).
- **Verification** closes the loop; rejection sends it back with history kept.
- **Civic Karma** rewards citizens at every step (+10 report, +5 photo,
  +20 verified resolution, +2 co-sign). Five co-signatures escalate priority.

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

## Run the full AI stack anywhere (Docker)

```bash
# Everything (web + ML + Postgres):
docker compose up --build          # → http://localhost:3000

# Or single image (web + ML in one container, external DB):
docker build -t civiclens .
docker run -p 3000:3000 -e DATABASE_URL=postgres://... civiclens

# Or just the ML service (trains all models on build):
docker build -t civiclens-ml -f ml/Dockerfile .
docker run -p 8008:8008 civiclens-ml
```

The ML image trains the triage SVM, risk NN and photo CNN during the build —
no host Python, no venv, no manual steps. Models are cached in the
`mlmodels` volume so restarts are instant.

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/triage` | Ingest raw text (+optional image) → classify, prioritize, route, analyze evidence, geocode |
| `POST /api/assign` | Officer/auto dispatch → least-loaded matching crew (`GET` = open pool) |
| `POST /api/resolve` | Field-crew resolution proof (after-photo + notes) |
| `POST /api/verify` | Officer sign-off, or reject → rework |
| `POST /api/cosign` | Community petition pressure (+1, auto-escalates at 5) |
| `GET /api/karma` | Civic Karma leaderboard + public ledger |
| `GET /api/track?id=N` | Public ticket lifecycle lookup (no auth) |
| `GET /api/search?q=` | Global ticket search (⌘K palette) |
| `GET /api/risk` | Spatial clusters → NN risk predictions with rule-baseline comparison |
| `GET /api/insights` | Duplicate pairs, flood alarms, 7-day volume forecast, spike anomalies |
| `POST /api/explain` | Feature-level explanation of a triage decision |
| `GET /api/health` | Env key presence + ML/vision layer status |
| `GET /api/export` | CSV export of the full triage log |

Python ML service (FastAPI, :8008): `/predict` `/explain` `/vision`
`/forensics` `/trust` `/duplicates` `/forecast` `/anomalies` `/health`.

## Standalone React site (GitHub Pages — the ZIP deliverable)

Hosted static sites can't run the Python/Docker ML stack, so `site/` is a
self-contained **Vite + React 18 + Tailwind** website: the nagarsevak /
ward-governance experience with an Anime.js + scroll-tide visual language
(deliberately different UI from this dashboard).

- Triage runs **client-side** via the distilled BMC lexicon
  (`site/src/lib/data/triage_lexicon.json`, regenerated by the retrain script).
- Pages: home, nagarsevak directory + ward profiles, report (live triage
  preview), track (lifecycle + SLA), karma.
- Package it: **`sh ./scripts/build-site-zip.sh`** → `civiclens-react-ui.zip`
  (sources + built `dist/`, relative base so it works on any static host).
- GitHub Pages: push the repo → Settings → Pages → Source: **GitHub Actions**
  (`.github/workflows/deploy-site-pages.yml` builds and publishes `site/dist`).
- Preview locally in this workspace: `/site-preview.html` (redirect) or
  `/site-ui/index.html`.

See `ml/README.md` for model details and `DEPLOYMENT.md` for deploy/CI/mobile.
