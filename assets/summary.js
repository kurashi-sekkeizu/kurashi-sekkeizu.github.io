/* 結果画面の部品：見通しの天気（5項目）／計算に使っている毎月の支出／ライフプラン表（人×年）
 * - 一覧は短く、説明は押したら開く（details/summary）
 * - 文字は textContent で入れる。天気は「マーク＋名前」を必ずセットで表示し、色だけに頼らない
 */
(function () {
  "use strict";

  const WEATHER = {
    sun: { icon: "☀️", name: "晴れ", label: "今の前提では、心配は小さい見込み", rank: 0 },
    cloud: { icon: "⛅", name: "くもり", label: "注意して確認を", rank: 1 },
    rain: { icon: "☔", name: "雨", label: "対策を考える価値あり", rank: 2 },
  };
  const SOURCE = {
    answer: { text: "回答", long: "あなたの回答", cls: "src-answer" },
    detail: { text: "設定済み", long: "くわしく入力の値", cls: "src-detail" },
    provisional: { text: "⚠ 仮", long: "仮の値（一般的な目安）", cls: "src-prov" },
    none: { text: "—", long: "対象なし", cls: "src-none" },
  };

  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const manM = (v) => (Math.round(v * 10) / 10).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + "万円";

  // ── 見通しの天気（一覧は短く、押すと説明） ──
  function forecast(r, onJump) {
    const box = h("div", "forecast");
    const worst = r.forecast.reduce((w, f) => (WEATHER[f.weather].rank > WEATHER[w].rank ? f.weather : w), "sun");
    const count = (k) => r.forecast.filter((f) => f.weather === k).length;

    const head = h("div", "fc-head fc-" + worst);
    const big = h("div", "fc-head-icon", WEATHER[worst].icon);
    big.setAttribute("aria-hidden", "true");
    const hb = h("div");
    hb.appendChild(h("div", "fc-head-sub", "あなたの家計の天気予報"));
    hb.appendChild(h("div", "fc-head-main", ["rain", "cloud", "sun"].filter((k) => count(k)).map((k) => `${WEATHER[k].name} ${count(k)}`).join("・")));
    head.append(big, hb);
    box.appendChild(head);

    const list = h("div", "fc-list");
    r.forecast.forEach((f) => {
      const w = WEATHER[f.weather];
      const det = h("details", "fc fc-" + f.weather);
      const sum = h("summary", "fc-sum");
      const icon = h("span", "fc-icon", w.icon);
      icon.setAttribute("aria-hidden", "true");
      const t = h("span", "fc-sum-text");
      t.appendChild(h("span", "fc-title", f.title));
      t.appendChild(h("span", "fc-short", f.short));
      const lab = h("span", "fc-label", w.name);
      sum.append(icon, t, lab);
      det.appendChild(sum);

      const body = h("div", "fc-body");
      body.appendChild(h("p", "fc-reason", f.reason));
      body.appendChild(h("p", "fc-q", `見ていること：${f.q}`));
      body.appendChild(h("p", "fc-q", `判定：${f.criteria}`));
      if (f.note) body.appendChild(h("p", "fc-note", "※" + f.note));
      if (f.target && onJump) {
        const b = h("button", "linkbtn fc-jump", { cash: "グラフで見る ↓", estimate: "計算の中身を見る ↓", costs: "毎月の支出を見る ↓" }[f.target] || "くわしく見る ↓");
        b.type = "button";
        b.addEventListener("click", () => onJump(f.target));
        body.appendChild(b);
      }
      det.appendChild(body);
      list.appendChild(det);
    });
    box.appendChild(list);
    const foot = h("details", "help fc-foot");
    foot.appendChild(h("summary", null, "天気の見方"));
    const fb = h("div");
    ["sun", "cloud", "rain"].forEach((k) => fb.appendChild(h("div", null, `${WEATHER[k].icon} ${WEATHER[k].name}：${WEATHER[k].label}`)));
    fb.appendChild(h("div", "small", "今の回答と前提（運用しない場合）での見通しです。前提が変わると天気も変わります。"));
    foot.appendChild(fb);
    box.appendChild(foot);
    return box;
  }

  // ── 計算に使っている毎月の支出（一覧は短く、押すと説明） ──
  function costs(r, answers, onFix) {
    const c = r.current;
    const box = h("div", "costs2");
    const rows = [
      { fix: "living", label: "生活費", data: c.living, breakdown: true,
        note: c.living.source === "answer" ? `回答「${KSQ.display(KSQ.byId.living, answers)}」の真ん中で計算。食費・光熱費・通信費・保険料・おこづかいなどの合計です。` : c.living.source === "detail" ? "くわしく入力した内訳の合計です。" : "「わからない」のため、世帯の人数から仮に置いています。" },
      { fix: "home", label: "住居費", data: c.housing, note: c.housing.note },
      { fix: "edu", label: "教育費", data: c.edu, note: c.edu.note },
      { fix: "car", label: "車", data: c.car, note: c.car.note },
      { fix: "spend", label: "その他", data: c.other, note: c.other.note },
    ];
    rows.forEach((row) => {
      const src = SOURCE[row.data.source] || SOURCE.none;
      const det = h("details", "cost-row");
      const sum = h("summary", "cost-sum");
      sum.appendChild(h("span", "cost-label", row.label));
      sum.appendChild(h("span", "src " + src.cls, src.text));
      sum.appendChild(h("span", "cost-value", manM(row.data.monthly)));
      det.appendChild(sum);
      const body = h("div", "cost-body");
      body.appendChild(h("p", "costs-note", `${src.long}。${row.note}`));
      if (row.breakdown) {
        const ul = h("ul", "breakdown-list");
        c.living.items.forEach((it) => {
          const li = h("li");
          li.appendChild(h("span", null, it.label));
          li.appendChild(h("b", null, manM(it.monthly)));
          ul.appendChild(li);
        });
        body.appendChild(ul);
        if (c.living.source !== "detail") body.appendChild(h("p", "costs-note", "内訳は一般的な割合で分けた目安です（プロトタイプの仮の割合）。"));
      }
      const b = h("button", "btn secondary inline costs-fixbtn", "くわしく入力で直す");
      b.type = "button";
      b.addEventListener("click", () => onFix(row.fix));
      body.appendChild(b);
      det.appendChild(body);
      box.appendChild(det);
    });
    const diff = c.incomeMonthly - c.total;
    const total = h("div", "cost-total");
    total.appendChild(h("span", "cost-label", "合計（毎月）"));
    total.appendChild(h("span", "cost-value", manM(c.total)));
    box.appendChild(total);
    box.appendChild(h("div", "cost-income", `手取り 月${manM(c.incomeMonthly)} → 毎月 ${diff >= 0 ? manM(diff) + " 余る" : manM(-diff) + " 不足"}`));
    return box;
  }

  // ── ライフプラン表（縦＝人、横＝年） ──
  const ICON = { car: "🚗", repair: "🔧", home: "🏠", care: "👵", spend: "✈️", work: "💼" };
  const SHORT_ICON = { 誕生: "👶", 小学校: "🎒", 中学: "🏫", 高校: "🏫", 大学: "🎓", 専門: "🎓", 独立: "🌱", 定年: "👔", 年金: "💴", 完済: "🏠" };
  const iconOf = (e) => ICON[e.kind] || SHORT_ICON[e.short] || "●";

  function stageOf(kid, kidAge) {
    const p = kid.plan;
    const pri = (v) => (v === "private" ? "私" : "");
    if (kidAge > kid.independ) return null;
    if (kidAge < 0) return { text: "", cls: "st-unborn", hideAge: true };
    if (kidAge === kid.independ && kidAge >= 18) return { text: "", cls: "st-pre" };
    if (kidAge < 6) return { text: "", cls: "st-pre" };
    if (kidAge <= 11) return { text: `小${kidAge - 5}${pri(p.elem)}`, cls: "st-elem" };
    if (kidAge <= 14) return { text: `中${kidAge - 11}${pri(p.junior)}`, cls: "st-junior" };
    if (kidAge <= 17) return { text: `高${kidAge - 14}${pri(p.high)}`, cls: "st-high" };
    if (p.univ === "none") return { text: "", cls: "st-pre" };
    return { text: `${p.univ === "vocational" ? "専" : "大"}${kidAge - 17}`, cls: "st-univ" };
  }

  function lifeTable(r) {
    const pts = r.sim0.points;
    const n = pts.length;
    const box = h("div", "lt-box");

    const legend = h("div", "lt-legend");
    [["👶", "誕生"], ["🎒🏫🎓", "入学"], ["🌱", "独立"], ["👔", "定年"], ["💴", "年金"], ["💼", "働き方"], ["🚗", "車"], ["🔧", "修繕"], ["🏠", "住まい"], ["👵", "介護"], ["✈️", "出費"]].forEach(([i, t]) => legend.appendChild(h("span", null, `${i} ${t}`)));
    box.appendChild(legend);

    // 行の定義：レーン（あなた・配偶者・子…・くらし）＋貯蓄残高
    const laneRows = r.lanes.map((lane, li) => {
      const isLife = lane.ageNow == null;
      const kidIdx = lane.kidIdx != null ? lane.kidIdx : -1;
      const byOff = {};
      lane.events.forEach((e) => { (byOff[e.offset] = byOff[e.offset] || []).push(e); });
      return { lane, isLife, kidIdx, byOff };
    });

    const scroll = h("div", "lt-scroll");
    scroll.tabIndex = 0;
    scroll.setAttribute("role", "region");
    scroll.setAttribute("aria-label", "ライフプラン表。横にスクロールできます。年の列を押すと、その年の内訳を表示します。");
    const table = h("table", "lt");
    const thead = h("thead");
    const trY = h("tr");
    trY.appendChild(h("th", "lt-name lt-corner", "年"));
    pts.forEach((p, i) => {
      const th = h("th", "lt-year" + (i === 0 ? " lt-now" : "") + (p.year % 5 === 0 ? " lt-five" : ""));
      th.dataset.col = i;
      th.appendChild(h("span", "lt-y", String(p.year)));
      if (i === 0) th.appendChild(h("span", "lt-nowmark", "いま"));
      trY.appendChild(th);
    });
    thead.appendChild(trY);
    table.appendChild(thead);

    const tbody = h("tbody");
    laneRows.forEach((row) => {
      const tr = h("tr", row.isLife ? "lt-life" : "");
      const name = h("th", "lt-name", row.isLife ? "くらし" : row.lane.label);
      name.scope = "row";
      tr.appendChild(name);
      for (let i = 0; i < n; i++) {
        const td = h("td", pts[i].year % 5 === 0 ? "lt-five" : "");
        td.dataset.col = i;
        if (!row.isLife) {
          const a = row.lane.ageNow + i;
          if (row.kidIdx >= 0) {
            const st = stageOf(r.kidInfo[row.kidIdx], a);
            if (st === null) { td.classList.add("lt-empty"); tr.appendChild(td); continue; }
            td.classList.add(st.cls);
            if (!st.hideAge) td.appendChild(h("span", "lt-age", String(a)));
            if (st.text) td.appendChild(h("span", "lt-stage", st.text));
          } else {
            td.appendChild(h("span", "lt-age", String(a)));
          }
        }
        const evs = row.byOff[i] || [];
        if (evs.length) {
          td.classList.add("lt-has");
          td.appendChild(h("span", "lt-icons", evs.map(iconOf).join("")));
          if (row.isLife) {
            const amt = evs.reduce((t, e) => t + (e.amount || 0), 0);
            if (amt > 0) td.appendChild(h("span", "lt-amt", Math.round(amt).toLocaleString("ja-JP")));
          }
          td.title = evs.map((e) => e.text).join("／");
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    // 貯蓄残高
    const trB = h("tr", "lt-balance");
    const nb = h("th", "lt-name", "貯蓄残高");
    nb.scope = "row";
    trB.appendChild(nb);
    pts.forEach((p, i) => {
      const td = h("td", (p.balance < 0 ? "lt-neg" : "") + (p.year % 5 === 0 ? " lt-five" : ""));
      td.dataset.col = i;
      td.appendChild(h("span", "lt-bal", Math.round(p.balance / 10) * 10 < 0 ? "−" + Math.abs(Math.round(p.balance / 10) * 10).toLocaleString("ja-JP") : (Math.round(p.balance / 10) * 10).toLocaleString("ja-JP")));
      trB.appendChild(td);
    });
    tbody.appendChild(trB);
    table.appendChild(tbody);
    scroll.appendChild(table);
    box.appendChild(scroll);
    box.appendChild(h("p", "lt-hint", "← 横にスクロールできます。年の列を押すと、その年の内訳が出ます。（くらしの数字＝その年の大きな出費、貯蓄残高＝万円）"));

    // 選んだ年の内訳
    const panel = h("div", "lt-panel");
    panel.setAttribute("aria-live", "polite");
    box.appendChild(panel);

    function select(i) {
      table.querySelectorAll(".lt-sel").forEach((e) => e.classList.remove("lt-sel"));
      table.querySelectorAll(`[data-col="${i}"]`).forEach((e) => e.classList.add("lt-sel"));
      const p = pts[i];
      panel.replaceChildren();
      const head = h("div", "lt-panel-head");
      head.appendChild(h("b", null, `${p.year}年`));
      const ages = [`あなた ${r.age + i}歳`];
      if (r.spouse) ages.push(`配偶者 ${r.spouseAge + i}歳`);
      r.kidInfo.forEach((k, ki) => { const a = k.ageNow + i; if (a >= 0 && a <= k.independ) ages.push(`${r.kidInfo.length > 1 ? `子${ki + 1}` : "子"} ${a}歳`); });
      head.appendChild(h("span", "lt-panel-ages", ages.join("・")));
      panel.appendChild(head);
      const evs = [];
      laneRows.forEach((row) => (row.byOff[i] || []).forEach((e) => evs.push(e)));
      if (evs.length) {
        const ul = h("ul", "lt-panel-events");
        evs.forEach((e) => ul.appendChild(h("li", null, `${iconOf(e)} ${e.text}`)));
        panel.appendChild(ul);
      } else {
        panel.appendChild(h("p", "lt-panel-none", "大きな出来事はありません"));
      }
      const money = h("div", "lt-panel-money");
      [["収入（手取り）", p.income], ["支出", p.expense], ["貯蓄残高", p.balance]].forEach(([l, v]) => {
        const d = h("div");
        d.appendChild(h("span", null, l));
        d.appendChild(h("b", v < 0 ? "neg" : null, KS.man(v)));
        money.appendChild(d);
      });
      panel.appendChild(money);
    }
    table.addEventListener("click", (e) => {
      const cell = e.target.closest("[data-col]");
      if (cell) select(Number(cell.dataset.col));
    });
    scroll.addEventListener("keydown", (e) => {
      const cur = Number(table.querySelector("th.lt-sel")?.dataset.col ?? 0);
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const next = Math.max(0, Math.min(n - 1, cur + step));
      select(next);
      table.querySelector(`th[data-col="${next}"]`).scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    select(0);
    return box;
  }

  window.KSR = { forecast, costs, lifeTable, WEATHER };
})();
