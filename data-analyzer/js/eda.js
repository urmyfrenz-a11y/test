/* =========================================================
   eda.js — 2단계: 탐색적 데이터 분석 (EDA)
   + 공용 차트 헬퍼(DA.chartUtil)
   ========================================================= */
(function () {
  "use strict";
  const DA = (window.DA = window.DA || {});
  const { util, stats } = DA;
  const el = util.el;

  /* ---------------- 공용 차트 헬퍼 ---------------- */
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  const chartUtil = {
    palette() { return ["--c1", "--c2", "--c3", "--c4", "--c5", "--c6"].map(cssVar); },
    grid() { return cssVar("--border"); },
    text() { return cssVar("--text-muted"); },
    primary() { return cssVar("--primary"); },
    baseOptions(extra = {}) {
      const t = this.text(), g = this.grid();
      return Object.assign({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: t, font: { size: 11 } } },
          tooltip: { enabled: true },
        },
        scales: {
          x: { ticks: { color: t, font: { size: 10 } }, grid: { color: g } },
          y: { ticks: { color: t, font: { size: 10 } }, grid: { color: g } },
        },
      }, extra);
    },
    make(canvas, config) {
      const c = new Chart(canvas, config);
      DA.get().charts.push(c);
      return c;
    },
  };
  DA.chartUtil = chartUtil;

  /* ---------------- EDA 계산 ---------------- */
  function compute(ds) {
    const { columns, rows } = ds;
    const n = rows.length;
    const perColumn = columns.map((col) => {
      const raw = rows.map((r) => r[col.name]);
      const info = { ...col };
      if (col.type === "numeric") {
        const vals = stats.clean(raw);
        info.stats = {
          mean: stats.mean(vals), std: stats.std(vals),
          min: stats.min(vals), q1: stats.quantile(vals, 0.25),
          median: stats.median(vals), q3: stats.quantile(vals, 0.75),
          max: stats.max(vals), skew: stats.skewness(vals),
        };
        info.hist = stats.histogram(vals, 12);
        // 이상치 (IQR 방식)
        const iqr = info.stats.q3 - info.stats.q1;
        const lo = info.stats.q1 - 1.5 * iqr, hi = info.stats.q3 + 1.5 * iqr;
        info.outliers = vals.filter((v) => v < lo || v > hi).length;
      } else if (col.type === "categorical") {
        const freq = {};
        raw.forEach((v) => {
          if (v == null || String(v).trim() === "") return;
          const k = String(v);
          freq[k] = (freq[k] || 0) + 1;
        });
        info.topCategories = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
        info.mode = info.topCategories.length ? info.topCategories[0][0] : null;
      }
      return info;
    });

    // 수치형 상관행렬
    // 각 수치 컬럼의 값을 한 번만 숫자로 변환해 캐시 → 쌍마다 재변환하는 비용 제거
    // (대용량에서 UI 멈춤을 유발하던 부분)
    const numCols = perColumn.filter((c) => c.type === "numeric");
    const numVectors = numCols.map((c) => {
      const name = c.name;
      const v = new Array(n);
      for (let k = 0; k < n; k++) v[k] = util.toNum(rows[k][name]);
      return v;
    });
    const corr = [];
    for (let i = 0; i < numCols.length; i++) {
      corr[i] = [];
      for (let j = 0; j < numCols.length; j++) {
        if (i === j) { corr[i][j] = 1; continue; }
        if (j < i) { corr[i][j] = corr[j][i]; continue; }
        // 이미 숫자로 변환된 벡터 사용 → pearson 내부 toNum은 즉시 반환(빠름)
        corr[i][j] = stats.pearson(numVectors[i], numVectors[j]).r;
      }
    }

    return {
      rows: n,
      cols: columns.length,
      numeric: numCols.length,
      categorical: perColumn.filter((c) => c.type === "categorical").length,
      datetime: perColumn.filter((c) => c.type === "datetime").length,
      totalMissing: perColumn.reduce((s, c) => s + c.missing, 0),
      cells: n * columns.length,
      perColumn,
      corr: { labels: numCols.map((c) => c.name), matrix: corr },
    };
  }

  /* ---------------- 렌더 ---------------- */
  function render(stage) {
    const st = DA.get();
    const ds = DA.primary();
    stage.innerHTML = "";

    if (!ds) {
      renderTextOnly(stage);
      return;
    }
    // 대용량이면 계산이 수 초 걸릴 수 있으므로, 먼저 로딩을 그린 뒤 비동기로 계산
    if (!st.eda) {
      stage.appendChild(el("div", { class: "panel" }, [
        el("div", { class: "loading-block" }, [
          el("span", { class: "spinner" }),
          `EDA 계산 중… (${util.fmtInt(ds.rows.length)}행 × ${ds.columns.length}열 — 대용량은 수 초 걸릴 수 있어요)`,
        ]),
      ]));
      setTimeout(() => { st.eda = compute(ds); render(stage); }, 30);
      return;
    }
    const eda = st.eda;

    const panel = el("div", { class: "panel" });
    panel.appendChild(el("div", { class: "panel__head" }, [
      el("h2", { class: "panel__title", text: "2. 탐색적 데이터 분석 (EDA)" }),
      el("p", { class: "panel__desc", text: `${util.esc(ds.name)} — 데이터의 구조·분포·결측·상관관계를 자동 요약했습니다.` }),
    ]));

    // KPI
    const kpi = el("div", { class: "kpi-grid" });
    const missingPct = eda.cells ? eda.totalMissing / eda.cells : 0;
    [
      ["행 수", util.fmtInt(eda.rows), "관측치"],
      ["열 수", util.fmtInt(eda.cols), `수치 ${eda.numeric} · 범주 ${eda.categorical} · 날짜 ${eda.datetime}`],
      ["결측치", util.fmtInt(eda.totalMissing), util.pct(missingPct) + " of 전체 셀"],
      ["수치형 변수", util.fmtInt(eda.numeric), "상관분석 가능"],
    ].forEach(([l, v, s]) => {
      kpi.appendChild(el("div", { class: "kpi" }, [
        el("div", { class: "kpi__label", text: l }),
        el("div", { class: "kpi__value", text: v }),
        el("div", { class: "kpi__sub", text: s }),
      ]));
    });
    panel.appendChild(kpi);

    // 데이터 미리보기
    panel.appendChild(el("h3", { style: "margin:22px 0 8px", text: "데이터 미리보기 (상위 8행)" }));
    panel.appendChild(previewTable(ds));

    // 변수 요약 표
    panel.appendChild(el("h3", { style: "margin:22px 0 8px", text: "변수별 요약" }));
    panel.appendChild(columnSummaryTable(eda));

    // 분포 차트 (수치형 상위 4개 + 범주형 상위 2개)
    panel.appendChild(el("h3", { style: "margin:22px 0 10px", text: "분포" }));
    const chartGrid = el("div", { class: "chart-grid" });
    const numCols = eda.perColumn.filter((c) => c.type === "numeric").slice(0, 4);
    const catCols = eda.perColumn.filter((c) => c.type === "categorical").slice(0, 2);
    numCols.forEach((c) => chartGrid.appendChild(histCard(c)));
    catCols.forEach((c) => chartGrid.appendChild(barCard(c)));
    panel.appendChild(chartGrid);

    // 상관 히트맵
    if (eda.corr.labels.length >= 2) {
      panel.appendChild(el("h3", { style: "margin:24px 0 10px", text: "수치형 변수 상관관계" }));
      panel.appendChild(correlationHeatmap(eda.corr));
    }

    // 액션
    panel.appendChild(actions(stage));
    stage.appendChild(panel);

    // 차트 그리기 (DOM 부착 후)
    requestAnimationFrame(() => {
      numCols.forEach((c) => drawHist(c));
      catCols.forEach((c) => drawBar(c));
    });
  }

  function actions(stage) {
    const a = el("div", { class: "actions" });
    a.appendChild(el("button", { class: "btn btn--ghost", onclick: () => DA.wizard.go("upload") }, "← 파일"));
    a.appendChild(el("div", { class: "spacer" }));
    a.appendChild(el("button", {
      class: "btn btn--primary",
      onclick: () => DA.wizard.go("target"),
    }, "EDA 확인 · 타겟 설정 →"));
    return a;
  }

  function previewTable(ds) {
    const wrap = el("div", { class: "table-wrap" });
    const table = el("table", { class: "data" });
    const thead = el("thead");
    const htr = el("tr");
    ds.columns.forEach((c) => htr.appendChild(el("th", {}, [
      document.createTextNode(c.name + " "),
      el("span", { html: util.typeBadge(c.type) }),
    ])));
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = el("tbody");
    ds.rows.slice(0, 8).forEach((r) => {
      const tr = el("tr");
      ds.columns.forEach((c) => {
        const v = r[c.name];
        tr.appendChild(el("td", { class: c.type === "numeric" ? "num" : "" },
          v == null || v === "" ? "—" : String(v).slice(0, 40)));
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function columnSummaryTable(eda) {
    const wrap = el("div", { class: "table-wrap" });
    const table = el("table", { class: "data" });
    table.innerHTML = `<thead><tr>
      <th>변수</th><th>타입</th><th>결측</th><th>고유값</th>
      <th>평균/최빈</th><th>표준편차</th><th>최소~최대</th>
    </tr></thead>`;
    const tbody = el("tbody");
    eda.perColumn.forEach((c) => {
      let mean = "—", sd = "—", range = "—";
      if (c.type === "numeric" && c.stats) {
        mean = util.fmt(c.stats.mean);
        sd = util.fmt(c.stats.std);
        range = `${util.fmt(c.stats.min)} ~ ${util.fmt(c.stats.max)}`;
      } else if (c.type === "categorical") {
        mean = c.mode != null ? String(c.mode).slice(0, 20) : "—";
      }
      const tr = el("tr");
      tr.innerHTML = `
        <td><strong>${util.esc(c.name)}</strong></td>
        <td>${util.typeBadge(c.type)}</td>
        <td class="num">${util.fmtInt(c.missing)} <span style="color:var(--text-muted)">(${util.pct(c.missingRatio)})</span></td>
        <td class="num">${util.fmtInt(c.unique)}</td>
        <td>${util.esc(mean)}</td>
        <td class="num">${sd}</td>
        <td>${range}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function histCard(col) {
    const card = el("div", { class: "chart-card" }, [
      el("div", { class: "chart-card__title", text: col.name + " (분포)" }),
      el("div", { class: "chart-holder" }, [el("canvas", { id: "hist-" + cid(col.name) })]),
    ]);
    return card;
  }
  function barCard(col) {
    const card = el("div", { class: "chart-card" }, [
      el("div", { class: "chart-card__title", text: col.name + " (빈도 상위)" }),
      el("div", { class: "chart-holder" }, [el("canvas", { id: "bar-" + cid(col.name) })]),
    ]);
    return card;
  }
  function drawHist(col) {
    const cv = document.getElementById("hist-" + cid(col.name));
    if (!cv || !col.hist) return;
    chartUtil.make(cv, {
      type: "bar",
      data: { labels: col.hist.labels, datasets: [{ data: col.hist.counts, backgroundColor: chartUtil.primary() }] },
      options: chartUtil.baseOptions({ plugins: { legend: { display: false } } }),
    });
  }
  function drawBar(col) {
    const cv = document.getElementById("bar-" + cid(col.name));
    if (!cv || !col.topCategories) return;
    const pal = chartUtil.palette();
    chartUtil.make(cv, {
      type: "bar",
      data: {
        labels: col.topCategories.map((c) => String(c[0]).slice(0, 16)),
        datasets: [{ data: col.topCategories.map((c) => c[1]), backgroundColor: col.topCategories.map((_, i) => pal[i % pal.length]) }],
      },
      options: chartUtil.baseOptions({ indexAxis: "y", plugins: { legend: { display: false } } }),
    });
  }

  function correlationHeatmap(corr) {
    // Chart.js 없이 CSS 그리드로 히트맵 렌더 (간결·안정)
    const { labels, matrix } = corr;
    const wrap = el("div", { class: "table-wrap" });
    const table = el("table", { class: "data" });
    const thead = el("thead");
    const htr = el("tr");
    htr.appendChild(el("th", { text: "" }));
    labels.forEach((l) => htr.appendChild(el("th", { title: l }, l.slice(0, 8))));
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = el("tbody");
    matrix.forEach((rowArr, i) => {
      const tr = el("tr");
      tr.appendChild(el("th", { title: labels[i] }, labels[i].slice(0, 12)));
      rowArr.forEach((r) => {
        const td = el("td", { class: "num", style: heatStyle(r) }, Number.isFinite(r) ? r.toFixed(2) : "—");
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }
  function heatStyle(r) {
    if (!Number.isFinite(r)) return "";
    const a = Math.min(1, Math.abs(r));
    const color = r >= 0 ? "59,110,245" : "214,69,69"; // primary vs danger
    const fg = a > 0.5 ? "#fff" : "var(--text)";
    return `background: rgba(${color}, ${a * 0.85}); color:${fg};`;
  }

  function cid(name) { return name.replace(/[^a-zA-Z0-9]/g, "_"); }

  function renderTextOnly(stage) {
    const st = DA.get();
    const textDs = st.datasets.filter((d) => d.kind === "text");
    const panel = el("div", { class: "panel" });
    panel.appendChild(el("div", { class: "panel__head" }, [
      el("h2", { class: "panel__title", text: "2. 텍스트 요약" }),
      el("p", { class: "panel__desc", text: "표 데이터가 없어 텍스트 통계만 제공합니다." }),
    ]));
    textDs.forEach((d) => {
      const s = d.textStats || {};
      panel.appendChild(el("h3", { style: "margin:16px 0 8px", text: d.name }));
      const kpi = el("div", { class: "kpi-grid" });
      [["문자 수", util.fmtInt(s.chars)], ["단어 수", util.fmtInt(s.words)], ["줄 수", util.fmtInt(s.lines)]]
        .forEach(([l, v]) => kpi.appendChild(el("div", { class: "kpi" }, [
          el("div", { class: "kpi__label", text: l }), el("div", { class: "kpi__value", text: v })])));
      panel.appendChild(kpi);
      if (s.topWords && s.topWords.length) {
        panel.appendChild(el("h3", { style: "margin:16px 0 8px", text: "빈출 단어" }));
        panel.appendChild(el("div", { html: s.topWords.map((w) => `<span class="type-badge type-categorical" style="margin:3px">${util.esc(w[0])} · ${w[1]}</span>`).join("") }));
      }
    });
    const a = el("div", { class: "actions" });
    a.appendChild(el("button", { class: "btn btn--ghost", onclick: () => DA.wizard.go("upload") }, "← 파일"));
    panel.appendChild(a);
    stage.appendChild(panel);
  }

  DA.eda = { render, compute };
})();
