// 글 목록 로드 및 개별 글 렌더링
(function () {
  'use strict';

  // 푸터 연도
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // ===== 목록 페이지 =====
  var listEl = document.getElementById('post-list');
  if (listEl) {
    fetch('posts/posts.json')
      .then(function (res) {
        if (!res.ok) throw new Error('posts.json 로드 실패');
        return res.json();
      })
      .then(function (posts) {
        posts.sort(function (a, b) {
          return new Date(b.date) - new Date(a.date);
        });
        if (!posts.length) {
          listEl.innerHTML = '<li class="post-list__loading">아직 글이 없습니다.</li>';
          return;
        }
        listEl.innerHTML = posts.map(function (p) {
          return '<li class="post-item">' +
            '<a href="post.html?slug=' + encodeURIComponent(p.slug) + '">' +
            '<h2 class="post-item__title">' + escapeText(p.title) + '</h2>' +
            '<span class="post-item__date">' + formatDate(p.date) + '</span>' +
            (p.summary ? '<p class="post-item__summary">' + escapeText(p.summary) + '</p>' : '') +
            '</a></li>';
        }).join('');
      })
      .catch(function (err) {
        listEl.innerHTML = '<li class="post-list__loading">글 목록을 불러올 수 없습니다. ' +
          '로컬 서버로 실행했는지 확인하세요.</li>';
        console.error(err);
      });
  }

  // ===== 개별 글 페이지 =====
  var contentEl = document.getElementById('post-content');
  if (contentEl) {
    var slug = new URLSearchParams(window.location.search).get('slug');
    var titleEl = document.getElementById('post-title');
    var dateEl = document.getElementById('post-date');

    if (!slug) {
      titleEl.textContent = '글을 찾을 수 없습니다';
      contentEl.innerHTML = '<p><a href="index.html">목록으로 돌아가기</a></p>';
      return;
    }

    // 메타데이터 + 본문 동시 로드
    Promise.all([
      fetch('posts/posts.json').then(function (r) { return r.json(); }),
      fetch('posts/' + slug + '.md').then(function (r) {
        if (!r.ok) throw new Error('글 파일을 찾을 수 없습니다');
        return r.text();
      })
    ])
      .then(function (results) {
        var posts = results[0];
        var markdown = results[1];
        var meta = posts.find(function (p) { return p.slug === slug; }) || {};

        var title = meta.title || slug;
        titleEl.textContent = title;
        document.title = title + ' · My Blog';
        dateEl.textContent = formatDate(meta.date);

        contentEl.innerHTML = window.MarkdownParser.parse(markdown);
      })
      .catch(function (err) {
        titleEl.textContent = '글을 불러올 수 없습니다';
        contentEl.innerHTML = '<p>요청한 글이 없거나 로컬 서버가 필요합니다. ' +
          '<a href="index.html">목록으로</a></p>';
        console.error(err);
      });
  }

  function escapeText(text) {
    var div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }
})();
