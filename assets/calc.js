/* プロトタイプ用の「仮の計算」
 * ⚠ 画面の見た目と操作を確認するためのダミーです。公的制度・教育費・修繕費などの金額は正式な値ではありません。
 *   本番の試算ロジックは設計工程で、出典・適用年度・確認日つきのデータファイルと手計算テストで作ります。
 */
(function () {
  "use strict";
  const Q = window.KSQ;

  const DUMMY = {
    takeHomeRate: 0.78,      // 額面→手取りの概算（既定。年収に応じて takeHome() で変える）
    pensionBase: 80,         // 老齢基礎年金の概算（年・万円）
    pensionEmployeeRate: 0.18,
    pensionAge: 65,
    survivorBase: 100,       // 遺族年金（子がいる間）の概算
    survivorEmployeeRate: 0.15,
    sickRate: 0.67,          // 休業中の手当の概算（会社員・公務員）
    disabilityMonthly: 6.5,
    funeral: 200,
    childAllowance: 15,      // 児童手当の概算（18歳まで・年額）
    leaveRate: 0.5,          // 育休・産休中の収入の概算（元の年収に対する割合）
    leaveYears: 2,           // 育休・産休が続く年数の仮置き
    endAge: 90,
    // 教育費（年額・万円）
    edu: {
      elem: { public: 35, private: 170 },    // 6〜11歳
      junior: { public: 55, private: 145 },  // 12〜14歳
      high: { public: 50, private: 105 },    // 15〜17歳
      univ: { national: 110, privArts: 150, privSci: 185, vocational: 130 },
      entrance: { national: 30, privArts: 25, privSci: 25, vocational: 20 },
      away: 100,                             // 下宿・一人暮らしの上乗せ
    },
  };

  // 生活費（住居費・教育費・車を除く）の内訳の目安。⚠ ダミーの割合（本番は総務省「家計調査」を出典にする）
  const LIVING_ITEMS = [
    { key: "food", label: "食費", ratio: 0.30 },
    { key: "utility", label: "水道・光熱費", ratio: 0.09 },
    { key: "comm", label: "通信費（スマホ・ネット）", ratio: 0.05 },
    { key: "daily", label: "日用品・家具・家電", ratio: 0.05 },
    { key: "clothes", label: "被服・美容", ratio: 0.05 },
    { key: "medical", label: "医療・健康", ratio: 0.05 },
    { key: "transport", label: "交通費（車以外）", ratio: 0.04 },
    { key: "insurance", label: "保険料（生命保険など）", ratio: 0.07 },
    { key: "leisure", label: "趣味・娯楽", ratio: 0.10 },
    { key: "allowance", label: "おこづかい・交際費", ratio: 0.12 },
    { key: "other", label: "その他", ratio: 0.08 },
  ];

  // 生活費を内訳に分ける。0.5万円単位で丸め、端数は「その他」で調整して合計を元の金額と一致させる
  function splitLiving(total) {
    const base = Math.round(total * 2) / 2;
    const out = Object.fromEntries(LIVING_ITEMS.map((it) => [it.key, Math.round(base * it.ratio * 2) / 2]));
    out.other = Math.max(0, base - LIVING_ITEMS.filter((it) => it.key !== "other").reduce((t, it) => t + out[it.key], 0));
    return out;
  }

  // 額面から手取りへのおおよその割合。収入が低いほど手取りの割合は高い（⚠ ダミーの値）
  // 年齢によって収入がどう変わるかの指数。
  // 公的統計（賃金構造基本統計調査の年齢階級別の賃金）から作る。**データが無ければ null を返し、横ばいで計算する**（推測しない）。
  // 60歳以降は、定年・再雇用の設定で計算するため、この指数は59歳で頭打ちにする（二重に下げないため）。
  // 指数を止める年齢（55〜59歳階級の代表年齢）。データ側で指定があればそれに従う
  function wageCapAge() {
    const W = window.KSDATA && window.KSDATA.wage;
    return (W && Number(W.capAge)) || 57;
  }

  function wageSeries(workKind) {
    const W = window.KSDATA && window.KSDATA.wage;
    if (!W || !W.series || !W.map) return null;
    const key = W.map[workKind];
    return key ? W.series[key] || null : null;
  }

  // 年齢階級の代表年齢のあいだを、まっすぐ結んで読む
  function wageAt(series, ageAt) {
    const pts = series.points;
    const x = Math.min(Math.max(ageAt, pts[0].age), Math.min(pts[pts.length - 1].age, wageCapAge()));
    for (let i = 0; i < pts.length - 1; i++) {
      if (x >= pts[i].age && x <= pts[i + 1].age) {
        const t = (x - pts[i].age) / (pts[i + 1].age - pts[i].age);
        return pts[i].value + (pts[i + 1].value - pts[i].value) * t;
      }
    }
    return pts[pts.length - 1].value;
  }

  // fromAge の収入を1としたときの、toAge の収入の倍率
  function wageFactor(workKind, fromAge, toAge) {
    const s = wageSeries(workKind);
    if (!s) return null;
    const from = wageAt(s, fromAge);
    if (!from) return null;
    return wageAt(s, toAge) / from;
  }

  // いまの年収が、同じ年齢の平均からどれくらい離れているか。
  // 「年齢に応じて」は平均の増え方をそのまま掛けるため、平均から大きく離れた人ほど、実際とずれやすい。
  const FAR_HIGH = 1.8, FAR_LOW = 0.55;
  function incomeVsAverage(workKind, ageNow, incomeMan) {
    const W = window.KSDATA && window.KSDATA.wage;
    // パート・時短・育休は、フルタイムの平均と「水準」を比べても意味がない（労働時間が違う）
    if (!W || !(W.levelCompare || []).includes(workKind)) return null;
    const s = wageSeries(workKind);
    if (!s || !incomeMan) return null;
    const avgMan = wageAt(s, ageNow) / 10;  // 千円/年 → 万円/年
    if (!avgMan) return null;
    const ratio = incomeMan / avgMan;
    return { avg: Math.round(avgMan), ratio: Math.round(ratio * 100) / 100, far: ratio > FAR_HIGH || ratio < FAR_LOW };
  }

  // 元利均等返済。金利0%でも割り算が壊れないようにする
  function loanFromOrigin(loan, age) {
    const P = Number(loan.borrowed) || 0;
    const years = Math.max(1, Number(loan.years) || 0);
    const ago = Math.min(Math.max(0, Number(loan.startedAgo) || 0), years);
    const r = (Number(loan.rate) || 0) / 100 / 12;
    const n = years * 12;
    const monthly = r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
    const k = ago * 12;                                  // これまでに返した回数
    const balance = r === 0
      ? Math.max(0, P - monthly * k)
      : Math.max(0, P * Math.pow(1 + r, k) - monthly * ((Math.pow(1 + r, k) - 1) / r));
    return {
      monthly: Math.round(monthly * 10) / 10,
      balance: Math.round(balance),
      endAge: Number(age) + (years - ago),
      paid: ago,
      years: years,
    };
  }

  function takeHome(income) {
    const y = Number(income) || 0;
    if (y < 200) return 0.84;
    if (y < 300) return 0.82;
    if (y < 500) return 0.80;
    if (y < 700) return 0.77;
    if (y < 1000) return 0.75;
    return 0.72;
  }

  const EDU_PLAN = {
    public: { elem: "public", junior: "public", high: "public", univ: "national" },
    univPrivate: { elem: "public", junior: "public", high: "public", univ: "privArts" },
    highPrivate: { elem: "public", junior: "public", high: "private", univ: "privArts" },
    juniorPrivate: { elem: "public", junior: "private", high: "private", univ: "privArts" },
    allPrivate: { elem: "private", junior: "private", high: "private", univ: "privArts" },
    noUniv: { elem: "public", junior: "public", high: "public", univ: "none" },
    unknown: { elem: "public", junior: "public", high: "public", univ: "privArts" },
  };

  // くわしく入力の初期値（かんたんの回答から作る）
  function detailDefaults(a, nPlanned) {
    const plan = EDU_PLAN[a.eduPlan] || EDU_PLAN.unknown;
    const nKids = (a.kids === "yes" ? Number(a.kidsCount) || 0 : 0) + (Number(nPlanned) || 0);
    const nCars = Number(a.cars) || 0;
    const livingMid = Q.mid("living", a);
    return {
      set: {},
      family: { planned: a.kids === "plan" && a.kidPlanIn !== undefined ? [{ inYears: Number(a.kidPlanIn) || 3 }] : [] },
      living: splitLiving(livingMid == null ? 25 : livingMid),
      retire: { ratio: 85 },
      kids: Array.from({ length: nKids }, () => Object.assign({ away: "home", lessons: 0, lessonsUntil: 18 }, plan)),
      cars: Array.from({ length: nCars }, (_, i) => ({ nextIn: i === 0 ? 5 : 8, budget: 250, interval: 10, upkeep: 35, until: Math.max(75, Number(a.age) + 10) })),
      // 住宅ローンは「借りたときの内容」から入れられるようにする（残高は覚えていないことが多いため）
      loan: {
        input: "origin",           // origin＝借りたときの内容から計算／current＝いまの返済額と残高を直接入れる
        borrowed: 3000,            // 借りた金額（万円）
        years: 35,                 // 借りた期間（年）
        startedAgo: 5,             // 何年前から返済しているか
        rate: 1,                   // 金利（年%）
        monthly: 10, endAge: 65, balance: 2000,
        dansin: "yes", bonus: 0, prepayOn: "no", prepayAge: Number(a.age) + 3, prepayAmount: 100,
      },
      rent: { monthly: Q.mid("rent", a) ?? 8, renewal: 1 },
      move: { on: "no", age: Number(a.age) + 5, cost: 100, monthly: 10 },
      assets: { cash: null, invest: null, monthly: 0 },
      loans: [],
      // かんたん入力で答えた死亡保障の帯を、くわしく入力の初期値にする（答えていなければ0）
      insurance: { death: Number(Q.mid("insuredDeathBand", a) || 0), medical: "unknown", disability: 0 },
      house: { built: 10, paintEvery: 12, paintCost: 120, waterEvery: 15, waterCost: 60, tax: 12 },
      mansion: { built: 10, monthly: 3, raise: 20, tax: 10 },
      purchase: { on: "no", age: Math.max(30, Number(a.age) + 3), type: "house", price: 4000, down: 400, years: 35, rate: 1, cost: 280 },
      rebuild: { on: "no", age: Math.max(55, Number(a.age) + 15), budget: 1000 },
      care: { on: "no", startAge: Math.max(50, Number(a.age) + 10), years: 5, monthly: 5 },
      spend: { travel: 0, travelUntil: 75, items: [] },
      work: { retireAge: 65, rehire: 0, rehireUntil: 65, allowance: 0, change: "no", changeAge: Number(a.age) + 5, changeIncome: "i3", growth: "stat", pension: 0, side: 0, sideUntil: 65 },
      spouseWork: { growth: "stat", plan: "same", planFrom: 1, planYears: 2, planRate: 50, returnIncome: "i2", retireAge: 65, pension: 0 },
    };
  }

  // 保存済みのくわしく入力と、初期値を合わせる（子・車の数は、かんたん／くわしくの設定に合わせる）
  function detailOf(data) {
    const a = data.answers;
    const saved = data.detail || {};
    const nPlanned = ((saved.family && saved.family.planned) || []).length;
    const def = detailDefaults(a, nPlanned);
    const out = {};
    Object.keys(def).forEach((k) => {
      if (Array.isArray(def[k])) out[k] = saved[k] ? saved[k] : def[k];
      else out[k] = Object.assign({}, def[k], saved[k] || {});
    });
    out.kids = def.kids.map((dk, i) => Object.assign({}, dk, (saved.kids || [])[i] || {}));
    if (!saved.set || !saved.set.car) out.cars = def.cars;
    out.set = Object.assign({}, saved.set || {});
    out.spend.items = (out.spend.items || []).filter((it) => it && it.age && it.amount);
    out.loans = (saved.loans || []).filter((l) => l && l.monthly);
    return out;
  }

  function compute(data) {
    const a = data.answers;
    const as = data.assumptions;
    const D = detailOf(data);
    const provisional = [];

    const age = Number(a.age);
    const work = a.work;
    let income = work === "none" ? 0 : Q.mid("income", a);
    if (income === null || income === undefined) { income = work === "none" ? 0 : 450; if (work !== "none") provisional.push("年収"); }
    const spouse = a.spouse === "yes";
    const spouseAge = spouse ? Number(a.spouseAge) : null;
    let spouseIncome = 0;
    if (spouse && a.spouseWork !== "none") {
      spouseIncome = Q.mid("spouseIncome", a);
      if (spouseIncome === null || spouseIncome === undefined) { spouseIncome = 100; provisional.push("配偶者の年収"); }
    }
    const kidsNow = a.kids === "yes" ? (a.kidsAges || []).map(Number) : [];
    const planned = (D.family.planned || []).map((p) => -Number(p.inYears));  // これから生まれる子は、いまの年齢をマイナスで持つ
    const kids = kidsNow.concat(planned);
    const household = 1 + (spouse ? 1 : 0) + kidsNow.length;
    let living = Q.mid("living", a);
    let livingSource = "answer";
    if (D.set.living) { living = LIVING_ITEMS.reduce((t, it) => t + Number(D.living[it.key] || 0), 0); livingSource = "detail"; }
    else if (living == null) { living = Math.min(40, 10 + household * 3.5); provisional.push("毎月の生活費"); livingSource = "provisional"; }
    let savings = Q.mid("savings", a);
    const assetsSplit = D.set.assets && D.assets.cash !== null && D.assets.invest !== null;
    if (assetsSplit) savings = Number(D.assets.cash) + Number(D.assets.invest);
    else if (savings == null) { savings = 300; provisional.push("貯蓄"); }
    const home = a.home;
    const owns = home === "loan" || home === "own";
    const homeType = a.homeType;
    const renting = home === "rent" || home === "plan";

    if (kidsNow.length && a.eduPlan === "unknown" && !D.set.edu) provisional.push("進学（高校まで公立・大学は私立で仮置き）");
    if (!D.set.work) provisional.push("定年65歳・退職金なし・年金は概算（くわしく入力で設定できます）");
    if (!D.set.living) provisional.push(`老後の生活費（現役の${D.retire.ratio}%で仮置き）`);
    if (a.insured === "yes" && !D.set.insurance) {
      const band = Q.mid("insuredDeathBand", a);
      provisional.push(band === null || band === undefined
        ? "加入中の保険の保障額（未入力のため含めていません）"
        : `加入中の保険の死亡保障（だいたい${KS.man(band)}で計算。医療・就業不能の保障は未入力）`);
    }
    const loanBand = a.otherLoan === "yes" ? Q.mid("otherLoanLeft", a) : null;
    if (a.otherLoan === "yes" && !D.loans.length) {
      provisional.push(loanBand === null || loanBand === undefined
        ? "住宅ローン以外の借入れ（未入力のため0円で計算）"
        : `住宅ローン以外の借入れ（残高 約${KS.man(loanBand)}・毎月の返済額は未入力）`);
    }
    if (D.cars.length && !D.set.car) provisional.push("車（10年ごと・250万円で買い替え、維持費 年35万円で仮置き）");
    if (!D.set.home) {
      if (home === "loan") provisional.push("住宅ローン（返済 月10万円・65歳完済・団信ありで仮置き）");
      if (renting && (a.rent === undefined || a.rent === "unknown")) provisional.push("家賃（月8万円で仮置き）");
      if (owns && homeType === "house") provisional.push("修繕費・固定資産税（築10年・塗装12年ごと120万円、税 年12万円などで仮置き）");
      if (owns && homeType === "mansion") provisional.push("修繕積立金・管理費・固定資産税（月3万円、税 年10万円で仮置き）");
    }

    const inf = as.inflation / 100;
    const ret = as.ret / 100;
    const year0 = new Date().getFullYear();
    const span = DUMMY.endAge - age;
    const EMPLOYEE_LIKE = ["employee", "civil", "leave", "short"];
    const employeeLike = EMPLOYEE_LIKE.includes(work);
    const W = D.work;
    const retireAge = Number(W.retireAge);
    // 「何歳まで働くか」が定年以下だと、再雇用の収入が1年も入らない。定年の翌年以降に直す
    const rehireUntil = Math.max(Number(W.rehireUntil) || 0, retireAge + 1);

    const SW = D.spouseWork;
    const pensionSelf = Number(W.pension) > 0 ? Number(W.pension) : DUMMY.pensionBase + (employeeLike ? Math.min(income, 1000) * DUMMY.pensionEmployeeRate : 0);
    const spouseEmployee = EMPLOYEE_LIKE.includes(a.spouseWork);
    const pensionSpouse = !spouse ? 0 : Number(SW.pension) > 0 ? Number(SW.pension) : DUMMY.pensionBase + (spouseEmployee ? Math.min(spouseIncome, 1000) * DUMMY.pensionEmployeeRate : 0);
    const GROWTH = { flat: 0, up: 0.01, down: -0.01 };
    // 収入の変わり方。"stat"＝公的統計の年齢別の賃金から。読めなければ横ばいに落とす
    let wageFallback = false;
    function incomeFactor(mode, workKind, refAge, atAge, years) {
      if (mode === "stat") {
        const f = wageFactor(workKind, refAge, atAge);
        if (f !== null) return f;
        wageFallback = true;
        return 1;
      }
      return Math.pow(1 + GROWTH[mode || "flat"], years);
    }

    // ── 年ごとの出来事（一時的な支出・収入）を先に並べる ──
    const oneTime = {};  // offset -> {housing, car, other, income, repair}
    const lifeEvents = [];  // 年表「くらし」の行
    const at = (off) => (oneTime[off] = oneTime[off] || { housing: 0, repair: 0, car: 0, other: 0, income: 0 });
    const inSpan = (off) => off >= 0 && off <= span;

    // 車
    D.cars.forEach((c, ci) => {
      let off = Number(c.nextIn);
      const untilOff = Number(c.until) - age;
      while (inSpan(off) && off <= untilOff - 3) {
        at(off).car += Number(c.budget);
        lifeEvents.push({ offset: off, short: "車", text: `車${D.cars.length > 1 ? ci + 1 : ""}の買い替え（約${KS.man(c.budget)}）`, kind: "car", amount: Number(c.budget) });
        off += Number(c.interval);
      }
    });

    // 住宅購入
    let purchaseOff = null, purchaseLoan = 0, purchaseLoanYears = 0;
    const P = D.purchase;
    if (!owns && P.on === "yes") {
      purchaseOff = Number(P.age) - age;
      if (inSpan(purchaseOff)) {
        at(purchaseOff).housing += Number(P.down) + Number(P.cost || 0);
        const principal = Math.max(0, Number(P.price) - Number(P.down));
        const r = Number(P.rate) / 100, n = Number(P.years);
        purchaseLoan = r > 0 ? (principal * r) / (1 - Math.pow(1 + r, -n)) : principal / n;
        purchaseLoanYears = n;
        lifeEvents.push({ offset: purchaseOff, short: "購入", text: `住宅の購入（${P.type === "house" ? "戸建て" : "マンション"}・頭金${KS.man(P.down)}＋諸費用${KS.man(P.cost || 0)}）`, kind: "home", amount: Number(P.down) + Number(P.cost || 0) });
      } else purchaseOff = null;
    }
    // 修繕（戸建て）。今の家、または購入する家
    const houseRepairs = (builtNow, fromOff) => {
      const H = D.house;
      [["paint", "塗装", "外壁・屋根の塗装", H.paintEvery, H.paintCost], ["water", "水回り", "水回り・給湯器の交換", H.waterEvery, H.waterCost]].forEach(([, short, text, every, cost]) => {
        every = Number(every); cost = Number(cost);
        for (let k = 1; k * every <= builtNow + span + 1; k++) {
          const off = fromOff + (k * every - builtNow);
          if (off < Math.max(0, fromOff) || !inSpan(off)) continue;
          if (rebuildOff !== null && off >= rebuildOff) break;
          at(off).repair += cost;
          lifeEvents.push({ offset: off, short, text: `${text}（約${KS.man(cost)}・目安）`, kind: "repair", amount: cost });
        }
      });
    };
    // 建て替え・大規模リフォーム
    let rebuildOff = null;
    if (owns && D.rebuild.on === "yes") {
      rebuildOff = Number(D.rebuild.age) - age;
      if (inSpan(rebuildOff)) {
        at(rebuildOff).repair += Number(D.rebuild.budget);
        lifeEvents.push({ offset: rebuildOff, short: "建替", text: `建て替え・大規模リフォーム（約${KS.man(D.rebuild.budget)}）`, kind: "home", amount: Number(D.rebuild.budget) });
      } else rebuildOff = null;
    }
    if (owns && homeType === "house") {
      houseRepairs(Number(D.house.built), 0);
      if (rebuildOff !== null) { const save = rebuildOff; rebuildOff = null; houseRepairs(0, save); rebuildOff = save; }
    }
    if (purchaseOff !== null && P.type === "house") houseRepairs(0, purchaseOff);

    // 住宅ローン：ボーナス返済・繰り上げ返済・入力の整合
    // 「借りたときの内容から計算する」を選んでいるときは、そこから毎月の返済額・残高・完済年齢を出す
    const loanView = home === "loan" && D.loan.input !== "current" ? loanFromOrigin(D.loan, age) : null;
    const loanMonthly = home === "loan" ? Number(loanView ? loanView.monthly : D.loan.monthly) : 0;
    const loanBalance = home === "loan" ? Number(loanView ? loanView.balance : D.loan.balance) : 0;
    const loanYearly = home === "loan" ? loanMonthly * 12 + Number(D.loan.bonus || 0) : 0;
    let loanEndAge = home === "loan" ? Number(loanView ? loanView.endAge : D.loan.endAge) : null;
    let prepayOff = null;
    if (home === "loan" && D.loan.prepayOn === "yes") {
      prepayOff = Number(D.loan.prepayAge) - age;
      const shorten = loanYearly > 0 ? Math.floor(Number(D.loan.prepayAmount) / loanYearly) : 0;
      // 繰り上げ返済が完済後の年齢に設定されていたら、何も起きない
      if (inSpan(prepayOff) && age + prepayOff < loanEndAge) {
        at(prepayOff).housing += Number(D.loan.prepayAmount);
        // 早まることはあっても、延びることはない
        loanEndAge = Math.min(loanEndAge, Math.max(age + prepayOff, loanEndAge - shorten));
        lifeEvents.push({ offset: prepayOff, short: "繰上", text: `住宅ローンの繰り上げ返済（約${KS.man(D.loan.prepayAmount)}）。完済が約${shorten}年早まる計算`, kind: "home", amount: Number(D.loan.prepayAmount) });
      } else prepayOff = null;
    }
    // 残高・返済額・完済年齢の食い違い（利息があるため、ゆるめに判定）
    let loanMismatch = null;
    // 借りたときの内容から計算した場合は、値どうしが必ず整合するので検査しない。
    // 残高を直接入れたときだけ、食い違いを見る
    if (home === "loan" && loanYearly > 0 && D.set.loan && D.loan.input === "current") {
      const years = Math.max(0, Number(D.loan.endAge) - age);
      const total = loanYearly * years;
      if (total > 0) {
        if (Number(D.loan.balance) > total * 1.15) loanMismatch = `残高（${KS.man(D.loan.balance)}）に対して、完済年齢までの返済額の合計（約${KS.man(total)}）が少なすぎます。返済額か完済年齢を確認してください。`;
        else if (Number(D.loan.balance) < total * 0.7) loanMismatch = `残高（${KS.man(D.loan.balance)}）に対して、完済年齢までの返済額の合計（約${KS.man(total)}）が多すぎます。もっと早く完済になるかもしれません。`;
      }
    }
    if (loanMismatch) provisional.push("住宅ローンの入力に食い違いがあります（「計算に使っている毎月の支出」で確認）");

    // 住み替え（その年に費用、以降の住居費を置き換える）
    let moveOff = null;
    if (D.move.on === "yes") {
      moveOff = Number(D.move.age) - age;
      if (inSpan(moveOff)) {
        at(moveOff).housing += Number(D.move.cost);
        lifeEvents.push({ offset: moveOff, short: "住替", text: `住み替え（費用 約${KS.man(D.move.cost)}、以降の住居費 月${KS.man(D.move.monthly)}）`, kind: "home", amount: Number(D.move.cost) });
        // 住み替えたあとは、前の家の修繕は発生しない
        Object.keys(oneTime).forEach((k) => { if (Number(k) >= moveOff) oneTime[k].repair = 0; });
        for (let i = lifeEvents.length - 1; i >= 0; i--) {
          if (lifeEvents[i].kind === "repair" && lifeEvents[i].offset >= moveOff) lifeEvents.splice(i, 1);
        }
      } else moveOff = null;
    }

    // 介護
    if (D.care.on === "yes") {
      const off0 = Number(D.care.startAge) - age;
      for (let y = 0; y < Number(D.care.years); y++) if (inSpan(off0 + y)) at(off0 + y).other += Number(D.care.monthly) * 12;
      if (inSpan(off0)) lifeEvents.push({ offset: off0, short: "介護", text: `親の介護が始まる想定（月${KS.man(D.care.monthly)}×${D.care.years}年）`, kind: "care", amount: Number(D.care.monthly) * 12 });
    }
    // 大きな出費
    D.spend.items.forEach((it) => {
      const off = Number(it.age) - age;
      if (!inSpan(off)) return;
      at(off).other += Number(it.amount);
      lifeEvents.push({ offset: off, short: "出費", text: `${it.label || "大きな出費"}（約${KS.man(it.amount)}）`, kind: "spend", amount: Number(it.amount) });
    });
    // 退職金・転職
    if (Number(W.allowance) > 0 && inSpan(retireAge - age)) at(retireAge - age).income += Number(W.allowance);
    const changeOff = W.change === "yes" ? Number(W.changeAge) - age : null;
    const changedIncome = W.change === "yes" ? (Q.option(Q.byId.income, W.changeIncome)?.mid ?? income) : income;
    if (changeOff !== null && inSpan(changeOff)) lifeEvents.push({ offset: changeOff, short: "転職", text: `転職・独立（年収 ${Q.option(Q.byId.income, W.changeIncome)?.label ?? ""}）`, kind: "work", amount: 0 });

    const eduPlanOf = (i) => D.kids[i] || EDU_PLAN.unknown;
    const eduCost = (i, kidAge) => {
      const p = eduPlanOf(i);
      if (kidAge < 0) return 0;
      const lessons = kidAge >= 3 && kidAge < Number(p.lessonsUntil || 18) ? Number(p.lessons || 0) * 12 : 0;
      return lessons + schoolCost(p, kidAge);
    };
    const schoolCost = (p, kidAge) => {
      const E = DUMMY.edu;
      if (kidAge >= 6 && kidAge <= 11) return E.elem[p.elem] || 0;
      if (kidAge >= 12 && kidAge <= 14) return E.junior[p.junior] || 0;
      if (kidAge >= 15 && kidAge <= 17) return E.high[p.high] || 0;
      if (p.univ === "none") return 0;
      const last = p.univ === "vocational" ? 19 : 21;
      if (kidAge >= 18 && kidAge <= last) return E.univ[p.univ] + (kidAge === 18 ? E.entrance[p.univ] : 0) + (p.away === "away" ? E.away : 0);
      return 0;
    };
    const independAge = (i) => { const p = eduPlanOf(i); return p.univ === "none" ? 18 : p.univ === "vocational" ? 20 : 22; };

    function housingCost(y) {
      const cur = age + y;
      let c = 0, fee = 0;
      if (moveOff !== null && y >= moveOff) return { base: Number(D.move.monthly) * 12, fee: 0 };
      if (home === "loan" && cur < loanEndAge) c += loanYearly;
      if (renting && (purchaseOff === null || y < purchaseOff)) c += Number(D.rent.monthly) * (12 + Number(D.rent.renewal) / 2);  // 更新料は2年ごと
      if (purchaseOff !== null && y >= purchaseOff && y < purchaseOff + purchaseLoanYears) c += purchaseLoan;
      const ownFrom = owns ? 0 : purchaseOff;
      const ownType = owns ? homeType : P.type;
      if (ownFrom !== null && y >= ownFrom) c += Number(ownType === "mansion" ? D.mansion.tax : D.house.tax);
      const mansionFrom = owns && homeType === "mansion" ? 0 : purchaseOff !== null && P.type === "mansion" ? purchaseOff : null;
      if (mansionFrom !== null && y >= mansionFrom) {
        fee = Number(D.mansion.monthly) * 12 * Math.pow(1 + Number(D.mansion.raise) / 100, Math.floor((y - mansionFrom) / 10));
        c += fee;
      }
      return { base: c, fee };
    }

    // 配偶者の今後の働き方による、その年の年収の倍率
    const spouseFactor = (y) => {
      const from = Number(SW.planFrom), to = from + Number(SW.planYears);
      if (SW.plan === "leave") return y >= from && y < to ? Number(SW.planRate) / 100 : 1;
      if (SW.plan === "quit") return y >= from ? 0 : 1;
      return 1;
    };
    const returnIncome = Q.option(Q.byId.spouseIncome, SW.returnIncome)?.mid ?? 100;

    function simulate(r) {
      // 貯蓄の内訳を入れた場合は「預貯金（運用しない）」と「投資（利回りで増える）」に分ける
      let cash = assetsSplit ? Number(D.assets.cash) : 0;
      let inv = assetsSplit ? Number(D.assets.invest) : savings;
      const contrib = assetsSplit ? Number(D.assets.monthly) * 12 : 0;
      const points = [];
      let shortageAge = null;
      for (let y = 0; y <= span; y++) {
        const cur = age + y;
        const ev = oneTime[y] || { housing: 0, repair: 0, car: 0, other: 0, income: 0 };
        const afterChange = changeOff !== null && y >= changeOff;
        const rawIncome = afterChange ? changedIncome : income;
        const refAge = afterChange ? Number(W.changeAge) : age;
        // 転職後は、転職した年を起点に数える（今からの年数だと初年度に数年分の昇給が乗る）
        const growthYears = afterChange ? y - changeOff : y;
        const workYears = Math.min(growthYears, Math.max(0, retireAge - age));
        const baseIncome = rawIncome * incomeFactor(W.growth, work, refAge, Math.min(cur, retireAge), workYears);
        const leaveFactor = (w, yy) => (w === "leave" && yy < DUMMY.leaveYears ? DUMMY.leaveRate : 1);
        let incWork = 0;
        if (cur < retireAge) incWork = baseIncome * leaveFactor(work, y) * takeHome(baseIncome);
        else if (Number(W.rehire) > 0 && cur < rehireUntil) incWork = baseIncome * (Number(W.rehire) / 100) * takeHome(baseIncome * (Number(W.rehire) / 100));
        if (Number(W.side) > 0 && cur < Number(W.sideUntil)) incWork += Number(W.side);
        let incPension = cur >= DUMMY.pensionAge ? pensionSelf : 0;
        let incSpouse = 0;
        if (spouse) {
          const sAge = spouseAge + y;
          const backToWork = SW.plan === "return" && y >= Number(SW.planFrom);
          const sRefAge = backToWork ? spouseAge + Number(SW.planFrom) : spouseAge;
          const sYears = backToWork ? y - Number(SW.planFrom) : y;
          const sBase = (backToWork ? returnIncome : spouseIncome)
            * incomeFactor(SW.growth, a.spouseWork, sRefAge, Math.min(sAge, Number(SW.retireAge)), sYears);
          if (sAge < Number(SW.retireAge)) incSpouse = sBase * spouseFactor(y) * leaveFactor(a.spouseWork, y) * takeHome(sBase);
          if (sAge >= DUMMY.pensionAge) incPension += pensionSpouse;
        }
        let incAllowance = 0;
        kids.forEach((k) => { if (k + y >= 0 && k + y < 18) incAllowance += DUMMY.childAllowance; });
        const incOther = ev.income;
        const inc = incWork + incPension + incSpouse + incAllowance + incOther;

        // すでに年金の年齢に達している人は「いまの生活費」を答えているので、老後の圧縮率は掛けない
        const retireRatio = age >= DUMMY.pensionAge ? 1 : Number(D.retire.ratio) / 100;
        const expLiving = living * 12 * Math.pow(1 + inf, y) * (cur >= DUMMY.pensionAge ? retireRatio : 1);
        const hc = housingCost(y);
        const expHousing = hc.base + ev.housing + ev.repair;
        let expEdu = 0;
        kids.forEach((k, i) => { expEdu += eduCost(i, k + y); });
        let expCar = ev.car;
        D.cars.forEach((c) => { if (cur < Number(c.until)) expCar += Number(c.upkeep); });
        let expLoan = 0;
        D.loans.forEach((l) => { if (cur < Number(l.endAge)) expLoan += Number(l.monthly) * 12; });
        let expOther = ev.other;
        if (Number(D.spend.travel) > 0 && cur < Number(D.spend.travelUntil)) expOther += Number(D.spend.travel);
        const exp = expLiving + expHousing + expEdu + expCar + expLoan + expOther;

        {
          if (assetsSplit) {
            const c = cur <= DUMMY.pensionAge ? contrib : 0;
            cash += inc - exp - c;
            inv = (inv + c) * (inv > 0 ? 1 + r : 1);
          } else {
            inv = inv * (inv > 0 ? 1 + r : 1) + inc - exp;
          }
        }
        const balance = cash + inv;
        points.push({
          age: cur, year: year0 + y, balance: Math.round(balance), income: Math.round(inc), expense: Math.round(exp),
          inc: { work: incWork, spouse: incSpouse, pension: incPension, allowance: incAllowance, lump: incOther },
          exp: { living: expLiving, housing: expHousing, repair: ev.repair, edu: expEdu, car: expCar, loan: expLoan, other: expOther },
        });
        if (shortageAge === null && balance < 0) shortageAge = cur;
      }
      return { points, shortageAge };
    }
    const sim0 = simulate(0);
    const simR = ret > 0 ? simulate(ret) : null;

    // 万一のとき（死亡）
    const youngest = kidsNow.length ? Math.min(...kidsNow) : null;
    // 末子が独立するまで。配偶者がいる場合は、それが短くても最低5年は見る
    const years = Math.max(
      spouse ? 5 : 0,
      kidsNow.length ? Math.max(0, Math.max(...kidsNow.map((k, i) => independAge(i) - k))) : 0
    );
    const bandDeath = a.insured === "yes" ? Q.mid("insuredDeathBand", a) : null;
    const insuredDeath = a.insured === "yes"
      ? (D.set.insurance ? Number(D.insurance.death) : (bandDeath === null || bandDeath === undefined ? 0 : Number(bandDeath)))
      : 0;
    const insuredDisability = a.insured === "yes" && D.set.insurance ? Number(D.insurance.disability) : 0;
    let death = null;
    if (spouse || kidsNow.length) {
      const eduRemain = kidsNow.reduce((s, k, i) => { let t = 0; for (let x = k; x <= 21; x++) t += eduCost(i, x); return s + t; }, 0);
      const loanLeft = home === "loan" && D.loan.dansin !== "yes" ? Math.min(loanBalance, loanYearly * Math.max(0, loanEndAge - age)) : 0;
      // 奨学金は、本人が亡くなったときに返還が免除される制度があるため、ここでは残さない（要確認）
      const bandLoanLeft = a.otherLoan === "yes" ? Q.mid("otherLoanLeft", a) : null;
      const otherLoanLeft = D.loans.length
        ? D.loans.filter((l) => l.kind !== "shougakukin").reduce((t, l) => t + Number(l.balance || 0), 0)
        : (bandLoanLeft === null || bandLoanLeft === undefined ? 0 : Number(bandLoanLeft));
      const rent = renting ? Number(D.rent.monthly) * 12 * years : 0;
      const pensionYears = kidsNow.length ? Math.max(0, 18 - youngest) : 0;
      const survivorPension = pensionYears * (DUMMY.survivorBase + (employeeLike ? income * DUMMY.survivorEmployeeRate : 0));
      const spouseInc = spouse ? spouseIncome * takeHome(spouseIncome) * years : 0;
      const calc = (ratio) => {
        const expense = living * 12 * ratio * years + eduRemain + rent + loanLeft + otherLoanLeft + DUMMY.funeral;
        return { expense, need: Math.max(0, expense - survivorPension - spouseInc - savings - insuredDeath) };
      };
      const lo = calc(as.ratioLow / 100), hi = calc(as.ratioHigh / 100);
      death = {
        years, low: round100(lo.need), high: round100(hi.need),
        breakdown: { expenseLow: lo.expense, expenseHigh: hi.expense, eduRemain, rent, loanLeft, otherLoanLeft, survivorPension, spouseInc, savings, insuredDeath, loanNote: home === "loan" && D.loan.dansin === "yes", shougakukin: D.loans.some((l) => l.kind === "shougakukin") },
      };
    }

    // 働けなくなったとき（月あたり）
    const monthlyNeed = living + housingCost(0).base / 12;
    const spouseMonthly = spouse ? (spouseIncome * takeHome(spouseIncome)) / 12 : 0;
    const sickMonthly = employeeLike ? (income / 12) * DUMMY.sickRate : 0;
    const disability = {
      first: Math.max(0, monthlyNeed - sickMonthly - spouseMonthly - insuredDisability),
      after: Math.max(0, monthlyNeed - DUMMY.disabilityMonthly - (employeeLike ? 5 : 0) - spouseMonthly - insuredDisability),
      hasSick: employeeLike,
    };

    // 老後
    let retire = null;
    if (age < DUMMY.pensionAge) {
      const yrs = DUMMY.endAge - DUMMY.pensionAge;
      const need = living * 12 * (Number(D.retire.ratio) / 100) * Math.pow(1 + inf, DUMMY.pensionAge - age) * yrs - (pensionSelf + pensionSpouse) * yrs;
      const at65 = (sim) => sim.points.find((p) => p.age === DUMMY.pensionAge)?.balance ?? 0;
      const gap0 = Math.max(0, need - Math.max(0, at65(sim0)));
      const months = (DUMMY.pensionAge - age) * 12;
      const monthly = (gap, r) => {
        if (gap <= 0 || months <= 0) return 0;
        if (r <= 0) return gap / months;
        const i = r / 12;
        return (gap * i) / (Math.pow(1 + i, months) - 1);
      };
      retire = {
        gap0: round100(gap0),
        monthly0: monthly(gap0, 0),
        gapR: simR ? round100(Math.max(0, need - Math.max(0, at65(simR)))) : null,
        monthlyR: simR ? monthly(Math.max(0, need - Math.max(0, at65(simR))), ret) : null,
      };
    }

    // やることリスト（一般的な優先順: 生活防衛資金 → 保障 → 教育 → 近い大きな出費 → 老後）
    // 最後に、利用者が「考えたい」と選んだ分野のものを前に出す（内容は変えず、順番だけ）
    const FIELD_TODOS = {
      insurance: ["death", "disability", "loan"],
      invest: ["retire", "emergency"],
      home: ["loan", "soon"],
      edu: ["edu"],
      retire: ["retire"],
      fixed: ["cash", "emergency"],
    };
    const wanted = new Set();
    const chosen = a.fields || [];
    if (!chosen.includes("all")) chosen.forEach((f) => (FIELD_TODOS[f] || []).forEach((k) => wanted.add(k)));
    const todos = [];
    // 「生活費＋住居費」の何か月分か。天気の判定（後述）と同じ定義にそろえる
    const months = savings / Math.max(1, living + housingCost(0).base / 12);
    if (months < 6) {
      todos.push({ key: "emergency", when: "今すぐ", title: "急な出費に備える貯蓄を確認する",
        reason: `貯蓄が、毎月の生活費と住居費の約${Math.max(0, Math.round(months))}か月分です。一般に、半年分ほどを目安にする考え方があります。`,
        link: { href: "/sources/", text: "貯蓄の考え方を読む" } });
    }
    if (death && death.high > 0) {
      todos.push({ key: "death", when: "今すぐ", title: "万一のときの保障額を確認する",
        reason: kids.length
          ? `お子さんが独立するまでの支出が、遺族年金・配偶者の収入・貯蓄だけでは約${KS.man(death.low)}〜${KS.man(death.high)}不足する見込みです。`
          : `ご家族の生活費が、配偶者の収入と貯蓄だけでは約${KS.man(death.low)}〜${KS.man(death.high)}不足する見込みです。`,
        link: { href: "/sources/", text: "保障の考え方を読む" } });
    }
    if (work === "self") {
      todos.push({ key: "disability", when: "今すぐ", title: "働けなくなったときの備えを確認する",
        reason: "自営業・フリーランスには、会社員のような休業中の手当がありません。",
        link: { href: "/sources/", text: "働けなくなったときの備えを読む" } });
    }
    // 教育費のピーク（最も教育費が多い年）
    if (kids.length) {
      const peak = sim0.points.reduce((m, p) => (p.exp.edu > m.exp.edu ? p : m), sim0.points[0]);
      if (peak.exp.edu > 0 && peak.age > age) {
        todos.push({ key: "edu", when: `${peak.age - age}年以内`, title: "教育費の準備を始める時期を決める",
          reason: `教育費がいちばん多いのは${peak.year}年（あなたが${peak.age}歳）で、その年は約${KS.man(peak.exp.edu)}の見込みです。`,
          link: { href: "/sources/", text: "教育費の準備を読む" } });
      }
    }
    const soon = lifeEvents.filter((e) => e.offset > 0 && e.offset <= 5 && e.amount >= 50).sort((x, y) => x.offset - y.offset)[0];
    if (soon) {
      const title = { car: "車の買い替え資金を準備する", repair: "住まいの修繕費を準備する", home: "住まいの大きな出費に備える", spend: "予定している大きな出費に備える", care: "親の介護について家族で話し合う" }[soon.kind] || "予定している出費に備える";
      todos.push({ key: "soon", when: `${soon.offset}年以内`, title,
        reason: `${year0 + soon.offset}年（${age + soon.offset}歳）に「${soon.text}」を見込んでいます。`,
        link: { href: "/sources/", text: "大きな出費への備え方を読む" } });
    }
    if (D.care.on === "yes" && !(soon && soon.kind === "care")) {
      todos.push({ key: "care", when: `${Math.max(0, D.care.startAge - age)}年以内`, title: "親の介護について家族で話し合う",
        reason: `${D.care.startAge}歳ごろから、年約${KS.man(D.care.monthly * 12)}の負担を見込んでいます。`,
        link: { href: "/sources/", text: "介護とお金を読む" } });
    }
    if (retire && retire.gap0 > 0) {
      todos.push({ key: "retire", when: `${DUMMY.pensionAge - age}年以内`, title: "老後資金の積立を検討する",
        reason: `65歳時点で約${KS.man(retire.gap0)}不足する見込みです（運用しない場合）。毎月約${KS.man(retire.monthly0)}の積立で埋まる計算です。`,
        link: { href: "/sources/", text: "公的な情報を見る" } });
    }
    if (home === "loan") {
      todos.push({ key: "loan", when: "次の相談時", title: "住宅ローンと保障の重なりを確認する",
        reason: "団信に入っていれば、万一のときローン残高がなくなり、必要な保障額が変わります。",
        link: { href: "/sources/", text: "住宅ローンと保障を読む" } });
    }
    if (sim0.shortageAge !== null) {
      todos.push({ key: "cash", when: "見直しの目安", title: "家計の見通しを見直す",
        reason: `運用しない場合、${sim0.shortageAge}歳ごろに貯蓄が底をつく見込みです。`,
        link: { href: "/sources/", text: "家計の見直し方を読む" } });
    }

    // 保険の種類ごとの優先度（3段階）
    const L1 = { cls: "l1", text: "優先して検討" }, L2 = { cls: "l2", text: "状況により検討" }, L3 = { cls: "l3", text: "公的保障・貯蓄で賄える可能性が高い" };
    const insurance = [
      { name: "死亡保障", level: death && death.high > 0 && kids.length ? L1 : spouse ? L2 : L3,
        reason: death && death.high > 0 ? "ご家族の生活費が、公的保障と貯蓄だけでは不足する見込みです。" : "扶養しているご家族がいない場合、大きな保障の必要性は低めです。" },
      { name: "医療保障", level: savings >= 100 ? L3 : L2,
        reason: "高額療養費制度により、1か月の医療費の自己負担には上限があります。差額ベッド代など対象外の費用を貯蓄で賄えるかがポイントです。" },
      { name: "働けなくなったときの保障", level: work === "self" ? L1 : L2,
        reason: work === "self" ? "休業中の手当がないため、収入が途絶えやすい働き方です。" : "休業中の手当はありますが、長期化したときの生活費は、確認しておきたいところです。" },
      { name: "個人賠償責任", level: L2, reason: "自転車事故などで他人にけがをさせた場合の備えです。" },
    ];

    // 選んだ分野のものを前に出す（同じ分野の中では、もとの順番のまま）
    if (wanted.size) {
      todos.sort((x, y) => (wanted.has(y.key) ? 1 : 0) - (wanted.has(x.key) ? 1 : 0));
    }

    // 専門家に聞くこと
    const ask = [];
    if (home === "loan") ask.push({ q: "団信の保障内容と、死亡保障の重なり", who: "保険相談員・金融機関" });
    ask.push({ q: "健康状態について告知が必要な場合の扱い", who: "保険相談員" });
    if (kids.length || a.kids === "plan") ask.push({ q: "教育費の準備方法の選択肢", who: "FP" });
    if (work === "self") ask.push({ q: "自営業の老後の年金を増やす制度の使い方", who: "年金事務所・FP" });
    if (retire && retire.gap0 > 0) ask.push({ q: "積立投資の税制優遇（NISA・iDeCo）の使い方", who: "FP・金融機関" });
    if (P.on === "yes" && !owns) ask.push({ q: "住宅購入の予算と、無理のない返済額", who: "FP" });
    if (owns && homeType === "house") ask.push({ q: "修繕費をどう積み立てるか", who: "FP" });
    if (D.care.on === "yes") ask.push({ q: "介護が始まったときに使える公的な制度", who: "地域包括支援センター" });
    if (a.insured === "yes") ask.push({ q: "加入中の保険の保障内容が、いまの家族構成に合っているか", who: "保険相談員" });
    if (work === "self" && (a.selfPension || []).includes("none")) ask.push({ q: "自営業の上乗せの年金・退職金の代わりになる制度（国民年金基金・iDeCo・小規模企業共済など）", who: "年金事務所・商工会・FP" });
    if (D.loans.some((l) => l.kind === "shougakukin")) ask.push({ q: "奨学金の返還が免除・猶予される場合の条件", who: "日本学生支援機構など貸与元" });
    if (planned.length) ask.push({ q: "出産・育児のときに使える公的な給付", who: "勤務先・自治体" });
    // 「気になっていること」で選んだものを、聞くことに反映する
    const WORRY_ASK = {
      death: { q: "万一のときに必要な保障額の考え方（遺族年金を差し引いたあとの不足分）", who: "保険相談員・FP" },
      sick: { q: "働けなくなったときに使える公的な制度と、勤務先の制度", who: "勤務先・健康保険の窓口" },
      edu: { q: "教育費の準備を、いつから・どの方法で始めるか", who: "FP" },
      loan: { q: "住宅ローンの借り換え・繰り上げ返済を考えるときの判断材料", who: "借入先の金融機関" },
      retire: { q: "老後の生活費の見積り方と、年金の見込み額の確かめ方", who: "年金事務所・FP" },
      invest: { q: "積立を始めるときの考え方と、税制優遇（NISA・iDeCo）の使い方", who: "金融機関・FP" },
      cash: { q: "毎月お金が残らない原因の見つけ方", who: "FP" },
    };
    (a.worries || []).forEach((w) => {
      const item = WORRY_ASK[w];
      if (item && !ask.some((x) => x.q === item.q)) ask.push(item);
    });

    // 家族の年表（グラフ用）。offset = いまから何年後か
    const selfEvents = [];
    if (retireAge - age >= 0 && retireAge - age <= span) selfEvents.push({ offset: retireAge - age, short: "定年", text: `定年（${retireAge}歳）` + (Number(W.rehire) > 0 ? `・再雇用（〜${rehireUntil}歳）` : "") });
    if (DUMMY.pensionAge - age >= 0) {
      if (retireAge === DUMMY.pensionAge) selfEvents[0] && (selfEvents[0].text += "・年金受給開始");
      else selfEvents.push({ offset: DUMMY.pensionAge - age, short: "年金", text: "年金受給開始（65歳）" });
    }
    if (home === "loan" && loanEndAge - age > 0) selfEvents.push({ offset: loanEndAge - age, short: "完済", text: `住宅ローン完済（${loanEndAge}歳）` });
    const lanes = [{ label: "あなた", ageNow: age, end: span, events: selfEvents.filter((e) => e.offset <= span) }];
    if (spouse) {
      const sev = [];
      const off = Number(SW.retireAge) - spouseAge;
      if (off >= 0 && off <= span) sev.push({ offset: off, short: "定年", text: `配偶者 仕事をやめる（${SW.retireAge}歳）` });
      const pOff = DUMMY.pensionAge - spouseAge;
      if (pOff >= 0 && pOff <= span && pOff !== off) sev.push({ offset: pOff, short: "年金", text: "配偶者 年金受給開始" });
      const f = Number(SW.planFrom);
      if (SW.plan === "leave" && f <= span) sev.push({ offset: f, short: "育休", text: `配偶者 育休・時短（${SW.planYears}年間・年収の${SW.planRate}%）`, kind: "work" });
      if (SW.plan === "quit" && f <= span) sev.push({ offset: f, short: "退職", text: "配偶者 仕事をやめる", kind: "work" });
      if (SW.plan === "return" && f <= span) sev.push({ offset: f, short: "復職", text: "配偶者 働き始める・復職", kind: "work" });
      lanes.push({ label: "配偶者", ageNow: spouseAge, end: span, events: sev });
    }
    kids.forEach((k, i) => {
      const p = eduPlanOf(i);
      const jp = (v) => (v === "private" ? "私立" : "公立");
      const ms = [[0, "誕生", "誕生（予定）"], [6, "小学校", `小学校入学（${jp(p.elem)}）`], [12, "中学", `中学校入学（${jp(p.junior)}）`], [15, "高校", `高校入学（${jp(p.high)}）`]];
      if (p.univ !== "none") ms.push([18, p.univ === "vocational" ? "専門" : "大学", `${{ national: "国公立大学", privArts: "私立大学（文系）", privSci: "私立大学（理系）", vocational: "専門学校" }[p.univ]}入学${p.away === "away" ? "・下宿" : ""}（教育費のピーク）`]);
      ms.push([independAge(i), "独立", "独立"]);
      lanes.push({
        label: `${i + 1}人目の子${k < 0 ? "（予定）" : ""}`, kidIdx: i, ageNow: k, end: Math.max(0, Math.min(span, independAge(i) - k)),
        events: ms.filter(([m]) => m > k && m - k <= span).map(([m, short, text]) => ({ offset: m - k, short, text: `${i + 1}人目の子 ${text}` })),
      });
    });
    D.loans.forEach((l) => {
      const off = Number(l.endAge) - age;
      if (off > 0 && off <= span) lifeEvents.push({ offset: off, short: "完済", text: `${{ shougakukin: "奨学金", car: "自動車ローン", edu: "教育ローン", other: "そのほかの借入れ" }[l.kind] || "借入れ"}の完済`, kind: "loan", amount: 0 });
    });
    if (lifeEvents.length) lanes.push({ label: "くらし（車・住まい・出費）", ageNow: null, end: span, track: false, events: lifeEvents.sort((x, y) => x.offset - y.offset) });

    // ── 計算に使っている「いま」の毎月の支出 ──
    const p0 = sim0.points[0];
    const split = D.set.living ? D.living : splitLiving(living);
    const livingItems = LIVING_ITEMS.map((it) => ({ key: it.key, label: it.label, monthly: Number(split[it.key] || 0) }));
    const hc0 = housingCost(0);
    const current = {
      living: { monthly: living, source: livingSource, items: livingItems },
      housing: {
        monthly: hc0.base / 12,
        source: D.set.home ? "detail"
          : home === "family" ? "answer"
          : renting && a.rent && a.rent !== "unknown" ? "answer"
          : "provisional",
        note: (home === "loan" ? `住宅ローンの返済（月${KS.man(loanMonthly)}・${loanEndAge}歳まで${Number(D.loan.bonus) > 0 ? "・ボーナス返済を含む" : ""}${loanView ? `。借入${KS.man(D.loan.borrowed)}・${loanView.years}年・金利${D.loan.rate}%から計算` : ""}。返済額は変わらない前提で、金利の上昇や住宅ローン控除は計算に入れていません）＋` : renting ? "家賃" : "") + (owns ? (homeType === "mansion" ? "修繕積立金・管理費＋固定資産税" : "固定資産税（戸建ての修繕は年表の時期にまとめて計上）") : home === "family" ? "住居費なし（実家など）" : ""),
      },
      edu: { monthly: p0.exp.edu / 12, source: kids.length ? (D.set.edu ? "detail" : a.eduPlan === "unknown" ? "provisional" : "answer") : "none", note: kids.length ? "今年の学年と進学の方針から" : "お子さんなし" },
      car: { monthly: D.cars.reduce((t, c) => t + (age < Number(c.until) ? Number(c.upkeep) : 0), 0) / 12, source: D.cars.length ? (D.set.car ? "detail" : "provisional") : "none", note: D.cars.length ? "維持費（税金・保険・車検・ガソリンなど）。買い替えは年表の時期にまとめて計上" : "車なし" },
      loan: { monthly: D.loans.reduce((t, l) => t + (age < Number(l.endAge) ? Number(l.monthly) : 0), 0), source: D.loans.length ? "detail" : a.otherLoan === "yes" ? "provisional" : "none", note: D.loans.length ? "奨学金・自動車ローンなどの毎月の返済" : a.otherLoan === "yes" ? "「ある」と答えていますが、未入力です" : "住宅ローン以外の借入れなし" },
      other: { monthly: (Number(D.spend.travel) > 0 ? Number(D.spend.travel) : 0) / 12 + (D.care.on === "yes" && Number(D.care.startAge) <= age ? Number(D.care.monthly) : 0), source: D.set.spend || D.set.care ? "detail" : "none", note: "旅行・介護など（くわしく入力で設定）" },
      incomeMonthly: p0.income / 12,
    };
    current.total = ["living", "housing", "edu", "car", "loan", "other"].reduce((t, k) => t + current[k].monthly, 0);

    const insurancePending = a.insured === "yes" && !D.set.insurance && (bandDeath === null || bandDeath === undefined);

    function insuranceNote(kind) {
      if (a.insured === "no") return "保険に入っていない前提です";
      if (a.insured === "yes" && D.set.insurance) {
        return kind === "death" ? `加入中の死亡保障 ${KS.man(D.insurance.death)}を差し引いています` : `加入中の働けなくなったときの保障 月${KS.man(D.insurance.disability)}を差し引いています`;
      }
      if (a.insured === "yes") {
        const band = Q.mid("insuredDeathBand", a);
        return band === null || band === undefined
          ? "加入中の保険の保障額が未入力のため、含めていません（くわしく入力で設定できます）"
          : `かんたん入力で答えた死亡保障（だいたい${KS.man(band)}）で計算しています。正確な額はくわしく入力で設定できます`;
      }
      return "加入中の保険は含めていません";
    }

    // ── 見通しの天気（5項目） ──
    const SUN = "sun", CLOUD = "cloud", RAIN = "rain";
    const yearLiving = living * 12;
    const pre = sim0.points.filter((p) => p.age < DUMMY.pensionAge);
    const post = sim0.points.filter((p) => p.age >= DUMMY.pensionAge);
    const forecast = [];
    if (pre.length) {
      const min = pre.reduce((m, p) => (p.balance < m.balance ? p : m), pre[0]);
      forecast.push({
        key: "working", title: "現役のあいだの家計", q: "65歳までに貯蓄が底をつかないか",
        weather: min.balance < 0 ? RAIN : min.balance < yearLiving / 2 ? CLOUD : SUN,
        short: min.balance < 0 ? `${pre.find((p) => p.balance < 0).age}歳でマイナス` : `いちばん少ない時 ${KS.man(min.balance)}`,
        criteria: "晴れ：いちばん少ない時でも生活費の半年分以上／くもり：半年分を下回る時期がある／雨：マイナスになる時期がある",
        reason: min.balance < 0
          ? `${pre.find((p) => p.balance < 0).age}歳ごろに貯蓄がマイナスになる見込みです（いちばん少ないのは${min.age}歳で${KS.man(min.balance)}）。`
          : `貯蓄がいちばん少なくなるのは${min.age}歳ごろで、約${KS.man(min.balance)}の見込みです${min.balance < yearLiving / 2 ? "（生活費の半年分を下回ります）" : ""}。`,
        target: "cash",
      });
    }
    {
      const endP = sim0.points[sim0.points.length - 1];
      const outAge = post.find((p) => p.balance < 0)?.age ?? null;
      forecast.push({
        key: "retire", title: "老後のお金", q: "90歳まで貯蓄がもつか",
        weather: outAge !== null ? RAIN : endP.balance < yearLiving * (Number(D.retire.ratio) / 100) * 2 ? CLOUD : SUN,
        short: outAge !== null ? (post[0] && post[0].balance < 0 ? (post[0].age <= age ? "いまの時点でマイナス" : `${post[0].age}歳でマイナス`) : `${outAge}歳で底をつく`) : `90歳で${KS.man(endP.balance)}残る`,
        criteria: "晴れ：90歳で老後の生活費2年分以上残る／くもり：もつが余裕が少ない／雨：途中でなくなる",
        reason: outAge !== null
          ? (post[0] && post[0].balance < 0
            ? `${post[0].age <= age ? "いまの時点" : post[0].age + "歳の時点"}で、すでに貯蓄がマイナス（約${KS.man(post[0].balance)}）の見込みです。まず現役のあいだの家計から見ていくことになります。`
            : `${outAge}歳ごろに貯蓄がなくなる見込みです（運用しない場合）。`)
          : `90歳時点で約${KS.man(endP.balance)}残る見込みです${endP.balance < yearLiving * (Number(D.retire.ratio) / 100) * 2 ? "（老後の生活費の2年分を下回り、余裕は少なめです）" : ""}。`,
        target: "cash",
      });
    }
    forecast.push(!death
      ? { key: "death", title: "万一のとき", q: "あなたが亡くなったとき、家族の生活は", weather: SUN, short: "扶養家族なし", criteria: "晴れ：不足なし／くもり：不足500万円以内／雨：不足500万円超", reason: "扶養しているご家族がいないため、大きな備えの必要性は低めです。", target: "estimate" }
      : {
        key: "death", title: "万一のとき", q: "あなたが亡くなったとき、家族の生活は",
        weather: insurancePending ? CLOUD : death.high <= 0 ? SUN : death.high <= 500 ? CLOUD : RAIN,
        short: insurancePending ? "保障額が未入力" : death.high <= 0 ? "不足なし" : `不足 ${KS.man(death.low)}〜${KS.man(death.high)}`,
        criteria: "晴れ：不足なし／くもり：不足500万円以内／雨：不足500万円超",
        reason: (insurancePending ? "加入中の保険の保障額が未入力のため、晴れ・雨の判定ができません。くわしく入力で設定してください。" + "\n" : "") + (death.high <= 0
          ? "加入中の保険を差し引いて計算すると、遺族年金・配偶者の収入・貯蓄で、ご家族の支出をまかなえる見込みです。"
          : `加入中の保険を差し引いて計算すると、約${KS.man(death.low)}〜${KS.man(death.high)}不足する見込みです。`),
        note: insuranceNote("death") + (home === "loan" ? (D.loan.dansin === "yes" ? "。住宅ローンは団信で完済される前提" : "。住宅ローンは団信なしとして残りの返済を含めています") : ""),
        target: "estimate",
      });
    {
      const need18 = disability.first * 18;
      forecast.push({
        key: "sick", title: "働けなくなったとき", q: "休業中の収入減を、貯蓄で1年半しのげるか",
        weather: insurancePending ? CLOUD : disability.first <= 0 ? SUN : need18 <= savings ? CLOUD : RAIN,
        short: insurancePending ? "保障額が未入力" : disability.first <= 0 ? "不足なし" : `毎月 ${KS.man(disability.first)} 不足`,
        criteria: "晴れ：不足なし／くもり：1年半分の不足を貯蓄でしのげる／雨：貯蓄では足りない",
        reason: disability.first <= 0
          ? "休業中の手当などで、毎月の支出をまかなえる見込みです。"
          : `毎月約${KS.man(disability.first)}足りなくなり、1年半で約${KS.man(need18)}。${need18 <= savings ? "今の貯蓄でしのげる見込みですが、貯蓄は減ります。" : "今の貯蓄では足りない見込みです。"}`,
        note: insuranceNote("sick"),
        target: "estimate",
      });
    }
    {
      const m = savings / Math.max(1, living + hc0.base / 12);
      const varyIncome = work === "self" && a.selfVary === "vary";
      const need = varyIncome ? 12 : 6;
      forecast.push({
        key: "emergency", title: "急な出費への備え", q: `貯蓄が毎月の支出の何か月分あるか（目安${need}か月分）`,
        weather: m >= need ? SUN : m >= need / 2 ? CLOUD : RAIN,
        short: `貯蓄 ${m >= 24 ? "24か月分以上" : Math.floor(m) + "か月分"}`,
        criteria: `晴れ：毎月の支出の${need}か月分以上／くもり：${need / 2}〜${need}か月分／雨：${need / 2}か月分未満`,
        reason: `貯蓄は毎月の支出（生活費＋住居費）の約${m >= 24 ? "24か月分以上" : Math.floor(m) + "か月分"}です。${varyIncome ? "収入の波が大きい働き方のため、1年分を目安にしています。" : "一般に、半年分ほどを目安にする考え方があります。"}`,
        target: "costs",
      });
    }

    // 年表（一覧）
    const events = [{ year: year0, age, text: "いま" }];
    lanes.forEach((lane) => lane.events.forEach((e) => events.push({ year: year0 + e.offset, age: age + e.offset, text: e.text })));
    if (sim0.shortageAge !== null) events.push({ year: year0 + sim0.shortageAge - age, age: sim0.shortageAge, text: "貯蓄が底をつく見込み（運用しない場合）" });
    events.sort((x, y) => x.year - y.year);

    // 年表（行ごと）：年・家族の年齢・出来事（アイコン・金額）
    const ICON = { car: "🚗", repair: "🔧", home: "🏠", care: "👵", spend: "✈️", work: "💼", loan: "💳" };
    const SHORT_ICON = { 誕生: "👶", 小学校: "🎒", 中学: "🏫", 高校: "🏫", 大学: "🎓", 専門: "🎓", 独立: "🌱", 定年: "👔", 年金: "💴", 完済: "🏠" };
    const rowsByOff = {};
    const addRow = (off, item) => { (rowsByOff[off] = rowsByOff[off] || []).push(item); };
    lanes.forEach((lane) => lane.events.forEach((e) => {
      const pt = sim0.points[e.offset];
      addRow(e.offset, { icon: ICON[e.kind] || SHORT_ICON[e.short] || "●", text: e.text.replace(/（約[^）]*）/, ""), amount: e.amount || (e.short === "大学" || e.short === "専門" ? Math.round(pt ? pt.exp.edu : 0) : 0), kind: e.kind || (["小学校", "中学", "高校", "大学", "専門", "独立"].includes(e.short) ? "edu" : "life") });
    }));
    if (sim0.shortageAge !== null) addRow(sim0.shortageAge - age, { icon: "⚠️", text: "貯蓄が底をつく見込み（運用しない場合）", amount: 0, kind: "alert" });
    const timeline = Object.keys(rowsByOff).map(Number).sort((x, y) => x - y).map((off) => ({
      year: year0 + off, offset: off,
      ages: [{ who: "あなた", age: age + off }].concat(spouse ? [{ who: "配偶者", age: spouseAge + off }] : [], kids.map((k, i) => ({ who: `子${kids.length > 1 ? i + 1 : ""}`, age: k + off, gone: k + off > independAge(i) || k + off < 0 })).filter((x) => !x.gone)),
      items: rowsByOff[off],
      balance: sim0.points[off] ? sim0.points[off].balance : null,
    }));

    const kidInfo = kids.map((k, i) => ({ ageNow: k, plan: eduPlanOf(i), independ: independAge(i) }));
    // いま一緒に暮らしている人数。これから生まれる子（年齢がマイナス）と独立した子は数えない
    const householdNow = 1 + (spouse ? 1 : 0) + kidInfo.filter((k) => k.ageNow >= 0 && k.ageNow <= k.independ).length;

    const incomeCheck = W.growth === "stat" ? incomeVsAverage(work, age, income) : null;
    const wageApplied = W.growth === "stat" && wageFactor(work, age, age + 1) !== null;
    const wageCapped = wageApplied && age >= wageCapAge();

    return { provisional, death, disability, retire, sim0, simR, todos, insurance, ask, events, lanes, timeline, forecast, current, loanMismatch, loanView, incomeCheck, wageApplied, wageCapped, householdNow, kidInfo, spouse, spouseAge, living, savings, income, ret: as.ret, age, detail: D, EDU_PLAN };
  }

  function round100(n) {
    return Math.round(n / 100) * 100;
  }

  window.KSC = { compute, detailOf, detailDefaults, splitLiving, loanFromOrigin, DUMMY, LIVING_ITEMS, EDU_PLAN };
})();
