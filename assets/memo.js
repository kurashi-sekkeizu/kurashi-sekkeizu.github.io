/* PDF（ライフプランメモ）の中身を組み立てる。
 * PDF画面と、トップページの見本の両方から使う（見本は実際の計算結果そのもの）。
 */
(function () {
  "use strict";

  function memoHTML(r, d, A, opt) {
    opt = opt || {};
    const has = (id) => (d.pdf.sections || []).includes(id);
    const esc = KS.esc, man = KS.man;
    const today = new Date();
    const summary = [
      ["本人", [KSQ.display(KSQ.byId.age, A), KSQ.display(KSQ.byId.work, A), KSQ.display(KSQ.byId.income, A)].join("・")],
      ["配偶者", KSQ.hasSpouse(A) ? [KSQ.display(KSQ.byId.spouseAge, A), KSQ.display(KSQ.byId.spouseWork, A), KSQ.display(KSQ.byId.spouseIncome, A)].join("・") : "いない"],
      ["子ども", A.kids === "yes" ? `${A.kidsCount}人（${KSQ.display(KSQ.byId.kidsAges, A)}）` : KSQ.display(KSQ.byId.kids, A)],
      ["住まい", KSQ.display(KSQ.byId.home, A)],
      ["生活費・貯蓄", KSQ.display(KSQ.byId.living, A) + "／" + KSQ.display(KSQ.byId.savings, A)],
    ];
    const foot = `<p class="foot">くらしの設計図／一般的な計算による目安であり、商品の推奨ではありません／画面確認用プロトタイプ（数字はダミー）</p>`;

    let html = `
      <h2 class="memo-title">くらしの設計図 ライフプランメモ</h2>
      <p>作成日 ${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}</p>
      <div class="memo-box">このメモは一般的な計算による目安です。商品をすすめるものではなく、運用成果を保証するものでもありません。運営者は保険代理店・金融機関ではありません。</div>
      <h2>回答の要約</h2>
      <table><tbody>${summary.map((s) => `<tr><th style="width:25%">${esc(s[0])}</th><td>${esc(s[1])}</td></tr>`).join("")}</tbody></table>
      ${r.provisional.length ? `<p>※仮の値：${esc(r.provisional.join("、"))}</p>` : ""}
      <h2>見通し（天気予報）</h2>
      <table><tbody>${r.forecast.map((f) => { const w = KSR.WEATHER[f.weather]; return `<tr><th style="width:26%">${esc(f.title)}</th><td style="width:22%;white-space:nowrap"><b>${w.icon} ${esc(w.name)}</b></td><td>${esc(f.reason)}${f.note ? `<br>※${esc(f.note)}` : ""}</td></tr>`; }).join("")}</tbody></table>
      <p>☀️晴れ＝今の前提では心配は小さい見込み／⛅くもり＝注意して確認を／☔雨＝対策を考える価値あり</p>
      <h2>計算に使っている毎月の支出（いま）</h2>
      <table><tbody>${[["生活費", r.current.living], ["住宅ローンの返済", r.current.homeLoan], ["住居費（家賃・税金など）", r.current.housing], ["教育費", r.current.edu], ["車", r.current.car], ["そのほかの借入れ", r.current.loan], ["その他", r.current.other]].filter(([, c]) => c.source !== "none" || c.monthly > 0).map(([l, c]) => `<tr><th style="width:26%">${l}</th><td style="width:22%">${(Math.round(c.monthly * 10) / 10).toLocaleString()}万円</td><td>${{ answer: "あなたの回答", detail: "くわしく入力の値", provisional: "仮の値（一般的な目安）", none: "—" }[c.source]}</td></tr>`).join("")}<tr><th>合計</th><td>${(Math.round(r.current.total * 10) / 10).toLocaleString("ja-JP")}万円</td><td>いまの手取り収入 月${(Math.round(r.current.incomeMonthly * 10) / 10).toLocaleString()}万円</td></tr></tbody></table>`;
    if (has("todo")) {
      html += `<h2>まずやること・やることリスト</h2><table><thead><tr><th>#</th><th>やること</th><th>時期</th><th>理由</th></tr></thead><tbody>` +
        r.todos.map((t, i) => `<tr><td>${i + 1}${i < 3 ? "★" : ""}</td><td>${esc(t.title)}</td><td>${esc(t.when)}</td><td>${esc(t.reason)}</td></tr>`).join("") +
        `</tbody></table><p>★＝まずやること</p>`;
    }
    if (has("plan")) {
      html += `<h2 class="page-break">これからの出来事</h2><table><thead><tr><th style="width:16%">年</th><th style="width:28%">家族の年齢</th><th>出来事</th><th style="width:14%">金額の目安</th></tr></thead><tbody>${r.timeline.map((t) => `<tr><td>${t.year}年</td><td>${esc(t.ages.map((a) => `${a.who}${a.age}`).join("・"))}</td><td>${t.items.map((it) => esc(it.icon + " " + it.text)).join("<br>")}</td><td>${t.items.map((it) => (it.amount >= 30 ? man(it.amount) : "")).join("<br>")}</td></tr>`).join("")}</tbody></table>` +
        `<h2>将来の見通し</h2>${KSV.staticHTML(r, 680)}<p>前提：物価上昇 年${d.assumptions.inflation}%／運用 年${d.assumptions.ret}%</p>`;
    }
    if (has("estimate")) {
      html += `<h2 class="page-break">分野別の目安</h2><table><tbody>` +
        (r.death ? `<tr><th>万一のときの保障額</th><td>${man(r.death.low)}〜${man(r.death.high)}（遺族の生活費 ${d.assumptions.ratioLow}〜${d.assumptions.ratioHigh}%）</td></tr>` : "") +
        `<tr><th>働けなくなったとき</th><td>月 ${man(r.disability.first)}（1年6か月まで）／月 ${man(r.disability.after)}（それ以降）</td></tr>` +
        (r.retire ? `<tr><th>老後の不足（65歳）</th><td>運用しない場合 ${man(r.retire.gap0)}${r.retire.gapR !== null ? `／年${r.ret}% ${man(r.retire.gapR)}（保証されません）` : ""}</td></tr>` : "") +
        `</tbody></table><h2>保険の種類ごとの優先度</h2><table><tbody>` +
        r.insurance.map((x) => `<tr><th style="width:30%">${esc(x.name)}</th><td><b>${esc(x.level.text)}</b><br>${esc(x.reason)}</td></tr>`).join("") + `</tbody></table>`;
    }
    if (has("review")) {
      html += `<h2>見直せるかもしれない支出</h2><p>固定費は「くわしく入力」で答えると表示されます。保険料はこの一覧に含めません。</p>`;
    }
    if (has("ask")) {
      html += `<h2 class="page-break">専門家に聞くこと</h2>` +
        r.ask.map((x) => `<p class="check" style="margin:2px 0">${esc(x.q)}（${esc(x.who)}）</p>`).join("") +
        (d.pdf.note.trim() ? `<p class="check" style="margin:2px 0">${esc(d.pdf.note.trim())}</p>` : "") +
        `<h2>相談メモ</h2><p>相談日 ＿＿＿＿＿＿　相談先 ＿＿＿＿＿＿＿＿＿＿</p>` +
        `<div class="write-line"></div><div class="write-line"></div><div class="write-line"></div><div class="write-line"></div>`;
    }
    html += `<h2 class="page-break">この計算に入れていないこと</h2>` +
      `<p>この計算は、次のものを含んでいません。相談のときに確認してください。</p>` +
      `<table><tbody>${KSR.notIncludedItems(r, A).map((it) => `<tr><th style="width:8%;text-align:center">${{ better: "＋", worse: "−", both: "±" }[it.dir]}</th><td>${esc(it.text)}</td></tr>`).join("")}</tbody></table>` +
      `<p>＋＝入れると結果が良くなる方向／−＝厳しくなる方向／±＝どちらにも動く</p>`;
    html += `<h2>出典・確認日</h2><p>（本番では、公的制度データごとに出典と確認日を記載します。プロトタイプの数字はダミーです。）</p>` + foot;
    return html;
  }

  window.KSM = { memoHTML };
})();
