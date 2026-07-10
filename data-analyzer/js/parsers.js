/* =========================================================
   parsers.js — 파일 → 데이터셋 파싱 + 컬럼 타입 추론
   지원: xlsx/xls, csv/tsv, txt, pdf
   ========================================================= */
(function () {
  "use strict";
  const DA = (window.DA = window.DA || {});
  const util = DA.util;

  // pdf.js worker
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  }

  let _idSeq = 0;
  const nextId = () => "ds_" + ++_idSeq;

  function readArrayBuffer(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsArrayBuffer(file);
    });
  }
  function readText(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsText(file);
    });
  }

  /**
   * 바이트 버퍼를 텍스트로 디코딩. 인코딩을 자동 감지한다.
   * - BOM(UTF-8/UTF-16) 우선
   * - UTF-8로 디코딩해 치환문자(�, U+FFFD)가 없으면 UTF-8
   * - 있으면 EUC-KR(CP949)로 디코딩해, 치환문자가 더 적은 쪽을 선택
   *   (한국 결제/공공 데이터 CSV는 EUC-KR인 경우가 많음)
   */
  function decodeText(buf) {
    const b = new Uint8Array(buf);
    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF)
      return new TextDecoder("utf-8").decode(buf.slice(3));
    if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder("utf-16le").decode(buf);
    if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder("utf-16be").decode(buf);

    const utf8 = new TextDecoder("utf-8").decode(buf); // 치환 모드
    if (utf8.indexOf("�") === -1) return utf8;

    let euckr = null;
    try { euckr = new TextDecoder("euc-kr").decode(buf); } catch (e) { return utf8; }
    const bad = (s) => { let n = 0; for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 0xFFFD) n++; return n; };
    return bad(euckr) <= bad(utf8) ? euckr : utf8;
  }

  /** 2차원 배열(첫 행 = 헤더) → {columns, rows} */
  function tableFromAoA(aoa, sourceName) {
    // 빈 행 제거
    aoa = aoa.filter((row) => row && row.some((c) => c != null && String(c).trim() !== ""));
    if (aoa.length < 1) throw new Error("빈 표입니다.");
    let header = aoa[0].map((h, i) => {
      const name = h == null || String(h).trim() === "" ? `열${i + 1}` : String(h).trim();
      return name;
    });
    // 헤더 중복 방지
    const seen = {};
    header = header.map((h) => {
      if (seen[h] == null) { seen[h] = 0; return h; }
      seen[h]++; return `${h}_${seen[h]}`;
    });
    const dataRows = aoa.slice(1);
    const rows = dataRows.map((r) => {
      const obj = {};
      header.forEach((h, i) => { obj[h] = r[i] == null ? null : r[i]; });
      return obj;
    });
    const columns = inferColumns(header, rows);
    return { columns, rows };
  }

  /** 컬럼별 타입/통계 추론 */
  function inferColumns(header, rows) {
    return header.map((name) => {
      const raw = rows.map((r) => r[name]);
      const nonNull = raw.filter((v) => v != null && String(v).trim() !== "");
      const missing = rows.length - nonNull.length;
      const uniqueVals = new Set(nonNull.map((v) => String(v)));
      const unique = uniqueVals.size;

      // 수치 판별 (통화/단위/기호 정제 후 판정)
      let numCount = 0;
      for (const v of nonNull) if (util.toNum(v) !== null) numCount++;
      const numRatio = nonNull.length ? numCount / nonNull.length : 0;

      // 날짜 판별
      let dateCount = 0;
      for (const v of nonNull.slice(0, 50)) {
        if (looksLikeDate(v)) dateCount++;
      }
      const dateRatio = Math.min(nonNull.length, 50) ? dateCount / Math.min(nonNull.length, 50) : 0;

      let type;
      if (numRatio >= 0.85 && unique > Math.min(10, rows.length * 0.05)) type = "numeric";
      else if (numRatio >= 0.95) type = "numeric";
      else if (dateRatio >= 0.7 && numRatio < 0.85) type = "datetime";
      else if (unique <= Math.max(20, rows.length * 0.5) && numRatio < 0.85) type = "categorical";
      else if (numRatio >= 0.85) type = "numeric";
      else type = "text";

      // 수치형인데 고유값이 매우 적으면 범주로 재분류 (예: 0/1 라벨)
      if (type === "numeric" && unique <= 2 && rows.length > 10) type = "categorical";

      return {
        name,
        type,
        missing,
        missingRatio: rows.length ? missing / rows.length : 0,
        unique,
        count: nonNull.length,
      };
    });
  }

  function looksLikeDate(v) {
    if (v instanceof Date) return true;
    const s = String(v).trim();
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s)) return true;
    if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(s)) return true;
    return false;
  }

  // ---------- 포맷별 파서 ----------
  async function parseSpreadsheet(file) {
    const buf = await readArrayBuffer(file);
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const datasets = [];
    wb.SheetNames.forEach((sheetName) => {
      const ws = wb.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false });
      if (!aoa.length) return;
      try {
        const { columns, rows } = tableFromAoA(aoa, sheetName);
        if (rows.length) {
          datasets.push({
            id: nextId(),
            name: wb.SheetNames.length > 1 ? `${file.name} — ${sheetName}` : file.name,
            source: file.name,
            kind: "table",
            columns, rows,
          });
        }
      } catch (e) { /* 빈 시트 무시 */ }
    });
    if (!datasets.length) throw new Error("표 데이터를 찾지 못했습니다.");
    return datasets;
  }

  async function parseDelimited(file) {
    const text = decodeText(await readArrayBuffer(file));
    const res = Papa.parse(text, { skipEmptyLines: "greedy", dynamicTyping: false });
    const aoa = res.data;
    if (!aoa || !aoa.length) throw new Error("빈 파일");
    const { columns, rows } = tableFromAoA(aoa, file.name);
    return [{
      id: nextId(), name: file.name, source: file.name,
      kind: "table", columns, rows,
    }];
  }

  async function parseText(file) {
    const text = decodeText(await readArrayBuffer(file));
    // 구분자 감지: 탭/콤마가 여러 줄에 일관되면 표로 처리
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    const delim = detectDelimiter(lines.slice(0, 20));
    if (delim && lines.length > 1) {
      const aoa = lines.map((l) => l.split(delim));
      const cols = aoa[0].length;
      const consistent = aoa.slice(0, 10).every((r) => Math.abs(r.length - cols) <= 1);
      if (consistent && cols > 1) {
        const { columns, rows } = tableFromAoA(aoa, file.name);
        return [{ id: nextId(), name: file.name, source: file.name, kind: "table", columns, rows }];
      }
    }
    // 일반 텍스트: 통계용 텍스트 데이터셋
    return [{
      id: nextId(), name: file.name, source: file.name, kind: "text",
      text,
      textStats: textStats(text),
    }];
  }

  function detectDelimiter(lines) {
    const candidates = ["\t", ",", ";", "|"];
    let best = null, bestScore = 0;
    for (const d of candidates) {
      const counts = lines.map((l) => l.split(d).length - 1);
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      const consistent = counts.every((c) => c > 0 && Math.abs(c - avg) <= 1);
      if (avg > bestScore && consistent && avg >= 1) { bestScore = avg; best = d; }
    }
    return best;
  }

  function textStats(text) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const lines = text.split(/\r?\n/);
    const freq = {};
    for (const w of words) {
      const t = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      if (t.length > 1) freq[t] = (freq[t] || 0) + 1;
    }
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15);
    return { chars: text.length, words: words.length, lines: lines.length, topWords: top };
  }

  async function parsePdf(file) {
    const buf = await readArrayBuffer(file);
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let fullText = "";
    const tableAoAs = []; // { page, aoa }
    const maxPages = Math.min(pdf.numPages, 50);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // 텍스트 요약용 (읽기 순서: y 내림차순, x 오름차순 기반은 아래 라인 재구성에서)
      const lines = buildLines(content.items);
      fullText += lines.map((l) => l.items.map((c) => c.s).join(" ")).join("\n") + "\n";
      // 좌표 기반 표 추출
      extractTables(lines).forEach((aoa) => tableAoAs.push({ page: i, aoa }));
    }

    const out = [];
    // 추출된 표 → 데이터셋 (수치 컬럼이 많고 행이 많은 표를 앞쪽=기본 대상으로)
    const built = [];
    tableAoAs.forEach(({ page, aoa }) => {
      try {
        const { columns, rows } = tableFromAoA(dropTotalsRows(aoa), file.name);
        if (rows.length >= 2 && columns.length >= 2) {
          const numericCols = columns.filter((c) => c.type === "numeric").length;
          built.push({ page, columns, rows, numericCols });
        }
      } catch (e) { /* skip */ }
    });
    built.sort((a, b) => b.numericCols - a.numericCols || b.rows.length - a.rows.length);
    built.forEach((t, idx) => {
      out.push({
        id: nextId(),
        name: `${file.name} · 표 ${idx + 1} (p${t.page}, ${t.rows.length}행×${t.columns.length}열)`,
        source: file.name, kind: "table", columns: t.columns, rows: t.rows, fromPdf: true,
      });
    });

    // 전체 텍스트 데이터셋도 항상 포함
    out.push({
      id: nextId(), name: `${file.name} (전체 텍스트)`, source: file.name, kind: "text",
      text: fullText, textStats: textStats(fullText), pages: pdf.numPages,
    });
    return out;
  }

  /**
   * pdf.js 텍스트 아이템을 시각적 행(line)으로 묶는다.
   * 각 아이템의 좌표 transform[4]=x, transform[5]=y, width=폭 사용.
   */
  function buildLines(items) {
    const cells = items
      .filter((it) => it.str && it.str.trim() !== "")
      .map((it) => ({
        s: it.str.replace(/\s+/g, " ").trim(),
        x: it.transform[4],
        y: it.transform[5],
        w: it.width || (it.str.length * (Math.abs(it.transform[0]) || 5)),
        h: Math.abs(it.transform[3]) || 10,
      }));
    cells.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const c of cells) {
      let line = null;
      for (const L of lines) {
        if (Math.abs(L.y - c.y) <= Math.max(3, c.h * 0.5)) { line = L; break; }
      }
      if (!line) { line = { y: c.y, items: [] }; lines.push(line); }
      line.items.push(c);
      line.y = (line.y * (line.items.length - 1) + c.y) / line.items.length;
    }
    lines.sort((a, b) => b.y - a.y);
    lines.forEach((L) => L.items.sort((a, b) => a.x - b.x));
    return lines;
  }

  /** 한 행의 아이템들을 x-간격 기준으로 셀(열)로 분할 */
  function splitCells(items) {
    if (!items.length) return [];
    const fh = Math.max(8, ...items.map((i) => i.h));
    const gapThreshold = fh * 1.2; // 이보다 크게 벌어지면 열 경계
    const cells = [];
    let text = items[0].s;
    let start = items[0].x;
    let end = items[0].x + items[0].w;
    for (let i = 1; i < items.length; i++) {
      const it = items[i];
      const gap = it.x - end;
      if (gap > gapThreshold) {
        cells.push({ text: text.trim(), x: start });
        text = it.s; start = it.x;
      } else {
        text += (gap > fh * 0.25 ? " " : "") + it.s;
      }
      end = it.x + it.w;
    }
    cells.push({ text: text.trim(), x: start });
    return cells;
  }

  /**
   * 라인들에서 표 블록을 검출한다.
   * - 각 라인을 셀로 분할 → 2개 이상 셀을 가진 라인이 연속되면 표 후보
   * - 블록 내 최빈 열 수를 채택, 3행 이상일 때만 표로 인정
   */
  function extractTables(lines) {
    const lineCells = lines.map((L) => splitCells(L.items));
    const blocks = [];
    let cur = [];
    for (const lc of lineCells) {
      if (lc.length >= 2) cur.push(lc);
      else { if (cur.length) { blocks.push(cur); cur = []; } }
    }
    if (cur.length) blocks.push(cur);

    const tables = [];
    for (const block of blocks) {
      const counts = {};
      block.forEach((l) => (counts[l.length] = (counts[l.length] || 0) + 1));
      const modal = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
      if (modal < 2) continue;
      const kept = block.filter((l) => l.length === modal);
      if (kept.length < 3) continue;
      tables.push(kept.map((l) => l.map((c) => c.text)));
    }
    return tables;
  }

  /** 표에서 합계/총계 행 제거 (헤더는 유지). 상관/회귀 왜곡 방지. */
  function dropTotalsRows(aoa) {
    if (aoa.length <= 2) return aoa;
    const re = /^(합계|총계|소계|누계|계|total|sum|평균|average)$/i;
    return aoa.filter((row, i) => {
      if (i === 0) return true; // 헤더
      const first = row[0] == null ? "" : String(row[0]).trim();
      return !re.test(first);
    });
  }

  /** 파일 하나 파싱 → 데이터셋 배열 */
  async function parseFile(file) {
    const ext = util.ext(file.name);
    switch (ext) {
      case "xlsx": case "xls": case "xlsm": return parseSpreadsheet(file);
      case "csv": case "tsv": return parseDelimited(file);
      case "txt": return parseText(file);
      case "pdf": return parsePdf(file);
      default:
        // 확장자 불명 → 텍스트 시도
        return parseText(file);
    }
  }

  DA.parsers = { parseFile, inferColumns, tableFromAoA, buildLines, splitCells, extractTables };
})();
