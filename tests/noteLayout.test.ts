import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import {
  anchorNotePosition,
  cascadeDeleteNode,
  layoutAnchoredNotes,
  migrateLegacyNoteAnchors,
  noteAnchorFor,
} from "../src/flow/noteLayout.ts";

const target = { x: 100, y: 200, width: 320, height: 540 };

function node(id: string, type: string, x: number, y: number, data: Record<string, unknown> = {}): Node {
  return {
    id,
    type,
    position: { x, y },
    data,
    ...(type === "screen" ? { style: { width: 320 }, measured: { width: 320, height: 346 } } : {}),
  };
}

test("关联备注默认贴在目标界面右侧，并保留固定间距", () => {
  const position = anchorNotePosition(target, "right", 24);
  assert.deepEqual(position, { x: 444, y: 220 });
});

test("关联备注按目标底部定位时保持左侧对齐", () => {
  const position = anchorNotePosition(target, "bottom", 32);
  assert.deepEqual(position, { x: 100, y: 772 });
});

test("目标移动后重新计算备注位置，而不是沿用旧绝对坐标", () => {
  const first = anchorNotePosition(target, "right", 24);
  const moved = anchorNotePosition({ ...target, x: 620, y: 80 }, "right", 24);
  assert.notDeepEqual(moved, first);
  assert.deepEqual(moved, { x: 964, y: 100 });
});

test("无效关联目标返回 null，避免生成 NaN 坐标", () => {
  assert.equal(anchorNotePosition(null, "right", 24), null);
  assert.equal(anchorNotePosition({ x: 0, y: 0, width: 0, height: 0 }, "right", 24), null);
});

test("可从备注数据读取关联节点与放置方向", () => {
  assert.deepEqual(noteAnchorFor({ anchor: { nodeId: "n-pay", side: "bottom", gap: 28 } }), {
    nodeId: "n-pay",
    side: "bottom",
    gap: 28,
  });
  assert.deepEqual(noteAnchorFor({}), { nodeId: null, side: "right", gap: 24 });
});

test("旧存档 note-1 自动关联到支付界面，避免刷新后继续漂浮", () => {
  const pay = node("n-pay", "screen", 2180, 120, { title: "确认支付", elements: [] });
  const note = node("note-1", "note", 2200, 430, { title: "交互说明", body: "旧备注" });
  const migrated = migrateLegacyNoteAnchors([pay, note]);
  assert.deepEqual((migrated[1].data as Record<string, unknown>).anchor, {
    nodeId: "n-pay",
    side: "bottom",
    gap: 28,
  });
  assert.equal(migrated[1].position, note.position);
});

test("迁移不会覆盖用户已设置或主动解除的备注关联", () => {
  const pay = node("n-pay", "screen", 2180, 120, { title: "确认支付", elements: [] });
  const linked = node("note-1", "note", 0, 0, { anchor: { nodeId: "other", side: "right" } });
  assert.equal(migrateLegacyNoteAnchors([pay, linked])[1], linked);
});

test("渲染布局按目标当前几何重算备注，并让关联备注不再自由拖动", () => {
  const pay = node("n-pay", "screen", 2180, 120, { title: "确认支付", elements: [] });
  const note = node("note-1", "note", 0, 0, {
    title: "交互说明",
    anchor: { nodeId: "n-pay", side: "bottom", gap: 28 },
  });
  const laidOut = layoutAnchoredNotes([pay, note]);
  assert.deepEqual(laidOut[1].position, { x: 2180, y: 494 });
  assert.equal(laidOut[1].draggable, false);
});

test("删除界面时同步删除锚定在它上面的备注，避免产生无主卡片", () => {
  const pay = node("n-pay", "screen", 0, 0, { title: "确认支付", elements: [] });
  const note = node("note-1", "note", 0, 0, { anchor: { nodeId: "n-pay" } });
  const free = node("other", "note", 0, 0, {});
  assert.deepEqual(cascadeDeleteNode([pay, note, free], "n-pay").map((item) => item.id), ["other"]);
});