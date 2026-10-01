(function () {
  const host = document.getElementById("net-chart");
  let DATA, pos = [], sel = null, th = 0.5, view = { x: 0, y: 0, k: 1 };
  let drawPending = false;

  function scheduleDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(() => { drawPending = false; draw(); });
  }

  function layout(n) {
    // deterministic force-ish layout: seeded circle + jitter, then a few relax passes
    let s = 99; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const R = 190, pts = n.nodes.map((_, i) => {
      const a = (i / n.nodes.length) * Math.PI * 2;
      return { x: Math.cos(a) * R * (0.55 + rnd() * 0.45), y: Math.sin(a) * R * (0.55 + rnd() * 0.45) };
    });
    for (let iter = 0; iter < 220; iter++) {
      const fx = pts.map(() => 0), fy = pts.map(() => 0);
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        let dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d2 = dx * dx + dy * dy + 0.01;
        const f = 900 / d2; const d = Math.sqrt(d2); dx /= d; dy /= d;
        fx[i] += dx * f; fy[i] += dy * f; fx[j] -= dx * f; fy[j] -= dy * f;
      }
      n.edges.forEach(([i, j]) => {
        const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y, d = Math.hypot(dx, dy) || 1;
        const f = (d - 70) * 0.02;
        fx[i] += dx / d * f; fy[i] += dy / d * f; fx[j] -= dx / d * f; fy[j] -= dy / d * f;
      });
      pts.forEach((p, i) => { p.x += Math.max(-6, Math.min(6, fx[i])) * 0.9; p.y += Math.max(-6, Math.min(6, fy[i])) * 0.9;
        p.x *= 0.995; p.y *= 0.995; });
    }
    return pts;
  }

  function draw() {
    if (!DATA || !DATA.nodes || !pos || !pos.length) return;
    host.querySelectorAll("svg,.tip").forEach((n) => n.remove());
    const W = Math.max(320, host.clientWidth), H = host.clientHeight || 480;
    const svg = XAI.el("svg", { viewBox: `0 0 ${W} ${H}` });
    host.appendChild(svg);
    const g = XAI.el("g", { transform: `translate(${W / 2 + view.x},${H / 2 + view.y}) scale(${view.k})` }, svg);
    const flagged = new Set(DATA.nodes.map((n, i) => (n.p >= th ? i : -1)).filter((i) => i >= 0));
    DATA.edges.forEach(([i, j]) => {
      if (pos[i] && pos[j]) {
        XAI.el("line", { x1: pos[i].x, y1: pos[i].y, x2: pos[j].x, y2: pos[j].y, stroke: XAI.css("--line"), "stroke-width": 1 / view.k }, g);
      }
    });
    DATA.nodes.forEach((n, i) => {
      if (!pos[i]) return;
      const c = XAI.el("circle", { cx: pos[i].x, cy: pos[i].y, r: (sel === i ? 9 : 6.5) / view.k, fill: flagged.has(i) ? XAI.css("--red") : XAI.css("--green"),
        stroke: sel === i ? XAI.css("--text") : "none", "stroke-width": 2 / view.k, style: "cursor:pointer" }, g);
      c.addEventListener("click", (ev) => { ev.stopPropagation(); sel = i; draw(); showDetail(i); });
    });
    svg.addEventListener("pointerdown", (e0) => {
      const sx = e0.clientX, sy = e0.clientY, ox = view.x, oy = view.y;
      function move(e) { view.x = ox + (e.clientX - sx); view.y = oy + (e.clientY - sy); scheduleDraw(); }
      function up() { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); }
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    });
    svg.addEventListener("wheel", (e) => { e.preventDefault(); view.k = Math.max(0.5, Math.min(3, view.k * (e.deltaY > 0 ? 0.9 : 1.1))); scheduleDraw(); }, { passive: false });
    const badgeEl = document.getElementById("net-badge");
    if (badgeEl) badgeEl.textContent = flagged.size + " of " + DATA.nodes.length + " flagged";
    const listEl = document.getElementById("net-list");
    if (listEl) {
      listEl.innerHTML = [...flagged].sort((a, b) => DATA.nodes[b].p - DATA.nodes[a].p).slice(0, 12).map((i) => {
        const n = DATA.nodes[i];
        return `<button class="flag" data-i="${i}" aria-pressed="${sel === i}"><span class="top"><b>${n.id}</b><span>${(n.p * 100).toFixed(0)}%</span></span><div class="bar"><i style="width:${n.p * 100}%"></i></div><small>${n.y ? "true threat" : "false alarm"}</small></button>`;
      }).join("") || '<p class="conf">None at this threshold.</p>';
      listEl.querySelectorAll(".flag").forEach((b) => b.addEventListener("click", () => { sel = +b.dataset.i; draw(); showDetail(sel); }));
    }
  }
  function showDetail(i) {
    if (!DATA || !DATA.nodes || !DATA.nodes[i]) return;
    const n = DATA.nodes[i], d = document.getElementById("net-detail");
    if (!d) return;
    d.className = "";
    const rows = Object.entries(n.flow || {}).map(([k, v]) => `<tr><td>${k}</td><td class="num">${XAI.fmt(v)}</td></tr>`).join("");
    d.innerHTML = `<div class="verdict"><span class="big ${n.p >= th ? 'threat' : 'normal'}">${n.p >= th ? 'Threat' : 'Normal'}</span><span class="conf">${(n.p * 100).toFixed(1)}% score</span></div>
      <p class="conf" style="margin:6px 0 14px">${n.id} - true label: <b>${n.y ? 'Threat' : 'Normal'}</b></p>
      <ul class="reasons">${(n.reasons || []).map((r) => `<li>${r}</li>`).join("")}</ul>
      <table class="data mt" style="margin-top:14px"><tbody>${rows}</tbody></table>`;
  }
  const thEl = document.getElementById("net-th");
  if (thEl) {
    thEl.addEventListener("input", (e) => {
      th = +e.target.value;
      const thValEl = document.getElementById("net-th-val");
      if (thValEl) thValEl.textContent = th.toFixed(2);
      scheduleDraw();
    });
  }
  XAI.onResize(draw);
  XAI.fetchJSON("/static/data/network.json").then((j) => { DATA = j; pos = layout(j); draw(); })
    .catch(() => { host.innerHTML = '<p class="error" style="margin:16px">Data file missing. Run: python src/build_ui_data.py</p>'; });
})();
