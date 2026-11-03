import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { computeDeadHints, HEALTH_KIND_LABEL, scanFlowHealth } from "../src/flow/flowHealth.ts";

const screenNode = (id: string, title: string, elements: Record<string, unknown>[] = []): Node => ({
  id,
  type: "screen",
  position: { x: 0, y: 0 },
  data: { title, elements },
});
const decisionNode = (id: string, title: string): Node => ({ id, type: "decision", position: { x: 0, y: 0 }, data: { title, yes: "是", no: "否" } });
const flowEdge = (id: string, source: string, sourceHandle: string | null, target: string): Edge => ({ id, source, sourceHandle, target });

test("健康检查：正常流程无问题", () => {
  const nodes = [
    screenNode("a", "登录", [{ id: "go", kind: "button", tone: "primary", label: "登录" }]),
    screenNode("b", "成功", []),
  ];
  const edges = [flowEdge("e1", "a", "go", "b")];
  const issues = scanFlowHealth(nodes, edges);
  // b 没有出口 → 死路提示（终点界面可忽略，但要在报告里）
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, "deadEnd");
  assert.equal(issues[0].title, "成功");
});

test("健康检查：孤立界面（无入无出）", () => {
  const nodes = [
    screenNode("a", "登录", [{ id: "go", kind: "button", tone: "primary", label: "登录" }]),
    screenNode("b", "工作台", []),
    screenNode("c", "草稿", []),
  ];
  const edges = [flowEdge("e1", "a", "go", "b")];
  const issues = scanFlowHealth(nodes, edges);
  const orphan = issues.find((i) => i.kind === "orphan");
  assert.ok(orphan);
  assert.equal(orphan.nodeId, "c");
  // b 有出口吗？没有 → deadEnd；c 孤立（不重复报 deadEnd）
  assert.equal(issues.filter((i) => i.kind === "deadEnd").length, 1);
  assert.equal(issues.filter((i) => i.kind === "deadEnd")[0].nodeId, "b");
});

test("健康检查：未接线主按钮（含未设热点的主按钮）", () => {
  const nodes = [
    screenNode("a", "登录", [
      { id: "go", kind: "button", tone: "primary", label: "登录" },
      { id: "guest", kind: "button", tone: "ghost", label: "游客浏览" },
      { id: "pay", kind: "button", tone: "primary", label: "去支付" },
    ]),
    screenNode("b", "支付", []),
  ];
  const edges = [
    flowEdge("e1", "a", "go", "b"),
    flowEdge("e2", "a", "guest", "b"),
  ];
  const issues = scanFlowHealth(nodes, edges);
  const unwired = issues.filter((i) => i.kind === "unwiredPrimary");
  assert.equal(unwired.length, 1);
  assert.equal(unwired[0].elId, "pay");
  assert.ok(unwired[0].detail.includes("去支付"));
  // ghost 按钮不参与
  assert.ok(!issues.some((i) => i.elId === "guest"));
});

test("健康检查：判断分支不全", () => {
  const nodes = [decisionNode("d", "已登录？"), screenNode("a", "界面", [])];
  const edges = [flowEdge("e1", "d", "yes", "a")];
  const issues = scanFlowHealth(nodes, edges);
  const incomplete = issues.filter((i) => i.kind === "decisionIncomplete");
  assert.equal(incomplete.length, 1);
  assert.ok(incomplete[0].detail.includes("否"));
  // 两个出口都接了 → 无问题
  const full = scanFlowHealth([decisionNode("d", "已登录？"), screenNode("a", "界面", []), screenNode("b", "登录", [])], [
    flowEdge("e1", "d", "yes", "a"),
    flowEdge("e2", "d", "no", "b"),
  ]);
  assert.ok(!full.some((i) => i.kind === "decisionIncomplete"));
});

test("健康检查：排序按类型分组（未接线主按钮 > 分支不全 > 死路 > 孤立）", () => {
  const nodes = [
    screenNode("a", "登录", [{ id: "pay", kind: "button", tone: "primary", label: "去支付" }]),
    screenNode("z", "孤立", []),
    decisionNode("d", "已登录？"),
  ];
  const issues = scanFlowHealth(nodes, []);
  // 完全断联的界面按「孤立」上报（不再重复报主按钮/死路）；判断节点分支不全单独报
  assert.deepEqual(issues.map((i) => i.kind), ["decisionIncomplete", "orphan", "orphan"]);
  assert.ok(issues.every((i) => i.kind !== "deadEnd"));
  assert.ok(HEALTH_KIND_LABEL.unwiredPrimary.length > 0);
});

test("健康检查：判断节点自环不算出口缺失", () => {
  const nodes = [decisionNode("d", "循环")];
  const edges = [flowEdge("e1", "d", "yes", "d"), flowEdge("e2", "d", "no", "d")];
  const issues = scanFlowHealth(nodes, edges);
  assert.equal(issues.length, 0);
});

const decisionWithCondition = (id: string, condition: unknown): Node => ({
  id,
  type: "decision",
  position: { x: 0, y: 0 },
  data: { title: "VIP？", yes: "是", no: "否", condition },
});

test("健康检查二期：条件变量没有输入框来源 → condVarUnknown", () => {
  const nodes = [
    screenNode("a", "登录", [{ id: "phone", kind: "input", name: "phone", label: "手机号" }]),
    decisionWithCondition("d", { variable: "vip", op: "==", value: "1" }),
    screenNode("b", "界面", []),
  ];
  const issues = scanFlowHealth(nodes, []);
  const mismatch = issues.filter((i) => i.kind === "condVarUnknown");
  assert.equal(mismatch.length, 1);
  assert.equal(mismatch[0].nodeId, "d");
  assert.ok(mismatch[0].detail.includes("vip"));
  // 变量名能对上 → 不报；条件变量带空格也能对上（normalizeCondition trim）
  const ok = scanFlowHealth(
    [
      screenNode("a", "登录", [{ id: "phone", kind: "input", name: "vip", label: "卡号" }]),
      decisionWithCondition("d", { variable: "vip", op: "notEmpty" }),
      screenNode("b", "界面", []),
    ],
    [],
  );
  assert.ok(!ok.some((i) => i.kind === "condVarUnknown"));
  // 没配置条件 / 条件不完整 → 不报（走默认「是」是既定语义）
  const noCond = scanFlowHealth([decisionWithCondition("d", null), screenNode("b", "界面", [])], []);
  assert.ok(!noCond.some((i) => i.kind === "condVarUnknown"));
  const badCond = scanFlowHealth([decisionWithCondition("d", { variable: "  ", op: "==" }), screenNode("b", "界面", [])], []);
  assert.ok(!badCond.some((i) => i.kind === "condVarUnknown"));
});

test("健康检查二期：空标题界面 → unnamedScreen", () => {
  const nodes = [screenNode("a", "登录", []), screenNode("b", "   ", [])];
  const issues = scanFlowHealth(nodes, []);
  const unnamed = issues.filter((i) => i.kind === "unnamedScreen");
  assert.equal(unnamed.length, 1);
  assert.equal(unnamed[0].nodeId, "b");
  // a 无入无出 → 孤立（命名正常不报）
  assert.equal(issues.filter((i) => i.kind === "orphan").length, 2);
});

/* ---------- computeDeadHints：画布级死路角标数据源 ---------- */

test("死路角标：主按钮未接线计数，ghost 按钮不计数", () => {
  const nodes = [
    screenNode("a", "登录", [
      { id: "go", kind: "button", tone: "primary", label: "登录" },
      { id: "guest", kind: "button", tone: "ghost", label: "游客浏览" },
      { id: "pay", kind: "button", tone: "primary", label: "去支付" },
    ]),
  ];
  // 只接了 go 和 ghost，pay 悬空
  const edges = [flowEdge("e1", "a", "go", "b"), flowEdge("e2", "a", "guest", "b")];
  const hints = computeDeadHints(nodes, edges);
  assert.equal(hints.get("a")?.unwiredPrimary, 1);
  assert.equal(hints.get("a")?.hasOut, true);
});

test("死路角标：无出口界面 hasOut=false，自环算出口", () => {
  const nodes = [
    screenNode("a", "排队页", []),
    screenNode("b", "自环", [{ id: "refresh", kind: "button", tone: "primary" }]),
  ];
  const hints = computeDeadHints(nodes, [flowEdge("e1", "b", "refresh", "b")]);
  assert.equal(hints.get("a")?.hasOut, false);
  assert.equal(hints.get("b")?.hasOut, true);
});

test("死路角标：判断/动作节点不出现在结果里", () => {
  const nodes = [decisionNode("d", "会员？")];
  const hints = computeDeadHints(nodes, []);
  assert.equal(hints.size, 0);
});
