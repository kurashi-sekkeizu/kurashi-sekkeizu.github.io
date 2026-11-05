/* ① 入力の解釈（Plan を作る層）
 * 設計書 docs/design/02_architecture.md §4。
 * - 前提の数字はすべて data/assumptions.json（assets/data.js）から読む。コードに書かない（CLAUDE.md §5）
 * - 読めないときは、古い値や推測で計算せず、例外を投げて試算を止める
 * - このファイルは文言を作らない（文言は view/explain.js だけが作る）
 */
(function () {
  "use strict";
  if (!window.KSQ) throw new Error("questions.js が読み込まれていません（model/plan.js より前に読み込んでください）");
  const Q = window.KSQ;

  // 前提データ（公的な数字・そこから計算した値・公的な数字が無い前提・数え方の決まり）を読む
  const A_ = (window.KSDATA && window.KSDATA.assumptions) || null;
  function need(group, key) {
    const g = A_ && A_[group];
    const v = g && g[key];
    if (!v || typeof v.value !== "number") {
      throw new Error(`前提『${group}.${key}』が読み込めません。data/assumptions.json と build_data.py を確認してください`);
    }
    return v.value;
  }
  // 値が「並び」の前提（物価上昇を掛ける費目など）。need() は数値だけを通す歯止めなので分けている
  function needList(group, key) {
    const g = A_ && A_[group];
    const v = g && g[key];
    if (!v || !Array.isArray(v.value) || v.value.some((x) => typeof x !== "string")) {
      throw new Error(`前提『${group}.${key}』が読み込めません（文字の並びではありません）。data/assumptions.json と build_data.py を確認してください`);
    }
    return v.value.slice();
  }
  // 値が「[年収, 割合] の並び」の前提（手取りの割合）。年収の小さい順でなければ止める
  function needPoints(group, key) {
    const g = A_ && A_[group];
    const v = g && g[key];
    const ok = v && Array.isArray(v.value) && v.value.length >= 2
      && v.value.every((p, i) => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === "number") && (i === 0 || p[0] > v.value[i - 1][0]));
    if (!ok) {
      throw new Error(`前提『${group}.${key}』が読み込めません（[年収, 割合] の並びではありません）。data/assumptions.json と build_data.py を確認してください`);
    }
    return v.value.map((p) => p.slice());
  }
  /** 賃金の統計（年齢別の賃金の形）が、計算に使える形で読めているか */
  function wageReady() {
    const W = window.KSDATA && window.KSDATA.wage;
    const cap = W && Number(W.capAge);
    return Boolean(W && W.series && W.map && Number.isFinite(cap) && cap > 0
      && Object.values(W.map).every((k) => k === null || (W.series[k] && Array.isArray(W.series[k].points) && W.series[k].points.length >= 2)));
  }
  function dataReady() {
    return Boolean(A_ && A_.public && A_.estimate && A_.defaults && A_.derived && A_.rules);
  }

  // 単位の換算（許可した数値だけで書く。設計書 §12 指摘2）
  const YEN_PER_MAN = 10000;         // 1万円＝10000円
  const YEN_PER_SEN = 1000;          // 1千円＝1000円
  const TENTHS = YEN_PER_MAN / YEN_PER_SEN;   // 0.1万円（＝1000円）単位で丸めるときの倍率
  const PCT = 100;
  const MONTHS = 12;
  const round1 = (v) => Math.round(v * TENTHS) / TENTHS;   // 0.1万円単位

  // 以前は DUMMY という名前でコードに直書きしていた。いまは正本データから組み立てる
  const DUMMY = dataReady() ? {
    takeHomeRate: needPoints("estimate", "takeHomeRate"),
    pensionBase: need("public", "pensionBase"),
    pensionEmployeeRate: need("estimate", "pensionEmployeeRate"),
    pensionIncomeCap: need("estimate", "pensionIncomeCap"),
    pensionAge: need("estimate", "pensionAge"),
    // 遺族基礎年金の本体と、子の加算（1人あたり）。以前は「本体＋加算1人分」を1つにしていて、子が何人でも1人分だった（2026-10-31）
    survivorBase: need("public", "survivorBase"),
    survivorKidAdd: need("public", "survivorKidAdd"),
    survivorKidAdd3: need("public", "survivorKidAdd3"),
    survivorEmployeeRate: need("estimate", "survivorEmployeeRate"),
    sickRate: need("estimate", "sickRate"),
    disabilityMonthly: need("estimate", "disabilityMonthly"),
    disabilityEmployeeAdd: need("estimate", "disabilityEmployeeAdd"),
    funeral: need("estimate", "funeral"),
    childAllowance: need("public", "childAllowanceO3"),
    childAllowanceU3: need("public", "childAllowanceU3"),
    childAllowanceThird: need("public", "childAllowanceThird"),
    leaveRate: need("estimate", "leaveRate"),
    leaveYears: need("estimate", "leaveYears"),
    endAge: need("estimate", "endAge"),
    olderWorkYears: need("estimate", "olderWorkYears"),
    incomeGrowthStep: need("estimate", "incomeGrowthStep") / PCT,
    edu: {
      kinder: { public: need("public", "eduKinderPublic") / YEN_PER_MAN, private: need("public", "eduKinderPrivate") / YEN_PER_MAN },
      elem: { public: need("public", "eduElemPublic") / YEN_PER_MAN, private: need("public", "eduElemPrivate") / YEN_PER_MAN },
      junior: { public: need("public", "eduJuniorPublic") / YEN_PER_MAN, private: need("public", "eduJuniorPrivate") / YEN_PER_MAN },
      high: { public: need("public", "eduHighPublic") / YEN_PER_MAN, private: need("public", "eduHighPrivate") / YEN_PER_MAN },
      univ: {
        national: need("public", "eduUnivNational"),
        privArts: need("public", "eduUnivPrivate"),
        privSci: need("public", "eduUnivPrivSci"),
        vocational: need("estimate", "eduUnivVocational"),
      },
      entrance: {
        national: need("public", "eduEntranceNational"),
        privArts: need("estimate", "eduEntrancePrivate"),
        privSci: need("estimate", "eduEntrancePrivate"),
        vocational: need("estimate", "eduEntrancePrivate"),
      },
      away: need("estimate", "eduAway"),
    },
  } : null;

  // 数え方の決まり（制度の区切りの年齢・判定の境目）。data/assumptions.json の rules
  const RULE_KEYS = ["schoolKinderFrom", "schoolElemFrom", "schoolJuniorFrom", "schoolHighFrom", "schoolUnivFrom",
    "univYears", "vocationalYears", "childAllowanceU3Until", "childAllowanceUntil", "childAllowanceCountUntil", "childAllowanceThirdRank",
    "survivorKidUntil", "survivorKidAddMax", "survivorMinYears",
    "mansionRaiseEvery", "rentRenewalEvery", "carLastBuyGap", "sickMonths", "workingCushionMonths", "retireCushionYears", "deathCloudMax",
    "emergencyMonths", "emergencyMonthsVary", "emergencyCapMonths", "soonYears", "soonMinAmount", "medicalSavingsEnough",
    "loanMismatchHigh", "loanMismatchLow", "retireGapRound", "deathRound"];
  const RULES = dataReady() ? Object.freeze(Object.fromEntries(RULE_KEYS.map((k) => [k, need("rules", k)]))) : null;

  // 生活費（住居費・教育費・車を除く）の内訳の費目。割合は家計調査から出す（build_data.py が計算して data.js に書き出す）。
  // 並び順は画面の順で、「その他」で端数を合わせる計算の順でもある。名前は view/explain.js が持つ
  const LIVING_KEYS = ["food", "utility", "comm", "daily", "clothes", "medical", "transport", "insurance", "leisure", "allowance", "other"];
  const LIVING_RATIO = (A_ && A_.derived && A_.derived.livingRatio && A_.derived.livingRatio.ratio) || null;
  const LIVING_SHARES = LIVING_RATIO ? LIVING_KEYS.map((key) => ({ key, ratio: LIVING_RATIO[key] || 0 })) : null;

  // 生活費を内訳に分ける。0.5万円単位で丸め、端数は「その他」で調整して合計を元の金額と一致させる
  function splitLiving(total) {
    const base = Math.round(total * 2) / 2;
    const out = Object.fromEntries(LIVING_SHARES.map((it) => [it.key, Math.round(base * it.ratio * 2) / 2]));
    out.other = Math.max(0, base - LIVING_SHARES.filter((it) => it.key !== "other").reduce((t, it) => t + out[it.key], 0));
    return out;
  }

  // 元利均等返済。金利0%でも割り算が壊れないようにする
  // 完済の年齢は「いまの年齢−返し始めてからの年数＋期間」。返し始めてからの年数が期間より長い（返し終えた）ときも、
  // 実際に完済した年齢を返す（計算は返し終えた扱いのまま：完済の年齢がいまの年齢より前）。
  // 以前は返した年数を期間で切ってから数え、完済の年齢がいまの年齢と出ていた（2026-10-31 第10巡 C10-軽1）
  function loanFromOrigin(loan, age) {
    const P = Number(loan.borrowed) || 0;
    const years = Math.max(1, Number(loan.years) || 0);
    const since = Math.max(0, Number(loan.startedAgo) || 0);
    const ago = Math.min(since, years);
    const r = (Number(loan.rate) || 0) / PCT / MONTHS;
    const n = years * MONTHS;
    const monthly = r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
    const k = ago * MONTHS;                              // これまでに返した回数
    const balance = r === 0
      ? Math.max(0, P - monthly * k)
      : Math.max(0, P * Math.pow(1 + r, k) - monthly * ((Math.pow(1 + r, k) - 1) / r));
    return {
      monthly: round1(monthly),
      balance: Math.round(balance),
      endAge: Number(age) + (years - since),
      paid: ago,
      years: years,
    };
  }

  // 入っている保険の種類（複数選択）。古い保存データ（"yes"/"no"）にも合わせる
  function hasInsurance(answers, kind) {
    const v = answers.insured;
    if (Array.isArray(v)) return Q.chosen(Q.byId.insured, v).includes(kind);   // 「入っていない」が一緒にあれば、入っていない扱い
    if (v === "yes") return kind === "death" || kind === "medical";  // 旧データは死亡・医療に入っていた扱い
    return false;
  }
  function anyInsurance(answers) {
    const v = answers.insured;
    if (Array.isArray(v)) return v.some((x) => x !== "none" && x !== "unknown");
    return v === "yes";
  }

  // 住んでいる地域。家賃と生活費の「わからない」のときの目安に使う。
  // データが無ければ null を返し、全国の目安のままにする（推測しない）
  function regionOf(answers) {
    const R = window.KSDATA && window.KSDATA.region;
    const pref = answers.pref;
    if (!R || !pref || pref === "unknown") return null;
    const key = R.prefToRegion ? R.prefToRegion[pref] : null;
    const g = key && R.regions ? R.regions[key] : null;
    const rent = R.rentByPref ? R.rentByPref[pref] : null;
    if (!g && !rent) return null;
    return {
      pref: pref,
      key: key,
      label: g ? g.label : null,
      // 全国に対する生活費の水準（1.0 が全国並み）
      livingFactor: g && R.national && R.national.total ? g.total / R.national.total : 1,
      rentMan: rent ? round1(rent / YEN_PER_MAN) : null,   // 円/月 → 万円/月
    };
  }

  // 都道府県から、民営借家の平均家賃（万円/月）を引く
  function regionRent(answers) {
    const R = window.KSDATA && window.KSDATA.region;
    const pref = answers.pref;
    if (!R || !R.rentByPref || !pref || pref === "unknown") return null;
    const yen = R.rentByPref[pref];
    return yen ? round1(yen / YEN_PER_MAN) : null;
  }

  const EDU_PLAN = {
    public: { kinder: "public", elem: "public", junior: "public", high: "public", univ: "national" },
    univPrivate: { kinder: "public", elem: "public", junior: "public", high: "public", univ: "privArts" },
    highPrivate: { kinder: "public", elem: "public", junior: "public", high: "private", univ: "privArts" },
    juniorPrivate: { kinder: "public", elem: "public", junior: "private", high: "private", univ: "privArts" },
    allPrivate: { kinder: "private", elem: "private", junior: "private", high: "private", univ: "privArts" },
    noUniv: { kinder: "public", elem: "public", junior: "public", high: "public", univ: "none" },
    unknown: { kinder: "public", elem: "public", junior: "public", high: "public", univ: "privArts" },
  };

  // 住宅ローンの完済の年齢の上限。くわしく入力の「完済する年齢」の選択肢の上限（defaults.loanEndAgeMax）で、
  // 計算する年齢の上限（estimate.endAge）より後にはしない。はじめの値もこれを超えないように置く（2026-10-31 第10巡 B10-1）
  const loanEndAgeMax = () => Math.min(need("defaults", "loanEndAgeMax"), need("estimate", "endAge"));
  // 保存できる完済の年齢の下限（common.js の範囲の定義が1か所の正本。読めなければ止める）
  function loanEndAgeMin() {
    const L = window.KS && window.KS.detailLimit && window.KS.detailLimit("loan.endAge");
    if (!L || !Number.isFinite(L.min)) throw new Error("保存の範囲（common.js の loan.endAge）が読み込めません。common.js を model/plan.js より前に読み込んでください");
    return L.min;
  }
  // 借りたときの内容の仮置き。いまの年齢から残りの期間を数えると完済が上限を超える人（いまの年齢が高い人）は、
  // 返し始めてからの年数を延ばして、完済が上限になるように置く（借入額・期間・金利は同じ）。
  // 以前は「いまの年齢＋30年」のままで、66歳の人の仮置きが「96歳まで返済」になっていた（2026-10-31 第10巡 B10-1）
  function loanOriginDefault(age) {
    const V = (k) => need("defaults", k);
    const years = V("loanYears");
    const left = Math.max(1, loanEndAgeMax() - Number(age));
    return { borrowed: V("loanBorrowed"), years, startedAgo: Math.max(V("loanStartedAgo"), years - left), rate: V("loanRate") };
  }
  // 「いまの返済額と残高を入れる」のはじめの値。借りたときの内容から計算した値を、選択肢の刻み（毎月は0.5万円・残高は100万円）にそろえ、
  // 完済の年齢は「いまの年齢+1〜上限」に収める。
  // 以前は 月10万円・定年の年齢（65歳）・2,000万円 の決まった値で、65歳以上の人が切り替えると返し終えた扱いになり、
  // 返済が計算から消えていた（2026-10-31 第10巡 B10-1）
  // 借りたときの内容で返し終えている（完済の年齢がいまの年齢以下）なら、返し終えたまま写す（完済はその年齢・残高0）。
  // 以前は完済を「いまの年齢+1」に引き上げ、返し終えたローンの返済が1年ぶん戻っていた（2026-10-31 第11巡 B11-2）
  // 返し終えた側の完済の年齢は、保存の範囲（common.js の loan.endAge の下限）〜いまの年齢に収める。
  // 以前はそのまま写し、45歳・期間10年・40年前から だと完済15歳で保存され、保存の検査（KS.detailOk）が落ちて
  // 保存データ全体が「読み込めませんでした」になった（2026-10-31 第12巡 A12-中1）
  function loanCurrentFrom(loan, age) {
    const v = loanFromOrigin(loan, age);
    const paidOff = v.endAge <= Number(age);
    return {
      monthly: Math.round(v.monthly * 2) / 2,
      endAge: paidOff ? Math.min(Number(age), Math.max(loanEndAgeMin(), v.endAge)) : Math.min(loanEndAgeMax(), Math.max(Number(age) + 1, v.endAge)),
      balance: paidOff ? 0 : Math.round(v.balance / 100) * 100,
    };
  }
  // 「いまの返済額と残高」の値が、まだ仮置きのままか（利用者が欄を選んでいない）。
  // currentAuto：切り替えで入れた値なら true、利用者が欄を選んだら false（detail.js）。印の無い古い保存は、
  // はじめの値（detailDefaults と同じ loanCurrentFrom(loanOriginDefault)）と同じときだけ仮置きとみる（2026-10-31 第11巡 B11-2）
  function loanCurrentProvisional(loan, age) {
    if (loan.currentAuto === true) return true;
    if (loan.currentAuto === false) return false;
    const d = loanCurrentFrom(loanOriginDefault(age), age);
    return Number(loan.monthly) === d.monthly && Number(loan.endAge) === d.endAge && Number(loan.balance) === d.balance;
  }
  // 「いまの返済額と残高を入れる」に切り替えたときに入れ直す値（入れ直さないなら null）。
  // まだ仮置きのままなら、いまの借りたときの内容から作り直す（直前の「この内容だと…」と同じ値）。
  // 利用者の値でも、完済の年齢が選べる範囲（いまの年齢+1〜上限）の外なら作り直す（第10巡 B10-1）。
  // 以前は範囲の中なら仮置きの古い値（借入額などを直す前の値）のままだった（2026-10-31 第11巡 B11-2）
  function loanSwitchToCurrent(loan, age) {
    const e = Number(loan.endAge);
    const inRange = e > Number(age) && e <= loanEndAgeMax();
    if (inRange && !loanCurrentProvisional(loan, age)) return null;
    return Object.assign(loanCurrentFrom(loan, age), { currentAuto: true });
  }

  // くわしく入力の初期値（かんたんの回答から作る）。すべて data/assumptions.json の defaults から読む
  function detailDefaults(a, nPlanned) {
    const V = (k) => need("defaults", k);
    const plan = EDU_PLAN[a.eduPlan] || EDU_PLAN.unknown;
    const nKids = (a.kids === "yes" ? Number(a.kidsCount) || 0 : 0) + (Number(nPlanned) || 0);
    const nCars = Number(a.cars) || 0;
    const livingMid = Q.mid("living", a);
    const age = Number(a.age);
    // いまの年齢が定年の既定以上で働いている人は、定年の既定ではなく「いまの年齢＋何年か」で仕事をやめる、と仮置きする。
    // 以前は既定の定年（65歳）のまま、70歳で働いている人の給与が1年目から0になっていた（2026-10-31）
    const stopAge = (who, nowAge) => (who && who !== "none" && Number(nowAge) >= V("retireAge")
      ? Number(nowAge) + need("estimate", "olderWorkYears") : V("retireAge"));
    const selfStop = stopAge(a.work, age);
    const spouseStop = stopAge(Q.hasSpouse(a) ? a.spouseWork : null, a.spouseAge);
    return {
      set: {},
      family: { planned: a.kids === "plan" && a.kidPlanIn !== undefined ? [{ inYears: Number(a.kidPlanIn) || V("kidPlanIn") }] : [] },
      living: splitLiving(livingMid == null ? V("livingDefault") : livingMid),
      retire: { ratio: V("retireRatio") },
      kids: Array.from({ length: nKids }, () => Object.assign({ away: "home", lessons: 0, lessonsUntil: V("lessonsUntil") }, plan)),
      cars: Array.from({ length: nCars }, (_, i) => ({
        nextIn: i === 0 ? V("carNextFirst") : V("carNextOther"),
        budget: V("carBudget"), interval: V("carInterval"), upkeep: V("carUpkeep"),
        until: Math.max(V("carUntilAge"), age + V("carUntilMinYears")),
      })),
      // 住宅ローンは「借りたときの内容」から入れられるようにする（残高は覚えていないことが多いため）
      loan: Object.assign({
        input: "origin",           // origin＝借りたときの内容から計算／current＝いまの返済額と残高を直接入れる
      }, loanOriginDefault(age), loanCurrentFrom(loanOriginDefault(age), age), {
        dansin: "yes", bonus: 0, prepayOn: "no",
        prepayAge: age + V("prepayAfter"), prepayAmount: V("prepayAmount"),
      }),
      rent: { monthly: Q.mid("rent", a) ?? regionRent(a) ?? V("rentDefault"), renewal: V("rentRenewal") },
      move: { on: "no", age: age + V("moveAfter"), cost: V("moveCost"), monthly: V("moveMonthly") },
      assets: { cash: null, invest: null, monthly: 0 },
      loans: [],
      // かんたん入力で答えた死亡保障の帯を、くわしく入力の初期値にする（答えていなければ0）
      insurance: { death: Number(Q.mid("insuredDeathBand", a) || 0), medical: "unknown", disability: 0 },
      house: {
        built: V("houseBuilt"), paintEvery: V("housePaintEvery"), paintCost: V("housePaintCost"),
        waterEvery: V("houseWaterEvery"), waterCost: V("houseWaterCost"), tax: V("houseTax"),
      },
      mansion: { built: V("mansionBuilt"), monthly: V("mansionFeeDefault"), raise: V("mansionRaise"), tax: V("mansionTax") },
      purchase: {
        on: "no", age: Math.max(V("purchaseMinAge"), age + V("purchaseAfter")), type: "house",
        price: V("purchasePrice"), down: V("purchaseDown"), years: V("loanYears"),
        rate: V("loanRate"), cost: V("purchaseCost"),
      },
      rebuild: { on: "no", age: Math.max(V("rebuildMinAge"), age + V("rebuildAfter")), budget: V("rebuildBudget") },
      care: { on: "no", startAge: Math.max(V("careMinAge"), age + V("careAfter")), years: V("careYears"), monthly: V("careMonthlyDefault") },
      spend: { travel: 0, travelUntil: V("travelUntil"), items: [] },
      work: {
        retireAge: selfStop, rehire: 0, rehireUntil: selfStop, allowance: 0,
        // 転職・独立の時期のはじめの値は、仕事をやめる年齢より前に置く（それ以後は計算に入れないため。第12巡 B12-中2）
        change: "no", changeAge: Math.max(age, Math.min(age + V("changeAfter"), selfStop - 1)), changeIncome: "i3", growth: "stat",
        pension: 0, side: 0, sideUntil: selfStop,
      },
      spouseWork: {
        growth: "stat", plan: "same", planFrom: V("spousePlanFrom"), planYears: V("spousePlanYears"),
        planRate: V("spouseLeaveRate"), returnIncome: "i2", retireAge: spouseStop, pension: 0,
      },
    };
  }

  // くわしく入力の節と、その節が持つ値の対応。「設定済み」の印は節ごとに立つ（detail.js の節と同じ）。
  // 印の無い節の値は、保存に残っていても使わない。かんたん入力を答え直すと印だけが外れるため、
  // 以前は古い値で計算が続いていた（定年36歳・退職金1,000万円のまま、など。2026-10-31）
  const SECTION_KEYS = Object.freeze({
    family: ["family", "care"], work: ["work"], spouseWork: ["spouseWork"], living: ["living", "retire"],
    home: ["loan", "rent", "house", "mansion", "purchase", "rebuild", "move"], edu: ["kids"], car: ["cars"],
    loans: ["loans"], assets: ["assets"], insurance: ["insurance"], spend: ["spend"],
  });
  const SECTION_OF_KEY = Object.freeze(Object.fromEntries(
    Object.entries(SECTION_KEYS).flatMap(([sec, keys]) => keys.map((k) => [k, sec]))));

  // 保存済みのくわしく入力と、初期値を合わせる（子・車の数は、かんたん／くわしくの設定に合わせる）
  function detailOf(data) {
    const a = data.answers;
    const raw = data.detail || {};
    const set = Object.assign({}, raw.set || {});
    // 印の無い節の値を落としてから合わせる
    const saved = {};
    Object.keys(raw).forEach((k) => {
      if (k === "set") return;
      const sec = SECTION_OF_KEY[k];
      if (!sec || set[sec]) saved[k] = raw[k];
    });
    const nPlanned = ((saved.family && saved.family.planned) || []).length;
    const def = detailDefaults(a, nPlanned);
    const out = {};
    Object.keys(def).forEach((k) => {
      if (Array.isArray(def[k])) out[k] = saved[k] ? saved[k] : def[k];
      else out[k] = Object.assign({}, def[k], saved[k] || {});
    });
    out.kids = def.kids.map((dk, i) => Object.assign({}, dk, (saved.kids || [])[i] || {}));
    out.set = set;
    out.spend.items = (out.spend.items || []).filter((it) => it && it.age && it.amount);
    out.loans = (saved.loans || []).filter((l) => l && l.monthly);
    // 「何歳まで働くか」が定年以下だと、再雇用の収入が1年も入らない。定年の翌年以降に直す。
    // 計算の中だけで直すと、画面には保存の値（60歳など）が出て、年表の「〜61歳」と食い違う（2026-10-31）
    out.work.rehireUntil = Math.max(Number(out.work.rehireUntil) || 0, Number(out.work.retireAge) + 1);
    return out;
  }

  // 写してから凍らせる（呼び出し側の保存データは凍らせない）
  function frozenCopy(v) {
    if (Array.isArray(v)) return Object.freeze(v.map(frozenCopy));
    if (v && typeof v === "object") {
      const o = {};
      Object.keys(v).forEach((k) => { o[k] = frozenCopy(v[k]); });
      return Object.freeze(o);
    }
    return v;
  }
  const isNone = (v) => v === null || v === undefined;
  // 賃金の統計（賃金構造基本統計調査）の対象外の働き方。data/wage.json の map で null の働き方と同じ（tests/invariants.html R73 で照合）。
  // 統計が読めないときでも「この働き方は統計を使わない」と分かるよう、ここにも持つ
  const WAGE_FREE = Object.freeze(["self", "none"]);
  function needsWage(kind) {
    if (!kind || WAGE_FREE.includes(kind)) return false;
    const W = window.KSDATA && window.KSDATA.wage;
    return !(W && W.map && Object.prototype.hasOwnProperty.call(W.map, kind) && W.map[kind] === null);
  }
  /** 出どころ付きの値。source は answer（回答）・detail（くわしく入力）・region（地域の統計）・stat（全国の統計）・default（assumptions.json の目安） */
  const val = (key, value, source, from) => ({ key, value, source, from: from || null });
  /** 配偶者の「今後の働き方」（くわしく入力）で、その年に育休・時短の減額を入れているか。
   * 配偶者がいま育休中でも、この年は仮置きの減額（estimate.leaveRate）を重ねない（model/yearly.js・仮の値で同じ判定。2026-10-31 A7-2・B7-4） */
  const spouseLeaveByPlan = (SW, y) => SW.plan === "leave" && y >= Number(SW.planFrom) && y < Number(SW.planFrom) + Number(SW.planYears);
  /** 配偶者の「今後の働き方」（くわしく入力）で、その年の働き方を決めているか。育休・時短は期間内、やめる・働き始めるは planFrom 以後。
   * 決めた年は、いまの育休の仮置きの減額（estimate.leaveRate）を掛けない。計算（model/yearly.js）と仮の値の年数は、この判定だけを使う。
   * 以前は育休・時短だけを見ており、復職した年の年収にも仮置きの50%が掛かっていた（2026-10-31 B8-1・A8-1） */
  const spousePlanDecides = (SW, y) => spouseLeaveByPlan(SW, y) || ((SW.plan === "quit" || SW.plan === "return") && y >= Number(SW.planFrom));
  const EMPLOYEE_LIKE = ["employee", "civil", "leave", "short"];

  /** 回答・くわしく入力・前提から、凍結した Plan を作る */
  function resolve(data) {
    // 公的データが読めないときは、古い値や推測で計算しない（CLAUDE.md §5）
    if (!DUMMY || !RULES || !LIVING_SHARES) {
      throw new Error("公的データを読み込めませんでした。試算は行いません。");
    }
    // 出典（確認日）が読めないときも止める。以前は試算を出したまま、比較の出典・確認日が黙って消えていた（2026-10-31 D2-L4）
    const SRC = window.KSDATA && window.KSDATA.sources;
    if (!SRC || typeof SRC !== "object" || !Object.keys(SRC).length) {
      throw new Error("出典の一覧（data/sources.json）を読み込めませんでした。試算は行いません。");
    }
    const C = DUMMY;
    const a = data.answers;
    const as = data.assumptions;
    const D = detailOf(data);
    const age = Number(a.age);
    const work = a.work;

    // 年収
    let income = work === "none" ? 0 : Q.mid("income", a);
    let incomeVal;
    if (isNone(income)) {
      income = work === "none" ? 0 : need("estimate", "incomeUnknown");
      incomeVal = val("income", income, work === "none" ? "answer" : "default", "estimate.incomeUnknown");
    } else incomeVal = val("income", income, "answer");
    const spouse = Q.hasSpouse(a);
    const spouseAge = spouse ? Number(a.spouseAge) : null;
    let spouseIncome = 0;
    let spouseIncomeVal = val("spouseIncome", 0, "answer");
    if (spouse && a.spouseWork !== "none") {
      spouseIncome = Q.mid("spouseIncome", a);
      if (isNone(spouseIncome)) {
        spouseIncome = need("estimate", "spouseIncomeUnknown");
        spouseIncomeVal = val("spouseIncome", spouseIncome, "default", "estimate.spouseIncomeUnknown");
      } else spouseIncomeVal = val("spouseIncome", spouseIncome, "answer");
    }
    const kidsNow = a.kids === "yes" ? (a.kidsAges || []).map(Number) : [];
    const planned = (D.family.planned || []).map((p) => -Number(p.inYears));  // これから生まれる子は、いまの年齢をマイナスで持つ
    const kids = kidsNow.concat(planned);
    // 子・配偶者のほかに、生活費をともにしている家族（同居の親など）
    const others = Number(Q.mid("others", a) || 0);
    const household = 1 + (spouse ? 1 : 0) + kidsNow.length + others;
    const region = regionOf(a);

    // 生活費
    let living = Q.mid("living", a);
    let livingVal = val("living", living, "answer");
    if (D.set.living) {
      living = LIVING_SHARES.reduce((t, it) => t + Number(D.living[it.key] || 0), 0);
      livingVal = val("living", living, "detail");
    } else if (living == null) {
      // 世帯の人数から置き、住んでいる地域の水準を掛ける（地域を答えていなければ全国のまま）
      const base = Math.min(need("estimate", "livingMax"), need("estimate", "livingBase") + household * need("estimate", "livingPerPerson"));
      living = Math.round(base * (region ? region.livingFactor : 1) * 2) / 2;
      livingVal = val("living", living, region && region.label ? "region" : "default", "estimate.livingBase");
    }

    // 貯蓄
    let savings = Q.mid("savings", a);
    let savingsVal = val("savings", savings, "answer");
    const assetsSplit = Boolean(D.set.assets && D.assets.cash !== null && D.assets.invest !== null);
    if (assetsSplit) {
      savings = Number(D.assets.cash) + Number(D.assets.invest);
      savingsVal = val("savings", savings, "detail");
    } else if (savings == null) {
      savings = need("estimate", "savingsUnknown");
      savingsVal = val("savings", savings, "default", "estimate.savingsUnknown");
    }

    const home = a.home;
    const owns = home === "loan" || home === "own";
    const homeType = a.homeType;
    const renting = home === "rent" || home === "plan";
    const employeeLike = EMPLOYEE_LIKE.includes(work);
    const spouseEmployee = EMPLOYEE_LIKE.includes(a.spouseWork);
    const W = D.work, SW = D.spouseWork;
    // 「年齢に応じて」（統計）を選んでいて賃金の統計が読めないときは、黙って横ばいにせず試算を止める（CLAUDE.md §5）。
    // 以前は横ばいで計算し、「この働き方は統計の対象外」と事実と違う説明を出していた（2026-10-31）
    // 止めるのは、統計を実際に使う働き方だけ。自営業など統計の対象外の働き方は、統計が欠けても計算は変わらない（横ばい）ので止めない。
    // 以前は自営業でも、賃金の統計が欠けると試算を止めていた（2026-10-31 A2要確認）
    const usesWage = (needsWage(work) && W.growth === "stat") || (spouse && needsWage(a.spouseWork) && SW.growth === "stat");
    if (usesWage && !wageReady()) throw new Error("賃金の統計（data/wage.json）を読み込めませんでした。試算は行いません。");
    const retireAge = Number(W.retireAge);
    // 定年の目安を過ぎて働いている人の「仕事をやめる年齢」を、いまの年齢＋何年かで仮置きしているか（detailDefaults の stopAge と同じ条件。
    // くわしく入力の「あなたの収入」を直していれば、利用者の値）。年表・説明で「定年」と言わないために使う（2026-10-31 B4-5）
    const olderStop = !D.set.work && work !== "none" && age >= need("defaults", "retireAge");
    const rehireUntil = Number(W.rehireUntil);   // 定年の翌年以降にそろえてある（detailOf）
    const pensionSelf = Number(W.pension) > 0 ? Number(W.pension) : C.pensionBase + (employeeLike ? Math.min(income, C.pensionIncomeCap) * C.pensionEmployeeRate : 0);
    const pensionSpouse = !spouse ? 0 : Number(SW.pension) > 0 ? Number(SW.pension) : C.pensionBase + (spouseEmployee ? Math.min(spouseIncome, C.pensionIncomeCap) * C.pensionEmployeeRate : 0);
    // 転職・独立は、仕事をやめる（定年の）年齢より前だけを計算に入れる。それ以後の時期（くわしく入力の選択肢には出さないが、
    // 定年を早めたあとの保存値などで残るもの）は入れず、年表にも出さず、外したことを「この計算に入れていないこと」に出す（changeLate）。
    // 以前は年表に「転職・独立（年収…）」と出ながら、計算は0か再雇用の割合（変わったあとの年収の）だった（2026-10-31 第12巡 B12-中2）
    const changeLate = W.change === "yes" && Number(W.changeAge) >= retireAge;
    const changeOff = W.change === "yes" && !changeLate ? Number(W.changeAge) - age : null;
    const changedIncome = W.change === "yes" ? (Q.option(Q.byId.income, W.changeIncome)?.mid ?? income) : income;
    const returnIncome = Q.option(Q.byId.spouseIncome, SW.returnIncome)?.mid ?? need("estimate", "spouseIncomeUnknown");

    // 物価の上昇をどの費目に掛けるか。利用者が費目ごとに外せる（CLAUDE.md §5：前提は利用者が選ぶ）。
    // **返済は掛けない。** 住宅ローンもその他の借入れも、契約した額のまま変わらないため。
    // マンションの修繕積立金も掛けない（別に値上がりの設定があり、二重になる）
    const infOn = Array.isArray(as.inflationOn) ? as.inflationOn.slice() : needList("defaults", "inflationTargets");

    // 住宅ローン：「借りたときの内容から計算する」を選んでいるときは、そこから毎月の返済額・残高・完済年齢を出す
    const loanView = home === "loan" && D.loan.input !== "current" ? loanFromOrigin(D.loan, age) : null;
    const loanMonthly = home === "loan" ? Number(loanView ? loanView.monthly : D.loan.monthly) : 0;
    const loanBalance = home === "loan" ? Number(loanView ? loanView.balance : D.loan.balance) : 0;
    // 借りたときの内容から計算した月々の返済額は、借入額の全部を返す額。
    // そこへボーナス返済を足すと、元本を二重に数えてしまうので足さない
    const loanYearly = home === "loan" ? loanMonthly * MONTHS + (loanView ? 0 : Number(D.loan.bonus || 0)) : 0;
    const loanEndAge = home === "loan" ? Number(loanView ? loanView.endAge : D.loan.endAge) : null;
    // いまの家の住宅ローンを返し終えているか（完済の年齢がいまの年齢以下）。**判定はここ1か所。**
    // 返済は計算に1年も入らない（model/yearly.js の housingCost は cur < loanEndAge の年だけ）。
    // ⑤の注記・やること・聞くこと・万一の注記・⑥の内訳・⑦・繰り上げ返済・くわしく入力は、すべてこれを見る。
    // 以前は説明の層（view/explain.js）が別に判定し、ほかの箇所は「住宅ローンあり」の答えだけを見ていた（2026-10-31 第9巡 B9-1）
    const loanPaidOff = home === "loan" && Number.isFinite(loanEndAge) && loanEndAge <= age;
    // 残高・返済額・完済年齢の食い違い（利息があるため、ゆるめに判定）。
    // 借りたときの内容から計算した場合は、値どうしが必ず整合するので検査しない。残高を直接入れたときだけ見る
    let loanMismatch = null;
    // 完済の年齢がいまの年齢以下なのに残高があるときは、残高を計算に入れていない（返済は1年も入らない）。黙って外さず知らせる。
    // 以前は返済額の合計が0のため調べず、残高を黙って外していた（2026-10-31 第9巡 B9-4）
    if (loanPaidOff && D.set.home && D.loan.input === "current" && Number(D.loan.balance) > 0) {
      loanMismatch = { kind: "paidBalance", balance: Number(D.loan.balance), endAge: loanEndAge };
    } else if (home === "loan" && loanYearly > 0 && D.set.home && D.loan.input === "current") {
      const years = Math.max(0, Number(D.loan.endAge) - age);
      const total = loanYearly * years;
      if (total > 0) {
        if (Number(D.loan.balance) > total * RULES.loanMismatchHigh) loanMismatch = { kind: "high", balance: D.loan.balance, total };
        // 残高0（返し終えた残高のまま完済する年齢だけを先に延ばした など）は「もっと早く完済」ではなく、残高0のまま返済が続く入力だと言う（第12巡 C12-軽1）
        else if (Number(D.loan.balance) < total * RULES.loanMismatchLow) loanMismatch = { kind: Number(D.loan.balance) > 0 ? "low" : "zeroBalance", balance: D.loan.balance, total, endAge: loanEndAge };
      }
    }

    // 加入中の保険
    const insuredDeathOn = hasInsurance(a, "death");
    const bandDeath = insuredDeathOn ? Q.mid("insuredDeathBand", a) : null;
    const insuredDeath = insuredDeathOn
      ? (D.set.insurance ? Number(D.insurance.death) : (isNone(bandDeath) ? 0 : Number(bandDeath)))
      : 0;
    const insuredIncomeOn = hasInsurance(a, "income");
    const insuredDisability = insuredIncomeOn && D.set.insurance ? Number(D.insurance.disability) : 0;
    const insurancePending = insuredDeathOn && !D.set.insurance && isNone(bandDeath);
    // 働けなくなったときの保障は、かんたん入力では額を聞かない。入っていて、くわしく入力で額を入れていなければ未入力。
    // 以前は死亡保障の未入力の印で、働けなくなったときの天気まで「くもり」にしていた（2026-10-31）
    const disabilityPending = insuredIncomeOn && !D.set.insurance;
    // 住宅ローン以外の借入れの残高（かんたん入力の帯）
    const otherLoanBand = a.otherLoan === "yes" ? Q.mid("otherLoanLeft", a) : null;

    // ── 仮の値（出どころが「目安」の値）。並び順は画面の順。文は view/explain.js が作る ──
    const prov = [];
    if (incomeVal.source === "default") prov.push(incomeVal);
    if (spouseIncomeVal.source === "default") prov.push(spouseIncomeVal);
    // 育休・産休の減額（元の年収に掛ける割合と年数）は、入力する欄が無く目安で置いている。黙って掛けず、仮の値に出す（2026-10-31 B6-5）
    const leaveVal = () => ({ rate: Math.round(C.leaveRate * PCT), years: C.leaveYears });
    if (work === "leave") prov.push(val("leave", leaveVal(), "default", "estimate.leaveRate"));
    // 配偶者：くわしく入力の「今後の働き方」で決めた年は、仮置きの減額を掛けない。仮置きが残る年だけを言う（2026-10-31 A7-2・B7-4・B8-1）
    if (spouse && a.spouseWork === "leave") {
      const ys = [];
      for (let y = 0; y < C.leaveYears; y++) if (!spousePlanDecides(SW, y)) ys.push(y);
      if (ys.length) prov.push(val("spouseLeave", Object.assign(leaveVal(), { years: ys.length, from: ys[0], gap: ys[ys.length - 1] - ys[0] + 1 !== ys.length, total: C.leaveYears }), "default", "estimate.leaveRate"));
    }
    if (livingVal.source === "region" || livingVal.source === "default") prov.push(Object.assign({}, livingVal, { regionLabel: region && region.label }));
    if (savingsVal.source === "default") prov.push(savingsVal);
    // 進学の方針を答えていない子（予定の子は、かんたん入力では方針を聞かない）は、私立文系までの仮置き。
    // 以前は予定の子のぶんを黙って仮置きしていた（2026-10-31）
    const eduAnswered = Boolean(EDU_PLAN[a.eduPlan]) && a.eduPlan !== "unknown";
    if (kids.length && !eduAnswered && !D.set.edu) prov.push(Object.assign(val("eduPlan", EDU_PLAN.unknown, "default"), { plannedOnly: !kidsNow.length }));
    // 働いていない人には定年・退職金を言わない（年金の見込みだけ）。以前は「定年65歳・退職金なし」と出ていた（2026-10-31 B2-軽6）
    if (!D.set.work && work === "none") prov.push(val("pension", Number(W.pension) || 0, "default"));
    else if (!D.set.work) {
      prov.push(Object.assign(val("work", { retireAge: W.retireAge, allowance: Number(W.allowance) || 0, pension: Number(W.pension) || 0 }, "default"),
        { older: olderStop ? need("estimate", "olderWorkYears") : null }));
    }
    if (spouse && !D.set.spouseWork && a.spouseWork !== "none" && spouseAge >= need("defaults", "retireAge")) {
      prov.push(Object.assign(val("spouseRetire", SW.retireAge, "default"), { older: need("estimate", "olderWorkYears") }));
    }
    // すでに年金の年齢に達している人には、老後の割合を掛けない（model/yearly.js の生活費）。掛けていない仮置きは出さない
    if (!D.set.living && age < C.pensionAge) prov.push(val("retireRatio", D.retire.ratio, "default", "defaults.retireRatio"));
    if (insuredDeathOn && !D.set.insurance) prov.push(Object.assign(val("insurance", insuredDeath, isNone(bandDeath) ? "default" : "answer"), { band: isNone(bandDeath) ? null : bandDeath }));
    if (a.otherLoan === "yes" && !D.loans.length) prov.push(Object.assign(val("otherLoan", 0, "default"), { band: isNone(otherLoanBand) ? null : otherLoanBand }));
    // 借入れが「わからない」は、借入れなしとして計算している。そのことを仮の値に出す（2026-10-31 B2-軽18）
    if (a.otherLoan === "unknown" && !D.loans.length) prov.push(Object.assign(val("otherLoan", 0, "default"), { band: null, unknown: true }));
    if (D.cars.length && !D.set.car) {
      const c0 = D.cars[0];
      prov.push(val("car", { interval: c0.interval, budget: c0.budget, upkeep: c0.upkeep }, "default"));
    }
    if (!D.set.home) {
      if (home === "loan") {
        prov.push(val("homeLoan", loanView
          ? { mode: "origin", borrowed: D.loan.borrowed, years: loanView.years, rate: D.loan.rate, paid: loanView.paid, monthly: loanView.monthly, endAge: loanView.endAge }
          : { mode: "current", monthly: D.loan.monthly, endAge: D.loan.endAge }, "default"));
      }
      if (renting && (a.rent === undefined || a.rent === "unknown")) {
        const rr = regionRent(a);
        const regional = rr !== null && Number(D.rent.monthly) === rr;
        prov.push(Object.assign(val("rent", D.rent.monthly, regional ? "region" : "default"), { pref: regional ? a.pref : null }));
      }
      if (owns && homeType === "house") prov.push(val("house", { built: D.house.built, paintEvery: D.house.paintEvery, paintCost: D.house.paintCost, tax: D.house.tax }, "default"));
      if (owns && homeType === "mansion") prov.push(val("mansion", { monthly: D.mansion.monthly, tax: D.mansion.tax }, "default"));
    }
    if (loanMismatch) prov.push(val("loanMismatch", loanMismatch, "detail"));

    return frozenCopy({
      year0: new Date().getFullYear(),
      age, span: C.endAge - age, work, employeeLike,
      income, spouse, spouseAge, spouseWork: a.spouseWork, spouseEmployee, spouseIncome,
      kidsNow, planned, kids, others, household, region,
      living, savings, assetsSplit,
      home, owns, homeType, renting,
      inf: as.inflation / PCT, ret: as.ret / PCT, infOn, inflation: as.inflation, retPct: as.ret,
      ratioLow: as.ratioLow / PCT, ratioHigh: as.ratioHigh / PCT,
      detail: D, answers: a,
      retireAge, olderStop, rehireUntil, pensionSelf, pensionSpouse, returnIncome, changeOff, changeLate, changedIncome,
      loanView, loanMonthly, loanBalance, loanYearly, loanEndAge, loanPaidOff, loanMismatch,
      insuredDeath, insuredDisability, insurancePending, disabilityPending, insuredIncomeOn, bandDeath: isNone(bandDeath) ? null : bandDeath, otherLoanBand: isNone(otherLoanBand) ? null : otherLoanBand,
      anyInsurance: anyInsurance(a), insuredDeathOn,
      eduPlanDefault: EDU_PLAN.unknown, lessonsUntilDefault: need("defaults", "lessonsUntil"),
      vals: { income: incomeVal, spouseIncome: spouseIncomeVal, living: livingVal, savings: savingsVal },
      prov,
    });
  }
  /** 出どころが「目安」（または注意が要る）として画面に出す値の一覧。Plan が凍っているので、写しを返す */
  const provisional = (plan) => plan.prov.slice();

  window.KSP = {
    need, needList, needPoints, dataReady, DUMMY, RULES, YEN_PER_MAN, YEN_PER_SEN, TENTHS, PCT, MONTHS, round1,
    LIVING_KEYS, LIVING_SHARES, splitLiving, loanFromOrigin, loanEndAgeMax, loanEndAgeMin, loanCurrentFrom, loanCurrentProvisional, loanSwitchToCurrent, hasInsurance, anyInsurance, regionOf, regionRent,
    EDU_PLAN, detailDefaults, detailOf, resolve, provisional, SECTION_KEYS, wageReady, WAGE_FREE, needsWage, spouseLeaveByPlan, spousePlanDecides,
  };
})();
