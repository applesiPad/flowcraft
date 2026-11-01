import type { Edge, Node } from "@xyflow/react";
import type { ScreenData } from "./types";

export type PrototypeExport = { html: string; screens: number; links: number };

/** 把「判断 / 系统动作」这类中间节点穿透掉，落到真正的界面节点 */
export function resolveScreenTarget(startId: string, nodes: Node[], edges: Edge[], screenIds: Set<string>): string | null {
  let target = startId;
  let guard = 0;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  while (guard++ < 32) {
    if (screenIds.has(target)) return target;
    const node = byId.get(target);
    if (!node) return null;
    const outs = edges.filter((e) => e.source === target);
    if (!outs.length) return null;
    const next = node.type === "decision" ? outs.find((e) => e.sourceHandle === "yes") ?? outs[0] : outs[0];
    target = next.target;
  }
  return null;
}

function collectCss(): string {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const text = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join("\n");
      if (text.includes(".fc-screen")) chunks.push(text);
    } catch {
      /* 跨域样式表跳过 */
    }
  }
  return chunks.join("\n");
}

const SHELL_CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background: radial-gradient(1100px 620px at 50% -10%, #1b2436 0%, #0a0c11 62%, #070810 100%);
  color: #e5e7eb;
  font-family: "PingFang SC", "Microsoft YaHei", "Inter", -apple-system, sans-serif;
}
.x-shell { min-height: 100vh; display: flex; flex-direction: column; }
.x-head {
  display: flex; align-items: center; gap: 16px;
  padding: 14px 22px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(10, 12, 16, 0.72);
  position: sticky; top: 0; z-index: 3;
  backdrop-filter: blur(10px);
}
.x-title { font-size: 15px; font-weight: 700; letter-spacing: 0.2px; }
.x-sub { font-size: 12px; color: #8b94a7; margin-top: 3px; }
.x-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.x-btn {
  appearance: none; border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(148, 163, 184, 0.08); color: #dbe2f0;
  font-size: 12.5px; padding: 6px 12px; border-radius: 9px; cursor: pointer;
  font-family: inherit;
}
.x-btn:hover { background: rgba(148, 163, 184, 0.16); }
.x-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.x-stage { flex: 1; display: grid; place-items: center; padding: 34px 16px 12px; }
.x-phone { position: relative; }
.x-path {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 12px 22px 20px; font-size: 12.5px; color: #8b94a7;
  justify-content: center;
}
.x-path b { color: #cbd5e1; font-weight: 500; }
.x-path .is-current { color: #fff; font-weight: 600; }
.x-toast {
  position: fixed; left: 50%; bottom: 78px; transform: translateX(-50%);
  background: rgba(17, 20, 27, 0.94); border: 1px solid rgba(148, 163, 184, 0.22);
  padding: 9px 16px; border-radius: 999px; font-size: 12.5px; color: #e2e8f0;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55); z-index: 9;
}
[data-el-id].fc-x-hit { cursor: pointer; border-radius: 10px; }
[data-el-id].fc-x-hit:hover { outline: 2px solid rgba(124, 92, 255, 0.9); outline-offset: 3px; }
[data-el-id].fc-x-dead { cursor: default; }
.x-legend { font-size: 11.5px; color: #6b7387; text-align: center; padding-bottom: 16px; }
`;

const PLAYER_JS = `
(function () {
  var cur = START;
  var stack = [START];
  var stage = document.getElementById('stage');
  var pathEl = document.getElementById('path');
  var backBtn = document.querySelector('[data-act="back"]');
  var restartBtn = document.querySelector('[data-act="restart"]');
  var toastTimer = null;

  function toast(msg) {
    var old = document.querySelector('.x-toast');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'x-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.remove(); }, 1700);
  }

  function renderPath() {
    var parts = [];
    for (var i = 0; i < stack.length; i++) {
      var id = stack[i];
      var name = TITLES[id] || id;
      var cls = i === stack.length - 1 ? ' class="is-current"' : '';
      parts.push('<b' + cls + '>' + name + '</b>');
      if (i < stack.length - 1) parts.push('<span>→</span>');
    }
    pathEl.innerHTML = parts.join(' ');
    if (backBtn) backBtn.disabled = stack.length <= 1;
  }

  function render() {
    stage.innerHTML = SCREENS[cur] || '';
    var map = LINKS[cur] || {};
    var els = stage.querySelectorAll('[data-el-id]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var id = el.getAttribute('data-el-id');
      if (map[id]) {
        el.className += ' fc-x-hit';
        el.setAttribute('title', '跳转到：' + (TITLES[map[id]] || map[id]));
      } else if (el.className.indexOf('fc-hotspot') >= 0) {
        el.className += ' fc-x-dead';
      }
    }
    renderPath();
  }

  stage.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-el-id]') : null;
    if (!el) return;
    var id = el.getAttribute('data-el-id');
    var map = LINKS[cur] || {};
    var next = map[id];
    if (!next) {
      var label = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 14);
      toast('「' + (label || '该控件') + '」还没有配置跳转');
      return;
    }
    cur = next;
    stack.push(next);
    render();
  });

  if (backBtn) backBtn.addEventListener('click', function () {
    if (stack.length > 1) { stack.pop(); cur = stack[stack.length - 1]; render(); }
  });
  if (restartBtn) restartBtn.addEventListener('click', function () {
    stack = [START]; cur = START; render();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Backspace') { e.preventDefault(); if (backBtn) backBtn.click(); }
    if (e.key === 'Escape') { stack = [START]; cur = START; render(); }
  });

  render();
})();
`;

/** 从当前画布 DOM 抓取界面快照，生成可离线打开的单文件交互原型 */
export function buildPrototypeHtml(nodes: Node[], edges: Edge[], name = "FlowCraft 交互原型"): PrototypeExport {
  const screens = nodes.filter((n) => n.type === "screen");
  const screenIds = new Set(screens.map((s) => s.id));
  const titles: Record<string, string> = {};
  screens.forEach((s) => {
    titles[s.id] = (s.data as unknown as ScreenData).title || s.id;
  });

  const links: Record<string, Record<string, string>> = {};
  edges.forEach((e) => {
    if (!screenIds.has(e.source) || !e.sourceHandle) return;
    const dest = resolveScreenTarget(e.target, nodes, edges, screenIds);
    if (!dest) return;
    links[e.source] = links[e.source] ?? {};
    links[e.source][e.sourceHandle] = dest;
  });

  const parser = new DOMParser();
  const html: Record<string, string> = {};
  let linkCount = 0;

  screens.forEach((node) => {
    const dom = document.querySelector(`.react-flow__node[data-id="${node.id}"] .fc-screen`);
    if (!dom) return;
    const doc = parser.parseFromString(`<div id="__fc_root">${dom.outerHTML}</div>`, "text/html");
    const root = doc.getElementById("__fc_root");
    if (!root) return;

    root
      .querySelectorAll(".react-flow__handle, .fc-hotspot-pin, .fc-caret, .fc-node-badge, .fc-node-meta")
      .forEach((n) => n.remove());
    const linkMap = links[node.id] ?? {};
    root.querySelectorAll<HTMLElement>("[data-el-id]").forEach((el) => {
      const id = el.dataset.elId ?? "";
      el.classList.remove("is-highlight", "is-draggable", "is-dragging", "is-walkable", "is-clickable");
      if (linkMap[id]) {
        el.classList.add("fc-x-hit");
        el.setAttribute("title", `跳转到：${titles[linkMap[id]] ?? linkMap[id]}`);
        linkCount += 1;
      }
    });
    html[node.id] = root.innerHTML;
  });

  // 起点：优先选没有入边的界面（真正的流程入口）
  const incoming = new Set(edges.filter((e) => screenIds.has(e.target)).map((e) => e.target));
  const start = (screens.find((s) => !incoming.has(s.id)) ?? screens[0])?.id ?? "";

  const payload = JSON.stringify({ SCREENS: html, LINKS: links, TITLES: titles, START: start }).replace(
    /<\/script/gi,
    "<\\/script",
  );

  const doc = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${name}</title>
<style>
${collectCss()}
${SHELL_CSS}
</style>
</head>
<body>
<div class="x-shell">
  <header class="x-head">
    <div>
      <div class="x-title">${name}</div>
      <div class="x-sub">${screens.length} 个界面 · ${linkCount} 条跳转 · 点界面里的控件走流程</div>
    </div>
    <div class="x-actions">
      <button class="x-btn" data-act="back">← 返回</button>
      <button class="x-btn" data-act="restart">⟲ 重新开始</button>
    </div>
  </header>
  <main class="x-stage"><div class="x-phone fc-preview-device" id="stage"></div></main>
  <footer class="x-path" id="path"></footer>
  <div class="x-legend">紫色描边 = 可跳转热点 · Backspace 返回 · Esc 回到起点</div>
</div>
<script>var __FLOW__ = ${payload};</script>
<script>
var SCREENS = __FLOW__.SCREENS, LINKS = __FLOW__.LINKS, TITLES = __FLOW__.TITLES, START = __FLOW__.START;
${PLAYER_JS}
</script>
</body>
</html>`;

  return { html: doc, screens: screens.length, links: linkCount };
}
