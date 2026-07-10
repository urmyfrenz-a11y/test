/* =========================================================
   wizard.js — 단계별 승인 흐름 제어 + 진행 스텝바
   ========================================================= */
(function () {
  "use strict";
  const DA = (window.DA = window.DA || {});
  const el = DA.util.el;

  const STEPS = [
    { id: "upload",    label: "업로드",     render: () => DA.upload.render(stage()) },
    { id: "eda",       label: "EDA",        render: () => DA.eda.render(stage()) },
    { id: "target",    label: "타겟 설정",  render: () => DA.target.render(stage()) },
    { id: "drivers",   label: "원인 변수",  render: () => DA.importance.render(stage()) },
    { id: "analysis",  label: "분석 수행",  render: () => DA.analysis.render(stage()) },
    { id: "insights",  label: "인사이트",   render: () => DA.insights.render(stage()) },
    { id: "dashboard", label: "대시보드",   render: () => DA.dashboard.render(stage()) },
  ];

  let currentIdx = 0;
  let maxReached = 0;

  function stage() { return document.getElementById("stage"); }
  function idxOf(id) { return STEPS.findIndex((s) => s.id === id); }

  function destroyCharts() {
    const st = DA.get();
    st.charts.forEach((c) => { try { c.destroy(); } catch (e) {} });
    st.charts = [];
  }

  function go(id) {
    const i = idxOf(id);
    if (i < 0) return;
    // 앞 단계 접근 가드: 데이터 없으면 업로드로
    if (i > 0 && !DA.primary() && id !== "upload") {
      const st = DA.get();
      const hasText = st.datasets.some((d) => d.kind === "text");
      if (!hasText) { id = "upload"; return go("upload"); }
    }
    destroyCharts();
    currentIdx = i;
    maxReached = Math.max(maxReached, i);
    renderStepper();
    STEPS[i].render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderStepper() {
    const nav = document.getElementById("stepper");
    if (!nav) return;
    nav.innerHTML = "";
    STEPS.forEach((s, i) => {
      const cls = "step-chip" + (i === currentIdx ? " is-active" : i < currentIdx ? " is-done" : "");
      const chip = el("div", {
        class: cls, role: "button", tabindex: "0",
        "aria-current": i === currentIdx ? "step" : null,
      }, [
        el("span", { class: "step-chip__num", text: i < currentIdx ? "✓" : String(i + 1) }),
        el("span", { text: s.label }),
      ]);
      // 이미 도달한 단계는 클릭으로 되돌아가기 허용
      if (i <= maxReached) {
        const nav2 = () => go(s.id);
        chip.addEventListener("click", nav2);
        chip.addEventListener("keydown", (e) => { if (e.key === "Enter") nav2(); });
        chip.style.cursor = "pointer";
      } else {
        chip.style.opacity = "0.55";
      }
      nav.appendChild(chip);
    });
  }

  function reset() {
    destroyCharts();
    DA.reset();
    currentIdx = 0; maxReached = 0;
    go("upload");
  }

  DA.wizard = { go, reset, STEPS, current: () => STEPS[currentIdx].id };
})();
