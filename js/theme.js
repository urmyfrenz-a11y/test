// 다크 모드 토글: 시스템 설정을 기본값으로, 선택값은 localStorage에 저장
(function () {
  'use strict';

  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');

  function getTheme() {
    return root.getAttribute('data-theme') || 'light';
  }

  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    });
  }

  // 사용자가 직접 토글한 적이 없으면 시스템 설정 변경을 따라감
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', function (e) {
    if (!localStorage.getItem('theme')) {
      root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });
})();
