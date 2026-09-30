"""Streamlit deployment for the CivicLens ML triage and map workflow."""
from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import pydeck as pdk
import streamlit as st

from ml.serve import load_bundle, extract_features
from scipy.sparse import hstack

ROOT = Path(__file__).resolve().parent

st.set_page_config(page_title="CivicLens ML Triage", page_icon="🏙️", layout="wide")


def predict_text(text: str) -> dict:
    bundle = get_bundle()
    word = bundle["word_tfidf"].transform([text])
    char = bundle["char_tfidf"].transform([text])
    matrix = hstack([word, char, extract_features([text])]).tocsr()
    cat_probs = bundle["category_head"].predict_proba(matrix)[0]
    priority_probs = bundle["priority_head"].predict_proba(matrix)[0]
    cat_index = int(cat_probs.argmax())
    priority_index = int(priority_probs.argmax())
    return {
        "category": str(bundle["category_head"].classes_[cat_index]),
        "priority": str(bundle["priority_head"].classes_[priority_index]),
        "confidence": round(float(min(1, 0.7 * cat_probs[cat_index] + 0.3 * priority_probs[priority_index])), 3),
    }


@st.cache_resource(show_spinner="Preparing the CivicLens model...")
def get_bundle():
    """Load the committed bundle, or train a compact bundle on first deploy."""
    try:
        return load_bundle()
    except FileNotFoundError:
        subprocess.run(
            [
                sys.executable,
                str(ROOT / "ml" / "train.py"),
                "--per-category", "100",
                "--noise", "20",
                "--real-per-source", os.getenv("CIVICLENS_REAL_PER_SOURCE", "0"),
            ],
            cwd=ROOT,
            check=True,
            timeout=600,
        )
        return load_bundle()


def ensure_state() -> list[dict]:
    if "reports" not in st.session_state:
        st.session_state.reports = []
    return st.session_state.reports


reports = ensure_state()
st.title("CivicLens")
st.caption("AI civic complaint triage · model output, evidence, risk and map")

with st.sidebar:
    st.header("Citizen report")
    complaint = st.text_area("What happened?", placeholder="Deep pothole near the bus stop, bikes are skidding...")
    location = st.text_input("Location", placeholder="Sakinaka signal")
    latitude = st.number_input("Latitude", value=19.076, format="%.6f")
    longitude = st.number_input("Longitude", value=72.878, format="%.6f")
    evidence = st.file_uploader("Evidence photo", type=["jpg", "jpeg", "png"])
    submit = st.button("Triage complaint", type="primary", use_container_width=True)

if submit:
    if not complaint.strip():
        st.warning("Enter a complaint before triage.")
    else:
        try:
            result = predict_text(complaint.strip())
            reports.append({
                "id": len(reports) + 1,
                "text": complaint.strip(),
                "location": location or "Location pending",
                "lat": latitude,
                "lon": longitude,
                "category": result["category"],
                "priority": result["priority"],
                "confidence": result["confidence"],
                "created": datetime.now(timezone.utc).isoformat(),
                "has_photo": bool(evidence),
            })
            st.success(f"Report #{len(reports)} triaged as {result['category']} / {result['priority']}.")
        except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
            st.error("The model could not be prepared on this deployment. Check the Streamlit logs for the training error.")
            st.exception(error)

if not reports:
    st.info("Submit a complaint to populate the map, risk view and insights.")
else:
    frame = pd.DataFrame(reports)
    map_tab, risk_tab, insights_tab = st.tabs(["Live map", "Risk engine", "Insights"])
    with map_tab:
        st.subheader("OpenStreetMap complaint map")
        st.pydeck_chart(pdk.Deck(
            map_style=None,
            initial_view_state=pdk.ViewState(latitude=float(frame.lat.mean()), longitude=float(frame.lon.mean()), zoom=11),
            layers=[pdk.Layer("ScatterplotLayer", data=frame, get_position="[lon, lat]", get_radius=180, get_fill_color="[220, 38, 72, 190]", pickable=True)],
            tooltip={"text": "#{id} · {category} · {priority}\n{text}"},
        ), use_container_width=True)
    with risk_tab:
        st.subheader("Priority and SLA pressure")
        for row in frame.sort_values(["priority", "confidence"], ascending=False).itertuples():
            risk = min(99, int(row.confidence * 60 + {"urgent": 39, "high": 28, "medium": 15, "low": 6}.get(row.priority, 5)))
            st.progress(risk / 100, text=f"#{row.id} · risk {risk} · {row.category} · {row.priority}")
    with insights_tab:
        total = len(frame)
        left, middle, right = st.columns(3)
        left.metric("Reports", total)
        middle.metric("Urgent/high", int(frame.priority.isin(["urgent", "high"]).sum()))
        right.metric("With evidence", int(frame.has_photo.sum()))
        st.bar_chart(frame.category.value_counts())
        st.dataframe(frame[["id", "location", "category", "priority", "confidence"]], use_container_width=True, hide_index=True)
