/* =========================================================
   importance.js — 4단계: 타겟에 영향을 주는 원인 변수 추천
   + 통계적 유의성 검정 (상관/t/ANOVA/카이제곱)
   ========================================================= */
(function () {
  "use strict";
  const DA = (window.DA = window.DA || {});
  const { util, stats } = DA;
  const el = util.el;

  /** 각 후보 변수의 타겟에 대한 영향도 + 유의성 계산 */
  function compute(ds, target) {
    const rows = ds.rows;
    const targetVals = rows.map((r) => r[target.column]);
    const results = [];

    ds.columns.forEach((col) => {
      if (col.name === target.column) return;
      if (col.type === "text" || col.type === "datetime") return;
      if (col.unique >= rows.length * 0.9 && col.type !== "numeric") return; // ID류 제외
      const featVals = rows.map((r) => r[col.name]);

      let score = 0, method = "", stat = {}, sig = false, effect = "";

      if (target.kind === "regression") {
        if (col.type === "numeric") {
          const r = stats.pearson(featVals, targetVals);
          score = Math.abs(r.r); method = "Pearson 상관"; stat = r; sig = r.p < 0.05;
          effect = `r=${util.fmt(r.r)}`;
        } else { // categorical feature vs numeric target
          const cr = stats.correlationRatio(featVals, targetVals);
          score = cr.eta; method = "상관비(η) · ANOVA"; stat = cr; sig = cr.p < 0.05;
          effect = `η=${util.fmt(cr.eta)}`;
        }
      } else { // classification: categorical target
        if (col.type === "numeric") {
          // 타겟 그룹별로 수치 feature 비교 → ANOVA
          const groups = groupNumericByTarget(featVals, targetVals);
          const a = stats.anova(groups);
          score = Number.isFinite(a.eta2) ? Math.sqrt(a.eta2) : 0;
          method = "ANOVA (그룹 간 평균차)"; stat = a; sig = a.p < 0.05;
          effect = `η²=${util.fmt(a.eta2)}`;
        } else { // categorical vs categorical
          const cs = stats.chiSquare(featVals, targetVals);
          score = Number.isFinite(cs.cramersV) ? cs.cramersV : 0;
          method = "카이제곱 · Cramér's V"; stat = cs; sig = cs.p < 0.05;
          effect = `V=${util.fmt(cs.cramersV)}`;
        }
      }
      if (!Number.isFinite(score)) return;
      results.push({
        name: col.name, type: col.type, score, method, stat, sig, effect,
        p: stat.p,
      });
    });

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  function groupNumericByTarget(featVals, targetVals) {
    const groups = {};
    for (let i = 0; i < featVals.length; i++) {
      const t = targetVals[i];
      const v = Number(featVals[i]);
      if (t == null || t === "" || !Number.isFinite(v)) continue;
      (groups[t] = groups[t] || []).push(v);
    }
    return Object.values(groups);
  }

  function render(stage) {
    const st = DA.get();
    const ds = DA.primary();
    const target = st.target;
    stage.innerHTML = "";

    if (!st.importance) st.importance = { ranking: compute(ds, target) };
    const ranking = st.importance.ranking;

    // 기본 선택: 유의미한 상위 변수 (최대 6개), 없으면 상위 3개
    if (!st.selectedDrivers.length) {
      const sig = ranking.filter((r) => r.sig).slice(0, 6).map((r) => r.name);
      st.selectedDrivers = sig.length ? sig : ranking.slice(0, 3).map((r) => r.name);
    }

    const panel = el("div", { class: "panel" });
    panel.appendChild(el("div", { class: "panel__head" }, [
      el("h2", { class: "panel__title", text: "4. 원인 변수 추천 · 통계 검정" }),
      el("p", { class: "panel__desc", html: `타겟 <strong>‘${util.esc(target.column)}’</strong> 에 가장 큰 영향을 주는 변수를 자동 추천했습니다. 영향도 순위와 통계적 유의성(p&lt;0.05)을 확인하고, 분석에 포함할 변수를 선택하세요.` }),
    ]));

    if (!ranking.length) {
      panel.appendChild(el("div", { class: "note note--warn", text: "분석 가능한 원인 변수를 찾지 못했습니다." }));
      panel.appendChild(actions(stage, true));
      stage.appendChild(panel);
      return;
    }

    const maxScore = Math.max(...ranking.map((r) => r.score), 0.0001);

    const list = el("div", { class: "rank-list" });
    ranking.forEach((r) => {
      const checked = st.selectedDrivers.includes(r.name);
      const row = el("label", { class: "rank-row", style: "cursor:pointer" });
      // 체크박스
      const cb = el("input", { type: "checkbox", style: "width:20px;height:20px;flex:0 0 auto" });
      cb.checked = checked;
      cb.addEventListener("change", () => {
        const set = new Set(st.selectedDrivers);
        if (cb.checked) set.add(r.name); else set.delete(r.name);
        st.selectedDrivers = [...set];
        updateNext(panel);
      });

      const nameCell = el("div", { class: "rank-row__name" }, [
        cb,
        document.createTextNode(" " + r.name + " "),
        el("span", { html: util.typeBadge(r.type) }),
      ]);
      nameCell.style.display = "flex";
      nameCell.style.alignItems = "center";
      nameCell.style.gap = "6px";

      const bar = el("div", { class: "rank-bar" }, [
        el("div", { class: "rank-bar__fill", style: `width:${(r.score / maxScore) * 100}%` }),
      ]);
      const sigBadge = `<span class="sig-badge ${r.sig ? "sig-yes" : "sig-no"}">${r.sig ? "유의 ✓" : "비유의"}</span>`;
      const score = el("div", { class: "rank-row__score",
        html: `${util.fmt(r.score)} · ${util.esc(r.effect)}${Number.isFinite(r.p) ? ` · p=${fmtP(r.p)}` : ""} ${sigBadge}` });

      row.appendChild(nameCell);
      row.appendChild(bar);
      row.appendChild(score);
      list.appendChild(row);
    });
    panel.appendChild(list);

    // 검정 방법 안내
    panel.appendChild(el("div", { class: "note note--info", style: "margin-top:18px",
      html: `<strong>사용된 통계 검정:</strong> ${methodLegend(target)}. 영향도는 0~1로 정규화된 효과크기이며, p&lt;0.05 이면 통계적으로 유의합니다.` }));

    panel.appendChild(actions(stage));
    stage.appendChild(panel);
    updateNext(panel);
  }

  function methodLegend(target) {
    return target.kind === "regression"
      ? "수치형↔수치형 = 피어슨 상관 유의성 · 범주형→수치형 = 일원 ANOVA(상관비 η)"
      : "수치형→범주형 = 일원 ANOVA · 범주형↔범주형 = 카이제곱 독립성 검정(Cramér's V)";
  }

  function fmtP(p) {
    if (!Number.isFinite(p)) return "—";
    if (p < 0.001) return "<0.001";
    return p.toFixed(3);
  }

  function updateNext(panel) {
    const st = DA.get();
    const btn = panel.querySelector("#drivers-next");
    if (btn) {
      btn.disabled = st.selectedDrivers.length === 0;
      btn.textContent = st.selectedDrivers.length
        ? `분석 실행 (${st.selectedDrivers.length}개 변수) →`
        : "변수를 1개 이상 선택하세요";
    }
  }

  function actions(stage, disabled) {
    const st = DA.get();
    const a = el("div", { class: "actions" });
    a.appendChild(el("button", { class: "btn btn--ghost", onclick: () => DA.wizard.go("target") }, "← 타겟"));
    a.appendChild(el("div", { class: "spacer" }));
    a.appendChild(el("button", {
      class: "btn btn--primary", id: "drivers-next",
      disabled: disabled ? "disabled" : null,
      onclick: () => { st.analysis = null; DA.wizard.go("analysis"); },
    }, "분석 실행 →"));
    return a;
  }

  DA.importance = { render, compute };
})();
