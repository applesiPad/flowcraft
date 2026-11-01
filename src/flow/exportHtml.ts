import type { Edge, Node } from "@xyflow/react";
import type { DecisionData, ScreenData, ScreenElement } from "./types";
import { namedInputs, normalizeCondition } from "./prototypeLogic";

export type PrototypeExport = { html: string; screens: number; links: number };

/**
 * 导出播放器的节点图数据：不再导出时预解析「判断穿透」，而是把原始拓扑与
 * 条件/变量交给播放器运行时求值（与 src/flow/prototypeLogic.ts 同语义）。
 */
type PlayerPayload = {
  SCREENS: Record<string, string>;
  LINKS: Record<string, Record<string, string>>;
  TITLES: Record<string, string>;
  NODE_TYPE: Record<string, string>;
  DECISIONS: Record<string, { t: string; y: string; n: string; c: { v: string; op: string; x: string } | null }>;
  OUT: Record<string, { h: string; t: string }[]>;
  VALID: Record<string, { id: string; v: string; r: string; l: string }[]>;
  START: string;
};

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
.x-toast.is-error { border-color: rgba(248, 113, 113, 0.55); color: #fecaca; }
[data-el-id].fc-x-hit { cursor: pointer; border-radius: 10px; }
[data-el-id].fc-x-hit:hover { outline: 2px solid rgba(124, 92, 255, 0.9); outline-offset: 3px; }
[data-el-id].fc-x-dead { cursor: default; }
.x-legend { font-size: 11.5px; color: #6b7387; text-align: center; padding-bottom: 16px; }
.x-input {
  flex: 1; min-width: 0; border: 0; outline: 0; background: transparent;
  font: inherit; color: #1e293b; padding: 0; height: 100%;
}
.x-input::placeholder { color: #94a3b8; }
.fc-input-field.is-invalid, .x-input.is-invalid { outline: 2px solid rgba(239, 68, 68, 0.65); outline-offset: 1px; border-radius: 10px; }
.x-anim-fwd, .x-anim-back { animation-duration: 0.3s; animation-timing-function: ease-out; animation-fill-mode: both; }
.x-anim-fwd { animation-name: x-slide-fwd; }
.x-anim-back { animation-name: x-slide-back; }
@keyframes x-slide-fwd {
  from { opacity: 0; transform: translateX(30px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes x-slide-back {
  from { opacity: 0; transform: translateX(-30px); }
  to { opacity: 1; transform: translateX(0); }
}
`;

const PLAYER_JS = `
(function () {
  var cur = START;
  var stack = [START];
  var vars = {};
  var stage = document.getElementById('stage');
  var pathEl = document.getElementById('path');
  var backBtn = document.querySelector('[data-act="back"]');
  var restartBtn = document.querySelector('[data-act="restart"]');
  var toastTimer = null;

  function toast(msg, isError) {
    var old = document.querySelector('.x-toast');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'x-toast' + (isError ? ' is-error' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.remove(); }, 1900);
  }

  // ---- 条件求值：与 src/flow/prototypeLogic.ts 逐值同语义 ----
  function toNum(s) {
    var t = String(s == null ? '' : s).trim();
    if (!t) return null;
    var n = Number(t);
    return isFinite(n) ? n : null;
  }
  function evalCond(c) {
    var actual = vars[c.v] != null ? vars[c.v] : '';
    var expected = c.x || '';
    if (c.op === 'empty') return actual.replace(/\\s/g, '') === '';
    if (c.op === 'notEmpty') return actual.replace(/\\s/g, '') !== '';
    var a = toNum(actual), b = toNum(expected);
    if (a !== null && b !== null) {
      if (c.op === '==') return a === b;
      if (c.op === '!=') return a !== b;
      if (c.op === '>') return a > b;
      if (c.op === '>=') return a >= b;
      if (c.op === '<') return a < b;
      if (c.op === '<=') return a <= b;
    }
    if (c.op === '==') return actual === expected;
    if (c.op === '!=') return actual !== expected;
    if (c.op === '>') return actual > expected;
    if (c.op === '>=') return actual >= expected;
    if (c.op === '<') return actual < expected;
    if (c.op === '<=') return actual <= expected;
    return false;
  }

  // 穿透判断/动作节点：判断按条件选是/否，动作走第一条出口
  function resolveTarget(startId) {
    var t = startId;
    var guard = 0;
    while (guard++ < 32) {
      if (!NODE_TYPE[t]) return null;
      if (NODE_TYPE[t] === 'screen') return t;
      var outs = OUT[t] || [];
      if (!outs.length) return null;
      var next = null;
      if (NODE_TYPE[t] === 'decision') {
        var d = DECISIONS[t] || {};
        var wantYes = !d.c || evalCond(d.c);
        for (var i = 0; i < outs.length; i++) {
          if (outs[i].h === (wantYes ? 'yes' : 'no')) { next = outs[i]; break; }
        }
        if (!next) next = outs[0];
      } else {
        next = outs[0];
      }
      t = next.t;
    }
    return null;
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
    // 回填已输入的变量值
    var fields = stage.querySelectorAll('input[data-var]');
    for (var j = 0; j < fields.length; j++) {
      var v = fields[j].getAttribute('data-var');
      if (vars[v] != null) fields[j].value = vars[v];
    }
    renderPath();
  }

  function collectInputs() {
    var fields = stage.querySelectorAll('input[data-var]');
    for (var i = 0; i < fields.length; i++) {
      vars[fields[i].getAttribute('data-var')] = fields[i].value;
    }
  }

  function validateInputs() {
    var rules = VALID[cur] || [];
    stage.querySelectorAll('.is-invalid').forEach(function (n) { n.classList.remove('is-invalid'); });
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      var value = vars[r.v] != null ? vars[r.v] : '';
      var t = String(value).trim();
      var name = r.l || '该输入框';
      var msg = null;
      if (!t) msg = '请填写「' + name + '」';
      else if (r.r === 'phone' && !/^1\\d{10}$/.test(t)) msg = '「' + name + '」需要 11 位手机号';
      else if (r.r === 'number' && !isFinite(Number(t))) msg = '「' + name + '」需要填写数字';
      if (msg) {
        var field = stage.querySelector('input[data-var="' + r.v + '"]');
        if (field) field.classList.add('is-invalid');
        return msg;
      }
    }
    return null;
  }

  function animate(dir) {
    stage.classList.remove('x-anim-fwd', 'x-anim-back');
    void stage.offsetWidth; // 重启动画
    stage.classList.add(dir === 'back' ? 'x-anim-back' : 'x-anim-fwd');
  }

  function goTo(target) {
    cur = target;
    stack.push(target);
    animate('fwd');
    render();
  }

  stage.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('input[data-var]')) return;
    var el = e.target.closest ? e.target.closest('[data-el-id]') : null;
    if (!el) return;
    var id = el.getAttribute('data-el-id');
    var map = LINKS[cur] || {};
    var direct = map[id];
    if (!direct) {
      var label = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 14);
      toast('「' + (label || '该控件') + '」还没有配置跳转', true);
      return;
    }
    collectInputs();
    var invalid = validateInputs();
    if (invalid) { toast(invalid, true); return; }
    var decision = NODE_TYPE[direct] === 'decision' ? DECISIONS[direct] : null;
    var next = resolveTarget(direct);
    if (!next) {
      toast('这条连线最终没有落到界面上', true);
      return;
    }
    if (decision && decision.c) {
      var yes = !evalCond(decision.c);
      toast('条件「' + decision.c.v + '」' + (yes ? '成立' : '不成立') + ' → 走「' + (yes ? decision.y : decision.n) + '」');
    }
    goTo(next);
  });

  if (backBtn) backBtn.addEventListener('click', function () {
    if (stack.length > 1) { stack.pop(); cur = stack[stack.length - 1]; animate('back'); render(); }
  });
  if (restartBtn) restartBtn.addEventListener('click', function () {
    stack = [START]; cur = START; vars = {}; animate('fwd'); render();
  });
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    var editable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (e.key === 'Backspace' && !editable) { e.preventDefault(); if (backBtn) backBtn.click(); }
    if (e.key === 'Escape' && !editable) { stack = [START]; cur = START; vars = {}; animate('fwd'); render(); }
  });

  // QA 钩子：Ego 回归直接断言播放器内嵌逻辑与 prototypeLogic.ts 同语义
  window.__fcDebug = {
    evalCond: evalCond,
    resolveTarget: resolveTarget,
    setVars: function (v) { vars = v || {}; },
    getVars: function () { return vars; }
  };

  render();
})();
`;

/** 从当前画布 DOM 抓取界面快照，生成可离线打开的单文件交互原型 */
export function buildPrototypeHtml(nodes: Node[], edges: Edge[], name = "FlowCraft 交互原型"): PrototypeExport {
  const screens = nodes.filter((n) => n.type === "screen");
  const titles: Record<string, string> = {};
  screens.forEach((s) => {
    titles[s.id] = (s.data as unknown as ScreenData).title || s.id;
  });

  const nodeType: Record<string, string> = {};
  nodes.forEach((n) => {
    nodeType[n.id] = n.type ?? "screen";
  });

  // 连线只记「直接目标」：判断 / 动作节点的穿透交给播放器按条件运行时求值
  const links: Record<string, Record<string, string>> = {};
  const outs: Record<string, { h: string; t: string }[]> = {};
  edges.forEach((e) => {
    if (!e.sourceHandle) return;
    if (nodeType[e.source] === "screen") {
      links[e.source] = links[e.source] ?? {};
      links[e.source][e.sourceHandle] = e.target;
    } else {
      outs[e.source] = outs[e.source] ?? [];
      outs[e.source].push({ h: e.sourceHandle, t: e.target });
    }
  });

  const decisions: PlayerPayload["DECISIONS"] = {};
  nodes.forEach((n) => {
    if (n.type !== "decision") return;
    const data = n.data as unknown as DecisionData;
    const cond = normalizeCondition(data.condition);
    decisions[n.id] = {
      t: data.title ?? n.id,
      y: data.yes ?? "是",
      n: data.no ?? "否",
      c: cond ? { v: cond.variable, op: cond.op, x: cond.value ?? "" } : null,
    };
  });

  // 带变量名输入框的校验规则：key = 界面 id，value = { 变量名, 规则, 展示名 }
  const valid: PlayerPayload["VALID"] = {};
  const inputsByScreen: Record<string, ScreenElement[]> = {};
  screens.forEach((node) => {
    const data = node.data as unknown as ScreenData;
    const named = namedInputs(data);
    if (!named.length) return;
    inputsByScreen[node.id] = named;
    valid[node.id] = named
      .filter((el) => el.validation)
      .map((el) => ({ id: el.id, v: el.name!, r: el.validation!, l: el.label ?? el.placeholder ?? "" }));
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
    // 带变量名的输入框 → 真实 <input>（保留外层样式，占位文本挪进 input）
    for (const el of inputsByScreen[node.id] ?? []) {
      const ph = root.querySelector(`[data-el-id="${el.id}"] .fc-input-ph`);
      if (!ph) continue;
      const input = doc.createElement("input");
      input.className = "x-input";
      input.setAttribute("data-var", el.name!);
      input.setAttribute("placeholder", el.placeholder ?? "请输入");
      ph.replaceWith(input);
    }
    html[node.id] = root.innerHTML;
  });

  // 起点：优先选没有入边的界面（真正的流程入口）
  const incoming = new Set(edges.filter((e) => nodeType[e.target] === "screen").map((e) => e.target));
  const start = (screens.find((s) => !incoming.has(s.id)) ?? screens[0])?.id ?? "";

  const payload = JSON.stringify({
    SCREENS: html,
    LINKS: links,
    TITLES: titles,
    NODE_TYPE: nodeType,
    DECISIONS: decisions,
    OUT: outs,
    VALID: valid,
    START: start,
  } satisfies PlayerPayload).replace(/<\/script/gi, "<\\/script");

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
      <div class="x-sub">${screens.length} 个界面 · ${linkCount} 条跳转 · 点界面里的控件走流程，输入框可填写</div>
    </div>
    <div class="x-actions">
      <button class="x-btn" data-act="back">← 返回</button>
      <button class="x-btn" data-act="restart">⟲ 重新开始</button>
    </div>
  </header>
  <main class="x-stage"><div class="x-phone fc-preview-device" id="stage"></div></main>
  <footer class="x-path" id="path"></footer>
  <div class="x-legend">紫色描边 = 可跳转热点 · 输入框可填写并参与条件判断 · Backspace 返回 · Esc 回到起点</div>
</div>
<script>var __FLOW__ = ${payload};</script>
<script>
var SCREENS = __FLOW__.SCREENS, LINKS = __FLOW__.LINKS, TITLES = __FLOW__.TITLES,
    NODE_TYPE = __FLOW__.NODE_TYPE, DECISIONS = __FLOW__.DECISIONS, OUT = __FLOW__.OUT,
    VALID = __FLOW__.VALID, START = __FLOW__.START;
${PLAYER_JS}
</script>
</body>
</html>`;

  return { html: doc, screens: screens.length, links: linkCount };
}
