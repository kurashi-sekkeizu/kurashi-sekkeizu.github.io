/* プロトタイプ用の「仮の計算」
 * ⚠ 画面の見た目と操作を確認するためのダミーです。公的制度・教育費・修繕費などの金額は正式な値ではありません。
 *   本番の試算ロジックは設計工程で、出典・適用年度・確認日つきのデータファイルと手計算テストで作ります。
 */
(function () {
  "use strict";
  const Q = window.KSQ;

  const DUMMY = {
    takeHomeRate: 0.78,      // 額面→手取りの概算
    pensionBase: 80,         // 老齢基礎年金の概算（年・万円）
    pensionEmployeeRate: 0.18,
    pensionAge: 65,
    survivorBase: 100,       // 遺族年金（子がいる間）の概算
    survivorEmployeeRate: 0.15,
    sickRate: 0.67,          // 休業中の手当の概算（会社員・公務員）
    disabilityMonthly: 6.5,
    funeral: 200,
    childAllowance: 15,      // 児童手当の概算（18歳まで・年額）
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
  function detailDefaults(a) {
    const plan = EDU_PLAN[a.eduPlan] || EDU_PLAN.unknown;
    const nKids = a.kids === "yes" ? Number(a.kidsCount) || 0 : 0;
    const nCars = Number(a.cars) || 0;
    return {
      set: {},
      kids: Array.from({ length: nKids }, () => Object.assign({ away: "home" }, plan)),
      cars: Array.from({ length: nCars }, (_, i) => ({ nextIn: i === 0 ? 5 : 8, budget: 250, interval: 10, upkeep: 35, until: 75 })),
      loan: { monthly: 10, endAge: 65 },
      rent: { monthly: 8 },
      house: { built: 10, paintEvery: 12, paintCost: 120, waterEvery: 15, waterCost: 60 },
      mansion: { built: 10, monthly: 3, raise: 20 },
      purchase: { on: "no", age: Math.max(30, Number(a.age) + 3), type: "house", price: 4000, down: 400, years: 35, rate: 1 },
      rebuild: { on: "no", age: Math.max(55, Number(a.age) + 15), budget: 1000 },
      care: { on: "no", startAge: Math.max(50, Number(a.age) + 10), years: 5, monthly: 5 },
      spend: { travel: 0, travelUntil: 75, items: [] },
      work: { retireAge: 65, rehire: 0, rehireUntil: 65, allowance: 0, change: "no", changeAge: Number(a.age) + 5, changeIncome: "i3" },
    };
  }

  // 保存済みのくわしく入力と、初期値を合わせる（子・車の数は、かんたん／くわしくの設定に合わせる）
  function detailOf(data) {
    const a = data.answers;
    const def = detailDefaults(a);
    const saved = data.detail || {};
    const out = {};
    Object.keys(def).forEach((k) => {
      if (Array.isArray(def[k])) out[k] = saved[k] ? saved[k] : def[k];
      else out[k] = Object.assign({}, def[k], saved[k] || {});
    });
    out.kids = def.kids.map((dk, i) => Object.assign({}, dk, (saved.kids || [])[i] || {}));
    if (!saved.set || !saved.set.car) out.cars = def.cars;
    out.set = Object.assign({}, saved.set || {});
    out.spend.items = (out.spend.items || []).filter((it) => it && it.age && it.amount);
    return out;
  }

  function compute(data) {
    const a = data.answers;
    const as = data.assumptions;
    const D = detailOf(data);
    const provisional = [];

    const age = Number(a.age);
    const work = a.work;
    let income = Q.mid("income", a);
    if (income === null) { income = work === "none" ? 0 : 450; provisional.push("年収"); }
    const spouse = a.spouse === "yes";
    const spouseAge = spouse ? Number(a.spouseAge) : null;
    let spouseIncome = 0;
    if (spouse) {
      spouseIncome = Q.mid("spouseIncome", a);
      if (spouseIncome === null) { spouseIncome = 100; provisional.push("配偶者の年収"); }
    }
    const kids = a.kids === "yes" ? (a.kidsAges || []).map(Number) : [];
    const household = 1 + (spouse ? 1 : 0) + kids.length;
    let living = Q.mid("living", a);
    if (living === null) { living = Math.min(40, 10 + household * 3.5); provisional.push("毎月の生活費"); }
    let savings = Q.mid("savings", a);
    if (savings === null) { savings = 300; provisional.push("貯蓄"); }
    const home = a.home;
    const owns = home === "loan" || home === "own";
    const homeType = a.homeType;
    const renting = home === "rent" || home === "plan";

    if (kids.length && a.eduPlan === "unknown" && !D.set.edu) provisional.push("進学（高校まで公立・大学は私立で仮置き）");
    if (D.cars.length && !D.set.car) provisional.push("車（10年ごと・250万円で買い替え、維持費 年35万円で仮置き）");
    if (!D.set.home) {
      if (home === "loan") provisional.push("住宅ローン返済額（月10万円・65歳完済で仮置き）");
      if (renting) provisional.push("家賃（月8万円で仮置き）");
      if (owns && homeType === "house") provisional.push("修繕費（築10年・塗装12年ごと120万円などで仮置き）");
      if (owns && homeType === "mansion") provisional.push("修繕積立金・管理費（月3万円で仮置き）");
    }

    const inf = as.inflation / 100;
    const ret = as.ret / 100;
    const year0 = new Date().getFullYear();
    const span = DUMMY.endAge - age;
    const employeeLike = work === "employee" || work === "civil";
    const W = D.work;
    const retireAge = Number(W.retireAge);

    const pensionSelf = DUMMY.pensionBase + (employeeLike ? Math.min(income, 1000) * DUMMY.pensionEmployeeRate : 0);
    const spouseEmployee = a.spouseWork === "employee" || a.spouseWork === "civil";
    const pensionSpouse = spouse ? DUMMY.pensionBase + (spouseEmployee ? Math.min(spouseIncome, 1000) * DUMMY.pensionEmployeeRate : 0) : 0;

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
        at(purchaseOff).housing += Number(P.down);
        const principal = Math.max(0, Number(P.price) - Number(P.down));
        const r = Number(P.rate) / 100, n = Number(P.years);
        purchaseLoan = r > 0 ? (principal * r) / (1 - Math.pow(1 + r, -n)) : principal / n;
        purchaseLoanYears = n;
        lifeEvents.push({ offset: purchaseOff, short: "購入", text: `住宅の購入（${P.type === "house" ? "戸建て" : "マンション"}・頭金${KS.man(P.down)}）`, kind: "home", amount: Number(P.down) });
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
      const p = eduPlanOf(i), E = DUMMY.edu;
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
      if (home === "loan" && cur < Number(D.loan.endAge)) c += Number(D.loan.monthly) * 12;
      if (renting && (purchaseOff === null || y < purchaseOff)) c += Number(D.rent.monthly) * 12;
      if (purchaseOff !== null && y >= purchaseOff && y < purchaseOff + purchaseLoanYears) c += purchaseLoan;
      const mansionFrom = owns && homeType === "mansion" ? 0 : purchaseOff !== null && P.type === "mansion" ? purchaseOff : null;
      if (mansionFrom !== null && y >= mansionFrom) {
        fee = Number(D.mansion.monthly) * 12 * Math.pow(1 + Number(D.mansion.raise) / 100, Math.floor((y - mansionFrom) / 10));
        c += fee;
      }
      return { base: c, fee };
    }

    function simulate(r) {
      let balance = savings;
      const points = [];
      let shortageAge = null;
      for (let y = 0; y <= span; y++) {
        const cur = age + y;
        const ev = oneTime[y] || { housing: 0, repair: 0, car: 0, other: 0, income: 0 };
        const baseIncome = changeOff !== null && y >= changeOff ? changedIncome : income;
        let incWork = 0;
        if (cur < retireAge) incWork = baseIncome * DUMMY.takeHomeRate;
        else if (Number(W.rehire) > 0 && cur < Number(W.rehireUntil)) incWork = baseIncome * (Number(W.rehire) / 100) * DUMMY.takeHomeRate;
        let incPension = cur >= DUMMY.pensionAge ? pensionSelf : 0;
        let incSpouse = 0;
        if (spouse) {
          if (spouseAge + y < DUMMY.pensionAge) incSpouse = spouseIncome * DUMMY.takeHomeRate;
          else incPension += pensionSpouse;
        }
        let incAllowance = 0;
        kids.forEach((k) => { if (k + y < 18) incAllowance += DUMMY.childAllowance; });
        const incOther = ev.income;
        const inc = incWork + incPension + incSpouse + incAllowance + incOther;

        const expLiving = living * 12 * Math.pow(1 + inf, y) * (cur >= DUMMY.pensionAge ? 0.85 : 1);
        const hc = housingCost(y);
        const expHousing = hc.base + ev.housing + ev.repair;
        let expEdu = 0;
        kids.forEach((k, i) => { expEdu += eduCost(i, k + y); });
        let expCar = ev.car;
        D.cars.forEach((c) => { if (cur < Number(c.until)) expCar += Number(c.upkeep); });
        let expOther = ev.other;
        if (Number(D.spend.travel) > 0 && cur < Number(D.spend.travelUntil)) expOther += Number(D.spend.travel);
        const exp = expLiving + expHousing + expEdu + expCar + expOther;

        if (y > 0) balance = balance * (balance > 0 ? 1 + r : 1) + inc - exp;
        points.push({
          age: cur, year: year0 + y, balance: Math.round(balance), income: Math.round(inc), expense: Math.round(exp),
          inc: { work: incWork, spouse: incSpouse, pension: incPension, allowance: incAllowance, lump: incOther },
          exp: { living: expLiving, housing: expHousing, repair: ev.repair, edu: expEdu, car: expCar, other: expOther },
        });
        if (shortageAge === null && balance < 0) shortageAge = cur;
      }
      return { points, shortageAge };
    }
    const sim0 = simulate(0);
    const simR = ret > 0 ? simulate(ret) : null;

    // 万一のとき（死亡）
    const youngest = kids.length ? Math.min(...kids) : null;
    const years = kids.length ? Math.max(0, Math.max(...kids.map((k, i) => independAge(i) - k))) : spouse ? 5 : 0;
    let death = null;
    if (spouse || kids.length) {
      const eduRemain = kids.reduce((s, k, i) => { let t = 0; for (let x = k; x <= 21; x++) t += eduCost(i, x); return s + t; }, 0);
      const rent = renting ? Number(D.rent.monthly) * 12 * years : 0;
      const pensionYears = kids.length ? Math.max(0, 18 - youngest) : 0;
      const survivorPension = pensionYears * (DUMMY.survivorBase + (employeeLike ? income * DUMMY.survivorEmployeeRate : 0));
      const spouseInc = spouse ? spouseIncome * DUMMY.takeHomeRate * years : 0;
      const calc = (ratio) => {
        const expense = living * 12 * ratio * years + eduRemain + rent + DUMMY.funeral;
        return { expense, need: Math.max(0, expense - survivorPension - spouseInc - savings) };
      };
      const lo = calc(as.ratioLow / 100), hi = calc(as.ratioHigh / 100);
      death = {
        years, low: round100(lo.need), high: round100(hi.need),
        breakdown: { expenseLow: lo.expense, expenseHigh: hi.expense, eduRemain, rent, survivorPension, spouseInc, savings, loanNote: home === "loan" },
      };
    }

    // 働けなくなったとき（月あたり）
    const monthlyNeed = living + housingCost(0).base / 12;
    const spouseMonthly = spouse ? (spouseIncome * DUMMY.takeHomeRate) / 12 : 0;
    const sickMonthly = employeeLike ? (income / 12) * DUMMY.sickRate : 0;
    const disability = {
      first: Math.max(0, monthlyNeed - sickMonthly - spouseMonthly),
      after: Math.max(0, monthlyNeed - DUMMY.disabilityMonthly - (employeeLike ? 5 : 0) - spouseMonthly),
      hasSick: employeeLike,
    };

    // 老後
    let retire = null;
    if (age < DUMMY.pensionAge) {
      const yrs = DUMMY.endAge - DUMMY.pensionAge;
      const need = living * 12 * 0.85 * Math.pow(1 + inf, DUMMY.pensionAge - age) * yrs - (pensionSelf + pensionSpouse) * yrs;
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
        monthlyR: simR ? monthly(gap0, ret) : null,
      };
    }

    // やることリスト（一般的な優先順: 生活防衛資金 → 保障 → 教育 → 近い大きな出費 → 老後）
    const todos = [];
    const months = savings / Math.max(1, living);
    if (months < 6) {
      todos.push({ key: "emergency", when: "今すぐ", title: "急な出費に備える貯蓄を確認する",
        reason: `貯蓄が生活費の約${Math.max(0, Math.round(months))}か月分です。一般に、生活費の半年分ほどを目安にする考え方があります。`,
        link: { href: "/guide/", text: "貯蓄の考え方を読む" } });
    }
    if (death && death.high > 0) {
      todos.push({ key: "death", when: "今すぐ", title: "万一のときの保障額を確認する",
        reason: kids.length
          ? `お子さんが独立するまでの支出が、遺族年金・配偶者の収入・貯蓄だけでは約${KS.man(death.low)}〜${KS.man(death.high)}不足する見込みです。`
          : `ご家族の生活費が、配偶者の収入と貯蓄だけでは約${KS.man(death.low)}〜${KS.man(death.high)}不足する見込みです。`,
        link: { href: "/guide/", text: "保障の考え方を読む" } });
    }
    if (work === "self") {
      todos.push({ key: "disability", when: "今すぐ", title: "働けなくなったときの備えを確認する",
        reason: "自営業・フリーランスには、会社員のような休業中の手当がありません。",
        link: { href: "/guide/", text: "働けなくなったときの備えを読む" } });
    }
    // 教育費のピーク（最も教育費が多い年）
    if (kids.length) {
      const peak = sim0.points.reduce((m, p) => (p.exp.edu > m.exp.edu ? p : m), sim0.points[0]);
      if (peak.exp.edu > 0 && peak.age > age) {
        todos.push({ key: "edu", when: `${peak.age - age}年以内`, title: "教育費の準備を始める時期を決める",
          reason: `教育費がいちばん多いのは${peak.year}年（あなたが${peak.age}歳）で、その年は約${KS.man(peak.exp.edu)}の見込みです。`,
          link: { href: "/guide/", text: "教育費の準備を読む" } });
      }
    }
    const soon = lifeEvents.filter((e) => e.offset > 0 && e.offset <= 5 && e.amount >= 50).sort((x, y) => x.offset - y.offset)[0];
    if (soon) {
      const title = { car: "車の買い替え資金を準備する", repair: "住まいの修繕費を準備する", home: "住まいの大きな出費に備える", spend: "予定している大きな出費に備える", care: "親の介護について家族で話し合う" }[soon.kind] || "予定している出費に備える";
      todos.push({ key: "soon", when: `${soon.offset}年以内`, title,
        reason: `${year0 + soon.offset}年（${age + soon.offset}歳）に「${soon.text}」を見込んでいます。`,
        link: { href: "/guide/", text: "大きな出費への備え方を読む" } });
    }
    if (D.care.on === "yes" && !(soon && soon.kind === "care")) {
      todos.push({ key: "care", when: `${Math.max(0, D.care.startAge - age)}年以内`, title: "親の介護について家族で話し合う",
        reason: `${D.care.startAge}歳ごろから、年約${KS.man(D.care.monthly * 12)}の負担を見込んでいます。`,
        link: { href: "/guide/", text: "介護とお金を読む" } });
    }
    if (retire && retire.gap0 > 0) {
      todos.push({ key: "retire", when: `${DUMMY.pensionAge - age}年以内`, title: "老後資金の積立を検討する",
        reason: `65歳時点で約${KS.man(retire.gap0)}不足する見込みです（運用しない場合）。毎月約${KS.man(retire.monthly0)}の積立で埋まる計算です。`,
        link: { href: "/guide/tsumitate/", text: "つみたて投資の始め方を読む" } });
    }
    if (home === "loan") {
      todos.push({ key: "loan", when: "次の相談時", title: "住宅ローンと保障の重なりを確認する",
        reason: "団信に入っていれば、万一のときローン残高がなくなり、必要な保障額が変わります。",
        link: { href: "/guide/", text: "住宅ローンと保障を読む" } });
    }
    if (sim0.shortageAge !== null) {
      todos.push({ key: "cash", when: "見直しの目安", title: "家計の見通しを見直す",
        reason: `運用しない場合、${sim0.shortageAge}歳ごろに貯蓄が底をつく見込みです。`,
        link: { href: "/guide/", text: "家計の見直し方を読む" } });
    }

    // 保険の種類ごとの優先度（3段階）
    const L1 = { cls: "l1", text: "優先して検討" }, L2 = { cls: "l2", text: "状況により検討" }, L3 = { cls: "l3", text: "公的保障・貯蓄で賄える可能性が高い" };
    const insurance = [
      { name: "死亡保障", level: death && death.high > 0 && kids.length ? L1 : spouse ? L2 : L3,
        reason: death && death.high > 0 ? "ご家族の生活費が、公的保障と貯蓄だけでは不足する見込みです。" : "扶養しているご家族がいない場合、大きな保障の必要性は低めです。" },
      { name: "医療保障", level: savings >= 100 ? L3 : L2,
        reason: "高額療養費制度により、1か月の医療費の自己負担には上限があります。差額ベッド代など対象外の費用を貯蓄で賄えるかがポイントです。" },
      { name: "働けなくなったときの保障", level: work === "self" ? L1 : L2,
        reason: work === "self" ? "休業中の手当がないため、収入が途絶えやすい働き方です。" : "休業中の手当はありますが、長期化した場合の生活費は確認が必要です。" },
      { name: "個人賠償責任", level: L2, reason: "自転車事故などで他人にけがをさせた場合の備えです。" },
    ];

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
    if ((a.worries || []).includes("cash")) ask.push({ q: "毎月お金が残らない原因の見つけ方", who: "FP" });

    // 家族の年表（グラフ用）。offset = いまから何年後か
    const selfEvents = [];
    if (retireAge - age >= 0 && retireAge - age <= span) selfEvents.push({ offset: retireAge - age, short: "定年", text: `定年（${retireAge}歳）` + (Number(W.rehire) > 0 ? `・再雇用（〜${W.rehireUntil}歳）` : "") });
    if (DUMMY.pensionAge - age >= 0) {
      if (retireAge === DUMMY.pensionAge) selfEvents[0] && (selfEvents[0].text += "・年金受給開始");
      else selfEvents.push({ offset: DUMMY.pensionAge - age, short: "年金", text: "年金受給開始（65歳）" });
    }
    if (home === "loan" && Number(D.loan.endAge) - age > 0) selfEvents.push({ offset: Number(D.loan.endAge) - age, short: "完済", text: `住宅ローン完済（${D.loan.endAge}歳）` });
    const lanes = [{ label: "あなた", ageNow: age, end: span, events: selfEvents.filter((e) => e.offset <= span) }];
    if (spouse) {
      const off = DUMMY.pensionAge - spouseAge;
      lanes.push({
        label: "配偶者", ageNow: spouseAge, end: span,
        events: off >= 0 && off <= span ? [{ offset: off, short: "定年", text: "配偶者 定年・年金受給開始" }] : [],
      });
    }
    kids.forEach((k, i) => {
      const p = eduPlanOf(i);
      const jp = (v) => (v === "private" ? "私立" : "公立");
      const ms = [[6, "小学校", `小学校入学（${jp(p.elem)}）`], [12, "中学", `中学校入学（${jp(p.junior)}）`], [15, "高校", `高校入学（${jp(p.high)}）`]];
      if (p.univ !== "none") ms.push([18, p.univ === "vocational" ? "専門" : "大学", `${{ national: "国公立大学", privArts: "私立大学（文系）", privSci: "私立大学（理系）", vocational: "専門学校" }[p.univ]}入学${p.away === "away" ? "・下宿" : ""}（教育費のピーク）`]);
      ms.push([independAge(i), "独立", "独立"]);
      lanes.push({
        label: `${i + 1}人目の子`, ageNow: k, end: Math.max(0, Math.min(span, independAge(i) - k)),
        events: ms.filter(([m]) => m > k && m - k <= span).map(([m, short, text]) => ({ offset: m - k, short, text: `${i + 1}人目の子 ${text}` })),
      });
    });
    if (lifeEvents.length) lanes.push({ label: "くらし（車・住まい・出費）", ageNow: null, end: span, track: false, events: lifeEvents.sort((x, y) => x.offset - y.offset) });

    // 年表（一覧）
    const events = [{ year: year0, age, text: "いま" }];
    lanes.forEach((lane) => lane.events.forEach((e) => events.push({ year: year0 + e.offset, age: age + e.offset, text: e.text })));
    if (sim0.shortageAge !== null) events.push({ year: year0 + sim0.shortageAge - age, age: sim0.shortageAge, text: "貯蓄が底をつく見込み（運用しない場合）" });
    events.sort((x, y) => x.year - y.year);

    return { provisional, death, disability, retire, sim0, simR, todos, insurance, ask, events, lanes, living, savings, income, ret: as.ret, age, detail: D };
  }

  function round100(n) {
    return Math.round(n / 100) * 100;
  }

  window.KSC = { compute, detailOf, detailDefaults, DUMMY };
})();
