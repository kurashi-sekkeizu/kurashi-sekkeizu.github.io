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
    // 生活費の内訳を、まだ直していなければ**計算が使う生活費**（KSC.compute の living）から作る。
    // 以前は「わからない」のとき内訳が livingDefault（25万円）、計算は世帯の人数の式（16.5万円など）で、
    // 画面の内訳の合計と計算が食い違っていた（2026-10-31 検証 B2-中5）
    function syncLiving() {
      if (D.set.living) return;
      try {
        const set = Object.assign({}, D.set);
        delete set.living;
        const used = KSC.compute(Object.assign({}, d, { detail: Object.assign({}, D, { set }) })).living;
        if (Number.isFinite(used)) D.living = KSC.splitLiving(used);
      } catch (e) {
        /* 計算できないときは画面の側で理由を出す（KS.showCalcFailure）。内訳は detailOf のまま */
      }
    }
    const refreshD = () => { D = KSC.detailOf(Object.assign({}, d, { detail: D })); syncLiving(); };
    syncLiving();
    const openState = cfg.openState || new Set();
    const asking = new Set();   // まだ答えていなかったので出した「かんたん」の質問（ask を見る）
    let jumpTo = cfg.jumpTo || null;
    if (jumpTo) openState.add(jumpTo);
    // 「くわしく」で始めた人には、節を開いた状態で見せる。
    // 閉じたままだと、見出しだけが並んで「質問されなかった」と受け取られるため
    const openAll = Boolean(cfg.openAll);
    // flat: 折りたたみを使わず、中身をそのまま並べる。
    // 1問ずつの画面で「詳しい条件」を**独立した画面**として出すときに使う。
    // アコーディオンの中に入れていたため、住宅ローンの借入額・期間が
    // 「質問として出てこない」と受け取られた（2026-10-02）
    const flat = Boolean(cfg.flat);
    // hideAnswers: かんたんの質問と重なる欄を出さない。
    // くわしくのステップでは、直前の画面で同じことを聞いているため（2026-10-02）
    const hideAnswers = Boolean(cfg.hideAnswers);
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
  // 仕事をやめる年齢の選択肢。**いまの値（仮置きの「いまの年齢＋何年」を含む）を、並びの中に必ず入れる。**
  // 以前は決まった並びだけで、68歳の人の仮置き73歳が並びに無く、先頭に別に足されていた（2026-10-31 K3）
  // **いまの年齢以下は出さない**（今年から給与が0になるのに、線と説明は「いまのまま」になっていた。2026-10-31 検証 C3-2）。
  // ただし保存済みのいまの値は、いまの年齢以下でも選ばれた状態で残す（読み込んだ値を勝手に変えない）。
  // 並びのうち、いまの年齢より後が少ない人（75歳以上など）には、いまの年齢の少し先を足す（範囲の定義 AGE の中で）
  const STOP_AGES = [55, 60, 63, 65, 70, 75];
  const AGE_MAX = () => { const L = KS.detailLimit("work.retireAge"); return L && Number.isFinite(L.max) ? L.max : 110; };
  const stopAgeOptions = (cur, nowAge) => {
    const now = Number(nowAge);
    let list = Number.isFinite(now) ? STOP_AGES.filter((v) => v > now) : STOP_AGES.slice();
    if (Number.isFinite(now) && list.length < 3) list = list.concat([1, 2, 3, 5, 10].map((n) => now + n).filter((v) => v <= AGE_MAX()));
    const hasCur = Number.isFinite(Number(cur)) && cur !== null && cur !== "";
    return [...new Set(list.concat(hasCur ? [Number(cur)] : []))]
      .sort((x, y) => x - y).map((v) => ({ v, label: `${v}歳` }));
  };
  // 「何歳まで」「時期（あなたの年齢）」の範囲の上限。決まった上限（70歳・80歳）が from より前だと、
  // 選択肢が保存値の1つだけ・単位なしになっていた（71歳以上。2026-10-31 検証 C3-3）。
  // from から10年ぶん（ただし見通しの終わりの年齢まで）は選べるようにし、少なくとも2つは出す（範囲の定義 AGE の上限まで）
  const ageTo = (from, to) => {
    const end = Number(KSC.DUMMY && KSC.DUMMY.endAge);
    const reach = Number.isFinite(end) ? Math.min(Number(from) + 10, end) : Number(from) + 10;
    return Math.min(AGE_MAX(), Math.max(Number(to), reach, Number(from) + 1));
  };

  // 住宅ローンの完済の年齢。**計算と同じもの**（model/plan.js の loanEndAge）を使う。
  // 計算の部品が読めないとき（データが無い等）は、画面が試算を止める（KS.showCalcFailure）。欄は同じ式（plan.js と同じ分け方）で出す
  const loanPayoffAge = () => {
    try {
      const v = Number(KSP.resolve(Object.assign({}, d, { detail: D })).loanEndAge);
      if (Number.isFinite(v)) return v;
    } catch (e) { /* 下の式で欄だけは出す */ }
    return D.loan.input !== "current" ? Number(KSC.loanFromOrigin(D.loan, age()).endAge) : Number(D.loan.endAge);
  };
  /** いまの家の住宅ローンを返し終えているか。判定は計算と同じ1か所（model/plan.js の loanPaidOff。2026-10-31 第9巡 B9-1・B9-3） */
  const loanPaidOffNow = () => {
    try {
      return Boolean(KSP.resolve(Object.assign({}, d, { detail: D })).loanPaidOff);
    } catch (e) { return loanPayoffAge() <= age(); }   // 計算が止まるときも、欄の出し分けだけはする
  };

  // くわしく入力の値の、保存データの中での場所（"cars[].interval" など）。
  // 範囲の定義（common.js の KS.detailLimit）を引くのに使う
  function pathOf(obj) {
    for (const k of Object.keys(D)) {
      if (D[k] === obj) return k;
      if (Array.isArray(D[k]) && D[k].includes(obj)) return k + "[]";
    }
    if (D.family && (D.family.planned || []).includes(obj)) return "family.planned[]";
    if (D.spend && (D.spend.items || []).includes(obj)) return "spend.items[]";
    return null;
  }

  // obj[key] を編集する選択欄。section は「設定済み」にする分類。answers: かんたんの回答を編集する欄
  function select(label, obj, key, options, section, opt = {}) {
    const row = h("div", "field-row");
    const id = "f" + ++uid;
    const l = h("label", null, label); l.htmlFor = id;
    const s = h("select", "select"); s.id = id;
    // 範囲の定義（common.js。保存データの検査と同じもの）の外の選択肢は出さない。
    // 出すと、選んだ値を次に開いたとき「読み込めませんでした」になる。外れた選択肢は印を残してテストで見つける（R92）
    const base = opt.path || pathOf(obj);
    if (base) {
      const path = base + "." + key;
      s.dataset.path = path;
      const out = options.filter((o) => !KS.detailValueOk(path, opt.text ? o.v : Number(o.v)));
      if (out.length) {
        s.dataset.outOfRange = out.map((o) => o.v).join(",");
        options = options.filter((o) => !out.includes(o));
      }
    }
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
    // まだ答えていない「かんたん」の質問の欄は、先頭の選択肢が選ばれたように見せない。
    // 以前は「働いていない→会社員」にすると、年収が「300万円未満」を選んだように見えて、保存は空だった（2026-10-31 検証 C3-1）
    if (opt.answers && (obj[key] === null || obj[key] === undefined || obj[key] === "")) {
      const ph = h("option", null, "選んでください（まだ答えていません）");
      ph.value = "";
      ph.disabled = true;
      ph.selected = true;
      s.insertBefore(ph, s.firstChild);
      row.classList.add("field-unanswered");
    }
    // check: 保存する前に確かめる。だめなら文言を返し、値は元に戻して保存しない
    const err = h("p", "error small", "");
    err.setAttribute("role", "alert");
    err.hidden = true;
    row.append(l, s, err);
    // 計算に入らない値の印。予定の年齢が、いまの年齢より前のまま残っているとき（いまの年齢をあとから直した など）や、
    // 繰り上げ返済の時期が完済の年齢以後のとき。計算はその予定を外す（model/yearly.js の inSpan・remainYears）ので、
    // 欄で分かるようにして選び直してもらう。保存値は勝手に変えない（C3-2 と同じ）。
    // 以前は「設定済み」のまま何も示さず、計算からは黙って外れていた（2026-10-31 検証 C6-軽1/軽2・B7-1・C7-2/C7-3）。
    // **選び直したら、その場で付け外しする。** 描き直さない欄では、以前は作るときにしか付け外しせず、
    // 選び直しても⚠と aria-invalid が残っていた（2026-10-31 検証 C7-軽1）
    let warn = null;
    const markOf = (raw) => {
      if (raw === null || raw === undefined || raw === "") return null;
      const v = Number(raw);
      if (!Number.isFinite(v)) return null;
      const own = opt.mark ? opt.mark(v) : null;   // 欄ごとの印（介護の期間の一部だけ入る など）
      if (own) return own;
      if (Number.isFinite(Number(opt.notBefore)) && v < Number(opt.notBefore)) return { kind: "past", text: "いまの年齢より前のため、計算に入れていません。選び直してください" };
      if (Number.isFinite(Number(opt.notFrom)) && v >= Number(opt.notFrom)) return { kind: "paid", text: "返済が終わったあとのため、計算に入れていません。選び直してください" };
      return null;
    };
    const applyMark = () => {
      if (warn) { warn.remove(); warn = null; }
      s.removeAttribute("aria-invalid");
      s.removeAttribute("aria-describedby");
      const m = markOf(obj[key]);
      if (!m) return;
      warn = h("p", "note warn small", "⚠ " + m.text);
      warn.id = id + "-mark";
      const at = String(obj[key]);
      if (m.kind === "past") warn.dataset.pastAge = at;
      else if (m.kind === "paid") warn.dataset.paidAge = at;
      else if (m.kind === "over") warn.dataset.overYears = at;
      else if (m.kind === "late") warn.dataset.lateAge = at;
      else warn.dataset.partialAge = at;
      // 一部は計算に入るもの（partial）は、まちがいではないので aria-invalid は付けない（説明だけつなぐ）
      if (m.kind !== "partial") s.setAttribute("aria-invalid", "true");
      s.setAttribute("aria-describedby", warn.id);
      row.insertBefore(warn, err);
    };
    applyMark();
    s.addEventListener("change", () => {
      const v = opt.text ? s.value : Number(s.value);
      const msg = opt.check ? opt.check(v) : null;
      if (msg) {
        s.value = String(obj[key]);
        err.textContent = msg;
        err.hidden = false;
        return;
      }
      err.hidden = true;
      obj[key] = v;
      applyMark();
      if (opt.after) opt.after(s.value);
      changed(section, opt.rerender, opt.answers);
    });
    if (opt.note) row.appendChild(h("p", "muted small", opt.note));
    // かんたんの質問と重なる欄は、くわしくのステップでは隠す（直前の画面で聞いている）。
    // **要素は作ってから隠す。** 作らずに返すと、戻り値を触る呼び出し側が壊れる
    // （bandRow.querySelector("select").id = … で例外になり、回答の保存まで止まった）
    if (opt.answers && hideAnswers) row.hidden = true;
    return row;
  }
  // 複数選べる項目（入っている保険など）
  function checks(label, obj, key, options, section, opt = {}) {
    const fs = h("fieldset", "field-row");
    fs.appendChild(h("legend", "detail-legend", label));
    const wrap = h("div", "radio-row");
    const cur = () => (Array.isArray(obj[key]) ? obj[key] : []);
    // 選択肢ごとに一意の id を付ける（radios と同じ付け方）。描き直したあと、renderSections が同じ欄へフォーカスを戻すため。
    // 以前は id が無く、Space で切り替えるとフォーカスが body へ飛んでいた（2026-10-31 検証 C7-軽4）
    const p = pathOf(obj);
    const gid = obj === A ? "a." + key : p && !p.endsWith("[]") ? p + "." + key : "c" + ++uid + "." + key;
    options.forEach((o, idx) => {
      const lab = h("label");
      const i = h("input"); i.type = "checkbox"; i.value = o.v; i.checked = cur().includes(o.v);
      i.id = "ck-" + gid.replace(/[^\w-]/g, "_") + "-" + idx;
      i.addEventListener("change", () => {
        // 「入っていない」「わからない」は、ほかと同時には選べない（opt.exclusive。質問の画面と同じ KSQ.toggleMulti）
        obj[key] = KSQ.toggleMulti({ exclusive: opt.exclusive || [], options }, cur(), o.v, i.checked);
        if (opt.after) opt.after(obj[key]);
        changed(section, opt.rerender !== false, opt.answers);
      });
      lab.append(i, document.createTextNode(o.label));
      wrap.appendChild(lab);
    });
    fs.appendChild(wrap);
    if (opt.note) fs.appendChild(h("p", "muted small", opt.note));
    // かんたんの質問と重なる欄は、くわしくのステップでは隠す（直前の画面で聞いている）。
    // **要素は作ってから隠す。** 作らずに返すと、戻り値を触る呼び出し側が壊れる
    // （bandRow.querySelector("select").id = … で例外になり、回答の保存まで止まった）
    if (opt.answers && hideAnswers) fs.hidden = true;
    return fs;
  }

  // 収入の見込みを、線の形を見ながら選ぶ。**実際の計算と同じ関数・同じデータ**から線を引くので、絵と計算がずれない。
  // 以前は 57歳・年1%（1.01／0.99）をここに直書きしていて、データを変えると計算とずれた。
  // データが無いときは線を描かない（計算もその線では動かないため。2026-10-31 検証 D7）
  const growthStep = () => {
    const v = window.KSC && KSC.DUMMY && Number(KSC.DUMMY.incomeGrowthStep);
    return Number.isFinite(v) ? v : null;
  };
  function curveSVG(mode, workKind, fromAge, toAge) {
    const W = 108, H = 44, pad = 4;
    const pts = [];
    for (let age = fromAge; age <= toAge; age++) {
      let f = 1;
      if (mode === "stat") {
        const v = window.KSY && KSY.wageFactor ? KSY.wageFactor(workKind, fromAge, age) : null;
        if (v === null || !Number.isFinite(v)) return null;
        f = v;
      } else if (mode === "up" || mode === "down") {
        const g = growthStep();
        if (g === null) return null;
        f = Math.pow(1 + (mode === "up" ? g : -g), age - fromAge);
      }
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

  // 線の説明は説明の層（KSX.curveNoteText）が、計算と同じデータ（capAge・上がる下がるの幅・定年の設定）から作る（2026-10-31 K3）
  const curveNote = (retireAge) => KSX.curveNoteText(retireAge);

  function curvePicker(label, obj, key, workKind, section, opt = {}) {
    const fs = h("fieldset", "field-row");
    fs.appendChild(h("legend", "detail-legend", label));
    const wrap = h("div", "curve-row");
    const name = "c" + ++uid;
    const from = opt.fromAge || age();
    // 線は、いまの年齢から定年（仕事をやめる年齢）まで。計算が増減させるのも定年まで（model/yearly.js の incomeWorkAt）。
    // 以前は「60歳まで・65歳で打ち切り」をここに直書きしていて、定年の目安を過ぎて働く人（68歳→73歳）では
    // 終わりが始まりより前になり「68歳→65歳 −NaN%」と出ていた（2026-10-31 K3）
    const to = Math.max(from + 1, Number(opt.toAge));
    [["stat", "年齢に応じて"], ["flat", "いまのまま"], ["up", "上がる"], ["down", "下がる"]].forEach(([v, text]) => {
      const c = curveSVG(v, workKind, from, to) || {
        svg: "", pct: null,
        // 線を引けない理由（データが無い・この働き方は統計の対象外）
        why: v === "stat" ? "統計を使えないため、線を描けません（いまのままで計算します）" : "前提のデータが無いため、線を描けません",
      };
      const lab = h("label", "curve-opt");
      const i = h("input"); i.type = "radio"; i.name = name; i.value = v; i.checked = String(obj[key]) === v;
      i.id = name + "-" + v;   // 描き直したあとフォーカスを戻すため（C6-軽3）
      i.addEventListener("change", () => { obj[key] = v; changed(section, true, opt.answers); });
      const box = h("span", "curve-box");
      box.innerHTML = c.svg;
      const cap = h("span", "curve-cap", text);
      const num = h("span", "curve-num", c.pct === null ? c.why : c.pct === 0 ? `${from}歳→${to}歳 変わらない` : `${from}歳→${to}歳 ${c.pct > 0 ? "＋" : "−"}${Math.abs(c.pct)}%`);
      lab.append(i, box, cap, num);
      wrap.appendChild(lab);
    });
    fs.appendChild(wrap);
    if (opt.note) fs.appendChild(h("p", "muted small", opt.note));
    // かんたんの質問と重なる欄は、くわしくのステップでは隠す（直前の画面で聞いている）。
    // **要素は作ってから隠す。** 作らずに返すと、戻り値を触る呼び出し側が壊れる
    // （bandRow.querySelector("select").id = … で例外になり、回答の保存まで止まった）
    if (opt.answers && hideAnswers) fs.hidden = true;
    return fs;
  }

  function radios(label, obj, key, options, section, opt = {}) {
    const fs = h("fieldset", "field-row");
    fs.appendChild(h("legend", "detail-legend", label));
    const wrap = h("div", "radio-row");
    const name = "r" + ++uid;
    // 選択肢ごとに一意の id を付ける。描き直したあと、renderSections が同じ選択肢へフォーカスを戻すため。
    // 以前は id が無く、描き直しを伴うラジオを矢印キーで選ぶとフォーカスが body へ飛び、組の中を続けて動けなかった（2026-10-31 検証 C6-軽3）。
    // 値の置き場所（D の節・かんたんの回答）で名前を付け、描き直しで前に欄が増えても同じ id になるようにする。置き場所が決まらないもの（子ごとの欄など）は並び順で
    const p = pathOf(obj);
    const gid = obj === A ? "a." + key : p && !p.endsWith("[]") ? p + "." + key : name;
    options.forEach((o, idx) => {
      const lab = h("label");
      const i = h("input"); i.type = "radio"; i.name = name; i.value = o.v; i.checked = String(obj[key]) === String(o.v);
      i.id = "rd-" + gid.replace(/[^\w-]/g, "_") + "-" + idx;
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
    // かんたんの質問と重なる欄は、くわしくのステップでは隠す（直前の画面で聞いている）。
    // **要素は作ってから隠す。** 作らずに返すと、戻り値を触る呼び出し側が壊れる
    // （bandRow.querySelector("select").id = … で例外になり、回答の保存まで止まった）
    if (opt.answers && hideAnswers) fs.hidden = true;
    return fs;
  }
  const note = (text) => h("p", "note info small", text);
  const sub = (text) => h("h3", "detail-sub", text);

  // ── まだ答えていない「かんたん」の質問を、ここで答えられるようにする（2026-10-31 検証 C3-1）──
  // くわしく入力で答えを変える（住まい→賃貸、働き方→自営業、保険に死亡保障、子→これから など）と、
  // 必須の質問（家賃・収入の波・年収・保険金・予定の時期）が未回答になる。以前は欄が無く、
  // 「結果に反映して見る」で結果が出ないまま行き止まりになっていた。
  // **勝手な値で埋めない。** 質問の定義（questions.js）の選択肢をそのまま出し（「わからない」も含む）、選んだときだけ保存する。
  // 一度出した欄は、答えたあとも同じ画面の間は出しておく（選んだ直後に消えると戸惑うため）
  const needsAnswer = (qid) => { const q = KSQ.byId[qid]; return !!q && (!q.when || q.when(A)) && !KSQ.isAnswered(q, A); };
  Object.keys(ASK).forEach((qid) => { if (needsAnswer(qid)) openState.add(ASK[qid].section); });
  // own: 欄そのものは節の中で作る質問（配偶者の年齢・働き方・年収、入っている保険）。印（data-ask）だけ付ける
  function own(row, qid) {
    row.dataset.ask = qid;
    if (needsAnswer(qid)) row.classList.add("field-unanswered");
    return row;
  }
  function ask(box, qid, opt = {}) {
    const q = KSQ.byId[qid];
    if (!q || (q.when && !q.when(A))) return null;
    if (needsAnswer(qid)) asking.add(qid);
    if (!ASK[qid].always && !asking.has(qid)) return null;
    const text = q.options.some((o) => typeof o.v === "string");
    const row = select(ASK[qid].label, A, qid, opts(qid), ASK[qid].section, Object.assign({ text, answers: true }, opt));
    row.dataset.ask = qid;
    box.appendChild(row);
    return row;
  }

  // かんたんの回答を変えたときに、ほかの回答と矛盾しないように整える
  // 配偶者を「いる」にしたときの年齢・働き方・年収は、**勝手な値で埋めない**（2026-10-31 検証 R4）。
  // 以前は「あなたと同じ年齢・パート・扶養の範囲内」で埋めていて、答えていない値で見通しが出ていた。
  // いまは C3-1 と同じく、未回答の欄として出して答えてもらう（ASK の spouseAge・spouseWork・spouseIncome）
  function normalizeAnswers() {
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
      refreshD();
    } else {
      D.set[section] = true;
    }
    d.detail = D;
    KS.save(d);
    afterChange(d);
    if (section === "living" && !answersChanged) {
      const sum = KSC.LIVING_ITEMS.reduce((t, it) => t + Number(D.living[it.key] || 0), 0);
      const el = document.getElementById("living-sum");
      if (el) el.textContent = `内訳の合計 月${(Math.round(sum * 10) / 10).toLocaleString("ja-JP")}万円で計算しています`;
      // 内訳を変えたら「生活費（おおまかに）」の帯も合計に合わせる（画面が食い違って見えるため）
      const band = KSQ.bandOf("living", sum);
      if (band && A.living !== band) {
        A.living = band;
        KS.save(d);
        const sel = document.getElementById("living-band");
        if (sel) sel.value = band;
      }
    }
    // mount していない使い方（チャットは欄を1つずつ取り出して自分で並べる）もあるので、
    // 貼り付け先が無いときは描き直さない。描き直しは呼び出し側（onChange）に任せる
    if (rerender || answersChanged) { if (mounted) renderSections(mounted); }
    else document.querySelectorAll(`[data-status="${section}"]`).forEach((b) => { const v = badgeOf(section); b.textContent = v.text; b.className = v.cls; });
  }

  let mounted = null;

  // ── 描き直したあとのフォーカス（2026-10-31 検証 C8-軽3）──
  // 追加・消す・目安に戻すのボタンは、押すと節ごと描き直すため、押したボタンが消えてフォーカスがページの先頭へ飛んでいた。
  // 押したときに「描き直したあとどこへ移すか」を決めておき、renderSections が使う（同じ id へ戻す、より先に見る）
  let focusNext = null;
  const FIELDS = "select, input, button";
  /** 追加した欄（カード）の最初の欄へ */
  const focusAfterAdd = (kind, i) => { focusNext = (root) => root.querySelector(`[data-item="${kind}-${i}"]`)?.querySelector(FIELDS); };
  /** 消したあとは追加ボタンへ。無ければ（上限のときなど）直前のカードの最初の欄、それも無ければ節の最初の欄 */
  const focusAfterDelete = (kind, i) => {
    focusNext = (root) => root.querySelector(`#${kind}-add`)
      || (i > 0 ? root.querySelector(`[data-item="${kind}-${i - 1}"]`)?.querySelector(FIELDS) : null)
      || root.querySelector(`[data-key="${kind}"] .body`)?.querySelector(FIELDS);
  };
  /** 節の最初の欄へ（「一般的な目安に戻す」のあと） */
  const focusSection = (key) => { focusNext = (root) => root.querySelector(`[data-key="${key}"] .body`)?.querySelector(FIELDS); };
  /** 描き直したあとにフォーカスを移す。決めた先があればそこ、無ければ描き直す前と同じ id */
  function restoreFocus(root, focusId) {
    const pick = focusNext;
    focusNext = null;
    const target = (pick && pick(root)) || (focusId ? document.getElementById(focusId) : null);
    if (target) target.focus();
  }

  function resetSection(section) {
    const def = KSC.detailDefaults(A, (D.family.planned || []).length);
    const keys = KSC.SECTION_KEYS[section] || [];   // 節と値の対応は計算の層が持つ（1か所）
    keys.forEach((k) => { D[k] = def[k]; });
    if (section === "assumptions") d.assumptions = KS.empty().assumptions;
    delete D.set[section];
    refreshD();
    d.detail = D;
    KS.save(d);
    afterChange(d);
    renderSections(mounted);
  }

  // ── 分類（くわしく入力＝全項目の正本）──
  const SECTIONS = [
    {
      key: "family", title: "家族",
      body: (box) => {
        box.appendChild(select("あなたの年齢", A, "age", range(18, 80, 1, (v) => `${v}歳`), "family", { answers: true }));
        box.appendChild(radios("配偶者・パートナー", A, "spouse", opts("spouse"), "family", { answers: true }));
        if (KSQ.hasSpouse(A)) box.appendChild(own(select("配偶者の年齢", A, "spouseAge", range(18, 80, 1, (v) => `${v}歳`), "family", { answers: true }), "spouseAge"));
        box.appendChild(radios("お子さん", A, "kids", [{ v: "yes", label: "いる" }, { v: "no", label: "いない" }, { v: "plan", label: "これから" }], "family", { answers: true }));
        // 予定の時期を答えたら、予定のお子さんを1人入れる（まだ入れていなければ。はじめの値と同じ作り方）。
        // 選び直したときは、1人目の生まれる時期をその答えに合わせる。以前は予定が空のときだけ入れていたため、
        // 家族の節が「設定済み」だと選び直しても計算に入らず、かんたんの答えと食い違っていた（2026-10-31 検証 C4-軽1）
        ask(box, "kidPlanIn", {
          after: () => {
            const def = KSC.detailDefaults(A, 0).family.planned;
            if (!D.family.planned.length) D.family.planned = def;
            else if (def.length) D.family.planned[0] = Object.assign({}, D.family.planned[0], { inYears: def[0].inYears });
          },
        });
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
            refreshD();
          },
        }));
        D.family.planned.forEach((p, i) => box.appendChild(select(`${i + 1}人目：生まれる時期`, p, "inYears", range(1, 10, 1, (v) => `${v}年後`), "family")));
        box.appendChild(sub("親の介護"));
        box.appendChild(radios("介護の費用を見込むか", D.care, "on", [{ v: "no", label: "見込まない" }, { v: "yes", label: "見込む" }], "family"));
        if (D.care.on === "yes") {
          // 始まりがいまの年齢より前のとき。計算（model/yearly.js）は介護の年ごとに inSpan を見るので、
          // いまの年齢より前の年だけを外し、いまの年齢から終わりまでは入れる。全部が前なら1年も入らない（2026-10-31 検証 C7-軽2）
          const careMark = (start) => {
            const now = age(), end = start + Number(D.care.years);   // end は介護の終わった翌年の年齢
            if (!(start < now) || !Number.isFinite(end)) return null;
            if (end <= now) return { kind: "past", text: "いまの年齢より前のため、計算に入れていません。選び直してください" };
            return { kind: "partial", text: `始まりがいまの年齢より前のため、${now}歳から残りの${end - now}年ぶんだけを計算に入れています（それより前の${now - start}年ぶんは入れていません）` };
          };
          box.appendChild(select("始まる時期（あなたの年齢）", D.care, "startAge", range(age(), 85, 1, (v) => `${v}歳`), "family", { mark: careMark }));
          // 期間を変えると、上の印（入る年数）も変わるので、始まりが前のときだけ描き直す
          box.appendChild(select("期間", D.care, "years", [3, 5, 7, 10, 15].map((v) => ({ v, label: `${v}年` })), "family", { rerender: Number(D.care.startAge) < age() }));
          box.appendChild(select("あなたの負担（月あたり）", D.care, "monthly", [1, 2, 3, 5, 8, 10, 15].map((v) => ({ v, label: `月${man(v)}` })), "family"));
        }
      },
    },
    {
      key: "work", title: "あなたの収入",
      body: (box) => {
        box.appendChild(select("働き方", A, "work", opts("work"), "work", { text: true, answers: true }));
        ask(box, "income");
        ask(box, "selfVary");
        box.appendChild(curvePicker("今後の年収の見込み", D.work, "growth", A.work, "work", { toAge: Number(D.work.retireAge), note: curveNote(D.work.retireAge) }));
        box.appendChild(sub("定年・再雇用・退職金"));
        box.appendChild(select("仕事をやめる（定年の）年齢", D.work, "retireAge", stopAgeOptions(D.work.retireAge, age()), "work", { rerender: true }));
        box.appendChild(select("定年後の働き方（再雇用など）", D.work, "rehire", [{ v: 0, label: "働かない" }, { v: 50, label: "定年前の年収の5割" }, { v: 70, label: "定年前の年収の7割" }, { v: 100, label: "定年前と同じ" }], "work", { rerender: true }));
        if (Number(D.work.rehire) > 0) box.appendChild(select("何歳まで働くか", D.work, "rehireUntil", range(Math.max(60, Number(D.work.retireAge) + 1), ageTo(Math.max(60, Number(D.work.retireAge) + 1), 80), 1, (v) => `${v}歳まで`), "work"));
        if (A.work === "self") box.appendChild(h("p", "muted small", "自営業・フリーランスには会社の退職金がないため、小規模企業共済などを使っている場合はその見込み額を入れてください。"));
        box.appendChild(select("退職金の見込み", D.work, "allowance", [0, 300, 500, 800, 1000, 1500, 2000, 3000].map((v) => ({ v, label: v ? man(v) : "なし・わからない" })), "work"));
        box.appendChild(sub("転職・独立"));
        box.appendChild(radios("予定", D.work, "change", yesNo, "work"));
        if (D.work.change === "yes") {
          // 選択肢は仕事をやめる（定年の）年齢より前だけ。それ以後は計算に入れない（model/plan.js の changeLate）。
          // 保存値がそれ以後なら残して印で知らせる。以前は定年より後も選べ、年表は転職なのに計算は0か再雇用の割合だった（2026-10-31 第12巡 B12-中2）
          const stop = Number(D.work.retireAge);
          box.appendChild(select("時期（あなたの年齢）", D.work, "changeAge", range(age(), Math.min(ageTo(age(), 70), stop - 1), 1, (v) => `${v}歳`), "work", {
            mark: (v) => (v >= stop ? { kind: "late", text: `仕事をやめる年齢（${stop}歳）以後のため、計算に入れていません。選び直してください` } : null) }));
          box.appendChild(select("変わったあとの年収（額面）", D.work, "changeIncome", opts("income").filter((o) => o.v !== "unknown"), "work", { text: true }));
        }
        box.appendChild(sub("年金・その他の収入"));
        box.appendChild(select("年金の見込み額（年額）", D.work, "pension", [{ v: 0, label: "わからない（概算で計算）" }].concat(range(50, 300, 10, (v) => `年${man(v)}`)), "work", { note: "毎年誕生月に届く「ねんきん定期便」に記載されています" }));
        box.appendChild(select("副業などの収入（年・手取り）", D.work, "side", [0, 10, 30, 50, 100, 200, 300].map((v) => ({ v, label: v ? `年${man(v)}` : "なし" })), "work", { rerender: true }));
        if (Number(D.work.side) > 0) box.appendChild(select("何歳まで", D.work, "sideUntil", range(Math.max(age() + 1, 50), ageTo(Math.max(age() + 1, 50), 80), 1, (v) => `${v}歳まで`), "work"));
      },
    },
    {
      key: "spouseWork", title: "配偶者の収入", show: () => KSQ.hasSpouse(A),
      body: (box) => {
        box.appendChild(own(select("働き方", A, "spouseWork", opts("spouseWork"), "spouseWork", { text: true, answers: true }), "spouseWork"));
        if (KSQ.byId.spouseIncome.when(A)) box.appendChild(own(select("年収（額面・税込）", A, "spouseIncome", opts("spouseIncome"), "spouseWork", { text: true, answers: true }), "spouseIncome"));
        // 年齢・働き方をまだ答えていなければ、見込みの欄は出さない（線や定年の年齢を、答えていない値から作らない。R4）
        if (!KSQ.isAnswered(KSQ.byId.spouseAge, A) || !KSQ.isAnswered(KSQ.byId.spouseWork, A)) {
          box.appendChild(h("p", "muted small", "配偶者の年齢と働き方を答えると、今後の年収の見込みや仕事をやめる年齢を設定できます。"));
          return;
        }
        box.appendChild(curvePicker("今後の年収の見込み", D.spouseWork, "growth", A.spouseWork, "spouseWork", { fromAge: Number(A.spouseAge), toAge: Number(D.spouseWork.retireAge), note: curveNote(D.spouseWork.retireAge) }));
        box.appendChild(select("今後の働き方", D.spouseWork, "plan", [
          { v: "same", label: "今と同じ" }, { v: "leave", label: "一時的に収入が減る（育休・時短など）" },
          { v: "quit", label: "仕事をやめる" }, { v: "return", label: "働き始める・復職する" }], "spouseWork", { text: true, rerender: true }));
        if (D.spouseWork.plan !== "same") box.appendChild(select("時期", D.spouseWork, "planFrom", range(0, 15, 1, (v) => (v === 0 ? "今年から" : `${v}年後から`)), "spouseWork"));
        if (D.spouseWork.plan === "leave") {
          box.appendChild(select("期間", D.spouseWork, "planYears", [1, 2, 3, 5, 7, 10].map((v) => ({ v, label: `${v}年間` })), "spouseWork"));
          box.appendChild(select("その間の年収", D.spouseWork, "planRate", [0, 30, 50, 70, 80].map((v) => ({ v, label: `今の${v}%` })), "spouseWork"));
        }
        if (D.spouseWork.plan === "return") box.appendChild(select("働き始めたあとの年収（額面）", D.spouseWork, "returnIncome", opts("spouseIncome").filter((o) => o.v !== "unknown"), "spouseWork", { text: true }));
        box.appendChild(select("仕事をやめる年齢（配偶者の年齢）", D.spouseWork, "retireAge", stopAgeOptions(D.spouseWork.retireAge, A.spouseAge), "spouseWork", { rerender: true }));
        box.appendChild(select("年金の見込み額（年額）", D.spouseWork, "pension", [{ v: 0, label: "わからない（概算で計算）" }].concat(range(50, 300, 10, (v) => `年${man(v)}`)), "spouseWork"));
      },
    },
    {
      key: "living", title: "毎月の生活費",
      body: (box) => {
        const bandRow = select("生活費（おおまかに）", A, "living", opts("living"), "living", {
          text: true, answers: true,
          // 内訳は、帯を変えたあとに計算が使う生活費から作り直す（changed → refreshD → syncLiving）
          after: () => { delete D.set.living; },
          note: "ここを変えると、下の内訳を一般的な割合で入れ直します。",
        });
        bandRow.querySelector("select").id = "living-band";
        box.appendChild(bandRow);
        box.appendChild(sub("内訳"));
        box.appendChild(note("家計簿やカードの明細を見ながら合わせてください。内訳を変えると、その合計で計算し、上の「おおまかに」も合計に合わせて動きます。住居費・教育費・車は別の分類で設定します。"));
        const amounts = range(0, 30, 0.5, (v) => `月${v.toLocaleString("ja-JP")}万円`);
        KSC.LIVING_ITEMS.forEach((it) => box.appendChild(select(it.label, D.living, it.key, amounts, "living")));
        const sum = KSC.LIVING_ITEMS.reduce((t, it) => t + Number(D.living[it.key] || 0), 0);
        const total = h("p", "living-sum", `内訳の合計 月${(Math.round(sum * 10) / 10).toLocaleString("ja-JP")}万円${D.set.living ? "で計算しています" : ""}`);
        total.id = "living-sum";
        box.appendChild(total);
        box.appendChild(sub("老後の生活費"));
        box.appendChild(select(`${KSC.DUMMY.pensionAge}歳からの生活費`, D.retire, "ratio", [60, 70, 80, 85, 90, 100].map((v) => ({ v, label: `現役のころの${v}%` })), "living"));
      },
    },
    {
      key: "home", title: "住まい",
      body: (box) => {
        box.appendChild(select("お住まい", A, "home", opts("home"), "home", { text: true, answers: true }));
        if (owns()) box.appendChild(radios("戸建て／マンション", A, "homeType", opts("homeType"), "home", { answers: true }));
        if (A.home === "loan") {
          box.appendChild(sub("住宅ローン"));
          // 「いまの返済額と残高」に切り替えたとき、完済する年齢が選べる範囲（いまの年齢+1〜上限）の外なら、
          // 借りたときの内容から計算した値（毎月・完済の年齢・残高）を入れ直す。範囲の中で利用者が選んだ値なら変えない（仮置きのままなら入れ直す。第11巡 B11-2）。
          // 以前は古いはじめの値（完済65歳）のままで、65歳以上の人は切り替えただけで返し終えた扱いになっていた（2026-10-31 第10巡 B10-1）
          const endMax = KSP.loanEndAgeMax();
          // 「いまの返済額と残高」の欄を利用者が選んだら、仮置きではなくなる（切り替えても入れ直さない。第11巡 B11-2）
          const ownCurrent = () => { D.loan.currentAuto = false; };
          box.appendChild(radios("入力のしかた", D.loan, "input", [
            { v: "origin", label: "借りたときの内容から計算する" },
            { v: "current", label: "いまの返済額と残高を入れる" },
          ], "home", { rerender: true, note: "残高は覚えていないことが多いので、借りたときの内容（借入額・期間・いつから）からでも計算できます",
            // まだ仮置きのまま（欄を選んでいない）なら、切り替えるたびにいまの借りたときの内容から入れ直す（直前の「この内容だと…」と同じ値）。
            // 借りたときの内容で返し終えていれば、返し終えたまま（完済はその年齢・残高0）にする。
            // 以前は仮置きの古い値（借入額を直す前の値）が残り、返し終えたローンは返済が1年ぶん戻っていた（2026-10-31 第11巡 B11-2）
            after: (v) => {
              if (v !== "current") return;
              const next = KSP.loanSwitchToCurrent(D.loan, age());
              if (next) Object.assign(D.loan, next);
            } }));
          if (D.loan.input !== "current") {
            box.appendChild(select("借りた金額", D.loan, "borrowed", range(300, 8000, 100, (v) => man(v)), "home", { rerender: true }));
            box.appendChild(select("借りた期間", D.loan, "years", [10, 15, 20, 25, 30, 35, 40].map((v) => ({ v, label: `${v}年` })), "home", { rerender: true }));
            // 借りた期間より長い「何年前から」（期間を短く直したあとの保存値など）は、返し終えた扱いで計算する。欄に印を付けて分かるようにする
            // （ほかの欄の印と同じ形：⚠の文・aria-invalid・aria-describedby。2026-10-31 第10巡 C10-軽1）
            // 選択肢は、保存できる完済の年齢の下限（KSP.loanEndAgeMin。18歳）より前から返していることにならない年数まで。
            // 以前は「期間まで（最大40年）」で年齢を見ず、45歳・期間10年・40年前から を選べ、切り替えると完済15歳で保存されて
            // 保存データ全体が読み込めなくなった（2026-10-31 第12巡 A12-中1）。それより大きい保存値は残し、下の印で知らせる。
            // 完済が上限（KSP.loanEndAgeMax）を超える内容も、同じ形の印で知らせる（計算はこの内容のまま。第12巡 B12-軽3）
            const agoMax = Math.max(0, Math.min(40, Number(D.loan.years), age() - KSP.loanEndAgeMin()));
            box.appendChild(select("何年前から返済していますか", D.loan, "startedAgo", range(0, agoMax, 1, (v) => (v === 0 ? "今年から" : `${v}年前から`)), "home", { rerender: true,
              mark: (v) => {
                if (v > Number(D.loan.years)) return { kind: "over", text: `借りた期間（${Number(D.loan.years)}年）より長いため、返し終えたものとして計算しています。まだ返済中なら選び直してください` };
                const end = age() - v + Number(D.loan.years);
                if (end > endMax) {
                  const simEnd = Number(KSC.DUMMY.endAge);
                  return { kind: "over", text: `この内容だと完済が${end}歳になり、完済する年齢として選べる上限（${endMax}歳）を超えています。計算は${end > simEnd ? `見通しの終わり（${simEnd}歳）まで` : `${end}歳で完済するまで`}返済を入れています。借りた期間と返済を始めた時期を確かめてください` };
                }
                return null;
              } }));
            box.appendChild(select("金利（年）", D.loan, "rate", [0.3, 0.5, 0.7, 1, 1.3, 1.5, 2, 2.5, 3].map((v) => ({ v, label: `${v}%` })), "home", { rerender: true, note: "だいたいで大丈夫です。わからなければ、返済予定表か契約書でご確認ください" }));
            const v = KSC.loanFromOrigin(D.loan, age());
            const out = h("p", "note info small");
            out.id = "loan-origin-result";
            // 返し終えていれば、毎月の返済額・残高は言わない（計算は返済を1年も入れない）。
            // 以前は「毎月約8.5万円・残高約0万円・完済40歳」と、返済中のように出ていた（2026-10-31 第9巡 B9-3）
            out.textContent = loanPaidOffNow()
              ? `この内容だと、返済は終わっています（${v.endAge}歳で完済）。`
              : `この内容だと、毎月の返済は約${v.monthly.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}万円、`
              + `いまの残高は約${man(v.balance)}、完済は${v.endAge}歳になります。`
              + (v.paid === 0 ? "" : `（すでに${v.paid}年ぶん返しています）`);
            box.appendChild(out);
          } else {
            // この4つは、下の「残高・返済額・完済年齢の食い違い」と、繰り上げ返済の印・選べる年齢（完済の年齢）のもと。
            // 選び直したら描き直して追いつかせる。以前は描き直さず、完済の年齢を変えても古い印・選択肢・注意が残っていた（2026-10-31 検証 C8-軽1）
            // 0.5万円刻み。はじめの値（借りたときの内容から計算した 月8.5万円 など）が並びに入るように（第10巡 B10-1）
            box.appendChild(select("毎月の返済額", D.loan, "monthly", range(3, 25, 0.5, (v) => `月${v.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}万円`), "home", { rerender: true, after: ownCurrent }));
            // 完済の年齢がいまの年齢以下なのに残高があると、残高を計算に入れていない（model/plan.js の loanMismatch の paidBalance）。
            // 下の注意の文と同じことを、この欄の印としても結びつける（2026-10-31 第10巡 C10-軽2）
            box.appendChild(select("完済する年齢", D.loan, "endAge", range(Math.max(age() + 1, 40), endMax, 1, (v) => `${v}歳`), "home", { rerender: true, after: ownCurrent,
              mark: (v) => (v <= age() && Number(D.loan.balance) > 0
                ? { kind: "paid", text: `いまの年齢以下のため、いまの残高（${man(Number(D.loan.balance))}）を計算に入れていません。まだ返済中なら選び直してください` } : null) }));
            box.appendChild(select("いまの残高", D.loan, "balance", range(100, 6000, 100, (v) => man(v)), "home", { rerender: true, after: ownCurrent }));
            // ボーナス返済は「毎月の返済額」と別に払っているぶん。
            // 借りたときの内容から計算する場合は、月々の返済額がすでに借入額の全部を返す額なので聞かない（二重に数えてしまう）
            box.appendChild(select("ボーナス返済（年2回の合計）", D.loan, "bonus", [0, 10, 20, 30, 40, 60, 80, 100].map((v) => ({ v, label: v ? `年${man(v)}` : "なし" })), "home", { rerender: true, after: ownCurrent }));
            // 借りたときの内容から写して返し終えている（完済がいまの年齢以下・残高0）なら、そう言う（第11巡 B11-2）
            if (loanPaidOffNow() && !(Number(D.loan.balance) > 0)) {
              const pn = h("p", "note info small", `完済する年齢（${Number(D.loan.endAge)}歳）がいまの年齢以下のため、返し終えたものとして計算しています。まだ返済中なら、完済する年齢といまの残高を選び直してください。選び直したあとで返し終えたものとして計算するには、「入力のしかた」を「借りたときの内容から計算する」に戻してください（この入力のしかたでは、完済する年齢にいまの年齢以下を選べません）。`);
              // 戻る道を言う。以前は案内どおり完済する年齢を選ぶと、返し終えた状態に戻れなかった（2026-10-31 第12巡 C12-軽1）
              pn.id = "loan-current-paid";
              box.appendChild(pn);
            }
          }
          box.appendChild(radios("団体信用生命保険（団信）", D.loan, "dansin", [{ v: "yes", label: "入っている" }, { v: "no", label: "入っていない" }, { v: "unknown", label: "わからない" }], "home", { rerender: false, note: "団信に入っていれば、万一のときにローンの残りがなくなります" }));
          // 残高・返済額・完済年齢の食い違いを知らせる
          const mism = KSC.compute(d).loanMismatch;
          if (mism) { const w = h("p", "note warn small", "⚠ " + mism); w.id = "loan-mismatch"; box.appendChild(w); }
          box.appendChild(sub("繰り上げ返済"));
          // 返し終えている（完済の年齢がいまの年齢以下）なら、繰り上げ返済の欄を出さない。選べる年齢が1つも無く、どれも印付きになっていた。
          // 保存されている「あり」は変えない（計算も入れず、外した予定にも積まない：model/yearly.js の schedule）（2026-10-31 検証 C8-軽2・第9巡 B9-2）
          const paidOff = loanPaidOffNow();
          if (paidOff) box.appendChild(h("p", "note info small", "返し終えているため、繰り上げ返済はありません。"));
          // 「あり」にしたとき、時期のはじめの値（いまの年齢＋何年）が完済の年齢以後なら、完済の年齢−1 に収める。
          // 以前は完済のあとの年が入ったままで、選んだ直後から計算に入らなかった（2026-10-31 検証 B7-1）
          if (!paidOff) box.appendChild(radios("予定", D.loan, "prepayOn", yesNo, "home", { after: (v) => {
            if (v !== "yes") return;
            const p = loanPayoffAge();
            if (Number.isFinite(p) && Number(D.loan.prepayAge) >= p && p - 1 >= age()) D.loan.prepayAge = p - 1;
          } }));
          if (!paidOff && D.loan.prepayOn === "yes") {
            // 選べるのは「完済の年齢−1」まで。完済の年からは残りの返済が無く、繰り上げても何も起きない（model/yearly.js の remainYears）。
            // 完済の年齢は計算と同じもの（model/plan.js の loanEndAge。以前は使っていない D.loan.endAge を見ていた。2026-10-31 検証 B6-6）。
            // 保存値が完済の年齢以後なら印を付ける（notFrom。B7-1）
            const payoff = loanPayoffAge();
            box.appendChild(select("時期（あなたの年齢）", D.loan, "prepayAge", range(age(), Math.max(age(), payoff - 1), 1, (v) => `${v}歳`), "home", { notBefore: age(), notFrom: payoff }));
            box.appendChild(select("繰り上げ返済する金額", D.loan, "prepayAmount", [50, 100, 200, 300, 500, 1000].map((v) => ({ v, label: man(v) })), "home", { note: "期間を短くする形で計算します（利息が減る分は含めていません＝控えめな見積り）" }));
          }
        }
        if (A.home === "rent" || A.home === "plan") {
          box.appendChild(sub("家賃"));
          // 帯を答えたら、下の「毎月の家賃」も帯の目安に合わせる（「わからない」なら地域の平均のまま）
          ask(box, "rent", { after: () => { const m = KSQ.mid("rent", A); if (m != null) D.rent.monthly = m; } });
          box.appendChild(select("毎月の家賃（管理費を含む）", D.rent, "monthly", range(3, 25, 1, (v) => `月${man(v)}`), "home"));
          box.appendChild(select(`更新料（${KSX.rule("rentRenewalEvery")}年ごと）`, D.rent, "renewal", [0, 0.5, 1, 2].map((v) => ({ v, label: v ? `家賃の${v}か月分` : "なし" })), "home"));
        }
        const houseRepair = () => {
          box.appendChild(select("外壁・屋根の塗装：間隔", D.house, "paintEvery", [10, 12, 15, 20].map((v) => ({ v, label: `${v}年ごと` })), "home"));
          box.appendChild(select("外壁・屋根の塗装：1回の費用", D.house, "paintCost", [60, 80, 100, 120, 150, 200].map((v) => ({ v, label: man(v) })), "home"));
          box.appendChild(select("水回り・給湯器の交換：間隔", D.house, "waterEvery", [10, 15, 20].map((v) => ({ v, label: `${v}年ごと` })), "home"));
          box.appendChild(select("水回り・給湯器の交換：1回の費用", D.house, "waterCost", [30, 50, 60, 80, 100, 150].map((v) => ({ v, label: man(v) })), "home"));
        };
        const mansionFee = () => {
          box.appendChild(select("修繕積立金＋管理費", D.mansion, "monthly", range(1, 8, 0.5, (v) => `月${v}万円`), "home"));
          box.appendChild(select(`${KSX.rule("mansionRaiseEvery")}年ごとの値上がり`, D.mansion, "raise", [0, 10, 20, 30, 50].map((v) => ({ v, label: v ? `${v}%ずつ上がる` : "上がらない" })), "home"));
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
            box.appendChild(select("時期（あなたの年齢）", D.rebuild, "age", range(age(), 85, 1, (v) => `${v}歳`), "home", { notBefore: age() }));
            box.appendChild(select("予算", D.rebuild, "budget", [300, 500, 800, 1000, 1500, 2000, 3000].map((v) => ({ v, label: man(v) })), "home"));
          }
        } else {
          box.appendChild(sub("住宅の購入"));
          box.appendChild(radios("予定", D.purchase, "on", yesNo, "home"));
          if (D.purchase.on === "yes") {
            // 住み替えの注記・欄が購入の年齢で変わるので、描き直す（B5-4）
            box.appendChild(select("購入する年齢", D.purchase, "age", range(age(), ageTo(age(), 70), 1, (v) => `${v}歳`), "home", { rerender: true, notBefore: age() }));
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
        // 注記は、購入の予定との順番で出し分ける（計算は model/yearly.js の moveThenBuy・housingCost と同じ判定）。
        //   住み替え→購入：住み替えの住居費は購入の年の前まで。購入の年からは購入した家の費用
        //   同じ年      ：購入した家へ移る想定。住み替えたあとの住居費は1年も使わないので、欄を出さない
        //   購入→住み替え（持ち家・購入の予定なしも）：住み替えの年からは、ここで入れた住居費だけ
        // 以前はいつも「住み替えたあとは、ここで入れた住居費だけで計算します」で、順番によっては計算と食い違っていた
        // （2026-10-31 検証 B5-4・C5-軽1）
        // いまの年齢より前の購入・住み替えは、計算が外す（inSpan）。順番もそれに合わせて決め、
        // 住み替えが外れているときは順番の注記を出さない（2026-10-31 検証 C6-軽1）
        const buyRaw = Number(D.purchase.age);
        const buyAge = !owns() && D.purchase.on === "yes" && buyRaw >= age() ? buyRaw : null;
        const moveAge = Number(D.move.age);
        const movePast = Number.isFinite(moveAge) && moveAge < age();
        const moveOrder = D.move.on !== "yes" || buyAge === null || !Number.isFinite(moveAge) ? "after"
          : moveAge < buyAge ? "beforeBuy" : moveAge === buyAge ? "sameYear" : "after";
        const moveNote = {
          after: "住み替えたあとは、ここで入れた住居費だけで計算します",
          beforeBuy: "購入の年の前までは、ここで入れた住居費で計算します",
          sameYear: "購入した家へ移る想定のため、ここの住居費は使いません",
        }[moveOrder];
        box.appendChild(radios("予定", D.move, "on", yesNo, "home", D.move.on === "yes" ? {} : { note: moveNote }));
        if (D.move.on === "yes") {
          box.appendChild(select("時期（あなたの年齢）", D.move, "age", range(age(), 85, 1, (v) => `${v}歳`), "home", { rerender: true, notBefore: age() }));
          box.appendChild(select("住み替えの費用（引っ越し・初期費用など）", D.move, "cost", [30, 50, 100, 200, 300, 500, 1000].map((v) => ({ v, label: man(v) })), "home"));
          if (movePast) {
            box.appendChild(select("住み替えたあとの住居費", D.move, "monthly", range(0, 25, 1, (v) => (v ? `月${man(v)}` : "なし（実家・持ち家など）")), "home"));
          } else if (moveOrder === "sameYear") {
            const p = h("p", "muted small", moveNote);
            p.dataset.moveNote = moveOrder;
            box.appendChild(p);
          } else {
            const row = select("住み替えたあとの住居費", D.move, "monthly", range(0, 25, 1, (v) => (v ? `月${man(v)}` : "なし（実家・持ち家など）")), "home", { note: moveNote });
            row.lastChild.dataset.moveNote = moveOrder;
            box.appendChild(row);
          }
        }
      },
    },
    {
      key: "edu", title: "教育", show: () => A.kids === "yes" || D.family.planned.length > 0,
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
      key: "car", title: "車",
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
      key: "loans", title: "借入れ（住宅ローン以外）",
      body: (box) => {
        box.appendChild(note("奨学金・自動車ローン・教育ローンなど。住宅ローンは「住まい」で設定します。"));
        const KINDS = [{ v: "shougakukin", label: "奨学金" }, { v: "car", label: "自動車ローン" }, { v: "edu", label: "教育ローン" }, { v: "other", label: "そのほか（カードローンなど）" }];
        D.loans.forEach((l, i) => {
          const card = h("div", "card detail-item");
          card.dataset.item = "loans-" + i;
          card.appendChild(select("種類", l, "kind", KINDS, "loans", { text: true }));
          card.appendChild(select("いまの残高", l, "balance", [0, 10, 30, 50, 100, 200, 300, 500, 800, 1000].map((v) => ({ v, label: man(v) })), "loans"));
          card.appendChild(select("毎月の返済額", l, "monthly", range(0.5, 10, 0.5, (v) => `月${v}万円`), "loans"));
          card.appendChild(select("完済する年齢", l, "endAge", range(age(), 85, 1, (v) => `${v}歳`), "loans"));
          if (l.kind === "shougakukin") card.appendChild(h("p", "muted small", "奨学金は、本人が亡くなったときに返還が免除される制度があります。万一のときの計算には含めていません（条件は貸与元でご確認ください）。"));
          const del = h("button", "linkbtn danger", "この借入れを消す"); del.type = "button"; del.id = "loans-del-" + i;
          del.addEventListener("click", () => { D.loans.splice(i, 1); focusAfterDelete("loans", i); changed("loans", true); });
          card.appendChild(del);
          box.appendChild(card);
        });
        if (D.loans.length < 3) {
          const add = h("button", "btn secondary inline", "＋ 借入れを追加"); add.type = "button"; add.id = "loans-add";
          add.addEventListener("click", () => { D.loans.push({ kind: "shougakukin", balance: 100, monthly: 1.5, endAge: Math.min(85, age() + 10) }); focusAfterAdd("loans", D.loans.length - 1); changed("loans", true); });
          box.appendChild(add);
        }
        if (!D.loans.length && A.otherLoan === "yes") box.appendChild(h("p", "note warn small", "「借入れがある」と答えていますが、まだ設定されていません。0円として計算しています。"));
      },
    },
    {
      key: "assets", title: "貯蓄・投資",
      body: (box) => {
        box.appendChild(select("貯蓄の合計（おおまかに）", A, "savings", opts("savings"), "assets", {
          text: true, answers: true, after: () => { D.assets.cash = null; D.assets.invest = null; delete D.set.assets; },
        }));
        box.appendChild(sub("内訳"));
        box.appendChild(note("内訳を入れると、合計の代わりに内訳で計算します。投資の分だけが「計算の前提」の運用利回りで増える計算です。銘柄名や金融機関名は入力しません。"));
        const vals = [0, 50, 100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000];
        const view = { cash: D.assets.cash ?? (KSQ.mid("savings", A) ?? 300), invest: D.assets.invest ?? 0 };
        const setBoth = () => { D.assets.cash = view.cash; D.assets.invest = view.invest; };
        box.appendChild(select("預貯金", view, "cash", vals.map((v) => ({ v, label: man(v) })), "assets", { after: setBoth, path: "assets" }));
        box.appendChild(select("投資（NISA・iDeCo・投資信託など）", view, "invest", vals.map((v) => ({ v, label: man(v) })), "assets", { after: setBoth, path: "assets" }));
        // 積立額を変えただけでは、貯蓄を「入力済み」にしない（仮の値の注意が消えてしまうため）
        box.appendChild(select(`毎月の積立額（${KSC.DUMMY.pensionAge}歳まで）`, D.assets, "monthly", [0, 0.5, 1, 2, 3, 5, 8, 10].map((v) => ({ v, label: v ? `月${v}万円` : "なし" })), "assets"));
      },
    },
    {
      key: "insurance", title: "加入中の保険",
      body: (box) => {
        // 全部外すと未回答になる。ここで答え直せるよう、答える欄の印を付ける（2026-10-31 検証 C4-軽2）
        box.appendChild(own(checks("入っている保険（複数選べます）", A, "insured", opts("insured"), "insurance", { answers: true, exclusive: KSQ.byId.insured.exclusive }), "insured"));
        ask(box, "insuredDeathBand", { after: () => { D.insurance.death = Number(KSQ.mid("insuredDeathBand", A) || 0); } });
        if (Array.isArray(A.insured) ? KSQ.chosen(KSQ.byId.insured, A.insured).some((x) => x !== "none" && x !== "unknown") : A.insured === "yes") {
          box.appendChild(note("会社名や商品名は入力しません。保険証券や、保険会社から毎年届くお知らせで確認できます。団信は「住まい」で設定します。"));
          box.appendChild(select("死亡保障（あなたが亡くなったときに家族が受け取る額の合計）", D.insurance, "death", [{ v: 0, label: "なし・わからない" }].concat(range(100, 5000, 100, (v) => man(v))), "insurance"));
          box.appendChild(radios("医療保険", D.insurance, "medical", [{ v: "yes", label: "入っている" }, { v: "no", label: "入っていない" }, { v: "unknown", label: "わからない" }], "insurance", { rerender: false }));
          box.appendChild(select("働けなくなったときの保障（月あたり）", D.insurance, "disability", [0, 5, 10, 15, 20, 30].map((v) => ({ v, label: v ? `月${man(v)}` : "なし・わからない" })), "insurance"));
        }
      },
    },
    {
      key: "spend", title: "旅行・大きな出費",
      body: (box) => {
        // 旅行を見込むようにしたとき、「何歳まで」のはじめの値がいまの年齢以下なら、選べる最初の年齢に収める（繰り上げ返済の B7-1 と同じ）
        const travelOpts = () => range(60, 85, 5, (v) => `${v}歳まで`).filter((o) => o.v > age());
        box.appendChild(select("毎年の旅行・レジャー", D.spend, "travel", [0, 10, 20, 30, 50, 80, 100].map((v) => ({ v, label: v ? `年${man(v)}` : "特に見込まない" })), "spend", { rerender: true, after: (v) => {
          const first = travelOpts()[0];
          if (Number(v) > 0 && first && Number(D.spend.travelUntil) <= age()) D.spend.travelUntil = first.v;
        } }));
        // 「何歳まで」がいまの年齢以下だと、旅行は1年も計算に入らない（model/yearly.js の expenseTravelAt）。
        // 選べるのは、いまの年齢より後だけ。保存値が過ぎていれば、ほかの欄と同じ形の印を付ける（保存値は勝手に変えない。2026-10-31 A8-2）
        const travelPast = (v) => (v <= age() ? { kind: "past", text: "いまの年齢で終わっているため、計算に入れていません。選び直してください" } : null);
        if (Number(D.spend.travel) > 0) box.appendChild(select("何歳まで", D.spend, "travelUntil", travelOpts(), "spend", { mark: travelPast }));
        box.appendChild(sub("一時的な大きな出費（最大3件）"));
        const LABELS = ["記念の旅行", "趣味", "結婚式の援助", "家電・家具の買い替え", "リフォーム以外の住まいの出費", "その他"];
        D.spend.items.forEach((it, i) => {
          const card = h("div", "card detail-item");
          card.dataset.item = "spend-" + i;
          card.appendChild(select("内容", it, "label", LABELS.map((v) => ({ v, label: v })), "spend", { text: true }));
          // いまの年齢より前の出費は計算に入らない（model/yearly.js の inSpan）。印を付ける（2026-10-31 検証 C7-軽3）
          card.appendChild(select("時期（あなたの年齢）", it, "age", range(age(), 90, 1, (v) => `${v}歳`), "spend", { notBefore: age() }));
          card.appendChild(select("金額", it, "amount", [30, 50, 100, 200, 300, 500, 1000].map((v) => ({ v, label: man(v) })), "spend"));
          const del = h("button", "linkbtn danger", "この出費を消す"); del.type = "button"; del.id = "spend-del-" + i;
          del.addEventListener("click", () => { D.spend.items.splice(i, 1); focusAfterDelete("spend", i); changed("spend", true); });
          card.appendChild(del);
          box.appendChild(card);
        });
        if (D.spend.items.length < 3) {
          const add = h("button", "btn secondary inline", "＋ 出費を追加"); add.type = "button"; add.id = "spend-add";
          add.addEventListener("click", () => { D.spend.items.push({ label: "記念の旅行", age: Math.min(90, age() + 5), amount: 100 }); focusAfterAdd("spend", D.spend.items.length - 1); changed("spend", true); });
          box.appendChild(add);
        }
      },
    },
    {
      key: "assumptions", title: "計算の前提",
      body: (box) => {
        const as = d.assumptions;
        box.appendChild(radios("物価の上昇率（年）", as, "inflation", [0, 1, 2].map((v) => ({ v, label: `${v}%` })), "assumptions", { rerender: false }));
        // どの費目に物価上昇を掛けるか。**返済は選択肢に出さない**（契約した額のまま変わらないため）。
        // 選択肢は保存データの検査と同じ KS.INFLATION_TARGETS。
        // まだ選んでいなければ、正本（data/assumptions.json）の既定に印を付けて**見せるだけ**にし、
        // 利用者が選んだときにだけ保存する。以前は開いただけで既定を書き込み、
        // 既定が読めないときは [] を焼き付けて「掛けているのは です。」になっていた（2026-10-31 検証 D2-L1）
        const def = (((window.KSDATA || {}).assumptions || {}).defaults || {}).inflationTargets;
        const infView = { on: Array.isArray(as.inflationOn) ? as.inflationOn.slice() : Array.isArray(def && def.value) ? def.value.slice() : [] };
        box.appendChild(checks("物価の上昇を掛ける費目", infView, "on", KS.INFLATION_TARGETS.map((t) => ({ v: t.v, label: t.label })), "assumptions", {
          rerender: false,
          after: (v) => { as.inflationOn = v.slice(); },
          // 文は説明の層（介護の費用も据え置きであることを含む。2026-10-31 K3）
          note: KSX.inflationScopeNote() }));
        box.appendChild(radios("運用利回り（年）", as, "ret", [0, 1, 3].map((v) => ({ v, label: `${v}%` })), "assumptions", { rerender: false, note: "運用成果は保証されません。見通しの天気は、いつも運用しない場合で判定します。" }));
        // 下限＞上限は保存させない（結果の「前提を変える」と同じ検査・同じ文言）。
        // 以前はそのまま保存でき、幅が逆さまのまま計算していた（2026-10-31 検証 C1）
        const RATIO_ERR = "下限は上限以下にしてください。";
        box.appendChild(select("万一のときの遺族の生活費（下限）", as, "ratioLow", [60, 70, 80, 90, 100].map((v) => ({ v, label: `現在の${v}%` })), "assumptions",
          { check: (v) => (v > Number(as.ratioHigh) ? RATIO_ERR : null) }));
        box.appendChild(select("万一のときの遺族の生活費（上限）", as, "ratioHigh", [60, 70, 80, 90, 100].map((v) => ({ v, label: `現在の${v}%` })), "assumptions",
          { check: (v) => (v < Number(as.ratioLow) ? RATIO_ERR : null) }));
      },
    },
  ];

  // 節のバッジ。まだ答えていない「かんたん」の質問の欄がある節は「未回答あり」（設定済みでも）。
  // 以前は「目安で計算中」と出て、答えないと結果が出ない節なのに、目安で計算できているように見えた（2026-10-31 検証 B5-6）
  // かんたんの質問の欄を隠す使い方（hideAnswers：直前の画面で聞いている）では、ここで答えられないので出さない
  const sectionHasUnanswered = (key) => !hideAnswers && Object.keys(ASK).some((qid) => ASK[qid].section === key && needsAnswer(qid));
  function badgeOf(key) {
    if (sectionHasUnanswered(key)) return { cls: "badge warn", text: "未回答あり" };
    return D.set[key] ? { cls: "badge set", text: "設定済み" } : { cls: "badge warn", text: "目安で計算中" };
  }

  // いま出すべき節（回答によって出ない節がある）
  const visibleSections = () => SECTIONS.filter((s) => (!s.show || s.show()) && (!only || only.includes(s.key)));

  function renderSections(root) {
    const focusId = document.activeElement && document.activeElement.id;
    uid = 0; // 描き直しても同じ id になるように
    root.replaceChildren();
    if (flat) {
      visibleSections().forEach((s) => {
        const box = h("div", "detail-flat");
        box.dataset.key = s.key;
        const isSet = !!D.set[s.key];
        const head = h("p", "detail-flat-head");
        head.appendChild(h("span", null, s.title + " "));
        const bv = badgeOf(s.key);
      const badge = h("span", bv.cls, bv.text);
        badge.dataset.status = s.key;
        head.appendChild(badge);
        box.appendChild(head);
        const body = h("div", "body");
        s.body(body);
        if (isSet) {
          const reset = h("button", "linkbtn", "一般的な目安に戻す"); reset.type = "button"; reset.id = "reset-" + s.key;
          reset.addEventListener("click", () => { focusSection(s.key); resetSection(s.key); });
          body.appendChild(reset);
        }
        box.appendChild(body);
        root.appendChild(box);
      });
      restoreFocus(root, focusId);
      return;
    }
    visibleSections().forEach((s) => {
      const det = h("details", "fold");
      det.dataset.key = s.key;
      det.open = openAll || openState.has(s.key);
      det.addEventListener("toggle", () => { det.open ? openState.add(s.key) : openState.delete(s.key); });
      const sum = h("summary");
      const t = h("span", null, s.title + " ");
      const isSet = !!D.set[s.key];
      const bv = badgeOf(s.key);
      const badge = h("span", bv.cls, bv.text);
      badge.dataset.status = s.key;
      t.appendChild(badge);
      sum.appendChild(t);
      det.appendChild(sum);
      const body = h("div", "body");
      s.body(body);
      if (isSet) {
        const reset = h("button", "linkbtn", "一般的な目安に戻す"); reset.type = "button"; reset.id = "reset-" + s.key;
        reset.addEventListener("click", () => { focusSection(s.key); resetSection(s.key); });
        body.appendChild(reset);
      }
      det.appendChild(body);
      root.appendChild(det);
    });
    restoreFocus(root, focusId);
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
    const at65 = p.find((x) => x.age === KSC.DUMMY.pensionAge) || p[p.length - 1];
    const counts = { sun: 0, cloud: 0, rain: 0 };
    r.forecast.forEach((f) => { counts[f.weather] += 1; });
    const items = [
      [`${at65.age}歳時点の貯蓄`, man(at65.balance)],
      ["貯蓄が底をつく時期", r.sim0.shortageAge !== null ? `⚠ ${r.sim0.shortageAge}歳ごろ` : `${KSC.DUMMY.endAge}歳までプラス`],
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
      // 必須なのにまだ答えていない質問。section があるものは、この画面に答える欄がある（ask）
      unanswered() {
        return KSQ.visible(A).filter((q) => q.required && !KSQ.isAnswered(q, A))
          .map((q) => ({ id: q.id, name: ASK[q.id] ? ASK[q.id].name : KSQ.labelOf(q, A), section: ASK[q.id] ? ASK[q.id].section : null }));
      },
      // 答える欄へ移る（閉じた節は開く）
      focusAsk(qid) {
        if (!mounted) return false;
        const row = mounted.querySelector(`[data-ask="${qid}"]`);
        if (!row) return false;
        const det = row.closest("details");
        if (det && !det.open) det.open = true;
        row.scrollIntoView({ block: "center" });
        const el = row.querySelector("select, input");
        if (el) el.focus({ preventScroll: true });
        return true;
      },
      // 画面の流れを組み立てる側が、どの節をいくつ出すかを知るために使う。
      // **中身が空になる節は返さない。** hideAnswers でかんたんの質問だけの節は空になり、
      // そのままだと「何も入れる欄がない画面」が流れに挟まってしまう
      sections() {
        return visibleSections().map((s) => {
          const keep = uid;
          let n = 1;   // 下見に失敗したら「中身はある」とみなす（隠すより出すほうが安全）
          try {
            const probe = document.createElement("div");
            s.body(probe);
            // **隠した欄は数えない。** かんたんの質問と重なる欄しか無い節（保険を
            // 「入っていない」と答えた場合など）が、入力欄のない空の画面として
            // 流れに挟まっていた（2026-10-03。チャットとの食い違いで発覚）
            n = [...probe.querySelectorAll("select, input, textarea")]
              .filter((x) => !x.closest("[hidden]")).length;
          } catch (e) {
            // 節の中身は計算（KSC.compute）を呼ぶものもあり、回答の途中では落ちることがある。
            // ここで例外を外に出すと、呼び出し側の処理（回答の保存）まで止まる
            n = 1;
          }
          uid = keep;   // 下見で id を進めない（本番の描画と id がずれる）
          return n > 0 ? { key: s.key, title: s.title } : null;
        }).filter(Boolean);
      },
    };
  }

  // くわしく入力で答えを変えると必須になる「かんたん」の質問と、答える欄を出す節（C3-1）。
  // always: 答え終わっていても出す（この画面にほかに変える所が無い・以前から出していた）
  const ASK = Object.freeze({
    income: { section: "work", label: "年収（額面・税込）", name: "年収", always: true },
    selfVary: { section: "work", label: "収入は年によって変わるか", name: "収入の波", always: true },
    rent: { section: "home", label: "毎月の家賃（おおまかに）", name: "家賃" },
    insuredDeathBand: { section: "insurance", label: "亡くなったときに出る保険金（おおまかに）", name: "亡くなったときに出る保険金" },
    kidPlanIn: { section: "family", label: "お子さんの予定の時期", name: "お子さんの予定の時期" },
    // own: 欄は節の中で作る（ask では作らない）。未回答なら節を開き、「答えていない欄へ」で移れる
    spouseAge: { section: "family", name: "配偶者の年齢", own: true },          // R4
    spouseWork: { section: "spouseWork", name: "配偶者の働き方", own: true },   // R4
    spouseIncome: { section: "spouseWork", name: "配偶者の年収", own: true },   // R4
    insured: { section: "insurance", name: "入っている保険", own: true },       // C4-軽2
  });

  window.KSD = { build, ASKABLE: Object.freeze(Object.keys(ASK)) };
})();
