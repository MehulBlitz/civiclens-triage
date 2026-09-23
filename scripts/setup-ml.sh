#!/bin/sh
# One-time setup: create venv, install pinned Python deps, train the model.
# Hosting-safe: invoked as `sh ./scripts/setup-ml.sh`, never ./scripts/...
set -e
cd "$(dirname "$0")/.."

if [ ! -d .venv ]; then
  echo "[setup-ml] creating virtualenv..."
  python3 -m venv .venv
fi

echo "[setup-ml] installing Python dependencies..."
.venv/bin/pip install --quiet --disable-pip-version-check -r ml/requirements.txt

if [ ! -f ml/models/triage_bundle.joblib ]; then
  echo "[setup-ml] training triage model..."
  .venv/bin/python ml/train.py
else
  echo "[setup-ml] model bundle exists, skipping training"
fi

echo "[setup-ml] done."
