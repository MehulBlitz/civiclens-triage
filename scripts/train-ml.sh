#!/bin/sh
# Train all CivicLens models (triage SVM, risk NN, photo CNN) if their
# artifacts are missing. Idempotent: skips what already exists.
# Runs inside Docker (start-docker.sh) or locally via scripts/setup-ml.sh.
set -e
cd "$(dirname "$0")/.."

PY="${PYTHON:-}"
if [ -z "$PY" ]; then
  if [ -x /opt/venv/bin/python ]; then PY=/opt/venv/bin/python;
  elif [ -x .venv/bin/python ]; then PY=.venv/bin/python;
  else PY=python3; fi
fi

echo "[train-ml] using interpreter: $PY"

if [ ! -f ml/models/triage_bundle.joblib ]; then
  echo "[train-ml] training text triage SVM..."
  "$PY" ml/train.py || echo "[train-ml] triage training failed (non-fatal)"
else
  echo "[train-ml] triage bundle exists — skipping"
fi

if [ ! -f src/lib/nn/weights.json ] || [ ! -f ml/models/risk_nn.npz ]; then
  echo "[train-ml] training risk neural network..."
  "$PY" ml/train_nn.py || echo "[train-ml] NN training failed (non-fatal)"
else
  echo "[train-ml] risk NN exists — skipping"
fi

if [ ! -f ml/models/civic_cnn.npz ]; then
  echo "[train-ml] training photo CNN..."
  "$PY" ml/train_cnn.py && "$PY" ml/export_cnn_ts.py || echo "[train-ml] CNN training failed (non-fatal)"
else
  echo "[train-ml] photo CNN exists — skipping"
fi

echo "[train-ml] model artifacts ready."
