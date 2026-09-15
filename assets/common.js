/* くらしの設計図 プロトタイプ 共通処理
 * 入力値は sessionStorage（既定）／localStorage（利用者が選んだ場合のみ）に保存し、送信しない。
 * URL のクエリ・ハッシュに入力値を載せない。
 */
(function () {
  "use strict";

  const KEY = "kurashi-sekkeizu:v1";
  const VERSION = 1;

  function storageOk(getter) {
    try {
      const s = getter();
      s.setItem("__ks_test", "1");
      s.removeItem("__ks_test");
      return true;
    } catch (e) {
      return false;
    }
  }
  const hasSession = storageOk(() => window.sessionStorage);
  const hasLocal = storageOk(() => window.localStorage);
  let memory = null;

  function empty() {
    return {
      version: VERSION,
      meta: { mode: "step", persist: "session", pos: null, done: [] },
      answers: {},
      assumptions: { inflation: 1, ret: 0, ratioLow: 70, ratioHigh: 80 },
      pdf: { sections: ["todo", "plan", "estimate", "review", "ask"], note: "" },
    };
  }

  // 戻り値: データ／null（無し）／"broken"（形式違い・破損）
  function parse(raw) {
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      if (!d || d.version !== VERSION || typeof d.answers !== "object") return "broken";
      return d;
    } catch (e) {
      return "broken";
    }
  }

  function load() {
    let data = null;
    let broken = false;
    if (hasSession) {
      const p = parse(sessionStorage.getItem(KEY));
      if (p === "broken") { broken = true; sessionStorage.removeItem(KEY); } else data = p;
    }
    if (!data && hasLocal) {
      const p = parse(localStorage.getItem(KEY));
      if (p === "broken") { broken = true; localStorage.removeItem(KEY); } else data = p;
    }
    if (!data && memory) data = memory;
    return { data: data || empty(), existed: !!data, broken };
  }

  function save(d) {
    memory = d;
    const raw = JSON.stringify(d);
    if (hasSession) { try { sessionStorage.setItem(KEY, raw); } catch (e) { /* 容量不足等は保存なしで続行 */ } }
    if (hasLocal) {
      try {
        if (d.meta.persist === "local") localStorage.setItem(KEY, raw);
        else localStorage.removeItem(KEY);
      } catch (e) { /* 同上 */ }
    }
  }

  function hasSavedLocal() {
    if (!hasLocal) return false;
    const p = parse(localStorage.getItem(KEY));
    return !!p && p !== "broken";
  }

  function clearAll() {
    memory = null;
    if (hasSession) sessionStorage.removeItem(KEY);
    if (hasLocal) localStorage.removeItem(KEY);
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // 万円単位の数値を表示用に
  function man(n) {
    if (n == null || !isFinite(n)) return "—";
    const v = Math.round(n);
    const sign = v < 0 ? "−" : "";
    const a = Math.abs(v);
    if (a >= 10000) {
      const oku = Math.trunc(a / 10000);
      const rest = a % 10000;
      return sign + oku + "億" + (rest ? rest.toLocaleString("ja-JP") + "万円" : "円");
    }
    return sign + a.toLocaleString("ja-JP") + "万円";
  }

  // 削除ボタン（ページ内の確認パネル。ブラウザのダイアログは使わない）
  function initDelete() {
    document.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        let panel = document.getElementById("confirm-delete");
        if (panel) { panel.querySelector("button").focus(); return; }
        panel = document.createElement("div");
        panel.id = "confirm-delete";
        panel.className = "confirm-panel";
        panel.setAttribute("role", "alertdialog");
        panel.setAttribute("aria-labelledby", "confirm-delete-title");
        panel.innerHTML =
          '<p id="confirm-delete-title"><b>入力内容をすべて削除しますか？</b><br>この端末から消え、元に戻せません。</p>' +
          '<div class="row"><button type="button" class="btn danger inline" data-yes>削除する</button>' +
          '<button type="button" class="btn secondary inline" data-no>やめる</button></div>';
        const main = document.querySelector("main");
        main.insertBefore(panel, main.firstChild);
        panel.querySelector("[data-yes]").addEventListener("click", () => {
          clearAll();
          location.href = "/soudan/";
        });
        panel.querySelector("[data-no]").addEventListener("click", () => {
          panel.remove();
          btn.focus();
        });
        panel.querySelector("[data-yes]").focus();
      });
    });
  }

  window.KS = { load, save, clearAll, hasSavedLocal, hasLocal, hasSession, empty, esc, man, initDelete };
  document.addEventListener("DOMContentLoaded", initDelete);
})();
