/* 質問定義（ステップ形式・チャット形式の共通の元データ）
 * type: multi（複数選択）/ single（単一選択）/ select（数値の選択）/ ages（子の年齢）
 * group: 同じ group の連続した質問は、ステップ形式では1画面にまとめる（チャットでは1問ずつ）
 * mid: 帯を選んだときに計算に使う値（万円）。null は「わからない」
 * react: チャット形式で、回答の直後に返す事前定義の一言
 */
(function () {
  "use strict";

  const UNKNOWN_REACT = "わからなくても大丈夫です。一般的な値で仮に計算し、結果に「仮の値」と表示します。どんな値を使うかは「わからないときに使う値」で見られます。";

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
      hint: "複数選べます。あとから変えられます。選んだところを結果の最初に案内し、「まずやること」も選んだ分野を先に出します。どの分野も計算はします。",
      why: "結果のはじめに、選んだことを見る場所への案内を出します。「まずやること」も、選んだ分野を先に並べます。計算する内容そのものは変わりません（どの分野も必ず計算します）。",
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
      id: "age", type: "select", required: true, group: "you",
      groupTitle: "あなたのこと",
      label: "あなたの年齢を教えてください",
      why: "年表を作り、定年や年金までの年数を計算するためです。",
      options: range(18, 80, "歳"),
    },
    {
      id: "work", type: "single", required: true, group: "you",
      label: "お仕事のしかたは？",
      why: "働き方によって、国の保障（休業中の手当・遺族年金・老後の年金）が大きく変わるためです。",
      options: WORK,
      react: (v) => WORK_REACT[v],
    },
    {
      id: "income", type: "single", required: true, group: "you",
      when: (a) => a.work !== "none",
      hint: (a) => (a.work === "leave" ? "育休・産休に入る前の年収を選んでください。" : a.work === "short" ? "時短勤務になったあとの、いまの年収を選んでください。" : null),
      label: "年収はどのくらいですか？（額面・税込）",
      why: "万一のときに失う収入や、国の保障の目安を計算するためです。",
      help: { title: "額面と手取りの違い", body: "額面は、税金や社会保険料が引かれる前の金額です。会社員の方は、源泉徴収票の「支払金額」が目安です。手取りは、口座に振り込まれる金額です。" },
      options: INCOME,
      react: (v) => (v === "unknown" ? UNKNOWN_REACT : null),
    },
    {
      id: "selfVary", type: "single", required: true, group: "you",
      label: "収入は年によって変わりますか？",
      why: "収入の波が大きいほど、急な出費に備える貯蓄を厚めに見る必要があるためです。",
      options: [{ v: "stable", label: "だいたい安定している" }, { v: "vary", label: "年によって差が大きい" }],
      when: (a) => a.work === "self",
      react: (v) => (v === "vary" ? "波が大きい場合は、急な出費への備えを「生活費の1年分」で判定します（会社員などは半年分）。" : null),
    },
    {
      id: "selfPension", type: "multi", required: false, group: "you",
      label: "上乗せの年金・退職金の代わりに、入っているものはありますか？（任意・複数選択）",
      hint: "自営業・フリーランスには会社の退職金や厚生年金がないぶん、自分で上乗せする制度があります。",
      why: "老後の見通しと、専門家に聞くことに反映するためです。",
      options: [
        { v: "kikin", label: "国民年金基金",
          help: { text: "国民年金に上乗せする、一生受け取れる年金です。掛金の上限は月6万8千円（iDeCoと合わせて）。加入後は途中でやめられないとされています。付加年金とは併用できません。" } },
        { v: "ideco", label: "iDeCo（個人型確定拠出年金）",
          help: { text: "自分で掛金を出して運用し、原則60歳以降に受け取ります。自営業の上限は月6万8千円（国民年金基金と合わせて）で、2026年12月からは7万5千円に上がる予定です。原則60歳まで引き出せません。", link: "/learn/ideco/" } },
        { v: "kyosai", label: "小規模企業共済",
          help: { text: "小さな事業主が、廃業・引退のときのために自分で積み立てる退職金の制度です。掛金は月1千円〜7万円で、全額が所得控除の対象。ただし20年未満でやめると、掛金の合計を下回るとされています。" } },
        { v: "fuka", label: "付加年金",
          help: { text: "国民年金の保険料に月400円を足して納めると、老齢基礎年金に「200円×納めた月数」が毎年上乗せされます。国民年金基金に入っている人は納められません。" } },
        { v: "none", label: "どれも入っていない" },
        { v: "unknown", label: "わからない" },
      ],
      when: (a) => a.work === "self",
    },
    {
      id: "spouse", type: "single", required: true, group: "family",
      groupTitle: "ご家族のこと",
      label: "配偶者・パートナーはいますか？",
      why: "万一のとき、ご家族に入る収入や年金を計算するためです。",
      options: [
        { v: "yes", label: "いる（結婚している）",
          help: { text: "婚姻の届出をしている場合です。遺族年金・健康保険の扶養・税の配偶者控除・相続のすべてで「配偶者」として扱われます。" } },
        { v: "partner", label: "いる（事実婚・パートナー）",
          help: { text: "届出はしていないが、事実上夫婦として暮らしている場合です。遺族年金・健康保険の扶養・国民年金の第3号は、届出をしている場合と同じ扱いとされています。一方で、税の配偶者控除と相続は対象外とされています（財産を残すには遺言などが要ります）。このサイトの計算では、この2つの違いは金額に反映していません。" } },
        { v: "no", label: "いない" },
      ],
      react: (v) => (v === "partner"
        ? "ありがとうございます。遺族年金や健康保険の扶養は、結婚している場合と同じ扱いとされています。税の配偶者控除と相続だけ扱いが違うので、結果の「専門家に聞くこと」に出します。" : null),
    },
    {
      id: "spouseAge", type: "select", required: true, group: "family",
      label: "その方の年齢",
      options: range(18, 80, "歳"),
      when: (a) => a.spouse === "yes" || a.spouse === "partner",
    },
    {
      id: "spouseWork", type: "single", required: true, group: "family",
      label: "その方のお仕事のしかた",
      options: WORK,
      when: (a) => a.spouse === "yes" || a.spouse === "partner",
    },
    {
      id: "spouseIncome", type: "single", required: true, group: "family",
      label: "その方の年収（額面・税込）",
      hint: (a) => (a.spouseWork === "leave" ? "育休・産休に入る前の年収を選んでください。" : null),
      options: [{ v: "fuyo", label: "扶養の範囲内", mid: 100 }].concat(INCOME),
      when: (a) => hasSpouse(a) && a.spouseWork !== "none",
      react: (v) => (v === "unknown" ? UNKNOWN_REACT : null),
    },
    {
      id: "kids", type: "single", required: true, group: "family",
      label: "お子さんはいますか？",
      why: "教育費がかかる時期と、万一のときに必要なお金を計算するためです。",
      options: [{ v: "yes", label: "いる" }, { v: "no", label: "いない" }, { v: "plan", label: "これから予定している" }],
    },
    {
      id: "kidsCount", type: "single", required: true, group: "family",
      label: "お子さんの人数",
      options: range(1, 5, "人"),
      when: (a) => a.kids === "yes",
    },
    {
      id: "kidsAges", type: "ages", required: true, group: "family",
      label: "お子さんの年齢",
      when: (a) => a.kids === "yes",
    },
    {
      id: "eduPlan", type: "single", required: true, group: "family",
      help: { title: "幼稚園・保育園はどう扱われますか？",
        body: "3〜5歳は幼稚園にかかるお金（習い事などを含む1年分の平均）を入れています。「すべて私立」を選ぶと幼稚園も私立で計算します。0〜2歳の保育料は、自治体と世帯の所得で決まるため入れていません。給食費・行事費・通園送迎費も入れていません。",
        link: "/assumptions/", linkText: "使っている金額を見る" },
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
      id: "kidPlanIn", type: "single", required: true, group: "family",
      label: "お子さんは、いつごろの予定ですか？",
      hint: "だいたいで大丈夫です。あとから変えられます。",
      why: "生まれる時期によって、教育費がかかる時期が変わるためです。",
      options: [{ v: 1, label: "1年以内" }, { v: 2, label: "2年後ごろ" }, { v: 3, label: "3年後ごろ" }, { v: 5, label: "5年後ごろ" }, { v: 0, label: "まだわからない（3年後で計算）" }],
      when: (a) => a.kids === "plan",
      react: () => "ありがとうございます。生まれたあとの教育費と児童手当を、年表に入れます。",
    },
    {
      id: "others", type: "single", required: true, group: "family",
      label: "ほかに、生活費をともにしている家族はいますか？",
      hint: "同居している親など。配偶者・パートナーとお子さんは、ここには含めません。",
      why: "人数によって生活費の目安が変わり、支出を平均と見比べるときの区分も変わるためです。",
      help: { title: "何が変わりますか？",
        body: "生活費を「わからない」と答えたときの目安と、支出を家計調査の平均と見比べるときの世帯区分に反映します。税の扶養控除や、健康保険の扶養に入れた場合の保険料の変化は、計算に入れていません。" },
      options: [
        { v: "0", label: "いない", mid: 0 },
        { v: "1", label: "1人", mid: 1 },
        { v: "2", label: "2人", mid: 2 },
        { v: "3", label: "3人以上", mid: 3 },
      ],
      react: (v) => (v !== "0"
        ? "ありがとうございます。生活費の目安と、平均と見比べるときの世帯の区分に反映します。" : null),
    },
    {
      id: "othersCare", type: "single", required: true, group: "family",
      label: "その方を、あなたの健康保険の扶養に入れていますか？",
      hint: "わからなければ「わからない」で大丈夫です。",
      why: "扶養に入れているかどうかで、万一のときに家族に残る負担の見方が変わるためです。",
      when: (a) => a.others && a.others !== "0",
      options: [
        { v: "yes", label: "入れている" },
        { v: "no", label: "入れていない" },
        { v: "unknown", label: "わからない" },
      ],
    },
    {
      id: "pref", type: "select", text: true, required: true, group: "home",
      groupTitle: "住まいと車",
      label: "お住まいの都道府県は？",
      hint: "家賃と生活費の目安に使います。市区町村は聞きません。",
      why: "家賃は地域で2倍以上ちがい、生活費も地域で差があるためです。",
      help: { title: "何に使いますか？",
        body: "家賃を「わからない」と答えたときに、その都道府県の民営借家の平均を使います。生活費を「わからない」と答えたときは、家計調査の地方別の水準で調整します。地域による差の大半は物価の差ではなく暮らし方の差なので、目安として見てください。",
        link: "/assumptions/", linkText: "使っている金額を見る" },
      options: [],   // 下で都道府県から作る
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
      id: "rent", type: "single", required: true, group: "home",
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
      id: "cars", type: "single", required: true, group: "home",
      label: "車を持っていますか？",
      why: "車の維持費と、買い替えのときの大きな出費を年表に入れるためです。",
      options: [{ v: 0, label: "持っていない" }, { v: 1, label: "1台" }, { v: 2, label: "2台以上" }],
      react: (v) => (Number(v) > 0 ? "買い替えの時期や予算は、結果画面の「くわしく入力」で設定できます。まずは一般的な目安（10年ごとに買い替え）で計算します。" : null),
    },
    {
      id: "otherLoan", type: "single", required: true, group: "money",
      groupTitle: "くらしとお金",
      // 住宅ローンがある人にだけ「以外」と言う。無い人には不自然なので聞き方を変える
      label: (a) => (a.home === "loan" || a.home === "buy"
        ? "住宅ローン以外の借入れはありますか？"
        : "返済中の借入れはありますか？"),
      hint: "奨学金・自動車ローン・教育ローン・カードローンなど",
      why: "毎月の返済は家計に長く効くため、見通しに入れる必要があるからです。",
      options: [{ v: "yes", label: "ある" }, { v: "no", label: "ない" }, { v: "unknown", label: "わからない" }],
      react: (v) => (v === "yes" ? "ありがとうございます。だいたいの残高だけ、次でうかがいます。" : null),
    },
    {
      id: "otherLoanLeft", type: "single", required: true, group: "money",
      label: "その借入れは、いまだいたいいくら残っていますか？",
      hint: "だいたいで大丈夫です。正確な額と毎月の返済額は、あとで「くわしく入力」から直せます。",
      why: "残高がわからないと0円で計算してしまい、万一のときの見通しがずれるからです。",
      when: (a) => a.otherLoan === "yes",
      options: [
        { v: "d1", label: "50万円未満", mid: 25 },
        { v: "d2", label: "50〜150万円", mid: 100 },
        { v: "d3", label: "150〜300万円", mid: 225 },
        { v: "d4", label: "300〜500万円", mid: 400 },
        { v: "d5", label: "500万円以上", mid: 700 },
        { v: "unknown", label: "わからない", mid: null },
      ],
    },
    {
      id: "insured", type: "multi", required: true, group: "money",
      label: "入っている保険は、どれですか？",
      hint: "会社名や商品名は聞きません。当てはまるものをすべて選んでください。",
      why: "保険は「何が起きたときのお金か」で役割が違うため、種類ごとに見通しへの反映を変えます。",
      options: [
        { v: "death", label: "亡くなったときに出る保険（生命保険・収入保障）", short: "死亡保障",
          help: { text: "亡くなったときに、遺された家族がお金を受け取る保険です。万一のときの不足額から差し引いて計算します。", link: "/learn/shibou-hoshou/" } },
        { v: "medical", label: "入院・手術のときに出る保険（医療保険・がん保険）", short: "医療・がん",
          help: { text: "入院や手術をしたときにお金が出る保険です。何も起きなければ、原則としてお金は戻りません（掛け捨ての場合）。公的な高額療養費で、すでにどこまで守られているかとあわせて考えます。", link: "/learn/iryou-hoken/" } },
        { v: "income", label: "働けなくなったときに出る保険（就業不能・所得補償）", short: "就業不能",
          help: { text: "病気やけがで働けない間、毎月お金が出る保険です。会社員は傷病手当金があるため、その後の期間をどう埋めるかが論点になります。", link: "/learn/hatarakenai-sonae/" } },
        { v: "savings", label: "貯まるタイプ（終身・学資・個人年金など）", short: "貯まるタイプ",
          help: { text: "解約したときや満期のときに、お金が戻ってくるタイプです。同じ保障なら払う額は大きくなります。いまの残高は「くわしく入力」の貯蓄には含めていません。" } },
        { v: "none", label: "入っていない" },
        { v: "unknown", label: "わからない" },
      ],
      react: (v) => (Array.isArray(v) && v.includes("death")
        ? "ありがとうございます。亡くなったときに出る額を、次でうかがいます。" : null),
    },
    {
      id: "insuredDeathBand", type: "single", required: true, group: "money",
      label: "亡くなったときに出る保険金は、だいたいいくらですか？",
      hint: "証券が手元になくても大丈夫です。わからなければ「わからない」を選んでください。",
      why: "この額がわからないと、万一のときに足りるかどうかを出せないからです。",
      when: (a) => Array.isArray(a.insured) && a.insured.includes("death"),
      options: [
        { v: "b1", label: "500万円くらい", mid: 500 },
        { v: "b2", label: "1,000万円くらい", mid: 1000 },
        { v: "b3", label: "2,000万円くらい", mid: 2000 },
        { v: "b4", label: "3,000万円以上", mid: 3500 },
        { v: "unknown", label: "わからない", mid: null },
      ],
    },
    {
      id: "living", type: "single", required: true, group: "money",
      label: "毎月の生活費はどのくらいですか？（住居費を除く）",
      why: "将来の支出と、働けなくなったときに不足するお金を計算するためです。",
      help: { title: "わからないときは", body: "食費・日用品・光熱費・通信費・保険料・お小遣いなどの合計です。家計簿アプリやカードの明細を見ると早くわかります。わからなければ「わからない」で大丈夫です。", link: "/assumptions/", linkText: "「わからない」のときに使う値と、生活費の内訳を見る" },
      options: [
        { v: "l1", label: "10万円未満", mid: 8 },
        { v: "l2", label: "10〜13万円", mid: 11.5 },
        { v: "l3", label: "13〜15万円", mid: 14 },
        { v: "l4", label: "15〜18万円", mid: 16.5 },
        { v: "l5", label: "18〜21万円", mid: 19.5 },
        { v: "l6", label: "21〜25万円", mid: 23 },
        { v: "l7", label: "25〜30万円", mid: 27.5 },
        { v: "l8", label: "30〜40万円", mid: 35 },
        { v: "l9", label: "40万円以上", mid: 45 },
        { v: "unknown", label: "わからない", mid: null },
      ],
      react: (v) => (v === "unknown" ? UNKNOWN_REACT : null),
    },
    {
      id: "savings", type: "single", required: true, group: "money",
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
      id: "worries", type: "multi", required: false, group: "money",
      label: "気になっていることはありますか？（任意）",
      hint: "当てはまるものがなければ、そのまま進んでください。選んだものは、結果とPDFの「専門家に聞くこと」に1行ずつ足されます。",
      why: "選んだものが、結果とPDFの「専門家に聞くこと」に1行ずつ足されます。計算する金額は変わりません。",
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

  // 都道府県の選択肢は data/region.json から作る（コードに直書きしない）
  (function fillPref() {
    const q = byId.pref;
    if (!q) return;
    const R = window.KSDATA && window.KSDATA.region;
    const names = R && R.prefToRegion ? Object.keys(R.prefToRegion) : [];
    q.options = names.map((n) => ({ v: n, label: n })).concat([{ v: "unknown", label: "答えない" }]);
    if (!names.length) { q.required = false; q.when = () => false; }   // データが無いときは聞かない
  })();


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
      // 選択肢にない値（古い保存データなど）は、そのまま出さずに捨てる
      const labels = v.map((x) => { const o = option(q, x); return o ? (o.short || o.label) : null; }).filter(Boolean);
      return labels.length ? labels.join("、") : "特になし";
    }
    if (q.type === "ages") return (v || []).map((x) => x + "歳").join("・");
    return option(q, v)?.label ?? "";
  }

  // 配偶者・パートナーがいるか（事実婚も含む）
  function hasSpouse(answers) {
    return answers.spouse === "yes" || answers.spouse === "partner";
  }

  // 質問文は、回答によって変わることがある（例：住宅ローンの有無で聞き方を変える）
  function labelOf(question, answers) {
    return typeof question.label === "function" ? question.label(answers || {}) : question.label;
  }

  function mid(id, answers) {
    const o = option(byId[id], answers[id]);
    return o ? o.mid : undefined;
  }

  window.KSQ = { QUESTIONS, byId, visible, screens, isAnswered, display, option, mid, labelOf, hasSpouse, UNKNOWN_REACT };
})();
