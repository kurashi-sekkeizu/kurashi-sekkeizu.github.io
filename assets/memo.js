/* PDF（ライフプランメモ）の中身を組み立てる。
 * PDF画面と、トップページの見本の両方から使う（見本は実際の計算結果そのもの）。
 */
(function () {
  "use strict";

  // 物価の上昇をどの費目に掛けているか。相談の場で前提を聞かれたときに答えられるように出す（文は説明の層）
  const infTargets = (r) => KSX.inflationTargetsText(r.inflationOn, r.inflation);

  // 年表のアイコン。紙に出すので、線画のSVGをそのまま入れる
  // （中身は calc.js が持つ自分たちの定数なので、エスケープはしない）
  function iconHTML(key) {
    const m = KSC.markByKey(key);
    return `<span class="ic-wrap" style="color:${m.color}">${m.svg}</span> `;
  }

  function memoHTML(r, d, A, opt) {
    opt = opt || {};
    const has = (id) => (d.pdf.sections || []).includes(id);
    const esc = KS.esc, man = KS.man;
    const today = new Date();
    // 答えていない（聞いていない）項目は空なので、つなぐ前に外す。以前は「62歳・働いていない・」のように終わっていた（2026-10-31 B3-軽4）
    const joinDot = (xs) => xs.filter(Boolean).join("・");
    const summary = [
      ["本人", joinDot([KSQ.display(KSQ.byId.age, A), KSQ.display(KSQ.byId.work, A), KSQ.display(KSQ.byId.income, A)])],
      ["配偶者", KSQ.hasSpouse(A) ? joinDot([KSQ.display(KSQ.byId.spouseAge, A), KSQ.display(KSQ.byId.spouseWork, A), KSQ.display(KSQ.byId.spouseIncome, A)]) : "いない"],
      ["子ども", A.kids === "yes" ? `${A.kidsCount}人（${KSQ.display(KSQ.byId.kidsAges, A)}）` : KSQ.display(KSQ.byId.kids, A)],
      // 返し終えたローンは、答えが「住宅ローンあり」でも返済を入れていない。そのことを添える（2026-10-31 第10巡 B10-2）
      ["住まい", KSQ.display(KSQ.byId.home, A) + KSX.homeSummaryNote(r)],
      ["生活費・貯蓄", KSQ.display(KSQ.byId.living, A) + "／" + KSQ.display(KSQ.byId.savings, A)],
    ];
    // 「計算に使っている毎月の支出」の値は ⑤ と同じ KSX.costShown（行を足すと表示の合計。第12巡 B12-中3）
    const shown = KSX.costShown(r.current);
    const tenth = (v) => v.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
    const foot = `<p class="foot">くらしの設計図／一般的な計算による目安であり、商品の推奨ではありません</p>`;

    // 「計算に使っている毎月の支出」の表の下に、住宅ローンの食い違いの中身を出す。仮の値の一覧が「計算に使っている毎月の支出で確認」と
    // 案内しているのに、以前はPDFの表に中身が無かった（2026-10-31 第10巡 B10-5）
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
      <h2 class="page-break">お金の流れと、貯蓄の見通し</h2>
      ${KSV.staticHTML(r, 680)}
      <p>前提：物価上昇 年${esc(d.assumptions.inflation)}%（${esc(infTargets(r))}）／運用 年${esc(d.assumptions.ret)}%${r.sim0.shortageAge !== null ? `／<b>${r.sim0.shortageAge}歳ごろ、貯蓄が底をつく見込み</b>` : `／${KSC.DUMMY.endAge}歳まで貯蓄はプラスの見込み`}</p>
      <h2>計算に使っている毎月の支出（いま）</h2>
      <table><tbody>${[["生活費", "living"], ["住宅ローンの返済", "homeLoan"], ["住居費（家賃・税金など）", "housing"], ["教育費", "edu"], ["車", "car"], ["そのほかの借入れ", "loan"], ["その他", "other"]].map(([l, k]) => [l, r.current[k], shown.rows[k]]).filter(([, c, v]) => c.source !== "none" || v !== 0).map(([l, c, v]) => `<tr><th style="width:26%">${l}</th><td style="width:22%">${tenth(v)}万円</td><td>${{ answer: "あなたの回答", detail: "くわしく入力の値", provisional: "仮の値（一般的な目安）", none: "—" }[c.source]}${c.paidOff ? `・${esc(c.note)}` : ""}</td></tr>`).join("")}<tr><th>合計</th><td>${tenth(shown.total)}万円</td><td>いまの手取り収入 月${tenth(shown.income)}万円</td></tr></tbody></table>
      ${r.loanMismatch ? `<p>⚠ 住宅ローンの入力に食い違いがあります。${esc(r.loanMismatch)}</p>` : ""}`;
    if (has("todo")) {
      html += `<h2>まずやること・やることリスト</h2><table><thead><tr><th>#</th><th>やること</th><th>時期</th><th>理由</th></tr></thead><tbody>` +
        r.todos.map((t, i) => `<tr><td>${i + 1}${i < 3 ? "★" : ""}</td><td>${esc(t.title)}</td><td>${esc(t.when)}</td><td>${esc(t.reason)}</td></tr>`).join("") +
        `</tbody></table><p>★＝まずやること</p>`;
    }
    if (has("plan")) {
      html += `<h2 class="page-break">これからの出来事</h2><table><thead><tr><th style="width:16%">年</th><th style="width:28%">家族の年齢</th><th>出来事</th><th style="width:14%">金額の目安</th></tr></thead><tbody>${r.timeline.map((t) => `<tr><td>${t.year}年</td><td>${esc(t.ages.map((a) => `${a.who} ${a.age}歳`).join("・"))}</td><td>${t.items.map((it) => iconHTML(it.icon) + esc(it.text)).join("<br>")}</td><td>${t.items.map((it) => (it.amount >= 30 ? man(it.amount) : "")).join("<br>")}</td></tr>`).join("")}</tbody></table>`;
    }
    if (has("estimate")) {
      html += `<h2 class="page-break">分野別の目安</h2><table><tbody>` +
        (r.death ? `<tr><th>万一のときの保障額</th><td>${esc(KSX.deathRange(r.death.low, r.death.high))}（遺族の生活費 ${esc(KSX.pctRange(d.assumptions.ratioLow, d.assumptions.ratioHigh))}）</td></tr>` : "") +
        `<tr><th>働けなくなったとき</th><td>${esc(KSX.disabilityRowText(r.disability))}</td></tr>` +
        (r.retire ? `<tr><th>老後の不足（${KSC.DUMMY.endAge}歳まで）</th><td>運用しない場合 ${esc(KSX.retireGapText(r.retire.gap0, r.retire.monthly0))}${r.retire.gapR !== null ? `／年${esc(r.ret)}% ${esc(KSX.retireGapText(r.retire.gapR, r.retire.monthlyR))}（保証されません）` : ""}</td></tr>` : "") +
        `</tbody></table><h2>保険の種類ごとの優先度</h2><table><tbody>` +
        r.insurance.map((x) => `<tr><th style="width:30%">${esc(x.name)}</th><td><b>${esc(x.level.text)}</b><br>${esc(x.reason)}</td></tr>`).join("") + `</tbody></table>`;
    }
    if (has("review")) {
      const v = KSR.reviewItems(r, A);
      // ここは1万円未満の差が意味を持つ（月0.4万円＝年5万円）。man() は万円単位で丸めるので、
      // そのまま使うと「3万円 と 3万円 の差が 5万円」と読めてしまう
      const man1 = (x) => (Math.round(x * 10) / 10).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + "万円";
      html += `<h2>見直せるかもしれない支出</h2>`;
      if (v.error) {
        html += `<p>${esc(v.error)}この章は出せませんでした。</p>`;
      } else {
        html += `<p>${esc(v.group.label)}の1か月あたりの平均と並べて、多いほうの費目です。`
          + (v.fromDetail ? "" : "生活費の内訳は答えていないため、答えから直に出ている費目だけを見ています。") + `</p>`;
        html += v.over.length
          ? `<table><thead><tr><th>費目</th><th style="width:16%">あなた</th><th style="width:16%">平均</th><th style="width:22%">差（年）</th></tr></thead><tbody>`
            + v.over.map((x) => `<tr><th>${esc(x.label)}</th><td>${man1(x.you)}</td><td>${man1(x.avg)}</td><td>${man1(x.yearly)}</td></tr>`).join("")
            + `</tbody></table><p>多いことは悪いことではありません。理由があるなら、その金額が必要だということです。</p>`
          : `<p>平均より目立って多い費目は見つかりませんでした。</p>`;
        if (v.cannot.length) {
          html += `<p>ここに出していない費目：` + v.cannot.map((m) => esc(m.label)).join("、") + `（平均と比べられないため）</p>`;
        }
      }
    }
    // 自分で書き足したことは、「専門家に聞くこと」を選んでいなくても入れる。
    // 以前はその章の中にしか入れず、章を外すとメモが黙って消えていた（2026-10-31 検証 C7）
    const note = typeof d.pdf.note === "string" ? d.pdf.note.trim() : "";
    // 改行は <br> にする（エスケープしたあとで置きかえる）。以前は改行が消えて1行につながっていた（2026-10-31 C2-N2）
    const noteHTML = note ? `<p class="check" style="margin:2px 0">${esc(note).replace(/\r?\n/g, "<br>")}</p>` : "";
    if (!has("ask") && note) {
      html += `<h2 class="page-break">専門家に聞きたいこと（書き足したこと）</h2>` + noteHTML;
    }
    if (has("ask")) {
      html += `<h2 class="page-break">専門家に聞くこと</h2>` +
        r.ask.map((x) => `<p class="check" style="margin:2px 0">${esc(x.q)}（${esc(x.who)}）</p>`).join("") +
        noteHTML +
        `<h2>相談メモ</h2><p>相談日 ＿＿＿＿＿＿　相談先 ＿＿＿＿＿＿＿＿＿＿</p>` +
        `<div class="write-line"></div><div class="write-line"></div><div class="write-line"></div><div class="write-line"></div>`;
    }
    html += `<h2 class="page-break">この計算に入れていないこと</h2>` +
      `<p>この計算は、次のものを含んでいません。相談のときに確認してください。</p>` +
      `<table><tbody>${KSR.notIncludedItems(r, A).map((it) => `<tr><th style="width:8%;text-align:center">${KSX.NOT_INCLUDED_MARKS[it.dir][0]}</th><td>${esc(it.text)}</td></tr>`).join("")}</tbody></table>` +
      `<p>${esc(KSX.NOT_INCLUDED_LEGEND)}</p>`;
    html += `<h2>出典・確認日</h2><p>公的な数字は、出典・適用年度・確認日をつけて管理しています。サイトの「もっと知る」で一覧を確認できます。制度は毎年のように変わるため、手続きの前には出典か窓口でご確認ください。</p>` + foot;
    return html;
  }

  window.KSM = { memoHTML };
})();
