/* ② 年ごとの部品と simulate()
 * 設計書 docs/design/02_architecture.md §5。以前は calc.js の compute() の中にあった部品を、
 * **中身を変えずに**、凍結した Plan を受け取る形に移した。
 * - 各部品は「その年の金額（万円）」を返す。副作用を持たない
 * - 文言を作らない。年表の出来事も、種類（ev）と数値（args）だけを持つ（文は view/explain.js）
 */
(function () {
  "use strict";
  if (!window.KSP) throw new Error("model/plan.js が読み込まれていません（model/yearly.js より前に読み込んでください）");
  const P_ = window.KSP;
  const C = P_.DUMMY;
  const R = P_.RULES;
  const PCT = P_.PCT, MONTHS = P_.MONTHS;

  // 学校の区切り（data/assumptions.json の rules から）
  const STAGE = R ? {
    kinderFrom: R.schoolKinderFrom,
    elemFrom: R.schoolElemFrom,
    juniorFrom: R.schoolJuniorFrom,
    highFrom: R.schoolHighFrom,
    univFrom: R.schoolUnivFrom,
    univLast: R.schoolUnivFrom + R.univYears - 1,
    vocationalLast: R.schoolUnivFrom + R.vocationalYears - 1,
  } : null;

  // 児童手当は年齢で額が変わる（3歳未満と、3歳〜高校生年代）。第3子以降（rank が rules.childAllowanceThirdRank 以上）は別の額。
  // rank は、22歳になる年度の末日までの子（rules.childAllowanceCountUntil）を上から数えた順番（出典 jidou.third の数え方）
  function childAllowanceAt(age, rank) {
    if (age < 0 || age >= R.childAllowanceUntil) return 0;
    if (rank && rank >= R.childAllowanceThirdRank) return C.childAllowanceThird;
    return age < R.childAllowanceU3Until ? C.childAllowanceU3 : C.childAllowance;
  }

  // 年齢によって収入がどう変わるかの指数。
  // 公的統計（賃金構造基本統計調査の年齢階級別の賃金）から作る。**データが無ければ null を返し、横ばいで計算する**（推測しない）。
  // 60歳以降は、定年・再雇用の設定で計算するため、この指数は capAge で頭打ちにする（二重に下げないため）。
  // capAge が読めないときは、統計を使わない（以前はコードに年齢を直書きした予備の値を持っていた）
  function wageCapAge() {
    const W = window.KSDATA && window.KSDATA.wage;
    const v = W && Number(W.capAge);
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  function wageSeries(workKind) {
    const W = window.KSDATA && window.KSDATA.wage;
    if (!W || !W.series || !W.map || wageCapAge() === null) return null;
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

  // 額面から手取りへのおおよその割合。収入が低いほど手取りの割合は高い
  // （個別の税額は計算できないため概算。根拠は data/assumptions.json の takeHomeRate）
  // 割合はデータの点（[年収, 割合]）のあいだを直線でつなぐ。以前は年収帯で段階的に変えていたため、
  // 帯の境目で「額面が増えると手取りが減る」逆転が起きていた（2026-10-30）
  function takeHome(income) {
    const y = Number(income) || 0;
    const P = C.takeHomeRate;
    if (y <= P[0][0]) return P[0][1];
    for (let i = 1; i < P.length; i++) {
      if (y <= P[i][0]) {
        const [x0, r0] = P[i - 1], [x1, r1] = P[i];
        return r0 + ((r1 - r0) * (y - x0)) / (x1 - x0);
      }
    }
    return P[P.length - 1][1];
  }

  // 学校ごとの1年の費用（万円）。0〜2歳の保育料は、自治体と世帯の所得で決まるため入れない（結果に明示する）
  function schoolCost(p, kidAge) {
    const E = C.edu, S = STAGE;
    // 境目は「〜歳から〜歳まで」の両端を含む形で比べる（年齢が小数になる入力でも、以前と同じ扱いにする）
    if (kidAge >= S.kinderFrom && kidAge <= S.elemFrom - 1) return E.kinder[p.kinder || "public"] || 0;
    if (kidAge >= S.elemFrom && kidAge <= S.juniorFrom - 1) return E.elem[p.elem] || 0;
    if (kidAge >= S.juniorFrom && kidAge <= S.highFrom - 1) return E.junior[p.junior] || 0;
    if (kidAge >= S.highFrom && kidAge <= S.univFrom - 1) return E.high[p.high] || 0;
    if (p.univ === "none") return 0;
    const last = p.univ === "vocational" ? S.vocationalLast : S.univLast;
    if (kidAge >= S.univFrom && kidAge <= last) return E.univ[p.univ] + (kidAge === S.univFrom ? E.entrance[p.univ] : 0) + (p.away === "away" ? E.away : 0);
    return 0;
  }
  /** 子が独立する年齢（学校を出た次の年齢） */
  function independAgeOf(p) {
    return p.univ === "none" ? STAGE.univFrom : p.univ === "vocational" ? STAGE.vocationalLast + 1 : STAGE.univLast + 1;
  }

  /** 年ごとの出来事（一時的な支出・収入）を並べる。文は持たず、種類（ev）と数値（args）だけを持つ */
  function schedule(plan) {
    const D = plan.detail, age = plan.age, span = plan.span;
    const oneTime = {};  // offset -> {housing, homeLoan, repair, car, other, spend, income}（spend は other の内数）
    const lifeEvents = [];  // 年表「くらし」の行
    const at = (off) => (oneTime[off] = oneTime[off] || { housing: 0, homeLoan: 0, repair: 0, car: 0, other: 0, spend: 0, income: 0 });
    const inSpan = (off) => off >= 0 && off <= span;
    // 予定したのに計算に入れなかったもの（いまの年齢より前・見通しの終わりより後・返済が終わったあと）。
    // 黙って外さず「この計算に入れていないこと」に出す（2026-10-31 C6-軽1・軽2・B6-6）
    const skipped = [];
    const skip = (ev, off, why, more) => skipped.push(Object.assign({ ev, age: age + off, why: why || (off < 0 ? "past" : "late") }, more || {}));
    const owns = plan.owns, homeType = plan.homeType;
    // 買い替えは、乗るのをやめる年齢の何年前までにするか（それより後は買い替えない。rules.carLastBuyGap）
    const CAR_LAST_GAP = R.carLastBuyGap;

    // 車
    D.cars.forEach((c, ci) => {
      let off = Number(c.nextIn);
      const untilOff = Number(c.until) - age;
      while (inSpan(off) && off <= untilOff - CAR_LAST_GAP) {
        at(off).car += Number(c.budget);
        lifeEvents.push({ offset: off, ev: "car", args: { n: D.cars.length > 1 ? ci + 1 : null, budget: c.budget }, kind: "car", amount: Number(c.budget) });
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
        const r = Number(P.rate) / PCT, n = Number(P.years);
        purchaseLoan = r > 0 ? (principal * r) / (1 - Math.pow(1 + r, -n)) : principal / n;
        purchaseLoanYears = n;
        lifeEvents.push({ offset: purchaseOff, ev: "purchase", args: { type: P.type, down: P.down, cost: P.cost || 0, loan: purchaseLoan > 0 }, kind: "home", amount: Number(P.down) + Number(P.cost || 0) });
      } else { skip("purchase", purchaseOff); purchaseOff = null; }
    }
    // 修繕（戸建て）。今の家、または購入する家
    const houseRepairs = (builtNow, fromOff) => {
      const H = D.house;
      [["paint", H.paintEvery, H.paintCost], ["water", H.waterEvery, H.waterCost]].forEach(([part, every, cost]) => {
        every = Number(every); cost = Number(cost);
        for (let k = 1; k * every <= builtNow + span + 1; k++) {
          const off = fromOff + (k * every - builtNow);
          if (off < Math.max(0, fromOff) || !inSpan(off)) continue;
          if (rebuildOff !== null && off >= rebuildOff) break;
          at(off).repair += cost;
          lifeEvents.push({ offset: off, ev: "repair", args: { part, cost }, kind: "repair", amount: cost });
        }
      });
    };
    // 建て替え・大規模リフォーム
    let rebuildOff = null;
    if (owns && D.rebuild.on === "yes") {
      rebuildOff = Number(D.rebuild.age) - age;
      if (inSpan(rebuildOff)) {
        at(rebuildOff).repair += Number(D.rebuild.budget);
        lifeEvents.push({ offset: rebuildOff, ev: "rebuild", args: { budget: D.rebuild.budget }, kind: "home", amount: Number(D.rebuild.budget) });
      } else { skip("rebuild", rebuildOff); rebuildOff = null; }
    }
    if (owns && homeType === "house") {
      houseRepairs(Number(D.house.built), 0);
      if (rebuildOff !== null) { const save = rebuildOff; rebuildOff = null; houseRepairs(0, save); rebuildOff = save; }
    }
    if (purchaseOff !== null && P.type === "house") houseRepairs(0, purchaseOff);

    // 住宅ローン：繰り上げ返済（早まることはあっても、延びることはない）。
    // 繰り上げた額のぶんだけ、残りの返済（その年から完済までの年ごとの返済の合計）が減る。端数の年は、その年の返済を一部だけ払う。
    // 残りの合計より多くは払わない。利息が減る分は見ない（「この計算に入れていないこと」に出している）。
    // 以前は短くなる年数を切り捨て、端数の分は払っただけで消えていた。残りの合計を超えて払うこともできた（2026-10-31）
    let loanEndAge = plan.loanEndAge, loanEndExact = plan.loanEndAge;
    // 完済の年齢を切り上げるときの許容：残りの返済が1円未満なら返し終わったとみなす（年に直すと、1円÷年の返済額）。
    // 浮動小数の誤差（26.999…でなく27.000…1）で、全部を返したのに完済が1年遅れていた（2026-10-31 A6-1）
    const endTol = plan.loanYearly > 0 ? 1 / P_.YEN_PER_MAN / plan.loanYearly : 0;
    let prepayOff = null, prepayShorten = 0, prepayAmount = 0;
    // 返し終えているローン（model/plan.js の loanPaidOff）には、繰り上げ返済は無い。保存されている「あり」は外した予定にも積まない
    // （くわしく入力は欄を出さない。⑦に「入れていません」と出していた。2026-10-31 第9巡 B9-2）
    if (plan.home === "loan" && D.loan.prepayOn === "yes" && !plan.loanPaidOff) {
      prepayOff = Number(D.loan.prepayAge) - age;
      const remainYears = Math.max(0, plan.loanEndAge - (age + prepayOff));
      const amount = Math.min(Math.max(0, Number(D.loan.prepayAmount) || 0), plan.loanYearly * remainYears);
      // 繰り上げ返済が完済後の年齢に設定されていたら、何も起きない
      if (inSpan(prepayOff) && remainYears > 0 && amount > 0) {
        prepayAmount = amount;   // 費用に入れるのは、住み替えで外れないと決まってから（下）
        prepayShorten = amount / plan.loanYearly;
        loanEndExact = plan.loanEndAge - prepayShorten;
        loanEndAge = Math.ceil(loanEndExact - endTol);   // 返済が無くなる最初の年齢（表示・年表に使う）
        lifeEvents.push({ offset: prepayOff, ev: "prepay", args: { amount, shorten: Math.round(prepayShorten * P_.TENTHS) / P_.TENTHS }, kind: "home", amount });
      } else {
        // 金額0は予定が無いのと同じなので何も言わない
        if (Number(D.loan.prepayAmount) > 0) skip("prepay", prepayOff, prepayOff < 0 ? "past" : plan.loanYearly * remainYears <= 0 ? "paid" : "late");
        prepayOff = null;
      }
    }

    // 住み替え（その年に費用、以降の住居費を置き換える）
    // 住み替え→購入の順（同じ年を含む）なら、購入した家に移る前の仮住まいとみなす。住み替えの家賃は購入の年の前まで、
    // 購入の年からは購入した家の費用（返済・税・管理費・修繕）を入れる。以前は購入した家の費用が丸ごと消え、
    // 頭金・諸費用だけが計上されていた（2026-10-31 A4-1・B4-1）。
    // 購入→住み替え（または持ち家から住み替え）なら、住み替えの年から前の家の費用を外す。外したものは moveDropped に残し、
    // 「この計算に入れていないこと」に出す（計算が実際に外したかどうかで出す）
    let moveOff = null, rebuildDropped = false, moveThenBuy = false, moveDropped = null;
    if (D.move.on === "yes") {
      moveOff = Number(D.move.age) - age;
      if (inSpan(moveOff)) {
        moveThenBuy = purchaseOff !== null && moveOff <= purchaseOff;
        at(moveOff).housing += Number(D.move.cost);
        lifeEvents.push({ offset: moveOff, ev: "move", args: { cost: D.move.cost, monthly: D.move.monthly, moveAge: age + moveOff, untilAge: moveThenBuy ? age + purchaseOff : null }, kind: "home", amount: Number(D.move.cost) });
        if (!moveThenBuy) {
          // 住み替えたあとは、前の家の修繕・建て替えは発生しない（費用も年表も、住み替えの年から外す）。
          // 以前は建て替えの費用だけ0にして、年表には「建て替え」を残していた（2026-10-31 A3-3）
          let repairs = 0;
          Object.keys(oneTime).forEach((k) => { if (Number(k) >= moveOff) oneTime[k].repair = 0; });
          for (let i = lifeEvents.length - 1; i >= 0; i--) {
            const e = lifeEvents[i];
            if ((e.kind === "repair" || e.ev === "rebuild") && e.offset >= moveOff) {
              if (e.kind === "repair") repairs++;
              lifeEvents.splice(i, 1);
            }
          }
          if (rebuildOff !== null && rebuildOff >= moveOff) { rebuildDropped = true; rebuildOff = null; }
          // 外した前の家の費用（持ち家、または住み替えより前に購入した家）。賃貸から賃貸への住み替えは何も外さない
          const leaving = owns ? "current" : purchaseOff !== null ? "purchased" : null;
          // 住み替えの年以後の、いまの家の住宅ローンの繰り上げ返済も外す（返済そのものを住み替えの年から外しているため）。
          // 費用・年表の「繰り上げ返済」から外し、完済の年齢も繰り上げ返済の前に戻す。
          // 以前は返済を外したあとも繰り上げ返済の額だけが支出に残り、年表にも「繰り上げ返済」「完済」が出ていた（2026-10-31 A5-1・B5-2）
          let prepayDropped = null;
          if (prepayOff !== null && prepayOff >= moveOff) {
            for (let i = lifeEvents.length - 1; i >= 0; i--) if (lifeEvents[i].ev === "prepay") lifeEvents.splice(i, 1);
            prepayDropped = { age: age + prepayOff, amount: prepayAmount };
            prepayOff = null; prepayShorten = 0; prepayAmount = 0;
            loanEndExact = plan.loanEndAge; loanEndAge = plan.loanEndAge;
          }
          if (leaving) {
            // 購入した家の返済は、借入れがあるときだけ（頭金だけで買ったときは、外す返済が無い。2026-10-31 B5-3）
            const loanLeft = leaving === "current" ? plan.home === "loan" && loanEndExact - endTol > age + moveOff : purchaseLoan > 0 && purchaseOff + purchaseLoanYears > moveOff;
            moveDropped = { home: leaving, age: age + moveOff, repairs, rebuild: rebuildDropped ? Number(D.rebuild.age) : null, loan: Boolean(loanLeft),
              prepay: prepayDropped, mansion: (leaving === "current" ? homeType : P.type) === "mansion" };
          }
        }
      } else { skip("move", moveOff); moveOff = null; }
    }

    // 繰り上げ返済の費用（住み替えで外れなかったときだけ）
    if (prepayOff !== null) {
      at(prepayOff).housing += prepayAmount;
      at(prepayOff).homeLoan += prepayAmount;   // 繰り上げ返済も「住宅ローンの返済」
    }

    // 介護。計算に入れた期間（care）を残し、説明（いまの支出・やること・聞くこと）はそれだけを言う。
    // 始まりがいまの年齢より前なら、その前の年は外し、外したことを skipped に残す（すでに終わっていれば全部を外す）。
    // 以前は説明が答え（介護あり）だけを見て、終わった介護まで⑤・やること・聞くことに出していた（2026-10-31 B7-3・C7-2）
    let care = null;
    if (D.care.on === "yes") {
      const start = Number(D.care.startAge), years = Number(D.care.years), monthly = Number(D.care.monthly);
      const off0 = start - age;
      const ins = [];
      for (let y = 0; y < years; y++) if (inSpan(off0 + y)) { at(off0 + y).other += monthly * MONTHS; ins.push(off0 + y); }
      if (inSpan(off0)) lifeEvents.push({ offset: off0, ev: "care", args: { monthly: D.care.monthly, years: D.care.years }, kind: "care", amount: monthly * MONTHS });
      if (ins.length) care = { fromAge: age + ins[0], toAge: age + ins[ins.length - 1], startAge: start, ongoing: off0 < 0, monthly };
      if (monthly > 0 && years > 0) {
        if (off0 < 0) skip("care", off0, "past", { toAge: Math.min(start + years, age) - 1 });
        else if (off0 > span) skip("care", off0, "late", { toAge: start + years - 1 });
      }
    }
    // 大きな出費。いまの年齢より前・見通しの終わりより後は外し、外したことを skipped に残す（以前は黙って外していた。2026-10-31 C7-3）
    D.spend.items.forEach((it) => {
      const off = Number(it.age) - age;
      if (!inSpan(off)) { if (Number(it.amount) > 0) skip("spend", off, null, { label: it.label, amount: Number(it.amount) }); return; }
      at(off).other += Number(it.amount);
      at(off).spend += Number(it.amount);   // 物価の上昇（「旅行・大きな出費」）を掛ける分
      lifeEvents.push({ offset: off, ev: "spend", args: { label: it.label, amount: it.amount }, kind: "spend", amount: Number(it.amount) });
    });
    // 毎年の旅行・レジャー。「何歳まで」がいまの年齢以下なら、1年も入らない（expenseTravelAt は cur < travelUntil の年だけ）。
    // 黙って外さず、外したことを skipped に残す（以前は説明・いまの毎月の支出にだけ入っていた。2026-10-31 A8-2）
    if (Number(D.spend.travel) > 0 && Number(D.spend.travelUntil) <= age) skip("travel", Number(D.spend.travelUntil) - age, "past", { amount: Number(D.spend.travel) });
    // 退職金・転職
    const W = D.work;
    if (Number(W.allowance) > 0 && inSpan(plan.retireAge - age)) at(plan.retireAge - age).income += Number(W.allowance);
    if (plan.changeOff !== null && inSpan(plan.changeOff)) lifeEvents.push({ offset: plan.changeOff, ev: "change", args: { option: W.changeIncome }, kind: "work", amount: 0 });
    // 仕事をやめる年齢以後の転職・独立は入れない（model/plan.js の changeLate）。外したことを残す（第12巡 B12-中2）
    if (plan.changeLate) skip("change", Number(W.changeAge) - age, "afterRetire", { retireAge: plan.retireAge });
    // 住宅ローン以外の借入れの完済
    D.loans.forEach((l) => {
      const off = Number(l.endAge) - age;
      if (off > 0 && off <= span) lifeEvents.push({ offset: off, ev: "loanEnd", args: { loanKind: l.kind }, kind: "loan", amount: 0 });
    });

    return { oneTime, lifeEvents, purchaseOff, purchaseLoan, purchaseLoanYears, rebuildOff, rebuildDropped, prepayOff, prepayShorten, moveOff, moveThenBuy, moveDropped, loanEndAge, loanEndExact, skipped, care };
  }

  /** Plan から、年ごとの部品と simulate() を組み立てる */
  function build(plan) {
    const D = plan.detail, age = plan.age, span = plan.span;
    const W = D.work, SW = D.spouseWork;
    const sched = schedule(plan);
    const { oneTime, purchaseOff: purchaseOffPlan, purchaseLoan, purchaseLoanYears, moveOff: moveOffPlan, moveThenBuy, loanEndAge, loanEndExact } = sched;
    const P = D.purchase;
    const home = plan.home, owns = plan.owns, homeType = plan.homeType, renting = plan.renting;
    const retireAge = plan.retireAge, rehireUntil = plan.rehireUntil;
    const spouse = plan.spouse, spouseAge = plan.spouseAge;

    // 物価の上昇をどの費目に掛けるか。**返済は掛けない**（契約した額のまま変わらないため）
    const infOn = new Set(plan.infOn);
    const infAt = (key, y) => (infOn.has(key) ? Math.pow(1 + plan.inf, y) : 1);

    // 収入の変わり方。"stat"＝公的統計の年齢別の賃金から。読めなければ横ばいに落とす
    const GROWTH = { flat: 0, up: C.incomeGrowthStep, down: -C.incomeGrowthStep };
    function incomeFactor(mode, workKind, refAge, atAge, years) {
      if (mode === "stat") {
        const f = wageFactor(workKind, refAge, atAge);
        if (f !== null) return f;
        return 1;
      }
      return Math.pow(1 + GROWTH[mode || "flat"], years);
    }

    const eduPlanOf = (i) => D.kids[i] || plan.eduPlanDefault;
    const eduCost = (i, kidAge) => {
      const p = eduPlanOf(i);
      if (kidAge < 0) return 0;
      const until = Number(p.lessonsUntil || plan.lessonsUntilDefault);
      const lessons = kidAge >= STAGE.kinderFrom && kidAge < until ? Number(p.lessons || 0) * MONTHS : 0;
      return lessons + schoolCost(p, kidAge);
    };
    const independAge = (i) => independAgeOf(eduPlanOf(i));

    // 住まいにかかる1年ぶんの内訳。base ＝ 合計、homeLoan ＝ うち住宅ローンの返済、fee ＝ うちマンションの管理費・修繕積立金、
    // tax ＝ うち固定資産税、rent ＝ うち家賃（住み替え後の住居費を含む）。
    // opts.noInflation のときは物価の上昇を掛けない（万一の保障額は、いまの金額で見るため）。
    // opts.current のときは、住宅の購入・住み替えの予定を入れず、いまの住まいが続く前提で出す（万一の保障額。
    // 亡くなったあとに予定どおり買う・住み替えるとは限らない。以前は購入の年から住居費がほぼ消えていた。2026-10-31）
    function housingCost(y, opts) {
      const cur = age + y;
      const inf = (key) => (opts && opts.noInflation ? 1 : infAt(key, y));
      const purchaseOff = opts && opts.current ? null : purchaseOffPlan;
      const moveOff = opts && opts.current ? null : moveOffPlan;
      let c = 0, fee = 0, homeLoan = 0, tax = 0, rent = 0;
      // 家賃と固定資産税には物価上昇を掛ける。返済には掛けない（契約した額のまま）
      // 住み替え→購入の順なら、住み替えの家賃は購入の年の前まで（購入の年からは下の、購入した家の費用）
      if (moveOff !== null && y >= moveOff && !(moveThenBuy && purchaseOff !== null && y >= purchaseOff)) {
        rent = Number(D.move.monthly) * MONTHS * inf("rent");
        return { base: rent, fee: 0, homeLoan: 0, tax: 0, rent };
      }
      // 繰り上げ返済で完済が端数の年になったら、その年は残りの分だけ払う
      if (home === "loan" && cur < loanEndAge) { const v = plan.loanYearly * Math.min(1, loanEndExact - cur); c += v; homeLoan += v; }
      if (renting && (purchaseOff === null || y < purchaseOff)) {
        // 更新料は2年ごと（rules.rentRenewalEvery）
        rent = Number(D.rent.monthly) * (MONTHS + Number(D.rent.renewal) / R.rentRenewalEvery) * inf("rent");
        c += rent;
      }
      if (purchaseOff !== null && y >= purchaseOff && y < purchaseOff + purchaseLoanYears) { c += purchaseLoan; homeLoan += purchaseLoan; }
      const ownFrom = owns ? 0 : purchaseOff;
      const ownType = owns ? homeType : P.type;
      if (ownFrom !== null && y >= ownFrom) {
        tax = Number(ownType === "mansion" ? D.mansion.tax : D.house.tax) * inf("tax");
        c += tax;
      }
      const mansionFrom = owns && homeType === "mansion" ? 0 : purchaseOff !== null && P.type === "mansion" ? purchaseOff : null;
      if (mansionFrom !== null && y >= mansionFrom) {
        fee = Number(D.mansion.monthly) * MONTHS * Math.pow(1 + Number(D.mansion.raise) / PCT, Math.floor((y - mansionFrom) / R.mansionRaiseEvery));
        c += fee;
      }
      return { base: c, fee, homeLoan, tax, rent };
    }

    // 配偶者の今後の働き方による、その年の年収の倍率
    const spouseFactor = (y) => {
      const from = Number(SW.planFrom);
      if (SW.plan === "leave") return P_.spouseLeaveByPlan(SW, y) ? Number(SW.planRate) / PCT : 1;
      if (SW.plan === "quit") return y >= from ? 0 : 1;
      return 1;
    };

    // 育休・産休の年は、収入にこの割合を掛ける
    const leaveFactor = (w, yy) => (w === "leave" && yy < C.leaveYears ? C.leaveRate : 1);

    // ───── 年ごとの収入と支出を、部品に分ける ─────
    // ①どれか1つだけを取り出して検算できる ②足し忘れ・二重計上に気づきやすい
    // という2つの理由による（過去の不具合 R1・R5・R6・R14 はすべてこの型だった）。

    /** その年の一時的な出来事（買い替え・修繕・繰り上げ返済など） */
    function eventsAt(y) {
      return oneTime[y] || { housing: 0, homeLoan: 0, repair: 0, car: 0, other: 0, spend: 0, income: 0 };
    }

    /** 本人の勤め先の給与（額面）。定年前は年収、再雇用中は再雇用の年収、それ以外は0。副業・育休の減額は含めない。
     * 働けなくなったときの傷病手当金は、この額から出す（2026-10-31 A3-2。以前はいつでも定年前の年収で出していた） */
    function wageGrossAt(y) {
      const cur = age + y;
      const afterChange = plan.changeOff !== null && y >= plan.changeOff;
      const rawIncome = afterChange ? plan.changedIncome : plan.income;
      const refAge = afterChange ? Number(W.changeAge) : age;
      // 転職後は、転職した年を起点に数える（今からの年数だと初年度に数年分の昇給が乗る）
      const growthYears = afterChange ? y - plan.changeOff : y;
      // 昇給の年数は定年まで（起点が転職した年なら、定年−転職した年齢まで）。再雇用の年収は定年の年の額で止める。
      // 以前は転職後も「定年−いまの年齢」まで数え、昇給が上がる／下がるだと再雇用の年収が毎年変わり続けた（2026-10-31 第11巡 A11-1）
      const workYears = Math.min(growthYears, Math.max(0, retireAge - refAge));
      const base = rawIncome * incomeFactor(W.growth, plan.work, refAge, Math.min(cur, retireAge), workYears);
      if (cur < retireAge) return { gross: base, rehire: false };
      if (Number(W.rehire) > 0 && cur < rehireUntil) return { gross: base * Number(W.rehire) / PCT, rehire: true };
      return { gross: 0, rehire: false };
    }

    /** 本人の仕事の収入（手取り） */
    function incomeWorkAt(y) {
      const cur = age + y;
      const g = wageGrossAt(y);
      let v = 0;
      // 育休の年は、給与の種類（定年前・再雇用）によらず同じ減額を掛ける。以前は再雇用の年に掛けておらず、
      // 定年を遅らせると残高が減る逆転が起きていた（2026-10-31 A5-2）
      if (g.gross > 0) v = g.gross * leaveFactor(plan.work, y) * takeHome(g.gross);
      if (Number(W.side) > 0 && cur < Number(W.sideUntil)) v += Number(W.side);
      return v;
    }

    /** 配偶者の仕事の収入（手取り） */
    function incomeSpouseAt(y) {
      if (!spouse) return 0;
      const sAge = spouseAge + y;
      if (sAge >= Number(SW.retireAge)) return 0;
      const backToWork = SW.plan === "return" && y >= Number(SW.planFrom);
      const sRefAge = backToWork ? spouseAge + Number(SW.planFrom) : spouseAge;
      const sYears = backToWork ? y - Number(SW.planFrom) : y;
      const sBase = (backToWork ? plan.returnIncome : plan.spouseIncome)
        * incomeFactor(SW.growth, plan.spouseWork, sRefAge, Math.min(sAge, Number(SW.retireAge)), sYears);
      // いま育休中の配偶者でも、くわしく入力の「今後の働き方」で決めた年（育休・時短は期間内、やめる・働き始めるは planFrom 以後）は、
      // 仮置きの減額を掛けない。以前は育休・時短の年に両方を掛けて約25%になり（2026-10-31 A7-2・B7-4）、
      // 復職した年の年収にも仮置きの50%を掛けていた（B8-1・A8-1）。仮の値の年数も同じ判定（model/plan.js の spousePlanDecides）
      return sBase * spouseFactor(y) * (P_.spousePlanDecides(SW, y) ? 1 : leaveFactor(plan.spouseWork, y)) * takeHome(sBase);
    }

    /** 配偶者の老齢年金（万一の保障額では、配偶者の分だけを使う） */
    function incomePensionSpouseAt(y) {
      return spouse && spouseAge + y >= C.pensionAge ? plan.pensionSpouse : 0;
    }
    /** 年金（本人＋配偶者） */
    function incomePensionAt(y) {
      return (age + y >= C.pensionAge ? plan.pensionSelf : 0) + incomePensionSpouseAt(y);
    }

    /** 児童手当（子の年齢で額が変わる）。第3子以降の数え方は、22歳になる年度の末日までの子を上から数える
     * （rules.childAllowanceCountUntil）。親が生活費を負担している子が対象なので、学校を出て独立した子は数えない。
     * 以前は第3子以降の額を使っておらず、何人目でも同じ額だった（2026-10-31） */
    function incomeAllowanceAt(y) {
      const counted = plan.kids.map((k, i) => ({ i, at: k + y }))
        .filter((x) => x.at >= 0 && x.at < Math.min(R.childAllowanceCountUntil, independAge(x.i)))
        .sort((p, q) => q.at - p.at || p.i - q.i);
      const rankOf = new Map(counted.map((x, n) => [x.i, n + 1]));
      return plan.kids.reduce((t, k, i) => t + childAllowanceAt(k + y, rankOf.get(i) || 0), 0);
    }

    /** 生活費（物価上昇を掛ける。年金の年齢からは老後の割合を掛ける） */
    function expenseLivingAt(y) {
      const cur = age + y;
      // すでに年金の年齢に達している人は「いまの生活費」を答えているので、老後の圧縮率は掛けない
      const retireRatio = age >= C.pensionAge ? 1 : Number(D.retire.ratio) / PCT;
      return plan.living * MONTHS * infAt("living", y) * (cur >= C.pensionAge ? retireRatio : 1);
    }

    /** 教育費（子ごとに、その年の学年で出す） */
    function expenseEduAt(y) {
      return plan.kids.reduce((t, k, i) => t + eduCost(i, k + y), 0) * infAt("edu", y);
    }

    /** 車の維持費（買い替えは一時的な出来事のほうに入っている） */
    function expenseCarUpkeepAt(y) {
      const cur = age + y;
      return D.cars.reduce((t, c) => t + (cur < Number(c.until) ? Number(c.upkeep) : 0), 0) * infAt("car", y);
    }

    /** 住宅ローン以外の借入れの返済 */
    function expenseOtherLoanAt(y) {
      const cur = age + y;
      return D.loans.reduce((t, l) => t + (cur < Number(l.endAge) ? Number(l.monthly) * MONTHS : 0), 0);
    }

    /** 旅行など、予定している出費 */
    function expenseTravelAt(y) {
      const cur = age + y;
      return (Number(D.spend.travel) > 0 && cur < Number(D.spend.travelUntil) ? Number(D.spend.travel) : 0) * infAt("other", y);
    }

    /** その年の収入と支出を、ぜんぶ組み立てる */
    function yearOf(y) {
      const ev = eventsAt(y);
      const hc = housingCost(y);
      const inc = {
        work: incomeWorkAt(y),
        spouse: incomeSpouseAt(y),
        pension: incomePensionAt(y),
        allowance: incomeAllowanceAt(y),
        lump: ev.income,
      };
      const exp = {
        living: expenseLivingAt(y),
        housing: hc.base + ev.housing + ev.repair,
        homeLoan: hc.homeLoan + ev.homeLoan,   // 住居費の内数。合計には足さない
        repair: ev.repair,
        edu: expenseEduAt(y),
        car: expenseCarUpkeepAt(y) + ev.car,
        loan: expenseOtherLoanAt(y),
        // 「旅行・大きな出費」の物価は、旅行と大きな出費に掛ける。介護の費用は入力した金額のまま（入れていないことに出す）
        other: expenseTravelAt(y) + (ev.other - ev.spend) + ev.spend * infAt("other", y),
      };
      // 合計に入れるのはこの5つ。homeLoan と repair は housing に含まれているので足さない
      const total = exp.living + exp.housing + exp.edu + exp.car + exp.loan + exp.other;
      return { inc, exp, income: inc.work + inc.spouse + inc.pension + inc.allowance + inc.lump, expense: total };
    }

    function simulate(r) {
      // 貯蓄の内訳を入れた場合は「預貯金（運用しない）」と「投資（利回りで増える）」に分ける
      const split = plan.assetsSplit;
      let cash = split ? Number(D.assets.cash) : 0;
      let inv = split ? Number(D.assets.invest) : plan.savings;
      const contrib = split ? Number(D.assets.monthly) * MONTHS : 0;
      const points = [];
      let shortageAge = null;
      for (let y = 0; y <= span; y++) {
        const cur = age + y;
        const { inc, exp, income: incTotal, expense: expTotal } = yearOf(y);

        if (split) {
          const c = cur <= C.pensionAge ? contrib : 0;
          cash += incTotal - expTotal - c;
          inv = (inv + c) * (inv > 0 ? 1 + r : 1);
          // 預貯金が足りなくなったら、投資から取り崩す。以前は預貯金だけがマイナスになり、投資は増え続けていた（2026-10-31）
          if (cash < 0 && inv > 0) { const take = Math.min(-cash, inv); cash += take; inv -= take; }
        } else {
          inv = inv * (inv > 0 ? 1 + r : 1) + incTotal - expTotal;
        }
        const balance = cash + inv;
        points.push({
          age: cur, year: plan.year0 + y,
          // 画面に出すのは四捨五入した残高。判定（底をつくか・老後の不足額・天気）は丸める前の残高（raw）で行う。
          // 以前は老後の不足額だけ丸めた残高で見ており、「90歳で底をつく」と「不足0円・くもり」が並んだ（2026-10-31 A2-3）
          balance: Math.round(balance), raw: balance, income: Math.round(incTotal), expense: Math.round(expTotal),
          inc: inc, exp: exp,
        });
        if (shortageAge === null && balance < 0) shortageAge = cur;
      }
      return { points, shortageAge };
    }

    return {
      sched, loanEndAge, eduPlanOf, eduCost, independAge, housingCost, infAt,
      eventsAt, wageGrossAt, incomeWorkAt, incomeSpouseAt, incomePensionAt, incomePensionSpouseAt, incomeAllowanceAt,
      expenseLivingAt, expenseEduAt, expenseCarUpkeepAt, expenseOtherLoanAt, expenseTravelAt,
      yearOf, simulate,
    };
  }

  window.KSY = { build, schedule, takeHome, wageFactor, wageAt, wageSeries, wageCapAge, childAllowanceAt, schoolCost, independAgeOf, STAGE };
})();
