"""
app.py
------
Multi-page Flask front-end for the Explainable Encrypted-Traffic IDS.

Pages
  /            Home            overview + live sample verdicts
  /analyze     Flow Inspector  enter/load a flow -> verdict, SHAP reasons, what-if
  /log-scale   Log Scale       feature distributions (Normal vs Threat) on log axes
  /metrics     Model Metrics   holdout report, ROC / PR, threshold explorer
  /flow        Decision Flow   Sankey: actual class -> model verdict -> outcome
  /network     Flow Network    interactive similarity graph with threat threshold
  /evasion     Evasion Lab     jitter / padding / throttling what-if simulator
  /about       About           pipeline, data audit, limitations
  /contact     Contact         team + feedback

Run:
    python app/app.py        then open http://127.0.0.1:5000
"""

import json
import os
import sys
from functools import lru_cache

import numpy as np
import pandas as pd

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE_DIR, "src"))

from flask import Flask, jsonify, render_template, request  # noqa: E402
from explain import FlowExplainer  # noqa: E402

app = Flask(__name__)
explainer = FlowExplainer()

FEATURE_LABELS = {
    "packet_count": "Packet Count",
    "avg_packet_size": "Avg Packet Size (bytes)",
    "flow_duration": "Flow Duration (seconds)",
    "byte_rate": "Byte Rate (bytes/sec)",
    "iat_mean": "Inter-Arrival Time Mean (ms)",
    "iat_std": "Inter-Arrival Time Std Dev (ms)",
}

PRESETS = {
    "normal": {"packet_count": 16, "avg_packet_size": 144.8125, "flow_duration": 15.523547,
               "byte_rate": 149.2571253207, "iat_mean": 1034.90313333333, "iat_std": 2759.70141604975},
    "scan": {"packet_count": 8, "avg_packet_size": 36.875, "flow_duration": 6.028684,
             "byte_rate": 48.93273557, "iat_mean": 861.2405714, "iat_std": 2269.015173},
    "beacon": {"packet_count": 7, "avg_packet_size": 48.57142857, "flow_duration": 0.237788,
               "byte_rate": 1429.845072, "iat_mean": 39.63133333, "iat_std": 95.806166},
}
PRESET_NAMES = {"normal": "Everyday browsing", "scan": "Port-scan burst", "beacon": "C2 beaconing"}


@lru_cache(maxsize=1)
def home_samples():
    keys = list(PRESETS)
    frame = pd.DataFrame([PRESETS[key] for key in keys], columns=explainer.features)
    labels = explainer.model.predict(frame)
    probabilities = explainer.model.predict_proba(frame)[:, 1]
    return tuple(
        {"key": key, "name": PRESET_NAMES[key],
         "label": "Threat" if label == 1 else "Normal",
         "confidence": float(probability if label == 1 else 1 - probability)}
        for key, label, probability in zip(keys, labels, probabilities)
    )

# Real Friday Botnet ARES row used by src/evasion_demo.py
BOTNET_ROW = {"packet_count": 2, "avg_packet_size": 9, "flow_duration": 0.000084,
              "byte_rate": 142857.1429, "iat_mean": 0.084, "iat_std": 0.0}

# Edit these to personalise the Contact page.
SITE = {
    "name": "XAI-IDS",
    "title": "Privacy-Preserving, Explainable Encrypted-Traffic IDS",
    "team": [
        {"name": "Narendran", "role": "Developer - CSE"},
        {"name": "Add teammate", "role": "Edit SITE['team'] in app/app.py"},
    ],
    "guide": {"name": "Project guide", "role": "Edit SITE['guide'] in app/app.py"},
    "email": "your.email@example.com",
}


def _read_json(*parts):
    path = os.path.join(BASE_DIR, *parts)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


AUDIT = _read_json("data", "real_data_audit.json") or {}
METRICS = _read_json("app", "static", "data", "metrics.json") or {}


app.jinja_env.globals["abs_pct"] = lambda v, mx: round(abs(v) / mx * 100, 1) if mx else 0


@app.context_processor
def inject_globals():
    return {"site": SITE}


def analyse(flow):
    """explain() plus per-feature contribution rows for the UI."""
    result = explainer.explain(flow)
    contrib = explainer.feature_contributions(flow)
    rows = []
    for feat in explainer.features:
        rows.append({
            "key": feat, "label": FEATURE_LABELS[feat], "value": flow[feat],
            "normal": explainer.stats["Normal"][feat]["mean"],
            "threat": explainer.stats["Threat"][feat]["mean"],
            "score": contrib[feat],
        })
    rows.sort(key=lambda r: -abs(r["score"]))
    result["contributions"] = rows
    return result


def render_analyze(values, result):
    return render_template("analyze.html", feature_labels=FEATURE_LABELS, values=values,
                           result=result, presets=PRESETS, preset_names=PRESET_NAMES)


# ------------------------------------------------------------------ pages
@app.route("/")
def home():
    return render_template("home.html", samples=home_samples(), audit=AUDIT, m=METRICS,
                           backend="SHAP" if hasattr(explainer, "_shap_explainer") else "custom-fallback")


@app.route("/analyze", methods=["GET", "POST"])
def analyze():
    result = None
    values = PRESETS["normal"]
    if request.method == "POST":
        try:
            flow = {f: float(request.form[f]) for f in FEATURE_LABELS}
            values = flow
            result = analyse(flow)
        except (ValueError, KeyError) as e:
            result = {"error": f"Invalid input: {e}"}
    return render_analyze(values, result)


@app.route("/preset/<name>")
def preset(name):
    """Quick-load a preset flow and analyse it."""
    flow = PRESETS.get(name, PRESETS["normal"])
    return render_analyze(flow, analyse(flow))


@app.route("/log-scale")
def log_scale():
    return render_template("logscale.html", feature_labels=FEATURE_LABELS)


@app.route("/metrics")
def metrics():
    return render_template("metrics.html", m=METRICS)


@app.route("/flow")
def flow_page():
    return render_template("flow.html", m=METRICS)


@app.route("/network")
def network():
    return render_template("network.html", feature_labels=FEATURE_LABELS)


@app.route("/evasion")
def evasion():
    return render_template("evasion.html", presets=PRESETS, botnet=BOTNET_ROW)


@app.route("/about")
def about():
    return render_template("about.html", audit=AUDIT, m=METRICS)


@app.route("/contact")
def contact():
    return render_template("contact.html")


# ------------------------------------------------------------------ JSON API
@app.route("/api/predict", methods=["POST"])
def api_predict():
    """JSON in: {feature: value,...}  ->  verdict, confidence, reasons, contributions."""
    try:
        data = request.get_json(force=True)
        flow = {f: float(data[f]) for f in FEATURE_LABELS}
        return jsonify(analyse(flow))
    except (ValueError, KeyError, TypeError) as e:
        return jsonify({"error": f"Invalid input: {e}"}), 400


@app.route("/api/evasion")
def api_evasion():
    """Sweep one evasion technique on a base flow and score every step with the real model."""
    base_key = request.args.get("base", "botnet")
    technique = request.args.get("technique", "jitter")
    base = dict(BOTNET_ROW if base_key == "botnet" else PRESETS["beacon"])

    steps = []
    if technique == "jitter":       # random delay added to beacon intervals (ms std-dev)
        for j in range(0, 51):
            rng = np.random.default_rng(42)
            f = dict(base)
            f["iat_std"] = float(np.std(base["iat_mean"] + rng.normal(0, j, 55), ddof=0))
            steps.append((j, f, "iat_std"))
        meta = {"x_label": "jitter added (ms, std-dev)", "unit": "ms", "log": False}
    elif technique == "padding":    # bytes padded onto every packet
        for p in range(0, 1501, 25):
            f = dict(base)
            f["avg_packet_size"] = base["avg_packet_size"] + p
            steps.append((p, f, "avg_packet_size"))
        meta = {"x_label": "padding per packet (bytes)", "unit": "bytes", "log": False}
    else:                           # throttling: byte_rate multiplied by a factor <= 1
        technique = "throttle"
        for k in range(0, 41):
            fac = 10 ** (-3 * k / 40)
            f = dict(base)
            f["byte_rate"] = base["byte_rate"] * fac
            steps.append((fac, f, "byte_rate"))
        meta = {"x_label": "byte-rate factor (x original)", "unit": "x", "log": True}

    frame = pd.DataFrame([f for _, f, _ in steps], columns=explainer.features)
    probabilities = explainer.model.predict_proba(frame)[:, 1]
    out = [
        {"x": x, "value": f[feat], "p": float(p)}
        for (x, f, feat), p in zip(steps, probabilities)
    ]
    return jsonify({"technique": technique, "base": base, "meta": meta, "steps": out,
                    "changed_feature": steps[0][2]})


if __name__ == "__main__":
    app.run(debug=False, port=5000)
