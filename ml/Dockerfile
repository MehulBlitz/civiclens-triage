# CivicLens ML service — deterministic image with the *verified* trained
# artifacts baked in (triage SVM bundle + risk NN + photo CNN + metrics).
# The models are committed to the repo, so a build on Railway/Render/GHCR
# produces byte-identical serving behaviour to the sandbox that trained them —
# no training at build/boot time, cold start in seconds.
#
# Build:  docker build -t civiclens-ml -f ml/Dockerfile .
# Run:    docker run -p 8008:8008 civiclens-ml
# Serves: /health /predict /explain /vision /forensics /trust /duplicates
#         /forecast /anomalies  (CORS-enabled for web frontends)
FROM python:3.11-slim-bookworm

WORKDIR /ml
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY ml/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ml/ .

# Hosting platforms (Railway, Render) inject $PORT and expect the bind on it.
# Docker/Compose keeps the documented 8008 default via the fallback.
ENV ML_PORT=8008
EXPOSE 8008

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD curl -sf "http://127.0.0.1:${PORT:-8008}/health" || exit 1

CMD ["sh", "-c", "python -m uvicorn serve:app --host 0.0.0.0 --port ${PORT:-8008}"]
