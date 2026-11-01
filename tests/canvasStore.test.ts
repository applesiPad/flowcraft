import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edge, Node } from "@xyflow/react";
import {
  CANVAS_ACTIVE_KEY,
  CANVAS_LIST_KEY,
  ensureCanvases,
  newCanvasMeta,
  readActiveCanvasId,
  readCanvasData,
  readCanvasList,
  removeCanvasData,
  sanitizeCanvasName,
  uniqueCanvasName,
  writeActiveCanvasId,
  writeCanvasData,
  writeCanvasList,
} from "../src/flow/canvasStore.ts";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

const node = (id: string): Node => ({ id, type: "screen", position: { x: 0, y: 0 }, data: { title: id } });
const edge = (id: string): Edge => ({ id, source: "a", target: "b" });

test("ensureCanvases: 无列表且无 legacy 数据 → 登记一个空默认画布", () => {
  const s = memoryStorage();
  const { list, activeId } = ensureCanvases(s, null, () => "c1");
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "默认画布");
  assert.equal(activeId, "c1");
  assert.equal(readActiveCanvasId(s), "c1");
});

test("ensureCanvases: legacy 存档 → 原地登记为默认画布（数据零拷贝保留）", () => {
  const s = memoryStorage();
  const legacy = { nodes: [node("n1")], edges: [edge("e1")], annotations: [] };
  const { list, activeId } = ensureCanvases(s, legacy, () => "c1");
  assert.equal(list.length, 1);
  assert.equal(activeId, "c1");
  // legacy 数据仍由 flow.v1 承载（由调用方继续用），这里只断言不额外写 data key
  assert.equal(readCanvasData(s, "c1"), null);
});

test("ensureCanvases: 已有列表 → 校正非法 activeId 回第一个", () => {
  const s = memoryStorage();
  const list = [newCanvasMeta("A", "a", 1), newCanvasMeta("B", "b", 2)];
  writeCanvasList(s, list);
  writeActiveCanvasId(s, "missing");
  const { activeId } = ensureCanvases(s, null, () => "x");
  assert.equal(activeId, "a");
  writeActiveCanvasId(s, "b");
  assert.equal(ensureCanvases(s, null, () => "x").activeId, "b");
});

test("readCanvasList: 过滤非法条目与坏 JSON", () => {
  const s = memoryStorage({ [CANVAS_LIST_KEY]: "not json" });
  assert.deepEqual(readCanvasList(s), []);
  writeCanvasList(s, [newCanvasMeta("A", "a"), { bad: true } as never, null as never]);
  const list = readCanvasList(s);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "a");
});

test("writeCanvasData / readCanvasData: 往返一致，annotations 缺省为空数组", () => {
  const s = memoryStorage();
  writeCanvasData(s, "c1", { nodes: [node("n1"), node("n2")], edges: [edge("e1")], annotations: [] });
  const data = readCanvasData(s, "c1");
  assert.equal(data?.nodes.length, 2);
  assert.equal(data?.edges.length, 1);
  assert.deepEqual(data?.annotations, []);
  s.setItem("flowcraft.canvas.data.bad", "{oops");
  assert.equal(readCanvasData(s, "bad"), null);
  assert.equal(readCanvasData(s, "gone"), null);
});

test("removeCanvasData: 只清目标画布", () => {
  const s = memoryStorage();
  writeCanvasData(s, "a", { nodes: [], edges: [], annotations: [] });
  writeCanvasData(s, "b", { nodes: [], edges: [], annotations: [] });
  removeCanvasData(s, "a");
  assert.equal(readCanvasData(s, "a"), null);
  assert.notEqual(readCanvasData(s, "b"), null);
});

test("sanitizeCanvasName: 压缩空白并截断 40 字", () => {
  assert.equal(sanitizeCanvasName("  A   B  "), "A B");
  assert.equal(sanitizeCanvasName("长".repeat(50)).length, 40);
  assert.equal(sanitizeCanvasName("   "), "");
});

test("uniqueCanvasName: 重名追加序号", () => {
  const list = [newCanvasMeta("画布", "a"), newCanvasMeta("画布 2", "b")];
  assert.equal(uniqueCanvasName(list, "画布"), "画布 3");
  assert.equal(uniqueCanvasName(list, "新"), "新");
  assert.equal(uniqueCanvasName([], "画布 2"), "画布 2");
});

test("newCanvasMeta: 时间戳与字段", () => {
  const meta = newCanvasMeta("X", "id1", 42);
  assert.deepEqual(meta, { id: "id1", name: "X", createdAt: 42, updatedAt: 42 });
});

test("CANVAS_ACTIVE_KEY 空白视为无活动画布", () => {
  const s = memoryStorage({ [CANVAS_ACTIVE_KEY]: "   " });
  assert.equal(readActiveCanvasId(s), null);
});
