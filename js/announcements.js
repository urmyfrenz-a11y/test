// 회사 공지사항: Supabase REST API를 fetch로 직접 호출 (읽기 전용)
// 페이지당 5개, 5개 초과 시 페이지네이션
(function () {
  'use strict';

  var cfg = window.SUPABASE_CONFIG;
  if (!cfg) return;

  var REST = cfg.url + '/rest/v1/announcements';
  var headers = {
    'apikey': cfg.key,
    'Authorization': 'Bearer ' + cfg.key
  };

  var PAGE_SIZE = 5;

  var listEl = document.getElementById('notice-list');
  var pagerEl = document.getElementById('notice-pager');
  if (!listEl) return;

  function escapeText(text) {
    var div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function render(items) {
    if (!items.length) {
      listEl.innerHTML = '<li class="notice-list__empty">등록된 공지사항이 없습니다.</li>';
      return;
    }
    listEl.innerHTML = items.map(function (a) {
      return '<li class="notice-item">' +
        '<div class="notice-item__head">' +
          '<span class="notice-item__title">' + escapeText(a.title) + '</span>' +
          '<time class="notice-item__date">' + formatDate(a.created_at) + '</time>' +
        '</div>' +
        (a.content ? '<p class="notice-item__content">' + escapeText(a.content) + '</p>' : '') +
      '</li>';
    }).join('');
  }

  function renderPager(currentPage, totalPages) {
    if (totalPages <= 1) { pagerEl.innerHTML = ''; return; }

    var html = '';
    html += '<button class="notice-pager__btn" data-page="' + (currentPage - 1) + '"' +
            (currentPage === 0 ? ' disabled' : '') + ' aria-label="이전 페이지">‹</button>';
    for (var i = 0; i < totalPages; i++) {
      html += '<button class="notice-pager__btn notice-pager__num' +
              (i === currentPage ? ' is-active' : '') + '" data-page="' + i + '"' +
              (i === currentPage ? ' aria-current="page"' : '') + '>' + (i + 1) + '</button>';
    }
    html += '<button class="notice-pager__btn" data-page="' + (currentPage + 1) + '"' +
            (currentPage >= totalPages - 1 ? ' disabled' : '') + ' aria-label="다음 페이지">›</button>';
    pagerEl.innerHTML = html;
  }

  function load(page) {
    var from = page * PAGE_SIZE;
    var to = from + PAGE_SIZE - 1;
    fetch(REST + '?select=*&order=created_at.desc', {
      headers: Object.assign({}, headers, {
        'Range-Unit': 'items',
        'Range': from + '-' + to,
        'Prefer': 'count=exact'
      })
    })
      .then(function (res) {
        if (!res.ok && res.status !== 206) throw new Error('공지 로드 실패 (' + res.status + ')');
        // Content-Range: "0-4/7" 형태에서 전체 개수 파싱
        var total = 0;
        var cr = res.headers.get('content-range');
        if (cr && cr.indexOf('/') >= 0) {
          var t = cr.split('/')[1];
          total = (t === '*') ? 0 : parseInt(t, 10);
        }
        return res.json().then(function (items) {
          return { items: items, total: total };
        });
      })
      .then(function (data) {
        render(data.items);
        var totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
        // 범위를 벗어난 페이지 보정
        if (page >= totalPages) { load(totalPages - 1); return; }
        renderPager(page, totalPages);
      })
      .catch(function (err) {
        listEl.innerHTML = '<li class="notice-list__empty">공지사항을 불러올 수 없습니다.</li>';
        pagerEl.innerHTML = '';
        console.error(err);
      });
  }

  pagerEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.notice-pager__btn');
    if (!btn || btn.disabled) return;
    var page = parseInt(btn.getAttribute('data-page'), 10);
    if (!isNaN(page) && page >= 0) load(page);
  });

  load(0);
})();
