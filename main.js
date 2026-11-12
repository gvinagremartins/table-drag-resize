/* Table Resizer: drag handles for tables; sizes stored in an HTML comment above the table. */
const { Plugin, Notice } = require("obsidian");

const MIN_COL = 40;
const MIN_ROW = 20;

/* ---------- table identity: header row text + occurrence among same-header tables ---------- */

function normLine(t) {
  return t.trim().replace(/\s+/g, " ");
}

/** lines: array of strings; start: 0-based index of the table's header row. */
function tableKey(lines, start) {
  const header = normLine(lines[start]);
  let count = 0;
  let fence = null;
  for (let i = 0; i < start; i++) {
    const t = lines[i].trim();
    const f = t.match(/^(```+|~~~+)/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    if (t.startsWith("|") && (i === 0 || !lines[i - 1].trim().startsWith("|")) && normLine(lines[i]) === header) count++;
  }
  return `${header}#${count}`;
}

/* ---------- DOM ---------- */

function wrapperOf(table) {
  return table.closest(".cm-table-widget") || table.closest(".el-table") || table.parentElement;
}

function applySizes(table, s) {
  const wrap = wrapperOf(table);
  if (!wrap) return;
  table.__trzSizes = s;
  let w = s.w;
  if (!w && s.cols && s.cols.every(Boolean)) w = s.cols.reduce((a, b) => a + b, 0);
  if (!w) return;
  wrap.classList.add("trz-wrap", "trz-host");
  wrap.style.setProperty("--trz-w", `${Math.round(w)}px`);
  table.classList.add("trz-table");
  table.style.width = `${Math.round(w)}px`;
  const first = table.rows[0];
  if (s.cols && first) {
    Array.from(first.cells).forEach((c, i) => {
      if (s.cols[i]) c.style.width = `${Math.round(s.cols[i])}px`;
    });
  }
  if (s.rows) {
    Array.from(table.rows).forEach((r, i) => {
      r.style.height = s.rows[i] ? `${Math.round(s.rows[i])}px` : "";
    });
  }
}

function measure(table) {
  return {
    w: table.getBoundingClientRect().width,
    cols: Array.from(table.rows[0].cells).map((c) => c.getBoundingClientRect().width),
    rows: Array.from(table.rows).map((r) => r.getBoundingClientRect().height),
  };
}

function compute(kind, idx, s0, dx, dy, table) {
  let cols = s0.cols.slice();
  const prev = table.__trzSizes && table.__trzSizes.rows;
  let rows = prev ? prev.slice() : null;
  if (kind === "col") {
    cols[idx] = Math.max(MIN_COL, cols[idx] + dx);
  } else if (kind === "row") {
    rows = rows || new Array(s0.rows.length).fill(null);
    rows[idx] = Math.max(MIN_ROW, s0.rows[idx] + dy);
  } else {
    const fx = Math.max(0.1, (s0.w + dx) / s0.w);
    const fy = Math.max(0.1, (s0.rows.reduce((a, b) => a + b, 0) + dy) / s0.rows.reduce((a, b) => a + b, 0));
    cols = cols.map((c) => Math.max(MIN_COL, c * fx));
    rows = s0.rows.map((r) => Math.max(MIN_ROW, r * fy));
  }
  cols = cols.map(Math.round);
  if (rows) rows = rows.map((r) => (r ? Math.round(r) : null));
  return { w: cols.reduce((a, b) => a + b, 0), cols, rows };
}

/** Handles are only ever allowed in the editable view (Live Preview / Source), never in Reading view. */
function isEditing(wrap) {
  if (wrap.closest(".markdown-preview-view, .markdown-reading-view, .el-table")) return false;
  const src = wrap.closest(".markdown-source-view");
  return !!src && !!src.closest(".workspace-leaf-content[data-mode='source']");
}

function showHandles(wrap, getSave) {
  if (wrap.__trzDrag) return;
  if (!isEditing(wrap)) {
    const stale = wrap.querySelector(":scope > .trz-layer");
    if (stale) stale.remove();
    return;
  }
  const table = wrap.querySelector("table");
  if (!table || !table.rows.length) return;
  const old = wrap.querySelector(":scope > .trz-layer");
  if (old) old.remove();

  const layer = document.createElement("div");
  layer.className = "trz-layer";
  layer.contentEditable = "false";
  wrap.appendChild(layer);

  const wr = wrap.getBoundingClientRect();
  const X = (v) => v - wr.left + wrap.scrollLeft;
  const Y = (v) => v - wr.top + wrap.scrollTop;
  const tr = table.getBoundingClientRect();

  const mk = (cls, kind, idx, css) => {
    const h = document.createElement("div");
    h.className = `trz-h ${cls}`;
    Object.assign(h.style, css);
    h.addEventListener("pointerdown", (e) => startDrag(e, h, wrap, layer, kind, idx, getSave));
    layer.appendChild(h);
  };

  Array.from(table.rows[0].cells).forEach((c, i) => {
    const r = c.getBoundingClientRect();
    mk("trz-col", "col", i, {
      left: `${X(r.right) - 6}px`,
      top: `${Y(tr.top)}px`,
      height: `${tr.height}px`,
    });
  });
  Array.from(table.rows).forEach((row, j) => {
    const r = row.getBoundingClientRect();
    mk("trz-row", "row", j, {
      left: `${X(tr.left)}px`,
      top: `${Y(r.bottom) - 6}px`,
      width: `${tr.width}px`,
    });
  });
  mk("trz-corner", "corner", 0, {
    left: `${X(tr.right) - 14}px`,
    top: `${Y(tr.bottom) - 14}px`,
  });

  wrap.addEventListener(
    "pointerleave",
    () => {
      if (!wrap.__trzDrag) layer.remove();
    },
    { once: true }
  );
}

function startDrag(e, handle, wrap, layer, kind, idx, getSave) {
  e.preventDefault();
  e.stopPropagation();
  const table = wrap.querySelector("table");
  if (!table) return;
  handle.setPointerCapture(e.pointerId);
  handle.classList.add("active");
  wrap.__trzDrag = true;
  const s0 = measure(table);
  const x0 = e.clientX;
  const y0 = e.clientY;
  let cur = null;

  const move = (ev) => {
    cur = compute(kind, idx, s0, ev.clientX - x0, ev.clientY - y0, table);
    applySizes(table, cur);
  };
  const up = async () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", up);
    handle.removeEventListener("pointercancel", up);
    wrap.__trzDrag = false;
    handle.classList.remove("active");
    layer.remove();
    if (cur) {
      try {
        await getSave()(cur);
      } catch (err) {
        console.error("Table Resizer: save failed", err);
        new Notice("Table Resizer: could not save the table size.");
      }
    }
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", up);
  handle.addEventListener("pointercancel", up);
}

function attach(table, sizes, save) {
  const wrap = wrapperOf(table);
  if (!wrap) return;
  wrap.classList.add("trz-host");
  wrap.__trzSave = save;
  if (sizes) applySizes(table, sizes);
  if (save && !wrap.__trzBound) {
    wrap.__trzBound = true;
    wrap.addEventListener("pointerenter", () => showHandles(wrap, () => wrap.__trzSave));
  }
}

/* ---------- plugin ---------- */

module.exports = class TableResizer extends Plugin {
  async onload() {
    const saved = (await this.loadData()) || {};
    this.sizes = saved.sizes || {};

    // Reading view: apply saved sizes, no handles
    this.registerMarkdownPostProcessor((el, ctx) => {
      const tables = Array.from(el.querySelectorAll("table")).filter((t) => !t.closest(".cm-editor"));
      if (!tables.length) return;
      const info = ctx.getSectionInfo(el);
      if (!info) return;
      const lines = info.text.split("\n");
      if (!(lines[info.lineStart] || "").trim().startsWith("|")) return;
      const sizes = this.get(ctx.sourcePath, tableKey(lines, info.lineStart));
      attach(tables[0], sizes, null);
      const w = wrapperOf(tables[0]);
      if (w) w.querySelectorAll(":scope > .trz-layer").forEach((n) => n.remove());
    });

    // Live Preview: apply sizes + handles
    this.pending = new Set();
    const schedule = (table) => {
      this.pending.add(table);
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        const list = Array.from(this.pending);
        this.pending.clear();
        list.forEach((t) => t.isConnected && this.processLP(t));
      });
    };
    const collect = (node) => {
      if (node.nodeType !== 1) return;
      const own = node.closest && node.closest("table");
      if (own && own.closest(".cm-editor")) schedule(own);
      if (node.querySelectorAll) {
        node.querySelectorAll("table").forEach((t) => {
          if (t.closest(".cm-editor")) schedule(t);
        });
      }
    };
    const mo = new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach(collect);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    this.register(() => mo.disconnect());

    const rescan = () => document.querySelectorAll(".cm-editor table").forEach(schedule);
    this.app.workspace.onLayoutReady(rescan);
    this.registerEvent(this.app.workspace.on("layout-change", rescan));
    this.registerEvent(this.app.workspace.on("file-open", rescan));

    // keep sizes when notes are renamed / deleted
    this.registerEvent(
      this.app.vault.on("rename", (f, oldPath) => {
        if (this.sizes[oldPath]) {
          this.sizes[f.path] = this.sizes[oldPath];
          delete this.sizes[oldPath];
          this.persist();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (f) => {
        if (this.sizes[f.path]) {
          delete this.sizes[f.path];
          this.persist();
        }
      })
    );
  }

  onunload() {
    document.querySelectorAll(".trz-layer").forEach((n) => n.remove());
    document.querySelectorAll(".trz-wrap, .trz-host").forEach((n) => {
      n.classList.remove("trz-wrap", "trz-host");
      n.style.removeProperty("--trz-w");
    });
    document.querySelectorAll("table.trz-table").forEach((t) => {
      t.classList.remove("trz-table");
      t.style.width = "";
    });
  }

  get(path, key) {
    const f = this.sizes[path];
    return f && f[key] ? f[key] : null;
  }

  set(path, key, s) {
    (this.sizes[path] = this.sizes[path] || {})[key] = s;
    this.persist();
  }

  persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveData({ sizes: this.sizes }), 300);
  }

  /** Locate the table's first line in the CodeMirror doc. */
  locate(table) {
    const leaf = this.app.workspace
      .getLeavesOfType("markdown")
      .find((l) => l.view.containerEl && l.view.containerEl.contains(table));
    const cm = leaf && leaf.view.editor ? leaf.view.editor.cm : null;
    const path = leaf && leaf.view.file ? leaf.view.file.path : null;
    if (!cm || !path) return null;
    let pos;
    try {
      pos = cm.posAtDOM(table);
    } catch (e) {
      return null;
    }
    const doc = cm.state.doc;
    const line = doc.lineAt(pos);
    if (!line.text.trim().startsWith("|")) return null;
    const lines = [];
    for (let i = 1; i <= line.number; i++) lines.push(doc.line(i).text);
    return { path, key: tableKey(lines, line.number - 1) };
  }

  processLP(table) {
    const w = wrapperOf(table);
    if (!w || !isEditing(w)) return;
    const loc = this.locate(table);
    if (!loc) return;
    attach(table, this.get(loc.path, loc.key), async (s) => {
      const cur = this.locate(table) || loc;
      this.set(cur.path, cur.key, s);
    });
  }
};
