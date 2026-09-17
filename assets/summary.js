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
  function advice(r, onFix) {
    const rain = r.forecast.filter((f) => f.weather === "rain").length;
    const cloud = r.forecast.filter((f) => f.weather === "cloud").length;
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
      c.appendChild(h("div", "advice-head", cloud ? "いまのところ、大きな心配は見当たりません" : "いまの前提では、大きな心配は見当たりません"));
      c.appendChild(h("p", "advice-lead", cloud ? "くもりの項目を埋めると、判定がはっきりします。あわせて前提も確かめておくと、見通しがはっきりします。" : "そのぶん、前提を厳しくしたらどうなるかを見ておくのも手です。"));
      const ul = h("ul", "advice-list");
      [["年金の見込み額を入れる（ねんきん定期便）", "work"], ["物価の上昇を年2%にして見る", "assumptions"], ["親の介護を見込んでみる", "family"], ["加入中の保険の保障額を入れる", "insurance"]]
        .forEach(([label, key]) => {
          const li = h("li");
          const b = h("button", "linkbtn", label);
          b.type = "button";
          b.addEventListener("click", () => onFix(key));
          li.appendChild(b);
          ul.appendChild(li);
        });
      c.appendChild(ul);
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
    const box = h("div", "costs2");
    if (r.loanMismatch) {
      const w = h("div", "note warn small cost-warn");
      w.textContent = "⚠ 住宅ローンの入力に食い違いがあります。" + r.loanMismatch;
      box.appendChild(w);
    }
    const rows = [
      { fix: "living", label: "生活費", data: c.living, breakdown: true,
        note: c.living.source === "answer" ? `回答「${KSQ.display(KSQ.byId.living, answers)}」の真ん中で計算。食費・光熱費・通信費・保険料・おこづかいなどの合計です。` : c.living.source === "detail" ? "くわしく入力した内訳の合計です。" : "「わからない」のため、世帯の人数から仮に置いています。" },
      { fix: "home", label: "住居費", data: c.housing, note: c.housing.note },
      { fix: "edu", label: "教育費", data: c.edu, note: c.edu.note },
      { fix: "car", label: "車", data: c.car, note: c.car.note },
      { fix: "loans", label: "借入れ", data: c.loan, note: c.loan.note },
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
    const diff = c.incomeMonthly - c.total;
    if (diff < 0) {
      const warn = h("div", "note warn small cost-warn");
      warn.textContent = `入力した支出の合計（月${manM(c.total)}）が、手取り（月${manM(c.incomeMonthly)}）を上回っています。実際と違う項目がないか確認してください（生活費・住居費・借入れなど）。`;
      box.appendChild(warn);
    }
    const total = h("div", "cost-total");
    total.appendChild(h("span", "cost-label", "合計（毎月）"));
    total.appendChild(h("span", "cost-value", manM(c.total)));
    box.appendChild(total);
    box.appendChild(h("div", "cost-income", `手取り 月${manM(c.incomeMonthly)} → 毎月 ${diff >= 0 ? manM(diff) + " 余る" : manM(-diff) + " 不足"}`));
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
      { key: "housing", label: "住居費", get: (p) => p.exp.housing },
      { key: "edu", label: "教育費", get: (p) => p.exp.edu },
      { key: "car", label: "車", get: (p) => p.exp.car },
      { key: "loan", label: "借入れ", get: (p) => p.exp.loan },
      { key: "other", label: "その他", get: (p) => p.exp.other },
      { key: "total", label: "支出の合計", get: (p) => p.expense, cls: "ct-total" },
      { key: "flow", label: "収支", get: (p) => p.income - p.expense, cls: "ct-flow" },
      { key: "balance", label: "貯蓄残高", get: (p) => p.balance, cls: "ct-balance", always: "year" },
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
        if (row.key === "other" && pts.every((p) => !p.exp.other)) return;
        const tr = h("tr", row.cls || "");
        const th = h("th", "lt-name", row.label + (row.always === "year" ? "（年末）" : ""));
        th.scope = "row";
        tr.appendChild(th);
        pts.forEach((p) => {
          const v = row.get(p);
          const td = h("td", (p.year % 5 === 0 ? "lt-five " : "") + (row.key === "flow" && v < 0 ? "lt-neg" : "") + (row.key === "balance" && p.balance < 0 ? "lt-neg" : ""));
          td.textContent = fmt(v, row);
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

  // ── この計算に入れていないこと ──
  // dir: better＝実際はもっと良くなる可能性／worse＝もっと厳しくなる可能性／both＝どちらにも動く
  function notIncludedItems(r, a) {
    const D = r.detail;
    const hasLoan = a.home === "loan";
    const willBuy = D.purchase && D.purchase.on === "yes";
    const list = [];
    if (hasLoan || willBuy) list.push({ dir: "better", text: "住宅ローン控除（減税）。税金が戻る分は収入に入れていません" });
    if (hasLoan || willBuy) list.push({ dir: "worse", text: "変動金利の上昇。返済額は、いま入力した額のままで計算しています" });
    if (hasLoan && D.loan.prepayOn === "yes") list.push({ dir: "better", text: "繰り上げ返済で利息が減る分。期間が短くなる効果だけを見ています" });
    list.push({ dir: "both", text: "税金・社会保険料の細かい計算。手取りは、年収に応じたおおよその割合で出しています" });
    // 「年齢に応じて」を選んでいても、統計の対象外の働き方（自営業など）では横ばいになる。
    // 実際に使われたかどうかで言い分けないと、画面の中で食い違う
    const mode = (D.work && D.work.growth) || "flat";
    if (r.wageApplied) {
      list.push({ dir: "both", text: "あなた個人の昇給や役職の変化。収入は、統計の年齢別の賃金の形にならって増減させているだけです" });
    } else if (mode === "stat") {
      list.push({ dir: "both", text: "年齢による収入の変化。この働き方は賃金の統計の対象外のため、いまの収入がそのまま続く前提で計算しています" });
    } else if (mode === "up" || mode === "down") {
      list.push({ dir: "both", text: `あなた個人の事情。収入は毎年1%ずつ${mode === "up" ? "増える" : "減る"}前提にそろえているだけです` });
    } else {
      list.push({ dir: "both", text: "年齢による収入の変化。いまの収入がそのまま続く前提で計算しています（くわしく入力で変えられます）" });
    }
    list.push({ dir: "worse", text: "物価の上昇は生活費だけに掛けています。教育費・修繕費・車の価格は、いまの水準のままです" });
    list.push({ dir: "both", text: "投資の値動き。利回りは毎年一定として計算し、元本割れは見ていません" });
    list.push({ dir: "worse", text: "突然の医療費・介護費・失業や休職による収入の減少（くわしく入力で設定した分を除く）" });
    list.push({ dir: "both", text: "年金・児童手当などの制度が将来変わること。いまの制度が続く前提です" });
    const babies = (r.kidInfo || []).filter((k) => k.ageNow >= 0 && k.ageNow <= 2).length;
    if (babies || a.kids === "plan") {
      list.push({ dir: "worse", text: "0〜2歳の保育料。自治体と世帯の所得で決まるため、入れていません（住民税非課税の世帯は無償とされています）" });
    }
    if (a.kids === "yes" || a.kids === "plan") list.push({ dir: "worse", text: "保育園・幼稚園の給食費・行事費・通園送迎費。無償化の対象外とされていますが、計算には入れていません" });
    if (a.kids === "yes" || a.kids === "plan") list.push({ dir: "better", text: "高校の就学支援金の拡充分。教育費のもとにした調査が、当時の支援を反映した金額のため、重ねて差し引いていません" });
    if (a.spouse === "partner") {
      list.push({ dir: "worse", text: "事実婚では、税の配偶者控除と相続の扱いが、届出をしている場合と違うとされています。この違いは金額に反映していません" });
    }
    list.push({ dir: "better", text: "相続・贈与・親からの援助" });
    list.push({ dir: "worse", text: "退職金や年金にかかる税金" });
    if (D.loans && D.loans.some((l) => l.kind === "shougakukin")) list.push({ dir: "both", text: "奨学金は、万一のときに返還が免除される前提で計算しています（条件は貸与元でご確認ください）" });
    if (a.work === "self" && a.selfVary === "vary") list.push({ dir: "both", text: "自営業の収入の波。金額には反映せず、急な出費の目安を1年分にすることだけで見ています" });
    return list;
  }

  function notIncluded(r, a) {
    const box = h("div");
    box.appendChild(h("p", "small", "この計算は、次のものを含んでいません。結果を見るときの目安にしてください。"));
    const ul = h("ul", "ni-list");
    const MARK = { better: ["＋", "実際はもっと良くなる可能性"], worse: ["−", "実際はもっと厳しくなる可能性"], both: ["±", "どちらにも動く"] };
    notIncludedItems(r, a).forEach((it) => {
      const li = h("li", "ni-" + it.dir);
      const m = h("span", "ni-mark", MARK[it.dir][0]);
      m.title = MARK[it.dir][1];
      li.append(m, h("span", null, it.text));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    const legend = h("p", "small muted");
    legend.textContent = "＋＝入れると結果が良くなる方向／−＝厳しくなる方向／±＝どちらにも動く";
    box.appendChild(legend);
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
      const bal = Math.round(p.balance);
      td.appendChild(h("span", "lt-bal", bal < 0 ? "−" + Math.abs(bal).toLocaleString("ja-JP") : bal.toLocaleString("ja-JP")));
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

  window.KSR = { forecast, costs, costTable, lifeTable, advice, compare, notIncluded, notIncludedItems, WEATHER };
})();
