/* core.js - theme, nav and a tiny dependency-free SVG chart kit (works offline) */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const X = (window.XAI = {});

  /* ---------- theme + nav ---------- */
  const root = document.documentElement;
  document.getElementById("theme-btn").addEventListener("click", function () {
    const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("xai-theme", next); } catch (e) {}
    window.dispatchEvent(new Event("themechange"));
  });
  const menuBtn = document.getElementById("menu-btn"), links = document.getElementById("nav-links");
  menuBtn.addEventListener("click", function () {
    const open = links.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });

  /* ---------- helpers ---------- */
  X.css = (n) => getComputedStyle(root).getPropertyValue(n).trim();
  X.el = function (tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };
  X.fmt = function (n, d) {
    if (n == null || !isFinite(n)) return "-";
    const a = Math.abs(n);
    if (a === 0) return "0";
    if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
    if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    if (a >= 100) return n.toFixed(0);
    if (a >= 1) return n.toFixed(d == null ? 2 : d).replace(/\.?0+$/, "");
    if (a >= 0.001) return n.toFixed(4).replace(/\.?0+$/, "");
    return n.toExponential(1);
  };
  X.int = (n) => Math.round(n).toLocaleString("en-US");
  X.pct = (n, d) => (n * 100).toFixed(d == null ? 1 : d) + "%";
  X.fetchJSON = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); });
  X.onResize = function (fn) {
    let t; const run = () => { clearTimeout(t); t = setTimeout(fn, 80); };
    window.addEventListener("resize", run); window.addEventListener("themechange", fn);
  };

  function tipFor(host) {
    let t = host.querySelector(".tip");
    if (!t) { t = document.createElement("div"); t.className = "tip"; host.appendChild(t); }
    return t;
  }
  function placeTip(host, tip, px, py) {
    tip.style.display = "block";
    const w = tip.offsetWidth, h = tip.offsetHeight, W = host.clientWidth;
    let x = px + 14; if (x + w > W - 4) x = px - w - 14;
    tip.style.left = Math.max(4, x) + "px";
    tip.style.top = Math.max(4, Math.min(py - h / 2, host.clientHeight - h - 4)) + "px";
  }
  X.tipFor = tipFor; X.placeTip = placeTip;

  /* ---------- scale helpers ---------- */
  function niceStep(span, n) {
    if (span <= 0 || !isFinite(span)) return 1;
    const raw = span / Math.max(1, n || 5);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p;
  }
  function linTicks(a, b, n) {
    if (a >= b || !isFinite(a) || !isFinite(b)) return [a];
    const s = niceStep(b - a, n);
    if (s <= 0 || !isFinite(s)) return [a, b];
    const out = [];
    for (let v = Math.ceil(a / s) * s; v <= b + s * 1e-9; v += s) out.push(+v.toPrecision(12));
    return out;
  }
  function logTicks(a, b) {          // a,b are log10 bounds
    if (!isFinite(a) || !isFinite(b)) return [0];
    const min = Math.ceil(Math.min(a, b));
    const max = Math.floor(Math.max(a, b));
    if (max - min > 30) {
      return [min, Math.round((min + max) / 2), max];
    }
    const out = [];
    for (let e = min; e <= max; e++) out.push(e);
    return out;
  }

  /* ---------- generic frame: axes + grid ---------- */
  function frame(host, o) {
    host.querySelectorAll("svg").forEach((s) => s.remove());
    const W = Math.max(300, host.clientWidth), H = o.height || (W < 520 ? 270 : 340);
    const m = { l: o.ylabel ? 58 : 50, r: 18, t: o.title ? 34 : 14, b: o.xlabel ? 48 : 30 };
    const svg = X.el("svg", { viewBox: `0 0 ${W} ${H}`, height: H, role: "img", "aria-label": o.aria || o.title || "chart" });
    host.insertBefore(svg, host.firstChild);
    const pw = Math.max(10, W - m.l - m.r), ph = Math.max(10, H - m.t - m.b);
    const g = X.el("g", { transform: `translate(${m.l},${m.t})` }, svg);
    const grid = css("--grid");
    function css(n) { return X.css(n); }
    const dx = (o.x1 - o.x0) || 1;
    const dy = (o.y1 - o.y0) || 1;
    const sx = o.xlog ? (v) => (Math.log10(Math.max(v, 1e-300)) - o.x0) / dx * pw : (v) => (v - o.x0) / dx * pw;
    const sy = o.ylog ? (v) => ph - (Math.log10(Math.max(v, Math.pow(10, o.y0))) - o.y0) / dy * ph : (v) => ph - (v - o.y0) / dy * ph;
    const xt = o.xlog ? logTicks(o.x0, o.x1) : linTicks(o.x0, o.x1, Math.max(3, Math.floor(pw / 90)));
    const yt = o.ylog ? logTicks(o.y0, o.y1) : linTicks(o.y0, o.y1, 5);
    yt.forEach((t) => {
      const v = o.ylog ? Math.pow(10, t) : t, y = sy(v);
      X.el("line", { x1: 0, x2: pw, y1: y, y2: y, stroke: grid }, g);
      X.el("text", { x: -8, y: y + 4, "text-anchor": "end" }, g, (o.yfmt || X.fmt)(v));
    });
    xt.forEach((t) => {
      const v = o.xlog ? Math.pow(10, t) : t, x = sx(v);
      X.el("line", { x1: x, x2: x, y1: 0, y2: ph, stroke: grid }, g);
      X.el("text", { x: x, y: ph + 16, "text-anchor": "middle" }, g, (o.xfmt || X.fmt)(v));
    });
    if (o.title) X.el("text", { x: pw / 2, y: -16, "text-anchor": "middle", class: "ttl" }, g, o.title);
    if (o.xlabel) X.el("text", { x: pw / 2, y: ph + 40, "text-anchor": "middle" }, g, o.xlabel);
    if (o.ylabel) X.el("text", { transform: `translate(${-m.l + 14},${ph / 2}) rotate(-90)`, "text-anchor": "middle" }, g, o.ylabel);
    return { svg, g, W, H, m, pw, ph, sx, sy, o };
  }

  /* ---------- line chart ---------- */
  // o: {series:[{name,color,data:[[x,y]],dash,width}], xlog,ylog, xmin.. , refs:[{y|x,label,color}], tip(idxInfo)}
  X.lineChart = function (host, o) {
    const all = o.series.flatMap((s) => s.data);
    const xs = all.map((d) => d[0]), ys = all.map((d) => d[1]);
    const pos = (a) => a.filter((v) => v > 0);
    const minXVal = o.xlog ? Math.min(...pos(xs)) : Math.min(...xs);
    const maxXVal = Math.max(...xs);
    const xmin = o.xmin != null ? o.xmin : minXVal;
    const xmax = o.xmax != null ? o.xmax : (maxXVal > xmin ? maxXVal : xmin + 1);
    const minYVal = o.ylog ? Math.min(...pos(ys)) : Math.min(0, ...ys);
    const maxYVal = Math.max(...ys);
    const ymin = o.ymin != null ? o.ymin : minYVal;
    const ymax = o.ymax != null ? o.ymax : (maxYVal > ymin ? maxYVal : ymin + 1);
    const c = Object.assign({}, o, {
      x0: o.xlog ? Math.floor(Math.log10(Math.max(1e-300, xmin))) : xmin,
      x1: o.xlog ? Math.ceil(Math.log10(Math.max(1e-300, xmax))) : xmax,
      y0: o.ylog ? Math.floor(Math.log10(Math.max(1e-300, ymin))) : ymin,
      y1: o.ylog ? Math.ceil(Math.log10(Math.max(1e-300, ymax))) : ymax,
    });
    if (c.x0 === c.x1) c.x1 = c.x0 + 1;
    if (c.y0 === c.y1) c.y1 = c.y0 + 1;
    const f = frame(host, c);
    (o.refs || []).forEach((r) => {
      const col = r.color || X.css("--muted");
      if (r.y != null) {
        const y = f.sy(r.y);
        X.el("line", { x1: 0, x2: f.pw, y1: y, y2: y, stroke: col, "stroke-dasharray": "5 4" }, f.g);
        X.el("text", { x: f.pw - 4, y: y - 5, "text-anchor": "end", style: "fill:" + col }, f.g, r.label || "");
      } else {
        const x = f.sx(r.x);
        X.el("line", { x1: x, x2: x, y1: 0, y2: f.ph, stroke: col, "stroke-dasharray": "5 4" }, f.g);
        X.el("text", { x: x + 4, y: 12, style: "fill:" + col }, f.g, r.label || "");
      }
    });
    o.series.forEach((s) => {
      const pts = s.data.map((d) => f.sx(d[0]).toFixed(1) + "," + f.sy(d[1]).toFixed(1));
      if (s.area) X.el("polygon", { points: `${f.sx(s.data[0][0])},${f.ph} ${pts.join(" ")} ${f.sx(s.data[s.data.length - 1][0])},${f.ph}`, fill: s.color, opacity: .12 }, f.g);
      X.el("polyline", { points: pts.join(" "), fill: "none", stroke: s.color, "stroke-width": s.width || 2, "stroke-dasharray": s.dash || "", "stroke-linejoin": "round" }, f.g);
    });
    (o.markers || []).forEach((mk) => {
      X.el("circle", { cx: f.sx(mk.x), cy: f.sy(mk.y), r: 6, fill: mk.color, stroke: X.css("--bg"), "stroke-width": 2 }, f.g);
    });
    // hover
    const cross = X.el("line", { y1: 0, y2: f.ph, stroke: X.css("--muted"), "stroke-dasharray": "3 3", visibility: "hidden" }, f.g);
    const tip = tipFor(host);
    const hit = X.el("rect", { width: f.pw, height: f.ph, fill: "transparent" }, f.g);
    hit.addEventListener("pointermove", function (e) {
      const r = hit.getBoundingClientRect(), px = e.clientX - r.left;
      const rows = o.series.map((s) => {
        let best = 0, bd = Infinity;
        s.data.forEach((d, i) => { const dd = Math.abs(f.sx(d[0]) - px); if (dd < bd) { bd = dd; best = i; } });
        return { s: s, d: s.data[best] };
      });
      const x = f.sx(rows[0].d[0]);
      cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("visibility", "visible");
      tip.innerHTML = o.tip ? o.tip(rows) : rows.map((q) => `<span style="color:${q.s.color}">${q.s.name}</span>: <b>${(o.yfmt || X.fmt)(q.d[1])}</b> at ${(o.xfmt || X.fmt)(q.d[0])}`).join("<br>");
      placeTip(host, tip, x + f.m.l, e.clientY - host.getBoundingClientRect().top);
    });
    hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); tip.style.display = "none"; });
    return f;
  };

  /* ---------- step-area histogram ---------- */
  // o: {edges:[..], series:[{name,color,values:[..]}], xlog, ylog?}
  X.histChart = function (host, o) {
    const e = o.edges, n = e.length - 1;
    const ymax = Math.max(...o.series.flatMap((s) => s.values)) * 1.08 || 1;
    const c = Object.assign({}, o, {
      x0: o.xlog ? Math.floor(Math.log10(Math.max(1e-300, e[0]))) : e[0],
      x1: o.xlog ? Math.ceil(Math.log10(Math.max(1e-300, e[n]))) : e[n],
      y0: o.ylog ? Math.floor(Math.log10(Math.max(1e-3, o.ymin || 1))) : 0,
      y1: o.ylog ? Math.ceil(Math.log10(Math.max(10, ymax))) : ymax,
    });
    if (c.x0 === c.x1) c.x1 = c.x0 + 1;
    if (c.y0 === c.y1) c.y1 = c.y0 + 1;
    const f = frame(host, c);
    o.series.forEach((s) => {
      let d = `M${f.sx(e[0])},${f.ph}`;
      s.values.forEach((v, i) => {
        const yVal = f.sy(v);
        d += `L${f.sx(e[i])},${yVal}L${f.sx(e[i + 1])},${yVal}`;
      });
      d += `L${f.sx(e[n])},${f.ph}Z`;
      X.el("path", { d: d, fill: s.color, opacity: .28 }, f.g);
      X.el("path", { d: d, fill: "none", stroke: s.color, "stroke-width": 1.8 }, f.g);
    });
    const tip = tipFor(host);
    const hit = X.el("rect", { width: f.pw, height: f.ph, fill: "transparent" }, f.g);
    const hl = X.el("rect", { y: 0, height: f.ph, fill: X.css("--orange"), opacity: .12, visibility: "hidden" }, f.g);
    hit.addEventListener("pointermove", function (ev) {
      const r = hit.getBoundingClientRect(), px = ev.clientX - r.left;
      let i = 0; for (; i < n - 1; i++) if (f.sx(e[i + 1]) > px) break;
      hl.setAttribute("x", f.sx(e[i])); hl.setAttribute("width", Math.max(1, f.sx(e[i + 1]) - f.sx(e[i]))); hl.setAttribute("visibility", "visible");
      tip.innerHTML = `<b>${(o.xfmt || X.fmt)(e[i])} to ${(o.xfmt || X.fmt)(e[i + 1])}</b><br>` +
        o.series.map((s) => `<span style="color:${s.color}">${s.name}</span>: ${(o.yfmt || X.fmt)(s.values[i])}${o.counts ? " (" + X.int(o.counts[s.name][i]) + " flows)" : ""}`).join("<br>");
      placeTip(host, tip, f.sx(e[i]) + f.m.l, ev.clientY - host.getBoundingClientRect().top);
    });
    hit.addEventListener("pointerleave", () => { hl.setAttribute("visibility", "hidden"); tip.style.display = "none"; });
    return f;
  };
})();
