# Limitations & Adversarial Robustness

- **Timing evasion:** the detector uses metadata and can rely on near-zero `iat_std` for regular beaconing. A C2 operator can add randomized jitter to beacon intervals; in the demo, 15 ms Gaussian jitter raises `iat_std` from 0.0 to about 11.5 ms and flips the calibrated real-data profile from **Threat (96.4%)** to **Normal (53.6%)**.
- **Other evadable features:** padding can move `avg_packet_size`, while throttling can move `byte_rate`. Feature-based detection is therefore not a permanent signature.
- **Future work, not implemented here:** combine weakly correlated features, add spectral/FFT periodicity detection, and score populations of related flows rather than one flow at a time.