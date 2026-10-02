/* 数字と出典を1か所で管理する仕組み（記事・計算の両方から使う）
 *
 * 値そのものは持たない。正本は data/*.json で、`scripts/build_data.py` が assets/data.js を作る。
 * 使い方: 記事のHTMLに <span data-fig="izoku.kiso"></span> と書くと、値に置き換わり、
 *         ページ下部に出典・適用年度・確認日が自動で並ぶ。
 *
 * データが読み込めないときは、値を出さずに「読み込めませんでした」と表示する。
 * 古い値や推測で表示しないため（CLAUDE.md §5）。
 */
(function () {
  "use strict";

  const DATA = window.KSDATA || null;
  const FIGURES = (DATA && DATA.figures) || {};
  const SOURCES = (DATA && DATA.sources) || {};

  function loaded() {
    return Boolean(DATA && DATA.figures && DATA.sources);
  }

  // 記事の中の <span data-fig="...">を、値に置き換える。使った出典を集めて返す
  function apply(root) {
    const used = new Set();
    root.querySelectorAll("[data-fig]").forEach((el) => {
      const key = el.dataset.fig;
      const f = FIGURES[key];
      if (!f) {
        el.textContent = loaded() ? "（この数字は確認中です）" : "（数字を読み込めませんでした）";
        el.classList.add("fig-missing");
        return;
      }
      el.textContent = f.value;
      if (f.note && f.note !== "—") el.title = f.note;
      el.classList.add("fig");
      if (f.src) used.add(f.src);
    });
    return [...used].map((k) => Object.assign({ key: k }, SOURCES[k]));
  }

  // 出典の一覧を作る
  function sourceList(sources) {
    const ul = document.createElement("ul");
    ul.className = "src-list";
    sources.forEach((s) => {
      const li = document.createElement("li");
      if (s.url) {
        const a = document.createElement("a");
        a.href = s.url;
        a.textContent = `${s.publisher}「${s.name}」`;
        a.rel = "noopener";
        li.appendChild(a);
      } else {
        li.appendChild(document.createTextNode(`${s.publisher || ""}「${s.name || s.key}」`));
      }
      const meta = document.createElement("span");
      meta.className = "src-meta";
      meta.textContent = `（${s.year}／確認日 ${s.checked}）`;
      li.appendChild(meta);
      ul.appendChild(li);
    });
    if (!sources.length) {
      ul.appendChild(Object.assign(document.createElement("li"), { textContent: "このページでは具体的な数字を扱っていません。" }));
    }
    return ul;
  }

  // 横棒の図：data/figures.json の num から、棒の長さを出す。
  // 同じ図の中でいちばん大きい数を100%にする（本文に数字を書かずに大小を見せるため）
  function drawBars(root) {
    root.querySelectorAll("[data-barscale]").forEach((g) => {
      const fills = [...g.querySelectorAll("[data-fignum]")];
      const vals = fills.map((el) => {
        const f = FIGURES[el.dataset.fignum];
        return f && typeof f.num === "number" ? f.num : null;
      });
      const max = Math.max(...vals.filter((v) => v !== null), 0);
      if (!max) { g.querySelectorAll(".track").forEach((t) => (t.hidden = true)); return; }
      fills.forEach((el, i) => {
        el.style.width = vals[i] === null ? "0" : `${Math.max(2, (vals[i] / max) * 100)}%`;
      });
    });
  }

  // 記事ページの共通処理：数字の差し込みと出典欄の生成
  function initArticle() {
    const body = document.querySelector("[data-article]");
    if (!body) return;
    const used = apply(body);
    drawBars(body);
    const slot = document.getElementById("article-sources");
    if (!slot) return;
    if (!loaded()) {
      const warn = document.createElement("p");
      warn.className = "note warn small";
      warn.textContent = "⚠ 公的データを読み込めませんでした。数字は表示していません。";
      slot.appendChild(warn);
      return;
    }
    slot.appendChild(sourceList(used));
    const note = document.createElement("p");
    note.className = "small muted";
    note.textContent = `このページの数字は、上の出典の公表値です（${DATA.generated} 時点）。制度は年度ごとに変わるため、実際の手続きの前に出典でご確認ください。`;
    slot.appendChild(note);
  }

  window.KSF = { FIGURES, SOURCES, apply, drawBars, sourceList, loaded };
  document.addEventListener("DOMContentLoaded", initArticle);
})();
