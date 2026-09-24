"""Time-series forecasting + spike anomaly detection — pure NumPy.

forecast_series(): Holt's linear double-exponential smoothing (level + trend),
fully from scratch. Good on the short municipal windows (14–90 days) we have,
no external stats lib. Returns the fitted level/trend, per-point one-step
residuals and an h-step forecast with simple residual-based prediction bands.

anomaly_score(): from-scratch robust z-score — median/MAD instead of
mean/std so a genuine spike doesn't inflate the baseline. Returns a
per-point anomaly score and a boolean spike flag. Used to auto-flag
emerging incidents before they cluster into the risk NN.

Used by ml/serve.py::/forecast and ::/anomalies.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np


def _fit_holt(series: np.ndarray, alpha: float, beta: float) -> tuple[float, float, np.ndarray]:
    """One pass of Holt's method. Returns (level, trend, one-step residuals)."""
    level = float(series[0])
    trend = float(series[1] - series[0])
    residuals = np.zeros(len(series))
    residuals[0] = 0.0
    for t in range(1, len(series)):
        prev_level = level
        level = alpha * series[t] + (1 - alpha) * (level + trend)
        trend = beta * (level - prev_level) + (1 - beta) * trend
        residuals[t] = series[t] - (prev_level + trend)
    return level, trend, residuals


def _sweep(series: np.ndarray) -> tuple[float, float]:
    """Grid-search (alpha, beta) minimizing in-sample RMSE."""
    best = (0.4, 0.1, float("inf"))
    for alpha in np.linspace(0.1, 0.9, 9):
        for beta in np.linspace(0.02, 0.4, 8):
            _, _, res = _fit_holt(series, float(alpha), float(beta))
            rmse = float(np.sqrt(np.mean(res[1:] ** 2)))
            if rmse < best[2]:
                best = (float(alpha), float(beta), rmse)
    return best[0], best[1]


def forecast_series(
    values: list[float] | np.ndarray,
    horizon: int = 7,
) -> dict[str, Any]:
    """Holt double-exponential smoothing forecast.

    Degrades honestly: <4 points -> flat forecast of the mean, flagged.
    """
    arr = np.asarray(values, dtype=np.float64)
    arr = arr[~np.isnan(arr)]
    n = len(arr)
    if n == 0:
        return {"history_len": 0, "forecast": [0.0] * horizon, "degraded": True,
                "reason": "no_data"}

    horizon = max(1, min(int(horizon), 30))
    if n < 4:
        return {
            "history_len": n,
            "alpha": None,
            "beta": None,
            "level": float(arr[-1]),
            "trend": 0.0,
            "forecast": [float(arr.mean())] * horizon,
            "rmse": None,
            "band": None,
            "degraded": True,
            "reason": "insufficient_history",
        }

    alpha, beta = _sweep(arr)
    level, trend, residuals = _fit_holt(arr, alpha, beta)
    rmse = float(np.sqrt(np.mean(residuals[1:] ** 2)))

    forecast = [float(level + (i + 1) * trend) for i in range(horizon)]
    # 80% band from one-step residual spread.
    steps = np.arange(1, horizon + 1, dtype=np.float64)
    band = 1.2816 * rmse * np.sqrt(1 + steps * 0.1)
    band = [round(float(b), 4) for b in band]

    return {
        "history_len": n,
        "alpha": round(alpha, 3),
        "beta": round(beta, 3),
        "level": round(float(level), 4),
        "trend": round(float(trend), 4),
        "forecast": [round(v, 4) for v in forecast],
        "rmse": round(rmse, 4),
        "band": band,
        "degraded": False,
        "reason": None,
    }


def robust_zscore(values: list[float] | np.ndarray) -> np.ndarray:
    """Per-point robust z = (x - median) / (1.4826 * MAD)."""
    arr = np.asarray(values, dtype=np.float64)
    med = np.median(arr)
    mad = np.median(np.abs(arr - med))
    if mad < 1e-9:
        return np.zeros(len(arr))
    return (arr - med) / (1.4826 * mad)


def anomaly_score(values: list[float] | np.ndarray, threshold: float = 3.5) -> dict[str, Any]:
    """Flag spikes in a daily complaint-volume series.

    Returns per-point z-scores and spike indices. The most recent point is
    what the UI cares about: is TODAY abnormal?
    """
    arr = np.asarray(values, dtype=np.float64)
    n = len(arr)
    if n < 5:
        return {
            "n": n, "median": float(arr[-1]) if n else 0.0,
            "zscores": [0.0] * n, "threshold": threshold,
            "spike_indices": [], "latest_is_spike": False,
            "degraded": True, "reason": "insufficient_history",
        }

    z = robust_zscore(arr)
    spikes = [int(i) for i in range(n) if z[i] >= threshold]
    return {
        "n": n,
        "median": round(float(np.median(arr)), 4),
        "zscores": [round(float(v), 3) for v in z],
        "threshold": threshold,
        "spike_indices": spikes,
        "latest_is_spike": bool(z[-1] >= threshold),
        "degraded": False,
        "reason": None,
    }
