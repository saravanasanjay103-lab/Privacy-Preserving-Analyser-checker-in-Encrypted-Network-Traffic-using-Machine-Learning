(function () {
  const $ = (id) => document.getElementById(id);
  let tech = "jitter";
  function load(t) {
    XAI.fetchJSON("/api/evasion?technique=" + t + "&base=botnet").then((d) => {
      const host = $("ev-chart"), pts = d.steps.map((s) => [s.x, s.p]);
      XAI.lineChart(host, {
        series: [{ name: "Threat probability", color: XAI.css("--orange"), data: pts, width: 2.4, area: true }],
        xlog: d.meta.log,
        ymin: 0, ymax: 1, xlabel: d.meta.x_label, ylabel: "P(threat)",
        yfmt: (v) => v.toFixed(1), xfmt: d.meta.log ? (v) => v.toExponential(0) : XAI.fmt,
        refs: [{ y: 0.5, label: "decision boundary", color: XAI.css("--muted") }],
        tip: (rows) => `${d.meta.x_label}: <b>${d.meta.log ? rows[0].d[0].toExponential(2) : XAI.fmt(rows[0].d[0])}</b><br>P(threat): <b>${(rows[0].d[1] * 100).toFixed(1)}%</b>`,
      });
      $("ev-start").textContent = (pts[0][1] * 100).toFixed(1) + "%";
      $("ev-end").textContent = (pts[pts.length - 1][1] * 100).toFixed(1) + "%";
      const endTile = $("ev-tile-end"); endTile.className = "tile " + (pts[pts.length - 1][1] < 0.5 ? "bad" : "good");
      const cross = d.steps.find((s) => s.p < 0.5);
      $("ev-cross").textContent = cross ? XAI.fmt(cross.value) : "never";
      $("ev-tile-cross").className = "tile " + (cross ? "bad" : "good");
      $("ev-note").innerHTML = cross
        ? `<b>Evasion succeeds.</b> Once ${d.meta.x_label.split(" (")[0]} reaches about <b>${XAI.fmt(cross.value)}</b>, the model's threat score drops below the 0.50 decision boundary and the flow slips through as "Normal".`
        : `<b>Evasion does not fully succeed</b> in the range swept here - the threat score stays at or above 0.50 throughout.`;
    }).catch((err) => {
      console.error("Failed to load evasion data", err);
      $("ev-note").innerHTML = '<span class="error">Unable to load evasion data.</span>';
    });
  }
  $("ev-tech").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return;
    $("ev-tech").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    tech = b.dataset.v; load(tech); });
  XAI.onResize(() => load(tech));
  load(tech);
})();
