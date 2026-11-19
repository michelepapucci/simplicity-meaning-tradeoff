/* Interactive paper draft: figures from window.SITE_DATA (built by scripts/build_site.py). */
(function () {
  "use strict";
  const D = window.SITE_DATA;
  if (!D || !window.Plot) {
    document.querySelectorAll(".chart").forEach((el) => (el.textContent = "Figure could not load (scripts blocked or offline)."));
    return;
  }
  const E1 = D.exp1, E2 = D.exp2, E3 = D.exp3;
  const JUDGE = E3.judge;
  const JM = `llm_${JUDGE}_M`, JS = `llm_${JUDGE}_S`;

  // ---------------------------------------------------------------- tokens, names, formatting
  let T = {};
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function tokens() {
    T = {
      ink: css("--ink"), ink2: css("--ink-2"), muted: css("--muted"), grid: css("--grid"), axis: css("--axis"),
      surface: css("--surface"), s1: css("--s1"), s2: css("--s2"), s3: css("--s3"),
      neg: css("--div-neg"), mid: css("--div-mid"), pos: css("--div-pos"), accent: css("--accent"), wash: css("--wash"),
    };
  }
  const GROUPS = ["similarity", "learned", "proxy"];
  const GROUP_LABEL = { similarity: "Similarity to references / source", learned: "Learned metric", proxy: "Length / readability proxy" };
  const groupOf = (m) => D.names.group[m] || (String(m).startsWith("llm_") ? "llm" : "other");
  const gColor = (g) => ({ similarity: T.s1, learned: T.s2, proxy: T.s3 }[g] || T.ink);
  const mName = (m) => (m === JM || m === JS ? "Qwen3.8-27B judge" : D.names.short[m] || D.names.metric[m] || m);
  const bName = (b) => D.names.bench[b] || b;
  const minus = (s) => s.replace(/-/g, "−");
  // d must be a number: table cells call fmt(value, row), so a row object must not become the precision
  const f2 = (x, d) => (x == null || Number.isNaN(x) ? "–" : minus(Number(x).toFixed(typeof d === "number" ? d : 2)));
  const sg = (x, d) => (x == null ? "–" : (x > 0 ? "+" : "") + f2(x, d));
  const pct = (x) => (x == null ? "–" : Math.round(x * 100) + "%");
  const ci = (lo, hi, d = 2) => `[${f2(lo, d)}, ${f2(hi, d)}]`;
  const by = (k, dir = 1) => (a, b) => dir * ((a[k] ?? -Infinity) - (b[k] ?? -Infinity));
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v);
    }
    for (const k of kids) if (k != null) e.append(k);
    return e;
  }
  const $ = (id) => document.getElementById(id);

  function plot(opts) {
    if (opts.x && opts.x.label) opts.x = { labelAnchor: "center", labelOffset: 36, ...opts.x };
    if (opts.x && opts.x.label && !(opts.marginBottom >= 46)) opts.marginBottom = 46;
    return Plot.plot({
      style: { background: "transparent", color: T.ink2, fontFamily: FONT, fontSize: "12px", overflow: "visible" },
      ...opts,
    });
  }
  const widthOf = (node, max = 920) => Math.max(280, Math.min(max, node.clientWidth || 600));

  // legend: items [{label, color, kind: dot|ring|bar|line|diamond}]
  function legend(id, items) {
    const box = $(id);
    if (!box) return;
    box.replaceChildren(...items.map((it) => {
      const sw = el("i", { class: it.kind === "ring" ? "ring" : it.kind || "" });
      if (it.kind === "ring") sw.style.borderColor = it.color; else sw.style.background = it.color;
      if (it.kind === "diamond") { sw.style.transform = "rotate(45deg)"; sw.style.borderRadius = "1px"; sw.style.width = "9px"; sw.style.height = "9px"; }
      return el("span", {}, sw, document.createTextNode(it.label));
    }));
  }
  const groupLegend = (id, extra = []) => legend(id, [...GROUPS.map((g) => ({ label: GROUP_LABEL[g], color: gColor(g) })), ...extra]);

  // table view (textContent only)
  function table(rows, cols) {
    const t = el("table");
    t.append(el("thead", {}, el("tr", {}, ...cols.map((c) => el("th", { class: c.num ? "num" : "", text: c.label })))));
    const tb = el("tbody");
    for (const r of rows) {
      const tr = el("tr", r._hl ? { class: "hl" } : {});
      for (const c of cols) {
        const v = c.fmt ? c.fmt(r[c.key], r) : r[c.key];
        const td = el("td", { class: c.num ? "num" : "" });
        if (v instanceof Node) td.append(v); else td.textContent = v == null ? "–" : String(v);
        tr.append(td);
      }
      tb.append(tr);
    }
    t.append(tb);
    return el("div", { class: "tbl-wrap" }, t);
  }
  function dataView(rows, cols) {
    const d = el("details", { class: "data" }, el("summary", { text: "Data" }));
    d.append(table(rows, cols));
    return d;
  }
  function badge(status) {
    const s = String(status || "").toUpperCase();
    const cls = s === "PASS" ? "pass" : s === "FAIL" ? "fail" : s.startsWith("BELOW") ? "warn" : s === "INFO" ? "info" : "missing";
    const label = s === "PASS" ? "Pass" : s === "FAIL" ? "Fail" : s === "BELOW-TARGET" ? "Below target" : s === "BELOW-MIN" ? "Below minimum" :
      s === "INFO" ? "Info" : s === "MISSING" ? "Not yet" : status;
    return el("span", { class: `badge ${cls}`, text: label });
  }

  // controls
  function select(box, label, options, value, onChange) {
    const s = el("select", { "aria-label": label });
    for (const [v, t] of options) { const o = el("option", { value: v, text: t }); if (v === value) o.selected = true; s.append(o); }
    s.addEventListener("change", () => onChange(s.value));
    box.append(el("label", {}, document.createTextNode(label), s));
  }
  function seg(box, label, options, value, onChange) {
    const g = el("div", { class: "seg", role: "group", "aria-label": label });
    for (const [v, t] of options) {
      const b = el("button", { type: "button", "aria-pressed": String(v === value), text: t });
      b.addEventListener("click", () => {
        g.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        onChange(v);
      });
      g.append(b);
    }
    box.append(el("label", {}, document.createTextNode(label), g));
  }

  // figure registry: re-render on resize and theme change
  const FIGS = [];
  function figure(render) { FIGS.push(render); }
  function renderAll() { tokens(); for (const f of FIGS) { try { f(); } catch (e) { console.error(e); } } }
  function put(id, node, extra) { const box = $(id); if (!box) return; box.replaceChildren(node); if (extra) box.append(extra); }

  // ---------------------------------------------------------------- data helpers
  const fpObs = E1.fingerprints.filter((r) => r.variant === "observed");
  const benches = [...new Set(fpObs.map((r) => r.resource))];
  const rhoOf = Object.fromEntries(E1.rho.studies.map((s) => [s.label, s.rho]));
  const benchOptions = [...benches].sort((a, b) => rhoOf[b] - rhoOf[a]).map((b) => [b, `${bName(b)} (ρ = ${f2(rhoOf[b])})`]);
  const metricOrder = (ms) => [...ms].sort((a, b) => GROUPS.indexOf(groupOf(a)) - GROUPS.indexOf(groupOf(b)) || mName(a).localeCompare(mName(b)));
  const ALIGNED_R2 = 0.04;   // R >= 0.20

  // ---------------------------------------------------------------- header bits
  document.querySelectorAll('[data-bind="generated"]').forEach((n) => (n.textContent = D.generated));
  document.querySelectorAll('[data-bind="commit"]').forEach((n) => (n.textContent = D.commit));

  function statusTiles() {
    const p = E3.progress.gptoss120b.answered;
    const gDone = Object.values(p).reduce((s, x) => s + x, 0);
    const gTot = E3.progress.gptoss120b.total_pilot + E3.progress.gptoss120b.total_natural;
    const tiles = [
      { label: "Experiment 1 · natural benchmarks", value: "Final", sub: "9 benchmarks, 19 metrics, pre-registered", frac: 1 },
      { label: "Experiment 2 · contrast set", value: "Pilot, 1 of 3 annotators", sub: "199 items rated; full set planned for Dec", frac: 1 / 3 },
      { label: "Experiment 3 · LLM judges", value: "1 of 2 judges done", sub: `gpt-oss-120b: ${gDone.toLocaleString("en-US")} of ${gTot.toLocaleString("en-US")} calls`, frac: (1 + gDone / gTot) / 2 },
    ];
    $("status-row").replaceChildren(...tiles.map((t) => {
      const m = el("div", { class: "meter", role: "img", "aria-label": `${Math.round(t.frac * 100)}% done` }, el("span"));
      m.firstChild.style.width = `${Math.round(t.frac * 100)}%`;
      return el("div", { class: "tile" }, el("div", { class: "label", text: t.label }), el("div", { class: "value", text: t.value }),
        el("div", { class: "sub", text: t.sub }), m);
    }));
    const js = $("judge-status");
    js.replaceChildren(el("div", { class: "kicker", text: "Status" }));
    js.append(el("ul", {},
      el("li", { text: "Qwen3.8-27B (dense, Q8_0, thinking off): complete on the natural sample (23,976 calls) and the contrast pilot (796 calls), every call answered." }),
      el("li", { text: `gpt-oss-120b (native MXFP4, low reasoning effort): running, ${gDone.toLocaleString("en-US")} of ${gTot.toLocaleString("en-US")} calls answered (contrast pilot first, then the natural sample).` })));
  }

  // ---------------------------------------------------------------- Figure 1: rho forest
  figure(() => {
    const st = [...E1.rho.studies].sort(by("rho", -1));
    const P = E1.rho.pooled;
    const rows = st.map((s) => ({ name: bName(s.label), rho: s.rho, lo: s.ci[0], hi: s.ci[1], n: s.n, w: s.weight_re }));
    const pooled = { name: "Pooled (random effects)", rho: P.rho_re, lo: P.rho_re_ci[0], hi: P.rho_re_ci[1] };
    const all = [...rows, pooled];
    const node = $("c-f1"); const width = widthOf(node, 760);
    const tip = (d) => `${d.name}\nρ = ${f2(d.rho)} ${ci(d.lo, d.hi)}` + (d.n ? `\nn = ${d.n.toLocaleString("en-US")}, weight ${pct(d.w)}` : "");
    put("c-f1", plot({
      width, height: 34 * all.length + 50, marginLeft: Math.min(190, width * 0.38), marginRight: 16,
      x: { domain: [-0.6, 1], label: "ρ = r(human meaning, human simplicity) →", grid: true, tickFormat: (x) => f2(x, 1) },
      y: { domain: all.map((d) => d.name), label: null },
      r: { range: [4, 11] },
      marks: [
        Plot.ruleX([0], { stroke: T.axis }),
        Plot.ruleY(all, { y: "name", x1: "lo", x2: "hi", stroke: T.ink2, strokeWidth: 1.5 }),
        Plot.dot(rows, { x: "rho", y: "name", r: "w", fill: T.s1, stroke: T.surface, strokeWidth: 2, tip: true, title: tip }),
        Plot.dot([pooled], { x: "rho", y: "name", symbol: "diamond", r: 7, fill: T.ink, stroke: T.surface, strokeWidth: 2, tip: true, title: tip }),
      ],
    }), dataView(all, [{ key: "name", label: "Benchmark" }, { key: "rho", label: "ρ", num: true, fmt: f2 },
      { key: "lo", label: "95% CI", num: true, fmt: (v, r) => ci(r.lo, r.hi) }, { key: "n", label: "n", num: true, fmt: (v) => (v ? v.toLocaleString("en-US") : "") }]));
    $("cap-f1").textContent = `Pooled ρ = ${f2(P.rho_re)} ${ci(P.rho_re_ci[0], P.rho_re_ci[1])}; Q = ${Math.round(P.Q)} on ${P.df} df, I² = ${f2(P.I2)}, τ² = ${f2(P.tau2, 3)}.`;
  });

  // ---------------------------------------------------------------- Figure 2: raw flips vs fingerprints
  const s2 = { a: "simpda", b: "structural" };
  (function () {
    const box = $("ctl-f2");
    select(box, "Benchmark A", benchOptions, s2.a, (v) => { s2.a = v; renderF2(); });
    select(box, "Benchmark B", benchOptions, s2.b, (v) => { s2.b = v; renderF2(); });
  })();
  function renderF2() {
    const A = s2.a, B = s2.b;
    legend("leg-f2", [{ label: `A: ${bName(A)} (ρ = ${f2(rhoOf[A])})`, color: T.s1 }, { label: `B: ${bName(B)} (ρ = ${f2(rhoOf[B])})`, color: T.s2 }]);
    const get = (m, b) => fpObs.find((r) => r.metric === m && r.resource === b);
    const ms = metricOrder(benches.length ? [...new Set(fpObs.map((r) => r.metric))].filter((m) => get(m, A) && get(m, B)) : []);
    const P1 = "Raw correlation with simplicity", P2 = "Fingerprint weight βS";
    const long = [], links = [];
    for (const m of ms) {
      const a = get(m, A), b = get(m, B);
      for (const [panel, k] of [[P1, "r_S"], [P2, "beta_S"]]) {
        for (const [which, r, col] of [["A", a, T.s1], ["B", b, T.s2]]) {
          long.push({ metric: mName(m), panel, which, v: r[k], aligned: r.R2 >= ALIGNED_R2, col, bench: bName(r.resource), rM: r.r_M, rS: r.r_S, bM: r.beta_M, bS: r.beta_S, R: Math.sqrt(Math.max(0, r.R2)) });
        }
        links.push({ metric: mName(m), panel, x1: a[k], x2: b[k] });
      }
    }
    const node = $("c-f2"); const width = widthOf(node);
    const narrow = width < 560;
    const tip = (d) => `${d.metric} on ${d.bench}\nr(X, M) = ${f2(d.rM)}, r(X, S) = ${f2(d.rS)}\nβM = ${f2(d.bM)}, βS = ${f2(d.bS)}, R = ${f2(d.R)}` + (d.aligned ? "" : "\nnot aligned (R < 0.20)");
    put("c-f2", plot({
      width, height: 22 * ms.length * (narrow ? 2 : 1) + 70, marginLeft: 118, marginRight: 12,
      fx: narrow ? undefined : { label: null, domain: [P1, P2] }, fy: narrow ? { label: null, domain: [P1, P2], axis: null } : undefined,
      marginTop: narrow ? 26 : undefined,
      x: { domain: [-0.7, 1], grid: true, label: null, tickFormat: (x) => f2(x, 1) },
      y: { domain: ms.map(mName), label: null },
      marks: [
        Plot.ruleX([0], { stroke: T.axis }),
        narrow ? Plot.text([P1, P2], { fy: (d) => d, text: (d) => d, frameAnchor: "top-left", dy: -18, fill: T.ink2, fontWeight: 600 }) : null,
        Plot.ruleY(links, { y: "metric", x1: "x1", x2: "x2", [narrow ? "fy" : "fx"]: "panel", stroke: T.grid, strokeWidth: 2 }),
        Plot.dot(long, { x: "v", y: "metric", [narrow ? "fy" : "fx"]: "panel", r: 5, stroke: (d) => d.col, strokeWidth: 2, fill: (d) => (d.aligned ? d.col : T.surface), tip: true, title: tip }),
      ],
    }), dataView(ms.map((m) => ({ m: mName(m), a1: get(m, A).r_S, b1: get(m, B).r_S, a2: get(m, A).beta_S, b2: get(m, B).beta_S })),
      [{ key: "m", label: "Metric" }, { key: "a1", label: "r_S A", num: true, fmt: f2 }, { key: "b1", label: "r_S B", num: true, fmt: f2 },
       { key: "a2", label: "β_S A", num: true, fmt: f2 }, { key: "b2", label: "β_S B", num: true, fmt: f2 }]));
  }
  figure(renderF2);

  // ---------------------------------------------------------------- Figure 3: feasibility ellipse
  const s3 = { bench: "structural", variant: "observed" };
  (function () {
    const box = $("ctl-f3");
    select(box, "Benchmark", benchOptions, s3.bench, (v) => { s3.bench = v; renderF3(); });
    seg(box, "Correlations", [["observed", "Observed"], ["disattenuated", "Disattenuated"]], s3.variant, (v) => { s3.variant = v; renderF3(); });
  })();
  function renderF3() {
    groupLegend("leg-f3");
    const rows = E1.fingerprints.filter((r) => r.resource === s3.bench && r.variant === s3.variant);
    const node = $("c-f3");
    if (!rows.length) { put("c-f3", el("p", { class: "note", text: "No per-rater scores on this benchmark, so no disattenuated variant." })); return; }
    const rho = rows[0].rho;
    const k = Math.sqrt(Math.max(0, 1 - rho * rho));
    const ell = d3.range(0, 361, 3).map((t) => { const a = (t * Math.PI) / 180; return { x: Math.cos(a), y: rho * Math.cos(a) + k * Math.sin(a) }; });
    const width = Math.min(widthOf(node, 560), 560);
    const pts = rows.map((r) => ({ ...r, name: mName(r.metric), g: groupOf(r.metric) }));
    put("c-f3", plot({
      width, height: width, marginLeft: 44,
      x: { domain: [-1, 1], label: "r(X, human meaning) →", grid: true, tickFormat: (x) => f2(x, 1) },
      y: { domain: [-1, 1], label: "↑ r(X, human simplicity)", grid: true, tickFormat: (x) => f2(x, 1) },
      marks: [
        Plot.ruleX([0], { stroke: T.axis }), Plot.ruleY([0], { stroke: T.axis }),
        Plot.line(ell, { x: "x", y: "y", stroke: T.s1, strokeWidth: 1.5, fill: T.s1, fillOpacity: 0.06, curve: "linear-closed" }),
        Plot.line([{ x: -1, y: -rho }, { x: 1, y: rho }], { x: "x", y: "y", stroke: T.muted, strokeWidth: 1 }),
        Plot.dot(pts, { x: "r_M", y: "r_S", r: 5, fill: (d) => gColor(d.g), stroke: T.surface, strokeWidth: 2, tip: true,
          title: (d) => `${d.name}\nr(X, M) = ${f2(d.r_M)}, r(X, S) = ${f2(d.r_S)}\nβM = ${f2(d.beta_M)}, βS = ${f2(d.beta_S)}` }),
        Plot.text([{ x: 0.98, y: 0.98 }], { x: "x", y: "y", text: () => `${bName(s3.bench)}, ρ = ${f2(rho)}`, textAnchor: "end", fill: T.ink, fontWeight: 600 }),
      ],
    }), dataView([...pts].sort(by("r_S", -1)), [{ key: "name", label: "Metric" }, { key: "r_M", label: "r(X, M)", num: true, fmt: f2 }, { key: "r_S", label: "r(X, S)", num: true, fmt: f2 }]));
  }
  figure(renderF3);

  // ---------------------------------------------------------------- Figure 6: fingerprint map (data shared with Figures 4 and 5)
  const s4 = { metric: "" };
  function fpSummary(rows) {
    const out = {};
    for (const r of rows) {
      if (!(r.R2 >= ALIGNED_R2)) continue;
      (out[r.metric] = out[r.metric] || []).push(r);
    }
    return Object.entries(out).map(([m, rs]) => ({
      metric: m, name: mName(m), g: groupOf(m), k: rs.length,
      bM: mean(rs.map((r) => r.beta_M)), bS: mean(rs.map((r) => r.beta_S)),
      sdM: sd(rs.map((r) => r.beta_M)), sdS: sd(rs.map((r) => r.beta_S)), rows: rs,
    }));
  }
  const fpMetrics = fpSummary(fpObs);
  const fpJudge = fpSummary(E3.judge_fingerprints).map((d) => ({ ...d, name: d.metric === JS ? "Judge, simplicity prompt" : "Judge, meaning prompt", g: "llm" }));
  // ---------------------------------------------------------------- Figure 4 (explainer): anatomy of a fingerprint
  const s4x = { metric: "bertscore", bench: "simpda" };
  (function () {
    const box = $("ctl-f4x");
    const ms = metricOrder([...new Set(fpObs.map((r) => r.metric))]);
    select(box, "Metric", ms.map((m) => [m, mName(m)]), s4x.metric, (v) => { s4x.metric = v; renderF4x(); });
    select(box, "Benchmark", benchOptions, s4x.bench, (v) => { s4x.bench = v; renderF4x(); });
  })();
  function pathDiagram(node, rho, bM, bS, name, R) {
    const W = Math.min(widthOf(node, 440), 440), H = 250;
    const svg = d3.create("svg").attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
      .attr("aria-label", `Path diagram: rho ${f2(rho)}, weight on meaning ${f2(bM)}, weight on simplicity ${f2(bS)}`)
      .style("font-family", FONT).style("font-size", "13px");
    const col = (b) => (b >= 0 ? T.pos : T.neg);
    const defs = svg.append("defs");
    for (const [id, c] of [["ah-ink", T.ink2]]) {
      defs.append("marker").attr("id", id).attr("viewBox", "0 0 10 10").attr("refX", 8).attr("refY", 5).attr("markerUnits", "userSpaceOnUse")
        .attr("markerWidth", 12).attr("markerHeight", 12).attr("orient", "auto-start-reverse").append("path").attr("d", "M0,0L10,5L0,10z").attr("fill", c);
    }
    const nodeBox = (x, y, w, label, sub) => {
      const g = svg.append("g").attr("transform", `translate(${x},${y})`);
      g.append("rect").attr("x", -w / 2).attr("y", -20).attr("width", w).attr("height", 40).attr("rx", 8).attr("fill", T.surface).attr("stroke", T.axis);
      g.append("text").attr("text-anchor", "middle").attr("dy", sub ? -2 : 4).attr("fill", T.ink).attr("font-weight", 600).text(label);
      if (sub) g.append("text").attr("text-anchor", "middle").attr("dy", 13).attr("fill", T.ink2).attr("font-size", 11).text(sub);
    };
    const xL = 70, xR = W - 72, yM = 42, yS = 208, yX = 125;
    // rho: the benchmark's correlation between the two ratings
    svg.append("path").attr("d", `M ${xL - 40} ${yM + 22} C ${xL - 75} ${yM + 70}, ${xL - 75} ${yS - 70}, ${xL - 40} ${yS - 22}`)
      .attr("fill", "none").attr("stroke", T.ink2).attr("stroke-width", 1.5).attr("marker-start", "url(#ah-ink)").attr("marker-end", "url(#ah-ink)");
    svg.append("text").attr("x", xL - 22).attr("y", yX - 6).attr("fill", T.ink).attr("font-weight", 600).text(`ρ = ${sg(rho)}`);
    svg.append("text").attr("x", xL - 22).attr("y", yX + 10).attr("fill", T.ink2).attr("font-size", 11).text("the benchmark");
    // direct weights
    const arrow = (y0, b, lab, id) => {
      const x0 = xL + 52, x1 = xR - 66, y1 = yX + (y0 < yX ? -10 : 10);
      const sw = 1.5 + 10 * Math.min(1, Math.abs(b)), head = Math.max(11, 2.4 * sw);
      defs.append("marker").attr("id", id).attr("viewBox", "0 0 10 10").attr("refX", 8).attr("refY", 5).attr("markerUnits", "userSpaceOnUse")
        .attr("markerWidth", head).attr("markerHeight", head).attr("orient", "auto").append("path").attr("d", "M0,0L10,5L0,10z").attr("fill", col(b));
      const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len;
      svg.append("line").attr("x1", x0).attr("y1", y0).attr("x2", x1 - ux * head * 0.6).attr("y2", y1 - uy * head * 0.6).attr("stroke", col(b))
        .attr("stroke-width", sw).attr("stroke-opacity", 0.85).attr("marker-end", `url(#${id})`);
      // label beside the line's first third, on the outer side (away from the other arrow)
      const nx = y0 < yX ? uy : -uy, ny = y0 < yX ? -ux : ux, off = sw / 2 + 12;
      const px = x0 + (x1 - x0) * 0.42 + nx * off, py = y0 + (y1 - y0) * 0.42 + ny * off;
      svg.append("text").attr("x", px).attr("y", py + (y0 < yX ? 0 : 10)).attr("text-anchor", "start").attr("fill", T.ink).attr("font-weight", 600).text(lab);
    };
    arrow(yM, bM, `βM = ${sg(bM)}`, "ah-m");
    arrow(yS, bS, `βS = ${sg(bS)}`, "ah-s");
    nodeBox(xL, yM, 104, "Meaning (M)", "human rating");
    nodeBox(xL, yS, 104, "Simplicity (S)", "human rating");
    nodeBox(xR, yX, 128, name.length > 16 ? name.slice(0, 15) + "…" : name, `R = ${f2(R)}`);
    return svg.node();
  }
  function renderF4x() {
    const r = fpObs.find((d) => d.metric === s4x.metric && d.resource === s4x.bench);
    if (!r) {
      put("c-f4x-diagram", el("p", { class: "note", text: `${mName(s4x.metric)} has no scores on ${bName(s4x.bench)}.` }));
      $("c-f4x-steps").replaceChildren(); $("c-f4x-bars").replaceChildren(); $("cap-f4x").textContent = "";
      return;
    }
    const name = mName(r.metric), rho = r.rho, rM = r.r_M, rS = r.r_S, bM = r.beta_M, bS = r.beta_S;
    const R = Math.sqrt(Math.max(0, r.R2)), aligned = r.R2 >= ALIGNED_R2;
    put("c-f4x-diagram", pathDiagram($("c-f4x-diagram"), rho, bM, bS, name, R));
    const li = (head, calc) => el("li", {}, el("span", { text: head }), calc ? el("span", { class: "calc", text: calc }) : null);
    $("c-f4x-steps").replaceChildren(el("ol", {},
      li(`The benchmark: ρ = r(M, S) = ${sg(rho)}`),
      li(`The metric's raw correlations: r(X, M) = ${sg(rM)}, r(X, S) = ${sg(rS)}`),
      li(`Weight on meaning: βM = (rM − ρ·rS) / (1 − ρ²)`, `= (${f2(rM)} − ${f2(rho)} × ${f2(rS)}) / (1 − ${f2(rho)}²) = ${sg(bM)}`),
      li(`Weight on simplicity: βS = (rS − ρ·rM) / (1 − ρ²)`, `= (${f2(rS)} − ${f2(rho)} × ${f2(rM)}) / (1 − ${f2(rho)}²) = ${sg(bS)}`),
      li(`Fit: R = √(βM·rM + βS·rS) = ${f2(R)}`, aligned ? "aligned (R ≥ 0.20): the fingerprint is interpreted" : "not aligned (R < 0.20): direction not interpreted")),
      el("p", { class: "note", text: "Computed at full precision; the displayed inputs are rounded." }));
    const P1 = "direct path (the metric)", P2 = "through the other rating (ρ × other weight)";
    legend("leg-f4x", [{ label: P1, color: T.s1, kind: "bar" }, { label: P2, color: T.s2, kind: "bar" }, { label: "raw correlation", color: T.ink, kind: "line" }]);
    const rowS = `r(X, S) = ${sg(rS)}`, rowM = `r(X, M) = ${sg(rM)}`;
    const parts = [
      { row: rowS, part: P1, v: bS, c: T.s1 }, { row: rowS, part: P2, v: rho * bM, c: T.s2 },
      { row: rowM, part: P1, v: bM, c: T.s1 }, { row: rowM, part: P2, v: rho * bS, c: T.s2 },
    ];
    const tot = [{ row: rowS, v: rS }, { row: rowM, v: rM }];
    const node = $("c-f4x-bars"); const width = Math.min(widthOf(node, 760), 760);
    put("c-f4x-bars", plot({
      width, height: 120, marginLeft: 118, marginRight: 20,
      x: { domain: [-1.2, 1.2], label: "contribution to the raw correlation", grid: true, tickFormat: (x) => sg(x, 1) },
      y: { domain: [rowS, rowM], label: null },
      marks: [
        Plot.barX(parts, Plot.stackX({ x: "v", y: "row", fill: (d) => d.c, insetTop: 8, insetBottom: 8, rx: 3, tip: true,
          title: (d) => `${d.part}\n${sg(d.v)}` })),
        Plot.ruleX([0], { stroke: T.ink2 }),
        Plot.tickX(tot, { x: "v", y: "row", stroke: T.ink, strokeWidth: 2.5 }),
      ],
    }));
    $("cap-f4x").textContent = `Of ${name}'s correlation with simplicity on ${bName(s4x.bench)} (${sg(rS)}), ${sg(bS)} is direct and ${sg(rho * bM)} arrives through meaning; ` +
      `of its correlation with meaning (${sg(rM)}), ${sg(bM)} is direct and ${sg(rho * bS)} arrives through simplicity.` +
      (aligned ? "" : " R < 0.20: the metric barely relates to the two ratings here, so its fingerprint is not interpreted.");
  }
  figure(renderF4x);

  // ---------------------------------------------------------------- Figure 5 (explainer): playground
  const s5x = { bM: 0.6, bS: 0.0 };
  const PROFILES = [
    ["meaning", "Profile: meaning only", 0.6, 0.0], ["simplicity", "Profile: simplicity only", 0.0, 0.55], ["both", "Profile: both", 0.3, 0.45],
    ["drop", "Profile: simpler by dropping content", -0.4, 0.4], ["copy", "Profile: copies the source", 0.55, -0.4],
  ];
  const sliders = {};
  (function () {
    const box = $("ctl-f5x");
    for (const [k, lab] of [["bM", "βM, weight on meaning"], ["bS", "βS, weight on simplicity"]]) {
      const inp = el("input", { type: "range", min: "-1", max: "1", step: "0.01", value: String(s5x[k]), "aria-label": lab });
      const val = el("span", { class: "slider-val", text: sg(s5x[k]) });
      inp.addEventListener("input", () => { s5x[k] = Number(inp.value); val.textContent = sg(s5x[k]); renderF5x(); });
      sliders[k] = { inp, val };
      box.append(el("label", {}, document.createTextNode(lab), inp, val));
    }
    const opts = [["", "Load…"], ...PROFILES.map((p) => [p[0], p[1]]),
      ...metricOrder(fpMetrics.map((d) => d.metric)).map((m) => [`m:${m}`, `${mName(m)} (mean fingerprint)`])];
    select(box, "", opts, "", (v) => {
      let bM, bS;
      const p = PROFILES.find((q) => q[0] === v);
      if (p) { bM = p[2]; bS = p[3]; } else if (v.startsWith("m:")) { const d = fpMetrics.find((q) => q.metric === v.slice(2)); bM = d.bM; bS = d.bS; } else return;
      s5x.bM = Math.round(bM * 100) / 100; s5x.bS = Math.round(bS * 100) / 100;
      for (const k of ["bM", "bS"]) { sliders[k].inp.value = String(s5x[k]); sliders[k].val.textContent = sg(s5x[k]); }
      renderF5x();
    });
  })();
  function renderF5x() {
    const { bM, bS } = s5x;
    legend("leg-f5x", [{ label: "r(X, S), correlation with human simplicity", color: T.s1, kind: "line" }, { label: "r(X, M), correlation with human meaning", color: T.s2, kind: "line" }]);
    const grid = d3.range(-0.95, 0.951, 0.01).map((rho) => ({ rho, rS: bS + rho * bM, rM: bM + rho * bS }));
    const R2 = (rho) => bM * bM + bS * bS + 2 * rho * bM * bS;
    // impossible values of rho: R^2 > 1 (R^2 is linear in rho)
    let bad = null;
    if (bM * bS !== 0) {
      const t = (1 - bM * bM - bS * bS) / (2 * bM * bS);
      if (bM * bS > 0 && t < 0.95) bad = [Math.max(-0.95, t), 0.95];
      if (bM * bS < 0 && t > -0.95) bad = [-0.95, Math.min(0.95, t)];
    } else if (bM * bM + bS * bS > 1) bad = [-0.95, 0.95];
    const pts = E1.rho.studies.map((s) => ({ name: bName(s.label), rho: s.rho, rS: bS + s.rho * bM, rM: bM + s.rho * bS, ok: R2(s.rho) <= 1 }));
    const node = $("c-f5x"); const width = Math.min(widthOf(node, 760), 760);
    const tip = (d) => `${d.name} (ρ = ${f2(d.rho)})\nr(X, S) = ${sg(d.rS)}\nr(X, M) = ${sg(d.rM)}` + (d.ok ? "" : "\nimpossible here (R > 1)");
    const ends = pts.filter((d) => d.name === bName("structural") || d.name === bName("simpda"));
    put("c-f5x", plot({
      width, height: 330, marginLeft: 44, marginRight: 20,
      x: { domain: [-0.95, 0.95], label: "ρ = r(M, S) of a benchmark →", grid: true, tickFormat: (x) => sg(x, 1) },
      y: { domain: [-1, 1], label: "↑ raw correlation the benchmark would report", grid: true, tickFormat: (x) => sg(x, 1) },
      marks: [
        bad ? Plot.rectX([0], { x1: bad[0], x2: bad[1], fill: T.wash }) : null,
        Plot.ruleY([0], { stroke: T.axis }),
        Plot.line(grid, { x: "rho", y: "rS", stroke: T.s1, strokeWidth: 2 }),
        Plot.line(grid, { x: "rho", y: "rM", stroke: T.s2, strokeWidth: 2 }),
        Plot.dot(pts, { x: "rho", y: "rM", r: 4.5, fill: T.s2, stroke: T.surface, strokeWidth: 2, tip: true, title: tip }),
        Plot.dot(pts, { x: "rho", y: "rS", r: 4.5, fill: T.s1, stroke: T.surface, strokeWidth: 2, tip: true, title: tip }),
        Plot.text(ends, { x: "rho", y: "rS", text: "name", dy: -12, fill: T.ink, fontSize: 11 }),
      ],
    }));
    const rs = pts.map((d) => d.rS), lo = pts[rs.indexOf(Math.min(...rs))], hi = pts[rs.indexOf(Math.max(...rs))];
    $("cap-f5x").textContent = `With βM = ${sg(bM)} and βS = ${sg(bS)}, the metric's correlation with simplicity would range from ${sg(lo.rS)} on ${lo.name} ` +
      `to ${sg(hi.rS)} on ${hi.name}, although nothing about the metric changes.` + (bad ? " The shaded values of ρ cannot occur with this fingerprint: no metric can explain more than all of the human signal." : "");
  }
  figure(renderF5x);

  (function () {
    const opts = [["", "none"], ...metricOrder(fpMetrics.map((d) => d.metric)).map((m) => [m, mName(m)]), [JS, "Judge, simplicity prompt"], [JM, "Judge, meaning prompt"]];
    select($("ctl-f4"), "Show benchmarks for", opts, s4.metric, (v) => { s4.metric = v; renderF4(); });
  })();
  const REGIONS = [
    { x: 1.03, y: 0.04, t: "meaning only", a: "end" }, { x: 0.22, y: 0.95, t: "simplicity only", a: "middle" },
    { x: 1.03, y: 0.95, t: "both", a: "end" }, { x: -0.48, y: 0.95, t: "simpler by dropping content", a: "start" },
    { x: 1.03, y: -0.46, t: "copies the source", a: "end" },
  ];
  function renderF4() {
    groupLegend("leg-f4", [{ label: "Qwen3.8-27B judge (exploratory)", color: T.ink, kind: "diamond" }]);
    const node = $("c-f4"); const width = Math.min(widthOf(node, 640), 640);
    const sel = [...fpMetrics, ...fpJudge].find((d) => d.metric === s4.metric);
    const selPts = sel ? sel.rows.map((r) => ({ ...r, bench: bName(r.resource) })) : [];
    const all = [...fpMetrics, ...fpJudge];
    const tip = (d) => `${d.name}\nmean βM = ${f2(d.bM)} (SD ${f2(d.sdM)}), mean βS = ${f2(d.bS)} (SD ${f2(d.sdS)})\naligned on ${d.k} benchmark${d.k === 1 ? "" : "s"}`;
    put("c-f4", plot({
      width, height: Math.round(width * 0.85), marginLeft: 44,
      x: { domain: [-0.5, 1.05], label: "βM, weight on meaning →", grid: true, tickFormat: (x) => f2(x, 1) },
      y: { domain: [-0.5, 1.0], label: "↑ βS, weight on simplicity", grid: true, tickFormat: (x) => f2(x, 1) },
      marks: [
        Plot.ruleX([0], { stroke: T.axis }), Plot.ruleY([0], { stroke: T.axis }),
        ...["start", "middle", "end"].map((a) => Plot.text(REGIONS.filter((d) => d.a === a), { x: "x", y: "y", text: "t", textAnchor: a, fill: T.muted, fontStyle: "italic", fontSize: 11 })),
        Plot.ruleY(all, { clip: true, y: "bS", x1: (d) => d.bM - d.sdM, x2: (d) => d.bM + d.sdM, stroke: (d) => (d.g === "llm" ? T.ink : gColor(d.g)), strokeOpacity: sel ? 0.25 : 0.6 }),
        Plot.ruleX(all, { clip: true, x: "bM", y1: (d) => d.bS - d.sdS, y2: (d) => d.bS + d.sdS, stroke: (d) => (d.g === "llm" ? T.ink : gColor(d.g)), strokeOpacity: sel ? 0.25 : 0.6 }),
        Plot.dot(fpMetrics, { x: "bM", y: "bS", r: 5.5, fill: (d) => gColor(d.g), stroke: T.surface, strokeWidth: 2, fillOpacity: (d) => (sel && d !== sel ? 0.3 : 1), tip: true, title: tip }),
        Plot.dot(fpJudge, { x: "bM", y: "bS", r: 7, symbol: "diamond", fill: T.ink, stroke: T.surface, strokeWidth: 2, fillOpacity: (d) => (sel && d !== sel ? 0.3 : 1), tip: true, title: tip }),
        Plot.text(fpJudge, { x: "bM", y: "bS", text: (d) => (d.metric === JS ? "judge (S)" : "judge (M)"), dx: 10, textAnchor: "start", fill: T.ink, fontWeight: 600 }),
        Plot.dot(selPts, { x: "beta_M", y: "beta_S", r: 4.5, stroke: sel ? (sel.g === "llm" ? T.ink : gColor(sel.g)) : T.ink, strokeWidth: 2, fill: T.surface, tip: true,
          title: (d) => `${sel ? sel.name : ""} on ${d.bench}\nβM = ${f2(d.beta_M)}, βS = ${f2(d.beta_S)}` }),
        Plot.text(selPts, { x: "beta_M", y: "beta_S", text: "bench", dy: -10, fill: T.ink2, fontSize: 11 }),
      ],
    }), dataView([...all].sort(by("bS", -1)), [{ key: "name", label: "Measure" }, { key: "bM", label: "mean βM", num: true, fmt: f2 }, { key: "bS", label: "mean βS", num: true, fmt: f2 },
      { key: "sdS", label: "SD βS", num: true, fmt: f2 }, { key: "k", label: "benchmarks", num: true }]));
    $("cap-f4").textContent = sel
      ? `${sel.name}: aligned on ${sel.k} benchmarks; SD of βS across them = ${f2(sel.sdS)} (stability bar: ≤ 0.15).`
      : "Similarity metrics sit near the meaning axis; learned simplicity metrics weigh simplicity with almost no meaning; readability proxies weigh simplicity and, slightly, against meaning (compression ratio is their mirror image: a high ratio means a longer output that keeps meaning). The judge points are exploratory (closed-form fingerprints, no CIs).";
  }
  figure(renderF4);

  // ---------------------------------------------------------------- Figure 5: H8
  figure(() => {
    const g = E1.h8_gaps.map((r) => ({ ...r, pair: `${bName(r.resource_i)} – ${bName(r.resource_j)}` }));
    const S = E1.h8_summary;
    const node = $("c-f5"); const width = Math.min(widthOf(node, 760), 760);
    const key = g.find((r) => [r.resource_i, r.resource_j].sort().join() === ["simpda", "structural"].sort().join());
    put("c-f5", plot({
      width, height: 340, marginLeft: 48, marginRight: 20,
      x: { label: "|ρi − ρj|, how differently the two benchmarks' annotators relate M and S →", grid: true, tickFormat: (x) => f2(x, 1) },
      y: { label: "↑ τ gain (ranking by βS vs raw rS)", grid: true, tickFormat: (x) => sg(x, 1) },
      marks: [
        Plot.ruleY([0], { stroke: T.axis }),
        Plot.ruleY([S.mean_gap], { stroke: T.muted }),
        Plot.text([S.mean_gap], { y: (d) => d, x: 0.02, text: () => `mean gain ${sg(S.mean_gap)}`, textAnchor: "start", dy: -7, fill: T.ink2 }),
        Plot.dot(g, { x: "abs_drho", y: "gap", r: 5, fill: T.s1, stroke: T.surface, strokeWidth: 2, tip: true,
          title: (d) => `${d.pair}\nτ raw = ${f2(d.tau_raw)} → τ fingerprint = ${f2(d.tau_beta)} (gain ${sg(d.gap)})\n|Δρ| = ${f2(d.abs_drho)}, ${d.n_metrics} metrics` }),
        key ? Plot.text([key], { x: "abs_drho", y: "gap", text: () => "Simplicity-DA – Structural", dy: -12, textAnchor: "end", fill: T.ink, fontWeight: 600 }) : null,
      ],
    }), dataView([...g].sort(by("gap", -1)), [{ key: "pair", label: "Pair" }, { key: "tau_raw", label: "τ raw", num: true, fmt: f2 }, { key: "tau_beta", label: "τ fingerprint", num: true, fmt: f2 },
      { key: "gap", label: "gain", num: true, fmt: sg }, { key: "abs_drho", label: "|Δρ|", num: true, fmt: f2 }]));
    $("cap-f5").textContent = `Mean gain ${sg(S.mean_gap)} over ${S.n_pairs} pairs (pre-registered bar: ≥ 0.20); Spearman(gain, |Δρ|) = ${f2(S.spearman_gap_drho)}.` +
      (key ? ` Simplicity-DA vs Structural Simplicity: τ = ${f2(key.tau_raw)} by raw correlation, ${f2(key.tau_beta)} by fingerprint.` : "");
  });

  // ---------------------------------------------------------------- Figure 6: transfer
  const LBL6 = { structural: [-9, 4, "end"], simpda: [0, 15, "middle"], asset_ratings: [0, -11, "middle"], qats2016: [9, 4, "start"], llm_era: [9, 4, "start"] };
  figure(() => {
    const rows = E1.transfer.per_held_out.map((r) => ({ ...r, name: bName(r.held_out) }));
    const node = $("c-f6"); const width = Math.min(widthOf(node, 760), 760);
    const tr = E1.transfer.fp2d;
    put("c-f6", plot({
      width, height: 320, marginLeft: 48, marginRight: 24,
      x: { label: "|ρ of held-out benchmark − mean ρ of the others| →", grid: true, tickFormat: (x) => f2(x, 1) },
      y: { label: "↑ error reduction vs naive", grid: true, tickFormat: (x) => pct(x) },
      marks: [
        Plot.ruleY([0], { stroke: T.axis }),
        Plot.ruleY([0.4], { stroke: T.muted }),
        Plot.text([0.4], { y: (d) => d, x: 0.01, text: () => "pre-registered target (overall)", textAnchor: "start", dy: -7, fill: T.ink2 }),
        Plot.ruleY([tr.reduction], { stroke: T.s1, strokeOpacity: 0.5 }),
        Plot.text([tr.reduction], { y: (d) => d, x: 0.01, text: () => `achieved overall: ${pct(tr.reduction)}`, textAnchor: "start", dy: 12, fill: T.ink2 }),
        Plot.dot(rows, { x: "rho_distance", y: "gain", r: 5.5, fill: T.s1, stroke: T.surface, strokeWidth: 2, tip: true,
          title: (d) => `${d.name} held out (ρ = ${f2(d.rho)})\nerror: fingerprint ${f2(d.mae_fp, 3)} vs naive ${f2(d.mae_naive, 3)}\nreduction ${pct(d.gain)}` }),
        ...rows.filter((d) => LBL6[d.held_out]).map((d) => Plot.text([d], { x: "rho_distance", y: "gain", text: "name",
          dx: LBL6[d.held_out][0], dy: LBL6[d.held_out][1], textAnchor: LBL6[d.held_out][2], fill: T.ink, fontSize: 11 })),
      ],
    }), dataView([...rows].sort(by("gain", -1)), [{ key: "name", label: "Held out" }, { key: "rho", label: "ρ", num: true, fmt: f2 }, { key: "rho_distance", label: "distance", num: true, fmt: f2 },
      { key: "mae_fp", label: "MAE fingerprint", num: true, fmt: (v) => f2(v, 3) }, { key: "mae_naive", label: "MAE naive", num: true, fmt: (v) => f2(v, 3) }, { key: "gain", label: "reduction", num: true, fmt: pct }]));
  });

  // ---------------------------------------------------------------- Figure 7: length
  figure(() => {
    groupLegend("leg-f7");
    const thr = E1.length.r_LS_min;
    const rsl = E1.length.r_SL.map((r) => ({ name: bName(r.resource), v: r.r_SL, used: Math.abs(r.r_SL) >= thr })).sort(by("v", 1));
    const na = $("c-f7a"); const wa = Math.min(widthOf(na, 760), 760);
    put("c-f7a", plot({
      width: wa, height: 26 * rsl.length + 50, marginLeft: Math.min(170, wa * 0.36), marginRight: 16,
      x: { domain: [-0.8, 0.4], label: "(a) r(human simplicity, compression ratio)", grid: true, tickFormat: (x) => f2(x, 1) },
      y: { domain: rsl.map((d) => d.name), label: null },
      marks: [
        Plot.barX(rsl, { x: "v", y: "name", fill: (d) => (d.used ? T.s1 : T.axis), insetTop: 6, insetBottom: 6, rx: 3, tip: true,
          title: (d) => `${d.name}\nr(S, L) = ${f2(d.v)}${d.used ? "\nused in (b)" : ""}` }),
        Plot.ruleX([0], { stroke: T.ink2 }),
        Plot.ruleX([-thr, thr], { stroke: T.muted, strokeOpacity: 0.7 }),
      ],
    }));
    const lm = E1.length.per_metric.map((r) => ({ ...r, name: mName(r.metric), g: groupOf(r.metric) })).sort(by("kept", -1));
    const nb = $("c-f7b"); const wb = widthOf(nb, 460);
    put("c-f7b", plot({
      width: wb, height: 22 * lm.length + 60, marginLeft: 112, marginRight: 14,
      x: { domain: [0, 0.8], label: "(b) |r(X, S)|: raw → length partialled out", grid: true, tickFormat: (x) => f2(x, 1) },
      y: { domain: lm.map((d) => d.name), label: null },
      marks: [
        Plot.arrow(lm, { x1: "abs_raw", x2: "abs_partial", y1: "name", y2: "name", stroke: (d) => gColor(d.g), strokeWidth: 2, headLength: 6 }),
        Plot.dot(lm, { x: "abs_raw", y: "name", r: 3.5, stroke: (d) => gColor(d.g), fill: T.surface, strokeWidth: 1.5, tip: true,
          title: (d) => `${d.name}\n|r(X, S)| ${f2(d.abs_raw)} → ${f2(d.abs_partial)} with length fixed\nr given L / raw r, mean over benchmarks: ${pct(d.kept)}` }),
      ],
    }), dataView(lm, [{ key: "name", label: "Metric" }, { key: "abs_raw", label: "|r| raw", num: true, fmt: f2 }, { key: "abs_partial", label: "|r| given L", num: true, fmt: f2 }, { key: "kept", label: "kept", num: true, fmt: pct }]));
    const pr = E1.length.pairs.map((r) => ({ ...r, name: mName(r.metric), g: groupOf(r.metric) })).sort(by("accuracy", -1));
    const nc = $("c-f7c"); const wc = widthOf(nc, 460);
    put("c-f7c", plot({
      width: wc, height: 22 * pr.length + 60, marginLeft: 112, marginRight: 14,
      x: { domain: [0.4, 0.75], label: "(c) accuracy on equal-length pairs", grid: true, tickFormat: (x) => f2(x, 2) },
      y: { domain: pr.map((d) => d.name), label: null },
      marks: [
        Plot.rectX([0], { x1: 0.43, x2: 0.57, fill: T.wash }),
        Plot.ruleX([0.5], { stroke: T.axis }), Plot.ruleX([0.6], { stroke: T.muted }),
        Plot.dot(pr, { x: "accuracy", y: "name", r: 5, fill: (d) => gColor(d.g), stroke: T.surface, strokeWidth: 2, tip: true,
          title: (d) => `${d.name}\naccuracy ${f2(d.accuracy)} on ${d.n_pairs.toLocaleString("en-US")} pairs` }),
      ],
    }), dataView(pr, [{ key: "name", label: "Metric" }, { key: "accuracy", label: "accuracy", num: true, fmt: f2 }, { key: "n_pairs", label: "pairs", num: true }]));
  });

  // ---------------------------------------------------------------- Figure 8: contrast cells
  const CELL_M = { keep: "Meaning kept", lose: "Meaning lost" };
  const CELL_S = { "+1": "simpler", "0": "same difficulty", "-1": "harder" };
  const S_ORDER = ["simpler", "same difficulty", "harder"];
  const CELL_L = { short: "shorter", same: "same length", long: "longer" };
  const cells = E2.per_cell.filter((c) => c.cell !== "H").map((c) => {
    const [m, s, l] = c.cell.split("_");
    const rej = E2.rejection[c.cell] || {};
    return { ...c, M: CELL_M[m], S: CELL_S[s], L: CELL_L[l], designS: Number(s), rej: rej.rate };
  });
  const ordinary = E2.per_cell.find((c) => c.cell === "H");
  const MEASURES = {
    S_mean: { label: "Mean simplicity rating (−2…+2)", type: "div", domain: [-2, 2], fmt: (v) => sg(v, 1) },
    M_mean: { label: "Mean meaning rating (1–5)", type: "seq", domain: [1, 5], fmt: (v) => f2(v, 1) },
    valid_both: { label: "Share on the designed side, both factors", type: "seq", domain: [0, 1], fmt: pct },
    valid_M: { label: "Share on the designed side, meaning", type: "seq", domain: [0, 1], fmt: pct },
    valid_S: { label: "Share on the designed side, simplicity", type: "seq", domain: [0, 1], fmt: pct },
    rej: { label: "Rejected by the validator before annotation", type: "seq", domain: [0, 1], fmt: pct },
    cr_mean: { label: "Mean compression ratio", type: "seq", domain: [0.4, 2.2], fmt: (v) => f2(v, 2) },
  };
  const s8 = { measure: "S_mean" };
  select($("ctl-f8"), "Cells show", Object.entries(MEASURES).map(([k, v]) => [k, v.label]), s8.measure, (v) => { s8.measure = v; renderF8(); });
  function renderF8() {
    const ms = MEASURES[s8.measure];
    const node = $("c-f8"); const width = Math.min(widthOf(node, 640), 640);
    const seqRange = [T.surface === "#1a1a19" ? "#184f95" : "#cde2fb", T.surface === "#1a1a19" ? "#86b6ef" : "#104281"];
    const color = ms.type === "div" ? { type: "diverging", domain: ms.domain, range: [T.neg, T.mid, T.pos], pivot: 0 }
      : { type: "linear", domain: ms.domain, range: seqRange };
    const scale = d3.scaleLinear().domain(ms.type === "div" ? [ms.domain[0], 0, ms.domain[1]] : ms.domain).range(ms.type === "div" ? [T.neg, T.mid, T.pos] : seqRange).clamp(true);
    const lum = (c) => { const x = d3.rgb(c); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(x.r) + 0.7152 * f(x.g) + 0.0722 * f(x.b); };
    const ink = (v) => (v == null ? T.ink2 : lum(scale(v)) > 0.35 ? "#0b0b0b" : "#ffffff");
    put("c-f8", plot({
      width, height: 6 * 46 + 70, marginLeft: 112, marginTop: 30, marginRight: 104,
      fy: { domain: [CELL_M.keep, CELL_M.lose], label: null },
      x: { domain: ["shorter", "same length", "longer"], label: null, axis: "top" },
      y: { domain: S_ORDER, label: null },
      color,
      marks: [
        Plot.cell(cells, { x: "L", y: "S", fy: "M", fill: (d) => d[s8.measure], inset: 1.5, rx: 4, tip: true,
          title: (d) => `${d.M}, ${d.S}, ${d.L} (n = ${d.n})\nmean M ${f2(d.M_mean, 1)}, mean S ${sg(d.S_mean, 1)}, mean CR ${f2(d.cr_mean, 2)}\non designed side: meaning ${pct(d.valid_M)}, simplicity ${pct(d.valid_S)}` + (d.rej != null ? `\nvalidator rejected ${pct(d.rej)} of candidates` : "") }),
        Plot.text(cells, { x: "L", y: "S", fy: "M", text: (d) => ms.fmt(d[s8.measure]), fill: (d) => ink(d[s8.measure]), fontSize: 13, fontWeight: 600 }),
      ],
    }), dataView(cells, [{ key: "M", label: "Meaning" }, { key: "S", label: "Simplicity" }, { key: "L", label: "Length" }, { key: "n", label: "n", num: true },
      { key: "M_mean", label: "mean M", num: true, fmt: (v) => f2(v, 1) }, { key: "S_mean", label: "mean S", num: true, fmt: (v) => sg(v, 1) },
      { key: "valid_M", label: "valid M", num: true, fmt: pct }, { key: "valid_S", label: "valid S", num: true, fmt: pct }, { key: "rej", label: "rejected", num: true, fmt: pct }]));
    $("cap-f8").textContent = `One annotator, ≈ 10 items per cell. ${ms.label}. ` + (ordinary ? `For reference, the ordinary LLM simplifications (one per source, n = ${ordinary.n}) average M ${f2(ordinary.M_mean, 1)} and S ${sg(ordinary.S_mean, 1)}.` : "");
  }
  figure(renderF8);

  // ---------------------------------------------------------------- Figure 9: natural vs contrast
  figure(() => {
    groupLegend("leg-f9", [{ label: "mean over natural benchmarks", color: T.muted, kind: "ring" }, { label: "Qwen3.8-27B judge", color: T.ink, kind: "diamond" }]);
    const mb = E2.metric_behaviour.filter((r) => !String(r.metric).startsWith("llm_"));
    const PM = "Correlation with human meaning", PS = "Correlation with human simplicity";
    const long = [];
    for (const r of mb) {
      long.push({ name: mName(r.metric), g: groupOf(r.metric), panel: PM, nat: r.r_M_natural, con: r.r_M, lo: r.r_M_lo, hi: r.r_M_hi });
      long.push({ name: mName(r.metric), g: groupOf(r.metric), panel: PS, nat: r.r_S_natural, con: r.r_S_contrast, lo: r.r_S_lo, hi: r.r_S_hi });
    }
    const cmp = E3.compare_all;
    const jnat = (dim, meas) => mean(cmp.filter((r) => r.dim === dim && r.measure === meas && r.data !== "contrast_pilot").map((r) => r.r));
    const jcon = (dim, meas) => (cmp.find((r) => r.dim === dim && r.measure === meas && r.data === "contrast_pilot") || {}).r;
    const J = "Qwen3.8-27B judge";
    long.push({ name: J, g: "llm", panel: PM, nat: jnat("M", JM), con: jcon("M", JM) });
    long.push({ name: J, g: "llm", panel: PS, nat: jnat("S", JS), con: jcon("S", JS) });
    const order = [J, ...metricOrder(mb.map((r) => r.metric)).map(mName)];
    const node = $("c-f9"); const width = widthOf(node);
    const narrow = width < 560;
    const fk = narrow ? "fy" : "fx";
    const col = (d) => (d.g === "llm" ? T.ink : gColor(d.g));
    put("c-f9", plot({
      width, height: 23 * order.length * (narrow ? 2 : 1) + 70, marginLeft: 136, marginRight: 12,
      [fk]: { domain: [PM, PS], label: null, ...(narrow ? { axis: null } : {}) },
      marginTop: narrow ? 26 : undefined,
      x: { domain: [-0.4, 1], grid: true, label: null, tickFormat: (x) => f2(x, 1) },
      y: { domain: order, label: null },
      marks: [
        Plot.ruleX([0], { stroke: T.axis }),
        narrow ? Plot.text([PM, PS], { fy: (d) => d, text: (d) => d, frameAnchor: "top-left", dy: -18, fill: T.ink2, fontWeight: 600 }) : null,
        Plot.ruleY(long, { y: "name", x1: "nat", x2: "con", [fk]: "panel", stroke: T.grid, strokeWidth: 2 }),
        Plot.dot(long, { x: "nat", y: "name", [fk]: "panel", r: 4.5, stroke: T.muted, strokeWidth: 1.5, fill: T.surface }),
        Plot.dot(long.filter((d) => d.g !== "llm"), { x: "con", y: "name", [fk]: "panel", r: 5.5, fill: col, stroke: T.surface, strokeWidth: 2, tip: true,
          title: (d) => `${d.name}: ${d.panel.toLowerCase()}\nnatural benchmarks (mean) ${f2(d.nat)} → contrast set ${f2(d.con)}` + (d.lo != null ? ` ${ci(d.lo, d.hi)}` : "") }),
        Plot.dot(long.filter((d) => d.g === "llm"), { x: "con", y: "name", [fk]: "panel", r: 7, symbol: "diamond", fill: T.ink, stroke: T.surface, strokeWidth: 2, tip: true,
          title: (d) => `${d.name}: ${d.panel.toLowerCase()}\nnatural benchmarks (mean) ${f2(d.nat)} → contrast set ${f2(d.con)}` }),
      ],
    }), dataView(long, [{ key: "name", label: "Measure" }, { key: "panel", label: "" }, { key: "nat", label: "natural (mean)", num: true, fmt: f2 }, { key: "con", label: "contrast", num: true, fmt: f2 }]));
  });

  // ---------------------------------------------------------------- Figure 10: judge vs metrics
  const s10 = { data: "contrast_pilot", dim: "M" };
  (function () {
    const datas = [...new Set(E3.compare_summary.map((r) => r.data))];
    const opts = [["contrast_pilot", "Contrast set (pilot)"], ...datas.filter((d) => d !== "contrast_pilot").map((d) => [d, bName(d)])];
    select($("ctl-f10"), "Data", opts, s10.data, (v) => { s10.data = v; renderF10(); });
    seg($("ctl-f10"), "Human rating", [["M", "Meaning"], ["S", "Simplicity"]], s10.dim, (v) => { s10.dim = v; renderF10(); });
  })();
  function renderF10() {
    groupLegend("leg-f10", [{ label: "Qwen3.8-27B judge", color: T.ink, kind: "diamond" }]);
    const rows = E3.compare_all.filter((r) => r.data === s10.data && r.dim === s10.dim).map((r) => ({
      ...r, name: (r.sign < 0 ? "−" : "") + mName(r.measure), g: r.is_judge ? "llm" : groupOf(r.measure),
      verdict: r.is_judge ? "judge" : r.delta_lo > 0 ? "better" : r.delta_hi < 0 ? "worse" : "tie",
    })).sort(by("r_oriented", -1));
    const node = $("c-f10"); const width = Math.min(widthOf(node, 760), 760);
    const metr = rows.filter((r) => !r.is_judge), jr = rows.filter((r) => r.is_judge);
    const tip = (d) => d.is_judge ? `Qwen3.8-27B judge\nr = ${f2(d.r)} (rank ${d.rank} of ${rows.length})`
      : `${d.name}\nr = ${f2(d.r_oriented)} (rank ${d.rank})\njudge − metric = ${sg(d.delta)} ${ci(d.delta_lo, d.delta_hi)}\n` +
        (d.verdict === "better" ? "judge significantly better" : d.verdict === "worse" ? "judge significantly worse" : "not distinguishable");
    put("c-f10", plot({
      width, height: 22 * rows.length + 60, marginLeft: 132, marginRight: 30,
      x: { domain: [Math.min(0, d3.min(rows, (d) => d.r_oriented) - 0.05), 1], label: `r with human ${s10.dim === "M" ? "meaning" : "simplicity"} →`, grid: true, tickFormat: (x) => f2(x, 1) },
      y: { domain: rows.map((d) => d.name), label: null },
      marks: [
        Plot.ruleX([0], { stroke: T.axis }),
        Plot.ruleY(rows, { y: "name", x1: 0, x2: "r_oriented", stroke: T.grid, strokeWidth: 1 }),
        Plot.dot(metr.filter((d) => d.verdict === "better"), { x: "r_oriented", y: "name", r: 5.5, fill: (d) => gColor(d.g), stroke: T.surface, strokeWidth: 2, tip: true, title: tip }),
        Plot.dot(metr.filter((d) => d.verdict === "tie"), { x: "r_oriented", y: "name", r: 5, stroke: (d) => gColor(d.g), strokeWidth: 2, fill: T.surface, tip: true, title: tip }),
        Plot.dot(metr.filter((d) => d.verdict === "worse"), { x: "r_oriented", y: "name", r: 6, symbol: "square", fill: (d) => gColor(d.g), stroke: T.surface, strokeWidth: 2, tip: true, title: tip }),
        Plot.dot(jr, { x: "r_oriented", y: "name", r: 8, symbol: "diamond", fill: T.ink, stroke: T.surface, strokeWidth: 2, tip: true, title: tip }),
        Plot.text(jr, { x: "r_oriented", y: "name", text: (d) => f2(d.r_oriented), dx: 12, textAnchor: "start", fill: T.ink, fontWeight: 700 }),
      ],
    }));
    // summary table over all data
    const S = E3.compare_summary.map((r) => ({ ...r, dname: bName(r.data), _hl: r.data === s10.data && r.dim === s10.dim }));
    const order = ["contrast_pilot", ...benches];
    S.sort((a, b) => order.indexOf(a.data) - order.indexOf(b.data) || a.dim.localeCompare(b.dim));
    const verdict = (r) => r.delta_best_lo > 0 ? badgeText("pass", "judge") : r.delta_best_hi < 0 ? badgeText("fail", "metric") : badgeText("info", "tie");
    $("t-f10").replaceChildren(table(S, [
      { key: "dname", label: "Data" }, { key: "dim", label: "Rating", fmt: (v) => (v === "M" ? "meaning" : "simplicity") },
      { key: "r_judge", label: "judge r", num: true, fmt: f2 }, { key: "rank", label: "rank", num: true, fmt: (v, r) => `${v} / ${r.n_measures}` },
      { key: "best_metric", label: "best metric", fmt: (v) => (v.startsWith("-") ? "−" + mName(v.slice(1)) : mName(v)) },
      { key: "r_best", label: "its r", num: true, fmt: f2 },
      { key: "delta_best", label: "judge − best [95% CI]", num: true, fmt: (v, r) => `${sg(v)} ${ci(r.delta_best_lo, r.delta_best_hi)}` },
      { key: "x", label: "better", fmt: (v, r) => verdict(r) },
    ]));
  }
  function badgeText(cls, text) { return el("span", { class: `badge ${cls}`, text }); }
  figure(renderF10);

  // ---------------------------------------------------------------- Figure 11: H7 length bias
  figure(() => {
    const SER = [
      { key: JUDGE, label: "Qwen3.8-27B judge", color: T.ink, symbol: "diamond", rows: E3.h7, dy: -7 },
      { key: "fkgl", label: "FKGL gain", color: T.s3, symbol: "circle", rows: E3.h7_reference.filter((r) => r.judge === "fkgl"), dy: 0 },
      { key: "simple_l", label: "SIMPLE-large", color: T.s2, symbol: "circle", rows: E3.h7_reference.filter((r) => r.judge === "simple_l"), dy: 7 },
    ];
    legend("leg-f11", SER.map((s) => ({ label: s.label, color: s.color, kind: s.symbol === "diamond" ? "diamond" : "" })));
    const datas = ["contrast_pilot", ...[...E3.h7].filter((r) => r.data !== "contrast_pilot").sort(by("partial_r", 1)).map((r) => r.data)];
    const node = $("c-f11"); const width = Math.min(widthOf(node, 760), 760);
    const rows = SER.flatMap((s) => s.rows.map((r) => ({ ...r, series: s.label, color: s.color, symbol: s.symbol, dy: s.dy, name: bName(r.data) })));
    const marks = [
      Plot.rectX([0], { x1: -0.15, x2: 0.15, fill: T.wash }),
      Plot.ruleX([0], { stroke: T.axis }),
    ];
    for (const s of SER) {
      const rr = rows.filter((r) => r.series === s.label);
      marks.push(Plot.ruleY(rr, { y: "name", x1: "ci_lo", x2: "ci_hi", stroke: s.color, strokeWidth: 1.5, dy: s.dy, strokeOpacity: 0.7 }));
      marks.push(Plot.dot(rr, { x: "partial_r", y: "name", dy: s.dy, r: s.symbol === "diamond" ? 6.5 : 4.5, symbol: s.symbol, fill: s.color, stroke: T.surface, strokeWidth: 1.5, tip: true,
        title: (d) => `${d.series} on ${d.name}\npartial r = ${f2(d.partial_r)} ${ci(d.ci_lo, d.ci_hi)}\nraw r with length ${f2(d.r_raw)}, n = ${d.n.toLocaleString("en-US")}` }));
    }
    put("c-f11", plot({
      width, height: 40 * datas.length + 50, marginLeft: Math.min(170, width * 0.34), marginRight: 16,
      x: { domain: [-0.7, 0.45], label: "partial r(simplicity score, length | human M, S) →", grid: true, tickFormat: (x) => sg(x, 1) },
      y: { domain: datas.map(bName), label: null },
      marks,
    }), dataView(rows, [{ key: "series", label: "Measure" }, { key: "name", label: "Data" }, { key: "partial_r", label: "partial r", num: true, fmt: f2 },
      { key: "ci_lo", label: "95% CI", num: true, fmt: (v, r) => ci(r.ci_lo, r.ci_hi) }, { key: "n", label: "n", num: true }]));
  });

  // ---------------------------------------------------------------- appendix: pre-registered checks
  function checksTable() {
    const groups = [
      ["Experiment 1 (natural benchmarks, final)", E1.checks],
      ["H5 contrast-set validity (pilot, one annotator: exploratory)", E2.h5],
      ["H6 metric behaviour on the contrast set (pilot: exploratory)", E2.h6],
      ["H7 LLM-judge length bias", E3.h7_check],
    ];
    const out = [];
    for (const [title, cs] of groups) {
      out.push(el("h4", { text: title }));
      out.push(table(cs.map((c) => ({ ...c, value: c.value.replace(/qwen38_27b/g, "Qwen3.8-27B") })), [
        { key: "hyp", label: "" }, { key: "name", label: "Check" }, { key: "value", label: "Value" }, { key: "criterion", label: "Criterion" },
        { key: "status", label: "Status", fmt: (v) => badge(v) },
      ]));
    }
    $("t-checks").replaceChildren(...out);
  }

  // ---------------------------------------------------------------- theme, nav, boot
  const btn = $("theme-btn");
  function setTheme(t) {
    if (t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme");
    try { if (t) localStorage.setItem("theme", t); else localStorage.removeItem("theme"); } catch (e) { /* storage unavailable */ }
    btn.textContent = (document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark" ? "Light theme" : "Dark theme";
    renderAll();
  }
  btn.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(cur === "dark" ? "light" : "dark");
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => setTheme(document.documentElement.getAttribute("data-theme")));
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) { /* storage unavailable */ }

  let rt;
  let lastW = window.innerWidth;
  window.addEventListener("resize", () => { if (Math.abs(window.innerWidth - lastW) < 8) return; lastW = window.innerWidth; clearTimeout(rt); rt = setTimeout(renderAll, 150); });

  const links = [...document.querySelectorAll(".topbar nav a")];
  const obs = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${e.target.id}`));
  }, { rootMargin: "-40% 0px -55% 0px" });
  links.forEach((a) => { const t = document.querySelector(a.getAttribute("href")); if (t) obs.observe(t); });

  tokens();
  statusTiles();
  checksTable();
  setTheme(saved);
})();
