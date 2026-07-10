/* =========================================================
   report.js — 최종 리포트 다운로드 (PDF / PPTX)
   - PDF: 리포트를 HTML로 만들어 시스템 폰트로 렌더 → html2canvas 캡처 →
          이미지로 PDF에 삽입(페이지 자동 분할). jsPDF 내장 폰트를 쓰지 않으므로
          한글이 깨지지 않는다.
   - PPTX: 슬라이드 텍스트에 한글 폰트 지정 (PptxGenJS)
   ========================================================= */
(function () {
  "use strict";
  const DA = (window.DA = window.DA || {});
  const { util } = DA;

  // 캡처용 시스템 폰트 스택 (사용자 OS의 한글 폰트를 그대로 사용)
  const FONT_STACK =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple SD Gothic Neo", ' +
    '"Noto Sans KR", "Malgun Gothic", "맑은 고딕", sans-serif';
  const KFONT = "맑은 고딕"; // PPTX용 한글 폰트

  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function stamp() {
    const d = new Date();
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function summaryLines() {
    const st = DA.get();
    const { eda, target, importance, analysis } = st;
    const lines = [];
    lines.push(["데이터", `${DA.primary() ? DA.primary().name : "-"} · ${util.fmtInt(eda.rows)}행 × ${util.fmtInt(eda.cols)}열`]);
    lines.push(["분석 목표", `${target.question}`]);
    lines.push(["타겟 변수", `${target.column} (${target.kind === "regression" ? "회귀" : "분류"})`]);
    if (analysis && analysis.kind === "regression" && !analysis.error)
      lines.push(["모델 설명력", `R² = ${util.pct(analysis.r2)} (수정 R² ${util.pct(analysis.adjR2)})`]);
    if (analysis && analysis.kind === "classification")
      lines.push(["클래스", `${analysis.classes.length}개 · 베이스라인 ${util.pct(analysis.baseline)}`]);
    const top = importance && importance.ranking.slice(0, 5).map((r) => `${r.name}(${util.fmt(r.score)}${r.sig ? "*" : ""})`).join(", ");
    lines.push(["영향 변수 Top5", top || "-"]);
    return lines;
  }

  /* ---------------- 리포트 HTML 노드 (시스템 폰트, 흰 배경) ---------------- */
  function buildReportNode() {
    const st = DA.get();
    const esc = util.esc;
    const wrap = document.createElement("div");
    // 화면 밖에 배치하되 렌더는 되도록 (html2canvas가 캡처 가능)
    wrap.style.cssText =
      "position:fixed; left:-10000px; top:0; width:820px; background:#ffffff; color:#1f2733;" +
      `font-family:${FONT_STACK}; padding:40px; box-sizing:border-box; line-height:1.6;`;

    const rows = summaryLines().map(([k, v]) =>
      `<tr>
         <td style="padding:8px 12px;background:#eef2fa;font-weight:700;white-space:nowrap;vertical-align:top;border:1px solid #e2e6ea">${esc(k)}</td>
         <td style="padding:8px 12px;border:1px solid #e2e6ea">${esc(v)}</td>
       </tr>`).join("");

    const insights = (st.insights || []).map((ins, i) => {
      const color = ins.kind === "warning" ? "#c9820a" : ins.kind === "success" ? "#1f9d63" : "#3b6ef5";
      return `<div style="border:1px solid #e2e6ea;border-left:4px solid ${color};border-radius:8px;padding:14px 16px;margin-bottom:12px">
          <div style="font-weight:700;margin-bottom:4px">${i + 1}. ${esc(ins.title)}</div>
          <div style="font-size:14px;color:#5c6773">${esc(ins.text)}</div>
        </div>`;
    }).join("");

    wrap.innerHTML = `
      <div style="font-size:30px;font-weight:800;letter-spacing:-.5px">데이터 분석 리포트</div>
      <div style="color:#8a93a0;font-size:13px;margin-top:6px">${esc(new Date().toLocaleString())}</div>

      <div style="font-size:18px;font-weight:700;margin:28px 0 10px;border-bottom:2px solid #3b6ef5;padding-bottom:6px">분석 요약</div>
      <table style="border-collapse:collapse;width:100%;font-size:14px">${rows}</table>

      <div style="font-size:18px;font-weight:700;margin:28px 0 12px;border-bottom:2px solid #3b6ef5;padding-bottom:6px">핵심 인사이트</div>
      ${insights || '<div style="color:#8a93a0">도출된 인사이트가 없습니다.</div>'}
    `;
    return wrap;
  }

  /** 큰 캔버스를 A4 페이지 크기에 맞춰 잘라 PDF에 추가 */
  function addCanvasPaged(doc, canvas, opts) {
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 40;
    const imgW = W - 2 * M;
    const pxPerUnit = canvas.width / imgW;          // 캔버스 px → PDF 단위
    const pageHpx = (H - 2 * M) * pxPerUnit;        // 한 페이지에 담기는 캔버스 px 높이
    let offset = 0;
    let first = opts && opts.firstOnCurrentPage;
    while (offset < canvas.height) {
      const sliceH = Math.min(pageHpx, canvas.height - offset);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceH;
      const ctx = pageCanvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, sliceH);
      ctx.drawImage(canvas, 0, offset, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      if (!first) doc.addPage();
      first = false;
      // 용량 절감을 위해 JPEG(고품질)로 삽입 — 흰 배경이라 아티팩트 최소
      doc.addImage(pageCanvas.toDataURL("image/jpeg", 0.92), "JPEG", M, M, imgW, sliceH / pxPerUnit);
      offset += sliceH;
    }
  }

  async function capture(node) {
    return html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true, windowWidth: node.scrollWidth || 820 });
  }

  /* ---------------- PDF ---------------- */
  async function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    // 1) 요약 + 인사이트 (시스템 폰트로 렌더된 이미지)
    const reportNode = buildReportNode();
    document.body.appendChild(reportNode);
    try {
      const canvas = await capture(reportNode);
      addCanvasPaged(doc, canvas, { firstOnCurrentPage: true });
    } finally {
      reportNode.remove();
    }

    // 2) 대시보드 (라이브 차트 포함)
    const dash = document.getElementById("dashboard-capture");
    if (dash) {
      const dcanvas = await html2canvas(dash, { scale: 2, backgroundColor: cssVar("--surface") || "#ffffff", useCORS: true });
      doc.addPage();
      addCanvasPaged(doc, dcanvas, { firstOnCurrentPage: true });
    }

    doc.save(`data-report_${stamp()}.pdf`);
  }

  /* ---------------- PPTX ---------------- */
  async function exportPPTX() {
    const st = DA.get();
    const pptx = new window.PptxGenJS();
    pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
    pptx.layout = "WIDE";
    const ACCENT = "3B6EF5", DARK = "1F2733", MUTED = "5C6773";
    const F = { fontFace: KFONT };

    // 1) 표지
    let s = pptx.addSlide();
    s.background = { color: "F6F7F9" };
    s.addText("데이터 분석 리포트", { x: 0.7, y: 2.4, w: 12, h: 1, fontSize: 40, bold: true, color: DARK, ...F });
    s.addText(`${DA.primary() ? DA.primary().name : ""}`, { x: 0.7, y: 3.5, w: 12, h: 0.5, fontSize: 18, color: MUTED, ...F });
    s.addText(new Date().toLocaleString(), { x: 0.7, y: 4.0, w: 12, h: 0.4, fontSize: 12, color: MUTED, ...F });

    // 2) 요약
    s = pptx.addSlide();
    slideTitle(s, "분석 요약", ACCENT);
    const rows = summaryLines().map(([k, v]) => [
      { text: k, options: { bold: true, color: DARK, fill: { color: "EEF2FA" }, ...F } },
      { text: v, options: { color: DARK, ...F } },
    ]);
    s.addTable(rows, { x: 0.7, y: 1.4, w: 12, colW: [3, 9], fontSize: 14, fontFace: KFONT, border: { pt: 0.5, color: "DDDDDD" }, rowH: 0.5, valign: "middle" });

    // 3) 영향 변수 순위
    s = pptx.addSlide();
    slideTitle(s, "원인 변수 영향력 순위", ACCENT);
    const ranking = (st.importance && st.importance.ranking) || [];
    const hdr = (t) => ({ text: t, options: { bold: true, fill: { color: "EEF2FA" }, ...F } });
    const rk = [[hdr("순위"), hdr("변수"), hdr("영향도"), hdr("효과크기"), hdr("유의성")]];
    ranking.slice(0, 10).forEach((r, i) => rk.push([
      String(i + 1), r.name, util.fmt(r.score), r.effect, r.sig ? "유의 ✓" : "비유의",
    ]));
    s.addTable(rk, { x: 0.7, y: 1.4, w: 12, fontSize: 13, fontFace: KFONT, border: { pt: 0.5, color: "DDDDDD" }, rowH: 0.4, valign: "middle" });

    // 4) 대시보드 차트 이미지
    const node = document.getElementById("dashboard-capture");
    if (node && window.html2canvas) {
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#FFFFFF", useCORS: true });
      const img = canvas.toDataURL("image/png");
      s = pptx.addSlide();
      slideTitle(s, "요약 대시보드", ACCENT);
      const ratio = canvas.height / canvas.width;
      let w = 11.5, h = w * ratio;
      if (h > 5.6) { h = 5.6; w = h / ratio; }
      s.addImage({ data: img, x: (13.33 - w) / 2, y: 1.5, w, h });
    }

    // 5) 인사이트
    s = pptx.addSlide();
    slideTitle(s, "핵심 인사이트", ACCENT);
    let yy = 1.5;
    (st.insights || []).forEach((ins, i) => {
      s.addText([
        { text: `${i + 1}. ${ins.title}\n`, options: { bold: true, fontSize: 15, color: DARK, ...F } },
        { text: ins.text, options: { fontSize: 12, color: MUTED, ...F } },
      ], { x: 0.8, y: yy, w: 11.7, h: 1.0, valign: "top" });
      yy += 1.05;
    });

    await pptx.writeFile({ fileName: `data-report_${stamp()}.pptx` });
  }

  function slideTitle(s, text, color) {
    s.addText(text, { x: 0.7, y: 0.5, w: 12, h: 0.7, fontSize: 26, bold: true, color: "1F2733", fontFace: KFONT });
    s.addShape("line", { x: 0.7, y: 1.25, w: 12, h: 0, line: { color, width: 2 } });
  }

  DA.report = { exportPDF, exportPPTX };
})();
