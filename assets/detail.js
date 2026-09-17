/* くわしく入力の部品。「くわしく入力」の画面と、1問ずつの画面の「詳しい条件」から使う。
 * 同じ質問定義・同じ保存先を使うので、どちらで入れても結果は同じになる（CLAUDE.md §7・§8）。
 */
(function () {
  "use strict";

  // 中身を組み立てて返す。くわしく入力の画面と、1問ずつの画面の「詳しい条件」の
  // 両方から使う。同じ定義・同じ保存先なので、どちらで入れても結果は同じ
  function build(d, options) {
    const cfg = options || {};
    const A = d.answers;
    let D = KSC.detailOf(d);
    const openState = cfg.openState || new Set();
    let jumpTo = cfg.jumpTo || null;
    if (jumpTo) openState.add(jumpTo);
    const afterChange = cfg.onChange || function () {};
    const only = cfg.only || null;   // 指定したセクションだけを出す

  // ── 小さな部品 ──
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let uid = 0;
  const range = (from, to, step, fmt) => { const o = []; for (let v = from; v <= to + 1e-9; v += step) { const r = Math.round(v * 10) / 10; o.push({ v: r, label: fmt(r) }); } return o; };
  const man = (v) => KS.man(v);
  const age = () => Number(A.age);
  const owns = () => A.home === "loan" || A.home === "own";
  const opts = (qid) => KSQ.byId[qid].options.map((o) => ({ v: o.v, label: o.label }));
  const yesNo = [{ v: "no", label: "なし" }, { v: "yes", label: "あり" }];

  // obj[key] を編集する選択欄。section は「設定済み」にする分類。answers: かんたんの回答を編集する欄
  function select(label, obj, key, options, section, opt = {}) {
    const row = h("div", "field-row");
    const id = "f" + ++uid;
    const l = h("label", null, label); l.htmlFor = id;
    const s = h("select", "select"); s.id = id;
    let matched = false;
    options.forEach((o) => { const op = h("option", null, o.label); op.value = o.v; if (String(obj[key]) === String(o.v)) { op.selected = true; matched = true; } s.appendChild(op); });
    // 保存値が選択肢に無いとき、先頭が選ばれたように見えて計算とずれる。いまの値を先頭に足して見えるようにする
    if (!matched && obj[key] !== null && obj[key] !== undefined && obj[key] !== "") {
      // 単位が落ちないよう、ほかの選択肢の書き方に合わせる（「3万円」→「6.5万円」）
      const sample = options.find((o) => o.label && String(o.label).includes(String(o.v)));
      const label = sample ? String(sample.label).replace(String(sample.v), String(obj[key])) : `${obj[key]}`;
      const cur = h("option", null, label);
      cur.value = obj[key];
      cur.selected = true;
      s.insertBefore(cur, s.firstChild);
    }
    s.addEventListener("change", () => {
      obj[key] = opt.text ? s.value : Number(s.value);
      if (opt.after) opt.after(s.value);
      changed(section, opt.rerender, opt.answers);
    });
    row.append(l, s);
    if (opt.note) row.appendChild(h("p", "muted small", opt.note));
    return row;
  }
  // 複数選べる項目（入っている保険など）
  function checks(label, obj, key, options, section, opt = {}) {
    const fs = h("fieldset", "field-row");
    fs.appendChild(h("legend", "detail-legend", label));
    const wrap = h("div", "radio-row");
    const cur = () => (Array.isArray(obj[key]) ? obj[key] : []);
    options.forEach((o) => {
      const lab = h("label");
      const i = h("input"); i.type = "checkbox"; i.value = o.v; i.checked = cur().includes(o.v);
      i.addEventListener("change", () => {
        const set = new Set(cur());
        if (i.checked) set.add(o.v); else set.delete(o.v);
        // 「入っていない」「わからない」は、ほかと同時には選べない
        if (i.checked && (o.v === "none" || o.v === "unknown")) { set.clear(); set.add(o.v); }
        else if (i.checked) { set.delete("none"); set.delete("unknown"); }
        obj[key] = [...set];
        changed(section, opt.rerender !== false, opt.answers);
      });
      lab.append(i, document.createTextNode(o.label));
      wrap.appendChild(lab);
    });
    fs.appendChild(wrap);
    if (opt.note) fs.appendChild(h("p", "muted small", opt.note));
    return fs;
  }

  // 収入の見込みを、線の形を見ながら選ぶ。実際の計算と同じ倍率から線を引くので、絵と計算がずれない
  function curveSVG(mode, workKind, fromAge, toAge) {
    const W = 108, H = 44, pad = 4;
    const pts = [];
    for (let age = fromAge; age <= toAge; age++) {
      let f = 1;
      if (mode === "stat") {
        const w = window.KSDATA && window.KSDATA.wage;
        const key = w && w.map ? w.map[workKind] : null;
        const series = key && w.series ? w.series[key] : null;
        if (series) {
          const at = (x) => {
            const q = series.points;
            const cap = Math.min(q[q.length - 1].age, Number(w.capAge) || 57);
            const v = Math.min(Math.max(x, q[0].age), cap);
            for (let i = 0; i < q.length - 1; i++) {
              if (v >= q[i].age && v <= q[i + 1].age) {
                const t = (v - q[i].age) / (q[i + 1].age - q[i].age);
                return q[i].value + (q[i + 1].value - q[i].value) * t;
              }
            }
            return q[q.length - 1].value;
          };
          f = at(age) / at(fromAge);
        }
      } else if (mode === "up") f = Math.pow(1.01, age - fromAge);
      else if (mode === "down") f = Math.pow(0.99, age - fromAge);
      pts.push(f);
    }
    const lo = Math.min(...pts, 1), hi = Math.max(...pts, 1);
    const span = Math.max(0.0001, hi - lo);
    const d = pts.map((f, i) => {
      const x = pad + (i / Math.max(1, pts.length - 1)) * (W - pad * 2);
      const y = H - pad - ((f - lo) / span) * (H - pad * 2);
      return (i ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    const pct = Math.round((pts[pts.length - 1] - 1) * 100);
    return { svg: `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">` +
      `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`, pct: pct };
  }

  function curvePicker(label, obj, key, workKind, section, opt = {}) {
    const fs = h("fieldset", "field-row");
    fs.appendChild(h("legend", "detail-legend", label));
    const wrap = h("div", "curve-row");
    const name = "c" + ++uid;
    const from = opt.fromAge || age();
    const to = Math.min(65, Math.max(from + 1, Number(opt.toAge || 60)));
    [["stat", "年齢に応じて"], ["flat", "いまのまま"], ["up", "上がる"], ["down", "下がる"]].forEach(([v, text]) => {
      const c = curveSVG(v, workKind, from, to);
      const lab = h("label", "curve-opt");
      const i = h("input"); i.type = "radio"; i.name = name; i.value = v; i.checked = String(obj[key]) === v;
      i.addEventListener("change", () => { obj[key] = v; changed(section, true, opt.answers); });
      const box = h("span", "curve-box");
      box.innerHTML = c.svg;
      const cap = h("span", "curve-cap", text);
      const num = h("span", "curve-num", c.pct === 0 ? `${from}歳→${to}歳 変わらない` : `${from}歳→${to}歳 ${c.pct > 0 ? "＋" : "−"}${Math.abs(c.pct)}%`);
      lab.append(i, box, cap, num);
      wrap.appendChild(lab);
    });
    fs.appendChild(wrap);
    if (opt.note) fs.appendChild(h("p", "muted small", opt.note));
    return fs;
  }

  function radios(label, obj, key, options, section, opt = {}) {
    const fs = h("fieldset", "field-row");
    fs.appendChild(h("legend", "detail-legend", label));
    const wrap = h("div", "radio-row");
    const name = "r" + ++uid;
    options.forEach((o) => {
      const lab = h("label");
      const i = h("input"); i.type = "radio"; i.name = name; i.value = o.v; i.checked = String(obj[key]) === String(o.v);
      i.addEventListener("change", () => {
        obj[key] = o.v;
        if (opt.after) opt.after(o.v);
        changed(section, opt.rerender !== false, opt.answers);
      });
      lab.append(i, document.createTextNode(o.label));
      wrap.appendChild(lab);
    });
    fs.appendChild(wrap);
    if (opt.note) fs.appendChild(h("p", "muted small", opt.note));
    return fs;
  }
  const note = (text) => h("p", "note info small", text);
  const sub = (text) => h("h3", "detail-sub", text);

  // かんたんの回答を変えたときに、ほかの回答と矛盾しないように整える
  function normalizeAnswers() {
    if (KSQ.hasSpouse(A)) {
      if (!A.spouseAge) A.spouseAge = age();
      if (!A.spouseWork) A.spouseWork = "part";
      if (!A.spouseIncome) A.spouseIncome = "fuyo";
    }
    if (A.kids === "yes") {
      A.kidsCount = Number(A.kidsCount) || 1;
      const arr = Array.isArray(A.kidsAges) ? A.kidsAges.slice(0, A.kidsCount) : [];
      while (arr.length < A.kidsCount) arr.push(0);
      A.kidsAges = arr.map((x) => Number(x) || 0);
      if (!A.eduPlan) A.eduPlan = "unknown";
    }
    if (owns() && !A.homeType) A.homeType = "house";
    KSQ.visible(A).forEach((q) => { if (!d.meta.done.includes(q.id)) d.meta.done.push(q.id); });
  }

  function changed(section, rerender, answersChanged) {
    if (answersChanged) {
      normalizeAnswers();
      D = KSC.detailOf(Object.assign({}, d, { detail: D }));
    } else {
      D.set[section] = true;
    }
    d.detail = D;
    KS.save(d);
    afterChange(d);
    if (section === "living") {
      const sum = KSC.LIVING_ITEMS.reduce((t, it) => t + Number(D.living[it.key] || 0), 0);
      const el = document.getElementById("living-sum");
      if (el) el.textContent = `内訳の合計 月${(Math.round(sum * 10) / 10).toLocaleString("ja-JP")}万円`;
    }
    if (rerender || answersChanged) renderSections(mounted);
    else document.querySelectorAll(`[data-status="${section}"]`).forEach((b) => { b.textContent = "設定済み"; b.className = "badge set"; });
  }

  let mounted = null;

  function resetSection(section) {
    const def = KSC.detailDefaults(A, (D.family.planned || []).length);
    const keys = {
      family: ["family", "care"], work: ["work"], spouseWork: ["spouseWork"], living: ["living", "retire"],
      home: ["loan", "rent", "house", "mansion", "purchase", "rebuild", "move"], edu: ["kids"], car: ["cars"], loans: ["loans"],
      assets: ["assets"], insurance: ["insurance"], spend: ["spend"],
    }[section] || [];
    keys.forEach((k) => { D[k] = def[k]; });
    if (section === "assumptions") d.assumptions = KS.empty().assumptions;
    delete D.set[section];
    D = KSC.detailOf(Object.assign({}, d, { detail: D }));
    d.detail = D;
    KS.save(d);
    afterChange(d);
    renderSections(mounted);
  }

  // ── 分類（くわしく入力＝全項目の正本）──
  const SECTIONS = [
    {
      key: "family", title: "👪 家族",
      body: (box) => {
        box.appendChild(select("あなたの年齢", A, "age", range(18, 80, 1, (v) => `${v}歳`), "family", { answers: true }));
        box.appendChild(radios("配偶者・パートナー", A, "spouse", opts("spouse"), "family", { answers: true }));
        if (KSQ.hasSpouse(A)) box.appendChild(select("配偶者の年齢", A, "spouseAge", range(18, 80, 1, (v) => `${v}歳`), "family", { answers: true }));
        box.appendChild(radios("お子さん", A, "kids", [{ v: "yes", label: "いる" }, { v: "no", label: "いない" }, { v: "plan", label: "これから" }], "family", { answers: true }));
        if (A.kids === "yes") {
          box.appendChild(select("人数", A, "kidsCount", range(1, 5, 1, (v) => `${v}人`), "family", { answers: true }));
          (A.kidsAges || []).forEach((_, i) => box.appendChild(select(`${i + 1}人目の年齢`, A.kidsAges, i, range(0, 25, 1, (v) => `${v}歳`), "family", { answers: true })));
        }
        box.appendChild(sub("これから予定しているお子さん"));
        const cnt = { n: D.family.planned.length };
        box.appendChild(select("人数", cnt, "n", [{ v: 0, label: "予定なし" }, { v: 1, label: "1人" }, { v: 2, label: "2人" }], "family", {
          rerender: true,
          after: (v) => {
            const n = Number(v);
            const list = D.family.planned.slice(0, n);
            while (list.length < n) list.push({ inYears: list.length ? list[list.length - 1].inYears + 2 : 1 });
            D.family.planned = list;
            D = KSC.detailOf(Object.assign({}, d, { detail: D }));
          },
        }));
        D.family.planned.forEach((p, i) => box.appendChild(select(`${i + 1}人目：生まれる時期`, p, "inYears", range(1, 10, 1, (v) => `${v}年後`), "family")));
        box.appendChild(sub("親の介護"));
        box.appendChild(radios("介護の費用を見込むか", D.care, "on", [{ v: "no", label: "見込まない" }, { v: "yes", label: "見込む" }], "family"));
        if (D.care.on === "yes") {
          box.appendChild(select("始まる時期（あなたの年齢）", D.care, "startAge", range(age(), 85, 1, (v) => `${v}歳`), "family"));
          box.appendChild(select("期間", D.care, "years", [3, 5, 7, 10, 15].map((v) => ({ v, label: `${v}年` })), "family"));
          box.appendChild(select("あなたの負担（月あたり）", D.care, "monthly", [1, 2, 3, 5, 8, 10, 15].map((v) => ({ v, label: `月${man(v)}` })), "family"));
        }
      },
    },
    {
      key: "work", title: "💼 あなたの収入",
      body: (box) => {
        box.appendChild(select("働き方", A, "work", opts("work"), "work", { text: true, answers: true }));
        box.appendChild(select("年収（額面・税込）", A, "income", opts("income"), "work", { text: true, answers: true }));
        box.appendChild(curvePicker("今後の年収の見込み", D.work, "growth", A.work, "work", { toAge: Math.min(60, Number(D.work.retireAge)), note: "線は、実際に計算に使う倍率から引いています。「年齢に応じて」は厚生労働省の統計の年齢別の賃金の形（57歳で頭打ち。60歳以降は下の定年・再雇用の設定で計算）。上がる／下がる は年1%です" }));
        box.appendChild(sub("定年・再雇用・退職金"));
        box.appendChild(select("仕事をやめる（定年の）年齢", D.work, "retireAge", [55, 60, 63, 65, 70, 75].map((v) => ({ v, label: `${v}歳` })), "work", { rerender: true }));
        box.appendChild(select("定年後の働き方（再雇用など）", D.work, "rehire", [{ v: 0, label: "働かない" }, { v: 50, label: "定年前の年収の5割" }, { v: 70, label: "定年前の年収の7割" }, { v: 100, label: "定年前と同じ" }], "work", { rerender: true }));
        if (Number(D.work.rehire) > 0) box.appendChild(select("何歳まで働くか", D.work, "rehireUntil", range(Math.max(60, Number(D.work.retireAge) + 1), 80, 1, (v) => `${v}歳まで`), "work"));
        if (A.work === "self") box.appendChild(h("p", "muted small", "自営業・フリーランスには会社の退職金がないため、小規模企業共済などを使っている場合はその見込み額を入れてください。"));
        box.appendChild(select("退職金の見込み", D.work, "allowance", [0, 300, 500, 800, 1000, 1500, 2000, 3000].map((v) => ({ v, label: v ? man(v) : "なし・わからない" })), "work"));
        box.appendChild(sub("転職・独立"));
        box.appendChild(radios("予定", D.work, "change", yesNo, "work"));
        if (D.work.change === "yes") {
          box.appendChild(select("時期（あなたの年齢）", D.work, "changeAge", range(age(), 70, 1, (v) => `${v}歳`), "work"));
          box.appendChild(select("変わったあとの年収（額面）", D.work, "changeIncome", opts("income").filter((o) => o.v !== "unknown"), "work", { text: true }));
        }
        box.appendChild(sub("年金・その他の収入"));
        box.appendChild(select("年金の見込み額（年額）", D.work, "pension", [{ v: 0, label: "わからない（概算で計算）" }].concat(range(50, 300, 10, (v) => `年${man(v)}`)), "work", { note: "毎年誕生月に届く「ねんきん定期便」に記載されています" }));
        box.appendChild(select("副業などの収入（年・手取り）", D.work, "side", [0, 10, 30, 50, 100, 200, 300].map((v) => ({ v, label: v ? `年${man(v)}` : "なし" })), "work", { rerender: true }));
        if (Number(D.work.side) > 0) box.appendChild(select("何歳まで", D.work, "sideUntil", range(Math.max(age() + 1, 50), 80, 1, (v) => `${v}歳まで`), "work"));
      },
    },
    {
      key: "spouseWork", title: "💼 配偶者の収入", show: () => KSQ.hasSpouse(A),
      body: (box) => {
        box.appendChild(select("働き方", A, "spouseWork", opts("spouseWork"), "spouseWork", { text: true, answers: true }));
        box.appendChild(select("年収（額面・税込）", A, "spouseIncome", opts("spouseIncome"), "spouseWork", { text: true, answers: true }));
        box.appendChild(curvePicker("今後の年収の見込み", D.spouseWork, "growth", A.spouseWork, "spouseWork", { fromAge: Number(A.spouseAge), toAge: Math.min(60, Number(D.spouseWork.retireAge)), note: "線は、実際に計算に使う倍率から引いています" }));
        box.appendChild(select("今後の働き方", D.spouseWork, "plan", [
          { v: "same", label: "今と同じ" }, { v: "leave", label: "一時的に収入が減る（育休・時短など）" },
          { v: "quit", label: "仕事をやめる" }, { v: "return", label: "働き始める・復職する" }], "spouseWork", { text: true, rerender: true }));
        if (D.spouseWork.plan !== "same") box.appendChild(select("時期", D.spouseWork, "planFrom", range(0, 15, 1, (v) => (v === 0 ? "今年から" : `${v}年後から`)), "spouseWork"));
        if (D.spouseWork.plan === "leave") {
          box.appendChild(select("期間", D.spouseWork, "planYears", [1, 2, 3, 5, 7, 10].map((v) => ({ v, label: `${v}年間` })), "spouseWork"));
          box.appendChild(select("その間の年収", D.spouseWork, "planRate", [0, 30, 50, 70, 80].map((v) => ({ v, label: `今の${v}%` })), "spouseWork"));
        }
        if (D.spouseWork.plan === "return") box.appendChild(select("働き始めたあとの年収（額面）", D.spouseWork, "returnIncome", opts("spouseIncome").filter((o) => o.v !== "unknown"), "spouseWork", { text: true }));
        box.appendChild(select("仕事をやめる年齢（配偶者の年齢）", D.spouseWork, "retireAge", [55, 60, 63, 65, 70, 75].map((v) => ({ v, label: `${v}歳` })), "spouseWork"));
        box.appendChild(select("年金の見込み額（年額）", D.spouseWork, "pension", [{ v: 0, label: "わからない（概算で計算）" }].concat(range(50, 300, 10, (v) => `年${man(v)}`)), "spouseWork"));
      },
    },
    {
      key: "living", title: "🧾 毎月の生活費",
      body: (box) => {
        box.appendChild(select("生活費（おおまかに）", A, "living", opts("living"), "living", {
          text: true, answers: true,
          after: () => { delete D.set.living; D.living = KSC.splitLiving(KSQ.mid("living", A) ?? 25); },
        }));
        box.appendChild(sub("内訳"));
        box.appendChild(note("家計簿やカードの明細を見ながら合わせてください。内訳を変えると、その合計で計算します。住居費・教育費・車は別の分類で設定します。"));
        const amounts = range(0, 30, 0.5, (v) => `月${v.toLocaleString("ja-JP")}万円`);
        KSC.LIVING_ITEMS.forEach((it) => box.appendChild(select(it.label, D.living, it.key, amounts, "living")));
        const sum = KSC.LIVING_ITEMS.reduce((t, it) => t + Number(D.living[it.key] || 0), 0);
        const total = h("p", "living-sum", `内訳の合計 月${(Math.round(sum * 10) / 10).toLocaleString("ja-JP")}万円`);
        total.id = "living-sum";
        box.appendChild(total);
        box.appendChild(sub("老後の生活費"));
        box.appendChild(select("65歳からの生活費", D.retire, "ratio", [60, 70, 80, 85, 90, 100].map((v) => ({ v, label: `現役のころの${v}%` })), "living"));
      },
    },
    {
      key: "home", title: "🏠 住まい",
      body: (box) => {
        box.appendChild(select("お住まい", A, "home", opts("home"), "home", { text: true, answers: true }));
        if (owns()) box.appendChild(radios("戸建て／マンション", A, "homeType", opts("homeType"), "home", { answers: true }));
        if (A.home === "loan") {
          box.appendChild(sub("住宅ローン"));
          box.appendChild(radios("入力のしかた", D.loan, "input", [
            { v: "origin", label: "借りたときの内容から計算する" },
            { v: "current", label: "いまの返済額と残高を入れる" },
          ], "home", { rerender: true, note: "残高は覚えていないことが多いので、借りたときの内容（借入額・期間・いつから）からでも計算できます" }));
          if (D.loan.input !== "current") {
            box.appendChild(select("借りた金額", D.loan, "borrowed", range(300, 8000, 100, (v) => man(v)), "home", { rerender: true }));
            box.appendChild(select("借りた期間", D.loan, "years", [10, 15, 20, 25, 30, 35, 40].map((v) => ({ v, label: `${v}年` })), "home", { rerender: true }));
            box.appendChild(select("何年前から返済していますか", D.loan, "startedAgo", range(0, Math.min(40, Number(D.loan.years)), 1, (v) => (v === 0 ? "今年から" : `${v}年前から`)), "home", { rerender: true }));
            box.appendChild(select("金利（年）", D.loan, "rate", [0.3, 0.5, 0.7, 1, 1.3, 1.5, 2, 2.5, 3].map((v) => ({ v, label: `${v}%` })), "home", { rerender: true, note: "だいたいで大丈夫です。わからなければ、返済予定表か契約書でご確認ください" }));
            const v = KSC.loanFromOrigin(D.loan, age());
            const out = h("p", "note info small");
            out.textContent = `この内容だと、毎月の返済は約${v.monthly.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}万円、`
              + `いまの残高は約${man(v.balance)}、完済は${v.endAge}歳になります。`
              + (v.paid === 0 ? "" : `（すでに${v.paid}年ぶん返しています）`);
            box.appendChild(out);
          } else {
            box.appendChild(select("毎月の返済額", D.loan, "monthly", range(3, 25, 1, (v) => `月${man(v)}`), "home"));
            box.appendChild(select("完済する年齢", D.loan, "endAge", range(Math.max(age() + 1, 40), 85, 1, (v) => `${v}歳`), "home"));
            box.appendChild(select("いまの残高", D.loan, "balance", range(100, 6000, 100, (v) => man(v)), "home"));
          }
          box.appendChild(select("ボーナス返済（年2回の合計）", D.loan, "bonus", [0, 10, 20, 30, 40, 60, 80, 100].map((v) => ({ v, label: v ? `年${man(v)}` : "なし" })), "home"));
          box.appendChild(radios("団体信用生命保険（団信）", D.loan, "dansin", [{ v: "yes", label: "入っている" }, { v: "no", label: "入っていない" }, { v: "unknown", label: "わからない" }], "home", { rerender: false, note: "団信に入っていれば、万一のときにローンの残りがなくなります" }));
          // 残高・返済額・完済年齢の食い違いを知らせる
          const mism = KSC.compute(d).loanMismatch;
          if (mism) box.appendChild(h("p", "note warn small", "⚠ " + mism));
          box.appendChild(sub("繰り上げ返済"));
          box.appendChild(radios("予定", D.loan, "prepayOn", yesNo, "home"));
          if (D.loan.prepayOn === "yes") {
            box.appendChild(select("時期（あなたの年齢）", D.loan, "prepayAge", range(age(), Math.max(age() + 1, Number(D.loan.endAge)), 1, (v) => `${v}歳`), "home"));
            box.appendChild(select("繰り上げ返済する金額", D.loan, "prepayAmount", [50, 100, 200, 300, 500, 1000].map((v) => ({ v, label: man(v) })), "home", { note: "期間を短くする形で計算します（利息が減る分は含めていません＝控えめな見積り）" }));
          }
        }
        if (A.home === "rent" || A.home === "plan") {
          box.appendChild(sub("家賃"));
          box.appendChild(select("毎月の家賃（管理費を含む）", D.rent, "monthly", range(3, 25, 1, (v) => `月${man(v)}`), "home"));
          box.appendChild(select("更新料（2年ごと）", D.rent, "renewal", [0, 0.5, 1, 2].map((v) => ({ v, label: v ? `家賃の${v}か月分` : "なし" })), "home"));
        }
        const houseRepair = () => {
          box.appendChild(select("外壁・屋根の塗装：間隔", D.house, "paintEvery", [10, 12, 15, 20].map((v) => ({ v, label: `${v}年ごと` })), "home"));
          box.appendChild(select("外壁・屋根の塗装：1回の費用", D.house, "paintCost", [60, 80, 100, 120, 150, 200].map((v) => ({ v, label: man(v) })), "home"));
          box.appendChild(select("水回り・給湯器の交換：間隔", D.house, "waterEvery", [10, 15, 20].map((v) => ({ v, label: `${v}年ごと` })), "home"));
          box.appendChild(select("水回り・給湯器の交換：1回の費用", D.house, "waterCost", [30, 50, 60, 80, 100, 150].map((v) => ({ v, label: man(v) })), "home"));
        };
        const mansionFee = () => {
          box.appendChild(select("修繕積立金＋管理費", D.mansion, "monthly", range(1, 8, 0.5, (v) => `月${v}万円`), "home"));
          box.appendChild(select("10年ごとの値上がり", D.mansion, "raise", [0, 10, 20, 30, 50].map((v) => ({ v, label: v ? `${v}%ずつ上がる` : "上がらない" })), "home"));
        };
        const taxNote = { note: "毎年春ごろに届く納税通知書で確認できます" };
        if (owns() && A.homeType === "house") {
          box.appendChild(sub("戸建ての修繕・税金"));
          box.appendChild(select("築年数", D.house, "built", range(0, 60, 1, (v) => `築${v}年`), "home"));
          box.appendChild(select("固定資産税（年額）", D.house, "tax", [0, 5, 8, 10, 12, 15, 20, 25, 30].map((v) => ({ v, label: `年${man(v)}` })), "home", taxNote));
          houseRepair();
        }
        if (owns() && A.homeType === "mansion") {
          box.appendChild(sub("マンションの修繕積立金・税金"));
          mansionFee();
          box.appendChild(select("固定資産税（年額）", D.mansion, "tax", [0, 5, 8, 10, 12, 15, 20, 25].map((v) => ({ v, label: `年${man(v)}` })), "home", taxNote));
        }
        if (owns()) {
          box.appendChild(sub("建て替え・大規模リフォーム"));
          box.appendChild(radios("予定", D.rebuild, "on", yesNo, "home"));
          if (D.rebuild.on === "yes") {
            box.appendChild(select("時期（あなたの年齢）", D.rebuild, "age", range(age(), 85, 1, (v) => `${v}歳`), "home"));
            box.appendChild(select("予算", D.rebuild, "budget", [300, 500, 800, 1000, 1500, 2000, 3000].map((v) => ({ v, label: man(v) })), "home"));
          }
        } else {
          box.appendChild(sub("住宅の購入"));
          box.appendChild(radios("予定", D.purchase, "on", yesNo, "home"));
          if (D.purchase.on === "yes") {
            box.appendChild(select("購入する年齢", D.purchase, "age", range(age(), 70, 1, (v) => `${v}歳`), "home"));
            box.appendChild(radios("種類", D.purchase, "type", [{ v: "house", label: "戸建て" }, { v: "mansion", label: "マンション" }], "home"));
            box.appendChild(select("価格", D.purchase, "price", range(1500, 9000, 500, (v) => man(v)), "home"));
            box.appendChild(select("頭金", D.purchase, "down", [0, 100, 200, 300, 500, 800, 1000, 1500, 2000].map((v) => ({ v, label: man(v) })), "home"));
            box.appendChild(select("諸費用（登記・仲介手数料・引っ越しなど）", D.purchase, "cost", [0, 100, 150, 200, 280, 350, 500].map((v) => ({ v, label: man(v) })), "home", { note: "一般に、価格の数％〜1割が目安といわれます（初期値は価格の約7%）" }));
            box.appendChild(select("返済年数", D.purchase, "years", [20, 25, 30, 35].map((v) => ({ v, label: `${v}年` })), "home"));
            box.appendChild(select("金利（仮定）", D.purchase, "rate", [0.5, 1, 1.5, 2, 3].map((v) => ({ v, label: `年${v}%` })), "home", { note: "計算のための仮定です。特定の金融機関の金利ではありません。" }));
            if (D.purchase.type === "house") houseRepair(); else mansionFee();
          }
        }
        box.appendChild(sub("住み替え"));
        box.appendChild(radios("予定", D.move, "on", yesNo, "home", { note: "住み替えたあとは、ここで入れた住居費だけで計算します" }));
        if (D.move.on === "yes") {
          box.appendChild(select("時期（あなたの年齢）", D.move, "age", range(age(), 85, 1, (v) => `${v}歳`), "home"));
          box.appendChild(select("住み替えの費用（引っ越し・初期費用など）", D.move, "cost", [30, 50, 100, 200, 300, 500, 1000].map((v) => ({ v, label: man(v) })), "home"));
          box.appendChild(select("住み替えたあとの住居費", D.move, "monthly", range(0, 25, 1, (v) => (v ? `月${man(v)}` : "なし（実家・持ち家など）")), "home"));
        }
      },
    },
    {
      key: "edu", title: "🎓 教育", show: () => A.kids === "yes" || D.family.planned.length > 0,
      body: (box) => {
        if (A.kids === "yes") {
          box.appendChild(select("進学の方針（おおまかに）", A, "eduPlan", opts("eduPlan"), "edu", {
            text: true, answers: true,
            after: (v) => { const plan = KSC.EDU_PLAN[v] || KSC.EDU_PLAN.unknown; D.kids.forEach((k) => Object.assign(k, plan)); delete D.set.edu; },
          }));
        }
        const kidsNow = A.kids === "yes" ? (A.kidsAges || []).map(Number) : [];
        const ages = kidsNow.concat(D.family.planned.map((p) => -Number(p.inYears)));
        const pubPri = [{ v: "public", label: "公立" }, { v: "private", label: "私立" }];
        D.kids.forEach((kd, i) => {
          const k = ages[i];
          if (k === undefined) return;
          box.appendChild(sub(k < 0 ? `${i + 1}人目のお子さん（${-k}年後に生まれる予定）` : `${i + 1}人目のお子さん（いま${k}歳）`));
          if (k <= 5) box.appendChild(radios("幼稚園（3〜5歳）", kd, "kinder", pubPri, "edu", { rerender: false, note: "0〜2歳の保育料は、自治体と世帯の所得で決まるため入れていません" }));
          if (k <= 11) box.appendChild(radios("小学校", kd, "elem", pubPri, "edu", { rerender: false }));
          if (k <= 14) box.appendChild(radios("中学校", kd, "junior", pubPri, "edu", { rerender: false }));
          if (k <= 17) box.appendChild(radios("高校", kd, "high", pubPri, "edu", { rerender: false }));
          if (k <= 21) {
            box.appendChild(select("高校のあと", kd, "univ", [
              { v: "none", label: "進学しない" }, { v: "national", label: "国公立大学" }, { v: "privArts", label: "私立大学（文系）" },
              { v: "privSci", label: "私立大学（理系）" }, { v: "vocational", label: "専門学校（2年）" }], "edu", { text: true, rerender: true }));
            if (kd.univ !== "none") box.appendChild(radios("進学したあとの住まい", kd, "away", [{ v: "home", label: "自宅から通う" }, { v: "away", label: "下宿・一人暮らし" }], "edu", { rerender: false }));
            box.appendChild(select("習い事・塾（月あたり）", kd, "lessons", [0, 0.5, 1, 1.5, 2, 3, 4, 5].map((v) => ({ v, label: v ? `月${v}万円` : "なし" })), "edu", { rerender: true }));
            if (Number(kd.lessons) > 0) box.appendChild(select("習い事・塾を続ける年齢", kd, "lessonsUntil", range(6, 22, 1, (v) => `${v}歳まで`), "edu"));
          }
          if (k > 21) box.appendChild(h("p", "muted small", "すでに独立の年齢のため、教育費は計算していません。"));
        });
      },
    },
    {
      key: "car", title: "🚗 車",
      body: (box) => {
        const count = { n: D.cars.length };
        box.appendChild(select("車の台数（これから買う予定を含む）", count, "n", [{ v: 0, label: "持たない" }, { v: 1, label: "1台" }, { v: 2, label: "2台" }], "car", {
          rerender: true,
          after: (v) => {
            const n = Number(v);
            while (D.cars.length < n) D.cars.push({ nextIn: 5, budget: 250, interval: 10, upkeep: 35, until: 75 });
            D.cars.length = n;
            A.cars = String(n);
          },
        }));
        D.cars.forEach((c, i) => {
          if (D.cars.length > 1) box.appendChild(sub(`${i + 1}台目`));
          box.appendChild(select("次に買う（買い替える）時期", c, "nextIn", range(0, 15, 1, (v) => (v === 0 ? "今年" : `${v}年後（${age() + v}歳）`)), "car"));
          box.appendChild(select("買い替えの予算", c, "budget", [100, 150, 200, 250, 300, 400, 500, 700].map((v) => ({ v, label: man(v) })), "car"));
          box.appendChild(select("買い替えの間隔", c, "interval", [5, 7, 10, 13, 15].map((v) => ({ v, label: `${v}年ごと` })), "car"));
          box.appendChild(select("1年あたりの維持費", c, "upkeep", [10, 20, 30, 35, 40, 50, 60].map((v) => ({ v, label: `年${man(v)}` })), "car", { note: "自動車税・保険・車検・ガソリン・駐車場などの合計" }));
          box.appendChild(select("何歳まで持つ予定か", c, "until", range(60, 85, 5, (v) => `${v}歳まで`), "car"));
        });
      },
    },
    {
      key: "loans", title: "💳 借入れ（住宅ローン以外）",
      body: (box) => {
        box.appendChild(note("奨学金・自動車ローン・教育ローンなど。住宅ローンは「住まい」で設定します。"));
        const KINDS = [{ v: "shougakukin", label: "奨学金" }, { v: "car", label: "自動車ローン" }, { v: "edu", label: "教育ローン" }, { v: "other", label: "そのほか（カードローンなど）" }];
        D.loans.forEach((l, i) => {
          const card = h("div", "card detail-item");
          card.appendChild(select("種類", l, "kind", KINDS, "loans", { text: true }));
          card.appendChild(select("いまの残高", l, "balance", [0, 10, 30, 50, 100, 200, 300, 500, 800, 1000].map((v) => ({ v, label: man(v) })), "loans"));
          card.appendChild(select("毎月の返済額", l, "monthly", range(0.5, 10, 0.5, (v) => `月${v}万円`), "loans"));
          card.appendChild(select("完済する年齢", l, "endAge", range(age(), 85, 1, (v) => `${v}歳`), "loans"));
          if (l.kind === "shougakukin") card.appendChild(h("p", "muted small", "奨学金は、本人が亡くなったときに返還が免除される制度があります。万一のときの計算には含めていません（条件は貸与元でご確認ください）。"));
          const del = h("button", "linkbtn danger", "この借入れを消す"); del.type = "button";
          del.addEventListener("click", () => { D.loans.splice(i, 1); changed("loans", true); });
          card.appendChild(del);
          box.appendChild(card);
        });
        if (D.loans.length < 3) {
          const add = h("button", "btn secondary inline", "＋ 借入れを追加"); add.type = "button";
          add.addEventListener("click", () => { D.loans.push({ kind: "shougakukin", balance: 100, monthly: 1.5, endAge: Math.min(85, age() + 10) }); changed("loans", true); });
          box.appendChild(add);
        }
        if (!D.loans.length && A.otherLoan === "yes") box.appendChild(h("p", "note warn small", "「借入れがある」と答えていますが、まだ設定されていません。0円として計算しています。"));
      },
    },
    {
      key: "assets", title: "💰 貯蓄・投資",
      body: (box) => {
        box.appendChild(select("貯蓄の合計（おおまかに）", A, "savings", opts("savings"), "assets", {
          text: true, answers: true, after: () => { D.assets.cash = null; D.assets.invest = null; delete D.set.assets; },
        }));
        box.appendChild(sub("内訳"));
        box.appendChild(note("内訳を入れると、合計の代わりに内訳で計算します。投資の分だけが「計算の前提」の運用利回りで増える計算です。銘柄名や金融機関名は入力しません。"));
        const vals = [0, 50, 100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000];
        const view = { cash: D.assets.cash ?? (KSQ.mid("savings", A) ?? 300), invest: D.assets.invest ?? 0 };
        const setBoth = () => { D.assets.cash = view.cash; D.assets.invest = view.invest; };
        box.appendChild(select("預貯金", view, "cash", vals.map((v) => ({ v, label: man(v) })), "assets", { after: setBoth }));
        box.appendChild(select("投資（NISA・iDeCo・投資信託など）", view, "invest", vals.map((v) => ({ v, label: man(v) })), "assets", { after: setBoth }));
        // 積立額を変えただけでは、貯蓄を「入力済み」にしない（仮の値の注意が消えてしまうため）
        box.appendChild(select("毎月の積立額（65歳まで）", D.assets, "monthly", [0, 0.5, 1, 2, 3, 5, 8, 10].map((v) => ({ v, label: v ? `月${v}万円` : "なし" })), "assets"));
      },
    },
    {
      key: "insurance", title: "🛡️ 加入中の保険",
      body: (box) => {
        box.appendChild(checks("入っている保険（複数選べます）", A, "insured", opts("insured"), "insurance", { answers: true }));
        if (Array.isArray(A.insured) ? A.insured.some((x) => x !== "none" && x !== "unknown") : A.insured === "yes") {
          box.appendChild(note("会社名や商品名は入力しません。保険証券や、保険会社から毎年届くお知らせで確認できます。団信は「住まい」で設定します。"));
          box.appendChild(select("死亡保障（あなたが亡くなったときに家族が受け取る額の合計）", D.insurance, "death", [{ v: 0, label: "なし・わからない" }].concat(range(100, 5000, 100, (v) => man(v))), "insurance"));
          box.appendChild(radios("医療保険", D.insurance, "medical", [{ v: "yes", label: "入っている" }, { v: "no", label: "入っていない" }, { v: "unknown", label: "わからない" }], "insurance", { rerender: false }));
          box.appendChild(select("働けなくなったときの保障（月あたり）", D.insurance, "disability", [0, 5, 10, 15, 20, 30].map((v) => ({ v, label: v ? `月${man(v)}` : "なし・わからない" })), "insurance"));
        }
      },
    },
    {
      key: "spend", title: "✈️ 旅行・大きな出費",
      body: (box) => {
        box.appendChild(select("毎年の旅行・レジャー", D.spend, "travel", [0, 10, 20, 30, 50, 80, 100].map((v) => ({ v, label: v ? `年${man(v)}` : "特に見込まない" })), "spend", { rerender: true }));
        if (Number(D.spend.travel) > 0) box.appendChild(select("何歳まで", D.spend, "travelUntil", range(60, 85, 5, (v) => `${v}歳まで`), "spend"));
        box.appendChild(sub("一時的な大きな出費（最大3件）"));
        const LABELS = ["記念の旅行", "趣味", "結婚式の援助", "家電・家具の買い替え", "リフォーム以外の住まいの出費", "その他"];
        D.spend.items.forEach((it, i) => {
          const card = h("div", "card detail-item");
          card.appendChild(select("内容", it, "label", LABELS.map((v) => ({ v, label: v })), "spend", { text: true }));
          card.appendChild(select("時期（あなたの年齢）", it, "age", range(age(), 90, 1, (v) => `${v}歳`), "spend"));
          card.appendChild(select("金額", it, "amount", [30, 50, 100, 200, 300, 500, 1000].map((v) => ({ v, label: man(v) })), "spend"));
          const del = h("button", "linkbtn danger", "この出費を消す"); del.type = "button";
          del.addEventListener("click", () => { D.spend.items.splice(i, 1); changed("spend", true); });
          card.appendChild(del);
          box.appendChild(card);
        });
        if (D.spend.items.length < 3) {
          const add = h("button", "btn secondary inline", "＋ 出費を追加"); add.type = "button";
          add.addEventListener("click", () => { D.spend.items.push({ label: "記念の旅行", age: Math.min(90, age() + 5), amount: 100 }); changed("spend", true); });
          box.appendChild(add);
        }
      },
    },
    {
      key: "assumptions", title: "⚙️ 計算の前提",
      body: (box) => {
        const as = d.assumptions;
        box.appendChild(radios("物価の上昇率（年）", as, "inflation", [0, 1, 2].map((v) => ({ v, label: `${v}%` })), "assumptions", { rerender: false }));
        box.appendChild(radios("運用利回り（年）", as, "ret", [0, 1, 3].map((v) => ({ v, label: `${v}%` })), "assumptions", { rerender: false, note: "運用成果は保証されません。見通しの天気は、いつも運用しない場合で判定します。" }));
        box.appendChild(select("万一のときの遺族の生活費（下限）", as, "ratioLow", [60, 70, 80, 90, 100].map((v) => ({ v, label: `現在の${v}%` })), "assumptions"));
        box.appendChild(select("万一のときの遺族の生活費（上限）", as, "ratioHigh", [60, 70, 80, 90, 100].map((v) => ({ v, label: `現在の${v}%` })), "assumptions"));
      },
    },
  ];

  function renderSections(root) {
    const focusId = document.activeElement && document.activeElement.id;
    uid = 0; // 描き直しても同じ id になるように
    root.replaceChildren();
    SECTIONS.filter((s) => (!s.show || s.show()) && (!only || only.includes(s.key))).forEach((s) => {
      const det = h("details", "fold");
      det.dataset.key = s.key;
      det.open = openState.has(s.key);
      det.addEventListener("toggle", () => { det.open ? openState.add(s.key) : openState.delete(s.key); });
      const sum = h("summary");
      const t = h("span", null, s.title + " ");
      const isSet = !!D.set[s.key];
      const badge = h("span", isSet ? "badge set" : "badge warn", isSet ? "設定済み" : "目安で計算中");
      badge.dataset.status = s.key;
      t.appendChild(badge);
      sum.appendChild(t);
      det.appendChild(sum);
      const body = h("div", "body");
      s.body(body);
      if (isSet) {
        const reset = h("button", "linkbtn", "一般的な目安に戻す"); reset.type = "button";
        reset.addEventListener("click", () => resetSection(s.key));
        body.appendChild(reset);
      }
      det.appendChild(body);
      root.appendChild(det);
    });
    if (focusId) document.getElementById(focusId)?.focus();
    if (jumpTo) {
      const target = [...root.querySelectorAll("details.fold")].find((det) => det.dataset.key === jumpTo);
      jumpTo = null;
      if (target) requestAnimationFrame(() => {
        target.scrollIntoView({ block: "start" });
        window.scrollBy(0, -150);
        target.querySelector("select, input")?.focus({ preventScroll: true });
      });
    }
  }

  function preview() {
    const r = KSC.compute(d);
    const p = r.sim0.points;
    const at65 = p.find((x) => x.age === 65) || p[p.length - 1];
    const counts = { sun: 0, cloud: 0, rain: 0 };
    r.forecast.forEach((f) => { counts[f.weather] += 1; });
    const items = [
      [`${at65.age}歳時点の貯蓄`, man(at65.balance)],
      ["貯蓄が底をつく時期", r.sim0.shortageAge !== null ? `⚠ ${r.sim0.shortageAge}歳ごろ` : "90歳までプラス"],
      ["天気", `☔${counts.rain} ⛅${counts.cloud} ☀️${counts.sun}`],
    ];
    const box = document.getElementById("preview");
    box.replaceChildren();
    items.forEach(([l, v]) => { const c = h("div", "detail-preview-item"); c.append(h("div", "small muted", l), h("b", null, v)); box.appendChild(c); });
  }


    return {
      mount(root) { mounted = root; renderSections(root); return root; },
      refresh() { if (mounted) renderSections(mounted); },
      data() { return d; },
    };
  }

  window.KSD = { build };
})();
