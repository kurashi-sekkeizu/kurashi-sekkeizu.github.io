/* プロトタイプ用の「仮の計算」
 * ⚠ 画面の見た目と操作を確認するためのダミーです。公的制度の金額・料率は正式な値ではありません。
 *   本番の試算ロジックは設計工程で、出典・適用年度・確認日つきのデータファイルと手計算テストで作ります。
 */
(function () {
  "use strict";
  const Q = window.KSQ;

  const DUMMY = {
    takeHomeRate: 0.78,      // 額面→手取りの概算
    pensionBase: 80,         // 老齢基礎年金の概算（年・万円）
    pensionEmployeeRate: 0.18,
    survivorBase: 100,       // 遺族年金（子がいる間）の概算
    survivorEmployeeRate: 0.15,
    sickRate: 0.67,          // 休業中の手当の概算（会社員・公務員）
    disabilityMonthly: 6.5,
    rentMonthly: 8,          // かんたんでは質問しない住居費の仮置き
    loanMonthly: 10,
    funeral: 200,
    eduSchool: 40,           // 7〜17歳 年額
    eduUniv: 150,            // 18〜21歳 年額
    childAllowance: 15,      // 児童手当の概算（18歳まで・年額）
    retireAge: 65,
    endAge: 90,
  };

  function compute(data) {
    const a = data.answers;
    const as = data.assumptions;
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
    if (home === "rent" || home === "plan") provisional.push("家賃（かんたんでは聞いていないため月8万円で仮置き）");
    if (home === "loan") provisional.push("住宅ローン返済額（かんたんでは聞いていないため月10万円・65歳完済で仮置き）");

    const inf = as.inflation / 100;
    const ret = as.ret / 100;
    const year0 = new Date().getFullYear();
    const employeeLike = work === "employee" || work === "civil";

    const pensionSelf = DUMMY.pensionBase + (employeeLike ? Math.min(income, 1000) * DUMMY.pensionEmployeeRate : 0);
    const pensionSpouse = spouse ? DUMMY.pensionBase + ((a.spouseWork === "employee" || a.spouseWork === "civil") ? Math.min(spouseIncome, 1000) * DUMMY.pensionEmployeeRate : 0) : 0;

    const housing = (curAge) => {
      if (home === "rent" || home === "plan") return DUMMY.rentMonthly * 12;
      if (home === "loan" && curAge < DUMMY.retireAge) return DUMMY.loanMonthly * 12;
      return 0;
    };
    const eduCost = (kidAge) => (kidAge >= 18 && kidAge <= 21 ? DUMMY.eduUniv : kidAge >= 7 && kidAge <= 17 ? DUMMY.eduSchool : 0);

    // 家計の見通し
    function simulate(r) {
      let balance = savings;
      const points = [];
      let shortageAge = null;
      for (let y = 0; age + y <= DUMMY.endAge; y++) {
        const cur = age + y;
        let inc = cur < DUMMY.retireAge ? income * DUMMY.takeHomeRate : pensionSelf;
        if (spouse) {
          const sAge = spouseAge + y;
          inc += sAge < DUMMY.retireAge ? spouseIncome * DUMMY.takeHomeRate : pensionSpouse;
        }
        kids.forEach((k) => { if (k + y < 18) inc += DUMMY.childAllowance; });
        let exp = living * 12 * Math.pow(1 + inf, y) * (cur >= DUMMY.retireAge ? 0.85 : 1) + housing(cur);
        kids.forEach((k) => { exp += eduCost(k + y); });
        if (y > 0) balance = balance * (balance > 0 ? 1 + r : 1) + inc - exp;
        points.push({ age: cur, year: year0 + y, balance: Math.round(balance), income: Math.round(inc), expense: Math.round(exp) });
        if (shortageAge === null && balance < 0) shortageAge = cur;
      }
      return { points, shortageAge };
    }
    const sim0 = simulate(0);
    const simR = ret > 0 ? simulate(ret) : null;

    // 万一のとき（死亡）
    const youngest = kids.length ? Math.min(...kids) : null;
    const years = kids.length ? Math.max(0, 22 - youngest) : spouse ? 5 : 0;
    let death = null;
    if (spouse || kids.length) {
      const eduRemain = kids.reduce((s, k) => { let t = 0; for (let x = k; x <= 21; x++) t += eduCost(x); return s + t; }, 0);
      const rent = home === "rent" || home === "plan" ? DUMMY.rentMonthly * 12 * years : 0;
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
    const monthlyNeed = living + housing(age) / 12;
    const spouseMonthly = spouse ? (spouseIncome * DUMMY.takeHomeRate) / 12 : 0;
    const sickMonthly = employeeLike ? (income / 12) * DUMMY.sickRate : 0;
    const disability = {
      first: Math.max(0, monthlyNeed - sickMonthly - spouseMonthly),
      after: Math.max(0, monthlyNeed - DUMMY.disabilityMonthly - (employeeLike ? 5 : 0) - spouseMonthly),
      hasSick: employeeLike,
    };

    // 老後
    let retire = null;
    if (age < DUMMY.retireAge) {
      const yrs = DUMMY.endAge - DUMMY.retireAge;
      const need = living * 12 * 0.85 * Math.pow(1 + inf, DUMMY.retireAge - age) * yrs - (pensionSelf + pensionSpouse) * yrs;
      const at65 = (sim) => sim.points.find((p) => p.age === DUMMY.retireAge)?.balance ?? 0;
      const gap0 = Math.max(0, need - Math.max(0, at65(sim0)));
      const months = (DUMMY.retireAge - age) * 12;
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

    // やることリスト（一般的な優先順: 生活防衛資金 → 保障 → 教育 → 老後）
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
          ? `下のお子さんが独立するまでの支出が、遺族年金・配偶者の収入・貯蓄だけでは約${KS.man(death.low)}〜${KS.man(death.high)}不足する見込みです。`
          : `ご家族の生活費が、配偶者の収入と貯蓄だけでは約${KS.man(death.low)}〜${KS.man(death.high)}不足する見込みです。`,
        link: { href: "/guide/", text: "保障の考え方を読む" } });
    }
    if (work === "self") {
      todos.push({ key: "disability", when: "今すぐ", title: "働けなくなったときの備えを確認する",
        reason: "自営業・フリーランスには、会社員のような休業中の手当がありません。",
        link: { href: "/guide/", text: "働けなくなったときの備えを読む" } });
    }
    const oldest = kids.length ? Math.max(...kids) : null;
    if (oldest !== null && oldest < 18) {
      todos.push({ key: "edu", when: `${18 - oldest}年以内`, title: "教育費の準備を始める時期を決める",
        reason: `上のお子さんの大学入学まで、あと${18 - oldest}年（${year0 + 18 - oldest}年）です。`,
        link: { href: "/guide/", text: "教育費の準備を読む" } });
    }
    if (retire && retire.gap0 > 0) {
      todos.push({ key: "retire", when: `${DUMMY.retireAge - age}年以内`, title: "老後資金の積立を検討する",
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
      { name: "個人賠償責任", level: L2, reason: "自転車事故などで他人にけがをさせた場合の備えです。「くわしく入力」で判定します。" },
    ];

    // 専門家に聞くこと
    const ask = [];
    if (home === "loan") ask.push({ q: "団信の保障内容と、死亡保障の重なり", who: "保険相談員・金融機関" });
    ask.push({ q: "健康状態について告知が必要な場合の扱い", who: "保険相談員" });
    if (kids.length || a.kids === "plan") ask.push({ q: "教育費の準備方法の選択肢", who: "FP" });
    if (work === "self") ask.push({ q: "自営業の老後の年金を増やす制度の使い方", who: "年金事務所・FP" });
    if (retire && retire.gap0 > 0) ask.push({ q: "積立投資の税制優遇（NISA・iDeCo）の使い方", who: "FP・金融機関" });
    if ((a.worries || []).includes("cash")) ask.push({ q: "毎月お金が残らない原因の見つけ方", who: "FP" });

    // 年表
    const events = [{ year: year0, age, text: "いま" }];
    kids.forEach((k, i) => {
      if (k < 18) events.push({ year: year0 + 18 - k, age: age + 18 - k, text: `${i + 1}人目のお子さん 大学入学（教育費のピーク）` });
      if (k < 22) events.push({ year: year0 + 22 - k, age: age + 22 - k, text: `${i + 1}人目のお子さん 独立` });
    });
    if (home === "loan") events.push({ year: year0 + DUMMY.retireAge - age, age: DUMMY.retireAge, text: "住宅ローン完済（仮置き）" });
    if (age < DUMMY.retireAge) events.push({ year: year0 + DUMMY.retireAge - age, age: DUMMY.retireAge, text: "定年・年金受給開始（65歳で計算）" });
    if (sim0.shortageAge !== null) events.push({ year: year0 + sim0.shortageAge - age, age: sim0.shortageAge, text: "貯蓄が底をつく見込み（運用しない場合）" });
    events.sort((x, y) => x.year - y.year);

    return { provisional, death, disability, retire, sim0, simR, todos, insurance, ask, events, living, savings, income, ret: as.ret };
  }

  function round100(n) {
    return Math.round(n / 100) * 100;
  }

  window.KSC = { compute };
})();
