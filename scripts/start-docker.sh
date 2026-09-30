#!/bin/sh
# Docker entrypoint: train ML models if missing → start ML service → start Next.
# The full AI stack (triage SVM, risk NN, photo CNN) runs inside the container.
set -e
cd "$(dirname "$0")/.."

echo "[docker] ensuring ML models are trained..."
sh ./scripts/train-ml.sh || echo "[docker] training failed — serving with L2 lexical fallback"

echo "[docker] starting ML service on :${ML_PORT:-8008}..."
/opt/venv/bin/python -m uvicorn ml.serve:app --host 0.0.0.0 --port "${ML_PORT:-8008}" &

echo "[docker] starting Next.js on :${PORT:-3000}..."
exec ./node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
