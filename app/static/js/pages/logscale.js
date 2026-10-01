(function () {
  const $ = (id) => document.getElementById(id);
  const labels = {"packet_count": "Packet Count", "avg_packet_size": "Avg Packet Size (bytes)", "flow_duration": "Flow Duration (s)", "byte_rate": "Byte Rate (bytes/s)", "iat_mean": "IAT Mean (ms)", "iat_std": "IAT Std Dev (ms)"};
  let data, scale = "log", ymode = "share";
  const host = $("ls-chart");

  function render() {
    if (!data) return;
    const feat = $("ls-feature").value, d = data[feat], log = scale === "log";
    const edges = log ? d.log_edges : d.lin_edges;
    const mk = (cls) => {
      const c = d.classes[cls][log ? "log_counts" : "lin_counts"];
      const tot = d.classes[cls].n;
      return ymode === "share" ? c.map((v) => v / tot) : c;
    };
    const counts = { Normal: d.classes.Normal[log ? "log_counts" : "lin_counts"], Threat: d.classes.Threat[log ? "log_counts" : "lin_counts"] };
    XAI.histChart(host, {
      edges: edges, xlog: log, counts: counts,
      series: [{ name: "Normal", color: XAI.css("--green"), values: mk("Normal") }, { name: "Threat", color: XAI.css("--red"), values: mk("Threat") }],
      title: labels[feat] + (log ? " (log axis)" : " (linear axis)"),
      xlabel: labels[feat], ylabel: ymode === "share" ? "share of class per bin" : "flows per bin",
      yfmt: ymode === "share" ? (v) => (v * 100).toFixed(v < .1 ? 1 : 0) + "%" : XAI.fmt,
    });
    const N = d.classes.Normal, T = d.classes.Threat, f = XAI.fmt;
    $("ls-tiles").innerHTML =
      `<div class="tile good"><small>Median, Normal</small><b>${f(N.stats.median)}</b><span>95th pct ${f(N.stats.p95)}</span></div>` +
      `<div class="tile bad"><small>Median, Threat</small><b>${f(T.stats.median)}</b><span>95th pct ${f(T.stats.p95)}</span></div>` +
      `<div class="tile"><small>Exact zeros, Normal</small><b>${XAI.pct(N.zeros / N.n)}</b><span>${XAI.int(N.zeros)} of ${XAI.int(N.n)} flows</span></div>` +
      `<div class="tile"><small>Exact zeros, Threat</small><b>${XAI.pct(T.zeros / T.n)}</b><span>${XAI.int(T.zeros)} of ${XAI.int(T.n)} flows${log ? "" : "; " + XAI.int(T.overflow) + " above axis"}</span></div>`;
    $("ls-badge").textContent = log ? "Log scale" : "Linear scale";
  }
  function seg(id, cb) {
    const box = $(id);
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      cb(b.dataset.v); render();
    });
  }
  seg("ls-scale", (v) => (scale = v)); seg("ls-y", (v) => (ymode = v));
  $("ls-feature").addEventListener("change", render);
  XAI.onResize(render);
  XAI.fetchJSON("/static/data/histograms.json").then((j) => { data = j; render(); })
    .catch(() => { host.innerHTML = '<p class="error" style="margin:16px">Data file missing. Run: python src/build_ui_data.py</p>'; });
})();
