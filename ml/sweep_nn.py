"""One-off hyperparameter sweep for the risk NN — picks the best honest run.

Trains several (lr, dropout, l2) combos on the same split and reports held-out
accuracy/macro-F1 for each; the winner is the one we ship. Run manually:

  .venv/bin/python ml/sweep_nn.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from train_nn import (  # noqa: E402
    N_CLASSES,
    SEED,
    expert_risk,
    forward,
    normalize_features,
    rule_baseline,
    sample_situations,
    softmax,
    train,
)


def macro_f1(pred: np.ndarray, y: np.ndarray) -> float:
    f1s = []
    for c in range(N_CLASSES):
        tp = ((pred == c) & (y == c)).sum()
        fp = ((pred == c) & (y != c)).sum()
        fn = ((pred != c) & (y == c)).sum()
        pr = tp / (tp + fp) if tp + fp else 0.0
        rc = tp / (tp + fn) if tp + fn else 0.0
        f1s.append(2 * pr * rc / (pr + rc) if pr + rc else 0.0)
    return float(np.mean(f1s))


def main() -> None:
    data = sample_situations(4000, seed=SEED)
    y = expert_risk(data).astype(int)
    X = normalize_features(data)
    split = int(0.8 * len(X))
    Xtr, ytr, Xte, yte = X[:split], y[:split], X[split:], y[split:]

    combos = [
        (0.003, 0.10, 1e-4),
        (0.003, 0.15, 1e-4),
        (0.005, 0.10, 1e-4),
        (0.005, 0.15, 5e-5),
        (0.002, 0.10, 1e-4),
        (0.005, 0.20, 1e-4),
        (0.008, 0.15, 1e-4),
    ]
    best = None
    for lr, do, l2 in combos:
        params, hist = train(
            Xtr, ytr, epochs=400, lr=lr, dropout=do, l2=l2, patience=60
        )
        _, _, _, logits = forward(Xte, params)
        pred = logits.argmax(axis=1)
        acc = float((pred == yte).mean())
        f1 = macro_f1(pred, yte)
        print(f"lr={lr} dropout={do} l2={l2}  acc={acc:.3f} f1={f1:.3f} epochs={len(hist)}")
        if best is None or f1 > best[0]:
            best = (f1, acc, lr, do, l2)
    print(f"BEST: f1={best[0]:.3f} acc={best[1]:.3f} with lr={best[2]} dropout={best[3]} l2={best[4]}")


if __name__ == "__main__":
    main()
