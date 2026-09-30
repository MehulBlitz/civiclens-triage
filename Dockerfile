# ============================================================
# CivicLens — all-in-one image: Next.js app + Python ML service
#
# The ML models (triage SVM, risk NN, photo CNN) TRAIN on first boot and
# serve via FastAPI, so the full AI stack runs anywhere Docker runs —
# no venv dance, no host Python required.
#
#   docker build -t civiclens .
#   docker run -p 3000:3000 -e DATABASE_URL=postgres://... civiclens
#
# Or use docker-compose.yml (web + ml + optional postgres).
# ============================================================

# ---------- Stage 1: web dependencies ----------
FROM node:20-bookworm-slim AS web-deps
WORKDIR /app
RUN npm install -g bun@1
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---------- Stage 2: build the Next.js app ----------
FROM node:20-bookworm-slim AS web-builder
WORKDIR /app
RUN npm install -g bun@1
COPY --from=web-deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL is not needed at build time (pages force-dynamic), but Next
# sometimes evaluates env at build; a dummy keeps the build happy.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN bun run build

# ---------- Stage 3: Python ML runtime (trainer + server) ----------
FROM python:3.11-slim-bookworm AS ml-runtime
WORKDIR /ml
COPY ml/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ml/ .
# Models train on first boot (train_all.py) into /ml/models (a volume).

# ---------- Stage 4: runtime (Node + Python side by side) ----------
FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl python3.11 python3.11-venv && rm -rf /var/lib/apt/lists/* && ln -sf /usr/bin/python3.11 /usr/local/bin/python3

# Next.js standalone-ish runtime: node_modules + built app
COPY --from=web-deps /app/node_modules ./node_modules
COPY --from=web-builder /app/.next ./.next
COPY --from=web-builder /app/public ./public
COPY package.json next.config.mjs ./
COPY src ./src
COPY scripts ./scripts
COPY ml ./ml

# Python venv for the ML service inside the same container.
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir -r ml/requirements.txt

ENV NODE_ENV=production
ENV PORT=3000
ENV ML_SERVICE_URL=http://127.0.0.1:8008
ENV ML_PORT=8008
EXPOSE 3000 8008

HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD curl -sf http://127.0.0.1:3000/api/health || exit 1

# start-docker.sh: trains models if missing, starts ML service, starts Next.
CMD ["sh", "./scripts/start-docker.sh"]
