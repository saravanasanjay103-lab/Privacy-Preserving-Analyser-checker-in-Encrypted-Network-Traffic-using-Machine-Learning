# Privacy-Preserving, Explainable Encrypted-Traffic IDS

This mini-project classifies network flows using metadata only: packet counts,
sizes, timing, and rates. It never inspects payloads or breaks encryption. A
Random Forest produces a Normal/Threat verdict, while SHAP explains the result
and reports a simple counterfactual.

## Real-data pipeline

The reported model is trained on **CICIDS2017 MachineLearningCSV**, the
CICFlowMeter flow output published by the Canadian Institute for
Cybersecurity at [UNB's CICIDS2017 page](https://www.unb.ca/cic/datasets/ids-2017.html).
The source capture covers July 3-7, 2017. This rebuild uses Monday, July 3
(benign activity), and Friday, July 7 (Botnet ARES and PortScan activity).
The raw CSVs are intentionally not committed because of their size.

Place these files in `data/` before ingestion:

```text
Monday-WorkingHours.pcap_ISCX.csv
Friday-WorkingHours-Morning.pcap_ISCX.csv
Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv
```

Run the reproducible mapper and trainer:

```bash
python data/ingest_cicids2017.py
python src/train_model.py
python src/demo.py
```

`data/real_data_audit.json` records the cleaning counts. The run used 1,007,418
source rows, dropped 930 rows containing non-numeric or non-finite values
(including CICIDS2017 Infinity/NaN rate rows), dropped 357,169 duplicate
mapped rows, and wrote 649,319 rows. Class counts remain imbalanced:
646,060 Normal and 3,259 Threat. No rebalancing or undersampling was applied.
The duplicate count is after reducing raw flows to these six coarse features:
199,668 dropped rows were Normal and 157,501 were Threat. By within-class rate,
duplicates were disproportionately Threat (97.98% of finite Threat rows versus
23.61% of finite Normal rows), reflecting how many distinct attack flows
collapse to the same six-value representation.

### CICFlowMeter mapping

| Project feature | CICFlowMeter source and conversion |
|---|---|
| `packet_count` | `Total Fwd Packets + Total Backward Packets` |
| `avg_packet_size` | `Average Packet Size` |
| `flow_duration` | `Flow Duration / 1,000,000`, microseconds to seconds |
| `byte_rate` | `Flow Bytes/s`, already bytes per second |
| `iat_mean` | `Flow IAT Mean / 1,000`, microseconds to milliseconds |
| `iat_std` | `Flow IAT Std / 1,000`, microseconds to milliseconds |
| `label` | `BENIGN` becomes 0; every attack label becomes 1 |

## Real classification report

These are the unchanged `src/train_model.py` results on its stratified 25%
holdout (162,330 flows):

```text
              precision    recall  f1-score   support

      Normal       1.00      1.00      1.00    161515
      Threat       0.56      0.99      0.72       815

    accuracy                           1.00    162330
   macro avg       0.78      0.99      0.86    162330
weighted avg       1.00      1.00      1.00    162330

ROC-AUC: 0.9988
False Positive Rate: 0.0039 (fp=627, tn=160888)
Confusion matrix (rows=true, columns=predicted):
[[160888, 627],
 [11, 804]]
```

The metrics are not the synthetic 1.0000/1.0000/1.0000 result: Threat
precision is 0.56 and the holdout contains 11 false negatives. The strong AUC
should still be interpreted cautiously because the selected CICIDS2017 days
and attack mix are highly imbalanced.
Operationally, 627 of the 1,431 flows flagged Threat in the holdout were false
alarms, so roughly 44% of Threat alerts were false alarms.

## Features and explanations

The six model features are `packet_count`, `avg_packet_size`,
`flow_duration` (seconds), `byte_rate`, `iat_mean` (milliseconds), and
`iat_std` (milliseconds). The explainer was verified on the real model with
the **SHAP TreeExplainer** backend, not the fallback. Install dependencies
with `pip install -r requirements.txt` and run `python src/demo.py`.

`data/generate_data.py` remains only as an optional, clearly synthetic
offline/demo fallback. Its output is not used for the reported metrics.

## Web demo

```bash
python src/build_ui_data.py   # one-time: pre-computes the JSON behind the charts
python app/app.py
```

Open `http://127.0.0.1:5000`. The UI is now a multi-page site, all served from
the real trained model and the real cleaned dataset (no placeholder numbers):

| Page | Route | What it shows |
|---|---|---|
| Home | `/` | Live verdicts on three presets, dataset + holdout headline tiles |
| Flow Inspector | `/analyze` | Enter/load a flow, get verdict, SHAP reasons, what-if, feature-influence bars |
| Log Scale Analysis | `/log-scale` | Normal vs. Threat distribution of any feature, log or linear axis |
| Model Metrics | `/metrics` | Confusion matrix, ROC / PR curves, score histogram, threshold explorer, global importance |
| Decision Flow | `/flow` | Sankey: actual class -> predicted class -> outcome |
| Flow Network | `/network` | Similarity graph of 70 real holdout flows with an adjustable threat threshold |
| Evasion Lab | `/evasion` | Live re-scoring of the real Botnet ARES flow under jitter / padding / throttling |
| About | `/about` | Pipeline steps, dataset audit, limitations |
| Contact | `/contact` | Team info (edit `SITE` in `app/app.py`) |

Try the Normal, Port-scan, and C2 beaconing presets on the Flow Inspector -
these are representative rows drawn from the real CICIDS2017 data (Monday
benign, Friday PortScan, Friday Botnet ARES). `GET/POST /analyze` and
`POST /api/predict` (JSON) both run the real explainer; `GET /api/evasion`
sweeps one evasion technique against the real model and returns a score curve.

If you change the trained model or `data/flows.csv`, re-run
`python src/build_ui_data.py` to refresh the charts' JSON.

## Limitations & Adversarial Robustness

The detector can lean on near-zero `iat_std` as a signal for regular beaconing.
An attacker can add randomized jitter to beacon intervals, a standard C2
evasion technique, and move that feature toward benign traffic. The runnable
demo is `python src/evasion_demo.py`. Its starting flow is an actual Friday
Botnet ARES row, with these literal values: `packet_count=2`,
`avg_packet_size=9`, `flow_duration=0.000084` seconds,
`byte_rate=142857.1429`, `iat_mean=0.084` ms, and `iat_std=0.0` ms. It adds
`np.random.normal(0, 15, 55)` ms jitter to that row's inter-arrival times,
changing `iat_std` to about 11.5 ms. On the trained real-data model, the
profile flips from **Threat (96.4%)** to **Normal (53.6%)**.
This is a narrow flip just past the 50% decision boundary. A cheap available
mitigation would be to require more than 70% confidence before emitting a
Threat verdict; FFT periodicity and population-level detection remain
unimplemented future work.

This is a general feature-evasion property: padding can change
`avg_packet_size`, and throttling can change `byte_rate`. Future work could
combine weakly correlated features, use spectral/FFT periodicity detection,
and detect anomalies across populations of related flows rather than scoring
one flow in isolation. Those mitigations are not implemented here.

See [presentation_slide.md](presentation_slide.md) for the concise
presentation version of this limitation.