"""
generate_data.py
-----------------
Generates a SYNTHETIC dataset of encrypted-traffic FLOW METADATA
(no payload content — only statistical/behavioral features), to stand in
for real captures (e.g. CICFlowMeter output on CICIDS2017/ISCXVPN2016).

Why synthetic here: this sandbox has no internet access to download the
real datasets. The generator is built so you can swap it out for a real
CSV with the SAME column names and everything downstream (train_model.py,
explain.py, demo.py) keeps working unchanged.

Features (kept intentionally small + human-interpretable, per project scope):
    packet_count            - total packets in the flow
    avg_packet_size         - mean packet size in bytes
    flow_duration           - total flow duration in seconds
    byte_rate               - bytes transferred per second
    iat_mean                - mean inter-arrival time between packets (ms)
    iat_std                 - std-dev of inter-arrival time (ms) -> low std
                               means "too regular" (often automated/beaconing)

Label:
    label = 0 -> Normal
    label = 1 -> Threat
"""

import numpy as np
import pandas as pd
import os

RNG = np.random.default_rng(42)

N_NORMAL = 3200
N_THREAT = 800   # imbalanced on purpose -> realistic IDS class ratio


def make_normal(n):
    packet_count = RNG.normal(85, 30, n).clip(5, 300)
    avg_packet_size = RNG.normal(650, 220, n).clip(60, 1500)
    flow_duration = RNG.gamma(shape=2.0, scale=6.0, size=n).clip(0.2, 90)
    # human/app traffic is bursty but not perfectly steady -> higher iat_std
    iat_mean = RNG.normal(40, 15, n).clip(2, 200)
    iat_std = RNG.normal(28, 10, n).clip(3, 120)
    byte_rate = (packet_count * avg_packet_size) / flow_duration
    return packet_count, avg_packet_size, flow_duration, byte_rate, iat_mean, iat_std


def make_threat(n):
    # Mix of two behaviours: (a) noisy high-volume scan/flood, (b) low-and-slow
    # regular beaconing (C2-style) -> very low iat_std is the tell.
    n_flood = n // 2
    n_beacon = n - n_flood

    # (a) flood / scan-like
    pc_f = RNG.normal(380, 90, n_flood).clip(150, 900)
    aps_f = RNG.normal(95, 35, n_flood).clip(40, 300)         # small packets
    dur_f = RNG.gamma(shape=1.2, scale=2.5, size=n_flood).clip(0.1, 20)  # short & sharp
    iatm_f = RNG.normal(6, 3, n_flood).clip(0.5, 25)
    iats_f = RNG.normal(4, 2, n_flood).clip(0.2, 15)

    # (b) beaconing / C2 -> abnormally REGULAR timing (very low std)
    pc_b = RNG.normal(60, 15, n_beacon).clip(10, 150)
    aps_b = RNG.normal(200, 60, n_beacon).clip(60, 500)
    dur_b = RNG.gamma(shape=2.0, scale=10.0, size=n_beacon).clip(1, 120)
    iatm_b = RNG.normal(55, 12, n_beacon).clip(10, 150)
    iats_b = RNG.normal(2.5, 1.2, n_beacon).clip(0.1, 6)      # key anomaly signal

    packet_count = np.concatenate([pc_f, pc_b])
    avg_packet_size = np.concatenate([aps_f, aps_b])
    flow_duration = np.concatenate([dur_f, dur_b])
    iat_mean = np.concatenate([iatm_f, iatm_b])
    iat_std = np.concatenate([iats_f, iats_b])
    byte_rate = (packet_count * avg_packet_size) / flow_duration

    perm = RNG.permutation(n)
    return (packet_count[perm], avg_packet_size[perm], flow_duration[perm],
            byte_rate[perm], iat_mean[perm], iat_std[perm])


def build_dataset():
    pc_n, aps_n, dur_n, br_n, iatm_n, iats_n = make_normal(N_NORMAL)
    pc_t, aps_t, dur_t, br_t, iatm_t, iats_t = make_threat(N_THREAT)

    df = pd.DataFrame({
        "packet_count": np.concatenate([pc_n, pc_t]),
        "avg_packet_size": np.concatenate([aps_n, aps_t]),
        "flow_duration": np.concatenate([dur_n, dur_t]),
        "byte_rate": np.concatenate([br_n, br_t]),
        "iat_mean": np.concatenate([iatm_n, iatm_t]),
        "iat_std": np.concatenate([iats_n, iats_t]),
        "label": np.concatenate([np.zeros(N_NORMAL), np.ones(N_THREAT)]).astype(int),
    })

    df = df.sample(frac=1, random_state=42).reset_index(drop=True)  # shuffle
    return df


if __name__ == "__main__":
    df = build_dataset()
    out_path = os.path.join(os.path.dirname(__file__), "flows.csv")
    df.to_csv(out_path, index=False)
    print(f"Saved {len(df)} rows -> {out_path}")
    print(df["label"].value_counts().rename({0: "Normal", 1: "Threat"}))
    print(df.describe())
