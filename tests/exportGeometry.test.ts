import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import { getExportBounds, prepareNodesForExport, resolveNodeSize } from "../src/flow/exportGeometry.ts";

function node(id: string, type: string, x: number, y: number, width?: number, height?: number): Node {
  return {
    id,
    type,
    position: { x, y },
    data: {},
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  };
}

test("优先使用测量尺寸，缺失时按节点类型使用保守尺寸", () => {
  assert.deepEqual(resolveNodeSize(node("screen", "screen", 0, 0, 320, 640)), { width: 320, height: 640 });
  assert.deepEqual(resolveNodeSize(node("unknown", "custom", 0, 0)), { width: 220, height: 120 });
  assert.ok(resolveNodeSize(node("decision", "decision", 0, 0)).width >= 190);
});

test("画布包围盒覆盖全部节点并保留外扩空间", () => {
  const bounds = getExportBounds(
    [node("a", "screen", 100, 200, 320, 640), node("b", "note", 700, 50, 250, 150)],
    40,
  );
  assert.deepEqual(bounds, { x: 60, y: 10, width: 930, height: 870 });
});

test("空画布返回零尺寸，不产生 Infinity", () => {
  assert.deepEqual(getExportBounds([]), { x: 0, y: 0, width: 0, height: 0 });
});

test("导出节点副本补齐尺寸且不修改原节点", () => {
  const original = node("a", "screen", 0, 0);
  const [prepared] = prepareNodesForExport([original]);

  assert.equal(prepared.width, 320);
  assert.equal(prepared.height, 650);
  assert.equal(original.width, undefined);
  assert.equal(original.height, undefined);
  assert.notEqual(prepared, original);
});
