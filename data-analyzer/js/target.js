/* =========================================================
   target.js — 3단계: 타겟 변수 4지선다
   EDA 결과로 중요 변수를 자동 선별해 "무엇을 분석할지" 질문한다.
   ========================================================= */
(function () {
  "use strict";
  const DA = (window.DA = window.DA || {});
  const { util, stats } = DA;
  const el = util.el;

  /** 타겟 후보 점수화 → 상위 4개 */
  function candidates(eda) {
    const n = eda.rows;
    const scored = eda.perColumn.map((c) => {
      let score = 0, kind = null, reason = "";
      const idLike = c.unique >= n * 0.9;
      const nearConst = c.unique <= 1;
      const highMissing = c.missingRatio > 0.4;

      if (c.type === "numeric" && c.stats) {
        kind = "regression";
        const cv = c.stats.mean !== 0 ? Math.abs(c.stats.std / c.stats.mean) : 1;
        score = 0.6 + Math.min(0.3, cv) - c.missingRatio * 0.5;
        reason = "연속형 결과 — 값의 크기를 예측·설명";
      } else if (c.type === "categorical") {
        kind = "classification";
        // 클래스 2~8개가 이상적
        const classes = c.unique;
        const balance = classes >= 2 && classes <= 8 ? 0.35 : classes <= 15 ? 0.15 : -0.1;
        score = 0.55 + balance - c.missingRatio * 0.5;
        reason = `범주형 결과 (${classes}개 그룹) — 그룹을 가르는 요인 탐색`;
      } else {
        score = -1;
      }
      if (idLike) { score -= 1; reason = "식별자(ID)로 보임 — 타겟 부적합"; }
      if (nearConst) score -= 1;
      if (highMissing) score -= 0.3;
      return { column: c.name, type: c.type, kind, score, reason, col: c };
    });
    return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
  }

  function questionText(cand) {
    if (cand.kind === "regression")
      return `‘${cand.column}’ 값에 영향을 주는 요인을 알고 싶다`;
    return `무엇이 ‘${cand.column}’ 을(를) 좌우하는지 알고 싶다`;
  }

  function render(stage) {
    const st = DA.get();
    const eda = st.eda;
    stage.innerHTML = "";
    const panel = el("div", { class: "panel" });
    panel.appendChild(el("div", { class: "panel__head" }, [
      el("h2", { class: "panel__title", text: "3. 분석 목표 설정 (타겟 변수)" }),
      el("p", { class: "panel__desc", text: "EDA 결과로 중요 변수를 골랐습니다. 어떤 문제를 파악하고 싶으신가요? 하나를 선택하세요." }),
    ]));

    const cands = candidates(eda);
    if (!cands.length) {
      panel.appendChild(el("div", { class: "note note--warn", text: "적합한 타겟 변수를 찾지 못했습니다. 데이터에 수치형 또는 범주형 결과 변수가 필요합니다." }));
      panel.appendChild(backOnly(stage));
      stage.appendChild(panel);
      return;
    }

    // 선택 상태
    let selectedIdx = st.target ? cands.findIndex((c) => c.column === st.target.column) : -1;

    const opts = el("div", { class: "options" });
    const nextBtn = () => panel.querySelector("#target-next");

    cands.forEach((cand, i) => {
      const opt = el("div", {
        class: "option" + (i === selectedIdx ? " is-selected" : ""),
        role: "radio", tabindex: "0",
        "aria-checked": i === selectedIdx ? "true" : "false",
      }, [
        el("div", { class: "option__radio" }),
        el("div", { class: "option__body" }, [
          el("div", { class: "option__title", html: util.esc(questionText(cand)) + " " + util.typeBadge(cand.type) }),
          el("div", { class: "option__desc", text: `타겟: ${cand.column} · ${cand.reason}` }),
        ]),
      ]);
      const choose = () => {
        selectedIdx = i;
        [...opts.children].forEach((c, j) => {
          c.classList.toggle("is-selected", j === i);
          c.setAttribute("aria-checked", j === i ? "true" : "false");
        });
        const b = nextBtn(); if (b) b.disabled = false;
      };
      opt.addEventListener("click", choose);
      opt.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); } });
      opts.appendChild(opt);
    });
    panel.appendChild(opts);

    panel.appendChild(el("div", { class: "note note--info", style: "margin-top:16px",
      html: "선택한 결과 변수(타겟)를 기준으로, 다음 단계에서 <strong>가장 큰 영향을 주는 원인 변수</strong>를 자동 추천하고 통계적 유의성을 검정합니다." }));

    const a = el("div", { class: "actions" });
    a.appendChild(el("button", { class: "btn btn--ghost", onclick: () => DA.wizard.go("eda") }, "← EDA"));
    a.appendChild(el("div", { class: "spacer" }));
    a.appendChild(el("button", {
      class: "btn btn--primary", id: "target-next",
      disabled: selectedIdx >= 0 ? null : "disabled",
      onclick: () => {
        const cand = cands[selectedIdx];
        st.target = { column: cand.column, type: cand.type, kind: cand.kind, question: questionText(cand) };
        st.importance = null; st.selectedDrivers = []; st.analysis = null; st.insights = [];
        DA.wizard.go("drivers");
      },
    }, "원인 변수 추천 받기 →"));
    panel.appendChild(a);

    stage.appendChild(panel);
  }

  function backOnly(stage) {
    const a = el("div", { class: "actions" });
    a.appendChild(el("button", { class: "btn btn--ghost", onclick: () => DA.wizard.go("eda") }, "← EDA"));
    return a;
  }

  DA.target = { render, candidates };
})();
