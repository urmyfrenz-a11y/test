/* =========================================================
   analysis.js — 5단계: 실제 데이터 분석 수행
   - regression: 다중 선형회귀 (수치+범주 원핫)
   - classification: 그룹별 통계 + 연관성
   ========================================================= */
(function () {
  "use strict";
  const DA = (window.DA = window.DA || {});
  const { util, stats } = DA;
  const el = util.el;
  const num = (v) => util.toNum(v);

  function colByName(ds, name) { return ds.columns.find((c) => c.name === name); }

  /** 범주형 → 원핫 (상위 K, 나머지 기타, 첫 범주 기준으로 제외) */
  function categoryLevels(ds, name, K = 6) {
    const freq = {};
    ds.rows.forEach((r) => {
      const v = r[name];
      if (v == null || String(v).trim() === "") return;
      const k = String(v);
      freq[k] = (freq[k] || 0) + 1;
    });
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).map((e) => e[0]);
    return sorted.slice(0, K);
  }

  function computeRegression(ds, target, driverNames) {
    const features = []; // { label, kind, driver, level? }
    driverNames.forEach((name) => {
      const col = colByName(ds, name);
      if (col.type === "numeric") {
        features.push({ label: name, kind: "num", driver: name });
      } else {
        const levels = categoryLevels(ds, name);
        // 첫 레벨은 기준(reference) → 제외
        levels.slice(1).forEach((lv) => features.push({ label: `${name}=${lv}`, kind: "cat", driver: name, level: lv }));
      }
    });

    // 완전한 행만 사용
    const X = [], y = [];
    ds.rows.forEach((r) => {
      const yt = num(r[target.column]);
      if (yt === null || !Number.isFinite(yt)) return;
      let ok = true;
      const row = features.map((f) => {
        if (f.kind === "num") {
          const v = num(r[f.driver]);
          if (v === null || !Number.isFinite(v)) { ok = false; return 0; }
          return v;
        } else {
          const v = r[f.driver];
          if (v == null || String(v).trim() === "") { ok = false; return 0; }
          return String(v) === f.level ? 1 : 0;
        }
      });
      if (ok) { X.push(row); y.push(yt); }
    });

    if (X.length < features.length + 2) return { error: "완전한 관측치가 부족하여 회귀를 수행할 수 없습니다.", features };

    // 표준화 계수용: 각 feature의 표준편차, y의 표준편차
    const featSd = features.map((_, j) => stats.std(X.map((r) => r[j])));
    const ySd = stats.std(y);

    const model = stats.linearRegression(X, y);
    if (!model) return { error: "회귀 해를 구하지 못했습니다(다중공선성 가능).", features };

    const terms = features.map((f, j) => {
      const beta = model.coef[j];
      const stdBeta = ySd ? (beta * featSd[j]) / ySd : 0; // 표준화 계수
      return { label: f.label, driver: f.driver, kind: f.kind, level: f.level, beta, stdBeta, absStd: Math.abs(stdBeta) };
    }).sort((a, b) => b.absStd - a.absStd);

    return {
      kind: "regression",
      target: target.column,
      n: model.n,
      r2: model.r2,
      adjR2: model.adjR2,
      intercept: model.intercept,
      terms,
    };
  }

  function computeClassification(ds, target, driverNames) {
    const rows = ds.rows;
    // 타겟 클래스 분포
    const classFreq = {};
    rows.forEach((r) => {
      const v = r[target.column];
      if (v == null || String(v).trim() === "") return;
      classFreq[v] = (classFreq[v] || 0) + 1;
    });
    const classes = Object.entries(classFreq).sort((a, b) => b[1] - a[1]);

    const drivers = driverNames.map((name) => {
      const col = colByName(ds, name);
      if (col.type === "numeric") {
        // 클래스별 평균
        const byClass = {};
        rows.forEach((r) => {
          const c = r[target.column]; const v = num(r[name]);
          if (c == null || c === "" || v === null || !Number.isFinite(v)) return;
          (byClass[c] = byClass[c] || []).push(v);
        });
        const means = Object.entries(byClass).map(([c, arr]) => ({ cls: c, mean: stats.mean(arr), n: arr.length }));
        const a = stats.anova(Object.values(byClass));
        return { name, type: "numeric", means, test: { F: a.F, p: a.p, eta2: a.eta2 } };
      } else {
        // 범주형: 각 카테고리에서 타겟 최빈 클래스 + 카이제곱
        const cs = stats.chiSquare(rows.map((r) => r[name]), rows.map((r) => r[target.column]));
        return { name, type: "categorical", test: { chi2: cs.chi2, p: cs.p, cramersV: cs.cramersV } };
      }
    });

    // 베이스라인 정확도 (다수 클래스)
    const total = classes.reduce((s, c) => s + c[1], 0);
    const baseline = classes.length ? classes[0][1] / total : 0;

    return { kind: "classification", target: target.column, classes, drivers, baseline, n: total };
  }

  function compute(ds, target, driverNames) {
    return target.kind === "regression"
      ? computeRegression(ds, target, driverNames)
      : computeClassification(ds, target, driverNames);
  }

  /* ---------------- 렌더 ---------------- */
  function render(stage) {
    const st = DA.get();
    const ds = DA.primary();
    stage.innerHTML = "";

    const panel = el("div", { class: "panel" });
    panel.appendChild(el("div", { class: "panel__head" }, [
      el("h2", { class: "panel__title", text: "5. 데이터 분석 수행" }),
      el("p", { class: "panel__desc", html: `타겟 <strong>${util.esc(st.target.column)}</strong> · 원인 변수 ${st.selectedDrivers.length}개로 분석을 실행합니다.` }),
    ]));
    stage.appendChild(panel);

    // 약간의 지연으로 "분석 중" 표시 (실제 계산은 동기)
    const loading = el("div", { class: "loading-block" }, [el("span", { class: "spinner" }), "분석 수행 중…"]);
    panel.appendChild(loading);

    setTimeout(() => {
      st.analysis = compute(ds, st.target, st.selectedDrivers);
      loading.remove();
      if (st.analysis.error) {
        panel.appendChild(el("div", { class: "note note--warn", text: st.analysis.error }));
      } else if (st.analysis.kind === "regression") {
        renderRegression(panel, st.analysis);
      } else {
        renderClassification(panel, st.analysis);
      }
      panel.appendChild(actions(stage));
    }, 250);
  }

  function renderRegression(panel, a) {
    const kpi = el("div", { class: "kpi-grid" });
    [
      ["설명력 R²", util.pct(a.r2), "타겟 변동의 설명 비율"],
      ["수정 R²", util.pct(a.adjR2), "변수 수 보정"],
      ["표본 수", util.fmtInt(a.n), "완전 관측치"],
      ["주요 원인", a.terms[0] ? a.terms[0].driver : "—", "표준화 계수 최대"],
    ].forEach(([l, v, s]) => kpi.appendChild(el("div", { class: "kpi" }, [
      el("div", { class: "kpi__label", text: l }), el("div", { class: "kpi__value", text: v }), el("div", { class: "kpi__sub", text: s })])));
    panel.appendChild(kpi);

    panel.appendChild(el("h3", { style: "margin:22px 0 8px", text: "회귀 계수 (영향력 순)" }));
    const wrap = el("div", { class: "table-wrap" });
    const table = el("table", { class: "data" });
    table.innerHTML = `<thead><tr><th>변수</th><th>계수 (β)</th><th>표준화 β</th><th>방향</th></tr></thead>`;
    const tb = el("tbody");
    a.terms.forEach((t) => {
      const dir = t.beta > 0 ? "▲ 증가" : t.beta < 0 ? "▼ 감소" : "–";
      const color = t.beta > 0 ? "var(--success)" : "var(--danger)";
      const tr = el("tr");
      tr.innerHTML = `<td><strong>${util.esc(t.label)}</strong></td>
        <td class="num">${util.fmt(t.beta, 4)}</td>
        <td class="num">${util.fmt(t.stdBeta, 3)}</td>
        <td style="color:${color};font-weight:600">${dir}</td>`;
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    wrap.appendChild(table);
    panel.appendChild(wrap);

    // 표준화 계수 막대차트
    panel.appendChild(el("div", { class: "chart-card", style: "margin-top:18px" }, [
      el("div", { class: "chart-card__title", text: "표준화 영향력 (|β|)" }),
      el("div", { class: "chart-holder" }, [el("canvas", { id: "reg-chart" })]),
    ]));
    requestAnimationFrame(() => {
      const cv = document.getElementById("reg-chart");
      if (!cv) return;
      const cu = DA.chartUtil;
      cu.make(cv, {
        type: "bar",
        data: {
          labels: a.terms.slice(0, 10).map((t) => t.label),
          datasets: [{
            data: a.terms.slice(0, 10).map((t) => t.stdBeta),
            backgroundColor: a.terms.slice(0, 10).map((t) => t.beta >= 0 ? cu.palette()[1] : cu.palette()[4]),
          }],
        },
        options: cu.baseOptions({ indexAxis: "y", plugins: { legend: { display: false } } }),
      });
    });
  }

  function renderClassification(panel, a) {
    const kpi = el("div", { class: "kpi-grid" });
    const topDriver = a.drivers.slice().sort((x, y) => (y.test.eta2 || y.test.cramersV || 0) - (x.test.eta2 || x.test.cramersV || 0))[0];
    [
      ["클래스 수", util.fmtInt(a.classes.length), "타겟 그룹"],
      ["다수 클래스", a.classes[0] ? String(a.classes[0][0]).slice(0, 14) : "—", util.pct(a.baseline) + " (베이스라인)"],
      ["표본 수", util.fmtInt(a.n), "유효 관측치"],
      ["주요 원인", topDriver ? topDriver.name : "—", "가장 강한 연관"],
    ].forEach(([l, v, s]) => kpi.appendChild(el("div", { class: "kpi" }, [
      el("div", { class: "kpi__label", text: l }), el("div", { class: "kpi__value", text: v }), el("div", { class: "kpi__sub", text: s })])));
    panel.appendChild(kpi);

    // 클래스 분포 차트
    panel.appendChild(el("div", { class: "chart-card", style: "margin-top:18px" }, [
      el("div", { class: "chart-card__title", text: `타겟 ‘${a.target}’ 클래스 분포` }),
      el("div", { class: "chart-holder" }, [el("canvas", { id: "cls-chart" })]),
    ]));

    // 드라이버별 요약
    panel.appendChild(el("h3", { style: "margin:22px 0 8px", text: "원인 변수별 그룹 차이" }));
    const wrap = el("div", { class: "table-wrap" });
    const table = el("table", { class: "data" });
    table.innerHTML = `<thead><tr><th>변수</th><th>타입</th><th>검정</th><th>효과크기</th><th>p-value</th><th>유의</th></tr></thead>`;
    const tb = el("tbody");
    a.drivers.forEach((d) => {
      const isNum = d.type === "numeric";
      const eff = isNum ? `η²=${util.fmt(d.test.eta2)}` : `V=${util.fmt(d.test.cramersV)}`;
      const p = d.test.p;
      const sig = Number.isFinite(p) && p < 0.05;
      const tr = el("tr");
      tr.innerHTML = `<td><strong>${util.esc(d.name)}</strong></td>
        <td>${util.typeBadge(d.type)}</td>
        <td>${isNum ? "ANOVA" : "카이제곱"}</td>
        <td class="num">${eff}</td>
        <td class="num">${Number.isFinite(p) ? (p < 0.001 ? "<0.001" : p.toFixed(3)) : "—"}</td>
        <td><span class="sig-badge ${sig ? "sig-yes" : "sig-no"}">${sig ? "유의 ✓" : "비유의"}</span></td>`;
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    wrap.appendChild(table);
    panel.appendChild(wrap);

    requestAnimationFrame(() => {
      const cv = document.getElementById("cls-chart");
      if (!cv) return;
      const cu = DA.chartUtil, pal = cu.palette();
      cu.make(cv, {
        type: "bar",
        data: {
          labels: a.classes.map((c) => String(c[0]).slice(0, 16)),
          datasets: [{ data: a.classes.map((c) => c[1]), backgroundColor: a.classes.map((_, i) => pal[i % pal.length]) }],
        },
        options: cu.baseOptions({ plugins: { legend: { display: false } } }),
      });
    });
  }

  function actions(stage) {
    const a = el("div", { class: "actions" });
    a.appendChild(el("button", { class: "btn btn--ghost", onclick: () => DA.wizard.go("drivers") }, "← 원인 변수"));
    a.appendChild(el("div", { class: "spacer" }));
    a.appendChild(el("button", { class: "btn btn--primary", onclick: () => { DA.get().insights = []; DA.wizard.go("insights"); } }, "핵심 인사이트 도출 →"));
    return a;
  }

  DA.analysis = { render, compute };
})();
