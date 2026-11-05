/* ③ 要約（老後・万一・働けない・いまの支出・天気・やること・聞くこと・年表の骨組み）
 * 設計書 docs/design/02_architecture.md §6。
 * - 要約は年ごとの計算（model/yearly.js の部品と推移）から取る。別の式で近似しない
 * - 文を作らない。判定と数値（キーと引数）だけを返す。文は view/explain.js が作る
 */
(function () {
  "use strict";
  if (!window.KSP || !window.KSY) throw new Error("model/plan.js・model/yearly.js が読み込まれていません（model/metrics.js より前に読み込んでください）");
  const P_ = window.KSP, Y = window.KSY;
  const C = P_.DUMMY, R = P_.RULES;
  const PCT = P_.PCT, MONTHS = P_.MONTHS;
  const SUN = "sun", CLOUD = "cloud", RAIN = "rain";

  const roundTo = (n, unit) => Math.round(n / unit) * unit;
  const ceilTo = (n, unit) => Math.ceil(n / unit) * unit;
  // 不足額を切り上げるときの許容：1円以下のずれは浮動小数の誤差とみなす（11,910.000…02万円を 11,920万円にしない）。
  // 1円以下の不足そのもの（0.5円など）は、許容を引かずに切り上げる（底をつくのに「不足0円」と出さないため。2026-10-31 A7-1）
  const GAP_TOL = 1 / P_.YEN_PER_MAN;
  const ceilGap = (n, unit) => ceilTo(n > GAP_TOL ? n - GAP_TOL : n, unit);

  // いまの年収が、同じ年齢の平均からどれくらい離れているか。
  // 「年齢に応じて」は平均の増え方をそのまま掛けるため、平均から大きく離れた人ほど、実際とずれやすい。
  function incomeVsAverage(workKind, ageNow, incomeMan) {
    const W = window.KSDATA && window.KSDATA.wage;
    // パート・時短・育休は、フルタイムの平均と「水準」を比べても意味がない（労働時間が違う）
    if (!W || !(W.levelCompare || []).includes(workKind)) return null;
    const s = Y.wageSeries(workKind);
    if (!s || !incomeMan) return null;
    const avgMan = Y.wageAt(s, ageNow) / (P_.YEN_PER_MAN / P_.YEN_PER_SEN);  // 千円/年 → 万円/年
    if (!avgMan) return null;
    const ratio = incomeMan / avgMan;
    return { avg: Math.round(avgMan), ratio: Math.round(ratio * PCT) / PCT, far: ratio > P_.need("estimate", "incomeFarHigh") || ratio < P_.need("estimate", "incomeFarLow") };
  }

  /** 住宅ローンのいまの状態。返し終えたかの判定は model/plan.js の loanPaidOff（1か所）で、ここはそれを使い分けるだけ。
   * paidOff  … いまの家のローンを返し終えている（完済の年齢がいまの年齢以下）
   * goneNow  … いまの年から、いまの家の返済が1年も入らない（返し終えた、またはいまの年に住み替えて外した）。⑤・⑦が使う
   * forDeath … 万一の保障額に、いまの家のローン（団信・残りの返済）がかかわる。万一の保障額はいまの住まいが続く前提
   *             （住み替え・購入は入れない）なので、住み替えでは外さず、返し終えたときだけ外す。万一の注記・⑥の内訳が使う
   * purchase … 購入の借入れを計算に入れた（購入した家のローン）
   * consult  … 団信と保障の重なりを確かめる意味がある（forDeath か purchase）。やること loan・聞くこと dansin が使う
   * ignoredBalance … 「いまの返済額と残高」で返し終えているのに入っている残高（計算に入れていない。⑦に出す。第9巡 B9-4）
   * 以前は「住宅ローンあり」の答えだけを見て、返し終えた人にも団信・残りの返済の文を出していた（2026-10-31 第9巡 B9-1） */
  function loanNowOf(plan, sched) {
    const m = sched.moveDropped;
    const current = plan.home === "loan";
    const paidOff = Boolean(plan.loanPaidOff);
    const goneNow = current && (paidOff || Boolean(m && m.home === "current" && m.age <= plan.age));
    const forDeath = current && !paidOff;
    const purchase = sched.purchaseOff !== null && sched.purchaseLoan > 0;
    const mm = plan.loanMismatch;
    return { current, paidOff, endAge: current ? plan.loanEndAge : null, goneNow, forDeath, purchase, consult: forDeath || purchase,
      ignoredBalance: mm && mm.kind === "paidBalance" ? mm.balance : null };
  }

  /** 万一のとき（死亡）。扶養している家族がいなければ null。
   * 遺族の期間（末子の独立まで、配偶者がいれば最低 survivorMinYears 年）の支出を、年ごとの部品で足す。
   * どの費目を入れるかは data/assumptions.json の defaults.survivorItems。**遺族の割合を掛けるのは生活費だけ**。
   * 住居費は年ごとの部品（家賃・固定資産税・マンションの管理費と修繕積立金）を物価の上昇なしで足す。
   * 住宅の購入・住み替えの予定は入れず、いまの住まいが続く前提で見る（入れていないことは画面に出す）。
   * 住宅ローンは返済の残り（団信があれば0）、修繕の一時金は入れない（入れていないことは画面に出す）。
   * 配偶者の収入は、年ごとの部品（定年・やめる予定・育休を含む。物価なし）を遺族の期間ぶん足す。
   * 遺族年金は年ごとに、その年に18歳未満の子の人数で出す（子の加算は rules.survivorKidAddMax 人までが1人目・2人目の額、それより多い子は3人目以降の額）。
   * 配偶者がいないとき（子が受け取る）は、本体＋2人目以降の子の加算（日本年金機構「子が受け取るとき」）。1人目の子の加算は付かない。
   * 配偶者が遺族の期間に受け取る老齢年金（年ごとの部品の配偶者の分）も差し引く（2026-10-31 A2-2）。
   * ただし遺族年金と配偶者の老齢年金が重なる年は、大きい方だけ（1人1年金。2026-10-31 A3-1）。
   * 遺族厚生年金が子の18歳以後も続くこと・中高齢寡婦加算は入れない（結果が良くなる方向。画面に出す） */
  function deathOf(plan, model) {
    const D = plan.detail, age = plan.age;
    // 扶養として数えるのは、いま生まれている子のうち、まだ独立していない子（独立の年齢より前）だけ。
    // 以前は独立した子も数え、子がみな独立したひとり親に万一の必要額が出て「優先して検討」になっていた（2026-10-31 第12巡 B12-中1）
    const deps = dependentKidsNow(plan, model);
    if (!(plan.spouse || deps.length)) return null;
    const { eduCost, independAge } = model;
    // 末子が独立するまで。配偶者がいる場合は、それが短くても最低 survivorMinYears 年は見る
    const years = Math.max(
      plan.spouse ? R.survivorMinYears : 0,
      deps.length ? Math.max(...deps.map(({ k, i }) => independAge(i) - k)) : 0
    );
    const eduRemain = deps.reduce((s, { k, i }) => { let t = 0; for (let x = k; x <= Y.STAGE.univLast; x++) t += eduCost(i, x); return s + t; }, 0);
    // いま亡くなった場合の残り。繰り上げ返済の予定は、まだしていないので入れない（予定後の完済年齢ではなく、いまの完済年齢で見る）
    const loanNow = loanNowOf(plan, model.sched);
    const loanLeft = loanNow.forDeath && D.loan.dansin !== "yes" ? Math.min(plan.loanBalance, plan.loanYearly * Math.max(0, plan.loanEndAge - age)) : 0;
    // 奨学金は、本人が亡くなったときに返還が免除される制度があるため、ここでは残さない（要確認）
    const otherLoanLeft = D.loans.length
      ? D.loans.filter((l) => l.kind !== "shougakukin").reduce((t, l) => t + Number(l.balance || 0), 0)
      : (plan.otherLoanBand === null ? 0 : Number(plan.otherLoanBand));
    const items = new Set(P_.needList("defaults", "survivorItems"));
    items.forEach((k) => { if (!SURVIVOR_ITEMS.includes(k)) throw new Error(`前提『defaults.survivorItems』に知らない費目があります: ${k}`); });
    let housing = 0, rent = 0, spouseInc = 0, spousePension = 0, survivorPension = 0, pensionChoiceYears = 0;
    const employeePart = plan.employeeLike ? plan.income * C.survivorEmployeeRate : 0;
    for (let y = 0; y < years; y++) {
      const h = model.housingCost(y, { noInflation: true, current: true });
      housing += h.rent + h.tax + h.fee;
      rent += h.rent;
      spouseInc += model.incomeSpouseAt(y);
      const own = model.incomePensionSpouseAt(y);   // 配偶者自身の老齢年金（その年に受け取る年齢なら）
      const kidsUnder = deps.filter(({ k }) => k + y < R.survivorKidUntil).length;
      // 子の加算：子を1人目から数え、rules.survivorKidAddMax 人目までは1人目・2人目の額、それより後は3人目以降の額（2026-10-31 K5）。
      // 子が受け取るとき（配偶者なし）は1人目に加算が付かない（本体＋2人目以降の加算）。以前は1人目にも足していた（2026-10-31 A2-1）
      let surv = 0, survEmployee = 0;
      if (kidsUnder > 0) {
        let add = 0;
        for (let n = plan.spouse ? 1 : 2; n <= kidsUnder; n++) add += n <= R.survivorKidAddMax ? C.survivorKidAdd : C.survivorKidAdd3;
        surv = C.survivorBase + add + employeePart;
        survEmployee = employeePart;
      }
      if (own > 0 && surv > 0) {
        // 1人1年金（日本年金機構「年金の併給または選択」）：支給事由の違う年金は原則1つを選ぶ。
        // 遺族基礎年金と配偶者の老齢基礎年金は両方は受けない。65歳以上で老齢厚生年金と遺族厚生年金があるときは、
        // 老齢厚生年金を受け、遺族厚生年金はそれより高い場合の差額だけ。
        // → 「遺族基礎＋子の加算＋遺族厚生」と「老齢基礎＋（老齢厚生と遺族厚生の大きい方）」の大きい方だけを足す。
        // 遺族厚生年金の「2/3＋老齢厚生の1/2」の計算は入れない（受け取る額が増える方向。厳しめ）。
        // 以前は両方を足していた（2026-10-31 A3-1）
        const ownBasic = Math.min(own, C.pensionBase), ownEmployee = own - ownBasic;
        const withOwn = ownBasic + Math.max(ownEmployee, survEmployee);
        pensionChoiceYears++;
        if (surv >= withOwn) survivorPension += surv;
        else { survivorPension += withOwn - own; spousePension += own; }
      } else {
        survivorPension += surv;
        spousePension += own;
      }
    }
    const calc = (ratio) => {
      const expense = (items.has("living") ? plan.living * MONTHS * ratio * years : 0)
        + (items.has("edu") ? eduRemain : 0)
        + (items.has("housing") ? housing : 0)
        + (items.has("homeLoan") ? loanLeft : 0)
        + (items.has("otherLoan") ? otherLoanLeft : 0)
        + (items.has("funeral") ? C.funeral : 0);
      return { expense, need: Math.max(0, expense - survivorPension - spouseInc - spousePension - plan.savings - plan.insuredDeath) };
    };
    const lo = calc(plan.ratioLow), hi = calc(plan.ratioHigh);
    // 支出の内訳（入れている費目だけ）。画面の「内訳を見る」の行で、足すと expenseLow〜expenseHigh になる（第10巡 B10-3）
    const livingOf = (ratio) => (items.has("living") ? plan.living * MONTHS * ratio * years : 0);
    const parts = {
      on: SURVIVOR_ITEMS.filter((k) => items.has(k)),
      livingLow: Math.min(livingOf(plan.ratioLow), livingOf(plan.ratioHigh)), livingHigh: Math.max(livingOf(plan.ratioLow), livingOf(plan.ratioHigh)),
      edu: items.has("edu") ? eduRemain : 0, housing: items.has("housing") ? housing : 0, homeLoan: items.has("homeLoan") ? loanLeft : 0,
      otherLoan: items.has("otherLoan") ? otherLoanLeft : 0, funeral: items.has("funeral") ? C.funeral : 0,
    };
    // 遺族の生活費の割合は、下限と上限が逆に入っていることがある。小さいほう〜大きいほうにそろえ、判定は大きいほうで行う
    const needLow = Math.min(lo.need, hi.need), needHigh = Math.max(lo.need, hi.need);
    return {
      years, low: roundTo(needLow, R.deathRound), high: roundTo(needHigh, R.deathRound),
      breakdown: { expenseLow: Math.min(lo.expense, hi.expense), expenseHigh: Math.max(lo.expense, hi.expense), eduRemain, housing, rent, loanLeft, otherLoanLeft, survivorPension, spouseInc, spousePension, savings: plan.savings, insuredDeath: plan.insuredDeath, loanNote: loanNow.forDeath && D.loan.dansin === "yes", shougakukin: D.loans.some((l) => l.kind === "shougakukin"),
        employeePart: plan.employeeLike, pensionChoiceYears, parts },
    };
  }

  /** いま生まれている子のうち、まだ独立していない子（{ k: いまの年齢, i: 子の番号 }）。独立の年齢は model.independAge（学校を出た次の年齢） */
  function dependentKidsNow(plan, model) {
    return plan.kidsNow.map((k, i) => ({ k, i })).filter(({ k, i }) => k < model.independAge(i));
  }
  // 万一の保障額に入れられる費目（data/assumptions.json の defaults.survivorItems はこの中から選ぶ）
  const SURVIVOR_ITEMS = ["living", "housing", "homeLoan", "edu", "otherLoan", "funeral"];

  /** 働けなくなったとき（月あたり）。いまの年の部品から。
   * 毎月の支出は生活費＋住居費だけ（教育費・車・借入れの返済などは含めない。文にも出す）。
   * そこから、休業中の手当・障害年金・配偶者の収入（いまの年の部品）・受け取っている年金・加入中の保障を差し引く。
   * 働いていない人は、働けなくなっても収入が変わらないので対象外（na）。
   * 年金の年齢を過ぎている人は、障害年金を見込まない（老齢の年金を受け取っているため。厳しめの見方）。
   * 以前は働いていない人にも不足を出し、年金を受け取っている人の年金を差し引いていなかった（2026-10-31） */
  function disabilityOf(plan, model) {
    // 対象かどうかは、いまの年の仕事の収入（年ごとの部品）で見る。定年をいまの年齢より前にした人は、
    // 働けなくなっても収入は変わらない（2026-10-31 A3-2。以前は答えの年収だけを見て、傷病手当金を見込んでいた）
    const working = plan.work !== "none" && model.incomeWorkAt(0) > 0;
    const hc0 = model.housingCost(0);
    // 住居費（base）には住宅ローンの返済が入っている。文で「住宅ローンの返済を含む」と言えるように印を返す（2026-10-31 B2-中3）
    const withHomeLoan = hc0.homeLoan > 0;
    if (!working) return { first: 0, after: 0, hasSick: false, na: true, pension: 0, withHomeLoan };
    const monthlyNeed = plan.living + hc0.base / MONTHS;
    const spouseMonthly = model.incomeSpouseAt(0) / MONTHS;
    const pensionMonthly = model.incomePensionAt(0) / MONTHS;
    // 傷病手当金・障害厚生年金の上乗せは、いま勤め先の給与がある会社員・公務員だけ。手当はいまの年の給与（再雇用中は再雇用の年収）から
    const gross0 = plan.employeeLike ? model.wageGrossAt(0).gross : 0;
    const sickMonthly = gross0 > 0 ? (gross0 / MONTHS) * C.sickRate : 0;
    const disabilityPension = plan.age >= C.pensionAge ? 0 : C.disabilityMonthly + (gross0 > 0 ? C.disabilityEmployeeAdd : 0);
    const others = spouseMonthly + pensionMonthly + plan.insuredDisability;
    return {
      first: Math.max(0, monthlyNeed - sickMonthly - others),
      after: Math.max(0, monthlyNeed - disabilityPension - others),
      hasSick: sickMonthly > 0, na: false, pension: pensionMonthly, noDisabilityPension: plan.age >= C.pensionAge, withHomeLoan,
      // 差し引いたもの（文で、数えたものだけを並べるため）
      spouse: spouseMonthly > 0, insured: plan.insuredDisability > 0, self: plan.work === "self",
    };
  }

  /** 急な出費への備え：貯蓄が「生活費＋住居費」の何か月分か。天気とやることで同じ目安・同じ数え方にする */
  function emergencyOf(plan, hc0) {
    const months = plan.savings / Math.max(1, plan.living + hc0.base / MONTHS);
    const vary = plan.work === "self" && plan.answers.selfVary === "vary";
    return { months, need: vary ? R.emergencyMonthsVary : R.emergencyMonths, vary, withHomeLoan: hc0.homeLoan > 0 };
  }

  /** 老後の不足額。残高の推移そのものから出す（受け取り開始から終わりの年齢までの最小残高のマイナス分） */
  function retireOf(plan, sim0, simR) {
    const age = plan.age;
    if (age >= C.pensionAge) return null;
    // 以前は「生活費×割合×年数−年金」で別に計算しており、住居費・車・65歳以降の物価が入らず、
    // 「不足0円」と「83歳で底をつく」が同じ画面に並んでいた（2026-10-30）。天気の判定と同じ推移を使う
    const shortOf = (sim) => {
      const post = sim.points.filter((p) => p.age >= C.pensionAge);
      // 丸める前の残高で見る（shortageAge と同じ値）。四捨五入した残高だと −0.4万円が「0円」になり、
      // 「90歳で底をつく」と「不足0円」が並んでいた（2026-10-31 A2-3）
      return post.length ? Math.max(0, -Math.min(...post.map((p) => p.raw))) : 0;
    };
    const gap0 = shortOf(sim0);
    const months = (C.pensionAge - age) * MONTHS;
    const monthly = (gap, r) => {
      if (gap <= 0 || months <= 0) return 0;
      if (r <= 0) return gap / months;
      const i = r / MONTHS;
      return (gap * i) / (Math.pow(1 + i, months) - 1);
    };
    return {
      // 切り上げる。四捨五入だと、少しでも底をつくのに「0円」と出てしまう。1円以下の誤差は許容する（ceilGap）
      gap0: ceilGap(gap0, R.retireGapRound),
      monthly0: monthly(gap0, 0),
      gapR: simR ? ceilGap(shortOf(simR), R.retireGapRound) : null,
      monthlyR: simR ? monthly(shortOf(simR), plan.ret) : null,
    };
  }

  /** いまの毎月の支出（1年目の部品の内訳）。note は説明の層が付ける */
  function currentOf(plan, model, sim0) {
    const D = plan.detail, a = plan.answers, age = plan.age;
    const p0 = sim0.points[0];
    const hc0 = model.housingCost(0);
    const livingSrc = { answer: "answer", detail: "detail" }[plan.vals.living.source] || "provisional";
    const split = D.set.living ? D.living : P_.splitLiving(plan.living);
    const current = {
      living: { monthly: plan.living, source: livingSrc, items: P_.LIVING_KEYS.map((key) => ({ key, monthly: Number(split[key] || 0) })) },
      // 住宅ローンの返済は、家賃・税金・修繕とは別の行にする（借入れの返済であることが分かるように）
      // 返し終えたローン（model/plan.js の loanPaidOff）は、0円の行として出す（注記で「返し終えています」と言う）。
      // いまの年に購入・住み替えするときは、その先の家の行なので対象外。
      // 以前は「対象なし」として行ごと消え、⑤にもPDFにも返し終えたことが出ていなかった（2026-10-31 第10巡 B10-2）
      homeLoan: (() => {
        const paidOff = Boolean(plan.loanPaidOff) && model.sched.purchaseOff !== 0 && model.sched.moveOff !== 0;
        const src = D.set.home ? "detail" : "provisional";
        return { monthly: hc0.homeLoan / MONTHS, source: hc0.homeLoan || paidOff ? src : "none", paidOff, endAge: paidOff ? plan.loanEndAge : null };
      })(),
      housing: {
        monthly: (hc0.base - hc0.homeLoan) / MONTHS,
        source: D.set.home ? "detail"
          : plan.home === "family" ? "answer"
          : plan.renting && a.rent && a.rent !== "unknown" ? "answer"
          : "provisional",
      },
      edu: { monthly: p0.exp.edu / MONTHS, source: plan.kids.length ? (D.set.edu ? "detail" : a.eduPlan === "unknown" ? "provisional" : "answer") : "none" },
      car: { monthly: D.cars.reduce((t, c) => t + (age < Number(c.until) ? Number(c.upkeep) : 0), 0) / MONTHS, source: D.cars.length ? (D.set.car ? "detail" : "provisional") : "none" },
      loan: { monthly: D.loans.reduce((t, l) => t + (age < Number(l.endAge) ? Number(l.monthly) : 0), 0), source: D.loans.length ? "detail" : a.otherLoan === "yes" ? "provisional" : "none" },
      // 旅行は「何歳まで」より前の年だけ（model/yearly.js の expenseTravelAt と同じ判定。以前は過ぎていても入れていた。2026-10-31 A8-2）
      other: { monthly: (Number(D.spend.travel) > 0 && age < Number(D.spend.travelUntil) ? Number(D.spend.travel) : 0) / MONTHS + (model.sched.care && model.sched.care.fromAge === age ? model.sched.care.monthly : 0), source: D.set.spend || D.set.family ? "detail" : "none" },
      incomeMonthly: p0.income / MONTHS,
    };
    current.total = ["living", "homeLoan", "housing", "edu", "car", "loan", "other"].reduce((t, k) => t + current[k].monthly, 0);
    return current;
  }

  /** やることリスト（一般的な優先順: 生活防衛資金 → 保障 → 教育 → 近い大きな出費 → 老後） */
  function todosOf(plan, model, sim0, death, retire, disability) {
    const D = plan.detail, a = plan.answers, age = plan.age;
    const todos = [];
    // 「生活費＋住居費」の何か月分か。天気の判定と同じ定義・同じ目安（収入の波が大きい自営業は長い目安）・同じ数え方（切り捨て）。
    // 以前はやることだけ常に短い目安で、四捨五入していた（2026-10-31）。月数は丸めずに渡し、切り捨ては説明の層（天気と同じ savingsMonths。第12巡 B12-軽2）
    const em = emergencyOf(plan, model.housingCost(0));
    if (em.months < em.need) todos.push({ key: "emergency", when: { kind: "now" }, args: { months: Math.max(0, em.months), target: em.need, vary: em.vary, withHomeLoan: em.withHomeLoan } });
    if (death && death.high > 0) {
      const b = death.breakdown;
      todos.push({ key: "death", when: { kind: "now" }, args: { low: death.low, high: death.high,
        // 遺族の期間は、いま生まれている子で決まる（予定の子は数えない。deathOf と同じ）
        withKids: dependentKidsNow(plan, model).length > 0,   // 独立した子は数えない（第12巡 B12-中1）
        // 数えたものだけを並べる。収入の無い配偶者を「配偶者の収入」と言わない（2026-10-31 B2-中2）
        survivorPension: b.survivorPension > 0, spouse: b.spouseInc > 0, spousePension: b.spousePension > 0, insured: b.insuredDeath > 0 } });
    }
    // 働けなくなったときの備え（自営業）。対象外（いま仕事の収入が無い）や、はじめの期間の不足が0のときは出さない。
    // 保険の優先度（noSickCovered・notWorking）・天気と同じ計算の結果で決める。以前は自営業なら常に「今すぐ」と出していた（2026-10-31 B5-1）
    // 働けなくなったときの保障に入っていて額が未入力なら、その保障を含めない不足だと言う（天気の pending と同じ条件。2026-10-31 B6-3）
    if (plan.work === "self" && disability && !disability.na && disability.first > 0) todos.push({ key: "disability", when: { kind: "now" }, args: { first: disability.first, pending: Boolean(plan.disabilityPending) } });
    // 教育費のピーク（最も教育費が多い年）
    if (plan.kids.length) {
      const peak = sim0.points.reduce((m, p) => (p.exp.edu > m.exp.edu ? p : m), sim0.points[0]);
      if (peak.exp.edu > 0 && peak.age > age) {
        todos.push({ key: "edu", when: { kind: "within", years: peak.age - age }, args: { year: peak.year, age: peak.age, amount: peak.exp.edu } });
      }
    }
    const soon = model.sched.lifeEvents.filter((e) => e.offset > 0 && e.offset <= R.soonYears && e.amount >= R.soonMinAmount).sort((x, y) => x.offset - y.offset)[0];
    if (soon) todos.push({ key: "soon", when: { kind: "within", years: soon.offset }, args: { year: plan.year0 + soon.offset, age: age + soon.offset, event: soon } });
    // 介護は、計算が実際に入れた期間（model.sched.care）だけを言う。始まりが過ぎていて続いている介護は「いまから◯歳まで」、
    // 終わった介護は出さない（2026-10-31 B7-3・C7-2。以前は答えの開始年齢のまま「30歳ごろから」と出していた）
    const care = model.sched.care;
    if (care && !(soon && soon.kind === "care")) {
      const yrs = care.fromAge - age;
      todos.push({ key: "care", when: yrs > 0 ? { kind: "within", years: yrs } : { kind: "now" }, args: { startAge: care.startAge, untilAge: care.toAge, ongoing: care.ongoing, yearly: care.monthly * MONTHS } });
    }
    if (retire && retire.gap0 > 0) {
      todos.push({ key: "retire", when: { kind: "within", years: C.pensionAge - age }, args: { gap: retire.gap0, monthly: retire.monthly0, endAge: C.endAge, pensionAge: C.pensionAge } });
    }
    // 返し終えたローンには出さない。購入の借入れがあれば、購入した家のローンとして出す（2026-10-31 第9巡 B9-1）
    if (loanNowOf(plan, model.sched).consult) todos.push({ key: "loan", when: { kind: "consult" }, args: {} });
    if (sim0.shortageAge !== null) todos.push({ key: "cash", when: { kind: "review" }, args: { age: sim0.shortageAge } });
    return todos;
  }

  /** 保険の種類ごとの優先度（3段階：l1 優先して検討／l2 状況により検討／l3 公的保障・貯蓄で賄える可能性が高い） */
  function insuranceOf(plan, death, disability, kidsDependent) {
    const short = Boolean(death && death.high > 0);
    const self = plan.work === "self";
    return [
      // 理由は「扶養家族がいない」「不足あり」「不足なし（家族あり）」を分ける。以前は家族がいて不足が無い人にも
      // 「扶養しているご家族がいない場合」と出ていた（2026-10-31 B2-中1）
      // 「優先して検討」は、まだ独立していない子（これから生まれる予定の子を含む）がいて不足するとき。独立した子は数えない（第12巡 B12-中1）
      { key: "death", level: short && kidsDependent ? "l1" : plan.spouse ? "l2" : "l3", reason: !death ? "noDependents" : short ? "short" : "covered",
        args: death ? { survivorPension: death.breakdown.survivorPension > 0, spouse: death.breakdown.spouseInc > 0, spousePension: death.breakdown.spousePension > 0, insured: death.breakdown.insuredDeath > 0 } : {} },
      { key: "medical", level: plan.savings >= R.medicalSavingsEnough ? "l3" : "l2", reason: "kougaku" },
      // 理由は計算の前提（disabilityOf の hasSick・na）から選ぶ。以前は自営業かどうかだけで分け、
      // パート・働いていない人にも「休業中の手当はありますが」と出ていた（2026-10-31 B3-中1）
      // 休業中の手当が無い働き方でも、配偶者の収入などで毎月の支出をまかなえる（はじめの期間の不足が0）なら、
      // 死亡保障と同じく1段下げ、理由も計算の結果に合わせる。手当が無いので、それ以降の不足ははじめの期間より大きくならない。
      // 以前は不足を見ずに「優先して検討」とし、天気の「晴れ・不足なし」と並んでいた（2026-10-31 B4-2）
      { key: "disability",
        level: disability.na ? "l3" : disability.hasSick ? "l2" : disability.first <= 0 ? "l2" : "l1",
        reason: disability.na ? "notWorking" : !disability.hasSick && disability.first <= 0 ? "noSickCovered" : self ? "self" : disability.hasSick ? "employee" : "noSick",
        args: { self, spouse: Boolean(disability.spouse), withPension: disability.pension > 0, insured: Boolean(disability.insured) } },
      { key: "liability", level: "l2", reason: "bicycle" },
    ];
  }

  /** 専門家に聞くこと（キーの並び） */
  function askOf(plan, retire, disability, sched) {
    const D = plan.detail, a = plan.answers;
    const keys = [];
    if (loanNowOf(plan, sched).consult) keys.push("dansin");   // やること loan と同じ判定（第9巡 B9-1）
    keys.push("health");
    if (plan.kids.length || a.kids === "plan") keys.push("eduPrep");
    if (plan.work === "self") keys.push("selfPension");
    if (retire && retire.gap0 > 0) keys.push("taxFree");
    // 購入の返済額を聞くのは、計算が実際に購入を入れ、借入れがあるときだけ（頭金だけ・いまの年齢より前の購入には出さない。2026-10-31 B6-2・C6-軽2）
    if (sched.purchaseOff !== null && sched.purchaseLoan > 0) keys.push("purchase");
    if (plan.owns && plan.homeType === "house") keys.push("repairSaving");
    // 介護は計算に入れたときだけ（終わった介護は聞かない。2026-10-31 B7-3・C7-2）
    if (sched.care) keys.push("care");
    if (plan.anyInsurance) keys.push("insuranceFit");
    if (plan.work === "self" && (a.selfPension || []).includes("none")) keys.push("selfExtra");
    if (D.loans.some((l) => l.kind === "shougakukin")) keys.push("shougakukin");
    if (plan.planned.length) keys.push("birth");
    if (plan.others > 0) keys.push("dependents");
    // 事実婚のとき、届出をしている場合と扱いが違うところ（公的な整理にもとづく）
    if (a.spouse === "partner") keys.push("partnerPension", "partnerEstate");
    // 「気になっていること」で選んだものを、聞くことに反映する
    (a.worries || []).forEach((w) => {
      // 自営業・フリーランスには勤務先の制度が無いので、聞く相手と内容を変える（2026-10-31 B2-軽14）。
      // いま仕事の収入が無い人（働けなくなったときの対象外）にも、勤務先の制度は言わない（2026-10-31 B4-4）
      const sickKind = disability && disability.na ? "None" : plan.work === "self" ? "Self" : "";
      const k = "worry." + w + (w === "sick" ? sickKind : "");
      // 住宅ローンの借り換え・繰り上げ返済は、住宅ローンが計算にかかわるとき（団信と同じ判定 consult）だけ。
      // 以前は返し終えた人・賃貸・返済のない持ち家にも出ていた（2026-10-31 第10巡 B10-4）
      if (w === "loan" && !loanNowOf(plan, sched).consult) return;
      if (WORRY_KEYS.includes(w) && !keys.includes(k)) keys.push(k);
    });
    return keys;
  }
  const WORRY_KEYS = ["death", "sick", "edu", "loan", "retire", "invest", "cash"];

  /** 見通しの天気（5項目）。判定は常に運用しない場合の推移（sim0）で行う */
  function forecastOf(plan, sim0, death, disability, hc0) {
    const D = plan.detail, a = plan.answers, age = plan.age;
    const living = plan.living, savings = plan.savings;
    // すでに年金の年齢に達している人の生活費には老後の割合を掛けていない（model/yearly.js の expenseLivingAt）。境目も同じにする（2026-10-31 B2-軽7）
    const retireRatio = age >= C.pensionAge ? 1 : Number(D.retire.ratio) / PCT;
    const pre = sim0.points.filter((p) => p.age < C.pensionAge);
    const post = sim0.points.filter((p) => p.age >= C.pensionAge);
    const out = [];
    if (pre.length) {
      // 判定は丸める前の残高（raw）で行う（老後の不足額・shortageAge と同じ。2026-10-31 A2-3）
      const min = pre.reduce((m, p) => (p.raw < m.raw ? p : m), pre[0]);
      const cushion = living * R.workingCushionMonths;   // 生活費の半年分（12か月ぶんの生活費 × 6/12 と同じ）
      const minus = pre.find((p) => p.raw < 0);
      out.push({ key: "working", target: "cash",
        weather: min.raw < 0 ? RAIN : min.raw < cushion ? CLOUD : SUN,
        args: { minusAge: minus ? minus.age : null, minAge: min.age, minBalance: min.balance, minus: min.raw < 0, low: min.raw < cushion, cushionMonths: R.workingCushionMonths, pensionAge: C.pensionAge } });
    }
    {
      const endP = sim0.points[sim0.points.length - 1];
      const outAge = post.find((p) => p.raw < 0)?.age ?? null;
      const cushion = living * MONTHS * retireRatio * R.retireCushionYears;
      out.push({ key: "retire", target: "cash",
        weather: outAge !== null ? RAIN : endP.raw < cushion ? CLOUD : SUN,
        args: { outAge, firstAge: post[0] ? post[0].age : null, firstBalance: post[0] ? post[0].balance : null, alreadyMinus: Boolean(post[0] && post[0].raw < 0), firstIsNow: Boolean(post[0] && post[0].age <= age), endBalance: endP.balance, low: endP.raw < cushion, cushionYears: R.retireCushionYears, endAge: C.endAge } });
    }
    out.push(!death
      ? { key: "death", target: "estimate", weather: SUN, args: { none: true, cloudMax: R.deathCloudMax } }
      : { key: "death", target: "estimate",
        weather: plan.insurancePending ? CLOUD : death.high <= 0 ? SUN : death.high <= R.deathCloudMax ? CLOUD : RAIN,
        args: { none: false, pending: plan.insurancePending, low: death.low, high: death.high, cloudMax: R.deathCloudMax,
          survivorPension: death.breakdown.survivorPension > 0, spouse: death.breakdown.spouseInc > 0, spousePension: death.breakdown.spousePension > 0, insured: death.breakdown.insuredDeath > 0 } });
    {
      const need = disability.first * R.sickMonths;
      // 未入力の判定は、働けなくなったときの保障の未入力で見る（死亡保障の未入力では見ない）
      const pending = plan.disabilityPending && !disability.na;
      out.push({ key: "sick", target: "estimate",
        weather: disability.na ? SUN : pending ? CLOUD : disability.first <= 0 ? SUN : need <= savings ? CLOUD : RAIN,
        // 判定ははじめの期間（傷病手当金の期間）だけ。それ以降の不足（after）も文に出す（2026-10-31 B3-中3）
        args: { na: disability.na, pending, first: disability.first, after: disability.after, need, coverable: need <= savings, months: R.sickMonths, withPension: disability.pension > 0, withHomeLoan: disability.withHomeLoan,
          hasSick: disability.hasSick, spouse: Boolean(disability.spouse), insured: Boolean(disability.insured), noDisabilityPension: Boolean(disability.noDisabilityPension) } });
    }
    {
      const em = emergencyOf(plan, hc0);
      out.push({ key: "emergency", target: "costs",
        weather: em.months >= em.need ? SUN : em.months >= em.need / 2 ? CLOUD : RAIN,
        args: { months: em.months, need: em.need, vary: em.vary, cap: R.emergencyCapMonths, withHomeLoan: em.withHomeLoan } });
    }
    return out;
  }

  /** 年表の骨組み（人ごとの行と出来事）。出来事は種類（ev）と数値（args）だけを持つ */
  function lanesOf(plan, model) {
    const D = plan.detail, age = plan.age, span = plan.span;
    const W = D.work, SW = D.spouseWork;
    const S = Y.STAGE;
    const selfEvents = [];
    // 働いていない人には定年が無いので、定年の行は出さず、年金の年齢だけを出す（以前は「定年（65歳）・年金受給開始」。2026-10-31 B4-5）
    const working = plan.work !== "none";
    if (working && plan.retireAge - age >= 0 && plan.retireAge - age <= span) {
      // older：定年の目安を過ぎて働いている人の「仕事をやめる年齢」を仮置きしているとき（説明では「定年」と言わない。2026-10-31 B4-5）。
      selfEvents.push({ offset: plan.retireAge - age, ev: "retire", args: { retireAge: plan.retireAge, rehire: Number(W.rehire) > 0, rehireUntil: plan.rehireUntil, withPension: false, older: plan.olderStop } });
    }
    if (C.pensionAge - age >= 0) {
      if (working && plan.retireAge === C.pensionAge) { if (selfEvents[0]) selfEvents[0].args.withPension = true; }
      else selfEvents.push({ offset: C.pensionAge - age, ev: "pension", args: { age: C.pensionAge } });
    }
    // 住み替えでいまの家のローンを外したときは、完済も出さない（返していないため。2026-10-31 B5-2）
    const loanDropped = Boolean(model.sched.moveDropped && model.sched.moveDropped.home === "current" && model.sched.moveDropped.loan);
    if (plan.home === "loan" && model.loanEndAge - age > 0 && !loanDropped) selfEvents.push({ offset: model.loanEndAge - age, ev: "payoff", args: { age: model.loanEndAge } });
    const lanes = [{ who: "self", ageNow: age, end: span, events: selfEvents.filter((e) => e.offset <= span) }];
    if (plan.spouse) {
      const sev = [];
      // 「仕事をやめる」は、配偶者に仕事の収入がある（または働き始める予定がある）ときだけ。
      // 同じ年に年金の受け取りが始まるなら、本人の「定年・年金受給開始」と同じく1つの出来事にまとめる。
      // 以前は働いていない配偶者にも「仕事をやめる」を出し、同じ年の「年金受給開始」を落としていた（2026-10-31 B3-軽3・C3-4）
      // その前に「仕事をやめる」予定（quit）があれば、定年の出来事は出さない（二重になる）
      const works = ((plan.spouseWork && plan.spouseWork !== "none") || SW.plan === "return")
        && !(SW.plan === "quit" && Number(SW.planFrom) <= Number(SW.retireAge) - plan.spouseAge);
      const off = Number(SW.retireAge) - plan.spouseAge;
      const pOff = C.pensionAge - plan.spouseAge;
      const retireShown = works && off >= 0 && off <= span;
      if (retireShown) sev.push({ offset: off, ev: "spouseRetire", args: { age: SW.retireAge, withPension: pOff === off } });
      if (pOff >= 0 && pOff <= span && !(retireShown && pOff === off)) sev.push({ offset: pOff, ev: "spousePension", args: {} });
      const f = Number(SW.planFrom);
      if (SW.plan === "leave" && f <= span) sev.push({ offset: f, ev: "spouseLeave", args: { years: SW.planYears, rate: SW.planRate }, kind: "work" });
      if (SW.plan === "quit" && f <= span) sev.push({ offset: f, ev: "spouseQuit", args: {}, kind: "work" });
      if (SW.plan === "return" && f <= span) sev.push({ offset: f, ev: "spouseReturn", args: {}, kind: "work" });
      lanes.push({ who: "spouse", ageNow: plan.spouseAge, end: span, events: sev });
    }
    plan.kids.forEach((k, i) => {
      const p = model.eduPlanOf(i);
      const ms = [[0, "birth"], [S.elemFrom, "elem"], [S.juniorFrom, "junior"], [S.highFrom, "high"]];
      if (p.univ !== "none") ms.push([S.univFrom, "univ"]);
      ms.push([model.independAge(i), "independ"]);
      lanes.push({
        who: "kid", kidIdx: i, ageNow: k, end: Math.max(0, Math.min(span, model.independAge(i) - k)),
        events: ms.filter(([m]) => m > k && m - k <= span).map(([m, stage]) => ({ offset: m - k, ev: "kidStage", args: { stage, kidIdx: i, plan: p } })),
      });
    });
    const life = model.sched.lifeEvents.slice();
    if (life.length) lanes.push({ who: "life", ageNow: null, end: span, track: false, events: life.sort((x, y) => x.offset - y.offset) });
    return lanes;
  }

  /** すべての要約をまとめて出す */
  function summarize(plan, model, sim0, simR) {
    const D = plan.detail, age = plan.age;
    const death = deathOf(plan, model);
    const disability = disabilityOf(plan, model);
    const retire = retireOf(plan, sim0, simR);
    const hc0 = model.housingCost(0);
    const kidInfo = plan.kids.map((k, i) => ({ ageNow: k, plan: model.eduPlanOf(i), independ: model.independAge(i) }));
    const W = D.work;
    const wageApplied = W.growth === "stat" && Y.wageFactor(plan.work, age, age + 1) !== null;
    return {
      death, disability, retire,
      current: currentOf(plan, model, sim0),
      todos: todosOf(plan, model, sim0, death, retire, disability),
      insurance: insuranceOf(plan, death, disability, plan.kids.some((k, i) => k < model.independAge(i))),
      ask: askOf(plan, retire, disability, model.sched),
      forecast: forecastOf(plan, sim0, death, disability, hc0),
      lanes: lanesOf(plan, model),
      kidInfo,
      // いま一緒に暮らしている人数。これから生まれる子（年齢がマイナス）と独立した子は数えない
      householdNow: 1 + (plan.spouse ? 1 : 0) + kidInfo.filter((k) => k.ageNow >= 0 && k.ageNow <= k.independ).length + plan.others,
      incomeCheck: W.growth === "stat" ? incomeVsAverage(plan.work, age, plan.income) : null,
      wageApplied,
      wageCapped: wageApplied && age >= Y.wageCapAge(),
      // 住み替えで外した前の家の費用（「この計算に入れていないこと」に出す。2026-10-31 B4-1）
      moveDropped: model.sched.moveDropped,
      // 住宅ローンのいまの状態（返し終えた・いまの年に外した・購入の借入れ。説明の層はこれだけを見る。第9巡 B9-1）
      loanNow: loanNowOf(plan, model.sched),
      // 住まいの予定のうち、計算が実際に入れたもの・外したもの（説明は入れたものだけを言い、外したものは外したと書く。2026-10-31 B6-2・B6-6・C6-軽1・軽2）
      homePlan: {
        purchase: model.sched.purchaseOff !== null, purchaseLoan: model.sched.purchaseOff !== null && model.sched.purchaseLoan > 0,
        move: model.sched.moveOff !== null, prepay: model.sched.prepayOff !== null, skipped: model.sched.skipped.slice(),
        loanUntilMove: Boolean(model.sched.moveDropped && model.sched.moveDropped.home === "current" && model.sched.moveDropped.loan) ? model.sched.moveDropped.age : null,
      },
    };
  }

  window.KSN = { SURVIVOR_ITEMS, summarize, loanNowOf, deathOf, disabilityOf, retireOf, currentOf, todosOf, insuranceOf, askOf, forecastOf, lanesOf, incomeVsAverage, WORRY_KEYS };
})();
