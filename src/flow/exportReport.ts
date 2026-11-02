/**
 * 评审报告导出：把画布上的结构化数据拼成一份单文件 HTML 报告，
 * 给 PM 直接贴进需求文档 / 发到群里，不用分别截几张图。
 *
 * 内容：概览统计、界面清单、跳转连线表、判断与条件表、批注列表、流程体检结果。
 * 纯函数（不读 DOM）、Node 测试可直接 import；产物可离线打开、可直接打印。
 */
import type { Edge, Node } from "@xyflow/react";
import type { Annotation } from "./annotations.ts";
import { HEALTH_KIND_LABEL, HEALTH_KIND_ORDER, scanFlowHealth } from "./flowHealth.ts";
import { normalizeCondition } from "./prototypeLogic.ts";
import type { DecisionData, ScreenData } from "./types.ts";

export type ReportExport = { html: string; screens: number; links: number; issues: number };

const REPORT_CSS = `
* { box-sizing: border-box; }
body { margin: 0; padding: 32px 20px 60px; background: #f5f6f8; color: #1c1917;
  font-family: "PingFang SC", "Microsoft YaHei", "Inter", -apple-system, sans-serif; }
.sheet { max-width: 980px; margin: 0 auto; background: #fff; border: 1px solid #e5e2dd;
  border-radius: 14px; padding: 34px 38px 42px; box-shadow: 0 2px 6px rgba(28,25,23,.05), 0 24px 56px -30px rgba(28,25,23,.25); }
h1 { font-size: 21px; margin: 0 0 4px; }
.r-sub { font-size: 12.5px; color: #78716c; margin-bottom: 18px; }
.r-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 26px; }
.r-chip { font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 999px;
  background: #eef2ff; color: #4f46e5; }
.r-chip.is-warn { background: #fffbeb; color: #b45309; }
.r-chip.is-plain { background: #f4f2ef; color: #57534e; }
h2 { font-size: 15px; margin: 30px 0 10px; padding-top: 16px; border-top: 1px solid #eee9e3; }
table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
th { text-align: left; font-weight: 600; color: #78716c; background: #faf9f7;
  padding: 7px 10px; border: 1px solid #eee9e3; white-space: nowrap; }
td { padding: 7px 10px; border: 1px solid #eee9e3; vertical-align: top; }
tr:nth-child(even) td { background: #fcfbfa; }
.r-arrow { color: #a8a29e; padding: 0 4px; }
.r-branch { display: inline-block; font-size: 11px; font-weight: 700; border-radius: 999px; padding: 1px 8px; margin-right: 6px; }
.r-yes { background: #ecfdf5; color: #047857; }
.r-no { background: #fff1f2; color: #e11d48; }
.r-cond { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 12px; background: #f4f2ef; border-radius: 6px; padding: 2px 7px; }
.r-cond.is-empty { color: #a8a29e; font-family: inherit; }
.r-note { display: flex; gap: 9px; padding: 9px 0; border-bottom: 1px dashed #eee9e3; font-size: 13px; }
.r-note:last-child { border-bottom: none; }
.r-dot { width: 12px; height: 12px; border-radius: 999px; margin-top: 3px; flex: 0 0 auto; }
.r-note em { font-style: normal; color: #78716c; font-size: 11.5px; display: block; margin-top: 2px; }
.r-issue { padding: 8px 12px; border-radius: 9px; font-size: 12.5px; margin-bottom: 6px; }
.r-issue b { display: block; margin-bottom: 2px; }
.r-issue.is-warn { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
.r-issue.is-ok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; }
.r-var { font-family: ui-monospace, Consolas, monospace; font-size: 11.5px; background: #f0f9ff; color: #0369a1; border-radius: 5px; padding: 1px 6px; margin-right: 4px; }
.r-empty { color: #a8a29e; font-size: 12.5px; }
@media print { body { background: #fff; padding: 0; } .sheet { border: none; box-shadow: none; } }
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function titleOf(node: Node): string {
  return String((node.data as { title?: unknown })?.title ?? "").trim() || node.id;
}

const ANNOTATION_DOT: Record<string, string> = { yellow: "#facc15", blue: "#60a5fa", green: "#34d399", red: "#f87171" };

export function buildReportHtml(
  nodes: Node[],
  edges: Edge[],
  annotations: Annotation[],
  opts: { title?: string; generatedAt?: number } = {},
): ReportExport {
  const screens = nodes.filter((n) => n.type === "screen");
  const decisions = nodes.filter((n) => n.type === "decision");
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const title = (opts.title ?? "").trim() || "FlowCraft 流程评审报告";
  const generatedAt = new Date(opts.generatedAt ?? Date.now());

  const issues = scanFlowHealth(nodes, edges);
  const issuesByKind = HEALTH_KIND_ORDER.map((kind) => ({ kind, list: issues.filter((i) => i.kind === kind) })).filter((g) => g.list.length);

  const screenRows = screens.map((node) => {
    const data = node.data as unknown as ScreenData;
    const els = data.elements ?? [];
    const vars = els.filter((el) => el.kind === "input" && el.name).map((el) => el.name!);
    const notes = annotations.filter((a) => a.targetType === "node" && a.targetId === node.id);
    return {
      title: data.title?.trim() || "（未命名）",
      elements: els.length,
      hotspots: els.filter((el) => el.hotspot).length,
      vars,
      outs: edges.filter((e) => e.source === node.id).length,
      ins: edges.filter((e) => e.target === node.id).length,
      notes: notes.length,
    };
  });

  const edgeRows = edges.map((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    const label = String((edge.data as { label?: unknown })?.label ?? "");
    let trigger = label || "跳转";
    if (edge.sourceHandle === "yes") trigger = `<span class="r-branch r-yes">是</span>${escapeHtml(source ? (source.data as unknown as DecisionData).yes ?? "是" : "")}`;
    else if (edge.sourceHandle === "no") trigger = `<span class="r-branch r-no">否</span>${escapeHtml(source ? (source.data as unknown as DecisionData).no ?? "否" : "")}`;
    else if (edge.sourceHandle && edge.sourceHandle !== "in") {
      const el = (source?.data as unknown as ScreenData | undefined)?.elements?.find((item) => item.id === edge.sourceHandle);
      trigger = escapeHtml(label || (el ? `点击「${el.label ?? el.action ?? "热点"}」` : "跳转"));
    } else trigger = escapeHtml(trigger);
    return {
      trigger,
      from: source ? titleOf(source) : edge.source,
      to: target ? titleOf(target) : edge.target,
    };
  });

  const condRows = decisions.map((node) => {
    const data = node.data as unknown as DecisionData;
    const cond = normalizeCondition(data.condition);
    const branchTo = (handle: "yes" | "no") => {
      const edge = edges.find((e) => e.source === node.id && e.sourceHandle === handle);
      if (!edge) return "—";
      const target = nodeById.get(edge.target);
      return target ? titleOf(target) : edge.target;
    };
    return {
      title: titleOf(node),
      cond: cond
        ? `<span class="r-cond">${escapeHtml(cond.variable)} ${escapeHtml(cond.op)} ${escapeHtml(cond.value ?? "")}</span>`
        : '<span class="r-cond is-empty">未配置（默认走「是」）</span>',
      yes: branchTo("yes"),
      no: branchTo("no"),
    };
  });

  const noteRows = annotations.map((a) => {
    let where = a.targetId;
    if (a.targetType === "node") {
      where = nodeById.has(a.targetId) ? titleOf(nodeById.get(a.targetId)!) : `${a.targetId}（已删除）`;
    } else {
      const edge = edges.find((e) => e.id === a.targetId);
      where = edge ? describeEdgeTarget(edge, nodeById) : `${a.targetId}（已删除）`;
    }
    const time = Number.isFinite(Date.parse(a.updatedAt)) ? new Date(a.updatedAt).toLocaleString("zh-CN", { hour12: false }) : "";
    return { color: ANNOTATION_DOT[a.color] ?? "#a8a29e", where, content: a.content, author: a.author, time };
  });

  const chips = [
    `<span class="r-chip is-plain">界面 ${screens.length}</span>`,
    `<span class="r-chip is-plain">连线 ${edges.length}</span>`,
    `<span class="r-chip is-plain">判断 ${decisions.length}</span>`,
    `<span class="r-chip is-plain">批注 ${annotations.length}</span>`,
    issues.length
      ? `<span class="r-chip is-warn">体检待确认 ${issues.length} 项</span>`
      : '<span class="r-chip" style="background:#ecfdf5;color:#047857">体检通过</span>',
  ].join("");

  const screenTable = screens.length
    ? `<table><thead><tr><th>界面</th><th>元素</th><th>热点</th><th>输入变量</th><th>出口</th><th>入口</th><th>批注</th></tr></thead><tbody>${screenRows
        .map(
          (r) =>
            `<tr><td><b>${escapeHtml(r.title)}</b></td><td>${r.elements}</td><td>${r.hotspots}</td><td>${
              r.vars.length ? r.vars.map((v) => `<span class="r-var">${escapeHtml(v)}</span>`).join("") : '<span class="r-empty">—</span>'
            }</td><td>${r.outs}</td><td>${r.ins}</td><td>${r.notes || "—"}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : '<p class="r-empty">画布上还没有界面节点。</p>';

  const edgeTable = edges.length
    ? `<table><thead><tr><th>触发</th><th>来源</th><th></th><th>目标</th></tr></thead><tbody>${edgeRows
        .map((r) => `<tr><td>${r.trigger}</td><td>${escapeHtml(r.from)}</td><td class="r-arrow">→</td><td>${escapeHtml(r.to)}</td></tr>`)
        .join("")}</tbody></table>`
    : '<p class="r-empty">还没有连线。</p>';

  const condTable = decisions.length
    ? `<table><thead><tr><th>判断节点</th><th>条件</th><th>是 →</th><th>否 →</th></tr></thead><tbody>${condRows
        .map((r) => `<tr><td>${escapeHtml(r.title)}</td><td>${r.cond}</td><td>${escapeHtml(r.yes)}</td><td>${escapeHtml(r.no)}</td></tr>`)
        .join("")}</tbody></table>`
    : "";

  const noteSection = annotations.length
    ? noteRows
        .map(
          (r) =>
            `<div class="r-note"><span class="r-dot" style="background:${r.color}"></span><div>${escapeHtml(
              r.content,
            )}<em>「${escapeHtml(r.where)}」${r.author ? ` · ${escapeHtml(r.author)}` : ""}${r.time ? ` · ${r.time}` : ""}</em></div></div>`,
        )
        .join("")
    : '<p class="r-empty">画布上没有批注。</p>';

  const healthSection = issues.length
    ? issuesByKind
        .map((group) =>
          group.list
            .map(
              (issue) =>
                `<div class="r-issue is-warn"><b>【${HEALTH_KIND_LABEL[group.kind]}】${escapeHtml(issue.title)}</b>${escapeHtml(issue.detail)}</div>`,
            )
            .join(""),
        )
        .join("")
    : '<div class="r-issue is-ok"><b>流程体检通过</b>没有死路、孤立界面、未接线主按钮、缺失分支、条件变量无来源或未命名界面。</div>';

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<div class="sheet">
  <h1>${escapeHtml(title)}</h1>
  <div class="r-sub">由 FlowCraft 生成于 ${escapeHtml(generatedAt.toLocaleString("zh-CN", { hour12: false }))} · 可打印，数据与导出时刻一致</div>
  <div class="r-chips">${chips}</div>

  <h2>界面清单（${screens.length}）</h2>
  ${screenTable}

  <h2>跳转连线（${edges.length}）</h2>
  ${edgeTable}
  ${condTable ? `<h2>判断与条件（${decisions.length}）</h2>\n  ${condTable}` : ""}

  <h2>批注（${annotations.length}）</h2>
  ${noteSection}

  <h2>流程体检（${issues.length ? `${issues.length} 项待确认` : "通过"}）</h2>
  ${healthSection}
</div>
</body>
</html>`;

  return { html, screens: screens.length, links: edges.length, issues: issues.length };
}

function describeEdgeTarget(edge: Edge, nodeById: Map<string, Node>): string {
  const from = nodeById.get(edge.source);
  const to = nodeById.get(edge.target);
  const label = String((edge.data as { label?: unknown })?.label ?? "");
  return `${label ? `「${label}」` : ""}${from ? titleOf(from) : edge.source} → ${to ? titleOf(to) : edge.target}`;
}
