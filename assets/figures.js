/* 数字と出典を1か所で管理する仕組み（記事・計算の両方から使う）
 * ⚠ プロトタイプの値はすべてダミーです。本番では、公的機関の公表値と確認日をここに入れます。
 * 使い方: 記事のHTMLに <span data-fig="izoku.kiso"></span> と書くと、値＋出典の注番号に置き換わります。
 */
(function () {
  "use strict";

  const FIGURES = {
    "izoku.kiso": { value: "年 ○○万円（ダミー）", note: "子のある配偶者が受け取る場合の基本の額", src: "nenkin" },
    "izoku.kasan": { value: "○○万円（ダミー）", note: "子1人あたりの加算", src: "nenkin" },
    "izoku.until": { value: "18歳になった年度の3月31日まで", note: "子の年齢の条件（障害のある子は20歳未満）", src: "nenkin" },
    "izoku.kousei": { value: "報酬比例部分の4分の3（ダミー）", note: "会社員・公務員だった場合に上乗せされる分", src: "nenkin" },
    "kougaku.futan": { value: "月 ○万円台（所得により変わる・ダミー）", note: "1か月の医療費の自己負担の上限", src: "mhlw" },
    "kougaku.tasuukai": { value: "4回目から下がる（ダミー）", note: "直近12か月で3回以上あった場合", src: "mhlw" },
    "roukogo.2000": { value: "約2,000万円", note: "報告書に示された、30年間の不足額の試算", src: "fsa2019" },
    "roukogo.month": { value: "月 約5万円（当時の試算）", note: "高齢夫婦無職世帯の家計の不足額", src: "fsa2019" },
    "kakei.tsushin": { value: "月 ○万円（ダミー）", note: "2人以上の世帯の通信費の平均", src: "kakei" },
  };

  const SOURCES = {
    nenkin: { name: "日本年金機構", url: "", year: "—", checked: "—" },
    mhlw: { name: "厚生労働省", url: "", year: "—", checked: "—" },
    fsa2019: { name: "金融審議会 市場ワーキング・グループ報告書（2019年）", url: "", year: "2019", checked: "—" },
    kakei: { name: "総務省「家計調査」", url: "", year: "—", checked: "—" },
  };

  // 記事の中の <span data-fig="..."> を、値に置き換える。使った出典を集めて返す
  function apply(root) {
    const used = new Set();
    root.querySelectorAll("[data-fig]").forEach((el) => {
      const f = FIGURES[el.dataset.fig];
      if (!f) { el.textContent = "（未設定）"; return; }
      el.textContent = f.value;
      el.title = f.note;
      el.classList.add("fig");
      used.add(f.src);
    });
    return [...used].map((k) => Object.assign({ key: k }, SOURCES[k]));
  }

  // 出典の一覧を作る
  function sourceList(sources) {
    const ul = document.createElement("ul");
    ul.className = "src-list";
    sources.forEach((s) => {
      const li = document.createElement("li");
      li.textContent = `${s.name}（${s.year === "—" ? "年度未設定" : s.year + "年"}／確認日 ${s.checked}）`;
      ul.appendChild(li);
    });
    if (!sources.length) ul.appendChild(Object.assign(document.createElement("li"), { textContent: "この記事では具体的な数字を扱っていません。" }));
    return ul;
  }

  // 記事ページの共通処理：数字の差し込みと出典欄の生成
  function initArticle() {
    const body = document.querySelector("[data-article]");
    if (!body) return;
    const used = apply(body);
    const slot = document.getElementById("article-sources");
    if (slot) slot.appendChild(sourceList(used));
  }

  window.KSF = { FIGURES, SOURCES, apply, sourceList };
  document.addEventListener("DOMContentLoaded", initArticle);
})();
