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

  // 雨が多いとき・晴れが続くときの、受け止め方の案内
  function advice(r, onFix, a) {
    const rain = r.forecast.filter((f) => f.weather === "rain").length;
    const box = h("div");
    if (rain >= 3 && r.todos.length) {
      const c = h("div", "advice advice-rain");
      c.appendChild(h("div", "advice-head", "雨が続いていますが、全部を一度に直す必要はありません"));
      c.appendChild(h("p", "advice-lead", "まず1つだけやるなら、これです。"));
      const t = r.todos[0];
      const card = h("div", "advice-card");
      card.appendChild(h("b", null, t.title));
      card.appendChild(h("p", "small", t.reason));
      c.appendChild(card);
      c.appendChild(h("p", "small muted", "ほかの項目は、下の「まずやること」で順に確認できます。"));
      box.appendChild(c);
    } else if (rain === 0) {
      const c = h("div", "advice advice-sun");
      // 候補と文は説明の層（済んだ項目は出さない・物価は1段高い値。2026-10-31 B3-軽8）
      const fixes = KSX.adviceFixes(r, a);
      const L = KSX.adviceLead(r, fixes.length > 0);
      c.appendChild(h("div", "advice-head", L.head));
      if (L.lead) c.appendChild(h("p", "advice-lead", L.lead));
      const ul = h("ul", "advice-list");
      fixes.forEach(([label, key]) => {
        const li = h("li");
        const b = h("button", "linkbtn", label);
        b.type = "button";
        b.addEventListener("click", () => onFix(key));
        li.appendChild(b);
        ul.appendChild(li);
      });
      if (fixes.length) c.appendChild(ul);
      box.appendChild(c);
    }
    return box;
  }

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
    // 表示する値は KSX.costShown（行を足すと表示の合計・差額は表示どおり。第12巡 B12-中3）
    const shown = KSX.costShown(c);
    const box = h("div", "costs2");
    if (r.loanMismatch) {
      const w = h("div", "note warn small cost-warn");
      w.textContent = "⚠ 住宅ローンの入力に食い違いがあります。" + r.loanMismatch;
      box.appendChild(w);
    }
    const rows = [
      { key: "living", fix: "living", label: "生活費", data: c.living, breakdown: true,
        note: c.living.source === "answer" ? `回答「${KSQ.display(KSQ.byId.living, answers)}」の真ん中で計算。食費・光熱費・通信費・保険料・おこづかいなどの合計です。` : c.living.source === "detail" ? "くわしく入力した内訳の合計です。" : "「わからない」のため、世帯の人数から仮に置いています。" },
      { key: "homeLoan", fix: "home", label: "住宅ローンの返済", data: c.homeLoan, note: c.homeLoan.note, skipIfNone: true },
      { key: "housing", fix: "home", label: "住居費（家賃・税金など）", data: c.housing, note: c.housing.note },
      { key: "edu", fix: "edu", label: "教育費", data: c.edu, note: c.edu.note },
      { key: "car", fix: "car", label: "車", data: c.car, note: c.car.note },
      { key: "loan", fix: "loans", label: "そのほかの借入れ", data: c.loan, note: c.loan.note },
      { key: "other", fix: "spend", label: "その他", data: c.other, note: c.other.note },
    ];
    rows.forEach((row) => {
      if (row.skipIfNone && row.data.source === "none") return;   // 住宅ローンがない人には出さない
      const src = SOURCE[row.data.source] || SOURCE.none;
      const det = h("details", "cost-row");
      const sum = h("summary", "cost-sum");
      sum.appendChild(h("span", "cost-label", row.label));
      sum.appendChild(h("span", "src " + src.cls, src.text));
      sum.appendChild(h("span", "cost-value", manM(shown.rows[row.key])));
      det.appendChild(sum);
      const body = h("div", "cost-body");
      body.appendChild(h("p", "costs-note", `${src.long}。${row.note}`));
      if (row.breakdown) {
        const ul = h("ul", "breakdown-list");
        c.living.items.forEach((it, i) => {
          const li = h("li");
          li.appendChild(h("span", null, it.label));
          li.appendChild(h("b", null, manM(shown.livingItems[i])));
          ul.appendChild(li);
        });
        body.appendChild(ul);
        if (c.living.source !== "detail") body.appendChild(h("p", "costs-note", "内訳は、家計調査の平均の割合で分けた目安です。実際の内訳は「くわしく入力」で直せます。"));
      }
      // 飛び先のセクションが無い項目には、修正ボタンを出さない（押しても何も開かないため）
      const noSection = row.fix === "edu" && !(r.kidInfo || []).length;
      const b = h("button", "btn secondary inline costs-fixbtn", "くわしく入力で直す");
      b.type = "button";
      b.hidden = noSection;
      b.addEventListener("click", () => onFix(row.fix));
      body.appendChild(b);
      det.appendChild(body);
      box.appendChild(det);
    });
    const diff = shown.diff;
    if (diff < 0) {
      const warn = h("div", "note warn small cost-warn");
      warn.textContent = `入力した支出の合計（月${manM(shown.total)}）が、手取り（月${manM(shown.income)}）を上回っています。実際と違う項目がないか確認してください（生活費・住居費・借入れなど）。`;
      box.appendChild(warn);
    }
    const total = h("div", "cost-total");
    total.appendChild(h("span", "cost-label", "合計（毎月）"));
    total.appendChild(h("span", "cost-value", manM(shown.total)));
    box.appendChild(total);
    box.appendChild(h("div", "cost-income", `手取り 月${manM(shown.income)} → 毎月 ${diff >= 0 ? manM(diff) + " 余る" : manM(-diff) + " 不足"}`));
    return box;
  }

  // ── 家計の表（縦＝費目、横＝年） ──
  function costTable(r) {
    const pts = r.sim0.points;
    const box = h("div", "ct-box");
    const head = h("div", "ct-head");
    const label = h("span", "small muted", "表示：");
    const toggle = h("div", "radio-row ct-toggle");
    const state = { unit: "month" };
    [["month", "毎月（万円）"], ["year", "1年あたり（万円）"]].forEach(([v, t]) => {
      const lab = h("label");
      const i = h("input");
      i.type = "radio"; i.name = "ct-unit"; i.value = v; i.checked = v === state.unit;
      i.addEventListener("change", () => { state.unit = v; draw(); });
      lab.append(i, document.createTextNode(t));
      toggle.appendChild(lab);
    });
    head.append(label, toggle);
    box.appendChild(head);

    const scroll = h("div", "lt-scroll");
    scroll.setAttribute("role", "region");
    scroll.setAttribute("aria-label", "年ごとの家計の表。横にスクロールできます。");
    scroll.tabIndex = 0;
    box.appendChild(scroll);
    box.appendChild(h("p", "lt-hint", "← 横にスクロールできます。⚠ の付いた年は、支出が収入を上回る年（貯蓄が減る年）です。"));

    const ROWS = [
      { key: "income", label: "収入（手取り）", get: (p) => p.income, cls: "ct-income" },
      { key: "living", label: "生活費", get: (p) => p.exp.living },
      { key: "homeLoan", label: "住宅ローンの返済", get: (p) => p.exp.homeLoan || 0 },
      { key: "housing", label: "住居費（家賃・税金など）", get: (p) => p.exp.housing - (p.exp.homeLoan || 0) },
      { key: "edu", label: "教育費", get: (p) => p.exp.edu },
      { key: "car", label: "車", get: (p) => p.exp.car },
      { key: "loan", label: "そのほかの借入れ", get: (p) => p.exp.loan },
      { key: "other", label: "その他", get: (p) => p.exp.other },
      { key: "total", label: "支出の合計", get: (p) => p.expense, cls: "ct-total" },
      { key: "flow", label: "収支", get: (p) => p.income - p.expense, cls: "ct-flow" },
      // 残高は丸める前の値でマイナスを見る（丸めると0になるマイナスを「0」と書かない。2026-10-31 B3-軽5）
      { key: "balance", label: "貯蓄残高", get: (p) => p.balance, cls: "ct-balance", always: "year", text: (p) => KSX.balanceCell(p) },
    ];

    function fmt(v, row) {
      const yearly = state.unit === "year" || row.always === "year";
      const n = yearly ? v : v / 12;
      if (Math.abs(n) < 0.05) return "0";
      const r1 = yearly ? Math.round(n) : Math.round(n * 10) / 10;
      return (r1 < 0 ? "−" : "") + Math.abs(r1).toLocaleString("ja-JP");
    }

    function draw() {
      const table = h("table", "lt ct");
      const thead = h("thead");
      const trY = h("tr");
      trY.appendChild(h("th", "lt-name lt-corner", "年（年齢）"));
      pts.forEach((p, i) => {
        const minus = p.expense > p.income;
        const th = h("th", "lt-year" + (i === 0 ? " lt-now" : "") + (p.year % 5 === 0 ? " lt-five" : "") + (minus ? " ct-minus" : ""));
        if (minus) th.title = "支出が収入を上回る年（貯蓄が減る年）";
        th.appendChild(h("span", "lt-y", String(p.year)));
        th.appendChild(h("span", "lt-age", `${p.age}歳`));
        trY.appendChild(th);
      });
      thead.appendChild(trY);
      table.appendChild(thead);
      const tbody = h("tbody");
      ROWS.forEach((row) => {
        if (row.key === "loan" && pts.every((p) => !p.exp.loan)) return;
        if (row.key === "homeLoan" && pts.every((p) => !p.exp.homeLoan)) return;
        if (row.key === "other" && pts.every((p) => !p.exp.other)) return;
        const tr = h("tr", row.cls || "");
        const th = h("th", "lt-name", row.label + (row.always === "year" ? "（年末）" : ""));
        th.scope = "row";
        tr.appendChild(th);
        pts.forEach((p) => {
          const v = row.get(p);
          const td = h("td", (p.year % 5 === 0 ? "lt-five " : "") + (row.key === "flow" && v < 0 ? "lt-neg" : "") + (row.key === "balance" && p.raw < 0 ? "lt-neg" : ""));
          td.textContent = row.text ? row.text(p) : fmt(v, row);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      scroll.replaceChildren(table);
    }
    draw();
    return box;
  }

  // ── 家計調査の平均と見比べる ──
  // 「多い＝悪い」とは書かない。差があることと、比べられない費目があることを示すだけ（CLAUDE.md §4）
  function householdSize(r) {
    if (typeof r.householdNow === "number") return r.householdNow;
    return 1 + (r.spouse ? 1 : 0) + (r.kidInfo ? r.kidInfo.filter((k) => k.ageNow >= 0 && k.ageNow <= k.independ).length : 0);
  }

  function pickGroup(r, a, groups) {
    const persons = householdSize(r);
    if (persons === 2 && Number(r.age) >= 65 && a.work === "none" && groups.elderly_couple) return "elderly_couple";
    if (persons <= 1) return "single";
    if (persons === 2) return "two_person";
    if (persons === 3) return "three_person";
    if (persons === 4) return "four_person";
    return "five_person";
  }

  // 年齢の軸では、世帯人数に合う系列（単身／二人以上）の中から、年齢の合う区分を選ぶ
  function ageGroupsFor(r, byAge) {
    const kind = householdSize(r) <= 1 ? "single" : "two_plus";
    return Object.fromEntries(Object.entries(byAge || {}).filter(([, g]) => g.household === kind));
  }

  function pickAgeGroup(r, groups) {
    const age = Number(r.age);
    const hit = Object.entries(groups).find(([, g]) => age >= g.ageMin && age <= g.ageMax);
    return hit ? hit[0] : Object.keys(groups)[0];
  }

  function compare(r, a) {
    const box = h("div", "compare");
    const K = window.KSDATA && window.KSDATA.kakei;
    if (!K || !K.groups || !K.map) {
      box.appendChild(h("p", "note warn small", "⚠ 家計調査のデータを読み込めませんでした。比較は表示していません。"));
      return box;
    }
    const src = (window.KSDATA.sources || {})[K.survey.src] || {};
    const c = r.current;
    const L = Object.fromEntries(c.living.items.map((i) => [i.key, i.monthly]));
    const SPECIAL = { car: c.car.monthly, education: c.edu.monthly, housing: c.housing.monthly, loan: c.loan.monthly };
    const mine = (key) => (L[key] != null ? L[key] : SPECIAL[key] != null ? SPECIAL[key] : 0);

    // 比べる相手を選ぶ。人数の軸と年齢の軸があり、どちらか一方でしか比べられない
    // （家計調査に「年齢×世帯人員」のクロス集計がないため）
    const ageGroups = ageGroupsFor(r, K.groupsByAge);
    const hasAge = Object.keys(ageGroups).length > 0;
    // 単身は、平均が高齢者に強く引きずられるため、年齢の軸を既定にする
    let axis = hasAge && householdSize(r) <= 1 ? "age" : "persons";
    let gkey = pickGroup(r, a, K.groups);
    let akey = hasAge ? pickAgeGroup(r, ageGroups) : null;
    const groupsOf = () => (axis === "age" ? ageGroups : K.groups);
    const keyOf = () => (axis === "age" ? akey : gkey);

    const pick = h("div", "compare-pick");
    const axisSel = h("select");
    axisSel.setAttribute("aria-label", "比べ方を選ぶ");
    if (hasAge) {
      [["persons", (K.axes && K.axes.persons) || "世帯の人数で比べる"], ["age", (K.axes && K.axes.age) || "年齢で比べる"]].forEach(([v, label]) => {
        const o = h("option", null, label);
        o.value = v;
        if (v === axis) o.selected = true;
        axisSel.appendChild(o);
      });
      pick.appendChild(axisSel);
    }
    const sel = h("select");
    sel.setAttribute("aria-label", "比べる相手の区分を選ぶ");
    function fillGroups() {
      sel.textContent = "";
      Object.entries(groupsOf()).forEach(([k, g]) => {
        const o = h("option", null, g.label);
        o.value = k;
        if (k === keyOf()) o.selected = true;
        sel.appendChild(o);
      });
    }
    fillGroups();
    pick.appendChild(sel);
    box.appendChild(pick);

    const body = h("div");
    box.appendChild(body);

    function render() {
      body.textContent = "";
      const g = groupsOf()[keyOf()];
      const shape = [
        g.persons ? `平均 ${g.persons}人` : null,
        g.headAge ? `世帯主の平均 ${g.headAge}歳` : null,
      ].filter(Boolean).join("・");
      const cite = h("p", "small muted");
      if (src.url) {
        const link = h("a", null, `${src.publisher || ""}「${K.survey.name}」`);
        link.href = src.url;
        link.rel = "noopener";
        cite.appendChild(link);
      } else {
        cite.appendChild(document.createTextNode(`${src.publisher || ""}「${K.survey.name}」`));
      }
      cite.appendChild(document.createTextNode(
        `${K.survey.year}${src.checked ? "／確認日 " + src.checked : ""}／${g.label}（${shape}）の1か月あたりの平均と並べています。`));
      body.appendChild(cite);
      if (K.smallSampleUnder && g.n && g.n < K.smallSampleUnder) {
        body.appendChild(h("p", "note warn small", `⚠ この区分は集計した世帯数が少ないため（${g.n}世帯）、数字が振れやすくなっています。`));
      }
      if (axis === "age") {
        body.appendChild(h("p", "small muted", "年齢でそろえると、世帯の人数はそろいません。食費や光熱費は人数で動くので、人数の軸もあわせて見てください。"));
      }

      const rows = [];
      const skipped = [];
      K.map.forEach((m) => {
        if (!m.kakei) { skipped.push(m); return; }
        const you = (m.parts || [m.key]).reduce((t, k) => t + mine(k), 0);
        const avg = (g.items[m.kakei] || 0) / 10000; // 円 → 万円
        // どちらもほぼ0の費目は、比べても何もわからない（表示上は「0万円」でも数円残ることがある）
        if (you < 0.05 && avg < 0.05) return;
        let note = m.note;
        const kidsNow = (r.kidInfo || []).filter((k) => k.ageNow >= 0 && k.ageNow <= k.independ);
        if (m.key === "education" && you < 0.05 && kidsNow.length) {
          note = "お子さんがまだ小さいため、いまは0円です。これから増える費目なので、少ないこと自体は心配の材料になりません。";
        } else if (m.key === "education" && you < 0.05) {
          note = "いま教育費のかかるお子さんがいないため0円です。";
        }
        rows.push({ label: m.label, you, avg, note });
      });
      const max = Math.max(...rows.map((x) => Math.max(x.you, x.avg)), 1);

      const legend = h("p", "compare-legend");
      legend.append(h("span", "lg lg-you", "■"), h("span", null, "あなた　"), h("span", "lg lg-avg", "■"), h("span", null, "平均"));
      body.appendChild(legend);

      const ul = h("ul", "compare-list");
      rows.forEach((x) => {
        const d = x.you - x.avg;
        const near = x.avg > 0 ? Math.abs(d) / x.avg <= 0.1 : Math.abs(d) < 0.5;
        const word = near ? "平均的" : d > 0 ? "平均より多い" : "平均より少ない";
        const li = h("li");
        const head = h("div", "compare-head");
        head.append(h("span", "compare-label", x.label), h("span", "compare-word", word));
        li.appendChild(head);
        const bars = h("div", "compare-bars");
        [["you", x.you, "あなた"], ["avg", x.avg, "平均"]].forEach(([cls, v, who]) => {
          const row = h("div", "compare-bar");
          const track = h("span", "compare-track");
          const fill = h("span", "bar bar-" + cls);
          fill.style.width = Math.max(1, (v / max) * 100) + "%";
          track.appendChild(fill);
          row.append(h("span", "compare-who", who), track, h("b", "compare-num", manM(v)));
          bars.appendChild(row);
        });
        li.appendChild(bars);
        if (x.note) li.appendChild(h("p", "small muted", x.note));
        ul.appendChild(li);
      });
      body.appendChild(ul);

      if (skipped.length) {
        const det = h("details", "fold");
        det.appendChild(h("summary", null, `比べられない費目（${skipped.length}）`));
        const inner = h("div", "body");
        skipped.forEach((m) => {
          inner.appendChild(h("p", null, `【${m.label}】${m.reason}`));
        });
        det.appendChild(inner);
        body.appendChild(det);
      }

      const det2 = h("details", "fold");
      det2.appendChild(h("summary", null, "この比べ方の注意"));
      const in2 = h("div", "body");
      const cul = h("ul");
      (K.caveats || []).forEach((cv) => {
        const li = h("li", null, cv.text);
        if (cv.url) {
          const link = h("a", "small", "（出典）");
          link.href = cv.url;
          link.rel = "noopener";
          li.appendChild(link);
        }
        cul.appendChild(li);
      });
      in2.appendChild(cul);
      in2.appendChild(h("p", "small muted", "多い・少ないは、良い・悪いではありません。住んでいる地域・家族構成・働き方によって、必要な金額は変わります。"));
      det2.appendChild(in2);
      body.appendChild(det2);
    }

    sel.addEventListener("change", () => { if (axis === "age") akey = sel.value; else gkey = sel.value; render(); });
    axisSel.addEventListener("change", () => { axis = axisSel.value; fillGroups(); render(); });
    render();
    return box;
  }

  // ── 見直せるかもしれない支出 ──
  // 家計調査の平均より多い費目を、差の大きい順に挙げる。
  // **多い＝悪いとは書かない**（CLAUDE.md §4）。「理由があるなら、それでよい」と添える。
  //
  // 大事な制約：生活費の内訳を答えていない人には、費目ごとの比較ができない。
  // 内訳は家計調査の割合で機械的に分けているので、あなたの額＝合計×割合、平均＝平均合計×同じ割合になり、
  // **どの費目も同じ向きに同じだけずれる**（費目ごとの多い・少ないが出てこない）。
  // そのため、内訳が目安のままのときは、答えから直に出ている費目だけを扱う。
  function reviewItems(r, a) {
    const K = window.KSDATA && window.KSDATA.kakei;
    if (!K || !K.groups || !K.map) return { error: "家計調査のデータを読み込めませんでした。" };
    const c = r.current;
    const L = Object.fromEntries(c.living.items.map((i) => [i.key, i.monthly]));
    const SPECIAL = { car: c.car.monthly, education: c.edu.monthly, housing: c.housing.monthly, loan: c.loan.monthly };
    const mine = (key) => (L[key] != null ? L[key] : SPECIAL[key] != null ? SPECIAL[key] : 0);
    // 答えから直に出ている費目（内訳を答えていなくても比べられるもの）
    const FROM_ANSWERS = new Set(["education", "transport"]);
    const fromDetail = c.living.source === "detail";

    const ageGroups = ageGroupsFor(r, K.groupsByAge);
    const axis = Object.keys(ageGroups).length > 0 && householdSize(r) <= 1 ? "age" : "persons";
    const groups = axis === "age" ? ageGroups : K.groups;
    const gkey = axis === "age" ? pickAgeGroup(r, ageGroups) : pickGroup(r, a, K.groups);
    const g = groups[gkey];
    if (!g) return { error: "見比べる相手の区分が決まりませんでした。" };

    const over = [];
    const cannot = [];
    K.map.forEach((m) => {
      if (!m.kakei) { cannot.push(m); return; }
      if (!fromDetail && !FROM_ANSWERS.has(m.key)) return;
      const you = (m.parts || [m.key]).reduce((t, k) => t + mine(k), 0);
      const avg = (g.items[m.kakei] || 0) / 10000;   // 円 → 万円
      if (avg < 0.05) return;                        // 平均がほぼ0の費目は比べても何もわからない
      const d = you - avg;
      if (d / avg <= 0.1) return;                    // 1割以内は「平均的」。挙げない
      over.push({ key: m.key, label: m.label, you, avg, diff: d, yearly: d * 12, ratio: you / avg, note: m.note });
    });
    over.sort((x, y) => y.diff - x.diff);
    return {
      over, cannot, group: g, axis, fromDetail,
      smallSample: K.smallSampleUnder && g.n && g.n < K.smallSampleUnder ? g.n : null,
      total: over.reduce((t, x) => t + x.yearly, 0),
    };
  }

  function review(r, a) {
    const box = h("div", "review");
    const v = reviewItems(r, a);
    if (v.error) { box.appendChild(h("p", "note warn small", "⚠ " + v.error + "この章は表示していません。")); return box; }

    box.appendChild(h("p", null, `${v.group.label}の1か月あたりの平均と並べて、あなたのほうが多い費目を挙げています。`));

    if (!v.fromDetail) {
      const note = h("p", "note info");
      note.appendChild(document.createTextNode("生活費の内訳をまだ答えていないため、ここで見られるのは、答えから直に出ている費目だけです。"));
      note.appendChild(h("br"));
      note.appendChild(document.createTextNode("食費・水道光熱費・趣味などは、いま家計調査の平均と同じ割合で分けているので、費目ごとの多い・少ないが出てきません。"));
      const link = h("a", "btn-mini", "くわしく入力で、生活費の内訳を入れる →");
      link.href = "/soudan/detail/#living";
      note.appendChild(h("br"));
      note.appendChild(link);
      box.appendChild(note);
    }

    if (!v.over.length) {
      box.appendChild(h("p", "card", v.fromDetail
        ? "平均より目立って多い費目は見つかりませんでした。平均に近い、または平均より少ない費目ばかりです。"
        : "答えから直に出ている費目のうち、平均より目立って多いものは見つかりませんでした。"));
    } else {
      if (v.smallSample) {
        box.appendChild(h("p", "note warn small", `⚠ この区分は集計した世帯数が少ないため（${v.smallSample}世帯）、数字が振れやすくなっています。`));
      }
      const ul = h("ul", "review-list");
      v.over.forEach((x) => {
        const li = h("li", "card");
        const head = h("div", "review-head");
        head.append(h("b", "review-label", x.label), h("span", "review-word", "平均より多い"));
        li.appendChild(head);
        const nums = h("p", "review-nums");
        nums.append(
          h("span", null, `あなた ${manM(x.you)}`),
          h("span", "muted", ` ／ 平均 ${manM(x.avg)}`),
          h("b", "review-diff", `　差 月${manM(x.diff)}（年 ${manM(x.yearly)}）`),
        );
        li.appendChild(nums);
        if (x.note) li.appendChild(h("p", "small muted", x.note));
        ul.appendChild(li);
      });
      box.appendChild(ul);
      if (v.over.length > 1) {
        box.appendChild(h("p", "review-total", `平均より多い分を合わせると、年 ${manM(v.total)} です。`));
      }
      box.appendChild(h("p", "note info small",
        "多いことは、悪いことではありません。通勤や通院で交通費がかかる、習いごとを続けている、といった理由があるなら、"
        + "その金額が必要だということです。減らす先を探すときの手がかりとして見てください。"));
    }

    if (v.cannot.length) {
      const det = h("details", "fold");
      det.appendChild(h("summary", null, `ここに出していない費目（${v.cannot.length}）`));
      const inner = h("div", "body");
      v.cannot.forEach((m) => inner.appendChild(h("p", null, `【${m.label}】${m.reason}`)));
      det.appendChild(inner);
      box.appendChild(det);
    }
    box.appendChild(h("p", "small", "少ない費目もふくめて全部並べたものは、下の「家計調査の平均との見比べ」にあります。"));
    return box;
  }

  // ── この計算に入れていないこと ──
  // 項目の定義は view/explain.js が持つ（/about/ の一覧と同じ定義から作る）
  function notIncludedItems(r, a) {
    return KSX.notIncluded({ r, a });
  }

  function notIncluded(r, a) {
    const box = h("div");
    box.appendChild(h("p", "small", "この計算は、次のものを含んでいません。結果を見るときの目安にしてください。"));
    box.appendChild(notIncludedList(notIncludedItems(r, a)));
    const legend = h("p", "small muted");
    legend.textContent = KSX.NOT_INCLUDED_LEGEND;
    box.appendChild(legend);
    return box;
  }
  function notIncludedList(items) {
    const ul = h("ul", "ni-list");
    items.forEach((it) => {
      const li = h("li", "ni-" + it.dir);
      const m = h("span", "ni-mark", KSX.NOT_INCLUDED_MARKS[it.dir][0]);
      m.title = KSX.NOT_INCLUDED_MARKS[it.dir][1];
      li.append(m, h("span", null, it.text));
      ul.appendChild(li);
    });
    return ul;
  }

  // ── ライフプラン表（縦＝人、横＝年） ──
  // アイコンと凡例は calc.js の MARKS が正本。ここで別に持つと、片方だけ古くなる
  const iconOf = (e) => KSC.markOf(e);
  // 線画のアイコンを1つ描く。中身は自分たちで書いた定数なので innerHTML でよい
  function iconEl(mark) {
    const sp = h("span", "ic-wrap");
    sp.style.color = mark.color;
    sp.innerHTML = mark.svg;
    sp.title = mark.label;
    return sp;
  }

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
    KSC.MARKS.forEach((m) => {
      const sp = h("span", "lt-legend-item");
      sp.appendChild(iconEl(m));
      sp.appendChild(h("span", null, m.label));
      legend.appendChild(sp);
    });
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
          const icons = h("span", "lt-icons");
          evs.forEach((e) => icons.appendChild(iconEl(iconOf(e))));
          td.appendChild(icons);
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
      const td = h("td", (p.raw < 0 ? "lt-neg" : "") + (p.year % 5 === 0 ? " lt-five" : ""));
      td.dataset.col = i;
      td.appendChild(h("span", "lt-bal", KSX.balanceCell(p)));
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
        evs.forEach((e) => {
          const li = h("li");
          li.appendChild(iconEl(iconOf(e)));
          li.appendChild(h("span", null, e.text));
          ul.appendChild(li);
        });
        panel.appendChild(ul);
      } else {
        panel.appendChild(h("p", "lt-panel-none", "大きな出来事はありません"));
      }
      const money = h("div", "lt-panel-money");
      [["収入（手取り）", p.income, KS.man(p.income)], ["支出", p.expense, KS.man(p.expense)], ["貯蓄残高", p.raw, KSX.balanceText(p)]].forEach(([l, v, t]) => {
        const d = h("div");
        d.appendChild(h("span", null, l));
        d.appendChild(h("b", v < 0 ? "neg" : null, t));
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

  window.KSR = { forecast, costs, costTable, lifeTable, advice, compare, review, reviewItems, notIncluded, notIncludedItems, notIncludedList, WEATHER };
})();
