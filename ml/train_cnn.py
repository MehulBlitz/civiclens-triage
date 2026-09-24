"""From-scratch NumPy CNN — classifies complaint photos into the 8 civic
categories and estimates image-based severity.

Architecture (1x48x48 grayscale input, all hand-rolled NumPy):
  Conv(1->8, 3x3, stride 1)  + ReLU
  MaxPool 2x2                -> 8x23x23
  Conv(8->16, 3x3)           + ReLU
  MaxPool 2x2                -> 16x10x10
  Conv(16->24, 3x3)          + ReLU
  MaxPool 2x2                -> 24x4x4
  Flatten(384) -> Dense -> 64 ReLU -> Dense -> 8 softmax

Training data is *procedurally generated* (ml/cnn_data.py): each category gets
a distinctive synthetic visual signature (crater disc, water bands, litter
clusters, bright lamp, dark spill, graffiti strokes, frame edges, noise).
The model learns category-typical texture/layout structure — the honest,
self-contained way to prove the pipeline end-to-end without scraping a
dataset at build time. Severity is regressed from the same trunk via a small
dense head (dark-area ratio + edge density correlate with degradation).

Usage:
  python3 ml/train_cnn.py            # trains, writes ml/models/civic_cnn.npz
  python3 ml/train_cnn.py --verify   # sanity checks: accuracy >= 0.75
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

from cnn_data import generate_dataset, IMG, SEED as DATA_SEED

MODEL_PATH = Path(__file__).resolve().parent / "models" / "civic_cnn.npz"
REPORT_PATH = Path(__file__).resolve().parent / "models" / "civic_cnn_report.json"

CATEGORIES = [
    "Pothole", "Drainage", "Waste", "Water",
    "Streetlight", "Sewage", "Graffiti", "Other",
]

CH1, CH2, CH3 = 8, 16, 24
DENSE = 64
N_CLASSES = len(CATEGORIES)
# Pool math (48px input, valid conv 3x3, 2x2 max pool with odd-pad):
#   48 -> 46 -> pool 23 -> 21 -> pool 11 (zero-padded from 10.5)
#   -> 9 -> pool 5 (zero-padded) -> flatten 24*5*5 = 600
FINAL_H = 5
FLAT = CH3 * FINAL_H * FINAL_H  # 600

# ---------------------------------------------------------------------------
# Layers
# ---------------------------------------------------------------------------


def conv2d(x: np.ndarray, w: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Valid convolution. x: (N,C,H,W), w: (F,C,3,3), b: (F,).

    Sliding-window form: every kernel offset (di,dj) contributes a shifted
    (H-2,W-2) response map, contracted over input channels. Computed in
    float32 for speed; precision is ample for an 8-way texture task.
    """
    n, c, h, wd = x.shape
    out = np.zeros((n, w.shape[0], h - 2, wd - 2), dtype=np.float32)
    for i in range(3):
        for j in range(3):
            out += np.einsum(
                "nchw,fc->nfhw",
                x[:, :, i:i + h - 2, j:j + wd - 2],
                w[:, :, i, j],
            )
    return out + b[None, :, None, None]


def relu(x: np.ndarray) -> np.ndarray:
    return np.maximum(0.0, x)


def maxpool2(x: np.ndarray) -> np.ndarray:
    n, c, h, w = x.shape
    if h % 2 or w % 2:  # odd dims (48->23 after 2 pools): zero-pad to even
        x = np.pad(x, ((0, 0), (0, 0), (0, h % 2), (0, w % 2)))
    n, c, h, w = x.shape
    return x.reshape(n, c, h // 2, 2, w // 2, 2).max(axis=(3, 5))


def softmax(z: np.ndarray) -> np.ndarray:
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def forward(x: np.ndarray, p: dict) -> dict:
    """Full forward pass, returning activations for backprop."""
    z1 = conv2d(x, p["W1"], p["b1"]); a1 = relu(z1); m1 = maxpool2(a1)
    z2 = conv2d(m1, p["W2"], p["b2"]); a2 = relu(z2); m2 = maxpool2(a2)
    z3 = conv2d(m2, p["W3"], p["b3"]); a3 = relu(z3); m3 = maxpool2(a3)
    flat = m3.reshape(m3.shape[0], -1)
    zd = flat @ p["Wd"].T + p["bd"]; ad = relu(zd)
    zs = ad @ p["Ws"].T + p["bs"]
    sev = np.clip(ad @ p["Ws_sev"].T + p["bs_sev"], 0.0, 1.0)  # (N,1)
    return {"z1": z1, "a1": a1, "m1": m1, "z2": z2, "a2": a2, "m2": m2,
            "z3": z3, "a3": a3, "m3": m3, "flat": flat, "zd": zd,
            "ad": ad, "zs": zs, "sev": sev.ravel()}


def conv_backward(dout: np.ndarray, x: np.ndarray, w: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Gradients for conv2d (sliding-window scheme): (dx, dw)."""
    n, c, h, wd = x.shape
    dw = np.zeros_like(w)
    dx = np.zeros_like(x)
    for i in range(3):
        for j in range(3):
            xs = x[:, :, i:i + h - 2, j:j + wd - 2]
            dw[:, :, i, j] = np.einsum("nfhw,nchw->fc", dout, xs)
            dx[:, :, i:i + h - 2, j:j + wd - 2] += np.einsum("nfhw,fc->nchw", dout, w[:, :, i, j])
    return dx, dw


def maxpool2_backward(dout: np.ndarray, x: np.ndarray) -> np.ndarray:
    n, c, h, w = x.shape
    ph, pw = h % 2, w % 2
    if ph or pw:  # replicate the forward zero-pad
        x = np.pad(x, ((0, 0), (0, 0), (0, ph), (0, pw)))
    n, c, H, W = x.shape
    reshaped = x.reshape(n, c, H // 2, 2, W // 2, 2)
    maxvals = reshaped.max(axis=(3, 5), keepdims=True)
    mask = (reshaped == maxvals)
    dout_exp = dout[:, :, :, None, :, None]
    dxp = (mask * dout_exp).reshape(n, c, H, W)
    return dxp[:, :, :h, :w] if (ph or pw) else dxp


def init_params(rng: np.random.Generator) -> dict:
    def glorot(fan_in, fan_out, shape):
        limit = np.sqrt(6.0 / (fan_in + fan_out))
        return rng.uniform(-limit, limit, shape).astype(np.float32)

    return {
        "W1": glorot(3, CH1, (CH1, 1, 3, 3)), "b1": np.zeros(CH1, dtype=np.float32),
        "W2": glorot(CH1 * 9, CH2, (CH2, CH1, 3, 3)), "b2": np.zeros(CH2, dtype=np.float32),
        "W3": glorot(CH2 * 9, CH3, (CH3, CH2, 3, 3)), "b3": np.zeros(CH3, dtype=np.float32),
        "Wd": glorot(FLAT, DENSE, (DENSE, FLAT)).astype(np.float32), "bd": np.zeros(DENSE, dtype=np.float32),
        "Ws": glorot(DENSE, N_CLASSES, (N_CLASSES, DENSE)).astype(np.float32), "bs": np.zeros(N_CLASSES, dtype=np.float32),
        "Ws_sev": glorot(DENSE, 1, (1, DENSE)).astype(np.float32), "bs_sev": np.zeros(1, dtype=np.float32),
    }


def train(Xtr, ytr, sevtr, seed=42, epochs=40, batch=64, lr=0.03, l2=1e-4):
    rng = np.random.default_rng(seed)
    params = init_params(rng)
    Xtr = Xtr.astype(np.float32)
    sevtr = sevtr.astype(np.float32)
    rng = np.random.default_rng(seed)
    params = init_params(rng)
    n = Xtr.shape[0]
    losses = []
    total_steps = epochs * max(1, n // batch)
    step = 0
    for ep in range(epochs):
        order = rng.permutation(n)
        ep_loss = 0.0
        for s in range(0, n, batch):
            idx = order[s:s + batch]
            xb, yb, sb = Xtr[idx], ytr[idx], sevtr[idx]
            # Cheap augmentation: random horizontal flips preserve all signatures.
            flip = rng.random(len(idx)) < 0.5
            xb = xb.copy()
            xb[flip] = xb[flip, :, :, ::-1]
            acts = forward(xb, params)
            probs = softmax(acts["zs"])
            ep_loss += float(-np.log(probs[np.arange(len(idx)), yb] + 1e-9).sum())

            # Softmax + CE
            dzs = probs.copy()
            dzs[np.arange(len(idx)), yb] -= 1
            dzs /= len(idx)

            # Sev head (MSE)
            dsev_pre = (acts["sev"].reshape(-1, 1) - sb.reshape(-1, 1)) / len(idx)

            grads = {}
            grads["Ws"] = dzs.T @ acts["ad"]
            grads["bs"] = dzs.sum(axis=0)
            grads["Ws_sev"] = dsev_pre.T @ acts["ad"]
            grads["bs_sev"] = dsev_pre.sum(axis=0)

            dad = dzs @ params["Ws"] + dsev_pre @ params["Ws_sev"]
            dzd = dad * (acts["zd"] > 0)
            grads["Wd"] = dzd.T @ acts["flat"]
            grads["bd"] = dzd.sum(axis=0)

            dflat = dzd @ params["Wd"]
            dm3 = dflat.reshape(acts["m3"].shape)
            da3 = maxpool2_backward(dm3, acts["a3"])
            dz3 = da3 * (acts["z3"] > 0)
            dm2, gW3, gb3 = None, None, None
            dx3, dw3 = conv_backward(dz3, acts["m2"], params["W3"])
            grads["W3"], grads["b3"] = dw3, dz3.sum(axis=(0, 2, 3))

            dm2 = dx3
            da2 = maxpool2_backward(dm2, acts["a2"])
            dz2 = da2 * (acts["z2"] > 0)
            dx2, dw2 = conv_backward(dz2, acts["m1"], params["W2"])
            grads["W2"], grads["b2"] = dw2, dz2.sum(axis=(0, 2, 3))

            dm1 = dx2
            da1 = maxpool2_backward(dm1, acts["a1"])
            dz1 = da1 * (acts["z1"] > 0)
            _, dw1 = conv_backward(dz1, xb, params["W1"])
            grads["W1"], grads["b1"] = dw1, dz1.sum(axis=(0, 2, 3))

            for k in params:
                # Simple cosine LR decay over the full run.
                cur_lr = lr * (0.5 * (1 + np.cos(np.pi * step / max(1, total_steps))))
                step += 1
                params[k] -= cur_lr * (grads[k] + l2 * params[k])
        losses.append(ep_loss / n)
    return params, losses


def predict(params, X):
    acts = forward(X, params)
    probs = softmax(acts["zs"])
    return probs.argmax(axis=1), probs, acts["sev"]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--n", type=int, default=96)  # per class
    ap.add_argument("--epochs", type=int, default=40)
    args = ap.parse_args()

    t0 = time.time()
    print(f"generating procedural dataset ({args.n}/class)...")
    X, y, sev = generate_dataset(n_per_class=args.n, seed=DATA_SEED)
    rng = np.random.default_rng(7)
    perm = rng.permutation(len(X))
    X, y, sev = X[perm], y[perm], sev[perm]
    split = int(0.85 * len(X))
    Xtr, ytr, sv_tr = X[:split], y[:split], sev[:split]
    Xte, yte, sv_te = X[split:], y[split:], sev[split:]
    print(f"train/test: {split}/{len(X) - split}")

    params, losses = train(Xtr, ytr, sv_tr, epochs=args.epochs)
    pred, probs, sev_pred = predict(params, Xte)
    acc = float((pred == yte).mean())
    sev_mae = float(np.mean(np.abs(sev_pred - sv_te)))

    # macro F1
    f1s = []
    for c in range(N_CLASSES):
        tp = ((pred == c) & (yte == c)).sum()
        fp = ((pred == c) & (yte != c)).sum()
        fn = ((pred != c) & (yte == c)).sum()
        pr = tp / (tp + fp) if tp + fp else 0.0
        rc = tp / (tp + fn) if tp + fn else 0.0
        f1s.append(2 * pr * rc / (pr + rc) if pr + rc else 0.0)
    macro_f1 = float(np.mean(f1s))

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    np.savez(MODEL_PATH, **params,
             categories=np.array(CATEGORIES),
             input_shape=np.array([1, IMG, IMG]))
    report = {
        "architecture": [1, IMG, IMG, CH1, CH2, CH3, DENSE, N_CLASSES],
        "n_train": int(split), "n_test": int(len(X) - split),
        "epochs": len(losses), "final_loss": round(losses[-1], 4),
        "cnn_accuracy": round(acc, 4), "cnn_macro_f1": round(macro_f1, 4),
        "severity_mae": round(sev_mae, 4),
        "categories": CATEGORIES,
        "trained_at": str(np.datetime64("now")),
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    print(f"CNN accuracy={acc:.3f} macro_f1={macro_f1:.3f} severity MAE={sev_mae:.3f}")
    print(f"saved -> {MODEL_PATH} ({time.time() - t0:.1f}s)")

    if args.verify:
        assert acc >= 0.75, f"CNN accuracy {acc:.3f} below 0.75 threshold"
        assert sev_mae <= 0.2, f"severity MAE {sev_mae:.3f} above 0.2"
        print("verify: OK")


if __name__ == "__main__":
    main()
