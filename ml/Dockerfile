# Standalone CivicLens ML service — trains all models on first boot.
# Build:  docker build -t civiclens-ml -f ml/Dockerfile .
# Run:    docker run -p 8008:8008 civiclens-ml
#
# Models train inside the container (triage SVM from the bundled real-311
# cache + synthetic corpus, risk NN, photo CNN), then FastAPI serves
# /predict /explain /vision /forensics /trust /duplicates /forecast /anomalies.
FROM python:3.11-slim-bookworm

WORKDIR /ml
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY ml/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ml/ .

# Train only the missing SVM bundle. The risk and CNN weights are already
# versioned in ml/models and are copied with the service source.
RUN python train.py

ENV ML_PORT=8008
EXPOSE 8008

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD curl -sf http://127.0.0.1:8008/health || exit 1

CMD ["python", "-m", "uvicorn", "serve:app", "--host", "0.0.0.0", "--port", "8008"]
