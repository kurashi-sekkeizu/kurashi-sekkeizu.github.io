/* くらしの設計図 共通処理
 * 入力値は sessionStorage（既定）／localStorage（利用者が選んだ場合のみ）に保存し、送信しない。
 * URL のクエリ・ハッシュに入力値を載せない。
 */
(function () {
  "use strict";

  const KEY = "kurashi-sekkeizu:v1";
  const VERSION = 1;

  function storageOk(getter) {
    try {
      const s = getter();
      s.setItem("__ks_test", "1");
      s.removeItem("__ks_test");
      return true;
    } catch (e) {
      return false;
    }
  }
  const hasSession = storageOk(() => window.sessionStorage);
  const hasLocal = storageOk(() => window.localStorage);
  let memory = null;

  function empty() {
    return {
      version: VERSION,
      meta: { mode: "step", depth: "simple", persist: "session", pos: null, done: [] },
      answers: {},
      // 物価の上昇を掛ける費目（inflationOn）は、**ここで入れない。**
      // この画面は data.js を読み込まないことがあり（/soudan/ の開始画面）、
      // ここで既定を作ると window.KSDATA が無い状態の値が記録に焼き付いてしまう。
      // 実際、利用者が選んでいないのに「生活費だけ」が保存され、
      // /assumptions/ の表示（6費目）と計算が食い違っていた（2026-10-03）。
      // 入っていなければ calc.js が data/assumptions.json の既定を使う
      assumptions: { inflation: 1, ret: 0, ratioLow: 70, ratioHigh: 80 },
      pdf: { sections: ["todo", "plan", "estimate", "review", "ask"], note: "" },
    };
  }

  // ── 保存データの中身の検査 ──
  // 外側の形だけを見ていたため、中の型違い（worries が文字列、年齢が "abc"、前提が 1e9 など）で
  // 計算が例外を出し、画面が真っ白のまま戻れなくなっていた（2026-10-31 検証 D4）。
  // 壊れていれば "broken" を返し、「前回の内容を読み込めませんでした」の流れに乗せる
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const num = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
  const inRange = (v, lo, hi) => { const n = num(v); return Number.isFinite(n) && n >= lo && n <= hi; };
  const strArray = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
  // 範囲は画面の選択肢の範囲（質問・くわしく入力・前提を変える）。画面で選べない値は壊れているとみなす
  const AGE_MIN = 18, AGE_MAX = 80, KID_AGE_MAX = 25, PCT_MAX = 100;
  const ASSUMPTION_RANGE = { inflation: [0, 10], ret: [0, 10], ratioLow: [0, PCT_MAX], ratioHigh: [0, PCT_MAX] };
  // 「今日考えたいこと」(fields) の質問は 2026-11-01 に廃止。古い保存データに fields が残っていても、無視して読む（型も見ない）
  const MULTI = ["worries", "insured", "selfPension"];

  function answersOk(a) {
    if ("age" in a && a.age != null && !(inRange(a.age, AGE_MIN, AGE_MAX) && Number.isInteger(num(a.age)))) return false;
    if ("spouseAge" in a && a.spouseAge != null && !inRange(a.spouseAge, AGE_MIN, AGE_MAX)) return false;
    if ("kidsAges" in a && a.kidsAges != null &&
      !(Array.isArray(a.kidsAges) && a.kidsAges.every((x) => x === null || inRange(x, 0, KID_AGE_MAX)))) return false;
    if (MULTI.some((k) => k in a && a[k] != null && !strArray(a[k]))) return false;
    // 質問定義が読み込まれている画面では、選択肢に無い値も壊れているとみなす
    const Q = window.KSQ;
    if (Q && Q.byId) {
      for (const k of Object.keys(a)) {
        const q = Q.byId[k];
        const v = a[k];
        if (!q || v === null || v === undefined || v === "" || !q.options) continue;
        // 都道府県の選択肢は公的データから作るので、データが読めない画面では空になる。
        // 文字列であることだけを見る（ここで壊れた扱いにすると、データ障害で答えまで消える）
        if (q.type === "select" && q.text) { if (typeof v !== "string") return false; continue; }
        // 複数選ぶ質問も、選択肢に無い値は壊れているとみなす（2026-10-31 K7）
        if (q.type === "multi") {
          if (!Array.isArray(v) || !v.every((x) => q.options.some((o) => String(o.v) === String(x)))) return false;
          continue;
        }
        if (q.type === "single" || q.type === "select") {
          if (Array.isArray(v) && v.length === 0) continue;   // 飛ばした任意の質問は [] で保存される
          if (!q.options.some((o) => String(o.v) === String(v))) return false;
        }
      }
    }
    return true;
  }

  // ── くわしく入力の値の範囲（**ここが1か所の定義**。2026-10-31 検証 D2-M1）──
  // 以前は「数か」しか見ておらず、車の買い替え間隔0でページが落ち、塗装の間隔0・介護の期間1e12で固まり、
  // "abc" で NaN の雨になっていた。detail.js の選択肢もこの範囲の中だけを出す（外れた選択肢は出さず、
  // data-out-of-range の印を付ける。tests/invariants.html R92 が印の無いことを確かめる）。
  // 範囲は「画面で選べる値」より広くとる（古い版の選択肢・はじめの値を壊れた扱いにしないため）
  const N = (min, max, int) => ({ min, max, int: Boolean(int) });
  const AGE = N(18, 110, true);       // 人の年齢（定年・何歳まで・出来事の時期）
  const LUMP = N(0, 100000);          // まとまった金額（万円）。10億円まで
  const FLOW = N(0, 1000);            // 月あたり・年あたりの金額（万円）
  const EVERY = N(1, 100, true);      // 間隔・期間（年）。0 だと計算が終わらない
  const AFTER = N(0, 100, true);      // 何年後・築年数
  const PCT = N(0, 100);
  const RATE = N(0, 20);              // 金利（年%）
  const oneOf = (...v) => ({ oneOf: v });
  const YESNO = oneOf("yes", "no");
  const PUBPRI = oneOf("public", "private");
  const GROWTH = oneOf("stat", "flat", "up", "down");
  const DETAIL_LIMITS = {
    "family.planned[].inYears": N(0, 30, true),
    "care.on": YESNO, "care.startAge": AGE, "care.years": EVERY, "care.monthly": FLOW,
    "living.*": FLOW, "retire.ratio": PCT,
    "work.retireAge": AGE, "work.rehire": PCT, "work.rehireUntil": AGE, "work.allowance": LUMP, "work.change": YESNO,
    "work.changeAge": AGE, "work.changeIncome": { question: "income" }, "work.growth": GROWTH, "work.pension": FLOW,
    "work.side": FLOW, "work.sideUntil": AGE,
    "spouseWork.growth": GROWTH, "spouseWork.plan": oneOf("same", "leave", "quit", "return"), "spouseWork.planFrom": AFTER,
    "spouseWork.planYears": EVERY, "spouseWork.planRate": PCT, "spouseWork.returnIncome": { question: "spouseIncome" },
    "spouseWork.retireAge": AGE, "spouseWork.pension": FLOW,
    "kids[].kinder": PUBPRI, "kids[].elem": PUBPRI, "kids[].junior": PUBPRI, "kids[].high": PUBPRI,
    "kids[].univ": oneOf("none", "national", "privArts", "privSci", "vocational"), "kids[].away": oneOf("home", "away"),
    "kids[].lessons": FLOW, "kids[].lessonsUntil": N(0, 30, true),
    "cars[].nextIn": AFTER, "cars[].budget": LUMP, "cars[].interval": EVERY, "cars[].upkeep": FLOW, "cars[].until": AGE,
    "loan.input": oneOf("origin", "current"), "loan.borrowed": LUMP, "loan.years": N(1, 50, true), "loan.startedAgo": N(0, 50, true),
    "loan.rate": RATE, "loan.monthly": FLOW, "loan.endAge": AGE, "loan.balance": LUMP, "loan.dansin": oneOf("yes", "no", "unknown"),
    "loan.bonus": FLOW, "loan.currentAuto": oneOf(true, false), "loan.prepayOn": YESNO, "loan.prepayAge": AGE, "loan.prepayAmount": LUMP,
    "rent.monthly": FLOW, "rent.renewal": N(0, 12),
    "move.on": YESNO, "move.age": AGE, "move.cost": LUMP, "move.monthly": FLOW,
    "assets.cash": Object.assign({ nullable: true }, LUMP), "assets.invest": Object.assign({ nullable: true }, LUMP), "assets.monthly": FLOW,
    "loans[].kind": oneOf("shougakukin", "car", "edu", "other"), "loans[].balance": LUMP, "loans[].monthly": FLOW, "loans[].endAge": AGE,
    "insurance.death": LUMP, "insurance.medical": oneOf("yes", "no", "unknown"), "insurance.disability": FLOW,
    "house.built": AFTER, "house.paintEvery": EVERY, "house.paintCost": LUMP, "house.waterEvery": EVERY, "house.waterCost": LUMP, "house.tax": FLOW,
    "mansion.built": AFTER, "mansion.monthly": FLOW, "mansion.raise": PCT, "mansion.tax": FLOW,
    "purchase.on": YESNO, "purchase.age": AGE, "purchase.type": oneOf("house", "mansion"), "purchase.price": LUMP, "purchase.down": LUMP,
    "purchase.years": N(1, 50, true), "purchase.rate": RATE, "purchase.cost": LUMP,
    "rebuild.on": YESNO, "rebuild.age": AGE, "rebuild.budget": LUMP,
    "spend.travel": FLOW, "spend.travelUntil": AGE, "spend.items[].label": { text: 40 }, "spend.items[].age": AGE, "spend.items[].amount": LUMP,
  };
  // 並びの件数の上限（画面で足せるのは借入れ・出費3件、予定の子2人、車2台。古い版の余裕をみて広めにとる）
  const DETAIL_LISTS = { "kids": 10, "cars": 5, "loans": 10, "family.planned": 5, "spend.items": 10 };
  // 入れ物（節）であるはずの所。null や文字なら壊れている
  const DETAIL_OBJECTS = ["family", "care", "living", "retire", "work", "spouseWork", "loan", "rent", "move", "assets",
    "insurance", "house", "mansion", "purchase", "rebuild", "spend"];
  const BAD_KEYS = ["__proto__", "constructor", "prototype"];

  function detailLimit(path) {
    if (DETAIL_LIMITS[path]) return DETAIL_LIMITS[path];
    const dot = path.lastIndexOf(".");
    return dot > 0 ? DETAIL_LIMITS[path.slice(0, dot) + ".*"] || null : null;
  }
  // 1つの値が範囲に入っているか。範囲の定義が無い項目（新しい版で足した項目など）は見ない
  function detailValueOk(path, v) {
    const L = detailLimit(path);
    if (!L) return true;
    if (v === null || v === undefined) return Boolean(L.nullable) || v === undefined;
    if (L.oneOf) return L.oneOf.includes(v);
    if (L.text) return typeof v === "string" && v.length <= L.text;
    if (L.question) {
      if (typeof v !== "string") return false;
      const q = window.KSQ && window.KSQ.byId && window.KSQ.byId[L.question];
      return !q || q.options.some((o) => String(o.v) === v);
    }
    if (typeof v !== "number" && typeof v !== "string") return false;
    const n = num(v);
    return Number.isFinite(n) && n >= L.min && n <= L.max && (!L.int || Number.isInteger(n));
  }
  // 入れ物の中を見る。戻り値は、外れた所の名前（無ければ null）
  function detailWhy(det) {
    if (det === undefined || det === null) return null;
    if (!isObj(det)) return "detail";
    if ("set" in det) {
      if (!isObj(det.set)) return "set";
      const bad = Object.keys(det.set).find((k) => BAD_KEYS.includes(k) || typeof det.set[k] !== "boolean");
      if (bad !== undefined) return "set." + bad;
    }
    const walk = (obj, prefix) => {
      for (const k of Object.keys(obj)) {
        const p = prefix ? prefix + "." + k : k;
        if (BAD_KEYS.includes(k)) return p;
        const v = obj[k];
        if (p in DETAIL_LISTS) {
          if (!Array.isArray(v) || v.length > DETAIL_LISTS[p]) return p;
          for (const x of v) {
            if (!isObj(x)) return p + "[]";
            const w = walk(x, p + "[]");
            if (w) return w;
          }
        } else if (!prefix && DETAIL_OBJECTS.includes(k)) {
          if (!isObj(v)) return p;
          const w = walk(v, p);
          if (w) return w;
        } else if (prefix && !detailValueOk(p, v)) return p;
      }
      return null;
    };
    return walk(det, "");
  }
  function detailOk(det) { return detailWhy(det) === null; }

  // 物価の上昇を掛けられる費目（くわしく入力の選択肢と、保存データの検査の両方で使う）。
  // **返済は入れない**（契約した額のまま変わらない。CLAUDE.md §5）
  const INFLATION_TARGETS = [
    { v: "living", label: "生活費" }, { v: "rent", label: "家賃" }, { v: "tax", label: "固定資産税" },
    { v: "edu", label: "教育費" }, { v: "car", label: "車の維持費" }, { v: "other", label: "旅行・大きな出費" },
  ];
  function assumptionsOk(as) {
    for (const [k, [lo, hi]] of Object.entries(ASSUMPTION_RANGE)) {
      if (k in as && !inRange(as[k], lo, hi)) return false;
    }
    // 下限＞上限は画面で保存させていない（D2-M1）
    if ("ratioLow" in as && "ratioHigh" in as && num(as.ratioLow) > num(as.ratioHigh)) return false;
    if ("inflationOn" in as && as.inflationOn != null &&
      !(strArray(as.inflationOn) && as.inflationOn.every((x) => INFLATION_TARGETS.some((t) => t.v === x)))) return false;
    return true;
  }

  function metaOk(m) {
    if ("done" in m && !Array.isArray(m.done)) return false;
    if ("pos" in m && m.pos !== null && typeof m.pos !== "string") return false;
    if ("depth" in m && m.depth !== "simple" && m.depth !== "detail") return false;
    if ("persist" in m && m.persist !== "session" && m.persist !== "local") return false;
    return true;
  }

  function pdfOk(p) {
    if ("sections" in p && !strArray(p.sections)) return false;
    if ("note" in p && typeof p.note !== "string") return false;
    return true;
  }

  // 戻り値: データ／null（無し）／"broken"（形式違い・破損）
  function parse(raw) {
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      if (!isObj(d) || d.version !== VERSION) return "broken";
      if (!isObj(d.answers) || !isObj(d.meta) || !isObj(d.assumptions) || !isObj(d.pdf)) return "broken";
      // 遺族の生活費の下限＞上限は、入れ替えて読み込む。公開中の版（結果の「前提を変える」）で保存できた形で、
      // 壊れた扱いにすると、ほかの答えまで全部消えていた（2026-10-31 検証 D3-軽3）。範囲の外は今までどおり壊れた扱い
      const as = d.assumptions;
      if (inRange(as.ratioLow, 0, PCT_MAX) && inRange(as.ratioHigh, 0, PCT_MAX) && num(as.ratioLow) > num(as.ratioHigh)) {
        const t = as.ratioLow;
        as.ratioLow = as.ratioHigh;
        as.ratioHigh = t;
      }
      if (!answersOk(d.answers) || !metaOk(d.meta) || !assumptionsOk(d.assumptions) || !pdfOk(d.pdf)) return "broken";
      if (!detailOk(d.detail)) return "broken";
      // 足りない項目は既定で補う（古い保存データで画面が止まらないように）
      const base = empty();
      return Object.assign(base, d, {
        meta: Object.assign(base.meta, d.meta),
        assumptions: Object.assign(base.assumptions, d.assumptions),
        pdf: Object.assign(base.pdf, d.pdf),
      });
    } catch (e) {
      return "broken";
    }
  }

  // 壊れた保存データを消したことを、開始画面へ伝える（消したあとでは開始画面が気づけないため）
  const BROKEN_FLAG = "ks-broken";
  function markBroken() {
    try { if (hasSession) sessionStorage.setItem(BROKEN_FLAG, "1"); } catch (e) { /* 伝えられなくても続ける */ }
  }
  function takeBrokenFlag() {
    try {
      if (!hasSession || !sessionStorage.getItem(BROKEN_FLAG)) return false;
      sessionStorage.removeItem(BROKEN_FLAG);
      return true;
    } catch (e) { return false; }
  }

  // ── 別のタブでの削除（2026-10-31 検証 C3-5）──
  // 端末に保存した内容を別のタブで削除しても、開いたままのタブが次の save で localStorage に書き戻していた。
  // 削除したら印（DELETED_KEY）を localStorage に置き、ほかのタブは
  //   ① storage イベントで知って、自分の写しを消して開始画面へ移る
  //   ② イベントが届かなかった（止まっていた）場合も、save で印が変わっていれば書かない
  //   ③ 読み込み直したタブは、「端末に保存」のはずの内容が端末に無く印があれば、写しを使わない
  // 印の値は削除ごとに変わる。このページが知っている印（seenDeleted）と違えば「よそで削除された」
  //
  // 2026-10-31 検証 C4-中1・D4-軽2 で絞った：
  //   ・印を置くのは、端末保存（localStorage）を実際に消したときだけ（このタブだけの相談を消しても置かない）
  //   ・印に反応するのは、自分が「端末に保存」の相談のときだけ。このタブだけの相談は、別のタブの削除で消さない
  //   ・③ の判定は「最後に保存したときに見ていた印（SEEN_KEY）」と比べる。印が残っているだけでは消さない。
  //     以前は印が「ある」だけで消していたため、何日も前の削除の印が、別のタブの「最初からはじめる」の
  //     あとの読み直しで端末保存の相談を消していた（印が役目を終えない）
  const DELETED_KEY = "ks-deleted";
  const SEEN_KEY = "ks-deleted-seen";   // sessionStorage。このタブが最後に保存したときの印（無ければ ""）
  const readDeleted = () => { try { return hasLocal ? localStorage.getItem(DELETED_KEY) : null; } catch (e) { return null; } };
  let seenDeleted = readDeleted();
  const deletedElsewhere = () => { const v = readDeleted(); return v !== null && v !== seenDeleted; };
  function forgetHere() {
    memory = null;
    if (hasSession) { try { sessionStorage.removeItem(KEY); sessionStorage.removeItem("ks-open-section"); sessionStorage.removeItem(SEEN_KEY); } catch (e) { /* 消せなくても続ける */ } }
  }
  function toStartIfConsulting() {
    if (location.pathname.indexOf("/soudan/") === 0) location.replace("/soudan/");
  }
  // このタブの相談が「端末に保存」か（このタブの写し → 画面の中の写しの順に見る）
  function persistsLocal() {
    let d = null;
    if (hasSession) { try { const p = parse(sessionStorage.getItem(KEY)); if (p && p !== "broken") d = p; } catch (e) { /* 読めなければ次へ */ } }
    if (!d) d = memory;
    return !!(d && d.meta && d.meta.persist === "local");
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== DELETED_KEY || e.newValue === null || e.newValue === seenDeleted) return;
    seenDeleted = e.newValue;
    if (!persistsLocal()) return;   // このタブだけの相談は、別のタブの削除で消さない（C4-中1）
    forgetHere();
    toStartIfConsulting();
  });

  function load() {
    let data = null;
    let broken = false;
    if (hasSession) {
      const p = parse(sessionStorage.getItem(KEY));
      if (p === "broken") { broken = true; sessionStorage.removeItem(KEY); } else data = p;
    }
    if (!data && hasLocal) {
      const p = parse(localStorage.getItem(KEY));
      if (p === "broken") { broken = true; localStorage.removeItem(KEY); } else data = p;
    }
    if (broken) markBroken();
    // ③ 「端末に保存」の写しなのに端末に無く、最後に保存したあとで削除の印が変わった → 別のタブで削除された。
    //    写しを使わない。印が変わっていなければ、別のタブの「最初からはじめる」で端末から消えただけなので使う（D4-軽2）
    if (data && data.meta.persist === "local" && hasLocal && readDeleted() !== null) {
      let inLocal = true;
      try { inLocal = localStorage.getItem(KEY) !== null; } catch (e) { /* 読めなければ使う */ }
      let seenAtSave = null;   // 記録の無い写し（この直しより前に保存したもの）は、消された側に倒す
      if (hasSession) { try { seenAtSave = sessionStorage.getItem(SEEN_KEY); } catch (e) { /* 同上 */ } }
      if (!inLocal && seenAtSave !== readDeleted()) { forgetHere(); data = null; }
    }
    if (!data && memory) data = memory;
    return { data: data || empty(), existed: !!data, broken };
  }

  // 相談の各画面から呼ぶ。保存データが壊れていたら開始画面へ移り、そこで「読み込めませんでした」を出す
  // 質問の定義（questions.js）が読めないときも、真っ白にせず理由を出す（2026-10-31 検証 D2-L2）。
  // 相談の画面はどれも質問の定義を使うので、ここでまとめて確かめる
  function loadOrRestart() {
    const w = load();
    if (w.broken) {
      location.replace("/soudan/");
      return null;
    }
    if (!window.KSQ || !window.KSQ.byId) {
      showCalcFailure(null, new Error("questions.js を読み込めませんでした"), PARTS_FAIL_MSG);
      return null;
    }
    return w;
  }

  // ── 公的データ・計算の部品が読めないとき（2026-10-31 検証 D2）──
  // 以前は例外で止まり、結果は真っ白、PDF は白紙を印刷でき、くわしく入力は途中で止まっていた。
  // 試算は出さず（CLAUDE.md §5）、理由を画面に出す
  const CALC_FAIL_MSG = "公的データを読み込めませんでした。試算は行いません。";
  const PARTS_FAIL_MSG = "画面の部品を読み込めませんでした。試算は行いません。通信の状態を確かめて、ページを読み込み直してください。";
  function calcReady() {
    return Boolean(window.KSDATA && window.KSC && typeof window.KSC.compute === "function" &&
      typeof window.KSC.dataReady === "function" && window.KSC.dataReady());
  }
  function showCalcFailure(where, err, msg) {
    const host = where || document.querySelector("main");
    if (!host || host.querySelector(".calc-failed")) return;
    const p = document.createElement("p");
    p.className = "note warn calc-failed";
    p.setAttribute("role", "alert");
    p.textContent = msg || CALC_FAIL_MSG;
    host.insertBefore(p, host.firstChild);
    if (err && window.console) console.error(err);   // 原因を追えるように残す（画面には出さない）
  }

  function save(d) {
    // ② 別のタブで削除されたあとは書き戻さない（このタブの写しも消し、開始画面へ）
    //    止めるのは、端末に保存していた相談のときだけ。このタブだけの相談は、印を受け取って続ける（C4-中1）
    if (deletedElsewhere()) {
      const wasLocal = persistsLocal();
      seenDeleted = readDeleted();
      if (wasLocal) {
        forgetHere();
        toStartIfConsulting();
        return false;
      }
    }
    memory = d;
    const raw = JSON.stringify(d);
    if (hasSession) {
      try {
        sessionStorage.setItem(KEY, raw);
        sessionStorage.setItem(SEEN_KEY, seenDeleted === null ? "" : seenDeleted);
      } catch (e) { /* 容量不足等は保存なしで続行 */ }
    }
    if (hasLocal) {
      try {
        if (d.meta.persist === "local") localStorage.setItem(KEY, raw);
        else localStorage.removeItem(KEY);
      } catch (e) { /* 同上 */ }
    }
  }

  function hasSavedLocal() {
    if (!hasLocal) return false;
    const p = parse(localStorage.getItem(KEY));
    return !!p && p !== "broken";
  }

  // 端末に保存した内容だけを読む（「前回の続きから」で使う）
  function loadLocal() {
    if (!hasLocal) return null;
    const d = parse(localStorage.getItem(KEY));
    return d && d !== "broken" ? d : null;
  }

  function clearAll() {
    memory = null;
    if (hasSession) {
      sessionStorage.removeItem(KEY);
      sessionStorage.removeItem("ks-open-section");
      sessionStorage.removeItem(SEEN_KEY);
    }
    if (hasLocal) localStorage.removeItem(KEY);
  }
  // 利用者が「削除」を選んだとき。消したうえで、ほかのタブに知らせる印を置く（C3-5）。
  // 「最初からはじめる」の clearAll では印を置かない（ほかのタブの、このタブだけの答えまで消さないため）
  // 印を置くのは、端末保存を実際に消したときだけ（C4-中1）。このタブだけの相談を消しても、ほかのタブには知らせない
  function deleteAll() {
    let hadLocal = false;
    if (hasLocal) { try { hadLocal = localStorage.getItem(KEY) !== null; } catch (e) { /* 読めなければ置かない */ } }
    clearAll();
    if (!hasLocal || !hadLocal) return;
    try {
      seenDeleted = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(DELETED_KEY, seenDeleted);
    } catch (e) { /* 印を置けなくても、このタブの削除は済んでいる */ }
  }

  // かんたんの回答を変えたら、対応する「くわしく入力の設定済み」を解除する。
  // そうしないと、確認画面の表示と計算がずれたままになる
  const SECTION_OF = {
    age: "family", spouse: "family", spouseAge: "family", kids: "family", kidsCount: "family", kidsAges: "family", kidPlanIn: "family",
    work: "work", income: "work", selfVary: "work", selfPension: "work",
    spouseWork: "spouseWork", spouseIncome: "spouseWork",
    living: "living",
    home: "home", homeType: "home", rent: "home",
    eduPlan: "edu",
    cars: "car",
    otherLoan: "loans", otherLoanLeft: "loans",
    savings: "assets",
    insured: "insurance", insuredDeathBand: "insurance",
  };
  function forgetDetail(d, questionId) {
    const sec = SECTION_OF[questionId];
    if (!sec || !d.detail || !d.detail.set) return;
    delete d.detail.set[sec];
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // 万円単位の数値を表示用に
  function man(n) {
    if (n == null || !isFinite(n)) return "—";
    const v = Math.round(n);
    const sign = v < 0 ? "−" : "";
    const a = Math.abs(v);
    if (a >= 10000) {
      const oku = Math.trunc(a / 10000);
      const rest = a % 10000;
      return sign + oku + "億" + (rest ? rest.toLocaleString("ja-JP") + "万円" : "円");
    }
    return sign + a.toLocaleString("ja-JP") + "万円";
  }

  // 削除ボタン（ページ内の確認パネル。ブラウザのダイアログは使わない）
  function initDelete() {
    document.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        let panel = document.getElementById("confirm-delete");
        if (panel) { panel.querySelector("button").focus(); return; }
        panel = document.createElement("div");
        panel.id = "confirm-delete";
        panel.className = "confirm-panel";
        panel.setAttribute("role", "alertdialog");
        panel.setAttribute("aria-labelledby", "confirm-delete-title");
        panel.innerHTML =
          '<p id="confirm-delete-title"><b>入力内容をすべて削除しますか？</b><br>この端末から消え、元に戻せません。</p>' +
          '<div class="row"><button type="button" class="btn danger inline" data-yes>削除する</button>' +
          '<button type="button" class="btn secondary inline" data-no>やめる</button></div>';
        const main = document.querySelector("main");
        main.insertBefore(panel, main.firstChild);
        panel.querySelector("[data-yes]").addEventListener("click", () => {
          deleteAll();
          location.href = "/soudan/";
        });
        panel.querySelector("[data-no]").addEventListener("click", () => {
          panel.remove();
          btn.focus();
        });
        panel.querySelector("[data-yes]").focus();
      });
    });
  }

  window.KS = { detailOk, detailWhy, detailLimit, detailValueOk, INFLATION_TARGETS, answersOk, loadOrRestart, takeBrokenFlag, calcReady, showCalcFailure, CALC_FAIL_MSG, forgetDetail, SECTION_OF, loadLocal, load, save, clearAll, deleteAll, hasSavedLocal, hasLocal, hasSession, empty, esc, man, initDelete };
  document.addEventListener("DOMContentLoaded", initDelete);
})();
