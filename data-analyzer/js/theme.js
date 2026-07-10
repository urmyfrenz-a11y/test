/* =========================================================
   theme.js — 다크 모드 토글 / 저장 (localStorage)
   ========================================================= */
(function () {
  "use strict";
  const DA = (window.DA = window.DA || {});
  const KEY = "da-theme";

  function current() {
    return document.documentElement.getAttribute("data-theme") || "light";
  }
  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
    // 차트 색상은 CSS 변수를 읽으므로, 테마 변경 시 다시 그리도록 이벤트 방출
    window.dispatchEvent(new CustomEvent("da:theme-changed", { detail: { theme } }));
  }
  function toggle() {
    const next = current() === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, next); } catch (e) {}
    apply(next);
  }

  DA.theme = { current, apply, toggle };

  document.addEventListener("DOMContentLoaded", () => {
    apply(current());
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.addEventListener("click", toggle);
  });
})();
