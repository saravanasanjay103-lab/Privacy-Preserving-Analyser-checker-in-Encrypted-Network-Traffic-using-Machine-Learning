"""Build the project's six-feature flow table from CICIDS2017 CSV files.

The source files are CICFlowMeter output. Duration and IAT values are in
microseconds; the project API uses seconds for flow_duration and milliseconds
for iat_mean/iat_std.
"""

import json
import os

import numpy as np
import pandas as pd


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
OUTPUT_PATH = os.path.join(DATA_DIR, "flows.csv")
AUDIT_PATH = os.path.join(DATA_DIR, "real_data_audit.json")
CHUNK_SIZE = 100_000

SOURCE_FILES = [
    "Monday-WorkingHours.pcap_ISCX.csv",
    "Friday-WorkingHours-Morning.pcap_ISCX.csv",
    "Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv",
]

SOURCE_COLUMNS = [
    "Flow Duration",
    "Total Fwd Packets",
    "Total Backward Packets",
    "Flow Bytes/s",
    "Flow IAT Mean",
    "Flow IAT Std",
    "Average Packet Size",
    "Label",
]


def _clean_column_names(columns):
    return [column.strip() for column in columns]


def _map_chunk(raw):
    # Explicit CICFlowMeter -> project mapping. CICFlowMeter durations/IATs
    # are microseconds, while the app and model use seconds/ms respectively.
    mapped = pd.DataFrame({
        "packet_count": raw["Total Fwd Packets"] + raw["Total Backward Packets"],
        "avg_packet_size": raw["Average Packet Size"],
        "flow_duration": raw["Flow Duration"] / 1_000_000,
        "byte_rate": raw["Flow Bytes/s"],
        "iat_mean": raw["Flow IAT Mean"] / 1_000,
        "iat_std": raw["Flow IAT Std"] / 1_000,
        "label": (raw["Label"].str.strip().str.upper() != "BENIGN").astype(int),
    })
    return mapped


def build_dataset():
    frames = []
    audit = {
        "source": "CICIDS2017 MachineLearningCSV / CICFlowMeter output",
        "source_files": SOURCE_FILES,
        "source_dates": "Monday July 3, 2017 and Friday July 7, 2017",
        "attack_types": ["Botnet ARES", "PortScan"],
        "rows_read": 0,
        "rows_dropped_non_numeric_or_infinite": 0,
        "rows_dropped_duplicate": 0,
    }

    for filename in SOURCE_FILES:
        path = os.path.join(DATA_DIR, filename)
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"Missing {path}. Download CICIDS2017 MachineLearningCSV files "
                "listed in README.md before running this script."
            )

        for raw in pd.read_csv(
            path,
            usecols=SOURCE_COLUMNS,
            chunksize=CHUNK_SIZE,
            low_memory=False,
            skipinitialspace=True,
        ):
            raw.columns = _clean_column_names(raw.columns)
            audit["rows_read"] += len(raw)
            mapped = _map_chunk(raw)
            numeric = mapped.apply(pd.to_numeric, errors="coerce")
            finite = np.isfinite(numeric).all(axis=1)
            audit["rows_dropped_non_numeric_or_infinite"] += int((~finite).sum())
            frames.append(numeric.loc[finite])

    cleaned = pd.concat(frames, ignore_index=True)
    before_dedupe = len(cleaned)
    cleaned = cleaned.drop_duplicates().reset_index(drop=True)
    audit["rows_dropped_duplicate"] = before_dedupe - len(cleaned)
    audit["rows_written"] = len(cleaned)
    audit["class_counts"] = {
        "Normal": int((cleaned["label"] == 0).sum()),
        "Threat": int((cleaned["label"] == 1).sum()),
    }
    audit["mapping"] = {
        "packet_count": "Total Fwd Packets + Total Backward Packets",
        "avg_packet_size": "Average Packet Size",
        "flow_duration": "Flow Duration / 1,000,000 (microseconds -> seconds)",
        "byte_rate": "Flow Bytes/s (bytes per second)",
        "iat_mean": "Flow IAT Mean / 1,000 (microseconds -> milliseconds)",
        "iat_std": "Flow IAT Std / 1,000 (microseconds -> milliseconds)",
        "label": "Label: BENIGN -> 0, every attack label -> 1",
    }

    cleaned.to_csv(OUTPUT_PATH, index=False)
    with open(AUDIT_PATH, "w", encoding="utf-8") as handle:
        json.dump(audit, handle, indent=2)

    print(json.dumps(audit, indent=2))
    print(f"Saved cleaned data -> {OUTPUT_PATH}")


if __name__ == "__main__":
    build_dataset()