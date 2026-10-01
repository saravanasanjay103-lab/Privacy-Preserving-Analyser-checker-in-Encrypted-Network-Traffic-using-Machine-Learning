(function () {
  const host = document.getElementById("sankey");
  function draw(m) {
    if (!m || !m.confusion) return;
    host.querySelectorAll("svg,.tip").forEach((n) => n.remove());
    const W = Math.max(320, host.clientWidth), H = Math.max(420, host.clientHeight || 420);
    const svg = XAI.el("svg", { viewBox: `0 0 ${W} ${H}`, height: H });
    host.appendChild(svg);
    const green = XAI.css("--green"), red = XAI.css("--red"), yellow = XAI.css("--yellow");
    const total = m.confusion.tn + m.confusion.fp + m.confusion.fn + m.confusion.tp;

    // columns: 0 actual, 1 verdict, 2 outcome
    const colX = [w(0.1), w(0.47), w(0.86)];
    function w(f) { return f * W; }
    const nodeW = 16, top = 26, bot = H - 20, usable = bot - top;
    const gap = 14;

    // node values
    const nA = { Normal: m.confusion.tn + m.confusion.fp, Threat: m.confusion.fn + m.confusion.tp };
    const nV = { "Predicted Normal": m.confusion.tn + m.confusion.fn, "Predicted Threat": m.confusion.fp + m.confusion.tp };
    const nO = { Correct: m.confusion.tn + m.confusion.tp, "False alarm": m.confusion.fp, "Missed threat": m.confusion.fn };

    function layout(vals) {
      const keys = Object.keys(vals), sum = Object.values(vals).reduce((a, b) => a + b, 0) || 1;
      const avail = usable - gap * (keys.length - 1);
      let y = top, out = {};
      keys.forEach((k) => { const h = Math.max(2, (vals[k] || 0) / sum * avail); out[k] = { y0: y, y1: y + h, h }; y += h + gap; });
      return out;
    }
    const LA = layout(nA), LV = layout(nV), LO = layout(nO);
    const colorA = { Normal: green, Threat: red };
    const colorO = { Correct: green, "False alarm": yellow, "Missed threat": red };

    function node(x, box, label, color, sub) {
      XAI.el("rect", { x: x, y: box.y0, width: nodeW, height: Math.max(2, box.h), rx: 3, fill: color }, svg);
      const midx = x < W / 2 ? x + nodeW + 10 : x - 10;
      const anchor = x < W / 2 ? "start" : "end";
      const t = XAI.el("text", { x: midx, y: (box.y0 + box.y1) / 2 - 3, "text-anchor": anchor, style: "fill:" + XAI.css("--text") + ";font-size:13px;font-weight:600" }, svg, label);
      XAI.el("text", { x: midx, y: (box.y0 + box.y1) / 2 + 13, "text-anchor": anchor }, svg, sub);
    }
    node(colX[0], LA.Normal, "Normal", green, XAI.int(nA.Normal) + " flows");
    node(colX[0], LA.Threat, "Threat", red, XAI.int(nA.Threat) + " flows");
    node(colX[1], LV["Predicted Normal"], "Predicted Normal", XAI.css("--muted"), XAI.int(nV["Predicted Normal"]));
    node(colX[1], LV["Predicted Threat"], "Predicted Threat", XAI.css("--muted"), XAI.int(nV["Predicted Threat"]));
    node(colX[2], LO.Correct, "Correct", green, XAI.int(nO.Correct));
    node(colX[2], LO["False alarm"], "False alarm", yellow, XAI.int(nO["False alarm"]));
    node(colX[2], LO["Missed threat"], "Missed threat", red, XAI.int(nO["Missed threat"]));

    const tip = XAI.tipFor(host);
    // simpler: precompute per-node running offset and draw ribbons using explicit pairs
    function ribbon(x0, ny0, h0, x1, ny1, h1, color, label) {
      const xm = (x0 + nodeW + x1) / 2;
      const p0t = ny0, p0b = ny0 + h0, p1t = ny1, p1b = ny1 + h1;
      const d = `M${x0 + nodeW},${p0t} C${xm},${p0t} ${xm},${p1t} ${x1},${p1t} L${x1},${p1b} C${xm},${p1b} ${xm},${p0b} ${x0 + nodeW},${p0b} Z`;
      const path = XAI.el("path", { d: d, fill: color, opacity: .45 }, svg);
      path.addEventListener("pointerenter", (e) => {
        tip.style.display = "block"; tip.innerHTML = label;
        XAI.placeTip(host, tip, (x0 + x1) / 2, (p0t + p1b) / 2);
      });
      path.addEventListener("pointerleave", () => (tip.style.display = "none"));
      path.addEventListener("pointermove", (e) => { const r = host.getBoundingClientRect(); XAI.placeTip(host, tip, e.clientX - r.left, e.clientY - r.top); });
    }
    // Column A -> V: track running y within each side
    let aY = { Normal: LA.Normal.y0, Threat: LA.Threat.y0 };
    let vYin = { "Predicted Normal": LV["Predicted Normal"].y0, "Predicted Threat": LV["Predicted Threat"].y0 };
    const av = [
      ["Normal", "Predicted Normal", m.confusion.tn, green],
      ["Normal", "Predicted Threat", m.confusion.fp, yellow],
      ["Threat", "Predicted Normal", m.confusion.fn, red],
      ["Threat", "Predicted Threat", m.confusion.tp, green],
    ];
    av.forEach(([a, v, count, color]) => {
      if (!count) return;
      const countA = nA[a] || 1, countV = nV[v] || 1;
      const hA = Math.max(1, count / countA * LA[a].h), hV = Math.max(1, count / countV * LV[v].h);
      ribbon(colX[0], aY[a], hA, colX[1], vYin[v], hV, color, `${a} &rarr; ${v}<br><b>${XAI.int(count)}</b> flows`);
      aY[a] += hA; vYin[v] += hV;
    });
    let vYout = { "Predicted Normal": LV["Predicted Normal"].y0, "Predicted Threat": LV["Predicted Threat"].y0 };
    let oY = { Correct: LO.Correct.y0, "False alarm": LO["False alarm"].y0, "Missed threat": LO["Missed threat"].y0 };
    const vo = [
      ["Predicted Normal", "Correct", m.confusion.tn, green],
      ["Predicted Normal", "Missed threat", m.confusion.fn, red],
      ["Predicted Threat", "False alarm", m.confusion.fp, yellow],
      ["Predicted Threat", "Correct", m.confusion.tp, green],
    ];
    vo.forEach(([v, o, count, color]) => {
      if (!count) return;
      const countV = nV[v] || 1, countO = nO[o] || 1;
      const hV = Math.max(1, count / countV * LV[v].h), hO = Math.max(1, count / countO * LO[o].h);
      ribbon(colX[1], vYout[v], hV, colX[2], oY[o], hO, color, `${v} &rarr; ${o}<br><b>${XAI.int(count)}</b> flows`);
      vYout[v] += hV; oY[o] += hO;
    });
  }
  XAI.fetchJSON("/static/data/metrics.json").then((m) => { draw(m); XAI.onResize(() => draw(m)); })
    .catch(() => { host.innerHTML = '<p class="error" style="margin:16px">Data file missing. Run: python src/build_ui_data.py</p>'; });
})();
