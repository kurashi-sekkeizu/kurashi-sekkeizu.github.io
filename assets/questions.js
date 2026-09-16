/* 質問定義（ステップ形式・チャット形式の共通の元データ）
 * type: multi（複数選択）/ single（単一選択）/ select（数値の選択）/ ages（子の年齢）
 * group: 同じ group の連続した質問は、ステップ形式では1画面にまとめる（チャットでは1問ずつ）
 * mid: 帯を選んだときに計算に使う値（万円）。null は「わからない」
 * react: チャット形式で、回答の直後に返す事前定義の一言
 */
(function () {
  "use strict";

  const UNKNOWN_REACT = "わからなくても大丈夫です。一般的な値で仮に計算し、結果に「仮の値」と表示します。";

  const WORK = [
    { v: "employee", label: "会社員" },
    { v: "civil", label: "公務員" },
    { v: "self", label: "自営業・フリーランス" },
    { v: "part", label: "パート・アルバイト" },
    { v: "leave", label: "育休・産休中" },
    { v: "short", label: "時短勤務" },
    { v: "none", label: "働いていない" },
  ];
  const WORK_REACT = {
    employee: "会社員の方は、病気やけがで長く休んだとき、健康保険から手当が出る仕組みがあります。",
    civil: "公務員の方も、共済組合から休業中の手当が出る仕組みがあります。",
    self: "自営業・フリーランスの方は、会社員に比べて国の保障が薄い部分があります。そのぶん、自分で備える範囲を結果で確認できます。",
    part: "働き方によって、加入している健康保険や年金が変わります。",
    leave: "育休・産休中ですね。いまは収入が減っている前提（育休前の年収の約5割・2年間）で計算し、そのあとは元に戻る形にします。",
    short: "時短勤務ですね。いまの年収（時短後の金額）でお答えください。",
    none: "わかりました。年収の質問は飛ばします。",
  };
  const INCOME = [
    { v: "i1", label: "200万円未満", mid: 150 },
    { v: "i2", label: "200〜400万円", mid: 300 },
    { v: "i3", label: "400〜600万円", mid: 500 },
    { v: "i4", label: "600〜800万円", mid: 700 },
    { v: "i5", label: "800〜1,000万円", mid: 900 },
    { v: "i6", label: "1,000万円以上", mid: 1200 },
    { v: "unknown", label: "わからない", mid: null },
  ];

  const range = (from, to, unit) => Array.from({ length: to - from + 1 }, (_, i) => ({ v: from + i, label: from + i + unit }));

  const QUESTIONS = [
    {
      id: "fields", type: "multi", required: true,
      label: "今日は、どのことを考えたいですか？",
      hint: "複数選べます。あとから変えられます。",
      why: "選んだ分野を中心に結果をまとめます。",
      options: [
        { v: "insurance", label: "保険" },
        { v: "invest", label: "貯蓄・投資（NISA・iDeCo）" },
        { v: "home", label: "住まい" },
        { v: "edu", label: "子どもの教育費" },
        { v: "retire", label: "老後のお金" },
        { v: "fixed", label: "毎月の固定費" },
        { v: "all", label: "ぜんぶ" },
      ],
      react: () => "ありがとうございます。まず、あなたのことを教えてください。",
    },
    {
      id: "age", type: "select", required: true,
      label: "あなたの年齢を教えてください",
      why: "年表を作り、定年や年金までの年数を計算するためです。",
      options: range(18, 80, "歳"),
    },
    {
      id: "work", type: "single", required: true,
      label: "お仕事のしかたは？",
      why: "働き方によって、国の保障（休業中の手当・遺族年金・老後の年金）が大きく変わるためです。",
      options: WORK,
      react: (v) => WORK_REACT[v],
    },
    {
      id: "income", type: "single", required: true,
      when: (a) => a.work !== "none",
      hint: (a) => (a.work === "leave" ? "育休・産休に入る前の年収を選んでください。" : a.work === "short" ? "時短勤務になったあとの、いまの年収を選んでください。" : null),
      label: "年収はどのくらいですか？（額面・税込）",
      why: "万一のときに失う収入や、国の保障の目安を計算するためです。",
      help: { title: "額面と手取りの違い", body: "額面は、税金や社会保険料が引かれる前の金額です。会社員の方は、源泉徴収票の「支払金額」が目安です。手取りは、口座に振り込まれる金額です。" },
      options: INCOME,
      react: (v) => (v === "unknown" ? UNKNOWN_REACT : null),
    },
    {
      id: "spouse", type: "single", required: true,
      label: "配偶者・パートナーはいますか？",
      why: "万一のとき、ご家族に入る収入や年金を計算するためです。",
      options: [{ v: "yes", label: "いる" }, { v: "no", label: "いない" }],
    },
    {
      id: "spouseAge", type: "select", required: true, group: "spouse",
      groupTitle: "配偶者・パートナーについて教えてください",
      label: "その方の年齢",
      options: range(18, 80, "歳"),
      when: (a) => a.spouse === "yes",
    },
    {
      id: "spouseWork", type: "single", required: true, group: "spouse",
      label: "その方のお仕事のしかた",
      options: WORK,
      when: (a) => a.spouse === "yes",
    },
    {
      id: "spouseIncome", type: "single", required: true, group: "spouse",
      label: "その方の年収（額面・税込）",
      hint: (a) => (a.spouseWork === "leave" ? "育休・産休に入る前の年収を選んでください。" : null),
      options: [{ v: "fuyo", label: "扶養の範囲内", mid: 100 }].concat(INCOME),
      when: (a) => a.spouse === "yes" && a.spouseWork !== "none",
      react: (v) => (v === "unknown" ? UNKNOWN_REACT : null),
    },
    {
      id: "kids", type: "single", required: true,
      label: "お子さんはいますか？",
      why: "教育費がかかる時期と、万一のときに必要なお金を計算するためです。",
      options: [{ v: "yes", label: "いる" }, { v: "no", label: "いない" }, { v: "plan", label: "これから予定している" }],
    },
    {
      id: "kidsCount", type: "single", required: true, group: "kids",
      groupTitle: "お子さんについて教えてください",
      label: "お子さんの人数",
      options: range(1, 5, "人"),
      when: (a) => a.kids === "yes",
    },
    {
      id: "kidsAges", type: "ages", required: true, group: "kids",
      label: "お子さんの年齢",
      when: (a) => a.kids === "yes",
    },
    {
      id: "eduPlan", type: "single", required: true, group: "kids",
      label: "進学の方針（おおまかに）",
      hint: "お子さんごとの細かい設定は、結果画面の「くわしく入力」でできます。",
      why: "公立か私立か、大学に行くかで、教育費は大きく変わるためです。",
      options: [
        { v: "public", label: "すべて公立（大学は国公立）" },
        { v: "univPrivate", label: "高校まで公立、大学は私立" },
        { v: "highPrivate", label: "高校から私立" },
        { v: "juniorPrivate", label: "中学から私立" },
        { v: "allPrivate", label: "小学校から私立" },
        { v: "noUniv", label: "高校まで（大学は考えていない）" },
        { v: "unknown", label: "まだ決めていない" },
      ],
      when: (a) => a.kids === "yes",
      react: (v) => (v === "unknown" ? "まだ決めていなくて大丈夫です。「高校まで公立、大学は私立」で仮に計算します。" : "お子さんの年齢と進学の方針から、教育費がかかる時期を年表にします。"),
    },
    {
      id: "kidPlanIn", type: "single", required: true,
      label: "お子さんは、いつごろの予定ですか？",
      hint: "だいたいで大丈夫です。あとから変えられます。",
      why: "生まれる時期によって、教育費がかかる時期が変わるためです。",
      options: [{ v: 1, label: "1年以内" }, { v: 2, label: "2年後ごろ" }, { v: 3, label: "3年後ごろ" }, { v: 5, label: "5年後ごろ" }, { v: 0, label: "まだわからない（3年後で計算）" }],
      when: (a) => a.kids === "plan",
      react: () => "ありがとうございます。生まれたあとの教育費と児童手当を、年表に入れます。",
    },
    {
      id: "home", type: "single", required: true, group: "home",
      label: "お住まいは？",
      why: "住宅ローンや家賃は、将来の支出と万一のときに必要なお金に大きく関わるためです。",
      options: [
        { v: "loan", label: "持ち家（ローン返済中）" },
        { v: "own", label: "持ち家（返済なし）" },
        { v: "rent", label: "賃貸" },
        { v: "family", label: "実家など" },
        { v: "plan", label: "購入を考えている" },
      ],
      react: (v) => (v === "loan" ? "住宅ローンを返済中なんですね。団体信用生命保険（団信）に入っているかどうかで、万一のときに必要なお金が変わります。" : null),
    },
    {
      id: "homeType", type: "single", required: true, group: "home",
      label: "戸建てですか、マンションですか？",
      why: "戸建ては外壁・屋根の塗装などの修繕費、マンションは修繕積立金・管理費がかかるためです。",
      options: [{ v: "house", label: "戸建て" }, { v: "mansion", label: "マンション" }],
      when: (a) => a.home === "loan" || a.home === "own",
      react: (v) => (v === "house" ? "戸建ては、10〜15年ごとに外壁・屋根の塗装や水回りの交換がかかります。一般的な目安で年表に入れます。" : "マンションは、修繕積立金が年数とともに上がることがあります。一般的な目安で計算します。"),
    },
    {
      id: "rent", type: "single", required: true,
      label: "毎月の家賃はいくらですか？（管理費を含む）",
      why: "家賃は毎月の支出のうち大きな割合を占め、将来の見通しを大きく変えるためです。",
      options: [
        { v: "r1", label: "5万円未満", mid: 4 },
        { v: "r2", label: "5〜8万円", mid: 6.5 },
        { v: "r3", label: "8〜11万円", mid: 9.5 },
        { v: "r4", label: "11〜15万円", mid: 13 },
        { v: "r5", label: "15万円以上", mid: 17 },
        { v: "unknown", label: "わからない", mid: null },
      ],
      when: (a) => a.home === "rent" || a.home === "plan",
      react: (v) => (v === "unknown" ? UNKNOWN_REACT : null),
    },
    {
      id: "cars", type: "single", required: true,
      label: "車を持っていますか？",
      why: "車の維持費と、買い替えのときの大きな出費を年表に入れるためです。",
      options: [{ v: 0, label: "持っていない" }, { v: 1, label: "1台" }, { v: 2, label: "2台以上" }],
      react: (v) => (Number(v) > 0 ? "買い替えの時期や予算は、結果画面の「くわしく入力」で設定できます。まずは一般的な目安（10年ごとに買い替え）で計算します。" : null),
    },
    {
      id: "insured", type: "single", required: true,
      label: "生命保険や医療保険に入っていますか？",
      hint: "会社名や商品名は聞きません。保障額は、結果画面の「くわしく入力」で設定できます。",
      why: "万一のときや働けなくなったときの見通しに、加入中の保険を反映するためです。",
      options: [{ v: "yes", label: "入っている" }, { v: "no", label: "入っていない" }, { v: "unknown", label: "わからない" }],
      react: (v) => (v === "yes" ? "ありがとうございます。保障額を入れると、万一のときの見通しに反映できます（くわしく入力で設定）。" : null),
    },
    {
      id: "living", type: "single", required: true,
      label: "毎月の生活費はどのくらいですか？（住居費を除く）",
      why: "将来の支出と、働けなくなったときに不足するお金を計算するためです。",
      help: { title: "わからないときは", body: "食費・日用品・光熱費・通信費・保険料・お小遣いなどの合計です。家計簿アプリやカードの明細を見ると早くわかります。わからなければ「わからない」で大丈夫です。" },
      options: [
        { v: "l1", label: "15万円未満", mid: 12 },
        { v: "l2", label: "15〜20万円", mid: 17.5 },
        { v: "l3", label: "20〜25万円", mid: 22.5 },
        { v: "l4", label: "25〜30万円", mid: 27.5 },
        { v: "l5", label: "30〜40万円", mid: 35 },
        { v: "l6", label: "40万円以上", mid: 45 },
        { v: "unknown", label: "わからない", mid: null },
      ],
      react: (v) => (v === "unknown" ? UNKNOWN_REACT : null),
    },
    {
      id: "savings", type: "single", required: true,
      label: "貯蓄はどのくらいありますか？（投資を含む）",
      why: "急な出費や老後にどのくらい備えがあるかを計算するためです。",
      options: [
        { v: "s1", label: "100万円未満", mid: 50 },
        { v: "s2", label: "100〜300万円", mid: 200 },
        { v: "s3", label: "300〜500万円", mid: 400 },
        { v: "s4", label: "500〜1,000万円", mid: 750 },
        { v: "s5", label: "1,000〜2,000万円", mid: 1500 },
        { v: "s6", label: "2,000万円以上", mid: 2500 },
        { v: "unknown", label: "わからない", mid: null },
      ],
      react: (v) => (v === "unknown" ? UNKNOWN_REACT : null),
    },
    {
      id: "worries", type: "multi", required: false,
      label: "気になっていることはありますか？（任意）",
      hint: "当てはまるものがなければ、そのまま進んでください。",
      why: "結果の「専門家に聞くこと」に反映します。",
      options: [
        { v: "death", label: "万一のとき家族が困らないか" },
        { v: "sick", label: "病気で働けなくなったら" },
        { v: "edu", label: "教育費が足りるか" },
        { v: "loan", label: "住宅ローンが重い" },
        { v: "retire", label: "老後が不安" },
        { v: "invest", label: "投資を始めるべきか迷う" },
        { v: "cash", label: "毎月お金が残らない" },
      ],
    },
  ];

  const byId = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

  function visible(answers) {
    return QUESTIONS.filter((q) => !q.when || q.when(answers));
  }

  // ステップ形式の画面単位（連続する同じ group を1画面に）
  function screens(answers) {
    const out = [];
    visible(answers).forEach((q) => {
      const last = out[out.length - 1];
      if (q.group && last && last[0].group === q.group) last.push(q);
      else out.push([q]);
    });
    return out;
  }

  function isAnswered(q, answers) {
    const v = answers[q.id];
    if (q.type === "multi") return Array.isArray(v) && (v.length > 0 || !q.required);
    if (q.type === "ages") {
      const n = Number(answers.kidsCount) || 0;
      return Array.isArray(v) && v.length === n && v.every((x) => x !== null && x !== "" && x !== undefined);
    }
    return v !== undefined && v !== null && v !== "";
  }

  function option(q, v) {
    return (q.options || []).find((o) => String(o.v) === String(v));
  }

  function display(q, answers) {
    const v = answers[q.id];
    if (q.type === "multi") {
      if (!Array.isArray(v) || !v.length) return "特になし";
      return v.map((x) => option(q, x)?.label ?? x).join("、");
    }
    if (q.type === "ages") return (v || []).map((x) => x + "歳").join("・");
    return option(q, v)?.label ?? "";
  }

  function mid(id, answers) {
    const o = option(byId[id], answers[id]);
    return o ? o.mid : undefined;
  }

  window.KSQ = { QUESTIONS, byId, visible, screens, isAnswered, display, option, mid, UNKNOWN_REACT };
})();
