import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edge, Node } from "@xyflow/react";
import {
  MAX_SNAPSHOTS,
  addSnapshot,
  autoSnapshotName,
  diffFlows,
  readSnapshots,
  removeSnapshot,
  type FlowSnapshot,
} from "../src/flow/snapshotStore.ts";
import type { Annotation } from "../src/flow/annotations.ts";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const screenNode = (id: string, title: string, elements: Record<string, unknown>[] = []): Node => ({
  id,
  type: "screen",
  position: { x: 0, y: 0 },
  data: { title, elements },
});
const decisionNode = (id: string, title: string, condition: unknown = null): Node => ({
  id,
  type: "decision",
  position: { x: 0, y: 0 },
  data: { title, condition },
});
const flowEdge = (id: string, source: string, sourceHandle: string, target: string, label: string): Edge => ({
  id,
  source,
  sourceHandle,
  target,
  data: { label },
});

const baseFlow = () => ({
  nodes: [
    screenNode("a", "登录", [{ id: "phone", kind: "input", label: "手机号" }, { id: "go", kind: "button", tone: "primary", label: "登录" }]),
    screenNode("b", "工作台"),
    decisionNode("d", "已登录？"),
  ],
  edges: [flowEdge("e1", "a", "go", "b", "登录"), flowEdge("e2", "d", "yes", "b", "是")],
  annotations: [] as Annotation[],
});

const snap = (id: string, name: string, createdAt: number, auto = false): FlowSnapshot => ({
  id,
  name,
  createdAt,
  auto,
  data: baseFlow(),
});

test("readSnapshots: 坏 JSON / 非数组 / 非法条目过滤", () => {
  const s = memoryStorage();
  assert.deepEqual(readSnapshots(s, "c1"), []);
  s.setItem("flowcraft.snapshots.c1", "{oops");
  assert.deepEqual(readSnapshots(s, "c1"), []);
  s.setItem("flowcraft.snapshots.c1", JSON.stringify([snap("a", "A", 1), { junk: true }, null]));
  const list = readSnapshots(s, "c1");
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "a");
});

test("addSnapshot: 新的在前并裁剪到上限", () => {
  const s = memoryStorage();
  for (let i = 0; i < MAX_SNAPSHOTS + 3; i++) {
    addSnapshot(s, "c1", snap(`s${i}`, `快照 ${i}`, i));
  }
  const list = readSnapshots(s, "c1");
  assert.equal(list.length, MAX_SNAPSHOTS);
  assert.equal(list[0].id, `s${MAX_SNAPSHOTS + 2}`);
  assert.equal(list[MAX_SNAPSHOTS - 1].id, `s3`);
  // 不同画布互不影响
  addSnapshot(s, "c2", snap("x", "X", 9));
  assert.equal(readSnapshots(s, "c1").length, MAX_SNAPSHOTS);
  assert.equal(readSnapshots(s, "c2").length, 1);
});

test("removeSnapshot: 按 id 删除", () => {
  const s = memoryStorage();
  addSnapshot(s, "c1", snap("a", "A", 1));
  addSnapshot(s, "c1", snap("b", "B", 2));
  const list = removeSnapshot(s, "c1", "a");
  assert.deepEqual(list.map((x) => x.id), ["b"]);
  assert.deepEqual(removeSnapshot(s, "c1", "gone").map((x) => x.id), ["b"]);
});

test("autoSnapshotName: 输出 HH:MM:SS 格式", () => {
  const name = autoSnapshotName(new Date(2026, 10, 2, 3, 5, 9).getTime());
  assert.equal(name, "自动 03:05:09");
});

test("diffFlows: 完全一致 → identical", () => {
  const d = diffFlows(baseFlow(), baseFlow());
  assert.equal(d.identical, true);
  assert.equal(d.screensAdded.length, 0);
  assert.equal(d.edgesRemoved.length, 0);
});

test("diffFlows: 新增 / 删除界面", () => {
  const added = baseFlow();
  added.nodes.push(screenNode("c", "支付成功"));
  const d1 = diffFlows(baseFlow(), added);
  assert.deepEqual(d1.screensAdded, ["支付成功"]);
  assert.equal(d1.identical, false);

  const removed = baseFlow();
  removed.nodes = removed.nodes.filter((n) => n.id !== "b");
  removed.edges = removed.edges.filter((e) => e.id !== "e1");
  const d2 = diffFlows(baseFlow(), removed);
  assert.deepEqual(d2.screensRemoved, ["工作台"]);
  assert.deepEqual(d2.edgesRemoved, ["「登录」登录·go → 工作台"]);
});

test("diffFlows: 界面改名 / 元素增改 / 条件修改", () => {
  const target = baseFlow();
  const login = target.nodes.find((n) => n.id === "a")!;
  login.data = {
    ...login.data,
    title: "账号登录",
    elements: [
      { id: "phone", kind: "input", label: "手机号", name: "phone", validation: "phone" },
      { id: "go", kind: "button", tone: "primary", label: "立即登录" },
      { id: "tip", kind: "text", label: "提示" },
    ],
  };
  const decision = target.nodes.find((n) => n.id === "d")!;
  decision.data = { ...decision.data, condition: { variable: "phone", op: "notEmpty" } };

  const d = diffFlows(baseFlow(), target);
  assert.deepEqual(d.screensRenamed, [{ from: "登录", to: "账号登录" }]);
  const loginChanges = d.contentChanged.find((c) => c.title === "账号登录");
  assert.ok(loginChanges);
  assert.ok(loginChanges.changes.some((c) => c.includes("新增元素 1")));
  // phone（补变量名+校验）与 go（改文案）都算修改
  assert.ok(loginChanges.changes.some((c) => c.includes("修改元素 2")));
  const decisionChanges = d.contentChanged.find((c) => c.title === "已登录？");
  assert.ok(decisionChanges);
  assert.deepEqual(decisionChanges.changes, ["判断文案或条件已修改"]);
});

test("diffFlows: 批注变化计数（新增/删除/修改都算）", () => {
  const target = baseFlow();
  target.annotations = [{ id: "an1", targetType: "node", targetId: "a", content: "改文案", color: "yellow", createdAt: 1, updatedAt: 1 } as Annotation];
  assert.equal(diffFlows(baseFlow(), target).annotationsChanged, 1);

  const both = baseFlow();
  both.annotations = [{ id: "an1", targetType: "node", targetId: "a", content: "旧", color: "yellow", createdAt: 1, updatedAt: 1 } as Annotation];
  target.annotations = [{ id: "an1", targetType: "node", targetId: "a", content: "新", color: "yellow", createdAt: 1, updatedAt: 1 } as Annotation];
  assert.equal(diffFlows(both, target).annotationsChanged, 1);

  const removedAnn = baseFlow();
  removedAnn.annotations = [{ id: "an1", targetType: "node", targetId: "a", content: "旧", color: "yellow", createdAt: 1, updatedAt: 1 } as Annotation];
  assert.equal(diffFlows(removedAnn, baseFlow()).annotationsChanged, 1);
});

test("diffFlows: 新增连线可读描述", () => {
  const target = baseFlow();
  target.edges.push(flowEdge("e3", "d", "no", "a", "否，返回"));
  const d = diffFlows(baseFlow(), target);
  assert.deepEqual(d.edgesAdded, ["「否，返回」已登录？·no → 登录"]);
});
