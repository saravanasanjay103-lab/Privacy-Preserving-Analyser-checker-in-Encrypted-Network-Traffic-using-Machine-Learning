/* Decorative hero trace: deterministic, static (no animation). */
(function () {
  const svg = document.getElementById("hero-trace");
  function draw() {
    svg.innerHTML = "";
    let s = 7;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const base = 46; let x = 0, d = `M0,${base}`;
    while (x < 760) {
      const w = 26 + rnd() * 26, h = 12 + rnd() * 30;
      d += `L${x + w * .3},${base}L${x + w * .45},${base - h}L${x + w * .6},${base + h * .35}L${x + w * .75},${base}L${x + w},${base}`;
      x += w;
    }
    XAI.el("line", { x1: 0, x2: 760, y1: base, y2: base, stroke: XAI.css("--line") }, svg);
    XAI.el("path", { d: d, fill: "none", stroke: XAI.css("--orange"), "stroke-width": 2, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }, svg);
  }
  draw(); window.addEventListener("themechange", draw);
})();
