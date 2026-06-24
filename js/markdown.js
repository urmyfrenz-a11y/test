// 경량 마크다운 → HTML 파서 (의존성 없음)
// 지원: 제목, 굵게/기울임, 인라인 코드, 코드블록, 링크, 이미지,
//       순서/비순서 목록, 인용구, 수평선, 표, 문단
window.MarkdownParser = (function () {
  'use strict';

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 줄 단위가 아닌 인라인 요소 처리 (이미 HTML 이스케이프된 텍스트에 적용)
  function inline(text) {
    // 이미지: ![alt](src)
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g,
      '<img src="$2" alt="$1">');
    // 링크: [텍스트](url)
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
      '<a href="$2">$1</a>');
    // 인라인 코드: `code`
    text = text.replace(/`([^`]+)`/g, function (_, code) {
      return '<code>' + code + '</code>';
    });
    // 굵게: **text**
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // 기울임: *text*
    text = text.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    return text;
  }

  function parse(markdown) {
    var lines = markdown.replace(/\r\n/g, '\n').split('\n');
    var html = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      // 코드 블록 (``` ... ```)
      var fence = line.match(/^```(.*)$/);
      if (fence) {
        var code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) {
          code.push(escapeHtml(lines[i]));
          i++;
        }
        i++; // 닫는 ``` 건너뛰기
        html.push('<pre><code>' + code.join('\n') + '</code></pre>');
        continue;
      }

      // 수평선
      if (/^(\s*([-*_])\s*){3,}$/.test(line)) {
        html.push('<hr>');
        i++;
        continue;
      }

      // 제목 (# ~ ######)
      var heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        var level = heading[1].length;
        html.push('<h' + level + '>' + inline(escapeHtml(heading[2])) + '</h' + level + '>');
        i++;
        continue;
      }

      // 인용구 (>)
      if (/^>\s?/.test(line)) {
        var quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        html.push('<blockquote>' + parse(quote.join('\n')) + '</blockquote>');
        continue;
      }

      // 표 (| ... | 와 구분선 |---|---|)
      if (/^\|.*\|/.test(line) && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
        var headerCells = splitRow(line);
        i += 2; // 헤더 + 구분선
        var rows = [];
        while (i < lines.length && /^\|.*\|/.test(lines[i])) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        html.push(buildTable(headerCells, rows));
        continue;
      }

      // 비순서 목록 (-, *, +)
      if (/^\s*[-*+]\s+/.test(line)) {
        var ul = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          ul.push('<li>' + inline(escapeHtml(lines[i].replace(/^\s*[-*+]\s+/, ''))) + '</li>');
          i++;
        }
        html.push('<ul>' + ul.join('') + '</ul>');
        continue;
      }

      // 순서 목록 (1. 2. ...)
      if (/^\s*\d+\.\s+/.test(line)) {
        var ol = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          ol.push('<li>' + inline(escapeHtml(lines[i].replace(/^\s*\d+\.\s+/, ''))) + '</li>');
          i++;
        }
        html.push('<ol>' + ol.join('') + '</ol>');
        continue;
      }

      // 빈 줄
      if (/^\s*$/.test(line)) {
        i++;
        continue;
      }

      // 문단 (빈 줄 또는 블록 시작 전까지)
      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) &&
             !/^(#{1,6}\s|>|```|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i]) &&
             !/^(\s*([-*_])\s*){3,}$/.test(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      html.push('<p>' + inline(escapeHtml(para.join(' '))) + '</p>');
    }

    return html.join('\n');
  }

  function splitRow(line) {
    return line.replace(/^\||\|$/g, '').split('|').map(function (c) {
      return c.trim();
    });
  }

  function buildTable(header, rows) {
    var thead = '<thead><tr>' + header.map(function (c) {
      return '<th>' + inline(escapeHtml(c)) + '</th>';
    }).join('') + '</tr></thead>';
    var tbody = '<tbody>' + rows.map(function (row) {
      return '<tr>' + row.map(function (c) {
        return '<td>' + inline(escapeHtml(c)) + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody>';
    return '<table>' + thead + tbody + '</table>';
  }

  return { parse: parse };
})();
