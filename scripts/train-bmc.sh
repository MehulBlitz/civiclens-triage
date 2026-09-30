#!/bin/sh
# Retrain every model against the BMC/Mumbai corpus.
#
# 1. ml/bmc_data.py --build     -> ml/data/bmc_complaints.csv
#                                  (T1 manual export -> T2 data.gov.in probe
#                                   -> T3 BMC-realistic corpus)
# 2. ml/export_bmc_lexicon.py   -> site/src/lib/data/triage_lexicon.json
#                                  (the distilled classifier the static site runs)
# 3. ml/train.py                -> triage SVM  (full bundle, merges BMC corpus)
# 4. ml/train_nn.py             -> risk NN     (unchanged, city-agnostic)
# 5. ml/train_cnn.py            -> photo CNN   (unchanged, city-agnostic)
#
# Usage:  sh ./scripts/train-bmc.sh [--per-category 80]
set -e
cd "$(dirname "$0")/.."

PY="${PYTHON:-.venv/bin/python}"
if [ ! -x "$PY" ]; then
  echo "[train-bmc] no .venv found — run: sh ./scripts/setup-ml.sh"
  exit 1
fi

echo "== [1/4] building the BMC/Mumbai corpus =="
"$PY" ml/bmc_data.py --build "${@}"

echo "== [2/4] exporting the client-side lexicon =="
"$PY" ml/export_bmc_lexicon.py

echo "== [3/4] retraining the triage SVM on the merged corpus =="
"$PY" ml/train.py --per-category 150 --real-per-source 800

echo "== [4/4] risk NN + photo CNN =="
"$PY" ml/train_nn.py --verify || echo "[train-bmc] risk NN skipped"
"$PY" ml/train_cnn.py --verify && "$PY" ml/export_cnn_ts.py || echo "[train-bmc] photo CNN skipped"

echo "[train-bmc] done — new bundle in ml/models/, lexicon in site/src/lib/data/"
