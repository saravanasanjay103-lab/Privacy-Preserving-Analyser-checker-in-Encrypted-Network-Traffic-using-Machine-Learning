"""
explain.py
----------
The "new addition" to the project: turns a bare Normal/Threat prediction
into a human-readable explanation + a counterfactual "what-if" message.

Two explanation backends:
  1. Real SHAP (TreeExplainer) -> used automatically if `shap` is installed.
  2. A lightweight custom fallback explainer -> used if shap is unavailable
     (e.g. offline environments). It approximates per-flow, per-feature
     "contribution" as:

         contribution_i = feature_importance_i * z_score_i

     where z_score_i = (value_i - benign_mean_i) / benign_std_i

     This keeps the same spirit as SHAP (global importance combined with
     how unusual THIS flow's value is vs. the benign baseline) without
     needing the shap package. Swap in real SHAP by installing it — no
     other code changes needed, this module auto-detects it.

Counterfactual message:
   For the single most-contributing feature, reports how far the flow's
   value is from the benign mean, and what value would bring it back
   in line (a simple, explainable "nearest normal" counterfactual —
   not a full multi-feature optimizer, which is out of scope for a
   mini project).
"""

import json
import pickle
import os
import numpy as np
import pandas as pd

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "models", "rf_model.pkl")
STATS_PATH = os.path.join(BASE_DIR, "models", "class_stats.json")

try:
    import shap
    _HAS_SHAP = True
except ImportError:
    _HAS_SHAP = False


class FlowExplainer:
    def __init__(self):
        with open(MODEL_PATH, "rb") as f:
            self.model = pickle.load(f)
        with open(STATS_PATH, "r") as f:
            self.stats = json.load(f)
        self.features = self.stats["features"]
        self.importance = self.stats["feature_importance"]
        self.normal_stats = self.stats["Normal"]

        if _HAS_SHAP:
            self._shap_explainer = shap.TreeExplainer(self.model)

    # ------------------------------------------------------------------
    def predict(self, flow: dict):
        """flow: dict of {feature_name: value}. Returns (label, probability)."""
        self._validate_flow(flow)
        x = pd.DataFrame([[flow[f] for f in self.features]], columns=self.features)
        pred = self.model.predict(x)[0]
        proba = self.model.predict_proba(x)[0][1]  # P(Threat)
        label = "Threat" if pred == 1 else "Normal"
        return label, float(proba)

    # ------------------------------------------------------------------
    def _contributions(self, flow: dict):
        """Returns list of (feature, contribution_score, z_score) sorted desc."""
        self._validate_flow(flow)
        x = pd.DataFrame([[flow[f] for f in self.features]], columns=self.features)

        if _HAS_SHAP:
            shap_values = self._shap_explainer.shap_values(x)
            # shap_values shape handling across shap versions (list vs array)
            if isinstance(shap_values, list):
                vals = shap_values[1][0]  # class index 1 = Threat
            else:
                values = np.asarray(shap_values)
                if values.ndim == 3:
                    vals = values[0, :, 1]
                else:
                    vals = values[0]
            contributions = list(zip(self.features, vals))
        else:
            contributions = []
            for feat in self.features:
                mean = self.normal_stats[feat]["mean"]
                std = self.normal_stats[feat]["std"] or 1e-6
                z = (flow[feat] - mean) / std
                score = self.importance[feat] * z
                contributions.append((feat, score))

        contributions.sort(key=lambda t: -abs(t[1]))
        return contributions

    def _validate_flow(self, flow: dict):
        missing = [feature for feature in self.features if feature not in flow]
        if missing:
            raise ValueError(f"Missing required features: {', '.join(missing)}")
        invalid = [
            feature for feature in self.features
            if not np.isfinite(float(flow[feature]))
        ]
        if invalid:
            raise ValueError(f"Features must be finite numbers: {', '.join(invalid)}")

    def feature_contributions(self, flow: dict):
        """Public helper for the web UI: {feature: contribution_score} in model feature order."""
        return {feat: float(score) for feat, score in self._contributions(flow)}

    # ------------------------------------------------------------------
    def explain(self, flow: dict, top_k: int = 3):
        label, proba = self.predict(flow)
        contributions = self._contributions(flow)[:top_k]

        reasons = []
        for feat, score in contributions:
            mean = self.normal_stats[feat]["mean"]
            direction = "higher" if flow[feat] > mean else "lower"
            reasons.append(
                f"{feat} = {flow[feat]:.1f} is {direction} than the normal "
                f"average of {mean:.1f}"
            )

        counterfactual = None
        if label == "Threat" and contributions:
            top_feat, _ = contributions[0]
            mean = self.normal_stats[top_feat]["mean"]
            counterfactual = (
                f"If '{top_feat}' were closer to {mean:.1f} "
                f"(instead of {flow[top_feat]:.1f}), this flow would likely "
                f"be classified as Normal."
            )

        return {
            "label": label,
            "confidence": round(proba if label == "Threat" else 1 - proba, 4),
            "top_reasons": reasons,
            "counterfactual": counterfactual,
            "explainer_backend": "SHAP" if _HAS_SHAP else "custom-fallback",
        }
