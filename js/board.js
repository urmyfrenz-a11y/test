// 방명록: Supabase REST API를 fetch로 직접 호출 (외부 라이브러리 없음)
(function () {
  'use strict';

  var cfg = window.SUPABASE_CONFIG;
  var REST = cfg.url + '/rest/v1/guestbook';
  var headers = {
    'apikey': cfg.key,
    'Authorization': 'Bearer ' + cfg.key
  };

  var listEl = document.getElementById('gb-list');
  var form = document.getElementById('guestbook-form');
  var nameEl = document.getElementById('gb-name');
  var msgEl = document.getElementById('gb-message');
  var submitEl = document.getElementById('gb-submit');
  var statusEl = document.getElementById('gb-status');

  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  function escapeText(text) {
    var div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function setStatus(text, isError) {
    statusEl.textContent = text || '';
    statusEl.classList.toggle('gb-status--error', !!isError);
  }

  function render(entries) {
    if (!entries.length) {
      listEl.innerHTML = '<li class="gb-list__empty">아직 글이 없습니다. 첫 글을 남겨보세요!</li>';
      return;
    }
    listEl.innerHTML = entries.map(function (e) {
      return '<li class="gb-entry">' +
        '<div class="gb-entry__head">' +
          '<span class="gb-entry__name">' + escapeText(e.name) + '</span>' +
          '<time class="gb-entry__date">' + formatDate(e.created_at) + '</time>' +
        '</div>' +
        '<p class="gb-entry__message">' + escapeText(e.message) + '</p>' +
      '</li>';
    }).join('');
  }

  function load() {
    fetch(REST + '?select=*&order=created_at.desc', { headers: headers })
      .then(function (res) {
        if (!res.ok) throw new Error('목록 로드 실패 (' + res.status + ')');
        return res.json();
      })
      .then(render)
      .catch(function (err) {
        listEl.innerHTML = '<li class="gb-list__empty">방명록을 불러올 수 없습니다.</li>';
        console.error(err);
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = nameEl.value.trim();
    var message = msgEl.value.trim();
    if (!name || !message) {
      setStatus('이름과 내용을 모두 입력해주세요.', true);
      return;
    }

    submitEl.disabled = true;
    setStatus('저장 중…', false);

    fetch(REST, {
      method: 'POST',
      headers: Object.assign({}, headers, {
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }),
      body: JSON.stringify({ name: name, message: message })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('저장 실패 (' + res.status + ')');
        form.reset();
        setStatus('등록되었습니다!', false);
        load();
      })
      .catch(function (err) {
        setStatus('저장에 실패했습니다. 잠시 후 다시 시도해주세요.', true);
        console.error(err);
      })
      .finally(function () {
        submitEl.disabled = false;
      });
  });

  load();
})();
