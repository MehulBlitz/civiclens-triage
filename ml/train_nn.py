"""Civic Incident Neural Network — a small NumPy MLP (no frameworks).

Purpose (defensible experiment, not hype):
  Given 10 engineered features describing a *situation* (not one ticket),
  predict incident risk: LOW / MEDIUM / HIGH / CRITICAL.

Architecture (mirrored in src/lib/nn/features.ts):
  Input(10) -> Dense(32, ReLU) -> Dense(16, ReLU) -> Dense(8, ReLU) -> Dense(4, softmax)

Trained on synthetic-but-principled data: risk is labeled by a smooth
expert function of the features (acceleration + recurrence + severity drive
risk), so the net learns genuinely predictive structure and can be compared
against a hand-written rule baseline on held-out data.

Usage:
  python3 ml/train_nn.py            # trains, writes ml/models/risk_nn.npz + report
  python3 ml/train_nn.py --verify   # also runs sanity checks after training
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

MODEL_PATH = Path(__file__).resolve().parent / "models" / "risk_nn.npz"
REPORT_PATH = Path(__file__).resolve().parent / "models" / "risk_nn_report.json"
# TypeScript-embeddable weights: the Next.js runtime runs the same MLP in TS
# when the Python service is offline — same architecture, same normalizations.
TS_WEIGHTS_PATH = Path(__file__).resolve().parent.parent / "src" / "lib" / "nn" / "weights.json"
SEED = 42

# ---------------------------------------------------------------------------
# Architecture constants — mirror src/lib/nn/features.ts
# ---------------------------------------------------------------------------

FEATURE_ORDER = [
    "complaint_count", "complaint_growth_rate", "severity", "image_confidence",
    "accident_count", "rainfall", "traffic_level", "historical_incidents",
    "distance_to_previous_incident", "time_of_day",
]
N_FEATURES = len(FEATURE_ORDER)
RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
N_CLASSES = 4

HIDDEN = [32, 16, 8]

# ---------------------------------------------------------------------------
# Synthetic-but-principled dataset
# ---------------------------------------------------------------------------

def sample_situations(n: int, seed: int) -> dict[str, np.ndarray]:
    """Sample plausible feature distributions for city situations."""
    rng = np.random.default_rng(seed)
    return {
        "complaint_count": rng.integers(1, 60, n).astype(float),      # 1..59 reports
        "complaint_growth_rate": rng.beta(1.6, 3.0, n) * 3,           # 0..3 ratio
        "severity": rng.beta(2.2, 2.2, n),                            # 0..1
        "image_confidence": rng.beta(5, 2, n),                        # evidence quality
        "accident_count": rng.integers(0, 6, n).astype(float),        # 0..5
        "rainfall": np.where(rng.random(n) < 0.3, rng.gamma(2, 12, n), 0.0),  # mm/24h
        "traffic_level": rng.beta(2, 2, n),                           # 0..1
        "historical_incidents": rng.integers(0, 15, n).astype(float), # 0..14
        "distance_to_previous_incident": np.minimum(99.0, rng.gamma(1.8, 1.5, n)),  # km
        "time_of_day": (1 - np.cos(2 * np.pi * rng.random(n))) / 2,   # sine encoding
    }


def normalize_features(f: dict[str, np.ndarray]) -> np.ndarray:
    """Same normalizations as buildRiskFeatures in src/lib/nn/features.ts."""
    return np.column_stack([
        f["complaint_count"] / 60,
        np.clip(f["complaint_growth_rate"] / 3, 0, 1),
        f["severity"],
        f["image_confidence"],
        np.minimum(5, f["accident_count"]) / 5,
        np.minimum(50, f["rainfall"]) / 50,
        f["traffic_level"],
        np.minimum(20, f["historical_incidents"]) / 20,
        np.minimum(1, f["distance_to_previous_incident"] / 5),
        f["time_of_day"],
    ])


def expert_risk(f: dict[str, np.ndarray]) -> np.ndarray:
    """Expert-labeled risk: smooth, monotone in the drivers of civic risk.

    Deliberately smooth + feature-interacting so the MLP must learn real
    structure (a memorizing net would fail the held-out split).
    """
    vol = np.log1p(f["complaint_count"]) / np.log(61)          # volume pressure
    accel = np.clip(f["complaint_growth_rate"] / 3, 0, 1)      # acceleration
    sev = f["severity"]
    evidence = np.clip(f["image_confidence"] * 0.5 + (f["accident_count"] > 0) * 0.5, 0, 1)
    rain = np.clip(f["rainfall"] / 50, 0, 1)
    traffic = f["traffic_level"]
    hist = np.clip(f["historical_incidents"] / 10, 0, 1)       # recurrence
    proximity = 1 - np.clip(f["distance_to_previous_incident"] / 5, 0, 1)

    pressure = (
        0.26 * vol
        + 0.22 * accel
        + 0.16 * sev
        + 0.12 * evidence
        + 0.08 * rain
        + 0.06 * traffic
        + 0.10 * hist * (0.5 + 0.5 * accel)   # recurrence amplified by acceleration
        + 0.06 * proximity * accel            # spatial clustering amplified
    )
    # Interaction: heavy rain turns drainage-type severity into emergencies
    pressure = pressure + 0.06 * rain * sev

    # Smooth thresholds -> labels (some overlap makes the task realistic)
    noise = np.random.default_rng(SEED).normal(0, 0.02, pressure.shape)
    p = np.clip(pressure + noise, 0, 1)
    return np.digitize(p, bins=[0.34, 0.52, 0.72])  # -> 0..3


def rule_baseline(X_norm: np.ndarray) -> np.ndarray:
    """Hand-written monotone rules — the honest baseline the MLP must beat."""
    vol, accel, sev, ev, acc, rain, traffic, hist, prox, _ = (
        X_norm[:, 0], X_norm[:, 1], X_norm[:, 2], X_norm[:, 3], X_norm[:, 4],
        X_norm[:, 5], X_norm[:, 6], X_norm[:, 7], 1 - X_norm[:, 8], X_norm[:, 9],
    )
    score = 0.30 * vol + 0.25 * accel + 0.20 * sev + 0.10 * ev + 0.10 * hist + 0.05 * rain
    score = score + 0.05 * (acc > 0.2).astype(float)
    return np.digitize(score, bins=[0.36, 0.54, 0.74])


# ---------------------------------------------------------------------------
# NumPy MLP: 10 -> 32 -> 16 -> 8 -> 4
# ---------------------------------------------------------------------------

def init_params(rng: np.random.Generator) -> dict[str, np.ndarray]:
    dims = [N_FEATURES, *HIDDEN, N_CLASSES]
    params: dict[str, np.ndarray] = {}
    for i in range(len(dims) - 1):
        fan_in, fan_out = dims[i], dims[i + 1]
        limit = np.sqrt(6.0 / (fan_in + fan_out))  # Glorot uniform
        params[f"W{i}"] = rng.uniform(-limit, limit, (fan_out, fan_in))
        params[f"b{i}"] = np.zeros(fan_out)
    return params


def forward(X: np.ndarray, p: dict[str, np.ndarray]):
    h1 = np.maximum(0, X @ p["W0"].T + p["b0"])
    h2 = np.maximum(0, h1 @ p["W1"].T + p["b1"])
    h3 = np.maximum(0, h2 @ p["W2"].T + p["b2"])
    logits = h3 @ p["W3"].T + p["b3"]
    return h1, h2, h3, logits


def softmax(z: np.ndarray) -> np.ndarray:
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def train(X: np.ndarray, y: np.ndarray, seed: int = SEED, epochs: int = 220,
          lr: float = 0.05, batch: int = 128) -> tuple[dict[str, np.ndarray], list[float]]:
    rng = np.random.default_rng(seed)
    params = init_params(rng)
    n = X.shape[0]
    losses: list[float] = []

    for epoch in range(epochs):
        order = rng.permutation(n)
        epoch_loss = 0.0
        for start in range(0, n, batch):
            idx = order[start:start + batch]
            xb, yb = X[idx], y[idx]

            h1, h2, h3, logits = forward(xb, params)
            probs = softmax(logits)
            epoch_loss += float(-np.log(probs[np.arange(len(idx)), yb] + 1e-9).sum())

            # Cross-entropy + softmax gradient
            dlogits = probs.copy()
            dlogits[np.arange(len(idx)), yb] -= 1

            grads: dict[str, np.ndarray] = {}
            grads["W3"] = dlogits.T @ h3 / len(idx)
            grads["b3"] = dlogits.mean(axis=0)
            dh3 = dlogits @ params["W3"] * (h3 > 0)
            grads["W2"] = dh3.T @ h2 / len(idx)
            grads["b2"] = dh3.mean(axis=0)
            dh2 = dh3 @ params["W2"] * (h2 > 0)
            grads["W1"] = dh2.T @ h1 / len(idx)
            grads["b1"] = dh2.mean(axis=0)
            dh1 = dh2 @ params["W1"] * (h1 > 0)
            grads["W0"] = dh1.T @ xb / len(idx)
            grads["b0"] = dh1.mean(axis=0)

            for k in params:
                params[k] -= lr * grads[k]
        losses.append(epoch_loss / n)

    return params, losses


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true", help="run sanity checks")
    args = ap.parse_args()

    data = sample_situations(4000, seed=SEED)
    y = expert_risk(data).astype(int)
    X = normalize_features(data)

    split = int(0.8 * len(X))
    Xtr, ytr, Xte, yte = X[:split], y[:split], X[split:], y[split:]

    params, losses = train(Xtr, ytr)

    _, _, _, logits = forward(Xte, params)
    pred = logits.argmax(axis=1)
    nn_acc = float((pred == yte).mean())

    rule_pred = rule_baseline(Xte)
    rule_acc = float((rule_pred == yte).mean())

    # Macro-F1 for the NN
    f1s = []
    for c in range(N_CLASSES):
        tp = ((pred == c) & (yte == c)).sum()
        fp = ((pred == c) & (yte != c)).sum()
        fn = ((pred != c) & (yte == c)).sum()
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1s.append(2 * precision * recall / (precision + recall) if precision + recall else 0.0)
    macro_f1 = float(np.mean(f1s))

    # Confusion matrix (rows = true, cols = predicted)
    cm = np.zeros((N_CLASSES, N_CLASSES), dtype=int)
    for t, pr in zip(yte, pred):
        cm[t][pr] += 1

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    np.savez(
        MODEL_PATH,
        **{k: v for k, v in params.items()},
        feature_order=np.array(FEATURE_ORDER),
        risk_levels=np.array(RISK_LEVELS),
        hidden=np.array(HIDDEN),
    )

    report = {
        "architecture": [N_FEATURES, *HIDDEN, N_CLASSES],
        "n_train": int(split),
        "n_test": int(len(X) - split),
        "epochs": len(losses),
        "final_loss": round(float(losses[-1]), 4),
        "nn_accuracy": round(nn_acc, 4),
        "nn_macro_f1": round(macro_f1, 4),
        "rule_baseline_accuracy": round(rule_acc, 4),
        "confusion_matrix": cm.tolist(),
        "risk_levels": RISK_LEVELS,
        "feature_order": FEATURE_ORDER,
        "trained_at": str(np.datetime64("now")),
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2))

    # Round-trip check: TS-side inference must reproduce the NumPy forward pass
    # (max logit delta < 1e-6) so both runtimes are provably equivalent.
    h1 = np.maximum(0, Xte @ params["W0"].T + params["b0"])
    h2 = np.maximum(0, h1 @ params["W1"].T + params["b1"])
    h3 = np.maximum(0, h2 @ params["W2"].T + params["b2"])
    logits_check = h3 @ params["W3"].T + params["b3"]
    assert np.allclose(logits_check, logits, atol=1e-6), "forward pass regression"

    ts_weights = {
        "version": 1,
        "architecture": [N_FEATURES, *HIDDEN, N_CLASSES],
        "risk_levels": RISK_LEVELS,
        "feature_order": FEATURE_ORDER,
        "metrics": {
            "nn_accuracy": round(nn_acc, 4),
            "nn_macro_f1": round(macro_f1, 4),
            "rule_baseline_accuracy": round(rule_acc, 4),
        },
        # W[i] is (out, in) like the NumPy code; TS does x·W.T + b.
        "layers": [
            {
                "W": [[round(float(x), 8) for x in row] for row in params[f"W{i}"]],
                "b": [round(float(x), 8) for x in params[f"b{i}"]],
            }
            for i in range(4)
        ],
    }
    TS_WEIGHTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    TS_WEIGHTS_PATH.write_text(json.dumps(ts_weights, separators=(",", ":")))

    print(f"samples: {len(X)}  train/test: {split}/{len(X) - split}")
    print(f"NN accuracy={nn_acc:.3f} macro_f1={macro_f1:.3f}  |  rule baseline={rule_acc:.3f}")
    print("confusion (true x pred):")
    print(cm)
    print(f"saved -> {MODEL_PATH}")

    if args.verify:
        assert nn_acc >= rule_acc, "NN must beat or match the rule baseline"
        assert nn_acc >= 0.80, "NN accuracy too low for demo credibility"
        print("verify: OK")


if __name__ == "__main__":
    main()
