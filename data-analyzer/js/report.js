/* =========================================================
   report.js — 최종 리포트 다운로드 (PDF / PPTX)
   - PDF: 대시보드 캡처 + 텍스트 요약 (jsPDF + html2canvas)
   - PPTX: 슬라이드 구성 (PptxGenJS)
   ========================================================= */
(function () {
  "use strict";
  const DA = (window.DA = window.DA || {});
  const { util } = DA;

  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function stamp() {
    // Date 사용 (브라우저 런타임이므로 안전)
    const d = new Date();
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function summaryLines() {
    const st = DA.get();
    const { eda, target, importance, analysis, insights } = st;
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

  /* ---------------- PDF ---------------- */
  async function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 40;
    const st = DA.get();

    // 표지 텍스트
    doc.setFontSize(20);
    doc.text("Data Analysis Report", M, 60);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(new Date().toLocaleString(), M, 78);
    doc.setTextColor(30);

    let y = 110;
    doc.setFontSize(13);
    doc.text("Summary", M, y); y += 8;
    doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 18;
    doc.setFontSize(10);
    summaryLines().forEach(([k, v]) => {
      doc.setTextColor(110); doc.text(safe(k), M, y);
      doc.setTextColor(30);
      const wrapped = doc.splitTextToSize(safe(v), W - M - 150);
      doc.text(wrapped, M + 120, y);
      y += Math.max(16, wrapped.length * 13);
    });

    // 인사이트
    y += 10;
    doc.setFontSize(13); doc.text("Key Insights", M, y); y += 8;
    doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 18;
    doc.setFontSize(10);
    (st.insights || []).forEach((ins, i) => {
      if (y > H - 80) { doc.addPage(); y = 60; }
      doc.setTextColor(30); doc.setFont(undefined, "bold");
      const t = doc.splitTextToSize(`${i + 1}. ${safe(ins.title)}`, W - 2 * M);
      doc.text(t, M, y); y += t.length * 14;
      doc.setFont(undefined, "normal"); doc.setTextColor(90);
      const b = doc.splitTextToSize(safe(ins.text), W - 2 * M);
      doc.text(b, M, y); y += b.length * 13 + 8;
    });

    // 대시보드 캡처 → 새 페이지
    const node = document.getElementById("dashboard-capture");
    if (node && window.html2canvas) {
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: cssVar("--surface") || "#fff", useCORS: true });
      const img = canvas.toDataURL("image/png");
      doc.addPage();
      doc.setFontSize(13); doc.setTextColor(30); doc.text("Dashboard", M, 50);
      const availW = W - 2 * M;
      const ratio = canvas.height / canvas.width;
      let imgW = availW, imgH = availW * ratio;
      if (imgH > H - 90) { imgH = H - 90; imgW = imgH / ratio; }
      doc.addImage(img, "PNG", M, 66, imgW, imgH);
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

    // 1) 표지
    let s = pptx.addSlide();
    s.background = { color: "F6F7F9" };
    s.addText("데이터 분석 리포트", { x: 0.7, y: 2.4, w: 12, h: 1, fontSize: 40, bold: true, color: DARK });
    s.addText(`${DA.primary() ? DA.primary().name : ""}`, { x: 0.7, y: 3.5, w: 12, h: 0.5, fontSize: 18, color: MUTED });
    s.addText(new Date().toLocaleString(), { x: 0.7, y: 4.0, w: 12, h: 0.4, fontSize: 12, color: MUTED });

    // 2) 요약
    s = pptx.addSlide();
    slideTitle(s, "분석 요약", ACCENT);
    const rows = summaryLines().map(([k, v]) => [
      { text: k, options: { bold: true, color: DARK, fill: { color: "EEF2FA" } } },
      { text: v, options: { color: DARK } },
    ]);
    s.addTable(rows, { x: 0.7, y: 1.4, w: 12, colW: [3, 9], fontSize: 14, border: { pt: 0.5, color: "DDDDDD" }, rowH: 0.5, valign: "middle" });

    // 3) 영향 변수 순위
    s = pptx.addSlide();
    slideTitle(s, "원인 변수 영향력 순위", ACCENT);
    const ranking = (st.importance && st.importance.ranking) || [];
    const rk = [[
      { text: "순위", options: { bold: true, fill: { color: "EEF2FA" } } },
      { text: "변수", options: { bold: true, fill: { color: "EEF2FA" } } },
      { text: "영향도", options: { bold: true, fill: { color: "EEF2FA" } } },
      { text: "효과크기", options: { bold: true, fill: { color: "EEF2FA" } } },
      { text: "유의성", options: { bold: true, fill: { color: "EEF2FA" } } },
    ]];
    ranking.slice(0, 10).forEach((r, i) => rk.push([
      String(i + 1), r.name, util.fmt(r.score), r.effect, r.sig ? "유의 ✓" : "비유의",
    ]));
    s.addTable(rk, { x: 0.7, y: 1.4, w: 12, fontSize: 13, border: { pt: 0.5, color: "DDDDDD" }, rowH: 0.4, valign: "middle" });

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
        { text: `${i + 1}. ${ins.title}\n`, options: { bold: true, fontSize: 15, color: DARK } },
        { text: ins.text, options: { fontSize: 12, color: MUTED } },
      ], { x: 0.8, y: yy, w: 11.7, h: 1.0, valign: "top" });
      yy += 1.05;
    });

    await pptx.writeFile({ fileName: `data-report_${stamp()}.pptx` });
  }

  function slideTitle(s, text, color) {
    s.addText(text, { x: 0.7, y: 0.5, w: 12, h: 0.7, fontSize: 26, bold: true, color: "1F2733" });
    s.addShape("line", { x: 0.7, y: 1.25, w: 12, h: 0, line: { color, width: 2 } });
  }

  function safe(s) { return String(s == null ? "" : s); }

  DA.report = { exportPDF, exportPPTX };
})();
