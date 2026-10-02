/* 1問ずつの画面の「並び」を作る。
 *
 * **画面に出さず、ここだけで組み立てる。** 以前は step/index.html の中に書いていたため、
 * 自動テストから触れず、不具合を手で見つけるしかなかった
 * （くわしくで始めたのに進捗が「1／5」になる、を利用者に指摘されて気づいた。2026-10-03）。
 *
 * かんたん … 質問の画面だけ
 * くわしく … そのまとまりの質問が終わったところで、詳しい条件を**独立した画面**として挟む
 */
(function () {
  "use strict";

  // まとまりごとに、どの「詳しい条件」を出すか。
  // what は、まだ出せないときに「このあと何を入れられるか」を伝えるための言葉
  const DETAIL_OF_GROUP = {
    you: { keys: ["work"], what: "収入の見通し・定年と退職金・年金の見込み" },
    family: { keys: ["family", "spouseWork", "edu"], what: "子どもの進路・配偶者の働き方・教育費" },
    home: { keys: ["home", "car", "loans"], what: "住宅ローンの借入額・期間・金利、修繕、車の買い替え" },
    money: { keys: ["living", "assets", "insurance", "spend", "assumptions"], what: "生活費の内訳・貯蓄と投資・保険・物価と利回りの前提" },
  };

  /** 画面の並びを作る。d.meta.depth が "detail" のときだけ、詳しい条件の画面を挟む */
  function build(d) {
    const A = d.answers;
    const detailMode = d.meta.depth === "detail";
    const qs = KSQ.screens(A);
    const out = [];
    qs.forEach((s, i) => {
      out.push({ kind: "q", id: s[0].id, qs: s, group: s[0].group, title: s[0].groupTitle });
      if (!detailMode) return;
      const g = DETAIL_OF_GROUP[s[0].group];
      // そのまとまりの最後の質問画面のうしろにだけ挟む
      if (!g || (qs[i + 1] && qs[i + 1][0].group === s[0].group)) return;
      // **必須が埋まっているかで出し分けない。** 以前は「埋まるまで挟まない」としていたため、
      // くわしくで始めた直後の進捗が「1／5」（かんたんと同じ数）になり、
      // 答えるたびに 5→6→9→11→16 と分母が増えていた。
      // 節の中身は描くときに作り直すので、ここで先に数えても差し支えない
      KSD.build(d, { only: g.keys, hideAnswers: true }).sections().forEach((sec) => {
        out.push({ kind: "detail", id: "detail:" + sec.key, keys: [sec.key], title: sec.title, group: s[0].group });
      });
    });
    return out;
  }

  /** チャットの「並び」。**1問ずつの画面とまったく同じ順番**を、1問単位にほどいたもの。
   *
   *  かんたんの質問を全部聞いてから詳しい条件をまとめて聞くと、
   *  「お仕事のしかたは？」と「仕事をやめる年齢」が遠く離れてしまう。
   *  build() が作る画面の並び（まとまりの質問 → そのまとまりの詳しい条件）を
   *  そのままほどけば、関連する質問が隣り合う（2026-10-03 利用者の指摘）。
   */
  function chatFlow(d) {
    const out = [];
    build(d).forEach((e) => {
      if (e.kind === "q") {
        e.qs.forEach((q) => out.push({ kind: "q", id: q.id, q: q, group: e.group, groupTitle: e.title }));
        return;
      }
      KSD.build(d, { only: e.keys, hideAnswers: true }).chatFields(e.keys[0]).forEach((f) => {
        out.push(Object.assign({ kind: "detail", section: e.keys[0], sectionTitle: e.title, group: e.group }, f));
      });
    });
    // 同じ見出しの欄が流れの中に何度も出るもの（「予定」が転職・繰り上げ返済・建て替え・
    // 住み替えで4回）は、それだけ聞かれても何のことか分からない。小見出しを付けて区別する
    const count = {};
    out.forEach((it) => { if (it.kind === "detail") count[it.label] = (count[it.label] || 0) + 1; });
    out.forEach((it) => {
      if (it.kind !== "detail") return;
      it.ask = (count[it.label] > 1 && it.heading && it.heading !== it.label)
        ? it.heading + "の" + it.label : it.label;
    });
    return out;
  }

  /** くわしくで聞く「詳しい条件」の節を、質問の順に並べたもの（まとまりの順 → 節の順） */
  function detailSections(d) {
    const out = [];
    Object.values(DETAIL_OF_GROUP).forEach((g) => {
      KSD.build(d, { only: g.keys, hideAnswers: true }).sections().forEach((sec) => out.push(sec));
    });
    return out;
  }

  /** チャット用：詳しい条件を「1問ずつ」に切り分けて、節をまたいで一列に並べる。
   *  1問ずつの画面と同じ定義（detail.js の SECTIONS）から作る（CLAUDE.md §7）。 */
  function detailQuestions(d) {
    // **かんたんでは1問も出さない。** 呼ぶ側の条件分岐に任せると、
    // どこか1か所で忘れた瞬間に、かんたんの人に詳しい条件が出てしまう
    if (d.meta.depth !== "detail") return [];
    const out = [];
    detailSections(d).forEach((sec) => {
      KSD.build(d, { only: [sec.key], hideAnswers: true }).chatFields(sec.key)
        .forEach((f) => out.push(Object.assign({ section: sec.key, sectionTitle: sec.title }, f)));
    });
    return out;
  }

  window.KSF = { build, DETAIL_OF_GROUP, chatFlow, detailSections, detailQuestions };
})();
