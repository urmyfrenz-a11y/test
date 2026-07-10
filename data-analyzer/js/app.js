/* =========================================================
   app.js — 진입점: 초기화, 라이브러리 확인, 재시작 버튼
   ========================================================= */
(function () {
  "use strict";
  const DA = (window.DA = window.DA || {});

  function checkLibs() {
    const missing = [];
    if (!window.XLSX) missing.push("SheetJS");
    if (!window.Papa) missing.push("PapaParse");
    if (!window.pdfjsLib) missing.push("pdf.js");
    if (!window.jStat) missing.push("jStat");
    if (!window.Chart) missing.push("Chart.js");
    if (!window.jspdf) missing.push("jsPDF");
    if (!window.html2canvas) missing.push("html2canvas");
    if (!window.PptxGenJS) missing.push("PptxGenJS");
    return missing;
  }

  function restart() {
    if (confirm("현재 분석을 모두 지우고 처음부터 다시 시작할까요?")) {
      DA.wizard.reset();
    }
  }

  function init() {
    const missing = checkLibs();
    if (missing.length) {
      const stage = document.getElementById("stage");
      const warn = document.createElement("div");
      warn.className = "note note--warn";
      warn.innerHTML = `일부 라이브러리를 불러오지 못했습니다: <strong>${missing.join(", ")}</strong>. ` +
        `네트워크(CDN) 연결을 확인하세요. 해당 기능이 제한될 수 있습니다.`;
      stage.appendChild(warn);
    }

    const rb = document.getElementById("restart-btn");
    if (rb) rb.addEventListener("click", restart);

    // 테마 변경 시 현재 단계 다시 그려 차트 색상 갱신
    window.addEventListener("da:theme-changed", () => {
      const cur = DA.wizard.current();
      // 차트가 있는 단계만 재렌더
      if (["eda", "analysis", "dashboard"].includes(cur)) DA.wizard.go(cur);
    });

    DA.wizard.go("upload");
  }

  DA.app = { init, restart };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
