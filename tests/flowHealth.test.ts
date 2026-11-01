import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { HEALTH_KIND_LABEL, scanFlowHealth } from "../src/flow/flowHealth.ts";

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
