import assert from "node:assert/strict";
import { test } from "node:test";
import { alignBoxes, applyAlignAction, distributeBoxes, type AlignBox } from "../src/flow/alignDistribute.ts";

const box = (id: string, x: number, y: number, w = 100, h = 60): AlignBox => ({ id, x, y, w, h });

test("对齐：左对齐取最小 x，y 不变；已贴边的对象不产出补丁", () => {
  const boxes = [box("a", 40, 0), box("b", 120, 50), box("c", 200, 80)];
  const patches = alignBoxes(boxes, "left");
  // a 已在 minX=40，不产出补丁（避免空操作撤销记录）
  assert.deepEqual(patches, [
    { id: "b", x: 40, y: 50 },
    { id: "c", x: 40, y: 80 },
  ]);
});

test("对齐：右对齐按各自宽度补偿", () => {
  const boxes = [box("a", 0, 0, 100), box("b", 50, 0, 150)];
  const patches = alignBoxes(boxes, "right");
  // maxX = 200；b 已贴边不动
  assert.deepEqual(patches, [{ id: "a", x: 100, y: 0 }]);
});

test("对齐：水平居中取包围盒中心", () => {
  const boxes = [box("a", 0, 0, 100), box("b", 300, 0, 100)];
  const patches = alignBoxes(boxes, "hcenter");
  // 包围盒 [0,400] 中心 200
  assert.deepEqual(patches, [
    { id: "a", x: 150, y: 0 },
    { id: "b", x: 150, y: 0 },
  ]);
});

test("对齐：垂直方向对称成立", () => {
  const boxes = [box("a", 0, 0, 50, 40), box("b", 0, 200, 50, 60)];
  const top = alignBoxes(boxes, "top");
  const bottom = alignBoxes(boxes, "bottom");
  const vcenter = alignBoxes(boxes, "vcenter");
  assert.deepEqual(top, [{ id: "b", y: 0, x: 0 }]);
  assert.deepEqual(bottom, [{ id: "a", y: 260 - 40, x: 0 }]);
  // 中心 = (0+260)/2 = 130；a → 110, b → 100
  assert.deepEqual(vcenter, [
    { id: "a", x: 0, y: 110 },
    { id: "b", x: 0, y: 100 },
  ]);
});

test("对齐：单对象返回空（无意义）", () => {
  assert.deepEqual(alignBoxes([box("a", 0, 0)], "left"), []);
});

test("分布：2 个对象禁用", () => {
  assert.deepEqual(distributeBoxes([box("a", 0, 0), box("b", 300, 0)], "hdist"), []);
  assert.deepEqual(distributeBoxes([box("a", 0, 0), box("b", 300, 0)], "vdist"), []);
});

test("分布：3 个水平等距——等间隙（非等中心），首尾不动", () => {
  // a[0..100] c[250..310] b[500..600]：当前间隙 150/190 不等
  const boxes = [box("a", 0, 0), box("b", 500, 0), box("c", 250, 0, 60)];
  const patches = distributeBoxes(boxes, "hdist");
  // 总宽 260，跨度 600，gap=(600-260)/2=170
  // a 不动；c → 100+170=270；b 不动
  assert.deepEqual(patches, [{ id: "c", x: 270, y: 0 }]);
});

test("分布：不等宽对象按等间隙（非等中心）排列", () => {
  const boxes = [box("a", 0, 0, 200), box("m", 220, 0, 40), box("b", 400, 0, 100)];
  const patches = distributeBoxes(boxes, "hdist");
  // 总宽 340，跨度 500，gap = 80；m → 200+80=280；b 不动
  assert.deepEqual(patches, [{ id: "m", x: 280, y: 0 }]);
});

test("分布：垂直分布独立于水平坐标", () => {
  const boxes = [box("a", 10, 0, 50, 50), box("m", 90, 160, 50, 30), box("b", 200, 400, 50, 50)];
  const patches = distributeBoxes(boxes, "vdist");
  // 高度和 130，跨度 450，gap = (450-130)/2 = 160；m.y → 50+160=210；a/b 不动
  assert.deepEqual(patches, [{ id: "m", x: 90, y: 210 }]);
});

test("分布：已等距时返回空（不产生撤销记录）", () => {
  const boxes = [box("a", 0, 0), box("m", 150, 0, 50), box("b", 250, 0)];
  // 总宽 250，跨度 350，gap=50：a[0..100] m[150..200] b[250..350] 已等距
  assert.deepEqual(distributeBoxes(boxes, "hdist"), []);
});

test("applyAlignAction 分发：分布与对齐同一入口", () => {
  const boxes = [box("a", 0, 0), box("b", 0, 200)];
  assert.deepEqual(applyAlignAction(boxes, "hdist"), []);
  // 右对齐：maxX=400，a → 400-100=300
  const patches = applyAlignAction([box("a", 0, 0), box("b", 300, 0)], "right");
  assert.deepEqual(patches, [{ id: "a", x: 300, y: 0 }]);
});
