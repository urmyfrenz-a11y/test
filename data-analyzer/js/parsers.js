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

      // 수치 판별
      let numCount = 0;
      for (const v of nonNull) if (Number.isFinite(Number(v))) numCount++;
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

  function parseDelimited(file) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        skipEmptyLines: "greedy",
        dynamicTyping: false,
        complete: (res) => {
          try {
            const aoa = res.data;
            if (!aoa.length) return reject(new Error("빈 파일"));
            const { columns, rows } = tableFromAoA(aoa, file.name);
            resolve([{
              id: nextId(), name: file.name, source: file.name,
              kind: "table", columns, rows,
            }]);
          } catch (e) { reject(e); }
        },
        error: (err) => reject(err),
      });
    });
  }

  async function parseText(file) {
    const text = await readText(file);
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
    const pageTexts = [];
    const maxPages = Math.min(pdf.numPages, 50);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((it) => it.str);
      const pageText = strings.join(" ");
      pageTexts.push(pageText);
      fullText += pageText + "\n";
    }
    // PDF 안에서 표를 best-effort로 추출 시도 (줄바꿈+공백 정렬 기반)
    const tables = tryExtractPdfTables(pageTexts);
    const ds = {
      id: nextId(), name: file.name, source: file.name, kind: "text",
      text: fullText, textStats: textStats(fullText),
      pages: pdf.numPages,
    };
    const out = [ds];
    if (tables) {
      try {
        const { columns, rows } = tableFromAoA(tables, file.name);
        if (rows.length >= 3 && columns.length >= 2) {
          out.unshift({
            id: nextId(), name: `${file.name} (추출된 표)`, source: file.name,
            kind: "table", columns, rows, fromPdf: true,
          });
        }
      } catch (e) { /* 표 추출 실패 시 텍스트만 */ }
    }
    return out;
  }

  // PDF 텍스트에서 표 후보 추출 (2칸 이상 공백을 구분자로 가정)
  function tryExtractPdfTables(pageTexts) {
    const allLines = pageTexts.join("\n").split(/\n/);
    const rows = [];
    for (const line of allLines) {
      const cells = line.split(/\s{2,}|\t/).map((c) => c.trim()).filter((c) => c !== "");
      if (cells.length >= 2) rows.push(cells);
    }
    // 열 수가 가장 흔한 값으로 정규화된 연속 구간만 채택
    if (rows.length < 4) return null;
    const counts = {};
    rows.forEach((r) => (counts[r.length] = (counts[r.length] || 0) + 1));
    const common = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
    const filtered = rows.filter((r) => r.length === common);
    return filtered.length >= 4 ? filtered : null;
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

  DA.parsers = { parseFile, inferColumns, tableFromAoA };
})();
