/* =========================================================
   upload.js — 1단계: 파일 업로드 (드래그앤드롭 + 폴더선택, 멀티파일)
   ========================================================= */
(function () {
  "use strict";
  const DA = (window.DA = window.DA || {});
  const { util } = DA;
  const el = util.el;

  const EXT_OK = ["csv", "tsv", "txt", "xlsx", "xls", "xlsm", "pdf"];

  function render(stage) {
    const st = DA.get();
    stage.innerHTML = "";

    const panel = el("div", { class: "panel" });
    panel.appendChild(el("div", { class: "panel__head" }, [
      el("h2", { class: "panel__title", text: "1. 파일 업로드" }),
      el("p", { class: "panel__desc", text: "xlsx · csv · txt · pdf 파일을 여러 개 올릴 수 있습니다. 드래그앤드롭 또는 + 버튼으로 선택하세요." }),
    ]));

    // 드롭존
    const dz = el("div", { class: "dropzone", tabindex: "0", role: "button", "aria-label": "파일 추가" }, [
      el("div", { class: "dropzone__icon", html: "⬆️" }),
      el("div", { html: "<strong>+</strong> 여기로 파일을 끌어다 놓거나, 클릭해서 선택하세요" }),
      el("div", { class: "dropzone__hint", text: "지원: .xlsx .xls .csv .tsv .txt .pdf (복수 선택 가능)" }),
    ]);
    const input = document.getElementById("file-input");

    dz.addEventListener("click", () => input.click());
    dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    ["dragenter", "dragover"].forEach((ev) =>
      dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-drag"); }));
    ["dragleave", "drop"].forEach((ev) =>
      dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-drag"); }));
    dz.addEventListener("drop", (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) handleFiles(files, stage);
    });
    // input 은 재렌더에도 살아있으므로 리스너 중복 방지
    input.onchange = () => {
      if (input.files && input.files.length) handleFiles(input.files, stage);
      input.value = "";
    };
    panel.appendChild(dz);

    // 파일 목록
    const list = el("ul", { class: "file-list", id: "file-list" });
    st.files.forEach((f, i) => list.appendChild(fileRow(f, i, stage)));
    panel.appendChild(list);

    // 파싱된 데이터셋 요약 + 분석 대상 선택
    const tables = st.datasets.filter((d) => d.kind === "table");
    if (st.datasets.length) {
      panel.appendChild(datasetSummary(st, tables, stage));
    }

    // 액션
    const actions = el("div", { class: "actions" });
    const startBtn = el("button", {
      class: "btn btn--primary",
      disabled: tables.length ? null : "disabled",
      onclick: () => {
        if (!st.primaryId && tables.length) st.primaryId = tables[0].id;
        DA.wizard.go("eda");
      },
    }, tables.length ? "EDA 시작 →" : "표 데이터 파일이 필요합니다");
    actions.appendChild(el("div", { class: "spacer" }));
    actions.appendChild(startBtn);
    panel.appendChild(actions);

    stage.appendChild(panel);
  }

  function fileRow(f, i, stage) {
    const statusCls = f.status === "done" ? "ok" : f.status === "error" ? "err" : "";
    const statusTxt = f.status === "parsing"
      ? '<span class="spinner"></span>파싱 중…'
      : f.status === "done" ? "✓ 완료"
      : f.status === "error" ? "✕ " + util.esc(f.error || "실패") : "대기";
    const row = el("li", { class: "file-item" }, [
      el("span", { class: "file-item__ext", text: f.ext || "?" }),
      el("div", { class: "file-item__meta" }, [
        el("div", { class: "file-item__name", text: f.name }),
        el("div", { class: "file-item__sub", text: util.fileSize(f.size) }),
      ]),
      el("div", { class: "file-item__status " + statusCls, html: statusTxt }),
      el("button", {
        class: "file-item__remove", title: "제거", "aria-label": "제거",
        onclick: () => removeFile(i, stage),
      }, "×"),
    ]);
    return row;
  }

  function datasetSummary(st, tables, stage) {
    const wrap = el("div", { class: "note note--info" });
    const textCount = st.datasets.filter((d) => d.kind === "text").length;
    let msg = `데이터셋 <strong>${st.datasets.length}</strong>개 파싱됨 (표 ${tables.length} · 문서/텍스트 ${textCount}).`;
    wrap.innerHTML = msg;

    if (tables.length > 1) {
      const label = el("label", { class: "file-item__sub", style: "display:block;margin-top:10px;margin-bottom:4px" },
        "분석 대상 표 선택:");
      const sel = el("select", {
        class: "btn btn--ghost", style: "min-width:260px",
        onchange: (e) => { st.primaryId = e.target.value; },
      });
      tables.forEach((t) => {
        const opt = el("option", { value: t.id }, `${t.name} (${t.rows.length}행 × ${t.columns.length}열)`);
        if (!st.primaryId) st.primaryId = t.id;
        if (t.id === st.primaryId) opt.setAttribute("selected", "selected");
        sel.appendChild(opt);
      });
      wrap.appendChild(label);
      wrap.appendChild(sel);
    } else if (tables.length === 1) {
      st.primaryId = tables[0].id;
      wrap.innerHTML += `<br>분석 대상: <strong>${util.esc(tables[0].name)}</strong> — ${tables[0].rows.length}행 × ${tables[0].columns.length}열`;
    } else if (textCount) {
      wrap.className = "note note--warn";
      wrap.innerHTML += `<br>⚠️ 표(행/열) 데이터가 없어 정량 분석이 제한됩니다. 텍스트 요약만 제공됩니다. 정밀 분석에는 xlsx/csv를 권장합니다.`;
    }
    return wrap;
  }

  async function handleFiles(fileList, stage) {
    const st = DA.get();
    const arr = Array.from(fileList);
    for (const file of arr) {
      const ext = util.ext(file.name);
      const rec = {
        file, name: file.name, ext, size: file.size,
        status: EXT_OK.includes(ext) ? "parsing" : "parsing", error: null,
      };
      st.files.push(rec);
    }
    render(stage); // 파싱 중 상태 표시

    for (const rec of st.files) {
      if (rec.status !== "parsing") continue;
      try {
        const datasets = await DA.parsers.parseFile(rec.file);
        datasets.forEach((d) => st.datasets.push(d));
        rec.status = "done";
      } catch (e) {
        rec.status = "error";
        rec.error = e && e.message ? e.message : "파싱 실패";
        console.error("parse error", rec.name, e);
      }
      render(stage);
    }
  }

  function removeFile(i, stage) {
    const st = DA.get();
    const rec = st.files[i];
    st.files.splice(i, 1);
    // 해당 파일에서 나온 데이터셋 제거
    if (rec) {
      st.datasets = st.datasets.filter((d) => d.source !== rec.name);
      if (!st.datasets.find((d) => d.id === st.primaryId)) st.primaryId = null;
    }
    render(stage);
  }

  DA.upload = { render };
})();
