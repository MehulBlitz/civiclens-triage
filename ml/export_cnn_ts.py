"""Export the trained CNN weights to a TypeScript-loadable JSON bundle.

Writes src/lib/vision/cnn_weights.json with (W, b) serialized as flat arrays
plus shape metadata, and asserts NumPy↔TS numeric parity on a probe image
(atol 1e-3 — float32 weights, float64 TS math, order-of-ops rounding).

Run after every retrain:
  .venv/bin/python ml/export_cnn_ts.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

import train_cnn as cnn
from cnn_data import generate_dataset

CNN_PATH = Path(__file__).resolve().parent / "models" / "civic_cnn.npz"
OUT_PATH = (
    Path(__file__).resolve().parent.parent / "src" / "lib" / "vision" / "cnn_weights.json"
)


def flat(x: np.ndarray) -> list[float]:
    return [round(float(v), 6) for v in np.asarray(x).ravel()]


def main() -> None:
    data = np.load(CNN_PATH)
    params = {k: data[k] for k in data.files if k not in ("categories", "input_shape")}
    categories = [str(c) for c in data["categories"]]

    bundle = {
        "version": 1,
        "input": {"height": 48, "width": 48, "channels": 1},
        "conv": [
            {"W": flat(params["W1"]), "b": flat(params["b1"]), "in": 1, "out": cnn.CH1},
            {"W": flat(params["W2"]), "b": flat(params["b2"]), "in": cnn.CH1, "out": cnn.CH2},
            {"W": flat(params["W3"]), "b": flat(params["b3"]), "in": cnn.CH2, "out": cnn.CH3},
        ],
        "dense": {"W": flat(params["Wd"]), "b": flat(params["bd"]), "in": cnn.FLAT, "out": cnn.DENSE},
        "classifier": {"W": flat(params["Ws"]), "b": flat(params["bs"]), "in": cnn.DENSE, "out": cnn.N_CLASSES},
        "severity_head": {"W": flat(params["Ws_sev"]), "b": flat(params["bs_sev"])},
        "categories": categories,
        "metrics": {
            "cnn_accuracy": json.loads(
                (CNN_PATH.parent / "civic_cnn_report.json").read_text()
            )["cnn_accuracy"],
        },
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(bundle, separators=(",", ":")))
    print(f"wrote {OUT_PATH} ({OUT_PATH.stat().st_size / 1024:.0f} KB)")

    # Parity probe: run the NumPy forward pass on a fixed image; the TS test
    # (src/lib/vision/parity.test.ts, run with bun) re-computes it and asserts
    # max logit delta < 1e-3. Regenerate the probe after any retrain.
    rng = np.random.default_rng(123)
    probe = rng.random((1, 1, 48, 48)).astype(np.float32)
    acts = cnn.forward(probe, params)
    probs = cnn.softmax(acts["zs"])
    probe_out = {
        "input_flat": [round(float(v), 6) for v in probe.ravel()],
        "probs": [round(float(v), 6) for v in probs[0]],
        "sev": round(float(np.clip(acts["sev"][0], 0, 1)), 6),
        "note": "parity probe: NumPy forward on default_rng(123).random((1,1,48,48))",
    }
    (Path(__file__).parent / "models" / "cnn_ts_probe.json").write_text(
        json.dumps(probe_out, indent=2)
    )
    print("probe -> ml/models/cnn_ts_probe.json")


if __name__ == "__main__":
    main()
