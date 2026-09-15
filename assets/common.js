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
    if (Math.abs(v) >= 10000) {
      const oku = Math.trunc(v / 10000);
      const rest = Math.abs(v % 10000);
      return oku + "億" + (rest ? rest.toLocaleString("ja-JP") + "万円" : "円");
    }
    return v.toLocaleString("ja-JP") + "万円";
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

  // 貯蓄残高の推移グラフ（SVG）。series: [{label, dashed, points:[{age, balance}]}]
  function chartSVG(series, marks) {
    const W = 640, H = 300, L = 64, R = 16, T = 16, B = 40;
    const all = series.flatMap((s) => s.points);
    if (!all.length) return "";
    const minAge = all[0].age, maxAge = all[all.length - 1].age;
    let minV = Math.min(0, ...all.map((p) => p.balance));
    let maxV = Math.max(100, ...all.map((p) => p.balance));
    const pad = (maxV - minV) * 0.08;
    maxV += pad; minV -= minV < 0 ? pad : 0;
    const x = (a) => L + ((a - minAge) / Math.max(1, maxAge - minAge)) * (W - L - R);
    const y = (v) => T + (1 - (v - minV) / (maxV - minV)) * (H - T - B);
    const step = niceStep((maxV - minV) / 4);
    let g = "";
    for (let v = Math.ceil(minV / step) * step; v <= maxV; v += step) {
      g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? "#555" : "#e2e2dc"}" stroke-width="${v === 0 ? 1.5 : 1}"/>`;
      g += `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="#56666a">${Math.round(v).toLocaleString("ja-JP")}</text>`;
    }
    for (let a = Math.ceil(minAge / 10) * 10; a <= maxAge; a += 10) {
      g += `<text x="${x(a)}" y="${H - 16}" text-anchor="middle" font-size="12" fill="#56666a">${a}歳</text>`;
    }
    (marks || []).forEach((m) => {
      if (m.age < minAge || m.age > maxAge) return;
      g += `<line x1="${x(m.age)}" x2="${x(m.age)}" y1="${T}" y2="${H - B}" stroke="#a33a2a" stroke-dasharray="3 3"/>`;
      g += `<text x="${x(m.age) + 4}" y="${T + 14}" font-size="12" fill="#a33a2a">${esc(m.label)}</text>`;
    });
    series.forEach((s) => {
      const d = s.points.map((p, i) => (i ? "L" : "M") + x(p.age).toFixed(1) + " " + y(p.balance).toFixed(1)).join(" ");
      g += `<path d="${d}" fill="none" stroke="${s.dashed ? "#7a8a8e" : "#2e6b5b"}" stroke-width="3" ${s.dashed ? 'stroke-dasharray="8 6"' : ""}/>`;
    });
    const legend = series.map((s) => `<span style="margin-right:14px;white-space:nowrap"><svg width="28" height="10" aria-hidden="true"><line x1="0" x2="28" y1="5" y2="5" stroke="${s.dashed ? "#7a8a8e" : "#2e6b5b"}" stroke-width="3" ${s.dashed ? 'stroke-dasharray="6 4"' : ""}/></svg> ${esc(s.label)}</span>`).join("");
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="貯蓄残高の推移のグラフ。同じ数字を下の表でも確認できます。" style="width:100%;height:auto">${g}<text x="${L}" y="${T - 4}" font-size="11" fill="#56666a">万円</text></svg><div class="small">${legend}</div>`;
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  window.KS = { load, save, clearAll, hasSavedLocal, hasLocal, hasSession, empty, esc, man, initDelete, chartSVG };
  document.addEventListener("DOMContentLoaded", initDelete);
})();
