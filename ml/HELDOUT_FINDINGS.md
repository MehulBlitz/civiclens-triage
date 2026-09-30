# Held-out Evaluation — All Models on Data NOT in the Training Set

Harness: `ml/eval_heldout.py` → machine-readable results in
`ml/models/heldout_eval.json`. Run: `.venv/bin/python ml/eval_heldout.py`

Fresh data sources (zero overlap with training):
- **Text:** 38 hand-written BMC/Mumbai complaints + edge cases, phrased to avoid
  every template in `ml/bmc_data.py`, every distilled lexicon token, and the
  keyword map (`speed breaker caved in`, `safai`, `dumpster`, romanized
  Marathi, pure Devanagari, typos, ALL-CAPS, non-complaint queries).
- **Vision:** fresh-seed procedural images (seed 9021; training used seed 42)
  plus out-of-distribution stress frames (uniform gray, night, overexposed,
  pure noise, inverted-contrast pothole, corner-crop, heavy blur).
- **Risk:** fresh-seed situations (seed 777; training used 42) plus 12
  out-of-range / edge inputs (500 complaints, 6× growth, 300 mm rain, …).

---

## Scorecard

| Model | Fresh data acc | Verdict |
|---|---|---|
| L1 bundle (joblib TF-IDF + calibrated SVM) | category **0.605**, priority **0.605** (adjacent 0.947) | ❌ fragile to new vocabulary |
| Site distilled lexicon (client) | category **0.711**, priority **0.421** | ❌ same + worse priority |
| CNN (civic_cnn.npz) | **0.956** on fresh seeds (top-3 1.000), sev MAE 0.243 | ✅ robust within corpus style |
| TS client CNN (cnn_weights.json) | **8/8 category parity, Δ ≤ 1e-5** vs Python | ✅ faithful port |
| Risk NN (risk_nn.npz) | **0.893** fresh (adjacent 1.000) | ✅ smooth and well-behaved |

---

## Problem 1 — Text: vocabulary dependence is the #1 failure mode

The 0.605/0.711 numbers are the honest answer to "the BMC trained on
template/lexicon text meets how citizens actually write". Failure clusters:

1. **Unseen nouns** — `speed breaker caved in` → Streetlight (0.60!),
   `safai`, `dumpster`, `rusty brown liquid`, `toilet water coming up`,
   `inspection pit cover` → Other/Water/Waste.
2. **Sewage/Pothole lexical traps** — the letter-sequence `overflowing` was
   learned as a *Waste* cue (template co-occurrence), `night` as a
   *Streetlight* cue. Pure word-frequency, not semantics.
3. **ALL-CAPS breaks the character TF-IDF** — "URGENT: SEWAGE OVERFLOWING…"
   → Other 0.54 / Sewage 0.45. Lowercased → Sewage 0.948. Mixed-case
   tokenization in training biases word and char features.
4. **Romanized Marathi/Devanagari** — `nali jam ahe…` → Other (Drainage at the
   site layer, via the single rule keyword `nali`); pure Devanagari → nothing
   (every tokenizer strips non-ASCII) → manual layer.
5. **Priority is nearly blind** (site 0.421, always medium fallback): no
   *implied* severity understanding (`pitch dark by 7pm`,
   `elders and a newborn at home`, `rats everywhere` carry high/urgent
   meaning without any marker phrase).

## Problem 2 — CNN: style dependence + silent overconfident OOD

- Fresh-seed accuracy is 0.956 (Pothole weakest 0.85), so in-style variance is
  handled — but all training photos are **procedural drawings**
  (`ml/cnn_data.py`), not photographs.
- OOD frames are confidently wrong: night frame → Streetlight 0.96,
  overexposed → Sewage 0.84, **pure noise → Waste 0.76 (sev 1.0)**,
  **contrast-inverted pothole → Sewage 0.97**.
- No rejection mechanism: there is no `other/unknown` class and no confidence
  gate, so garbage in → confident garbage out.

## Problem 3 — Risk NN: clamped features, honest degradation

Fresh-seed accuracy 0.893, adjacent 1.000, and all 12 edge cases produce
sane outputs. Caveat: the TS client (`src/lib/nn/features.ts`) mirrors
`np.minimum` clamps, so out-of-range values (6× growth, 50 historical
incidents, 300 mm rain) silently saturate instead of erroring — acceptable,
but worth knowing. `torrential_rain_300mm → MEDIUM` (conf 0.79) is the only
soft spot: 300 mm clamps to the same "50 mm max" bucket the model ever saw.

**Cross-check passed:** TS↔Python CNN parity on held-out images is exact to
1e-5 — the client inference layer is not a source of error.

---

## What the client must put in so each model can detect

### Text → `/api/explain` / `ml.serve` `POST /predict` (L1)

| Field | Requirement | Why |
|---|---|---|
| `text` | **required, ≥ 25 chars**, a real sentence about the problem | below ~25 chars the char-TFIDF signal drowns and results degrade to priors ("overflowing" alone → Waste 0.88) |
| casing | **mixed or lower case**; do not SHOUT | ALL-CAPS measurably breaks char features (Sewage case) |
| language | English or Hinglish (latin script) with **at least one concrete civic noun** (`pothole`, `nali`, `gaddha`, `drain`, `garbage`, `kachra`, `streetlight`, `manhole`, `water supply`, `sewage`…) | the vocabulary IS the model; synonyms it never saw (`safai`, `dumpster`) fall to Other/manual |
| avoid | file numbers, only URLs, pure Marathi/Devanagari (currently unsupported) | tokenizer strips non-latin; no lexicon hits → manual review |
| urgency words | include them explicitly (`urgent`, `accident`, `child`, `hospital`, `immediately`, `live wire`, `overflowing`, `no water for days`) | priority head is marker-driven; implied severity ("rats everywhere") is not understood |

Minimum viable text example the model detects reliably:
> "Deep pothole near the bus stop on S V Road, Andheri West — water collects
> every evening and two-wheelers skid. Urgent, please repair before monsoon."

### Vision → `POST /vision` (`image_base64` or `image_url`) / client `cnnForward`

| Field | Requirement |
|---|---|
| photo | grayscale-able, **daylight, normal exposure/contrast**, subject roughly filling frame |
| framing | damage visible **inside the frame**, not corner-cropped |
| content | matches a *trained visual signature*: dark crater with bright rim (pothole), horizontal water band (drainage), scattered dark fragments (waste), bright jet+pool (water), dark frame + lamp point (streetlight), dark ring around manhole (sewage), bright strokes on flat wall (graffiti) |
| avoid | night shots, over/under-exposure, heavy blur, filters/negatives — these are confidently misclassified (see OOD table) |

Honest limits: until the CNN sees real Mumbai street photos, photo output
should stay a *severity/consistency hint*, never the deciding layer (the
pipeline already labels the deciding `source_layer`).

### Risk → `buildRiskFeatures` (10 features, mirrored TS/Python)

Send raw counts; the client clamps to trained ranges. Best results:
`complaint_count` ≤ 60, `growth_rate` ≤ 3, `rainfall` ≤ 50 mm/24 h,
`accident_count` 0–5, `historical_incidents` ≤ 20, distance in km.
Inputs far outside these ranges saturate silently rather than error.

---

## How to fix the biggest gaps (recommended next steps)

1. **Retrain on real text.** The single highest-leverage change: export the
   1.2 M MCGM 2018–2024 corpus from the Kaggle competition into
   `ml/data/bmc_manual.csv` (T1 tier already wired) and re-run
   `sh ./scripts/train-bmc.sh`. Every failure cluster above except ALL-CAPS
   and Devanagari is a direct consequence of template-only training data.
2. **Case-normalize at train + inference time** (`text.lower()` before
   TF-IDF, keep case features as engineered columns) — fixes the ALL-CAPS
   cluster for free.
3. **Add Devanagari → romanization or a multilingual tokenizer** (indic-nlp
   or simple transliteration table) if Marathi complaints matter.
4. **Add an OOD gate to the CNN:** predicted-confidence < 0.5 or severity on
   a flat frame → return `ok: false, reason: "unrecognized_photo"` instead of
   a category (pure noise currently returns Waste at 0.76).
5. **Priority head needs severity labels that aren't marker strings** — even
   a few hundred human-labeled rows would teach implied severity.

---

## What this means for the product today

- The **layered pipeline already degrades correctly**: when text is thin or
  vocabulary is unknown, tickets land in `manual`/`Other` with a visible
  `source_layer` label instead of a wrong confident answer — keep that UX.
- **Photo evidence should never auto-resolve a category** (OOD risk);
  use it for severity + duplicate/phash forensics only.
- A "help the AI understand you" hint box on the complaint form (add a civic
  noun, mention urgency explicitly, avoid ALL-CAPS) would measurably raise
  detection quality *today* with zero model changes.
