/* ④ 説明の層：計算に関する文言を作る、ただひとつの場所
 * 設計書 docs/design/02_architecture.md §7。
 * - 文の中の数字・年齢・割合は、必ず引数（Plan・要約の値・データ）から差し込む。
 *   数字を含む文字列を、ここに書かない（tests/architecture.html が静的に検査する）
 * - 計算はしない（年ごとの計算は model/yearly.js、判定は model/metrics.js）
 */
(function () {
  "use strict";
  if (!window.KS || !window.KSQ) throw new Error("common.js・questions.js が読み込まれていません（view/explain.js より前に読み込んでください）");
  const KS = window.KS, Q = window.KSQ;
  const man = (v) => KS.man(v);
  // 0 のときは「0万円」ではなく「0円」と書く
  const manZ = (v) => (Math.round(v) === 0 ? `${Math.round(v)}円` : man(v));
  // 0.1万円（1,000円）単位。毎月の返済額・障害年金の月額など、万円単位で丸めると表と食い違うもの
  const TENTHS = 10;
  const man1 = (v) => (Math.round(v * TENTHS) / TENTHS).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + "万円";
  /** 「約◯万円」。1万円未満は0.1万円単位、それにも満たなければ「0.1万円未満」（「約0万円」と書かない） */
  function approx(v) {
    if (Math.abs(v) >= 1) return `約${man(v)}`;
    return Math.round(v * TENTHS) !== 0 ? `約${man1(v)}` : `${man1(1 / TENTHS)}未満`;
  }
  const NO_SHORT = "不足は見込まれません";
  const ONE_MONTH = 1;
  /** 貯蓄が毎月の支出の何か月分か（切り捨て）。cap 以上は「◯か月分以上」。0より多く1か月分に満たなければ「1か月分未満」
   * （「0か月分」と書かない。第12巡 B12-軽2）。bare なら「約」を付けない（天気の短い文） */
  function savingsMonths(months, cap, bare) {
    if (months > 0 && months < ONE_MONTH) return `${ONE_MONTH}か月分未満`;
    const t = Number.isFinite(cap) && months >= cap ? `${cap}か月分以上` : `${Math.floor(months)}か月分`;
    return bare ? t : "約" + t;
  }
  /** 働けなくなったときの対象外の理由。天気・保険の優先度・PDF で同じ言い方にする（2026-10-31 B4-3） */
  const NOT_WORKING = "いま仕事の収入が無いため";
  /** 万一の不足の幅。下限が0のときは「最大で約◯」と言う（「約0万円〜」と書かない）。上限も0なら「不足は見込まれません」（2026-10-31 B2-軽3） */
  // 下限と上限が同じ（表示が同じ）なら1つの値で言う（「約200万円〜200万円」と書かない。第12巡 B12-軽4）
  const deathRange = (low, high) => (high <= 0 ? NO_SHORT : low > 0 ? `約${manRange(low, high)}` : `最大で約${man(high)}`);
  /** 金額の幅。表示が同じなら1つの値（第12巡 B12-軽4） */
  function manRange(low, high) { return man(low) === man(high) ? man(low) : `${man(low)}〜${man(high)}`; }
  /** 割合（%）の幅。同じなら1つの値（「80%〜80%」と書かない。第12巡 B12-軽4） */
  function pctRange(low, high) { return String(low) === String(high) ? `${low}%` : `${low}%〜${high}%`; }
  /** 老後の不足額と、埋めるための毎月の積立。不足0なら「0万円」「毎月約0万円の積立」と書かない（2026-10-31 B2-軽4・C2-N3） */
  const retireGapText = (gap, monthly) => (gap > 0 ? `${man(gap)}（毎月 ${approx(monthly)}の積立で埋まる計算）` : NO_SHORT);
  /** マイナスの残高。丸めると0になる小さなマイナスは「1万円未満のマイナス」と言う（判定は丸める前の残高。2026-10-31 A2-3） */
  const minusText = (v) => (Math.round(v) <= -1 ? `約${man(v)}` : `${man(1)}未満のマイナス`);
  /** 毎月の支出の範囲。住居費に住宅ローンの返済が入っているときは、そう書く（2026-10-31 B2-中3） */
  const spendScope = (withHomeLoan) => (withHomeLoan ? "生活費＋住居費（住宅ローンの返済を含む）" : "生活費＋住居費");
  // 前提データは読み込んだ時点のものを使う（計算の層 model/plan.js と同じ扱い）
  const AS_ = (window.KSDATA && window.KSDATA.assumptions) || null;
  /** 前提の値をデータから読む（説明の層は、計算の層を読まない /about/ でも動くように、データを直接読む） */
  function dataVal(group, key) {
    const A = AS_;
    const v = A && A[group] && A[group][key];
    if (!v || v.value === undefined) throw new Error(`前提『${group}.${key}』が読み込めません。data/assumptions.json と build_data.py を確認してください`);
    return v.value;
  }
  const rule = (key) => dataVal("rules", key);
  const BIRTH_AGE = 0;   // 生まれた年を0歳と数える
  const MONTHS = 12, PCT = 100;

  /** 月数を「半年」「1年」「1年半」「18か月」のような言い方にする */
  function spanText(months) {
    const y = Math.floor(months / MONTHS), r = months % MONTHS;
    if (r === 0) return `${y}年`;
    if (r * 2 === MONTHS) return y ? `${y}年半` : "半年";
    return `${months}か月`;
  }
  /** 月数を「1年6か月」のような言い方にする（制度の期間の書き方） */
  function periodText(months) {
    const y = Math.floor(months / MONTHS), r = months % MONTHS;
    return (y ? `${y}年` : "") + (r ? `${r}か月` : "");
  }

  // ── 名前（ラベル） ──
  const LIVING_LABELS = {
    food: "食費", utility: "水道・光熱費", comm: "通信費（スマホ・ネット）",
    daily: "日用品・家具・家電", clothes: "被服・美容", medical: "医療・健康",
    transport: "交通費（車以外）", insurance: "保険料（生命保険など）",
    leisure: "趣味・娯楽", allowance: "おこづかい・交際費", other: "その他",
  };
  // 物価の上昇を掛ける費目の名前（/assumptions/・結果・PDF で同じものを使う）
  // other（旅行・大きな出費）は、旅行と「大きな出費」の両方に掛ける（model/yearly.js）。介護の費用・修繕などの一時金には掛けない
  const INF_LABELS = { living: "生活費", rent: "家賃", tax: "固定資産税", edu: "教育費", car: "車の維持費", other: "旅行・大きな出費" };
  const UNIV_NAMES = { national: "国公立大学", privArts: "私立大学（文系）", privSci: "私立大学（理系）", vocational: "専門学校" };
  const LOAN_KIND_NAMES = { shougakukin: "奨学金", car: "自動車ローン", edu: "教育ローン", other: "そのほかの借入れ" };
  const jp = (v) => (v === "private" ? "私立" : "公立");

  // ── 仮の値 ──
  function provisionalText(v) {
    const g = v.value;
    switch (v.key) {
      case "income": return "年収";
      case "spouseIncome": return "配偶者の年収";
      // 育休・産休の減額（model/yearly.js の leaveFactor）。割合と年数はデータから（2026-10-31 B6-5）
      case "leave": return `育休・産休中の収入（いまの年から${g.years}年、元の年収の${g.rate}%で仮置き）`;
      // くわしく入力の「今後の働き方」で決めた年（model/plan.js の spousePlanDecides）は除いて、仮置きが残る年だけを言う（2026-10-31 A7-2・B7-4・B8-1）
      case "spouseLeave": return `配偶者の育休・産休中の収入（${g.gap ? `いまの年から${g.total}年のうち、今後の働き方で決めた年を除く${g.years}年` : g.from > 0 ? `${g.from}年後から${g.years}年` : `いまの年から${g.years}年`}、元の年収の${g.rate}%で仮置き）`;
      case "living": return v.source === "region" ? `毎月の生活費（${v.regionLabel}の平均の水準で仮置き）` : "毎月の生活費";
      case "savings": return "貯蓄";
      case "eduPlan": return `進学（${v.plannedOnly ? "これから生まれる子は、" : ""}高校まで${jp(g.high)}・大学は${g.univ === "national" ? "国公立" : "私立"}で仮置き）`;
      case "work": return (v.older
        ? `仕事をやめる年齢${g.retireAge}歳（いまの年齢から${v.older}年働く前提で仮置き）`
        : `定年${g.retireAge}歳`) + `・${g.allowance > 0 ? `退職金 約${man(g.allowance)}` : "退職金なし"}・${g.pension > 0 ? `年金 年${man(g.pension)}` : "年金は概算"}（くわしく入力で設定できます）`;
      case "pension": return `年金は${g > 0 ? `年${man(g)}` : "概算"}（くわしく入力で設定できます）`;
      case "spouseRetire": return `配偶者が仕事をやめる年齢（${g}歳。いまの年齢から${v.older}年働く前提で仮置き）`;
      case "retireRatio": return `老後の生活費（現役の${g}%で仮置き）`;
      case "insurance": return v.band === null
        ? "加入中の保険の保障額（未入力のため含めていません）"
        : `加入中の保険の死亡保障（だいたい${man(v.band)}で計算。医療・就業不能の保障は未入力）`;
      case "otherLoan": return v.unknown
        ? "借入れ（「わからない」のため、借入れなしとして計算）"
        : v.band === null
        ? `住宅ローン以外の借入れ（未入力のため${manZ(g)}で計算）`
        : `住宅ローン以外の借入れ（残高 約${man(v.band)}・毎月の返済額は未入力）`;
      case "car": return `車（${g.interval}年ごと・${man(g.budget)}で買い替え、維持費 年${man(g.upkeep)}で仮置き）`;
      case "homeLoan": return g.mode === "origin"
        ? `住宅ローン（借入${man(g.borrowed)}・${g.years}年・金利${g.rate}%・返し始めて${g.paid}年で仮置き。返済 月約${man1(g.monthly)}・${g.endAge}歳まで・団信あり）`
        : `住宅ローン（返済 月${man1(g.monthly)}・${g.endAge}歳まで・団信ありで仮置き）`;
      case "rent": return v.source === "region" ? `家賃（${v.pref}の民営借家の平均 月${man(g)}で仮置き）` : `家賃（月${man(g)}で仮置き）`;
      case "house": return `修繕費・固定資産税（築${g.built}年・塗装${g.paintEvery}年ごと${man(g.paintCost)}、税 年${man(g.tax)}などで仮置き）`;
      case "mansion": return `修繕積立金・管理費・固定資産税（月${man(g.monthly)}、税 年${man(g.tax)}で仮置き）`;
      case "loanMismatch": return "住宅ローンの入力に食い違いがあります（「計算に使っている毎月の支出」で確認）";
      default: throw new Error("仮の値の種類が不明です: " + v.key);
    }
  }
  /** 返し終えた住宅ローンの注記（⑤・PDFの表。2026-10-31 第10巡 B10-2） */
  const paidOffText = (endAge) => `返し終えています（${endAge}歳で完済）`;
  /** PDFの回答の要約の「住まい」に添える文。返し終えたローンは、答えが「住宅ローンあり」でも返済を入れていないことを言う（第10巡 B10-2） */
  const homeSummaryNote = (r) => (r.loanNow && r.loanNow.paidOff ? "（返し終えたものとして計算）" : "");
  function loanMismatchText(m) {
    if (!m) return null;
    // 完済の年齢がいまの年齢以下なのに残高がある（model/plan.js。2026-10-31 第9巡 B9-4）
    if (m.kind === "paidBalance") return `完済する年齢（${m.endAge}歳）がいまの年齢以下のため、いまの残高（${man(m.balance)}）は計算に入れていません。返し終えている場合は、お住まいを「持ち家（返済なし）」にしてください。まだ返済中なら、完済する年齢を直してください。`;
    // 残高0で完済する年齢がいまより後（返し終えたローンを切り替えて完済の年齢だけ選び直した など）。計算は完済する年齢まで毎月の返済を入れている。
    // この入力のしかたでは完済する年齢にいまの年齢以下を選べないので、返し終えた扱いに戻す道を言う（第12巡 C12-軽1）
    if (m.kind === "zeroBalance") return `いまの残高が${manZ(m.balance)}なのに、完済する年齢（${m.endAge}歳）まで返済が続く入力になっています（計算は${m.endAge}歳まで毎月の返済を入れています）。返し終えている場合は、「入力のしかた」を「借りたときの内容から計算する」に戻すと、返し終えたものとして計算できます。まだ返済中なら、いまの残高も選び直してください。`;
    return m.kind === "high"
      ? `残高（${man(m.balance)}）に対して、完済年齢までの返済額の合計（約${man(m.total)}）が少なすぎます。返済額か完済年齢を確認してください。`
      : `残高（${man(m.balance)}）に対して、完済年齢までの返済額の合計（約${man(m.total)}）が多すぎます。もっと早く完済になるかもしれません。`;
  }

  // ── 年表の出来事 ──
  /** 出来事1つの短い名前（short）と文（text） */
  function eventText(e, kidsCount) {
    const g = e.args;
    switch (e.ev) {
      case "car": return { short: "車", text: `車${g.n ?? ""}の買い替え（約${man(g.budget)}）` };
      case "purchase": return { short: "購入", text: `住宅の購入（${g.type === "house" ? "戸建て" : "マンション"}・頭金${man(g.down)}＋諸費用${man(g.cost)}）` };
      case "repair": return g.part === "paint"
        ? { short: "塗装", text: `外壁・屋根の塗装（約${man(g.cost)}・目安）` }
        : { short: "水回り", text: `水回り・給湯器の交換（約${man(g.cost)}・目安）` };
      case "rebuild": return { short: "建替", text: `建て替え・大規模リフォーム（約${man(g.budget)}）` };
      case "prepay": return { short: "繰上", text: `住宅ローンの繰り上げ返済（約${man(g.amount)}）。完済が約${g.shorten}年早まる計算` };
      // 住み替え→購入の順なら、住み替えの住居費は購入の年の前まで（model/yearly.js の schedule。2026-10-31 A4-1）
      case "move": return { short: "住替", text: g.untilAge === null || g.untilAge === undefined
        ? `住み替え（費用 約${man(g.cost)}、以降の住居費 月${man(g.monthly)}）`
        : g.untilAge > g.moveAge
          ? `住み替え（費用 約${man(g.cost)}、${g.untilAge}歳の住宅の購入までの住居費 月${man(g.monthly)}）`
          : `住み替え（費用 約${man(g.cost)}。同じ年に購入した家へ移る想定）` };
      case "care": return { short: "介護", text: `親の介護が始まる想定（月${man(g.monthly)}×${g.years}年）` };
      case "spend": return { short: "出費", text: `${g.label || "大きな出費"}（約${man(g.amount)}）` };
      case "change": return { short: "転職", text: `転職・独立（年収 ${Q.option(Q.byId.income, g.option)?.label ?? ""}）` };
      case "loanEnd": return { short: "完済", text: `${LOAN_KIND_NAMES[g.loanKind] || "借入れ"}の完済` };
      // 定年の目安を過ぎて働いている人（仮置き）は「仕事をやめる」（2026-10-31 B4-5）
      case "retire": return { short: g.older ? "退職" : "定年", text: `${g.older ? "仕事をやめる" : "定年"}（${g.retireAge}歳）` + (g.rehire ? `・再雇用（〜${g.rehireUntil}歳）` : "") + (g.withPension ? "・年金受給開始" : "") };
      case "pension": return { short: "年金", text: `年金受給開始（${g.age}歳）` };
      case "payoff": return { short: "完済", text: `住宅ローン完済（${g.age}歳）` };
      case "spouseRetire": return { short: "定年", text: `配偶者 仕事をやめる（${g.age}歳）` + (g.withPension ? "・年金受給開始" : "") };
      case "spousePension": return { short: "年金", text: "配偶者 年金受給開始" };
      case "spouseLeave": return { short: "育休", text: `配偶者 育休・時短（${g.years}年間・年収の${g.rate}%）` };
      case "spouseQuit": return { short: "退職", text: "配偶者 仕事をやめる" };
      case "spouseReturn": return { short: "復職", text: "配偶者 働き始める・復職" };
      case "kidStage": {
        const p = g.plan, who = `${g.kidIdx + 1}人目の子 `;
        const T = {
          birth: ["誕生", "誕生（予定）"],
          elem: ["小学校", `小学校入学（${jp(p.elem)}）`],
          junior: ["中学", `中学校入学（${jp(p.junior)}）`],
          high: ["高校", `高校入学（${jp(p.high)}）`],
          univ: [p.univ === "vocational" ? "専門" : "大学", `${UNIV_NAMES[p.univ]}入学${p.away === "away" ? "・下宿" : ""}（教育費のピーク）`],
          independ: ["独立", "独立"],
        }[g.stage];
        return { short: T[0], text: who + T[1] };
      }
      default: throw new Error("年表の出来事の種類が不明です: " + e.ev);
    }
  }
  const SHORTAGE_TEXT = "貯蓄が底をつく見込み（運用しない場合）";

  /** 年表の骨組み（metrics の lanes）に文を付け、一覧（events）と行ごとの表（timeline）を作る */
  function timelineOf(plan, model, lanesIn, sim0) {
    const age = plan.age, year0 = plan.year0, kids = plan.kids;
    const lanes = lanesIn.map((lane) => {
      const events = lane.events.map((e) => {
        const t = eventText(e);
        const o = { offset: e.offset, short: t.short, text: t.text };
        if (e.kind) o.kind = e.kind;
        if (lane.who === "life") o.amount = e.amount;
        Object.defineProperty(o, "_stage", { value: e.ev === "kidStage" ? e.args.stage : null, enumerable: false });
        Object.defineProperty(o, "_ev", { value: e.ev, enumerable: false });   // グラフの「定年」の線を引く年を探すため（charts.js）
        return o;
      });
      if (lane.who === "self") return { label: "あなた", ageNow: lane.ageNow, end: lane.end, events };
      if (lane.who === "spouse") return { label: "配偶者", ageNow: lane.ageNow, end: lane.end, events };
      if (lane.who === "kid") return { label: `${lane.kidIdx + 1}人目の子${lane.ageNow < 0 ? "（予定）" : ""}`, kidIdx: lane.kidIdx, ageNow: lane.ageNow, end: lane.end, events };
      return { label: "くらし（車・住まい・出費）", ageNow: null, end: lane.end, track: false, events };
    });

    // 年表（一覧）
    const events = [{ year: year0, age, text: "いま" }];
    lanes.forEach((lane) => lane.events.forEach((e) => events.push({ year: year0 + e.offset, age: age + e.offset, text: e.text })));
    if (sim0.shortageAge !== null) events.push({ year: year0 + sim0.shortageAge - age, age: sim0.shortageAge, text: SHORTAGE_TEXT });
    events.sort((x, y) => x.year - y.year);

    // 年表（行ごと）：年・家族の年齢・出来事（記号・金額）
    const rowsByOff = {};
    const addRow = (off, item) => { (rowsByOff[off] = rowsByOff[off] || []).push(item); };
    lanes.forEach((lane) => lane.events.forEach((e) => {
      const pt = sim0.points[e.offset];
      const stage = e._stage;
      addRow(e.offset, {
        icon: window.KSI.markOf(e).key,
        text: e.text.replace(/（約[^）]*）/, ""),
        amount: e.amount || (stage === "univ" ? Math.round(pt ? pt.exp.edu : 0) : 0),
        kind: e.kind || (stage && stage !== "birth" ? "edu" : "life"),
      });
    }));
    if (sim0.shortageAge !== null) addRow(sim0.shortageAge - age, { icon: "alert", text: SHORTAGE_TEXT, amount: 0, kind: "alert" });
    const timeline = Object.keys(rowsByOff).map(Number).sort((x, y) => x - y).map((off) => ({
      year: year0 + off, offset: off,
      ages: [{ who: "あなた", age: age + off }].concat(plan.spouse ? [{ who: "配偶者", age: plan.spouseAge + off }] : [], kids.map((k, i) => ({ who: `子${kids.length > 1 ? i + 1 : ""}`, age: k + off, gone: k + off > model.independAge(i) || k + off < 0 })).filter((x) => !x.gone)),
      items: rowsByOff[off],
      balance: sim0.points[off] ? sim0.points[off].balance : null,
    }));
    return { lanes, events, timeline };
  }

  // ── いまの毎月の支出（説明の欄） ──
  /** 住宅ローンの返済を何歳まで入れているか。住み替えでいまの家のローンを外したときは、住み替えの年齢まで（2026-10-31 B6-1） */
  function loanUntilText(model) {
    const m = model.sched.moveDropped;
    return m && m.home === "current" && m.loan ? `住み替えの${m.age}歳まで（それより後は計算に入れていません）` : `${model.loanEndAge}歳まで`;
  }
  function currentOf(plan, model, c) {
    const D = plan.detail, a = plan.answers;
    const home = plan.home;
    const lv = plan.loanView;
    // いまの年（0年目）に住み替える・購入するなら、⑤の金額（model の housingCost(0)）はその先の家のもの。注記もそれに合わせる。
    // 以前はいまの家のことを書き、「返済0円・月8.5万円・40歳まで」「家賃 1万円（購入した家の固定資産税）」と並んでいた（2026-10-31 B7-2）
    const S = model.sched;
    const buyNow = S.purchaseOff === 0;
    const moveNow = !buyNow && S.moveOff === 0;
    const P = D.purchase;
    const buyType = P.type === "mansion" ? "修繕積立金・管理費＋固定資産税" : "固定資産税（戸建ての修繕は年表の時期にまとめて計上）";
    return Object.assign({}, c, {
      living: Object.assign({}, c.living, { items: c.living.items.map((it) => ({ key: it.key, label: LIVING_LABELS[it.key], monthly: it.monthly })) }),
      homeLoan: Object.assign({}, c.homeLoan, {
        note: buyNow
          ? (S.purchaseLoan > 0
            ? `${plan.age}歳で購入する家の返済。借入${man(Math.max(0, Number(P.price) - Number(P.down)))}・${Number(P.years)}年・金利${P.rate}%から計算。返済額は変わらない前提で、金利の上昇や住宅ローン控除は計算に入れていません`
            : "住宅ローンなし（頭金だけで購入）")
          : moveNow
          ? (S.moveDropped && S.moveDropped.loan ? `いまの家の住宅ローンの返済は、住み替えの${plan.age}歳から計算に入れていません` : "住宅ローンなし")
          // 返し終えたローン（model/plan.js の loanPaidOff）は、返済も期間も言わない。以前は「月9万円・50歳まで」と出ていた（2026-10-31 第9巡 B9-1・A9-1）
          // 第10巡 B10-2：⑤とPDFの表に0円の行で出すので、完済の年齢も添える
          : home === "loan" && plan.loanPaidOff
          ? paidOffText(plan.loanEndAge)
          : home === "loan"
          ? `月${man1(plan.loanMonthly)}・${loanUntilText(model)}${!lv && Number(D.loan.bonus) > 0 ? "・ボーナス返済を含む" : ""}${lv ? `。借入${man(D.loan.borrowed)}・${lv.years}年・金利${D.loan.rate}%から計算` : ""}。返済額は変わらない前提で、金利の上昇や住宅ローン控除は計算に入れていません`
          : "住宅ローンなし",
      }),
      housing: Object.assign({}, c.housing, {
        note: buyNow ? `購入する家の${buyType}`
          : moveNow ? "住み替え先の住居費（くわしく入力の額）"
          : housingNoteNow(plan, D, a, home),
      }),
      edu: Object.assign({}, c.edu, { note: plan.kids.length ? "今年の学年と進学の方針から" : "お子さんなし" }),
      car: Object.assign({}, c.car, { note: D.cars.length ? "維持費（税金・保険・車検・ガソリンなど）。買い替えは年表の時期にまとめて計上" : "車なし" }),
      loan: Object.assign({}, c.loan, { note: D.loans.length ? "奨学金・自動車ローンなどの毎月の返済（住宅ローンは上の行）" : a.otherLoan === "yes" ? `借入れが「ある」とお答えですが、毎月の返済額をまだ入れていないため、${manZ(c.loan.monthly)}で計算しています`
        : a.otherLoan === "unknown" ? "借入れは「わからない」とお答えのため、借入れなしとして計算しています（くわしく入力で設定できます）" : "住宅ローン以外の借入れなし" }),
      other: Object.assign({}, c.other, { note: "旅行・介護など（くわしく入力で設定）" }),
    });
  }
  /** いまの家の住居費の注記（0年目に住み替え・購入しないとき） */
  function housingNoteNow(plan, D, a, home) {
    // 「平均から」は、くわしく入力で家賃を入れておらず、実際に都道府県の平均を使っているときだけ（2026-10-31）
    return (plan.renting ? (!D.set.home && plan.region && plan.region.rentMan && (a.rent === undefined || a.rent === "unknown") && Number(D.rent.monthly) === plan.region.rentMan
      ? `家賃（${a.pref}の民営借家の平均から）` : "家賃") : "")
      + (plan.owns ? (plan.homeType === "mansion" ? "修繕積立金・管理費＋固定資産税" : "固定資産税（戸建ての修繕は年表の時期にまとめて計上）") : home === "family" ? "住居費なし（実家など）" : "")
      || "住宅ローンの返済のほかにかかるもの";
  }

  // ── やること ──
  const SOON_TITLES = { car: "車の買い替え資金を準備する", repair: "住まいの修繕費を準備する", home: "住まいの大きな出費に備える", spend: "予定している大きな出費に備える", care: "親の介護について家族で話し合う" };
  function whenText(w) {
    return { now: "今すぐ", consult: "次の相談時", review: "見直しの目安" }[w.kind] || (w.years > 0 ? `${w.years}年以内` : "今すぐ");
  }
  // やることのリンク先。対応する記事（prototype/learn/ に実在するもの）へ向け、無いものは出典と相談先の一覧へ。
  // 以前は全部 /sources/ に向いたまま「◯◯を読む」と書いていた（2026-10-31 B5-6）。
  // 記事が実在することは tests/invariants.html の R196 が確かめる
  const TODO_LINK_SOURCES = { href: "/sources/", text: "出典と相談先を見る" };
  const TODO_LINKS = {
    emergency: { href: "/learn/seikatsu-boueishikin/", text: "手元に置いておくお金の考え方を読む" },
    death: { href: "/learn/shibou-hoshou/", text: "死亡保障の考え方を読む" },
    disability: { href: "/learn/hatarakenai-sonae/", text: "働けなくなったときの備えを読む" },
    edu: { href: "/learn/kyouikuhi-souba/", text: "教育費の目安を読む" },
    care: { href: "/learn/kaigo-okane/", text: "介護とお金を読む" },
    retire: { href: "/learn/roukogo-2000man/", text: "老後資金の考え方を読む" },
    loan: { href: "/learn/danshin/", text: "団信と死亡保障の関係を読む" },
    cash: { href: "/learn/kakei-uchiwake/", text: "支出を平均と比べる見方を読む" },
  };
  // 近い大きな出費は、出来事の種類ごと（記事が無い種類は出典と相談先へ）
  const SOON_LINKS = {
    repair: { href: "/learn/kodate-shuuzen/", text: "戸建ての修繕費の目安を読む" },
    purchase: { href: "/learn/loan-futan/", text: "無理のない住宅ローンの考え方を読む" },
    care: TODO_LINKS.care,
  };
  function todoText(t) {
    const g = t.args;
    const T = {
      emergency: () => ["急な出費に備える貯蓄を確認する", `貯蓄が、毎月の${spendScope(g.withHomeLoan)}の${savingsMonths(g.months)}です。` + (g.vary
        ? `収入の波が大きい働き方のため、${spanText(g.target)}分を目安にしています。`
        : `一般に、${spanText(g.target)}分ほどを目安にする考え方があります。`), TODO_LINKS.emergency],
      death: () => ["万一のときの保障額を確認する",
        `${g.withKids ? "お子さんが独立するまでの支出" : "ご家族の生活費"}が、${coverList(g)}だけでは${deathRange(g.low, g.high)}不足する見込みです。`, TODO_LINKS.death],
      // 不足があるときだけ出す（model/metrics.js の todosOf）。額は保険の優先度・天気と同じ計算の結果（2026-10-31 B5-1）
      disability: () => ["働けなくなったときの備えを確認する", `自営業・フリーランスには、会社員のような休業中の手当がありません。いまの前提では、${g.pending ? "加入中の保障（額が未入力）を含めずに、" : ""}働けなくなると毎月${approx(g.first)}不足する見込みです。`, TODO_LINKS.disability],
      edu: () => ["教育費の準備を始める時期を決める", `教育費がいちばん多いのは${g.year}年（あなたが${g.age}歳）で、その年は約${man(g.amount)}の見込みです。`, TODO_LINKS.edu],
      soon: () => [SOON_TITLES[g.event.kind] || "予定している出費に備える", `${g.year}年（${g.age}歳）に「${eventText(g.event).text}」を見込んでいます。`, (g.event.ev === "purchase" && g.event.args.loan === false ? null : SOON_LINKS[g.event.ev]) || TODO_LINK_SOURCES],
      // 始まりが過ぎていて続いている介護は、計算に入れた期間（いまから◯歳まで）を言う（2026-10-31 B7-3）
      care: () => ["親の介護について家族で話し合う", g.ongoing ? `いまから${g.untilAge}歳まで、年約${man(g.yearly)}の負担を見込んでいます。` : `${g.startAge}歳ごろから、年約${man(g.yearly)}の負担を見込んでいます。`, TODO_LINKS.care],
      retire: () => ["老後資金の積立を検討する", `${g.endAge}歳まで貯蓄をもたせるには、約${man(g.gap)}足りない見込みです（運用しない場合）。${g.pensionAge}歳までに毎月${approx(g.monthly)}を積み立てると埋まる計算です。`, TODO_LINKS.retire],
      loan: () => ["住宅ローンと保障の重なりを確認する", "団信に入っていれば、万一のときローン残高がなくなり、必要な保障額が変わります。", TODO_LINKS.loan],
      cash: () => ["家計の見通しを見直す", `運用しない場合、${g.age}歳ごろに貯蓄が底をつく見込みです。`, TODO_LINKS.cash],
    }[t.key]();
    return { key: t.key, when: whenText(t.when), title: T[0], reason: T[1], link: Object.assign({}, T[2]) };
  }

  /** 働けなくなったとき、はじめの期間に支出をまかなう側に何を数えているか（数えていないものは言わない。2026-10-31 B3-中3） */
  function sickCoverList(g) {
    const xs = [g.hasSick && "休業中の手当", g.spouse && "配偶者の収入", g.withPension && "受け取っている年金", g.insured && "加入中の保障"].filter(Boolean);
    return xs.length ? xs.join("・") : "いまの収入の見込み";
  }
  /** 万一のときに、支出をまかなう側に何を数えているか（数えていないものは言わない） */
  function coverList(g) {
    // g.spouse は配偶者の収入が実際にあるとき（収入0の配偶者を数えない。2026-10-31 B2-中2）
    return [g.survivorPension && "遺族年金", g.spouse && "配偶者の収入", g.spousePension && "配偶者の年金", "貯蓄", g.insured && "加入中の保険"].filter(Boolean).join("・");
  }

  // ── 保険の種類ごとの優先度 ──
  const LEVELS = { l1: "優先して検討", l2: "状況により検討", l3: "公的保障・貯蓄で賄える可能性が高い" };
  const INSURANCE_NAMES = { death: "死亡保障", medical: "医療保障", disability: "働けなくなったときの保障", liability: "個人賠償責任" };
  const INSURANCE_REASONS = {
    // 不足の有無は、遺族年金・配偶者の収入・貯蓄・加入中の保険を差し引いたあとで見ている（数えたものだけを並べる。2026-10-31 B2-中1）
    short: (g) => `ご家族の支出が、${coverList(g)}を差し引いても不足する見込みです。`,
    covered: (g) => `いまの前提では、${coverList(g)}で、ご家族の支出をまかなえる見込みです（前提が変われば変わります）。`,
    noDependents: "扶養しているご家族がいない場合、大きな保障の必要性は低めです。",
    // 「1か月」は高額療養費の制度の単位（暦月ごと）。計算の前提の数字ではない（静的検査の例外に登録している）
    kougaku: "高額療養費制度により、1か月の医療費の自己負担には上限があります。差額ベッド代など対象外の費用を貯蓄で賄えるかがポイントです。",
    self: "休業中の手当がないため、収入が途絶えやすい働き方です。",
    employee: "休業中の手当はありますが、長期化したときの生活費は、確認しておきたいところです。",
    // 会社員・公務員でない働き方（パートなど）や、いま勤め先の給与が無い人は、休業中の手当を見込んでいない（2026-10-31 B3-中1）
    noSick: "この計算では休業中の手当を見込んでいない働き方のため、収入が途絶えたときの生活費を確認しておきたいところです。",
    // 手当の無い働き方でも、ほかの収入で毎月の支出をまかなえる見込みのとき（計算の結果に合わせる。2026-10-31 B4-2）
    noSickCovered: (g) => `${g.self ? "休業中の手当がない働き方ですが" : "この計算では休業中の手当を見込んでいない働き方ですが"}、いまの前提では、${sickCoverList(g)}で毎月の支出をまかなえる見込みです（前提が変われば変わります）。`,
    notWorking: NOT_WORKING + "、働けなくなっても収入は変わりません。",
    bicycle: "自転車事故などで他人にけがをさせた場合の備えです。",
  };
  const insuranceText = (x) => {
    const R0 = INSURANCE_REASONS[x.reason];
    return { name: INSURANCE_NAMES[x.key], level: { cls: x.level, text: LEVELS[x.level] }, reason: typeof R0 === "function" ? R0(x.args || {}) : R0 };
  };

  // ── 専門家に聞くこと ──
  const ASK = {
    dansin: ["団信の保障内容と、死亡保障の重なり", "保険相談員・金融機関"],
    health: ["健康状態について告知が必要な場合の扱い", "保険相談員"],
    eduPrep: ["教育費の準備方法の選択肢", "FP"],
    selfPension: ["自営業の老後の年金を増やす制度の使い方", "年金事務所・FP"],
    taxFree: ["積立投資の税制優遇（NISA・iDeCo）の使い方", "FP・金融機関"],
    purchase: ["住宅購入の予算と、無理のない返済額", "FP"],
    repairSaving: ["修繕費をどう積み立てるか", "FP"],
    care: ["介護が始まったときに使える公的な制度", "地域包括支援センター"],
    insuranceFit: ["加入中の保険の保障内容が、いまの家族構成に合っているか", "保険相談員"],
    selfExtra: ["自営業の上乗せの年金・退職金の代わりになる制度（国民年金基金・iDeCo・小規模企業共済など）", "年金事務所・商工会・FP"],
    shougakukin: ["奨学金の返還が免除・猶予される場合の条件", "日本学生支援機構など貸与元"],
    birth: ["出産・育児のときに使える公的な給付", "勤務先・自治体"],
    dependents: ["同居している家族を、健康保険の扶養や税の扶養に入れられるか（要件と、入れた場合の影響）", "勤務先・健康保険の窓口・税務署"],
    partnerPension: ["遺族年金を請求するときに必要な、事実婚関係を証明する書類", "年金事務所"],
    partnerEstate: ["パートナーに財産を残すための方法（事実婚は法定相続人にならないとされています）", "司法書士・弁護士"],
    "worry.death": ["万一のときに必要な保障額の考え方（遺族年金を差し引いたあとの不足分）", "保険相談員・FP"],
    "worry.sick": ["働けなくなったときに使える公的な制度と、勤務先の制度", "勤務先・健康保険の窓口"],
    // 自営業・フリーランス（勤務先が無い）。休業中の手当が無い前提で、使える公的な制度を聞く（2026-10-31 B2-軽14）
    // いま仕事の収入が無い人（対象外）。勤務先の制度は言わない（2026-10-31 B4-4）
    "worry.sickNone": ["働けなくなったときや病気のときに使える公的な制度（障害年金・医療費の負担を軽くする制度など）", "年金事務所・市区町村の窓口"],
    "worry.sickSelf": ["働けなくなったときに使える公的な制度（自営業・フリーランスの場合。障害年金・国民健康保険の扱いなど）", "年金事務所・市区町村の窓口"],
    "worry.edu": ["教育費の準備を、いつから・どの方法で始めるか", "FP"],
    "worry.loan": ["住宅ローンの借り換え・繰り上げ返済を考えるときの判断材料", "借入先の金融機関"],
    "worry.retire": ["老後の生活費の見積り方と、年金の見込み額の確かめ方", "年金事務所・FP"],
    "worry.invest": ["積立を始めるときの考え方と、税制優遇（NISA・iDeCo）の使い方", "金融機関・FP"],
    "worry.cash": ["毎月お金が残らない原因の見つけ方", "FP"],
  };
  function askText(key) {
    const x = ASK[key];
    if (!x) throw new Error("聞くことの種類が不明です: " + key);
    return { q: x[0], who: x[1] };
  }

  // ── 見通しの天気 ──
  // 死亡保障と、働けなくなったときの保障を分けて言う。以前は死亡保障の状態を、働けなくなったときの注記にも出していた（2026-10-31）
  function insuranceNote(kind, plan) {
    const D = plan.detail;
    if (!plan.anyInsurance) return "保険に入っていない前提です";
    if (kind === "death") {
      if (!plan.insuredDeathOn) return "死亡保障には入っていない前提です";
      // 額0を入れた人に「0万円を差し引いています」と書かない（2026-10-31 B2-軽10）
      if (D.set.insurance) return Number(D.insurance.death) > 0 ? `加入中の死亡保障 ${man(D.insurance.death)}を差し引いています` : "加入中の死亡保障の額は「なし・わからない」のため、差し引いていません（くわしく入力で設定できます）";
      return plan.bandDeath === null
        ? "加入中の保険の保障額が未入力のため、含めていません（くわしく入力で設定できます）"
        : `かんたん入力で答えた死亡保障（だいたい${man(plan.bandDeath)}）で計算しています。正確な額はくわしく入力で設定できます`;
    }
    if (!plan.insuredIncomeOn) return "働けなくなったときの保障には入っていない前提です";
    if (D.set.insurance) return Number(D.insurance.disability) > 0 ? `加入中の働けなくなったときの保障 月${man(D.insurance.disability)}を差し引いています` : "働けなくなったときの保障の額は「なし・わからない」のため、差し引いていません（くわしく入力で設定できます）";
    return "働けなくなったときの保障の額が未入力のため、含めていません（くわしく入力で設定できます）";
  }
  function forecastText(f, plan) {
    const g = f.args;
    // pending：保障額が未入力でくもりにしているか（雨0の案内で「くもりを埋めると」を出すかどうか。2026-10-31 B3-軽8）
    const base = { key: f.key, weather: f.weather, target: f.target, pending: Boolean(g.pending) };
    if (f.key === "working") {
      const cush = spanText(g.cushionMonths);
      return Object.assign(base, {
        title: "現役のあいだの家計", q: `${g.pensionAge}歳までに貯蓄が底をつかないか`,
        // 1万円未満は「約0.3万円」「0.1万円未満」と言う（「0万円」と書かない。2026-10-31 A4-2）
        short: g.minus ? `${g.minusAge}歳でマイナス` : `いちばん少ない時 ${approx(g.minBalance)}`,
        criteria: `いちばん少ない時でも生活費の${cush}分が残れば晴れ、${cush}分を切る時期があればくもり、マイナスになる時期があれば雨です`,
        reason: g.minus
          ? `${g.minusAge}歳ごろに貯蓄がマイナスになる見込みです（いちばん少ないのは${g.minAge}歳で${minusText(g.minBalance)}）。`
          : `貯蓄がいちばん少なくなるのは${g.minAge}歳ごろで、${approx(g.minBalance)}の見込みです${g.low ? `（生活費の${cush}分を下回ります）` : ""}。`,
      });
    }
    if (f.key === "retire") {
      return Object.assign(base, {
        title: "老後のお金", q: `${g.endAge}歳まで貯蓄がもつか`,
        short: g.outAge !== null ? (g.alreadyMinus ? (g.firstIsNow ? "いまの時点でマイナス" : `${g.firstAge}歳でマイナス`) : `${g.outAge}歳で底をつく`) : `${g.endAge}歳で${approx(g.endBalance)}残る`,
        criteria: `${g.endAge}歳の時点で老後の生活費${g.cushionYears}年分が残れば晴れ、もつものの余裕が少なければくもり、途中でなくなれば雨です`,
        reason: g.outAge !== null
          ? (g.alreadyMinus
            ? `${g.firstIsNow ? "いまの時点" : g.firstAge + "歳の時点"}で、すでに貯蓄がマイナス（${minusText(g.firstBalance)}）の見込みです。まず現役のあいだの家計から見ていくことになります。`
            : `${g.outAge}歳ごろに貯蓄がなくなる見込みです（運用しない場合）。`)
          : `${g.endAge}歳時点で${approx(g.endBalance)}残る見込みです${g.low ? `（老後の生活費の${g.cushionYears}年分を下回り、余裕は少なめです）` : ""}。`,
      });
    }
    if (f.key === "death") {
      const criteria = `不足がなければ晴れ、不足が${man(g.cloudMax)}以内ならくもり、${man(g.cloudMax)}を超えれば雨です`;
      const head = { title: "万一のとき", q: "あなたが亡くなったとき、家族の生活は", criteria };
      if (g.none) return Object.assign(base, head, { short: "扶養家族なし", reason: "扶養しているご家族がいないため、大きな備えの必要性は低めです。" });
      return Object.assign(base, head, {
        short: g.pending ? "保障額が未入力" : g.high <= 0 ? "不足なし" : g.low > 0 ? `不足 ${man(g.low)}〜${man(g.high)}` : `不足 最大${man(g.high)}`,
        // 「加入中の保険を差し引いて」は、実際に保険の額を差し引いたときだけ書く（2026-10-31）
        reason: (g.pending ? "加入中の保険の保障額が未入力のため、晴れ・雨の判定ができません。くわしく入力で設定してください。" + "\n" : "") + (g.high <= 0
          ? `${coverList(g)}で、ご家族の支出をまかなえる見込みです。`
          : `${g.insured ? "加入中の保険を差し引いても、" : ""}${deathRange(g.low, g.high)}不足する見込みです。`),
        // 返し終えたローンは、万一の保障額にかかわらない（model/metrics.js の loanNowOf の forDeath と同じ。第9巡 B9-1）
        note: insuranceNote("death", plan) + (plan.home === "loan" && !plan.loanPaidOff ? (plan.detail.loan.dansin === "yes" ? "。住宅ローンは団信で完済される前提" : "。住宅ローンは団信なしとして残りの返済を含めています") : ""),
      });
    }
    if (f.key === "sick") {
      const sp = spanText(g.months), period = periodText(g.months);
      return Object.assign(base, {
        title: "働けなくなったとき", q: `休業中の収入減を、貯蓄で${sp}しのげるか`,
        short: g.na ? "対象外" : g.pending ? "保障額が未入力" : g.first <= 0 ? (g.after > 0 ? `${period}は不足なし` : "不足なし") : `毎月 ${approx(g.first)} 不足`,
        criteria: `不足がなければ晴れ、${sp}分の不足を貯蓄でしのげればくもり、貯蓄では足りなければ雨です`,
        // 毎月の支出は「生活費＋住居費」だけ（model/metrics.js の disabilityOf）。範囲を文に書く（2026-10-31）
        // 判定ははじめの期間（傷病手当金の期間）だけで行う。期間を言い、それ以降の不足も書く（2026-10-31 B3-中3）。
        // まかなう側は、実際に差し引いたものだけを並べる（手当の無い働き方に「休業中の手当」と書かない）
        reason: g.na
          ? `対象外です。${NOT_WORKING}、働けなくなっても収入は変わりません。`
          : (g.pending ? "働けなくなったときの保障の額が未入力のため、晴れ・雨の判定ができません。くわしく入力で設定してください。" + "\n" : "") + (g.first <= 0
            ? `はじめの${period}は、${sickCoverList(g)}で、毎月の支出（${spendScope(g.withHomeLoan)}）をまかなえる見込みです。`
            : `はじめの${period}は、毎月の支出（${spendScope(g.withHomeLoan)}。教育費・車・${g.withHomeLoan ? "住宅ローン以外の" : ""}借入れの返済などは含みません）に対して、毎月${approx(g.first)}足りなくなり、${sp}で${approx(g.need)}。${g.coverable ? "今の貯蓄でしのげる見込みですが、貯蓄は減ります。" : "今の貯蓄では足りない見込みです。"}`)
            + (g.after > 0 ? `それ以降は、毎月${approx(g.after)}足りない見込みです（${g.noDisabilityPension ? "障害年金は見込んでいません" : "障害年金を見込んだ場合"}）。` : ""),
        note: insuranceNote("sick", plan),
      });
    }
    if (f.key === "emergency") {
      const amount = savingsMonths(g.months, g.cap, true);
      return Object.assign(base, {
        title: "急な出費への備え", q: `貯蓄が毎月の支出の何か月分あるか（目安${g.need}か月分）`,
        short: `貯蓄 ${amount}`,
        criteria: `毎月の支出の${g.need}か月分があれば晴れ、${g.need / 2}か月分以上ならくもり、それより少なければ雨です`,
        reason: `貯蓄は毎月の支出（${spendScope(g.withHomeLoan)}）の${savingsMonths(g.months, g.cap)}です。${g.vary ? `収入の波が大きい働き方のため、${spanText(g.need)}分を目安にしています。` : `一般に、${spanText(g.need)}分ほどを目安にする考え方があります。`}`,
      });
    }
    throw new Error("天気の種類が不明です: " + f.key);
  }

  // ── この計算に入れていないこと ──
  // 結果画面（ctx = { r, a }）と /about/（ctx = null：利用者の入力が無いので一般的な形）を、
  // **同じ定義から**作る。dir: better＝実際はもっと良くなる可能性／worse＝もっと厳しくなる可能性／both＝どちらにも動く
  // 購入は、計算が実際に入れ、借入れがあるときだけ（頭金だけ・いまの年齢より前の購入には、ローンの話をしない。2026-10-31 B6-2・C6-軽2）
  // いまの年に住み替えて、いまの家の返済を計算から外したとき（r.moveDropped がいまの年齢）は、いまの家のローンの話をしない。
  // 以前は回答（住宅ローンあり）だけを見て、返済が1年も入っていないのに「変動金利の上昇」「住宅ローン控除」を出していた（2026-10-31 B8-2）
  // 返し終えた住宅ローン（完済の年齢がいまの年齢以下）も同じ。返済は計算に1年も入らない（2026-10-31 第8巡 R9候補）。
  // 完済の年齢は計算と同じ決め方（model/plan.js の loanEndAge：借りたときの内容なら loanView、直接入力なら detail.loan.endAge）
  // 判定は model に1つ（model/plan.js の loanPaidOff → model/metrics.js の loanNowOf → r.loanNow）。ここで別に判定しない（第9巡 B9-1）
  const loanGoneNow = (c) => Boolean(c.r.loanNow && c.r.loanNow.goneNow);
  const hasLoanOrBuy = (c) => (c.a.home === "loan" && !loanGoneNow(c)) || Boolean(c.r.homePlan && c.r.homePlan.purchaseLoan);
  const planOn = (c, k) => Boolean(c.r.homePlan && c.r.homePlan[k]);
  const hasKids = (c) => c.a.kids === "yes" || c.a.kids === "plan";
  function infTargetNames(keys) {
    return keys.map((k) => INF_LABELS[k]).filter(Boolean);
  }
  const infOff = (keys) => { const on = infTargetNames(keys || []); return Object.values(INF_LABELS).filter((x) => !on.includes(x)); };
  /** 物価の上昇を掛けている費目を、ひとことで（PDF の前提の行） */
  // 「返済以外のすべて」とは書かない。修繕・買い替えの一時金と介護の費用は、どの設定でも据え置きのため（2026-10-31）
  // 物価0%のときは「…に掛ける」と書かない（掛けても値上がりしない。2026-10-31 B2-軽8）
  function inflationTargetsText(keys, inflation) {
    if (inflation !== undefined && Number(inflation) === 0) return "値上がりは見ていない";
    const on = infTargetNames(keys || []);
    if (!on.length) return "どの費目にも掛けていない";
    return on.join("・") + "に掛ける";
  }
  /** 老後の不足額の出し方（結果画面）。物価0%・費目なしのときに「物価の上昇を含む」と書かない（2026-10-31 B2-軽8） */
  function retireBasisText(r) {
    const inf = Number(r.inflation) !== 0 && infTargetNames(r.inflationOn || []).length > 0;
    return `貯蓄残高の推移（住居費・車${inf ? "・物価の上昇" : ""}を含む）で、${pensionAge()}歳から${endAge()}歳までに貯蓄がいちばん少なくなる時のマイナス分です。`;
  }
  const NOT_INCLUDED = [
    { id: "loanDeduction", dir: "better", when: hasLoanOrBuy,
      text: () => "住宅ローン控除（減税）。税金が戻る分は収入に入れていません",
      general: () => "住宅ローンがある（買う予定の）場合の、住宅ローン控除（減税）。税金が戻る分は収入に入れていません" },
    // 「いまの返済額と残高」で完済の年齢がいまの年齢以下なのに残高があるとき。残高は計算に入れていない（2026-10-31 第9巡 B9-4）
    { id: "loanPaidBalance", dir: "worse", when: (c) => Boolean(c.r.loanNow && c.r.loanNow.ignoredBalance > 0),
      text: (c) => `住宅ローンの残高${man(c.r.loanNow.ignoredBalance)}は、完済の年齢がいまの年齢以下のため計算に入れていません（くわしく入力の「住まい」で確かめられます）`,
      general: () => null },
    { id: "rateRise", dir: "worse", when: hasLoanOrBuy,
      text: () => "変動金利の上昇。返済額は、いま入力した額のままで計算しています",
      general: () => "住宅ローンの変動金利の上昇。返済額は、いま入力した額のままで計算しています" },
    // 住み替えで繰り上げ返済を外したとき（r.moveDropped.prepay）は、利息の話は出さない（2026-10-31 A5-1）
    // 繰り上げ返済を計算が実際に入れたときだけ（完済の年齢以後・いまの年齢より前は何も起きない。2026-10-31 B6-6）
    { id: "prepayInterest", dir: "better", when: (c) => c.a.home === "loan" && planOn(c, "prepay"),
      text: () => "繰り上げ返済で利息が減る分。期間が短くなる効果だけを見ています",
      general: () => "繰り上げ返済を入れた場合の、利息が減る分。期間が短くなる効果だけを見ています" },
    { id: "tax", dir: "both", when: () => true,
      text: () => "税金・社会保険料の細かい計算。手取りは、年収に応じたおおよその割合で出しています",
      general: () => {
        const P = dataVal("estimate", "takeHomeRate").map((x) => Math.round(x[1] * PCT));
        return `税金・社会保険料の細かい計算。手取りは、年収に応じたおおよその割合（約${Math.min(...P)}〜${Math.max(...P)}%）で出しています`;
      } },
    { id: "dependentsTax", dir: "better", when: (c) => Number(c.a.others || 0) > 0,
      text: () => "同居している家族を扶養に入れた場合の、税の軽減。生活費の人数には入れていますが、税は計算に入れていません",
      general: () => "同居している家族（親など）を扶養に入れた場合の、税の軽減。生活費の人数には入れていますが、税は計算に入れていません" },
    // 働いていない人には出さない（給与の収入が無い。2026-10-31 B2-軽5）
    { id: "incomeGrowth", dir: "both", when: (c) => c.a.work !== "none",
      // 「年齢に応じて」を選んでいても、統計の対象外の働き方（自営業など）では横ばいになる。
      // 実際に使われたかどうかで言い分けないと、画面の中で食い違う
      text: (c) => {
        const mode = (c.D.work && c.D.work.growth) || "flat";
        // 統計で増減させる年齢（capAge）を過ぎた人は、実際には横ばい（2026-10-31 B2-軽5）
        if (c.r.wageCapped) return `年齢による収入の変化。統計の年齢別の賃金の形で増減させるのは${window.KSDATA.wage.capAge}歳までのため、いまの収入がそのまま続く前提で計算しています`;
        if (c.r.wageApplied) return "あなた個人の昇給や役職の変化。収入は、統計の年齢別の賃金の形にならって増減させているだけです";
        if (mode === "stat") return "年齢による収入の変化。この働き方は賃金の統計の対象外のため、いまの収入がそのまま続く前提で計算しています";
        if (mode === "up" || mode === "down") return `あなた個人の事情。収入は毎年${dataVal("estimate", "incomeGrowthStep")}%ずつ${mode === "up" ? "増える" : "減る"}前提にそろえているだけです`;
        return "年齢による収入の変化。いまの収入がそのまま続く前提で計算しています（くわしく入力で変えられます）";
      },
      general: () => "あなた個人の昇給や役職の変化。収入は、統計の年齢別の賃金の形にならって増減させるか、いまのまま続く前提で計算しています（くわしく入力で選べます）" },
    { id: "inflationScope", dir: "worse", when: (c) => Number(c.r.inflation) === 0 || infOff(c.r.inflationOn).length > 0,
      // 物価の上昇は費目ごとに選べるので、いまの設定をそのまま伝える（2026-10-03）
      text: (c) => {
        if (Number(c.r.inflation) === 0) return `物価の上昇を${c.r.inflation}%にしています。値上がりは見ていません（くわしく入力で変えられます）`;
        const on = infTargetNames(c.r.inflationOn || []);
        const off = infOff(c.r.inflationOn);
        // 費目を全部外したときに「掛けているのは です。」と出ていた（2026-10-31 D2-L1）
        if (!on.length) return `物価の上昇（年${c.r.inflation}%）は、どの費目にも掛けていません。${off.join("・")} は、いまの水準のままです（くわしく入力で変えられます）`;
        return `物価の上昇（年${c.r.inflation}%）を掛けているのは ${on.join("・")} です。${off.join("・")} は、いまの水準のままです`;
      },
      general: () => `物価の上昇を掛ける費目は、ご自身で選べます（はじめは ${infTargetNames(dataVal("defaults", "inflationTargets")).join("・")} に掛けています）。住宅ローンとその他の借入れの返済には掛けません（契約した額のまま変わらないため）` },
    // 物価を掛ける費目が1つも無ければ、支出も値上がりしないので出さない（2026-10-31 B3-軽1）
    { id: "incomeNoInflation", dir: "worse", when: (c) => Number(c.r.inflation) !== 0 && infTargetNames(c.r.inflationOn || []).length > 0,
      // 収入側は物価に合わせて増やしていない。支出だけが増えるので、厳しめの見方になる（2026-10-30）
      text: () => "給料や年金を、物価の上昇に合わせて増やしてはいません。支出だけが値上がりする、厳しめの見方です" },
    { id: "lumpSum", dir: "worse", when: () => true,
      // 返済と一時金は、設定にかかわらず据え置きなので必ず伝える。住宅購入の頭金・諸費用と住み替えの費用も一時金（2026-10-31 B2-軽9）
      text: (c) => `${["修繕・建て替え・車の買い替え", planOn(c, "purchase") && "住宅購入の頭金・諸費用", planOn(c, "move") && "住み替えの費用"].filter(Boolean).join("・")}の一時金と、介護の費用は、入力した金額のままで計算しています。工事費や車・住まいの価格、介護の費用の値上がりは見ていません`,
      general: () => "修繕・建て替え・車の買い替え・住宅購入の頭金と諸費用・住み替えの費用の一時金と、介護の費用は、入力した金額のままで計算しています。工事費や車・住まいの価格、介護の費用の値上がりは見ていません" },
    { id: "investSwing", dir: "both", when: () => true,
      text: () => "投資の値動き。利回りは毎年一定として計算し、元本割れは見ていません" },
    { id: "sudden", dir: "worse", when: () => true,
      text: () => "突然の医療費・介護費・失業や休職による収入の減少（くわしく入力で設定した分を除く）" },
    { id: "systemChange", dir: "both", when: () => true,
      text: () => "年金・児童手当などの制度が将来変わること。いまの制度が続く前提です" },
    { id: "nursery", dir: "worse",
      when: (c) => (c.r.kidInfo || []).some((k) => k.ageNow >= BIRTH_AGE && k.ageNow <= rule("schoolKinderFrom") - 1) || c.a.kids === "plan",
      text: () => `${BIRTH_AGE}〜${rule("schoolKinderFrom") - 1}歳の保育料。自治体と世帯の所得で決まるため、入れていません（住民税非課税の世帯は無償とされています）`,
      general: () => `お子さんがいる場合の、${BIRTH_AGE}〜${rule("schoolKinderFrom") - 1}歳の保育料。自治体と世帯の所得で決まるため、入れていません（住民税非課税の世帯は無償とされています）` },
    { id: "kinderExtra", dir: "worse", when: hasKids,
      text: () => "保育園・幼稚園の給食費・行事費・通園送迎費。無償化の対象外とされていますが、計算には入れていません" },
    { id: "highSupport", dir: "better", when: hasKids,
      text: () => "高校の就学支援金の拡充分。教育費のもとにした調査が、当時の支援を反映した金額のため、重ねて差し引いていません" },
    { id: "partner", dir: "worse", when: (c) => c.a.spouse === "partner",
      text: () => "事実婚では、税の配偶者控除と相続の扱いが、届出をしている場合と違うとされています。この違いは金額に反映していません" },
    // 万一の保障額：入れていない費目（データで外したもの）・修繕の一時金・物価（2026-10-31 住居費を入れたときに追加）
    { id: "survivorExcluded", dir: "worse", when: (c) => Boolean(c.r.death) && survivorExcluded().length > 0,
      text: () => `万一のときの保障額に入れていない費目：${survivorExcluded().join("・")}`,
      general: () => (survivorExcluded().length ? `万一のときの保障額に入れていない費目：${survivorExcluded().join("・")}` : null) },
    { id: "survivorRepair", dir: "worse",
      // 万一の保障額は、いまの住まいが続く前提（購入の予定は入れない）。いま持ち家の人だけに出す（2026-10-31 B2-中6）
      when: (c) => Boolean(c.r.death) && ["loan", "own"].includes(c.a.home) && (c.a.homeType === "house" || c.D.rebuild.on === "yes"),
      text: () => "万一のときの保障額には、修繕や建て替えの一時金を入れていません。毎年かかる固定資産税・管理費・修繕積立金は入れています",
      general: () => "持ち家の場合、万一のときの保障額には修繕や建て替えの一時金を入れていません。毎年かかる固定資産税・管理費・修繕積立金は入れています" },
    { id: "survivorInflation", dir: "worse", when: (c) => Boolean(c.r.death) && Number(c.r.inflation) !== 0,
      text: () => "万一のときの保障額は、物価の上昇を掛けず、いまの金額で計算しています" },
    { id: "survivorHomePlan", dir: "both",
      when: (c) => Boolean(c.r.death) && (planOn(c, "purchase") || planOn(c, "move")),
      text: () => "万一のときの保障額は、いまの住まいが続く前提で計算しています。住宅の購入・住み替えの予定は入れていません",
      general: () => "住宅の購入・住み替えを予定している場合も、万一のときの保障額は、いまの住まいが続く前提で計算しています" },
    // 予定したのに計算が外したもの（いまの年齢より前・見通しの終わりより後・返済が終わったあと）。外したと書く（2026-10-31 C6-軽1・軽2・B6-6）
    { id: "planSkipped", dir: "both",
      when: (c) => Boolean(c.r.homePlan && c.r.homePlan.skipped.length),
      text: (c) => c.r.homePlan.skipped.map(skippedText).join("、"),
      general: () => "くわしく入力で選んだ住宅の購入・住み替え・建て替え・繰り上げ返済・親の介護・一時的な大きな出費の年齢が、いまの年齢より前（または返済が終わったあと）になっている予定と、「何歳まで」がいまの年齢で終わっている毎年の旅行・レジャー、仕事をやめる年齢以後の転職・独立。計算には入れていません（介護は、いまの年齢より前の年の分）" },
    // 住み替えたあとは、前の家（持ち家、または住み替えより前に購入した家）の費用を入れない（model/yearly.js の schedule）。
    // 黙って外さず、計算が実際に外したもの（r.moveDropped）をそのまま書く（2026-10-31 A3-3。購入した家は B4-1）
    { id: "moveOldHome", dir: "both",
      when: (c) => Boolean(c.r.moveDropped),
      text: (c) => {
        const m = c.r.moveDropped;
        const who = m.home === "purchased" ? "購入した家" : "いまの家";
        const items = [m.loan && "住宅ローンの返済", m.prepay && `繰り上げ返済（${m.prepay.age}歳・約${man(m.prepay.amount)}）`, "固定資産税", m.mansion && "管理費・修繕積立金",
          m.repairs > 0 && `修繕${m.repairs}回`, m.rebuild !== null && `建て替え（${m.rebuild}歳）`].filter(Boolean);
        return `住み替えの年（${m.age}歳）からあとの、${who}の${items.join("・")}。住み替えたあとは、${who}の費用を入れず、住み替え後の住居費だけで計算しています。${who}を売ったり貸したりした場合の収入も入れていません`;
      },
      general: () => "持ち家から住み替える場合（家を購入してから住み替える場合を含む）の、住み替えたあとの前の家の返済・繰り上げ返済・固定資産税・管理費・修繕・建て替えと、前の家を売ったり貸したりした場合の収入。住み替えの年からは入れていません" },
    // 遺族年金で入れていないもの（2026-10-31）。どれも、入れれば遺族が受け取る額が増える
    // 配偶者に続く分・中高齢寡婦加算は、配偶者がいるときだけの話（子が受け取る遺族厚生年金は、子が18歳の年度末まで。2026-10-31 B2-軽11）
    { id: "survivorEmployee", dir: "better", when: (c) => Boolean(c.r.death) && Boolean(c.r.death.breakdown.employeePart) && Boolean(c.r.spouse),
      text: () => `遺族厚生年金は、末子が${rule("survivorKidUntil")}歳になったあとや子がいない場合も、配偶者に続くことがあります。この計算では末子が${rule("survivorKidUntil")}歳になるまでで止め、中高齢寡婦加算も入れていません`,
      general: () => `会社員・公務員の場合の、遺族厚生年金のうち末子が${rule("survivorKidUntil")}歳になったあとも配偶者に続く分と、中高齢寡婦加算` },
    { id: "inheritance", dir: "better", when: () => true, text: () => "相続・贈与・親からの援助" },
    { id: "retireTax", dir: "worse", when: () => true, text: () => "退職金や年金にかかる税金" },
    { id: "shougakukin", dir: "both", when: (c) => Boolean(c.D.loans && c.D.loans.some((l) => l.kind === "shougakukin")),
      text: () => "奨学金は、万一のときに返還が免除される前提で計算しています（条件は貸与元でご確認ください）" },
    { id: "selfVary", dir: "both", when: (c) => c.a.work === "self" && c.a.selfVary === "vary",
      text: () => `自営業の収入の波。金額には反映せず、急な出費の目安を${spanText(rule("emergencyMonthsVary"))}分にすることだけで見ています`,
      general: () => `自営業で収入の波が大きい場合の、収入の波。金額には反映せず、急な出費の目安を${spanText(rule("emergencyMonthsVary"))}分にすることだけで見ています` },
  ];
  const SKIPPED_NAMES = { purchase: "住宅の購入", move: "住み替え", rebuild: "建て替え・大規模リフォーム", prepay: "住宅ローンの繰り上げ返済" };
  /** 計算が外した予定1つ（例：38歳の住宅の購入（いまの年齢より前のため入れていません）） */
  function skippedText(x) {
    const why = { past: "いまの年齢より前のため", paid: "返済が終わったあとのため", late: `見通しの終わり（${endAge()}歳）より後のため` }[x.why];
    // 介護：外した年の範囲（続いている介護は、いまの年齢より前の分だけ）。大きな出費：名前と額（2026-10-31 B7-3・C7-3）
    if (x.ev === "care") return `${x.why === "past" && x.toAge > x.age ? `${x.age}〜${x.toAge}歳` : `${x.age}歳${x.why === "past" ? "" : "から"}`}の親の介護（${why}入れていません）`;
    // 旅行：「何歳まで」がいまの年齢以下（2026-10-31 A8-2）
    if (x.ev === "travel") return `毎年の旅行・レジャー（年${man(x.amount)}・${x.age}歳まで。いまの年齢で終わっているため入れていません）`;
    if (x.ev === "spend") return `${x.age}歳の大きな出費${x.label ? `「${x.label}」` : ""}（約${man(x.amount)}。${why}入れていません）`;
    // 転職・独立：仕事をやめる年齢以後（model/plan.js の changeLate。第12巡 B12-中2）
    if (x.ev === "change") return `${x.age}歳の転職・独立（仕事をやめる年齢（${x.retireAge}歳）以後のため入れていません）`;
    return `${x.age}歳の${SKIPPED_NAMES[x.ev]}（${why}入れていません）`;
  }
  const SURVIVOR_LABELS = { living: "遺族の生活費", housing: "住居費", homeLoan: "住宅ローンの残り", edu: "教育費", otherLoan: "住宅ローン以外の借入れの残り", funeral: "葬儀などの費用" };
  /** 万一の「内訳を見る」の、遺族の支出の行（足すと支出の合計 expenseLow〜expenseHigh になる）。
   * 入れていない費目（defaults.survivorItems の外）と、0円の借入れの行は出さない。生活費・教育費・住居費は0円でも出す。
   * 以前は教育費・住居費しかなく、住宅ローンの残り・住宅ローン以外の借入れの残り・葬儀などの費用が合計に入っているのに
   * 行が無かった（2026-10-31 第10巡 B10-3）
   * 戻り値：[{ key, label, low, high, lowShown, highShown }]（万円。low・high は計算の値、lowShown・highShown は画面に出す1万円単位の値） */
  function deathBreakdownRows(r) {
    const b = r.death.breakdown, p = b.parts;
    const dansin = r.detail && r.detail.loan ? r.detail.loan.dansin : null;
    const rows = [
      { key: "living", label: `${SURVIVOR_LABELS.living}（${r.death.years}年分）`, low: p.livingLow, high: p.livingHigh, always: true },
      { key: "edu", label: SURVIVOR_LABELS.edu, low: p.edu, high: p.edu, always: true },
      { key: "housing", label: SURVIVOR_LABELS.housing, low: p.housing, high: p.housing, always: true },
      { key: "homeLoan", label: `${SURVIVOR_LABELS.homeLoan}（${dansin === "unknown" ? "団信がわからないため" : "団信なし"}）`, low: p.homeLoan, high: p.homeLoan },
      { key: "otherLoan", label: SURVIVOR_LABELS.otherLoan, low: p.otherLoan, high: p.otherLoan },
      { key: "funeral", label: SURVIVOR_LABELS.funeral, low: p.funeral, high: p.funeral },
    ];
    const shown = rows.filter((x) => p.on.includes(x.key) && (x.always || x.high > 0));
    // 画面に出す値（lowShown・highShown）は1万円単位に丸めて、行の合計が表示の合計（man() と同じ丸めの expenseLow・expenseHigh）とちょうど同じになるようにする。
    // 下限と上限が同じ額の行（教育費など）は、両方の列で同じ値にする（「123万円〜124万円」と割れないように）。
    // そのうえで、どの行も両方の列で もとの値から1万円未満になるよう、同じ額の行の切り捨て／切り上げの組を選び、
    // 幅のある行（生活費）には残りを最大剰余法（apportion）で配る（jointShown）。
    // 以前は上限の列の端数を幅のある行だけが受け持ち、生活費の行がもとの値から1万円以上ずれることがあった（2026-10-31 第12巡 B12-軽1）。
    // 合計の一致・同じ額の行の一致・1万円未満の3つを同時に満たす組が無いときは、前の2つを優先する（1万円以上ずれる行が出る）。
    // その前の版は行ごとに丸め、足すと合計より1万円多いことがあった（第11巡 B11-1）
    const { lowInt, highInt } = jointShown(shown.map((x) => x.low), shown.map((x) => x.high), Math.round(b.expenseLow), Math.round(b.expenseHigh));
    return shown.map(({ key, label, low, high }, i) => ({ key, label, low, high, lowShown: lowInt[i], highShown: highInt[i] }));
  }
  /** 下限・上限の2列を整数に丸める（deathBreakdownRows）。下限と上限が同じ行は両方の列で同じ値。合計は totalLow・totalHigh。
   * まず同じ額の行を下限の列の最大剰余法の値にした組を試し、どれかの行が1以上ずれるときは、
   * 同じ額の行のうち整数でないものの切り捨て／切り上げの組（2^件数。行は6つまで）をすべて試し、幅のある行の残りを apportion で
   * 配ったときに、どの行も両方の列で もとの値から1未満になる組のうち、ずれの合計が最も小さい組を選ぶ。
   * そういう組が無ければ、同じ額の行は下限の列の最大剰余法の値にし、幅のある行が残りを受け持つ（合計の一致と同じ額の行の一致を優先） */
  function jointShown(lows, highs, totalLow, totalHigh) {
    const fixedIdx = lows.map((v, i) => i).filter((i) => lows[i] === highs[i]);
    const varIdx = lows.map((v, i) => i).filter((i) => lows[i] !== highs[i]);
    const build = (fixedVals) => {
      const fixedSum = fixedVals.reduce((t, v) => t + v, 0);
      if (!varIdx.length && (fixedSum !== totalLow || fixedSum !== totalHigh)) return null;
      const vl = apportion(varIdx.map((i) => lows[i]), totalLow - fixedSum), vh = apportion(varIdx.map((i) => highs[i]), totalHigh - fixedSum);
      const pick = (varVals) => lows.map((v, i) => (fixedIdx.includes(i) ? fixedVals[fixedIdx.indexOf(i)] : varVals[varIdx.indexOf(i)]));
      return { lowInt: pick(vl), highInt: pick(vh) };
    };
    const devOf = (o) => lows.reduce((t, v, i) => t + Math.abs(o.lowInt[i] - v) + Math.abs(o.highInt[i] - highs[i]), 0);
    const near = (o) => lows.every((v, i) => Math.abs(o.lowInt[i] - v) < 1 && Math.abs(o.highInt[i] - highs[i]) < 1);
    // まず、同じ額の行を下限の列の最大剰余法の値にした組（第11巡の配り方）。どの行も1未満ならそれを使う
    const lowAll = apportion(lows, totalLow);
    const first = build(fixedIdx.map((i) => lowAll[i]));
    if (first && near(first)) return first;
    const base = fixedIdx.map((i) => Math.floor(lows[i] + 1e-9));
    const frac = fixedIdx.map((i, j) => lows[i] - base[j] > 1e-9);
    let best = null, bestDev = Infinity;
    for (let mask = 0; mask < (1 << fixedIdx.length); mask++) {
      if (fixedIdx.some((i, j) => (mask >> j) & 1 && !frac[j])) continue;   // 整数の行は切り上げない
      const o = build(base.map((v, j) => v + ((mask >> j) & 1)));
      if (!o || !near(o)) continue;
      const d = devOf(o);
      if (d < bestDev - 1e-9) { best = o; bestDev = d; }
    }
    if (best) return best;
    // 3つを同時に満たせないとき：同じ額の行は下限の列の最大剰余法の値（合計の一致・同じ額の行の一致を優先）
    return first || { lowInt: lowAll, highInt: apportion(highs, totalHigh) };
  }
  /** 0以上の値の並びを整数に丸め、合計を total（整数）にそろえる（最大剰余法。どの値も もとの値から1未満）。
   * 並びが空なら空。端数の配り先は、端数の大きい順・同じなら前の行から */
  function apportion(values, total) {
    if (!values.length) return [];
    const out = values.map((v) => Math.floor(v + 1e-9));
    let left = total - out.reduce((t, v) => t + v, 0);
    const order = values.map((v, i) => [v - out[i], i]).sort((x, y) => y[0] - x[0] || x[1] - y[1]);
    for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length) { out[order[k][1]]++; left--; }
    for (let k = order.length - 1; left < 0 && order.length; k = (k - 1 + order.length) % order.length) {
      if (out[order[k][1]] > 0) { out[order[k][1]]--; left++; } else if (out.every((v) => v <= 0)) break;
    }
    return out;
  }
  const COST_KEYS = ["living", "homeLoan", "housing", "edu", "car", "loan", "other"];
  /** ⑤とPDFの「計算に使っている毎月の支出」に出す値（万円・0.1万円単位）。r.current から作る。
   * 行は0.1万円単位に最大剰余法（apportion）で配り、足すと表示の合計にちょうどなる（どの行も計算の値から0.1万円未満）。
   * 生活費の内訳も、表示した生活費の行に合わせて配る。手取りとの差額は、表示した手取り−表示した合計（表示どおりに引くと合う）。
   * 以前は行ごとに丸め、行を足すと表示の合計と0.1万円ずれ、差額も丸める前の値から出していた（2026-10-31 第12巡 B12-中3）
   * 戻り値：{ rows: {キー: 万円}, livingItems: [万円], total, income, diff } */
  function costShown(c) {
    const T = (v) => Math.round(v * TENTHS);
    const tenths = apportion(COST_KEYS.map((k) => c[k].monthly * TENTHS), T(c.total));
    const rows = {};
    COST_KEYS.forEach((k, i) => { rows[k] = tenths[i] / TENTHS; });
    const items = c.living.items.map((it) => it.monthly);
    const itemsSum = items.reduce((t, v) => t + v, 0);
    // 内訳の合計が生活費と同じとき（いつもそう作っている）だけ、表示した生活費の行に合わせて配る。違えば行ごとに丸める（足し合わせを装わない）
    const livingItems = Math.abs(itemsSum - c.living.monthly) < 1e-6
      ? apportion(items.map((v) => v * TENTHS), tenths[COST_KEYS.indexOf("living")]).map((v) => v / TENTHS)
      : items.map((v) => T(v) / TENTHS);
    return { rows, livingItems, total: T(c.total) / TENTHS, income: T(c.incomeMonthly) / TENTHS, diff: (T(c.incomeMonthly) - T(c.total)) / TENTHS };
  }
  function survivorExcluded() {
    const on = dataVal("defaults", "survivorItems");
    return Object.keys(SURVIVOR_LABELS).filter((k) => !on.includes(k)).map((k) => SURVIVOR_LABELS[k]);
  }
  /** 「この計算に入れていないこと」。ctx が null なら一般的な形（/about/ 用） */
  function notIncluded(ctx) {
    if (!ctx) return NOT_INCLUDED.map((d) => ({ id: d.id, dir: d.dir, text: d.general ? d.general() : d.text(null) })).filter((x) => x.text);
    const c = { r: ctx.r, a: ctx.a, D: ctx.r.detail };
    return NOT_INCLUDED.filter((d) => d.when(c)).map((d) => ({ dir: d.dir, text: d.text(c) }));
  }
  const NOT_INCLUDED_MARKS = { better: ["＋", "実際はもっと良くなる可能性"], worse: ["−", "実際はもっと厳しくなる可能性"], both: ["±", "どちらにも動く"] };
  const NOT_INCLUDED_LEGEND = "＋＝入れると結果が良くなる方向／−＝厳しくなる方向／±＝どちらにも動く";

  // ── 結果画面・PDF の説明に出す、前提の言い方 ──
  /** 定年の目安を過ぎて働いている人の「仕事をやめる年齢」が、仮置き（いまの年齢＋olderWorkYears）かどうか。
   * 計算の層（model/plan.js の detailDefaults）と同じ条件：くわしく入力の「あなたの収入」を直しておらず、いまの年齢が定年の既定以上 */
  const olderDefault = (r) => !(r.detail.set && r.detail.set.work) && Number(r.age) >= dataVal("defaults", "retireAge");
  /** 「定年（◯歳）」。仮置きでいまの年齢から何年か働く人は「仕事をやめる年齢（◯歳）」と言う（定年を過ぎた人に「定年◯歳」と書かない） */
  const stopText = (r) => `${olderDefault(r) ? "仕事をやめる年齢" : "定年"}（${Number(r.detail.work.retireAge)}歳）`;
  /** 収入をどう見込んでいるかを、1行で言う（a を渡すと、働いていない人にはそう言う） */
  function incomeAssumptionText(r, a) {
    if (a && a.work === "none") return "働いていない（給与の収入なし）";
    const mode = (r.detail.work && r.detail.work.growth) || "flat";
    const step = dataVal("estimate", "incomeGrowthStep");
    const cap = window.KSDATA && window.KSDATA.wage && window.KSDATA.wage.capAge;
    const ret = Number(r.detail.work.retireAge);
    if (mode !== "stat") return { flat: "いまのまま", up: `年${step}%ずつ上がる`, down: `年${step}%ずつ下がる` }[mode] || "いまのまま";
    if (!r.wageApplied) return "いまのまま（この働き方は賃金の統計の対象外です）";
    // 統計で増減させるのは capAge まで。そこから定年までは、その水準のまま（横ばい）。以前は「capAge より先は定年・再雇用」と書いていた
    if (r.wageCapped) return `いまのまま（統計で増減させるのは${cap}歳まで。${stopText(r)}まではいまの水準のまま）`;
    if (ret <= cap) return `年齢に応じて（統計の年齢別の賃金の形。${stopText(r)}まで）`;
    return `年齢に応じて（統計の年齢別の賃金の形。${cap}歳からは増減させず、${stopText(r)}まではその水準のまま）`;
  }
  /** 結果画面の「収入をどう計算しているか」の各段。**その人の計算で実際に使ったことだけを書く。**
   * 戻り値：[{ head, parts: [{ t: 文, b: 太字か }] }]。画面は parts をエスケープして並べるだけ（文は作らない）。
   * 以前は結果画面に同じことを別に書いていて、定年の目安を過ぎて働く人に「73歳で定年とし」と出ていた（2026-10-31 K1）。
   * a: かんたん入力の回答（働き方・年収の帯） */
  function incomeSteps(r, a) {
    const W = r.detail.work;
    const st = (head, ...parts) => ({ head, parts: parts.map((p) => (typeof p === "string" ? { t: p, b: false } : p)) });
    const B = (t) => ({ t, b: true });
    const out = [];
    const pensionStep = () => (Number(W.pension) > 0
      ? st("年金", `${pensionAge()}歳から、くわしく入力で入れた見込み額（年${man(Number(W.pension))}）を足します。`)
      : st("年金", `${pensionAge()}歳から、働き方と収入に応じた見込み額を足します。`));
    if (a.work === "none") {
      out.push(st("給与の収入", "働いていないと答えたため、給与の収入は入れていません。"));
      out.push(pensionStep());
      return out;
    }
    const band = Q.display(Q.byId.income, a);
    if (a.income === undefined || a.income === "unknown" || !band) {
      out.push(st("額面の年収", `年収は「わからない」と答えたため、一般的な目安の金額（${man(r.income)}）で仮に計算しています（結果の上の「仮の値」に出しています）。`));
    } else {
      out.push(st("額面の年収", `あなたが答えた帯の真ん中の金額から始めます（${band}）。`));
    }
    const stat = W.growth === "stat" && r.wageApplied && !r.wageCapped;
    out.push(st("年齢に応じた増減", incomeAssumptionText(r) + "。",
      ...(stat ? ["統計の年齢別の賃金を、", B("いまの年齢の水準に対する倍率"), "にして掛けています。", B("平均の金額に置きかえてはいません。")] : [])));
    // 育休・産休の減額（model/yearly.js の leaveFactor）。割合と年数はデータから。仮の値にも出している（2026-10-31 B6-5）
    if (a.work === "leave") {
      out.push(st("育休・産休", `いまの年から${dataVal("estimate", "leaveYears")}年は、育休・産休中として、給与を`,
        B(`元の年収の${Math.round(dataVal("estimate", "leaveRate") * PCT)}%`), "にして計算しています（仮の値。育児休業給付をならした目安です）。"));
    }
    out.push(st("額面から手取りへ", "税金と社会保険料を、年収に応じたおおよその割合で差し引きます（年収が高いほど手取りの割合は下がります）。個別の税額は計算できないため、",
      B("おおまかな割合"), "にとどめています。"));
    const retireAge = Number(W.retireAge), rehire = Number(W.rehire), until = Number(W.rehireUntil), age = Number(r.age);
    const rehireText = rehire > 0 ? `再雇用の設定（定年前の${rehire}%・${until}歳まで）で計算します。` : "給与の収入は入れていません（再雇用などで働く設定はありません）。";
    if (olderDefault(r)) {
      out.push(st("仕事をやめる年齢", `いまの年齢（${age}歳）が定年の目安（${dataVal("defaults", "retireAge")}歳）を過ぎているため、いまの年齢から${dataVal("estimate", "olderWorkYears")}年、`,
        B(`${retireAge}歳まで働く前提`), "で計算しています（仮の値）。違う場合は、くわしく入力の「仕事をやめる（定年の）年齢」を直してください。"));
    } else if (age >= retireAge) {
      out.push(st("定年より先", `定年の年齢の設定（${retireAge}歳）を、いまの年齢（${age}歳）がすでに過ぎているため、` +
        (rehire > 0 && until > age ? `再雇用の設定（定年前の${rehire}%・${until}歳まで）の分だけを収入に入れています。` : "給与の収入は入れていません。") +
        "いまも働いている場合は、くわしく入力の「仕事をやめる（定年の）年齢」を直してください。"));
    } else {
      out.push(st("定年より先", `${retireAge}歳で定年とし、そのあとは${rehireText}`));
    }
    out.push(pensionStep());
    return out;
  }
  /** くわしく入力の「今後の年収の見込み」の線の説明。年齢と割合は計算と同じデータから入れる（無ければその部分を言わない）。
   * 統計の形で増減させるのは capAge まで（model/yearly.js の wageAt）。そこから定年までは同じ水準、定年より先は再雇用の設定。
   * 上がる／下がるは、定年まで毎年同じ割合（model/yearly.js の incomeFactor） */
  function curveNoteText(retireAge) {
    const cap = window.KSDATA && window.KSDATA.wage && Number(window.KSDATA.wage.capAge);
    const A = AS_ && AS_.estimate && AS_.estimate.incomeGrowthStep;
    const step = A && Number.isFinite(Number(A.value)) ? A.value : null;
    const ret = Number(retireAge);
    return "線は、実際の計算と同じ動きで、いまの年齢から定年まで引いています。「年齢に応じて」は、厚生労働省の統計にある年齢ごとの賃金の動きに合わせて、いまの年収を増減させます" +
      (Number.isFinite(cap) && cap > 0 ? `（${cap}歳より先は増減させず、定年（${ret}歳）まではその水準のまま。定年より先は下の定年・再雇用の設定で計算します）。` : `（定年（${ret}歳）より先は、下の定年・再雇用の設定で計算します）。`) +
      (step !== null ? `上がる／下がる は、定年まで毎年${step}%です` : "");
  }
  /** くわしく入力の「物価の上昇を掛ける費目」の注記。どの設定でも据え置きのものを必ず言う（lumpSum と同じ事実） */
  const inflationScopeNote = () => "外した費目は、いまの金額のままで先まで計算します。"
    + "住宅ローンとその他の借入れの返済は、契約した額のまま変わらないので、ここには出していません。"
    + "マンションの修繕積立金は、別に値上がりの設定があります。"
    + "修繕・買い替え・住宅購入の頭金と諸費用・住み替えの費用などの一時金と、介護の費用は、入力した金額のままです（物価の上昇は掛けません）。";
  /** 働けなくなったときの計算の前提（休業中の手当があるかどうか） */
  const disabilityBasisText = (hasSick) => (hasSick ? "休業中の手当がある前提で計算しています。" : "休業中の手当がない働き方として計算しています。");
  /** 働けなくなったときの不足（PDF の「分野別の目安」の1行）。働いていない人は対象外 */
  function disabilityRowText(d) {
    if (d.na) return `対象外（${NOT_WORKING}、働けなくなっても収入は変わりません）`;
    return `毎月の支出（${spendScope(d.withHomeLoan)}）に対して、${sickGapText(d.first)}（${sickPeriodText()}まで）／${sickGapText(d.after)}（それ以降）`;
  }
  /** 働けなくなったときの、月あたりの不足の言い方。0なら「不足なし」（「月 0万円」と書かない。2026-10-31 B3-軽2） */
  function sickGapText(v) {
    if (!(v > 0)) return "不足なし";
    return Math.round(v * TENTHS) > 0 ? `不足 月 ${man1(v)}` : `不足 月 ${man1(1 / TENTHS)}未満`;
  }
  /** 貯蓄残高（グラフ・表・年の内訳）。丸めると0になる小さなマイナスは「1万円未満のマイナス」（minusText と同じ。2026-10-31 B3-軽5）。
   * p は推移の点（balance・raw） */
  function balanceText(p) {
    return p.raw < 0 && Math.round(p.balance) === 0 ? minusText(p.raw) : man(p.balance);
  }
  /** 表のセル（万円の数だけ）。丸めると0になる小さなマイナスは「−1未満」 */
  function balanceCell(p) {
    const v = Math.round(p.balance);
    if (p.raw < 0 && v === 0) return `−${ONE_MAN}未満`;
    return v < 0 ? "−" + Math.abs(v).toLocaleString("ja-JP") : v.toLocaleString("ja-JP");
  }
  const ONE_MAN = 1;   // 表のセルの単位（万円）の1
  /** 万一の内訳：遺族年金と配偶者の老齢年金が重なる年の数え方（2026-10-31 A3-1） */
  const pensionChoiceNote = () => `配偶者が老齢年金を受け取る年齢（${pensionAge()}歳）以上で、遺族年金も受け取れる年は、年金はひとりにつき一つが原則のため、遺族年金と配偶者自身の老齢年金のうち大きい方だけを数えています。`;
  /** 傷病手当金の期間（例：1年6か月） */
  const sickPeriodText = () => periodText(rule("sickMonths"));
  /** 計算する年齢の上限・年金の年齢 */
  const endAge = () => dataVal("estimate", "endAge");
  const pensionAge = () => dataVal("estimate", "pensionAge");

  // ── /assumptions/ の表 ──
  // 表の中身はすべてデータと計算の層（KSP・KSY）から作る。ページには文も数字も書かない。
  // セルは文字列（ページが esc する）か、文字列の並び（改行して並べる）
  // defaults にあるが、くわしく入力のはじめの値ではないもの。
  // loanMonthly・loanBalance は、「いまの返済額と残高」のはじめの値を借りたときの内容の仮置きから計算するようにしてから使っていない（2026-10-31 第10巡 B10-1）
  const NOT_DEFAULT_ROWS = ["livingDefault", "loanMonthly", "loanBalance"];
  const HOUSEHOLD_SAMPLES = [1, 2, 3, 4, 5];   // 「世帯の人数から置く金額」の表に並べる人数
  const SAMPLE_AGE = 40;                        // くわしく入力のはじめの値を見せるときの、仮の年齢（年齢で変わらない値だけを出す）
  const pct = (r) => `${Math.round(r * PCT)}%`;
  // 割合の並びを 0.1% 単位の整数（1000 で 100%）にする。合計が1000になるよう、切り捨てた端数の大きい順に配る
  function pctTenths(ratios) {
    const total = ratios.reduce((t, r) => t + r, 0);
    const raw = ratios.map((r) => (r / total) * PCT * TENTHS);
    const out = raw.map((v) => Math.floor(v + 1e-9));
    let left = PCT * TENTHS - out.reduce((t, v) => t + v, 0);
    raw.map((v, i) => [v - out[i], i]).sort((x, y) => y[0] - x[0] || x[1] - y[1]).forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
    return out;
  }
  /** /assumptions/ の住宅ローンの行。計算の仮置き（model/plan.js の loanOriginDefault）の規則をそのまま言う：
   * 完済が上限（loanEndAgeMax）を超える年齢の人は、返し始めてからの年数を延ばして上限で完済にする（答えられる年齢は上限より下）。
   * 文の年齢は計算の値（上限と、例の年齢の仮置きの残りの年数）から作る。
   * 以前は誰でも「返し始めて5年・残りの30年後」とだけ書き、56歳以上の仮置きが書かれていなかった（2026-10-31 第11巡 B11-3） */
  function loanSampleText(L, lv) {
    const P = window.KSP;
    const endMax = P.loanEndAgeMax();
    const rest = L.years - L.startedAgo;              // 例の年齢での残りの年数
    const from = endMax - rest + 1;                    // この年齢からは、残りの年数で数えると完済が上限を超える
    return `借入 ${man(L.borrowed)}・${L.years}年・金利${L.rate}%・返し始めて${L.startedAgo}年、として計算（返済 月 約${man1(lv.monthly)}。完済は残りの${rest}年後）・団信あり。`
      + `${from}歳以上の人は、完済が${endMax}歳を超えないよう、返し始めてからの年数を延ばして${endMax}歳で完済として計算`;
  }
  function assumptionTables() {
    const P = window.KSP;
    if (!P || !P.DUMMY) throw new Error("model/plan.js が読み込まれていません（/assumptions/ の表を作れません）");
    const C = P.DUMMY, E = C.edu;
    const A = AS_;
    const est = (k) => dataVal("estimate", k), def = (k) => dataVal("defaults", k);
    const T = {};

    // 生活費の内訳（例の金額は、生活費を答えていないときの初期値で示す）
    const sampleLiving = def("livingDefault");
    const sample = P.splitLiving(sampleLiving);
    T.livingSampleHead = `月${man(sampleLiving)}のときの例`;
    // 例の金額は 0.5万円単位で分けているので 0.1万円単位で出す（整数に丸めると合計が答えた金額と合わない）。
    // 割合は 0.1% 単位で、合計がちょうど100%になるように端数を配る（最大剰余法。どの行も もとの割合から0.1ポイント未満）。
    // 以前は整数の万円・整数の%で出し、合計が27万円・99%になっていた（2026-10-31 B5-5）
    const shares = pctTenths(P.LIVING_SHARES.map((it) => it.ratio));
    T.living = P.LIVING_SHARES.map((it, i) => [LIVING_LABELS[it.key], `${(shares[i] / TENTHS).toFixed(1)}%`, man1(sample[it.key])]);
    T.living.push(["合計", `${PCT.toFixed(1)}%`, man1(sampleLiving)]);
    // 世帯の人数から置く金額（計算と同じ式・同じデータ）
    const lb = est("livingBase"), lp = est("livingPerPerson"), lm = est("livingMax");
    // 0.1万円単位で出す（式の値が13.5万円のとき「14万円」と書かない。2026-10-31 B4-7）
    T.household = HOUSEHOLD_SAMPLES.map((n) => [`${n}人`, man1(Math.min(lm, lb + n * lp))]);
    T.householdNote = `共通の分 月${lb}万円に、世帯の人数×月${lp}万円を足して置きます（上限 月${lm}万円）。都道府県を答えると、家計調査の地方別の水準を掛けます。`;

    // 住まい・車・教育費（くわしく入力のはじめの値）
    const dflt = P.detailDefaults({ age: SAMPLE_AGE, kids: "no", home: "loan", homeType: "house", cars: 1 }, 0);
    const L = dflt.loan, lv = P.loanFromOrigin(L, SAMPLE_AGE);
    const car = dflt.cars[0];
    const kf = rule("schoolKinderFrom"), ef = rule("schoolElemFrom");
    T.home = [
      ["家賃（「わからない」のとき）", `回答の帯の真ん中。帯を選んでいなければ、お住まいの都道府県の民営借家の平均（答えていなければ 月${man(def("rentDefault"))}）`],
      ["住宅ローンの返済", loanSampleText(L, lv)],
      ["戸建ての修繕", `外壁・屋根の塗装 ${man(dflt.house.paintCost)}（${dflt.house.paintEvery}年ごと）／水回り・給湯器 ${man(dflt.house.waterCost)}（${dflt.house.waterEvery}年ごと）`],
      ["固定資産税など", `戸建て 年 ${man(dflt.house.tax)}／マンション 年 ${man(dflt.mansion.tax)}。マンションは管理費・修繕積立金 月 ${man(dflt.mansion.monthly)}（${rule("mansionRaiseEvery")}年ごとに ${dflt.mansion.raise}% 上がる前提）`],
      ["車", `維持費 年 ${man(car.upkeep)}／${car.interval}年ごとに ${man(car.budget)} で買い替え（乗るのをやめる${rule("carLastBuyGap")}年前からは買い替えない）`],
      [`教育費（幼稚園・${kf}〜${ef - 1}歳）`, `公立 年 ${man(E.kinder.public)}／私立 年 ${man(E.kinder.private)}（習い事などを含む${spanText(MONTHS)}分。文部科学省の調査の水準に合わせています）`],
      [`保育料（${BIRTH_AGE}〜${kf - 1}歳）`, "計算に入れていません（自治体と世帯の所得で決まるため）"],
      ["教育費（小学校）", `公立 年 ${man(E.elem.public)}／私立 年 ${man(E.elem.private)}`],
      ["教育費（中学）", `公立 年 ${man(E.junior.public)}／私立 年 ${man(E.junior.private)}`],
      ["教育費（高校）", `公立 年 ${man(E.high.public)}／私立 年 ${man(E.high.private)}`],
      ["教育費（大学）", `国公立 年 ${man(E.univ.national)}／私立文系 年 ${man(E.univ.privArts)}／私立理系 年 ${man(E.univ.privSci)}` + (E.entrance.privArts > 0
        ? `（入学時に別途 ${man(E.entrance.national)}〜${man(E.entrance.privArts)}）`
        : `（国公立は入学時に別途 ${man(E.entrance.national)}。私立は年額に入学金を含めています）`)],
      ["下宿・一人暮らしの上乗せ", `年 ${man(E.away)}`],
    ];

    // 公的な保障・年金
    const rates = est("takeHomeRate").map((x) => x[1]);
    T.public = [
      ["老齢基礎年金（概算）", `年 ${man(C.pensionBase)}。会社員・公務員は年収に応じて上乗せ（年収${man(C.pensionIncomeCap)}まで）`],
      ["受け取り開始の年齢", `${C.pensionAge}歳`],
      // 子が受け取るとき（配偶者がいない）は、1人目の子に加算が付かない（日本年金機構。2026-10-31 A2-1）
      ["遺族年金（子がいる間・概算）", `遺族基礎年金 年 ${man(C.survivorBase)}＋子ひとりにつき 年 ${man(C.survivorKidAdd)}（${rule("survivorKidAddMax")}人目まで。${rule("survivorKidAddMax") + 1}人目からは 年 ${man1(C.survivorKidAdd3)}）。子が受け取る場合（配偶者がいない場合）は、子の加算が子ひとりぶん少なくなります。会社員・公務員は年収に応じて遺族厚生年金を上乗せ（どれも末子が${rule("survivorKidUntil")}歳になるまで。それ以後も続く遺族厚生年金・中高齢寡婦加算は入れていません）。配偶者が${C.pensionAge}歳以上の年は、遺族年金と配偶者自身の老齢年金の大きい方だけを数えます（年金はひとりにつき一つが原則）`],
      ["休業中の手当（会社員・公務員）", `月収の約 ${pct(C.sickRate)}（${periodText(rule("sickMonths"))}まで）`],
      ["障害年金（概算）", `月 ${man1(C.disabilityMonthly)}。会社員・公務員は 月 ${man1(C.disabilityEmployeeAdd)} を上乗せ（${C.pensionAge}歳を過ぎてからは、老齢の年金を受け取っているものとして見込みません）`],
      ["児童手当（概算）", `年 ${man(C.childAllowance)}（${rule("childAllowanceU3Until")}歳未満は 年 ${man(C.childAllowanceU3)}。第${rule("childAllowanceThirdRank")}子以降は 年 ${man(C.childAllowanceThird)}。${rule("childAllowanceUntil")}歳になるまで。第${rule("childAllowanceThirdRank")}子は、${rule("childAllowanceCountUntil")}歳未満で、まだ学校を出て独立していない子から数えます）`],
      ["育休・産休中の収入", `元の年収の約 ${pct(C.leaveRate)}・${C.leaveYears}年間`],
      ["額面から手取りへ", `年収に応じて 約${Math.round(Math.min(...rates) * PCT)}〜${Math.round(Math.max(...rates) * PCT)}%（年収が高いほど手取りの割合は下がります）`],
      ["葬儀などの費用", man(C.funeral)],
      ["計算する年齢の上限", `${C.endAge}歳まで`],
    ];

    // 地域
    const R = window.KSDATA && window.KSDATA.region;
    if (R && R.regions) {
      const nat = R.national.total;
      T.region = Object.values(R.regions).sort((x, y) => y.total - x.total)
        .map((g) => [g.label, g.total.toLocaleString("ja-JP") + "円", (g.total / nat).toFixed(2) + "倍"])
        .concat([["全国", nat.toLocaleString("ja-JP") + "円", (nat / nat).toFixed(2) + "倍"]]);
      T.regionNote = (R.caveats || []).map((c) => c.text).join(" ");
    } else { T.region = []; T.regionNote = ""; }

    // 公的な統計が無い前提（estimate）。[年収, 割合] の並びは1行ずつ
    const estVal = (v) => (Array.isArray(v.value) && v.value.every(Array.isArray)
      ? v.value.map(([x, r]) => `${x}万円：${pct(r)}`)
      : `${v.value}${v.unit || ""}`);
    T.estimate = Object.entries((A && A.estimate) || {}).filter(([k]) => !k.startsWith("_"))
      // 「変えられる」とだけ書かず、どの入力欄で直すのかを言う（2026-10-31 K4）
      .map(([k, v]) => [v.label || k, estVal(v), v.basis || "", v.editable && v.input ? `くわしく入力の「${v.input}」で直せます` : "—"]);
    // 数え方の決まりと、判定の境目（rules）
    T.rules = Object.entries((A && A.rules) || {}).filter(([k]) => !k.startsWith("_"))
      .map(([k, v]) => [v.label || k, `${v.value}${v.unit || ""}`, v.basis || ""]);
    // くわしく入力のはじめの値（defaults）。根拠ではなく「直せます」という案内を出す表なので、根拠の欄は持たない
    const fmtVal = (v) => (Array.isArray(v.value)
      ? (v.value.every((x) => INF_LABELS[x]) ? infTargetNames(v.value).join("・")
        : v.value.every((x) => SURVIVOR_LABELS[x]) ? v.value.map((x) => SURVIVOR_LABELS[x]).join("・") : `${v.value.length}項目`)
      : `${v.value}${v.unit || ""}`);
    // 入力欄の無いもの（fixed：万一の費目・はじめの値の下限）は「直せます」の表に入れず、別の表で代わりに直せるところを言う（2026-10-31 K4）
    const defs = Object.entries((A && A.defaults) || {}).filter(([k]) => !k.startsWith("_"));
    // livingDefault は、くわしく入力のはじめの値ではない（生活費を答えていないときは、世帯の人数の式＝上の表で置く）。
    // 内訳の例の金額にだけ使うので、この表には出さない（2026-10-31 B3-軽7。以前は「生活費の初期値 25万円」と出ていた）
    T.defaults = defs.filter(([k, v]) => !v.fixed && !NOT_DEFAULT_ROWS.includes(k)).map(([k, v]) => [v.label || k, fmtVal(v)]);
    T.defaultsFixed = defs.filter(([, v]) => v.fixed).map(([k, v]) => [v.label || k, fmtVal(v), v.fixedNote || "画面からは変えられません"]);

    // 計算の前提（はじめの値は、新しく始めたときに入る値）
    const empty = KS.empty().assumptions;
    T.assume = [
      ["物価の上昇", `年 ${empty.inflation}%`, "変えられます（結果の「前提を変える」）"],
      ["物価の上昇を掛ける費目", infTargetNames(dataVal("defaults", "inflationTargets")).join("・") || "なし", "変えられます。住宅ローンとその他の借入れの返済には掛けません（契約した額のまま変わらないため）"],
      ["運用の利回り", `年 ${empty.ret}%（＝運用しない）`, "変えられます。天気の判定は常に運用しない場合で行います"],
      ["万一のときの遺族の生活費", `いまの ${empty.ratioLow}〜${empty.ratioHigh}%`, "変えられます。割合を掛けるのは生活費だけです"],
      ["老後の生活費", `現役のときの ${dflt.retire.ratio}%`, "変えられます（くわしく入力）"],
      ["収入の見込み", "年齢に応じて増減（厚生労働省の統計の形）", "変えられます（くわしく入力）"],
      ["定年・退職金", `${dflt.work.retireAge}歳・退職金なし（いまの年齢がそれ以上で働いている人は、いまの年齢＋${est("olderWorkYears")}年）`, "変えられます（くわしく入力）"],
    ];
    return T;
  }

  // ── 雨が無いときの案内（結果画面） ──
  // 物価の上昇率の選択肢（結果の「前提を変える」・くわしく入力と同じ）
  const INFLATION_CHOICES = [0, 1, 2];
  /** 「前提を厳しくして見る」の候補。済んだもの（入れた年金・見込んだ介護・入れた保障額・いまと同じ物価）は出さない。
   * 物価は、いまより1段高い値を勧める。a はかんたん入力の回答（保険に入っているか）。
   * 以前は済んだ項目も勧め、物価はいつも「年2%」だった（2026-10-31 B3-軽8）。戻り値：[[文, くわしく入力の節]] */
  function adviceFixes(r, a) {
    if (!a) throw new Error("adviceFixes にかんたん入力の回答がありません");
    const D = r.detail, out = [];
    if (!(Number(D.work && D.work.pension) > 0)) out.push(["年金の見込み額を入れる（ねんきん定期便）", "work"]);
    if (!infTargetNames(r.inflationOn || []).length) out.push(["物価の上昇を掛ける費目を選んで見る", "assumptions"]);
    else {
      const next = INFLATION_CHOICES.find((v) => v > Number(r.inflation));
      if (next !== undefined) out.push([`物価の上昇を年${next}%にして見る`, "assumptions"]);
    }
    if (!(D.care && D.care.on === "yes")) out.push(["親の介護を見込んでみる", "family"]);
    if (window.KSP && window.KSP.anyInsurance(a) && !(D.set && D.set.insurance)) out.push(["加入中の保険の保障額を入れる", "insurance"]);
    return out;
  }
  /** 雨が無いときの案内の見出しと書き出し。「くもりを埋めると」は、保障額の未入力でくもりにしているときだけ */
  function adviceLead(r, hasFixes) {
    const cloud = r.forecast.some((f) => f.weather === "cloud");
    const pending = r.forecast.some((f) => f.weather === "cloud" && f.pending);
    const head = cloud ? "いまのところ、大きな心配は見当たりません" : "いまの前提では、大きな心配は見当たりません";
    const tail = hasFixes ? (cloud ? "あわせて前提も確かめておくと、見通しがはっきりします。" : "そのぶん、前提を厳しくしたらどうなるかを見ておくのも手です。") : "";
    const lead = pending ? "保障額が未入力のくもりの項目は、くわしく入力で埋めると判定がはっきりします。" + tail
      : cloud ? "くもりの項目は、押すと理由を確かめられます。" + tail : tail;
    return { head, lead };
  }

  /** 計算の層の結果（Plan と要約）に、文を付ける */
  function describe(plan, model, m, sim0) {
    const tl = timelineOf(plan, model, m.lanes, sim0);
    return {
      provisional: window.KSP.provisional(plan).map(provisionalText),
      loanMismatch: loanMismatchText(plan.loanMismatch),
      todos: m.todos.map(todoText),
      insurance: m.insurance.map(insuranceText),
      ask: m.ask.map(askText),
      forecast: m.forecast.map((f) => forecastText(f, plan)),
      current: currentOf(plan, model, m.current),
      lanes: tl.lanes, events: tl.events, timeline: tl.timeline,
    };
  }

  window.KSX = {
    describe, provisionalText, loanMismatchText, paidOffText, homeSummaryNote, deathBreakdownRows, costShown, COST_KEYS, manRange, pctRange, eventText, timelineOf, todoText, insuranceText, askText, forecastText, insuranceNote,
    spanText, periodText, man1, approx, sickGapText, balanceText, pensionChoiceNote, balanceCell, adviceFixes, adviceLead, INFLATION_CHOICES, deathRange, retireGapText, retireBasisText, minusText, spendScope, NO_SHORT, incomeSteps, curveNoteText, inflationScopeNote, disabilityRowText, LIVING_LABELS, INF_LABELS, UNIV_NAMES, dataVal, rule, BIRTH_AGE, MONTHS, PCT,
    assumptionTables, notIncluded, NOT_INCLUDED_MARKS, NOT_INCLUDED_LEGEND, inflationTargetsText, incomeAssumptionText, disabilityBasisText, sickPeriodText, endAge, pensionAge,
  };
})();
