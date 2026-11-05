/* 年表のアイコン（線画のSVG）と凡例
 * 以前は calc.js にあった。見た目の部品なので、説明の層（view/）に置く
 */
(function () {
  "use strict";

  // 年表の出来事につけるアイコン。**線画のSVGで描く**（2026-10-03 利用者判断）。
  //
  // もともとは絵文字（🚗🏠🎓…）だったが、「見た目が生成AIっぽい」というご指摘を受けて
  // 飾りの絵文字を一掃したとき、**意味を担っていたここまで巻き添えで空にしてしまった**。
  // そのあと幾何記号（◎▲△■…）に置き換えたが、分かりにくいとのご指摘で描き直した。
  //
  // 絵文字に戻さないのは、字体が端末で変わり、白黒印刷でつぶれ、
  // 異体字セレクタの付け外しで白黒になる不具合が実際に起きたため。
  // 線画なら、画面でも紙でもどの端末でも同じ形になる。
  //
  // 色は、グラフの検証済みの配色に合わせつつ、細い線でも読めるよう
  // 白地に対して 3:1 以上のコントラストがあるものを選んでいる。
  // **色だけに頼らない**（形が全部違い、凡例に言葉も付く。CLAUDE.md §4）
  const IC = {
    work: "#2a78d6",    // 仕事・収入（グラフの青）
    edu: "#117a55",     // 教育（グラフの青緑を濃くしたもの）
    home: "#c04a1c",    // 住まい（グラフの橙を濃くしたもの）
    loan: "#8a4bd3",    // 住宅ローン（グラフの紫）
    car: "#8a6000",     // 車（グラフの黄を濃くしたもの）
    spend: "#b53f6c",   // 大きな出費（グラフのマゼンタを濃くしたもの）
    life: "#008300",    // 家族のこと（グラフの緑）
    alert: "#d03b3b",   // 注意
  };
  // 線画の共通の書き方。塗らず、線だけで描く
  const svg = (body) => '<svg class="ic" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" '
    + 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
    + body + '</svg>';

  const MARKS = [
    { key: "birth", label: "誕生", color: IC.life, shorts: ["誕生"],
      svg: svg('<circle cx="8" cy="4.9" r="2.3"/><path d="M4.3 13.4c0-2 1.7-3.6 3.7-3.6s3.7 1.6 3.7 3.6Z"/>') },
    { key: "school", label: "入学", color: IC.edu, shorts: ["小学校", "中学", "高校", "大学", "専門"],
      svg: svg('<path d="M1.6 6.4 8 3.4l6.4 3L8 9.4 1.6 6.4Z"/><path d="M4.6 7.9v3.4c0 .9 1.5 1.6 3.4 1.6s3.4-.7 3.4-1.6V7.9"/>') },
    { key: "leave", label: "独立", color: IC.life, shorts: ["独立"],
      svg: svg('<path d="M3.4 2.6v10.8"/><path d="M6.2 8h6.6"/><path d="m10.2 5.4 2.6 2.6-2.6 2.6"/>') },
    // 「退職」は、定年の目安を過ぎて働いている人の「仕事をやめる」（2026-10-31 B4-5）
    { key: "retire", label: "定年・退職", color: IC.work, shorts: ["定年", "退職"],
      svg: svg('<circle cx="8" cy="8" r="5.4"/><path d="M8 4.6V8l2.4 1.9"/>') },
    { key: "pension", label: "年金", color: IC.work, shorts: ["年金"],
      svg: svg('<circle cx="8" cy="8" r="5.4"/><path d="M5.9 5.2 8 8l2.1-2.8"/><path d="M8 8v2.9"/><path d="M6.1 9.1h3.8"/><path d="M6.1 10.6h3.8"/>') },
    { key: "payoff", label: "ローン完済", color: IC.loan, shorts: ["完済"],
      svg: svg('<path d="M2 7.3 8 2.5l6 4.8"/><path d="M3.6 8.5v4.9h8.8V8.5"/><path d="m5.9 10.9 1.5 1.5 2.9-3.1"/>') },
    { key: "work", label: "働き方", color: IC.work, kinds: ["work"],
      svg: svg('<rect x="2" y="5.4" width="12" height="8.2" rx="1.2"/><path d="M6 5.4V4.2c0-.7.5-1.2 1.2-1.2h1.6c.7 0 1.2.5 1.2 1.2v1.2"/><path d="M2 8.9h12"/>') },
    { key: "car", label: "車", color: IC.car, kinds: ["car"],
      svg: svg('<path d="M2.2 10.6V8.3l1.6-3.2c.2-.4.6-.7 1.1-.7h6.2c.5 0 .9.3 1.1.7l1.6 3.2v2.3"/><path d="M2.2 10.6h11.6"/><circle cx="4.9" cy="11.3" r="1.2"/><circle cx="11.1" cy="11.3" r="1.2"/>') },
    { key: "repair", label: "修繕", color: IC.home, kinds: ["repair"],
      svg: svg('<path d="M10.6 2.4a3.3 3.3 0 0 0-3.8 4.4L2.7 10.9a1.3 1.3 0 0 0 1.8 1.8l4.1-4.1a3.3 3.3 0 0 0 4.4-3.8l-1.9 1.9-1.8-.5-.5-1.8 1.9-1.9Z"/>') },
    { key: "home", label: "住まい", color: IC.home, kinds: ["home"],
      svg: svg('<path d="M2 7.4 8 2.6l6 4.8"/><path d="M3.6 8.6v4.8h8.8V8.6"/><path d="M6.6 13.4V10h2.8v3.4"/>') },
    { key: "care", label: "介護", color: IC.life, kinds: ["care"],
      svg: svg('<path d="M8 11.3S4.4 9.1 4.4 6.8a1.9 1.9 0 0 1 3.6-.8 1.9 1.9 0 0 1 3.6.8c0 2.3-3.6 4.5-3.6 4.5Z"/><path d="M3 12.7c1.5 1.1 3.2 1.6 5 1.6s3.5-.5 5-1.6"/>') },
    { key: "spend", label: "大きな出費", color: IC.spend, kinds: ["spend"],
      svg: svg('<path d="M14 2.6 2 7.3l4.5 1.9L14 2.6Z"/><path d="M6.5 9.2 8.5 13.8 14 2.6 6.5 9.2Z"/>') },
  ];
  // 年表に出る「貯蓄が底をつく見込み」だけは、出来事ではなく注意なので別に持つ
  const ALERT_MARK = { key: "alert", label: "注意", color: IC.alert,
    svg: svg('<path d="M8 2.4 14.6 13.6H1.4L8 2.4Z"/><path d="M8 6.6v3.2"/><path d="M8 11.6v.1"/>') };

  const MARK_BY_KEY = { alert: ALERT_MARK };
  const MARK_BY_KIND = {};
  const MARK_BY_SHORT = {};
  MARKS.forEach((m) => {
    MARK_BY_KEY[m.key] = m;
    (m.kinds || []).forEach((k) => { MARK_BY_KIND[k] = m; });
    (m.shorts || []).forEach((s) => { MARK_BY_SHORT[s] = m; });
  });
  // 当てはまるものが無い出来事（「その他」）用
  const OTHER_MARK = { key: "other", label: "そのほかの出来事", color: "#52514e",
    svg: svg('<circle cx="8" cy="8" r="2.6"/>') };
  MARK_BY_KEY.other = OTHER_MARK;

  /** 出来事1つに対応するアイコン（key・label・color・svg を持つ） */
  const markOf = (e) => MARK_BY_KIND[e.kind] || MARK_BY_SHORT[e.short] || OTHER_MARK;
  /** 年表の行が持つ key から、描くための中身を引く */
  const markByKey = (key) => MARK_BY_KEY[key] || OTHER_MARK;

  window.KSI = { MARKS, markOf, markByKey };
})();
