"""
demo.py
-------
End-to-end demo: feed a flow's metadata in, get back:
   - Normal / Threat verdict
   - confidence
   - top reasons (which features drove the decision)
   - a counterfactual "what-if" message

Run:  python3 src/demo.py
"""

from explain import FlowExplainer

SAMPLE_FLOWS = [
    {
        "name": "Everyday web browsing",
        "flow": {
            "packet_count": 16, "avg_packet_size": 144.8125, "flow_duration": 15.523547,
            "byte_rate": 149.2571253207, "iat_mean": 1034.90313333333,
            "iat_std": 2759.70141604975,
        },
    },
    {
        "name": "Port-scan-like burst",
        "flow": {
            "packet_count": 8, "avg_packet_size": 36.875, "flow_duration": 6.028684,
            "byte_rate": 48.93273557, "iat_mean": 861.2405714,
            "iat_std": 2269.015173,
        },
    },
    {
        "name": "C2 beaconing (very regular timing)",
        "flow": {
            "packet_count": 7, "avg_packet_size": 48.57142857, "flow_duration": 0.237788,
            "byte_rate": 1429.845072, "iat_mean": 39.63133333,
            "iat_std": 95.806166,
        },
    },
]


def main():
    explainer = FlowExplainer()

    for case in SAMPLE_FLOWS:
        print("=" * 70)
        print(f"Flow: {case['name']}")
        print(f"Metadata: {case['flow']}")

        result = explainer.explain(case["flow"])

        print(f"\n>> Verdict: {result['label']}  "
              f"(confidence: {result['confidence']*100:.1f}%)")
        print(f">> Explainer used: {result['explainer_backend']}")

        print(">> Top reasons:")
        for r in result["top_reasons"]:
            print(f"     - {r}")

        if result["counterfactual"]:
            print(f">> What-if: {result['counterfactual']}")
        print()


if __name__ == "__main__":
    main()
