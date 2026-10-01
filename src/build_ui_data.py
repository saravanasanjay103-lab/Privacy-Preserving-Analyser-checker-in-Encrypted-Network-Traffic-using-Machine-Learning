"""
build_ui_data.py
----------------
Pre-computes the JSON files that power the interactive pages of the web UI
(Log Scale, Metrics, Decision Flow, Network).  Everything is derived from the
real cleaned CICIDS2017 table (data/flows.csv) and the trained model.

Run (from the project root, after train_model.py):
    python src/build_ui_data.py
Output: app/static/data/*.json
"""
import json
import os
import sys
import warnings

import numpy as np
import pandas as pd
from sklearn.metrics import precision_recall_curve, roc_auc_score, roc_curve
from sklearn.model_selection import train_test_split

warnings.filterwarnings("ignore")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE, "src"))
from explain import FlowExplainer  # noqa: E402

OUT = os.path.join(BASE, "app", "static", "data")
os.makedirs(OUT, exist_ok=True)
FEATURES = ["packet_count", "avg_packet_size", "flow_duration", "byte_rate", "iat_mean", "iat_std"]


def dump(name, obj):
    with open(os.path.join(OUT, name), "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    print("wrote", name, os.path.getsize(os.path.join(OUT, name)), "bytes")


def thin(x, y, n=140):
    idx = np.unique(np.linspace(0, len(x) - 1, n).astype(int))
    return [[round(float(x[i]), 5), round(float(y[i]), 5)] for i in idx]


def main():
    df = pd.read_csv(os.path.join(BASE, "data", "flows.csv"))
    explainer = FlowExplainer()

    # ---------------- histograms (whole cleaned dataset) ----------------
    hist = {}
    for feat in FEATURES:
        v = df[feat].to_numpy(float)
        y = df["label"].to_numpy()
        pos = v[v > 0]
        lo, hi = np.floor(np.log10(pos.min())), np.ceil(np.log10(pos.max()))
        ledges = np.linspace(lo, hi, 61)
        p99 = float(np.percentile(v, 99))
        p99 = p99 if p99 > 0 else float(v.max())
        xedges = np.linspace(0, p99, 51)
        entry = {"log_edges": [round(float(10 ** e), 12) for e in ledges],
                 "lin_edges": [float(e) for e in xedges], "classes": {}}
        for cls, name in ((0, "Normal"), (1, "Threat")):
            c = v[y == cls]
            cp = c[c > 0]
            lc, _ = np.histogram(np.log10(cp), bins=ledges)
            nc, _ = np.histogram(c[c <= p99], bins=xedges)
            entry["classes"][name] = {
                "n": int(len(c)), "zeros": int((c == 0).sum()),
                "log_counts": lc.tolist(), "lin_counts": nc.tolist(),
                "overflow": int((c > p99).sum()),
                "stats": {k: float(val) for k, val in zip(
                    ["min", "p25", "median", "p75", "p95", "max", "mean"],
                    [c.min(), *np.percentile(c, [25, 50, 75, 95]), c.max(), c.mean()])},
            }
        hist[feat] = entry
    dump("histograms.json", hist)

    # ---------------- holdout metrics (same split as train_model.py) ----------------
    _, Xte, _, yte = train_test_split(df[FEATURES], df["label"], test_size=0.25,
                                      random_state=42, stratify=df["label"])
    proba = explainer.model.predict_proba(Xte)[:, 1]
    yt = yte.to_numpy()
    pred = explainer.model.predict(Xte)
    tp = int(((pred == 1) & (yt == 1)).sum()); fp = int(((pred == 1) & (yt == 0)).sum())
    fn = int(((pred == 0) & (yt == 1)).sum()); tn = int(((pred == 0) & (yt == 0)).sum())
    print("holdout confusion", tn, fp, fn, tp)

    sweep = []
    for t in np.round(np.arange(0.05, 1.0, 0.01), 2):
        p = proba >= t
        a = int((p & (yt == 1)).sum()); b = int((p & (yt == 0)).sum())
        c = int((~p & (yt == 1)).sum()); d = int((~p & (yt == 0)).sum())
        sweep.append({"t": float(t), "tp": a, "fp": b, "fn": c, "tn": d})

    fpr, tpr, _ = roc_curve(yt, proba)
    pr, rc, _ = precision_recall_curve(yt, proba)
    bins = np.linspace(0, 1, 21)
    hn, _ = np.histogram(proba[yt == 0], bins=bins)
    ht, _ = np.histogram(proba[yt == 1], bins=bins)
    prec = tp / (tp + fp); rec = tp / (tp + fn)
    dump("metrics.json", {
        "holdout": int(len(yt)), "support": {"Normal": int((yt == 0).sum()), "Threat": int((yt == 1).sum())},
        "confusion": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
        "precision": prec, "recall": rec, "f1": 2 * prec * rec / (prec + rec),
        "accuracy": (tp + tn) / len(yt), "fpr": fp / (fp + tn),
        "auc": float(roc_auc_score(yt, proba)),
        "roc": thin(fpr, tpr), "pr": thin(rc, pr),
        "sweep": sweep,
        "score_hist": {"edges": bins.tolist(), "Normal": hn.tolist(), "Threat": ht.tolist()},
        "importance": explainer.importance,
        "class_means": {c: {f: explainer.stats[c][f]["mean"] for f in FEATURES} for c in ("Normal", "Threat")},
    })

    # ---------------- network sample ----------------
    rng = np.random.default_rng(7)
    Xte = Xte.reset_index(drop=True)
    picks = []
    for mask, n in (((pred == 0) & (yt == 0), 30), ((pred == 1) & (yt == 0), 6),
                    ((pred == 0) & (yt == 1), 4), ((pred == 1) & (yt == 1), 30)):
        idx = np.flatnonzero(mask)
        picks += rng.choice(idx, size=min(n, len(idx)), replace=False).tolist()
    rng.shuffle(picks)
    nodes = []
    for i, ix in enumerate(picks):
        flow = {f: float(Xte.loc[ix, f]) for f in FEATURES}
        res = explainer.explain(flow, top_k=3)
        contrib = explainer.feature_contributions(flow)
        nodes.append({"id": f"Flow_{i + 1:02d}", "y": int(yt[ix]), "p": round(float(proba[ix]), 4),
                      "flow": flow, "reasons": res["top_reasons"],
                      "contrib": {k: round(v, 4) for k, v in contrib.items()}})
    M = np.log1p(np.array([[n["flow"][f] for f in FEATURES] for n in nodes]))
    M = (M - M.mean(0)) / (M.std(0) + 1e-9)
    D = np.linalg.norm(M[:, None] - M[None], axis=2)
    edges = set()
    for i in range(len(nodes)):
        for j in np.argsort(D[i])[1:4]:
            edges.add((min(i, int(j)), max(i, int(j))))
    dump("network.json", {"backend": explainer.stats and ("SHAP" if hasattr(explainer, "_shap_explainer") else "custom-fallback"),
                          "nodes": nodes, "edges": sorted(edges), "features": FEATURES})


if __name__ == "__main__":
    main()
