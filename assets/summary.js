/* 結果画面の部品：見通しの天気（5項目）／計算に使っている毎月の支出／これからの出来事（年表）
 * 文字は textContent で入れる。天気は「マーク＋言葉」を必ずセットで表示し、色だけに頼らない。
 */
(function () {
  "use strict";

  const WEATHER = {
    sun: { icon: "☀️", name: "晴れ", label: "今の前提では、心配は小さい見込み", rank: 0 },
    cloud: { icon: "⛅", name: "くもり", label: "注意して確認を", rank: 1 },
    rain: { icon: "☔", name: "雨", label: "対策を考える価値あり", rank: 2 },
  };
  const SOURCE = {
    answer: { text: "あなたの回答", cls: "src-answer" },
    detail: { text: "くわしく入力の値", cls: "src-detail" },
    provisional: { text: "⚠ 仮の値（一般的な目安）", cls: "src-prov" },
    none: { text: "—", cls: "src-none" },
  };

  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const manM = (v) => (Math.round(v * 10) / 10).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + "万円";

  // ── 見通しの天気 ──
  function forecast(r, onJump) {
    const box = h("div", "forecast");
    const worst = r.forecast.reduce((w, f) => (WEATHER[f.weather].rank > WEATHER[w].rank ? f.weather : w), "sun");
    const count = (k) => r.forecast.filter((f) => f.weather === k).length;

    const head = h("div", "fc-head fc-" + worst);
    const big = h("div", "fc-head-icon", WEATHER[worst].icon);
    big.setAttribute("aria-hidden", "true");
    const hb = h("div");
    hb.appendChild(h("div", "fc-head-sub", "あなたの家計の天気予報"));
    hb.appendChild(h("div", "fc-head-main", ["rain", "cloud", "sun"].filter((k) => count(k)).map((k) => `${WEATHER[k].icon}${WEATHER[k].name} ${count(k)}つ`).join("　")));
    hb.appendChild(h("div", "fc-head-note", "今の回答と前提での見通しです。前提が変わると天気も変わります。"));
    head.append(big, hb);
    box.appendChild(head);

    const list = h("ul", "fc-list");
    r.forecast.forEach((f) => {
      const w = WEATHER[f.weather];
      const li = h("li", "fc fc-" + f.weather);
      const icon = h("span", "fc-icon", w.icon);
      icon.setAttribute("aria-hidden", "true");
      const body = h("div", "fc-body");
      const title = h("div", "fc-title");
      title.appendChild(h("b", null, f.title));
      title.appendChild(h("span", "fc-label", `${w.name}：${w.label}`));
      body.appendChild(title);
      body.appendChild(h("div", "fc-q", f.q));
      body.appendChild(h("p", "fc-reason", f.reason));
      if (f.note) body.appendChild(h("p", "fc-note", "※" + f.note));
      if (f.target && onJump) {
        const b = h("button", "linkbtn fc-jump", { cash: "グラフで見る ↓", estimate: "計算の中身を見る ↓", costs: "毎月の支出を見る ↓" }[f.target] || "くわしく見る ↓");
        b.type = "button";
        b.addEventListener("click", () => onJump(f.target));
        body.appendChild(b);
      }
      li.append(icon, body);
      list.appendChild(li);
    });
    box.appendChild(list);
    return box;
  }

  // ── 計算に使っている毎月の支出 ──
  function costs(r, answers, onFix) {
    const c = r.current;
    const box = h("div", "card costs");
    const rows = [
      { key: "living", fix: "living", label: "生活費", sub: "食費・光熱費・通信費・保険料・おこづかいなど", data: c.living,
        note: c.living.source === "answer" ? `回答「${KSQ.display(KSQ.byId.living, answers)}」の真ん中で計算` : c.living.source === "detail" ? "内訳の合計" : "「わからない」のため、世帯の人数から仮置き" },
      { key: "housing", fix: "home", label: "住居費", data: c.housing, note: c.housing.note },
      { key: "edu", fix: "edu", label: "教育費", data: c.edu, note: c.edu.note },
      { key: "car", fix: "car", label: "車", data: c.car, note: c.car.note },
      { key: "other", fix: "spend", label: "その他", data: c.other, note: c.other.note },
    ];
    const table = h("table", "costs-table");
    const tb = h("tbody");
    rows.forEach((row) => {
      const tr = h("tr");
      const th = h("th");
      th.scope = "row";
      th.appendChild(h("div", "costs-label", row.label));
      if (row.sub) th.appendChild(h("div", "costs-sub", row.sub));
      const td = h("td", "costs-value", manM(row.data.monthly));
      const tdSrc = h("td", "costs-src");
      const src = SOURCE[row.data.source] || SOURCE.none;
      tdSrc.appendChild(h("span", "src " + src.cls, src.text));
      tdSrc.appendChild(h("div", "costs-note", row.note));
      const tdFix = h("td", "costs-fix");
      const b = h("button", "btn secondary inline costs-fixbtn", "直す");
      b.type = "button";
      b.setAttribute("aria-label", `${row.label}をくわしく入力で直す`);
      b.addEventListener("click", () => onFix(row.fix));
      tdFix.appendChild(b);
      tr.append(th, td, tdSrc, tdFix);
      tb.appendChild(tr);

      if (row.key === "living") {
        const tr2 = h("tr", "costs-breakdown");
        const cell = h("td");
        cell.colSpan = 4;
        const det = h("details", "help");
        det.appendChild(h("summary", null, c.living.source === "detail" ? "生活費の内訳を見る（くわしく入力の値）" : "生活費の内訳の目安を見る"));
        const inner = h("div");
        if (c.living.source !== "detail") inner.appendChild(h("p", "small", "一般的な家計の割合で分けた目安です（プロトタイプの仮の割合）。実際の家計と見比べてください。"));
        const ul = h("ul", "breakdown-list");
        c.living.items.forEach((it) => {
          const li = h("li");
          li.appendChild(h("span", null, it.label));
          li.appendChild(h("b", null, manM(it.monthly)));
          ul.appendChild(li);
        });
        inner.appendChild(ul);
        det.appendChild(inner);
        cell.appendChild(det);
        tr2.appendChild(cell);
        tb.appendChild(tr2);
      }
    });
    const tf = h("tr", "costs-total");
    const tth = h("th", null, "合計（毎月）");
    tth.scope = "row";
    const ttd = h("td", "costs-value", manM(c.total));
    const tnote = h("td", "costs-src");
    tnote.colSpan = 2;
    const diff = c.incomeMonthly - c.total;
    tnote.appendChild(h("div", "costs-note", `参考：いまの手取り収入 月${manM(c.incomeMonthly)}（児童手当を含む）→ 毎月 ${diff >= 0 ? "約" + manM(diff) + "の余り" : "約" + manM(-diff) + "の不足"}`));
    tf.append(tth, ttd, tnote);
    tb.appendChild(tf);
    table.appendChild(tb);
    const wrap = h("div", "table-wrap");
    wrap.appendChild(table);
    box.appendChild(wrap);
    return box;
  }

  // ── これからの出来事（年表） ──
  function timeline(r) {
    const box = h("div", "tl-box");
    const ol = h("ol", "tl");
    const now = r.sim0.points[0];
    const nowAges = r.timeline.length ? r.timeline[0].ages.map((a) => ({ who: a.who, age: a.age - r.timeline[0].offset })) : [{ who: "あなた", age: r.age }];
    const mkRow = (year, whenText, ages, items, cls) => {
      const li = h("li", "tl-row" + (cls ? " " + cls : ""));
      const when = h("div", "tl-when");
      when.appendChild(h("b", null, `${year}年`));
      when.appendChild(h("span", null, whenText));
      const main = h("div", "tl-main");
      main.appendChild(h("div", "tl-ages", ages.map((a) => `${a.who} ${a.age}歳`).join("・")));
      const ul = h("ul", "tl-items");
      items.forEach((it) => {
        const li2 = h("li", "tl-item tl-" + it.kind);
        const ic = h("span", "tl-icon", it.icon);
        ic.setAttribute("aria-hidden", "true");
        li2.appendChild(ic);
        li2.appendChild(h("span", "tl-text", it.text));
        if (it.amount >= 30) li2.appendChild(h("b", "tl-amt" + (it.amount >= 100 ? " big" : ""), KS.man(it.amount)));
        ul.appendChild(li2);
      });
      main.appendChild(ul);
      li.append(when, main);
      return li;
    };
    ol.appendChild(mkRow(now.year, "いま", nowAges, [{ icon: "📍", text: `貯蓄 約${KS.man(r.savings)}からスタート`, amount: 0, kind: "life" }], "tl-now"));
    const rows = r.timeline.filter((t) => t.offset > 0);
    const FIRST = 8;
    rows.forEach((t, i) => {
      const li = mkRow(t.year, `${t.offset}年後`, t.ages, t.items, t.items.some((it) => it.kind === "alert") ? "tl-alert" : "");
      if (i >= FIRST) li.hidden = true;
      ol.appendChild(li);
    });
    box.appendChild(ol);
    if (rows.length > FIRST) {
      const more = h("button", "btn secondary", `すべて表示（残り${rows.length - FIRST}件）`);
      more.type = "button";
      more.addEventListener("click", () => {
        ol.querySelectorAll("li.tl-row[hidden]").forEach((li) => { li.hidden = false; });
        more.remove();
      });
      box.appendChild(more);
    }
    box.appendChild(h("p", "small muted", "金額は、その年に見込んでいる大きな出費です（修繕・車・教育費のピークなど）。"));
    return box;
  }

  window.KSR = { forecast, costs, timeline, WEATHER };
})();
