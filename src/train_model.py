"""
train_model.py
---------------
Trains a Random Forest on the flow-metadata features and saves:
  - the trained model
  - the class-wise feature means/stds (used later for counterfactual explanations)
  - a held-out test report (precision/recall/F1/AUC/false-positive-rate)

Run:  python3 src/train_model.py
"""

import os
import json
import pickle
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    classification_report, roc_auc_score, confusion_matrix
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(BASE_DIR, "data", "flows.csv")
MODEL_PATH = os.path.join(BASE_DIR, "models", "rf_model.pkl")
STATS_PATH = os.path.join(BASE_DIR, "models", "class_stats.json")

FEATURES = ["packet_count", "avg_packet_size", "flow_duration",
            "byte_rate", "iat_mean", "iat_std"]
LABEL = "label"


def main():
    df = pd.read_csv(DATA_PATH)
    required_columns = set(FEATURES + [LABEL])
    missing_columns = required_columns.difference(df.columns)
    if missing_columns:
        missing = ", ".join(sorted(missing_columns))
        raise ValueError(f"Dataset is missing required columns: {missing}")

    X = df[FEATURES]
    y = df[LABEL]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    # class_weight="balanced" -> important since threats are the minority class
    clf = RandomForestClassifier(
        n_estimators=300,
        max_depth=8,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    y_proba = clf.predict_proba(X_test)[:, 1]

    print("=== Classification report (test set) ===")
    print(classification_report(y_test, y_pred, target_names=["Normal", "Threat"]))

    auc = roc_auc_score(y_test, y_proba)
    print(f"ROC-AUC: {auc:.4f}")

    tn, fp, fn, tp = confusion_matrix(y_test, y_pred).ravel()
    fpr = fp / (fp + tn)
    print(f"False Positive Rate: {fpr:.4f}  (fp={fp}, tn={tn})")

    print("\n=== Global feature importance (Random Forest) ===")
    for feat, imp in sorted(zip(FEATURES, clf.feature_importances_),
                             key=lambda x: -x[1]):
        print(f"  {feat:20s} {imp:.4f}")

    # Save model
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(clf, f)
    print(f"\nSaved model -> {MODEL_PATH}")

    # Save per-class feature mean/std -> needed for explanation + counterfactuals
    stats = {}
    for cls_name, cls_val in [("Normal", 0), ("Threat", 1)]:
        subset = X_train[y_train == cls_val]
        stats[cls_name] = {
            feat: {
                "mean": float(subset[feat].mean()),
                "std": float(subset[feat].std(ddof=0)) or 1e-6,
            }
            for feat in FEATURES
        }
    stats["feature_importance"] = {f: float(i) for f, i in
                                    zip(FEATURES, clf.feature_importances_)}
    stats["features"] = FEATURES

    with open(STATS_PATH, "w") as f:
        json.dump(stats, f, indent=2)
    print(f"Saved class stats -> {STATS_PATH}")


if __name__ == "__main__":
    main()
