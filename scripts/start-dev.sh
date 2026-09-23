#!/bin/sh
# Dev process: ML service in background + Next.js dev server in foreground.
# Hosting-safe: invoked as `sh ./scripts/start-dev.sh` (no exec bit needed).
set -e
cd "$(dirname "$0")/.."

# Ensure the model bundle + venv exist before serving.
if [ ! -f ml/models/triage_bundle.joblib ]; then
  sh ./scripts/setup-ml.sh
fi

sh ./scripts/start-ml.sh &

# PORT is injected by Freebuff; default to 3000 locally.
exec ./node_modules/.bin/next dev -H 0.0.0.0 -p "${PORT:-3000}"
