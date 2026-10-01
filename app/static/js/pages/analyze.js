/* Packet timing monitor: deterministic trace seeded from the current inputs. */
(function () {
  const svg = document.getElementById("pulse"), mode = document.getElementById("trace-mode");
  const label = document.getElementById("verdict-label");
  const verdict = label ? label.textContent.trim() : "";
  const val = (id, d) => { const v = Number(document.getElementById(id).value); return isFinite(v) ? v : d; };
  const seeded = (seed) => { let v = seed >>> 0; return () => ((v = (v * 1664525 + 1013904223) >>> 0) / 4294967296); };

  function draw() {
    svg.innerHTML = "";
    const W = 900, H = 170, base = H * .58;
    const mean = Math.max(.01, val("iat_mean", 40)), sd = Math.max(0, val("iat_std", 20)), size = Math.max(1, val("avg_packet_size", 150));
    const rnd = seeded(Math.floor((mean * 17 + sd * 31 + size * 7) * 100));
    const col = verdict === "Threat" ? XAI.css("--red") : verdict === "Normal" ? XAI.css("--green") : XAI.css("--orange");
    const amp = Math.min(58, 13 + Math.log10(size + 1) * 12);
    XAI.el("line", { x1: 0, x2: W, y1: base, y2: base, stroke: XAI.css("--grid") }, svg);
    let x = 0, d = `M0,${base}`;
    while (x <= W) {
      const w = 16 + Math.min(60, (mean / (mean + sd + 1)) * 44) + rnd() * 9;
      const j = (rnd() - .5) * Math.min(28, sd / (mean + 1) * 18);
      d += `L${x},${base}L${x + w * .34},${base - amp - j}L${x + w * .68},${base + j * .18}L${x + w},${base}`;
      x += w;
    }
    XAI.el("path", { d: d, fill: "none", stroke: col, "stroke-width": 2, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }, svg);
    mode.textContent = verdict === "Threat" ? "irregular timing flagged" : verdict === "Normal" ? "within normal range" : "awaiting flow";
  }
  document.querySelectorAll("form input").forEach((i) => i.addEventListener("input", draw));
  draw(); window.addEventListener("themechange", draw);
})();
