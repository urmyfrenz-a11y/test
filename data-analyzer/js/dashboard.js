/* =========================================================
   dashboard.js — 7단계: 한 장 요약 대시보드 + 리포트 다운로드
   ========================================================= */
(function () {
  "use strict";
  const DA = (window.DA = window.DA || {});
  const { util } = DA;
  const el = util.el;

  function render(stage) {
    const st = DA.get();
    const ds = DA.primary();
    const { eda, target, importance, analysis, insights } = st;
    stage.innerHTML = "";

    const panel = el("div", { class: "panel" });
    panel.appendChild(el("div", { class: "panel__head" }, [
      el("h2", { class: "panel__title", text: "7. 요약 대시보드 · 리포트" }),
      el("p", { class: "panel__desc", text: "핵심을 한 장에 정리했습니다. 아래에서 PDF 또는 PPTX 리포트로 내려받을 수 있습니다." }),
    ]));

    // 다운로드 액션 (상단)
    const dl = el("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px" });
    const pdfBtn = el("button", { class: "btn btn--primary", onclick: (e) => runExport(e, "pdf") }, "⬇ PDF 리포트");
    const pptBtn = el("button", { class: "btn btn--ghost", onclick: (e) => runExport(e, "pptx") }, "⬇ PPTX 리포트");
    dl.appendChild(pdfBtn); dl.appendChild(pptBtn);
    panel.appendChild(dl);

    // ---- 대시보드 본문 (캡처 대상) ----
    const dash = el("div", { class: "dashboard", id: "dashboard-capture" });
    dash.appendChild(el("div", { class: "dashboard__head" }, [
      el("h2", { class: "dashboard__title", text: "데이터 분석 요약 대시보드" }),
      el("span", { class: "dashboard__meta", text: `${ds ? ds.name : "-"} · 타겟: ${target.column} · ${target.kind === "regression" ? "회귀" : "분류"} 분석` }),
    ]));

    // KPI
    const kpiSec = el("section");
    const kpi = el("div", { class: "kpi-grid" });
    const kpis = buildKpis(st);
    kpis.forEach(([l, v, s]) => kpi.appendChild(el("div", { class: "kpi" }, [
      el("div", { class: "kpi__label", text: l }), el("div", { class: "kpi__value", text: v }), el("div", { class: "kpi__sub", text: s })])));
    kpiSec.appendChild(kpi);
    dash.appendChild(kpiSec);

    // 차트 2개: 타겟 분포 + 영향력 순위
    const chartSec = el("section");
    chartSec.appendChild(el("h3", { text: "핵심 시각화" }));
    const grid = el("div", { class: "chart-grid" });
    grid.appendChild(el("div", { class: "chart-card" }, [
      el("div", { class: "chart-card__title", text: target.kind === "regression" ? `타겟 ‘${target.column}’ 분포` : `‘${target.column}’ 클래스 분포` }),
      el("div", { class: "chart-holder" }, [el("canvas", { id: "dash-target" })]),
    ]));
    grid.appendChild(el("div", { class: "chart-card" }, [
      el("div", { class: "chart-card__title", text: "원인 변수 영향력 Top" }),
      el("div", { class: "chart-holder" }, [el("canvas", { id: "dash-drivers" })]),
    ]));
    chartSec.appendChild(grid);
    dash.appendChild(chartSec);

    // 인사이트 요약
    const insSec = el("section");
    insSec.appendChild(el("h3", { text: "핵심 인사이트" }));
    const mini = el("div", { class: "mini-insights" });
    (insights || []).forEach((ins) => mini.appendChild(el("div", { class: "mini-insight", text: ins.title })));
    if (!insights || !insights.length) mini.appendChild(el("div", { class: "mini-insight", text: "인사이트 없음" }));
    insSec.appendChild(mini);
    dash.appendChild(insSec);

    panel.appendChild(dash);

    // 하단 액션
    const a = el("div", { class: "actions" });
    a.appendChild(el("button", { class: "btn btn--ghost", onclick: () => DA.wizard.go("insights") }, "← 인사이트"));
    a.appendChild(el("div", { class: "spacer" }));
    a.appendChild(el("button", { class: "btn btn--ghost", onclick: () => DA.app.restart() }, "↺ 새 분석 시작"));
    panel.appendChild(a);

    stage.appendChild(panel);

    // 차트 렌더
    requestAnimationFrame(() => { drawTargetChart(st); drawDriversChart(st); });
  }

  function buildKpis(st) {
    const { eda, target, analysis, importance } = st;
    const list = [];
    list.push(["행 × 열", `${util.fmtInt(eda.rows)} × ${util.fmtInt(eda.cols)}`, "데이터 규모"]);
    if (analysis && analysis.kind === "regression" && !analysis.error) {
      list.push(["설명력 R²", util.pct(analysis.r2), "회귀 모델"]);
    } else if (analysis && analysis.kind === "classification") {
      list.push(["베이스라인", util.pct(analysis.baseline), `${analysis.classes.length}개 클래스`]);
    }
    const top = importance && importance.ranking && importance.ranking[0];
    list.push(["최대 영향 변수", top ? top.name : "—", top ? top.effect : ""]);
    const sigCount = importance ? importance.ranking.filter((r) => r.sig).length : 0;
    list.push(["유의 변수", util.fmtInt(sigCount), "p<0.05"]);
    return list;
  }

  function drawTargetChart(st) {
    const cv = document.getElementById("dash-target");
    if (!cv) return;
    const cu = DA.chartUtil, pal = cu.palette();
    const { target, eda, analysis } = st;
    if (target.kind === "regression") {
      const col = eda.perColumn.find((c) => c.name === target.column);
      const h = col && col.hist ? col.hist : { labels: [], counts: [] };
      cu.make(cv, {
        type: "bar",
        data: { labels: h.labels, datasets: [{ data: h.counts, backgroundColor: cu.primary() }] },
        options: cu.baseOptions({ plugins: { legend: { display: false } } }),
      });
    } else if (analysis && analysis.classes) {
      cu.make(cv, {
        type: "doughnut",
        data: {
          labels: analysis.classes.map((c) => String(c[0]).slice(0, 16)),
          datasets: [{ data: analysis.classes.map((c) => c[1]), backgroundColor: analysis.classes.map((_, i) => pal[i % pal.length]) }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right", labels: { color: cu.text(), font: { size: 10 } } } } },
      });
    }
  }

  function drawDriversChart(st) {
    const cv = document.getElementById("dash-drivers");
    if (!cv) return;
    const cu = DA.chartUtil;
    const ranking = (st.importance && st.importance.ranking) || [];
    const top = ranking.slice(0, 7);
    cu.make(cv, {
      type: "bar",
      data: {
        labels: top.map((r) => r.name),
        datasets: [{
          data: top.map((r) => r.score),
          backgroundColor: top.map((r) => r.sig ? cu.palette()[0] : cu.grid()),
        }],
      },
      options: cu.baseOptions({ indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { min: 0, max: 1, ticks: { color: cu.text() }, grid: { color: cu.grid() } }, y: { ticks: { color: cu.text() }, grid: { color: cu.grid() } } } }),
    });
  }

  async function runExport(e, kind) {
    const btn = e.currentTarget;
    const orig = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>생성 중…';
    try {
      if (kind === "pdf") await DA.report.exportPDF();
      else await DA.report.exportPPTX();
    } catch (err) {
      console.error(err);
      alert("리포트 생성 중 오류가 발생했습니다: " + (err && err.message ? err.message : err));
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  DA.dashboard = { render };
})();
