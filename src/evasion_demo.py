"""Demonstrate a timing-jitter evasion against the trained real-data model."""

import os
import sys

import numpy as np

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE_DIR, "app"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from explain import FlowExplainer


def main():
    explainer = FlowExplainer()

    # This is a real Friday Botnet ARES row from the cleaned CICIDS-derived
    # table. The literal UI beacon preset is a separate representative row.
    beacon = {
        "packet_count": 2,
        "avg_packet_size": 9,
        "flow_duration": 0.000084,
        "byte_rate": 142857.1429,
        "iat_mean": 0.084,
        "iat_std": 0.0,
    }

    rng = np.random.default_rng(42)
    jittered_intervals = beacon["iat_mean"] + rng.normal(0, 15, 55)
    jittered = dict(beacon)
    jittered["iat_std"] = float(np.std(jittered_intervals, ddof=0))

    before = explainer.explain(beacon)
    after = explainer.explain(jittered)
    print("SHAP backend:", before["explainer_backend"])
    print("Starting real Botnet flow:", beacon)
    print("Before jitter:", before["label"], f"{before['confidence'] * 100:.1f}%")
    print("After 15 ms jitter:", after["label"], f"{after['confidence'] * 100:.1f}%")
    print("iat_std:", f"{beacon['iat_std']:.1f} -> {jittered['iat_std']:.1f} ms")


if __name__ == "__main__":
    main()