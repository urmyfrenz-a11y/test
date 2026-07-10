/* =========================================================
   state.js — 전역 네임스페이스 + 공유 상태
   전역 오염을 피하기 위해 단일 window.DA 객체만 노출한다.
   ========================================================= */
(function () {
  "use strict";

  const DA = (window.DA = window.DA || {});

  // 유틸 모음
  DA.util = {
    /** 안전한 HTML 이스케이프 */
    esc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
    /** 숫자 포맷 (유효숫자/천단위) */
    fmt(n, digits = 2) {
      if (n == null || Number.isNaN(n)) return "—";
      if (!Number.isFinite(n)) return n > 0 ? "∞" : "-∞";
      const abs = Math.abs(n);
      if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return n.toExponential(2);
      const rounded = Number(n.toFixed(digits));
      return rounded.toLocaleString(undefined, { maximumFractionDigits: digits });
    },
    fmtInt(n) {
      if (n == null || Number.isNaN(n)) return "—";
      return Math.round(n).toLocaleString();
    },
    pct(n, digits = 1) {
      if (n == null || Number.isNaN(n)) return "—";
      return (n * 100).toFixed(digits) + "%";
    },
    /** 파일 확장자 (소문자) */
    ext(name) {
      const m = /\.([^.]+)$/.exec(name || "");
      return m ? m[1].toLowerCase() : "";
    },
    /** 바이트 → 사람이 읽는 크기 */
    fileSize(bytes) {
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / 1024 / 1024).toFixed(1) + " MB";
    },
    /** DOM 헬퍼 */
    el(tag, attrs = {}, children = []) {
      const node = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") node.className = v;
        else if (k === "html") node.innerHTML = v;
        else if (k === "text") node.textContent = v;
        else if (k.startsWith("on") && typeof v === "function")
          node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v != null) node.setAttribute(k, v);
      }
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null) return;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
      return node;
    },
    typeBadge(type) {
      const label = { numeric: "수치", categorical: "범주", datetime: "날짜", text: "텍스트" }[type] || type;
      return `<span class="type-badge type-${type}">${label}</span>`;
    },
  };

  // 애플리케이션 공유 상태
  DA.state = {
    files: [],        // { file, name, ext, size, status, error }
    datasets: [],     // { id, name, columns:[{name,type,...}], rows:[{}], textPreview? }
    primaryId: null,  // 분석 대상 데이터셋 id
    eda: null,        // EDA 결과
    target: null,     // { column, kind, question, chosen }
    importance: null, // { ranking:[...], tests:[...] }
    selectedDrivers: [], // 사용자가 최종 선택한 원인 변수명 배열
    analysis: null,   // 분석 결과
    insights: [],     // [{title,text,kind}]
    charts: [],       // Chart.js 인스턴스 (정리용)
  };

  DA.get = () => DA.state;

  /** 현재 분석 대상 데이터셋 반환 */
  DA.primary = () => DA.state.datasets.find((d) => d.id === DA.state.primaryId) || null;

  /** 상태 전체 초기화 (처음부터 다시) */
  DA.reset = function () {
    DA.state.charts.forEach((c) => { try { c.destroy(); } catch (e) {} });
    DA.state.files = [];
    DA.state.datasets = [];
    DA.state.primaryId = null;
    DA.state.eda = null;
    DA.state.target = null;
    DA.state.importance = null;
    DA.state.selectedDrivers = [];
    DA.state.analysis = null;
    DA.state.insights = [];
    DA.state.charts = [];
  };
})();
