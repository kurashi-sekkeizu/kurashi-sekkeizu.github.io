/* 結果画面のグラフ（収入と支出・貯蓄残高）
 * - 2つのグラフは横軸（年齢）を共有し、選んだ年が両方のグラフで連動する
 * - 吹き出しは補助。すべての値は「年ごとの数字（表）」でも読める
 * - 文字は textContent で入れる（innerHTML に値を連結しない）
 * 配色はデータ可視化の基準パレット（カテゴリ1〜3番・状態色）を使用
 */
(function () {
  "use strict";

  const COLOR = {
    living: "#2a78d6",   // カテゴリ1 青
    housing: "#eb6834",  // カテゴリ2 橙
    edu: "#1baf7a",      // カテゴリ3 青緑
    car: "#eda100",      // カテゴリ4 黄
    other: "#e87ba4",    // カテゴリ5 マゼンタ
    homeLoan: "#8a4bd3", // カテゴリ6 紫（住宅ローンの返済。借入れの緑の隣に置く）
    loan: "#008300",     // カテゴリ7 緑
    income: "#0b0b0b",   // 収入の線（主インク）
    balance: "#2a78d6",
    scenario: "#52514e",
    ink: "#0b0b0b",
    ink2: "#52514e",
    muted: "#898781",
    grid: "#e1e0d9",
    base: "#c3c2b7",
    track: "#ecebe5",
    surface: "#ffffff",
    critical: "#d03b3b",
    good: "#006300",
  };
  const NS = "http://www.w3.org/2000/svg";
  const man = (n) => KS.man(n);

  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function svgText(attrs, text, parent) {
    const t = svgEl("text", Object.assign({ "font-family": "inherit" }, attrs), parent);
    t.textContent = text;
    return t;
  }
  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
  function yScale(min, max, top, bottom) {
    const step = niceStep((max - min) / 4 || 1);
    const lo = Math.floor(min / step) * step;
    const hi = Math.max(lo + step, Math.ceil(max / step) * step);
    const ticks = [];
    for (let v = lo; v <= hi + 1e-6; v += step) ticks.push(v);
    return { f: (v) => top + (1 - (v - lo) / (hi - lo)) * (bottom - top), ticks, lo, hi };
  }
  function frame(n, W) {
    const L = 52, R = 14;
    const band = (W - L - R) / n;
    return { L, R, W, band, cx: (i) => L + band * (i + 0.5), idxAt: (px) => Math.max(0, Math.min(n - 1, Math.floor((px - L) / band))) };
  }

  function drawYGrid(svg, fr, ys) {
    ys.ticks.forEach((v) => {
      svgEl("line", { x1: fr.L, x2: fr.W - fr.R, y1: ys.f(v), y2: ys.f(v), stroke: v === 0 ? COLOR.base : COLOR.grid, "stroke-width": 1 }, svg);
      svgText({ x: fr.L - 6, y: ys.f(v) + 4, "text-anchor": "end", "font-size": 11, fill: COLOR.muted, style: "font-variant-numeric:tabular-nums" }, Math.round(v).toLocaleString("ja-JP"), svg);
    });
    svgText({ x: 4, y: 12, "font-size": 11, fill: COLOR.muted }, "万円", svg);
  }
  function drawXAxis(svg, fr, points, y) {
    let lastX = -1e9;
    points.forEach((p, i) => {
      const isFirst = i === 0;
      if (!isFirst && p.age % 10 !== 0) return;
      const x = fr.cx(i);
      const halfW = 18;
      if (!isFirst && x - halfW < lastX + 6) return;
      if (!isFirst && x + halfW > fr.W + 10) return;
      lastX = isFirst ? x + 58 : x + halfW;
      svgText({ x, y: y + 14, "text-anchor": isFirst ? "start" : "middle", "font-size": 11, fill: COLOR.ink2 }, isFirst ? `いま ${p.age}歳` : `${p.age}歳`, svg);
      svgText({ x, y: y + 27, "text-anchor": isFirst ? "start" : "middle", "font-size": 10, fill: COLOR.muted }, String(p.year), svg);
    });
  }
  function addCrosshair(svg, fr, top, bottom) {
    const band = svgEl("rect", { x: 0, y: top, width: Math.max(2, fr.band), height: bottom - top, fill: "#0b0b0b", "fill-opacity": 0.05, visibility: "hidden" }, svg);
    const line = svgEl("line", { x1: 0, x2: 0, y1: top, y2: bottom, stroke: COLOR.ink2, "stroke-width": 1, visibility: "hidden" }, svg);
    return (i) => {
      if (i == null) { band.setAttribute("visibility", "hidden"); line.setAttribute("visibility", "hidden"); return; }
      const x = fr.cx(i);
      band.setAttribute("x", x - fr.band / 2);
      line.setAttribute("x1", x); line.setAttribute("x2", x);
      band.setAttribute("visibility", "visible"); line.setAttribute("visibility", "visible");
    };
  }

  // 支出の積み上げの並び（下から）。住宅ローンの返済は、そのほかの借入れの隣に置く
  const SEGS = [
    { key: "living", label: "生活費", color: COLOR.living, get: (p) => p.exp.living },
    { key: "housing", label: "住居費（家賃・税金・修繕）", color: COLOR.housing, get: (p) => p.exp.housing - (p.exp.homeLoan || 0) },
    { key: "edu", label: "教育費", color: COLOR.edu, get: (p) => p.exp.edu },
    { key: "car", label: "車", color: COLOR.car, get: (p) => p.exp.car },
    { key: "other", label: "その他の予定出費", color: COLOR.other, get: (p) => p.exp.other },
    { key: "homeLoan", label: "住宅ローンの返済", color: COLOR.homeLoan, get: (p) => p.exp.homeLoan || 0 },
    { key: "loan", label: "そのほかの借入れの返済", color: COLOR.loan, get: (p) => p.exp.loan },
  ];

  // ② 収入と支出の推移
  function flowChart(r, W) {
    const pts = r.sim0.points, n = pts.length, fr = frame(n, W);
    const T = 20, B = 34, H = 250;
    // 退職金などの一時的な収入は線に含めず、目印で示す（目盛りが引き伸ばされないように）
    const regular = (p) => p.income - Math.round(p.inc.lump || 0);
    const maxV = Math.max(100, ...pts.map((p) => Math.max(regular(p), p.expense)));
    const ys = yScale(0, maxV, T, H - B);
    const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "収入と支出の推移のグラフ。支出は下から生活費・住居費・教育費・車・その他・住宅ローンの返済・そのほかの借入れの積み上げ、収入は線。数字は下の表でも確認できます。" });
    drawYGrid(svg, fr, ys);

    // 支出が収入を上回った年（貯蓄が減る年）に、薄い帯を敷く
    pts.forEach((p, i) => {
      if (p.expense <= p.income) return;
      svgEl("rect", { x: fr.cx(i) - fr.band / 2, y: T, width: fr.band, height: H - B - T, fill: COLOR.critical, "fill-opacity": 0.07 }, svg);
    });
    const bw = Math.max(1, Math.min(24, fr.band - 2));
    const rad = Math.min(4, bw / 2);
    pts.forEach((p, i) => {
      const segs = SEGS.filter((s) => s.get(p) > 0);
      let base = 0;
      segs.forEach((s, si) => {
        const c = s.color;
        const v = s.get(p);
        const yTop = ys.f(base + v), yBot = ys.f(base);
        const gap = si > 0 ? 2 : 0;
        const hh = yBot - yTop - gap;
        base += v;
        if (hh <= 0) return;
        const x = fr.cx(i) - bw / 2;
        if (si === segs.length - 1 && rad > 0 && hh > rad) {
          const yb = yTop + hh;
          svgEl("path", { d: `M${x},${yb}V${yTop + rad}Q${x},${yTop} ${x + rad},${yTop}H${x + bw - rad}Q${x + bw},${yTop} ${x + bw},${yTop + rad}V${yb}Z`, fill: c }, svg);
        } else {
          svgEl("rect", { x, y: yTop, width: bw, height: hh, fill: c }, svg);
        }
      });
    });
    const d = pts.map((p, i) => (i ? "L" : "M") + fr.cx(i).toFixed(1) + "," + ys.f(regular(p)).toFixed(1)).join("");
    svgEl("path", { d, fill: "none", stroke: COLOR.income, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    pts.forEach((p, i) => {
      if (!(p.inc.lump > 0)) return;
      const x = fr.cx(i), y = ys.f(regular(p));
      svgEl("path", { d: `M${x},${y - 14}l6,6l-6,6l-6,-6Z`, fill: COLOR.income, stroke: COLOR.surface, "stroke-width": 2 }, svg);
      const left = x > fr.W * 0.6;
      const ly = T + 26;
      svgEl("line", { x1: x, x2: x, y1: y - 14, y2: ly + 4, stroke: COLOR.ink, "stroke-width": 1 }, svg);
      svgText({ x: x + (left ? -5 : 5), y: ly, "text-anchor": left ? "end" : "start", "font-size": 11, fill: COLOR.ink, stroke: COLOR.surface, "stroke-width": 3, "paint-order": "stroke" }, `＋退職金など ${man(p.inc.lump)}`, svg);
    });

    const ri = pts.findIndex((p) => p.age === 65);
    if (ri > 0) {
      svgEl("line", { x1: fr.cx(ri), x2: fr.cx(ri), y1: T, y2: H - B, stroke: COLOR.base, "stroke-width": 1 }, svg);
      svgText({ x: fr.cx(ri) + 4, y: T + 10, "font-size": 11, fill: COLOR.ink2 }, "定年", svg);
    }
    drawXAxis(svg, fr, pts, H - B);
    const cross = addCrosshair(svg, fr, T, H - B);
    return { svg, fr, cross };
  }

  // ③ 貯蓄残高の推移
  function balanceChart(r, W) {
    const s0 = r.sim0.points, sR = r.simR ? r.simR.points : null, n = s0.length, fr = frame(n, W);
    const T = 20, B = 34, H = 240;
    const vals = s0.map((p) => p.balance).concat(sR ? sR.map((p) => p.balance) : []);
    const ys = yScale(Math.min(0, ...vals), Math.max(100, ...vals), T, H - B);
    const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "貯蓄残高の推移のグラフ。数字は下の表でも確認できます。" });

    if (ys.lo < 0) {
      svgEl("rect", { x: fr.L, y: ys.f(0), width: fr.W - fr.L - fr.R, height: H - B - ys.f(0), fill: COLOR.critical, "fill-opacity": 0.06 }, svg);
      svgText({ x: fr.L + 6, y: H - B - 8, "font-size": 11, fill: COLOR.ink2 }, "⚠ マイナス（不足）", svg);
    }
    s0.forEach((p, i) => {
      if (p.expense <= p.income) return;
      svgEl("rect", { x: fr.cx(i) - fr.band / 2, y: T, width: fr.band, height: H - B - T, fill: COLOR.critical, "fill-opacity": 0.07 }, svg);
    });
    drawYGrid(svg, fr, ys);

    const line = (points) => points.map((p, i) => (i ? "L" : "M") + fr.cx(i).toFixed(1) + "," + ys.f(p.balance).toFixed(1)).join("");
    const posLine = s0.map((p, i) => (i ? "L" : "M") + fr.cx(i).toFixed(1) + "," + ys.f(Math.max(0, p.balance)).toFixed(1)).join("");
    svgEl("path", { d: `${posLine}L${fr.cx(n - 1)},${ys.f(0)}L${fr.cx(0)},${ys.f(0)}Z`, fill: COLOR.balance, "fill-opacity": 0.1 }, svg);
    if (sR) svgEl("path", { d: line(sR), fill: "none", stroke: COLOR.scenario, "stroke-width": 2, "stroke-dasharray": "6 4", "stroke-linejoin": "round" }, svg);
    svgEl("path", { d: line(s0), fill: "none", stroke: COLOR.balance, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);

    const last = s0[n - 1];
    const lx = fr.cx(n - 1), lyv = ys.f(last.balance);
    svgEl("circle", { cx: lx, cy: lyv, r: 4, fill: COLOR.balance, stroke: COLOR.surface, "stroke-width": 2 }, svg);
    svgText({ x: lx - 6, y: lyv + (lyv < T + 24 ? 16 : -8), "text-anchor": "end", "font-size": 12, fill: COLOR.ink, "font-weight": 700 }, `${last.age}歳 ${man(last.balance)}`, svg);

    if (r.sim0.shortageAge !== null) {
      const si = s0.findIndex((p) => p.age === r.sim0.shortageAge);
      const sx = fr.cx(si), sy = ys.f(0);
      svgEl("circle", { cx: sx, cy: sy, r: 5, fill: COLOR.critical, stroke: COLOR.surface, "stroke-width": 2 }, svg);
      const leftSide = sx > fr.W * 0.6;
      svgText({ x: sx + (leftSide ? -8 : 8), y: sy - 8, "text-anchor": leftSide ? "end" : "start", "font-size": 12, fill: COLOR.ink, "font-weight": 700 }, `⚠ ${r.sim0.shortageAge}歳で不足`, svg);
    }
    drawXAxis(svg, fr, s0, H - B);
    const cross = addCrosshair(svg, fr, T, H - B);
    return { svg, fr, cross };
  }

  // 吹き出しの中身
  function tipContent(r, i) {
    const p = r.sim0.points[i];
    const pr = r.simR ? r.simR.points[i] : null;
    const box = document.createDocumentFragment();
    box.appendChild(h("div", "tip-head", `${p.year}年（${p.age}歳）`));
    const row = (key, label, value, cls) => {
      const d = h("div", "tip-row" + (cls ? " " + cls : ""));
      const k = h("span", "tip-key " + key.type);
      if (key.color) k.style.setProperty("--c", key.color);
      d.appendChild(k);
      d.appendChild(h("b", null, value));
      d.appendChild(h("span", "tip-label", label));
      box.appendChild(d);
    };
    row({ type: "line", color: COLOR.income }, "収入（手取り・一時金を含む）", man(p.income));
    if (p.inc.lump > 0) row({ type: "none" }, "※退職金などの一時金は、線には含めず◆で表示しています", "", "sub");
    [["work", "本人の仕事"], ["spouse", "配偶者の仕事"], ["pension", "年金"], ["allowance", "児童手当"], ["lump", "退職金など"]].forEach(([k, l]) => {
      if (p.inc[k] > 0) row({ type: "none" }, l, man(p.inc[k]), "sub");
    });
    row({ type: "none" }, "支出", man(p.expense));
    SEGS.forEach((s) => {
      const v = s.get(p);
      if (v > 0) row({ type: "rect", color: s.color }, s.label + (s.key === "housing" && p.exp.repair > 0 ? `（うち修繕 ${man(p.exp.repair)}）` : ""), man(v), "sub");
    });
    const flow = p.income - p.expense;
    row({ type: "none" }, flow >= 0 ? "その年の収支（黒字）" : "その年の収支（赤字）", (flow >= 0 ? "＋" : "−") + man(Math.abs(flow)), "flow");
    row({ type: "line", color: COLOR.balance }, "貯蓄残高（運用しない場合）", man(p.balance));
    if (pr) row({ type: "dash", color: COLOR.scenario }, `貯蓄残高（年${r.ret}%運用・保証なし）`, man(pr.balance));
    const evs = [];
    r.lanes.forEach((lane) => lane.events.forEach((ev) => { if (ev.offset === i) evs.push(ev.text); }));
    if (r.sim0.shortageAge === p.age) evs.push("⚠ 貯蓄が底をつく見込み");
    if (evs.length) {
      const e = h("div", "tip-events");
      evs.forEach((t) => e.appendChild(h("div", null, "● " + t)));
      box.appendChild(e);
    }
    return box;
  }

  function legend(items) {
    const d = h("div", "viz-legend");
    items.forEach((it) => {
      const s = h("span", "viz-legend-item");
      const k = h("span", "tip-key " + it.type);
      k.style.setProperty("--c", it.color);
      s.appendChild(k);
      s.appendChild(document.createTextNode(it.label));
      d.appendChild(s);
    });
    return d;
  }

  // 結果画面に組み込む（操作つき）
  function mount(root, r) {
    root.replaceChildren();

    const defs = [
      {
        title: "収入と支出の推移", sub: "1年あたり（万円）。棒＝支出の内訳、線＝収入", build: flowChart,
        legend: [{ type: "line", color: COLOR.income, label: "収入（手取り）" }]
          .concat(SEGS.map((s) => ({ type: "rect", color: s.color, label: s.key === "housing" ? "住居費（家賃・税金・修繕）" : s.label })))
          .concat([{ type: "band", color: COLOR.critical, label: "支出が収入を上回る年（貯蓄が減る）" }]),
      },
      {
        title: "貯蓄残高の推移", sub: "各年の終わりの残高（万円）", build: balanceChart,
        legend: [{ type: "line", color: COLOR.balance, label: "運用しない場合" }].concat(
          r.simR ? [{ type: "dash", color: COLOR.scenario, label: `年${r.ret}%で運用した場合（保証されません）` }] : [],
          [{ type: "band", color: COLOR.critical, label: "支出が収入を上回る年（貯蓄が減る）" }]),
      },
    ];

    const state = { idx: 0 };
    const charts = defs.map((def) => {
      const card = h("section", "viz-card");
      card.appendChild(h("h3", "viz-title", def.title));
      card.appendChild(h("p", "viz-sub", def.sub));
      if (def.legend) card.appendChild(legend(def.legend));
      const box = h("div", "viz-box");
      box.tabIndex = 0;
      box.setAttribute("role", "group");
      box.setAttribute("aria-label", `${def.title}。左右の矢印キーで年を選ぶと、その年の内訳を表示します。`);
      const tip = h("div", "viz-tip");
      tip.hidden = true;
      tip.setAttribute("aria-live", "polite");
      card.appendChild(box);
      root.appendChild(card);
      return { def, box, tip, chart: null };
    });

    const n = r.sim0.points.length;
    let lastW = 0;
    function draw() {
      const W = Math.max(260, Math.floor(charts[0].box.clientWidth));
      if (W === lastW) return;
      lastW = W;
      const narrow = W < 480;
      charts.forEach((c) => {
        c.chart = c.def.build(r, W);
        c.box.classList.toggle("narrow", narrow);
        c.box.replaceChildren(c.chart.svg, c.tip);
        if (c.tip.hidden === false) c.chart.cross(state.idx);
      });
    }
    function select(i, active, px) {
      state.idx = i;
      charts.forEach((c) => c.chart.cross(i));
      charts.forEach((c) => { if (c !== active) c.tip.hidden = true; });
      if (!active) return;
      active.tip.replaceChildren(tipContent(r, i));
      active.tip.hidden = false;
      if (active.box.classList.contains("narrow")) { active.tip.style.left = ""; return; }
      const bw = active.box.clientWidth, tw = active.tip.offsetWidth;
      const x = px != null ? px : active.chart.fr.cx(i);
      let left = x > bw / 2 ? x - tw - 12 : x + 12;
      active.tip.style.left = Math.max(0, Math.min(bw - tw, left)) + "px";
    }
    function clear() {
      charts.forEach((c) => {
        if (c.box.classList.contains("narrow") && !c.tip.hidden) return; // 狭い画面ではパネルを残す（レイアウトが跳ねないように）
        c.chart.cross(null);
        c.tip.hidden = true;
      });
    }

    charts.forEach((c) => {
      const onPointer = (e) => {
        const rect = c.box.getBoundingClientRect();
        const px = e.clientX - rect.left;
        select(c.chart.fr.idxAt(px), c, px);
      };
      c.box.addEventListener("pointermove", onPointer);
      c.box.addEventListener("pointerdown", onPointer);
      c.box.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && document.activeElement !== c.box) clear(); });
      c.box.addEventListener("focus", () => select(state.idx, c));
      c.box.addEventListener("blur", clear);
      c.box.addEventListener("keydown", (e) => {
        const step = { ArrowRight: 1, ArrowLeft: -1, PageDown: 5, PageUp: -5 }[e.key];
        let i = state.idx;
        if (step) i += step;
        else if (e.key === "Home") i = 0;
        else if (e.key === "End") i = n - 1;
        else if (e.key === "Escape") { clear(); return; }
        else return;
        e.preventDefault();
        select(Math.max(0, Math.min(n - 1, i)), c);
      });
    });

    draw();
    if (window.ResizeObserver) {
      let raf = 0;
      new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }).observe(root);
    }
  }

  // PDF（印刷）用：操作なしのグラフ
  function staticHTML(r, W) {
    const wrap = document.createElement("div");
    [["収入と支出の推移（1年あたり・万円）　線＝収入（手取り）／棒＝支出（下から生活費・住居費・教育費・車・その他・住宅ローンの返済・そのほかの借入れ）", flowChart], ["貯蓄残高の推移（万円）" + (r.simR ? `　実線＝運用しない場合／点線＝年${r.ret}%（保証されません）` : ""), balanceChart]].forEach(([title, build]) => {
      wrap.appendChild(h("p", "memo-chart-title", title));
      wrap.appendChild(build(r, W).svg);
    });
    return wrap.innerHTML;
  }

  window.KSV = { mount, staticHTML, COLOR };
})();
