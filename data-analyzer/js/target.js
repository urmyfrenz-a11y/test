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

  function kindOf(type) { return type === "numeric" ? "regression" : "classification"; }

  function questionText(column, kind) {
    if (kind === "regression")
      return `‘${column}’ 값에 영향을 주는 요인을 알고 싶다`;
    return `무엇이 ‘${column}’ 을(를) 좌우하는지 알고 싶다`;
  }

  const TYPE_LABEL = { numeric: "수치", categorical: "범주", datetime: "날짜", text: "텍스트" };

  function render(stage) {
    const st = DA.get();
    const eda = st.eda;
    stage.innerHTML = "";
    const panel = el("div", { class: "panel" });
    panel.appendChild(el("div", { class: "panel__head" }, [
      el("h2", { class: "panel__title", text: "3. 분석 목표 설정 (타겟 변수)" }),
      el("p", { class: "panel__desc", text: "EDA 결과로 중요 변수를 골랐습니다. 원하는 항목을 고르거나, 맨 아래에서 변수를 직접 선택하세요." }),
    ]));

    const cands = candidates(eda);
    if (!cands.length) {
      panel.appendChild(el("div", { class: "note note--warn", text: "자동으로 적합한 타겟을 찾지 못했습니다. 아래 ‘직접 선택’에서 원하는 변수를 골라 주세요." }));
    }

    // 선택 상태: {mode:"cand", idx} 또는 {mode:"custom", column}
    let sel = null;
    if (st.target) {
      const ci = cands.findIndex((c) => c.column === st.target.column);
      sel = ci >= 0 ? { mode: "cand", idx: ci } : { mode: "custom", column: st.target.column };
    }

    const opts = el("div", { class: "options" });
    const candNodes = [];
    const nextBtn = () => panel.querySelector("#target-next");
    const updateNext = () => {
      const b = nextBtn();
      if (b) b.disabled = !(sel && (sel.mode === "cand" || (sel.mode === "custom" && sel.column)));
    };
    const clearMarks = () => [...opts.children].forEach((c) => {
      c.classList.remove("is-selected"); c.setAttribute("aria-checked", "false");
    });

    // --- 자동 추천 후보 ---
    cands.forEach((cand, i) => {
      const opt = el("div", {
        class: "option", role: "radio", tabindex: "0", "aria-checked": "false",
      }, [
        el("div", { class: "option__radio" }),
        el("div", { class: "option__body" }, [
          el("div", { class: "option__title", html: util.esc(questionText(cand.column, cand.kind)) + " " + util.typeBadge(cand.type) }),
          el("div", { class: "option__desc", text: `타겟: ${cand.column} · ${cand.reason}` }),
        ]),
      ]);
      const choose = () => {
        sel = { mode: "cand", idx: i };
        clearMarks(); opt.classList.add("is-selected"); opt.setAttribute("aria-checked", "true");
        customWrap.classList.add("hidden");
        updateNext();
      };
      opt.addEventListener("click", choose);
      opt.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); } });
      candNodes.push(opt);
      opts.appendChild(opt);
    });

    // --- 직접 선택 ---
    const customSelect = el("select", {
      class: "btn btn--ghost", style: "min-width:280px; max-width:100%; font-weight:500",
      "aria-label": "타겟 변수 직접 선택",
    });
    customSelect.appendChild(el("option", { value: "" }, "— 변수 선택 —"));
    eda.perColumn.forEach((c) => {
      const extra = c.type === "numeric" ? "" : `, 고유값 ${util.fmtInt(c.unique)}`;
      customSelect.appendChild(el("option", { value: c.name }, `${c.name}  (${TYPE_LABEL[c.type] || c.type}${extra})`));
    });
    const customNote = el("div", { class: "option__desc", style: "margin-top:8px" }, "");
    const customWrap = el("div", { class: "hidden", style: "margin-top:12px" }, [customSelect, customNote]);

    function applyCustomColumn(name) {
      if (!name) { sel = { mode: "custom", column: null }; customNote.textContent = ""; updateNext(); return; }
      const col = eda.perColumn.find((c) => c.name === name);
      sel = { mode: "custom", column: name };
      const kind = kindOf(col.type);
      if (kind === "classification" && col.unique > 50) {
        customNote.innerHTML = `<span style="color:var(--warning)">⚠️ ‘${util.esc(name)}’ 은(는) 고유값이 ${util.fmtInt(col.unique)}개로 많아 분류 타겟으로는 부적합할 수 있습니다(그룹이 너무 잘게 쪼개짐).</span>`;
      } else if (kind === "classification" && col.unique < 2) {
        customNote.innerHTML = `<span style="color:var(--warning)">⚠️ 값이 한 종류뿐이라 타겟으로 분석할 수 없습니다.</span>`;
      } else {
        customNote.textContent = `이 변수를 타겟으로 ${kind === "regression" ? "회귀(값 예측)" : "분류(그룹 구분)"} 분석을 진행합니다.`;
      }
      updateNext();
    }
    customSelect.addEventListener("change", () => applyCustomColumn(customSelect.value));
    customSelect.addEventListener("click", (e) => e.stopPropagation());

    const customOpt = el("div", {
      class: "option", role: "radio", tabindex: "0", "aria-checked": "false",
    }, [
      el("div", { class: "option__radio" }),
      el("div", { class: "option__body" }, [
        el("div", { class: "option__title", text: "직접 선택 — 원하는 변수를 목록에서 고르기" }),
        el("div", { class: "option__desc", text: "자동 추천에 원하는 변수가 없을 때: 데이터의 모든 변수 중에서 타겟을 직접 지정합니다." }),
        customWrap,
      ]),
    ]);
    const chooseCustom = () => {
      clearMarks(); customOpt.classList.add("is-selected"); customOpt.setAttribute("aria-checked", "true");
      customWrap.classList.remove("hidden");
      if (!sel || sel.mode !== "custom") sel = { mode: "custom", column: customSelect.value || null };
      updateNext();
    };
    customOpt.addEventListener("click", (e) => { if (customSelect.contains(e.target)) return; chooseCustom(); });
    customOpt.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); chooseCustom(); } });
    opts.appendChild(customOpt);

    panel.appendChild(opts);

    panel.appendChild(el("div", { class: "note note--info", style: "margin-top:16px",
      html: "선택한 결과 변수(타겟)를 기준으로, 다음 단계에서 <strong>가장 큰 영향을 주는 원인 변수</strong>를 자동 추천하고 통계적 유의성을 검정합니다." }));

    const a = el("div", { class: "actions" });
    a.appendChild(el("button", { class: "btn btn--ghost", onclick: () => DA.wizard.go("eda") }, "← EDA"));
    a.appendChild(el("div", { class: "spacer" }));
    a.appendChild(el("button", {
      class: "btn btn--primary", id: "target-next", disabled: "disabled",
      onclick: () => {
        let column, type, kind;
        if (sel.mode === "cand") {
          const c = cands[sel.idx]; column = c.column; type = c.type; kind = c.kind;
        } else {
          const col = eda.perColumn.find((c) => c.name === sel.column);
          if (!col) return;
          column = col.name; type = col.type; kind = kindOf(col.type);
        }
        st.target = { column, type, kind, question: questionText(column, kind) };
        st.importance = null; st.selectedDrivers = []; st.analysis = null; st.insights = [];
        DA.wizard.go("drivers");
      },
    }, "원인 변수 추천 받기 →"));
    panel.appendChild(a);

    stage.appendChild(panel);

    // 이전에 선택했던 상태 복원
    if (sel && sel.mode === "cand" && candNodes[sel.idx]) {
      candNodes[sel.idx].classList.add("is-selected");
      candNodes[sel.idx].setAttribute("aria-checked", "true");
    } else if (sel && sel.mode === "custom") {
      customOpt.classList.add("is-selected"); customOpt.setAttribute("aria-checked", "true");
      customWrap.classList.remove("hidden");
      customSelect.value = sel.column || "";
      applyCustomColumn(sel.column);
    }
    updateNext();
  }

  function backOnly(stage) {
    const a = el("div", { class: "actions" });
    a.appendChild(el("button", { class: "btn btn--ghost", onclick: () => DA.wizard.go("eda") }, "← EDA"));
    return a;
  }

  DA.target = { render, candidates };
})();
