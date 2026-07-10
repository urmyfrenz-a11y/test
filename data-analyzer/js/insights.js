/* =========================================================
   insights.js — 6단계: 핵심 인사이트 도출 (최대 5개)
   분석 결과 + EDA 수치를 규칙 기반 문장으로 요약한다.
   ========================================================= */
(function () {
  "use strict";
  const DA = (window.DA = window.DA || {});
  const { util } = DA;
  const el = util.el;

  function generate() {
    const st = DA.get();
    const { eda, target, importance, analysis } = st;
    const out = [];

    // 1) 가장 큰 영향 변수
    const topDriver = importance && importance.ranking && importance.ranking[0];
    if (topDriver) {
      out.push({
        kind: topDriver.sig ? "success" : "default",
        title: `‘${target.column}’의 최대 영향 요인은 ‘${topDriver.name}’`,
        text: `영향도 ${util.fmt(topDriver.score)} (${topDriver.method}, ${topDriver.effect}). ` +
          (topDriver.sig
            ? `p=${fmtP(topDriver.p)} 로 통계적으로 유의합니다.`
            : `다만 p=${fmtP(topDriver.p)} 로 유의수준 0.05를 넘지 못해 신뢰도는 낮습니다.`),
      });
    }

    // 2) 모델 설명력
    if (analysis && analysis.kind === "regression" && !analysis.error) {
      const strong = analysis.r2 >= 0.5;
      out.push({
        kind: strong ? "success" : "warning",
        title: `선택한 변수들이 ‘${target.column}’ 변동의 ${util.pct(analysis.r2)}를 설명`,
        text: strong
          ? `설명력(R²)이 높아, 선택한 원인 변수만으로도 타겟을 상당 부분 예측할 수 있습니다.`
          : `설명력(R²)이 낮은 편입니다. 측정되지 않은 다른 요인의 영향이 크거나 관계가 비선형일 수 있습니다.`,
      });
    } else if (analysis && analysis.kind === "classification") {
      const sigDrivers = analysis.drivers.filter((d) => Number.isFinite(d.test.p) && d.test.p < 0.05);
      out.push({
        kind: sigDrivers.length ? "success" : "warning",
        title: `${analysis.classes.length}개 그룹을 가르는 유의 변수 ${sigDrivers.length}개`,
        text: sigDrivers.length
          ? `${sigDrivers.slice(0, 3).map((d) => `‘${d.name}’`).join(", ")} 등이 그룹 간 유의미한 차이를 보입니다. 다수 클래스 비율(베이스라인)은 ${util.pct(analysis.baseline)}입니다.`
          : `선택한 변수들에서 그룹 간 유의미한 차이가 뚜렷하지 않습니다. 추가 변수 확보가 필요할 수 있습니다.`,
      });
    }

    // 3) 회귀: 두 번째 요인 / 방향성
    if (analysis && analysis.kind === "regression" && analysis.terms && analysis.terms.length >= 2) {
      const t = analysis.terms[1];
      out.push({
        kind: "default",
        title: `두 번째 영향 요인: ‘${t.label}’`,
        text: `표준화 계수 ${util.fmt(t.stdBeta, 3)} — 이 변수가 1 표준편차 커지면 타겟은 약 ${util.fmt(t.stdBeta, 2)} 표준편차 ${t.beta >= 0 ? "증가" : "감소"}하는 경향입니다.`,
      });
    }

    // 4) 데이터 품질(결측)
    if (eda) {
      const worst = eda.perColumn.filter((c) => c.missingRatio > 0).sort((a, b) => b.missingRatio - a.missingRatio)[0];
      const totalMissPct = eda.cells ? eda.totalMissing / eda.cells : 0;
      if (worst && worst.missingRatio > 0.1) {
        out.push({
          kind: "warning",
          title: `데이터 품질 주의: ‘${worst.name}’ 결측 ${util.pct(worst.missingRatio)}`,
          text: `전체 결측률은 ${util.pct(totalMissPct)}입니다. 결측이 많은 변수는 해석 시 편향에 유의하세요.`,
        });
      }
    }

    // 5) 타겟 분포 특성 (치우침/불균형)
    if (target.kind === "regression" && eda) {
      const col = eda.perColumn.find((c) => c.name === target.column);
      if (col && col.stats && Math.abs(col.stats.skew) > 1) {
        out.push({
          kind: "default",
          title: `타겟 ‘${target.column}’ 분포가 ${col.stats.skew > 0 ? "오른쪽" : "왼쪽"}으로 치우침`,
          text: `왜도 ${util.fmt(col.stats.skew)} — 로그 변환 등으로 분포를 완화하면 분석 정확도가 개선될 수 있습니다. 이상치도 ${util.fmtInt(col.outliers)}건 감지되었습니다.`,
        });
      }
    } else if (target.kind === "classification" && analysis) {
      const cls = analysis.classes;
      if (cls.length >= 2) {
        const ratio = cls[0][1] / cls[cls.length - 1][1];
        if (ratio > 3) {
          out.push({
            kind: "warning",
            title: `클래스 불균형 감지 (최대/최소 ${util.fmt(ratio, 1)}배)`,
            text: `‘${cls[0][0]}’ 클래스가 과대표집되어 있습니다. 불균형은 예측 편향을 유발할 수 있어 재표집/가중치가 필요할 수 있습니다.`,
          });
        }
      }
    }

    // 6) 강한 변수 간 상관 (다중공선성 힌트)
    if (eda && eda.corr && eda.corr.labels.length >= 2) {
      let strongest = null;
      const { labels, matrix } = eda.corr;
      for (let i = 0; i < labels.length; i++)
        for (let j = i + 1; j < labels.length; j++)
          if (Math.abs(matrix[i][j]) > 0.8 && (!strongest || Math.abs(matrix[i][j]) > Math.abs(strongest.r)))
            strongest = { a: labels[i], b: labels[j], r: matrix[i][j] };
      if (strongest) {
        out.push({
          kind: "default",
          title: `‘${strongest.a}’ 와 ‘${strongest.b}’ 는 강한 상관 (r=${util.fmt(strongest.r)})`,
          text: `두 변수는 거의 같은 정보를 담고 있습니다. 함께 모델에 넣으면 다중공선성으로 계수 해석이 왜곡될 수 있습니다.`,
        });
      }
    }

    return out.slice(0, 5);
  }

  function fmtP(p) {
    if (!Number.isFinite(p)) return "—";
    return p < 0.001 ? "<0.001" : p.toFixed(3);
  }

  function render(stage) {
    const st = DA.get();
    stage.innerHTML = "";
    if (!st.insights.length) st.insights = generate();

    const panel = el("div", { class: "panel" });
    panel.appendChild(el("div", { class: "panel__head" }, [
      el("h2", { class: "panel__title", text: "6. 핵심 인사이트" }),
      el("p", { class: "panel__desc", text: "분석 결과에서 가장 중요한 발견을 최대 5가지로 정리했습니다." }),
    ]));

    if (!st.insights.length) {
      panel.appendChild(el("div", { class: "note note--warn", text: "도출된 인사이트가 없습니다." }));
    } else {
      const list = el("div", { class: "insight-list" });
      st.insights.forEach((ins, i) => {
        list.appendChild(el("div", { class: "insight", "data-kind": ins.kind }, [
          el("div", { class: "insight__num", text: String(i + 1) }),
          el("div", {}, [
            el("p", { class: "insight__title", text: ins.title }),
            el("p", { class: "insight__text", text: ins.text }),
          ]),
        ]));
      });
      panel.appendChild(list);
    }

    const a = el("div", { class: "actions" });
    a.appendChild(el("button", { class: "btn btn--ghost", onclick: () => DA.wizard.go("analysis") }, "← 분석"));
    a.appendChild(el("div", { class: "spacer" }));
    a.appendChild(el("button", { class: "btn btn--primary", onclick: () => DA.wizard.go("dashboard") }, "대시보드 생성 →"));
    panel.appendChild(a);
    stage.appendChild(panel);
  }

  DA.insights = { render, generate };
})();
