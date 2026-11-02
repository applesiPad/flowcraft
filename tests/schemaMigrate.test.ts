import assert from "node:assert/strict";
import { test } from "node:test";
import { CURRENT_SCHEMA_VERSION, parseFlowFile, summarizeImport } from "../src/flow/schemaMigrate.ts";

const v3Flow = {
  version: CURRENT_SCHEMA_VERSION,
  nodes: [
    { id: "a", type: "screen", position: { x: 0, y: 0 }, data: { title: "登录", elements: [{ id: "go", kind: "button", tone: "primary", label: "登录" }] } },
    { id: "b", type: "screen", position: { x: 400, y: 0 }, data: { title: "成功", elements: [] } },
  ],
  edges: [{ id: "e1", source: "a", sourceHandle: "go", target: "b", targetHandle: "in", type: "flow", data: { label: "点击「登录」" } }],
  annotations: [],
};

test("导入：合法的当前版本文件原样通过，无提示", () => {
  const result = parseFlowFile(JSON.stringify(v3Flow));
  assert.equal(result.ok, true);
  assert.equal(result.nodes.length, 2);
  assert.equal(result.edges.length, 1);
  assert.equal(result.declaredVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(result.issues.length, 0);
  assert.equal(result.migrations.length, 0);
});

test("导入：不是 JSON / 顶层不是对象 / 缺 nodes，都给具体错误", () => {
  const bad = parseFlowFile("{oops");
  assert.equal(bad.ok, false);
  assert.ok(bad.issues[0].message.includes("JSON"));

  const arr = parseFlowFile("[1,2,3]");
  assert.equal(arr.ok, false);
  assert.ok(arr.issues.some((i) => i.message.includes("顶层")));

  const noNodes = parseFlowFile(JSON.stringify({ version: 3, edges: [] }));
  assert.equal(noNodes.ok, false);
  assert.ok(noNodes.issues.some((i) => i.message.includes("nodes")));
});

test("导入：比当前应用更新的版本明确拒绝", () => {
  const result = parseFlowFile(JSON.stringify({ ...v3Flow, version: CURRENT_SCHEMA_VERSION + 9 }));
  assert.equal(result.ok, false);
  assert.ok(result.issues[0].message.includes("先升级"));
});

test("导入：v1 旧档迁移 —— 补齐批注、migrations 有记录", () => {
  const v1 = { nodes: v3Flow.nodes, edges: v3Flow.edges };
  const result = parseFlowFile(JSON.stringify(v1));
  assert.equal(result.ok, true);
  assert.equal(result.declaredVersion, null);
  assert.deepEqual(result.annotations, []);
  assert.ok(result.migrations.some((m) => m.includes("v1") && m.includes("v2")));
  assert.equal(result.issues.length, 0);
});

test("导入：v2 文件 —— 条件/校验/变量名规范化并逐条告警", () => {
  const v2 = {
    version: 2,
    nodes: [
      {
        id: "a",
        type: "screen",
        position: { x: 0, y: 0 },
        data: { title: "登录", elements: [
          { id: "phone", kind: "input", name: "  phone  ", validation: "email", label: "手机号" },
        ] },
      },
      { id: "d", type: "decision", position: { x: 0, y: 0 }, data: { title: "已登录？", condition: { variable: "  ", op: "==" } } },
      { id: "b", type: "screen", position: { x: 0, y: 0 }, data: { title: "成功", elements: [] } },
    ],
    edges: [],
    annotations: [],
  };
  const result = parseFlowFile(JSON.stringify(v2));
  assert.equal(result.ok, true);
  assert.ok(result.migrations.some((m) => m.includes("v2 → v3")));
  const screen = result.nodes[0].data as { elements: { name?: string; validation?: string }[] };
  assert.equal(screen.elements[0].name, "phone");
  assert.equal(screen.elements[0].validation, undefined);
  const decision = result.nodes[1].data as { condition: unknown };
  assert.equal(decision.condition, null);
  // 三条告警：变量名 trim、非法校验、非法条件
  assert.equal(result.issues.filter((i) => i.level === "warning").length, 3);
});

test("导入：重复 id / 缺 id 的节点逐条报 error，连线端点缺失被丢弃", () => {
  const dup = parseFlowFile(JSON.stringify({
    version: 3,
    nodes: [
      { id: "a", type: "screen", position: { x: 0, y: 0 }, data: { title: "A", elements: [] } },
      { id: "a", type: "screen", position: { x: 9, y: 9 }, data: { title: "A2", elements: [] } },
      { id: "b", type: "screen", position: { x: 0, y: 0 }, data: { title: "B", elements: [] } },
    ],
    edges: [
      { id: "ok", source: "a", target: "b" },
      { id: "ghost", source: "a", target: "missing" },
    ],
    annotations: [],
  }));
  assert.equal(dup.ok, true);
  assert.equal(dup.nodes.length, 2);
  assert.equal(dup.nodes[0].data && (dup.nodes[0].data as { title: string }).title, "A");
  assert.equal(dup.edges.length, 1);
  const errors = dup.issues.filter((i) => i.level === "error");
  assert.equal(errors.length, 1);
  assert.ok(errors[0].message.includes("重复"));
  assert.ok(dup.issues.some((i) => i.message.includes("missing")));
});

test("导入：指向不存在目标的批注被忽略并提示", () => {
  const result = parseFlowFile(JSON.stringify({
    ...v3Flow,
    annotations: [
      { id: "an1", targetType: "node", targetId: "a", content: "好", color: "yellow", createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" },
      { id: "an2", targetType: "node", targetId: "ghost", content: "悬空", color: "blue", createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" },
    ],
  }));
  assert.equal(result.ok, true);
  assert.equal(result.annotations.length, 1);
  assert.equal(result.annotations[0].targetId, "a");
  assert.ok(result.issues.some((i) => i.message.includes("已不存在")));
});

test("导入：全坏节点 → ok=false，summary 给出首条错误", () => {
  const result = parseFlowFile(JSON.stringify({ version: 3, nodes: [{ nope: true }], edges: [] }));
  assert.equal(result.ok, false);
  assert.ok(summarizeImport(result).startsWith("导入失败"));
  assert.ok(summarizeImport(parseFlowFile(JSON.stringify(v3Flow))).includes("2 个节点"));
});
