/* 見通しの計算の入口：KSC.compute(data) → r
 * 設計書 docs/design/02_architecture.md。ここは**つなぐだけ**（対応表）で、中身の計算も文言も持たない。
 *   ① model/plan.js     入力を解釈して、凍結した Plan を作る（値は出どころ付き）
 *   ② model/yearly.js   年ごとの部品と simulate()
 *   ③ model/metrics.js  老後・万一・働けない・いまの支出・天気・やること・聞くこと（キーと数値）
 *   ④ view/explain.js   文言を作る唯一の場所
 * 数字は data/*.json が正本（CLAUDE.md §5）。読み込めないときは例外を投げて試算を止める。
 * 返す r の形は、画面とテストがそのまま使えるよう、組み直し前と同じにしている。
 */
(function () {
  "use strict";
  ["KSP", "KSY", "KSN", "KSX", "KSI"].forEach((ns) => {
    if (!window[ns]) throw new Error(`計算の部品（${ns}）が読み込まれていません。model/*.js・view/*.js を calc.js より前に読み込んでください`);
  });
  const P = window.KSP, Y = window.KSY, N = window.KSN, X = window.KSX, I = window.KSI;

  // 生活費の内訳の費目（名前は説明の層、割合はデータ）
  const LIVING_ITEMS = P.LIVING_SHARES ? P.LIVING_SHARES.map((it) => ({ key: it.key, label: X.LIVING_LABELS[it.key], ratio: it.ratio })) : null;

  function compute(data) {
    const plan = P.resolve(data);                    // ①
    const model = Y.build(plan);                     // ②
    const sim0 = model.simulate(0);
    const simR = plan.ret > 0 ? model.simulate(plan.ret) : null;
    const m = N.summarize(plan, model, sim0, simR);  // ③
    const x = X.describe(plan, model, m, sim0);      // ④
    return {
      provisional: x.provisional, death: m.death, disability: m.disability, retire: m.retire, sim0, simR,
      todos: x.todos, insurance: x.insurance, ask: x.ask, events: x.events, lanes: x.lanes, timeline: x.timeline,
      forecast: x.forecast, current: x.current, loanMismatch: x.loanMismatch, loanView: plan.loanView, region: plan.region,
      incomeCheck: m.incomeCheck, wageApplied: m.wageApplied, wageCapped: m.wageCapped, householdNow: m.householdNow,
      kidInfo: m.kidInfo, moveDropped: m.moveDropped, homePlan: m.homePlan, loanNow: m.loanNow, spouse: plan.spouse, spouseAge: plan.spouseAge, living: plan.living, savings: plan.savings,
      income: plan.income, ret: plan.retPct, inflation: plan.inflation, inflationOn: [...new Set(plan.infOn)],
      age: plan.age, detail: plan.detail, EDU_PLAN: P.EDU_PLAN,
    };
  }

  window.KSC = {
    compute, LIVING_ITEMS,
    detailOf: P.detailOf, detailDefaults: P.detailDefaults, SECTION_KEYS: P.SECTION_KEYS, splitLiving: P.splitLiving, loanFromOrigin: P.loanFromOrigin,
    takeHome: Y.takeHome, DUMMY: P.DUMMY, EDU_PLAN: P.EDU_PLAN, dataReady: P.dataReady,
    MARKS: I.MARKS, markOf: I.markOf, markByKey: I.markByKey,
  };
})();
