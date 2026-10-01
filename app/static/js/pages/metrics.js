(function () {
  const $ = (id) => document.getElementById(id);
  let M, curve = "roc";

  function drawCurve() {
    if (!M || !M.roc || !M.pr) return;
    const pt = curve === "roc" ? M.roc : M.pr;
    const xl = curve === "roc" ? "False Positive Rate" : "Recall";
    const yl = curve === "roc" ? "True Positive Rate" : "Precision";
    $("curve-title").textContent = curve === "roc" ? "ROC curve" : "Precision-Recall curve";
    XAI.lineChart($("mx-curve-chart"), {
      series: [
        { name: curve.toUpperCase(), color: XAI.css("--orange"), data: pt, width: 2.4 },
        curve === "roc" ? { name: "Random", color: XAI.css("--muted"), data: [[0, 0], [1, 1]], dash: "5 4", width: 1.4 } : null,
      ].filter(Boolean),
      xmin: 0, xmax: 1, ymin: 0, ymax: 1, xlabel: xl, ylabel: yl,
      xfmt: (v) => v.toFixed(1), yfmt: (v) => v.toFixed(1),
      tip: (rows) => `${xl}: <b>${rows[0].d[0].toFixed(3)}</b><br>${yl}: <b>${rows[0].d[1].toFixed(3)}</b>`,
    });
  }
  function drawHist() {
    if (!M || !M.score_hist) return;
    XAI.histChart($("mx-hist"), {
      edges: M.score_hist.edges,
      series: [{ name: "Normal", color: XAI.css("--green"), values: M.score_hist.Normal }, { name: "Threat", color: XAI.css("--red"), values: M.score_hist.Threat }],
      xlabel: "predicted threat probability", ylabel: "flow count (log)", ylog: true, ymin: 1,
      xfmt: (v) => v.toFixed(1), yfmt: XAI.int,
    });
  }
  function drawImportance() {
    if (!M || !M.importance) return;
    const host = $("mx-imp");
    const entries = Object.entries(M.importance).sort((a, b) => b[1] - a[1]);
    const W = Math.max(300, host.clientWidth), rowH = 40, H = entries.length * rowH + 24;
    host.querySelectorAll("svg").forEach((s) => s.remove());
    const svg = XAI.el("svg", { viewBox: `0 0 ${W} ${H}`, height: H });
    host.insertBefore(svg, host.firstChild);
    const max = entries[0][1] || 1, left = 190, right = 70;
    entries.forEach(([k, v], i) => {
      const y = i * rowH + 20, w = (W - left - right) * (v / max);
      XAI.el("text", { x: left - 10, y: y + 5, "text-anchor": "end" }, svg, k);
      XAI.el("rect", { x: left, y: y - 10, width: Math.max(2, w), height: 20, rx: 5, fill: XAI.css("--orange") }, svg);
      XAI.el("text", { x: left + w + 8, y: y + 5, style: "fill:" + XAI.css("--text") }, svg, v.toFixed(3));
    });
  }
  function drawThreshold(t) {
    if (!M || !M.sweep || !M.sweep.length) return;
    const row = M.sweep.reduce((a, b) => Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a);
    const prec = row.tp / (row.tp + row.fp || 1), rec = row.tp / (row.tp + row.fn || 1);
    $("th-val").textContent = row.t.toFixed(2);
    $("th-tiles").innerHTML =
      `<div class="tile good"><small>Recall (catches attacks)</small><b>${XAI.pct(rec)}</b><span>${row.fn} threats missed</span></div>` +
      `<div class="tile"><small>Precision</small><b>${XAI.pct(prec)}</b><span>${row.tp} of ${row.tp + row.fp} alerts real</span></div>` +
      `<div class="tile bad"><small>False alarms</small><b>${XAI.int(row.fp)}</b><span>on ${XAI.int(row.tp + row.fp + row.tn + row.fn - row.fp)} clean flows</span></div>` +
      `<div class="tile"><small>Correctly cleared</small><b>${XAI.int(row.tn)}</b><span>true negatives</span></div>`;
  }

  $("mx-curve").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return;
    $("mx-curve").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    curve = b.dataset.v; drawCurve(); });
  $("th-slider").addEventListener("input", (e) => drawThreshold(+e.target.value));
  XAI.onResize(() => { if (M) { drawCurve(); drawHist(); drawImportance(); } });

  XAI.fetchJSON("/static/data/metrics.json").then((j) => { M = j; drawCurve(); drawHist(); drawImportance(); drawThreshold(0.5); })
    .catch(() => { document.querySelector(".page").insertAdjacentHTML("afterbegin", '<p class="error">Data file missing. Run: python src/build_ui_data.py</p>'); });
})();
