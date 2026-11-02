import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edge, Node } from "@xyflow/react";
import type { Annotation } from "../src/flow/annotations.ts";
import { buildReportHtml } from "../src/flow/exportReport.ts";

const screenNode = (id: string, title: string, elements: Record<string, unknown>[]): Node => ({
  id,
  type: "screen",
  position: { x: 0, y: 0 },
  data: { title, elements },
});
const decisionNode = (id: string, title: string, condition?: unknown): Node => ({
  id,
  type: "decision",
  position: { x: 0, y: 0 },
  data: { title, yes: "是", no: "否", condition },
});
const flowEdge = (id: string, source: string, sourceHandle: string | null, target: string, label?: string): Edge => ({
  id,
  source,
  sourceHandle,
  target,
  data: label ? { label } : undefined,
});
const note = (targetId: string, content: string): Annotation => ({
  id: `an-${targetId}-${content}`,
  targetType: "node",
  targetId,
  content,
  color: "yellow",
  createdAt: "2026-11-02T10:00:00.000Z",
  updatedAt: "2026-11-02T10:00:00.000Z",
});

const nodes = [
  screenNode("a", "登录", [
    { id: "phone", kind: "input", name: "phone", validation: "phone", label: "手机号" },
    { id: "go", kind: "button", tone: "primary", hotspot: true, label: "登录" },
    { id: "tip", kind: "text", label: "欢迎" },
  ]),
  decisionNode("d", "手机号已注册？", { variable: "phone", op: "notEmpty" }),
  screenNode("b", "工作台", []),
];
const edges = [
  flowEdge("e1", "a", "go", "d", "点击「登录」"),
  flowEdge("e2", "d", "yes", "b"),
  flowEdge("e3", "d", "no", "a"),
];

test("评审报告：概览、界面清单、连线、条件、批注、体检各章节齐全", () => {
  const report = buildReportHtml(nodes, edges, [note("a", "手机号要带格式提示")], { title: "电商主流程", generatedAt: 0 });
  assert.ok(report.html.includes("电商主流程"));
  assert.equal(report.screens, 2);
  assert.equal(report.links, 3);
  // 界面清单：元素数 / 热点数 / 变量名
  assert.ok(report.html.includes("输入变量"));
  assert.ok(report.html.includes("phone"));
  // 连线表：是/否分支 chip + 触发文案
  assert.ok(report.html.includes("r-branch"));
  assert.ok(report.html.includes("点击「登录」"));
  // 条件表：规范化后的条件
  assert.ok(report.html.includes("phone notEmpty"));
  // 批注：定位到界面标题 + 内容
  assert.ok(report.html.includes("手机号要带格式提示"));
  assert.ok(report.html.includes("「登录」"));
  // 体检：工作台死路 + 登录只有出口没有入口? 登录有入 e3 → 非孤立；死路 = 无出口? a 有出口 → 正常
  assert.ok(report.html.includes("流程体检"));
  assert.ok(report.issues >= 1); // 工作台无出口 → deadEnd
  assert.ok(report.html.includes("死路界面"));
});

test("评审报告：HTML 转义 —— 恶意/尖括号内容不会变成标签", () => {
  const evil = screenNode("z", '<script>alert(1)</script>', []);
  const report = buildReportHtml([evil], [], [], { title: '报"告"' });
  assert.ok(!report.html.includes("<script>alert"));
  assert.ok(report.html.includes("&lt;script&gt;"));
  assert.ok(report.html.includes("报&quot;告&quot;"));
});

test("评审报告：空画布给出空态而不是报错", () => {
  const report = buildReportHtml([], [], []);
  assert.ok(report.html.includes("画布上还没有界面节点"));
  assert.ok(report.html.includes("还没有连线"));
  assert.ok(report.html.includes("画布上没有批注"));
  assert.equal(report.issues, 0);
});
