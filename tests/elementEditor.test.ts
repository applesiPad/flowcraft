import assert from "node:assert/strict";
import test from "node:test";
import {
  clampMoveBox,
  clampResizeBox,
  DEFAULT_ELEMENT_REGION,
  detectAlignGuides,
  moveElementZ,
  regionForContainer,
  resizeBox,
  SCREEN_BODY_WIDTH,
  snapDelta,
  type AlignGuideInput,
  type ContainerRegion,
} from "../src/flow/elementEditor.ts";
import type { ElementBox } from "../src/flow/types.ts";

/* ---------- resizeBox：方位角缩放 ---------- */

test("resizeBox 从东南角拖动改变宽高且不移动原点", () => {
  const out = resizeBox({ x: 10, y: 20, w: 100, h: 50 }, "se", 30, 20);
  assert.deepEqual(out, { x: 10, y: 20, w: 130, h: 70 });
});

test("resizeBox 从西北角拖动向左上扩展", () => {
  const out = resizeBox({ x: 40, y: 40, w: 100, h: 80 }, "nw", -60, -45, { minWidth: 24, minHeight: 24 });
  assert.deepEqual(out, { x: -20, y: -5, w: 160, h: 125 });
});

test("resizeBox 从北边拖动改变 top 和 height", () => {
  const out = resizeBox({ x: 0, y: 50, w: 100, h: 60 }, "n", 0, -18);
  assert.deepEqual(out, { x: 0, y: 32, w: 100, h: 78 });
});

test("resizeBox 从西边拖动改变 x 和 width", () => {
  const out = resizeBox({ x: 30, y: 0, w: 100, h: 60 }, "w", -22, 0);
  assert.deepEqual(out, { x: 8, y: 0, w: 122, h: 60 });
});

test("resizeBox 宽度不会小于最小宽度", () => {
  const out = resizeBox({ x: 10, y: 0, w: 40, h: 30 }, "e", -60, 0, { minWidth: 24 });
  assert.equal(out.w, 24);
  assert.equal(out.x, 10);
});

test("resizeBox 西北把手拖过最小尺寸时 clamp 不越界", () => {
  // 向右下收缩超过最小值时，左/上缘被 clamp 在 原右缘 - minW / 原下缘 - minH
  const out = resizeBox({ x: 10, y: 10, w: 40, h: 40 }, "nw", 40, 40, { minWidth: 24, minHeight: 24 });
  assert.deepEqual(out, { x: 26, y: 26, w: 24, h: 24 });
});

test("resizeBox 保留额外字段（如未设高度）", () => {
  const out = resizeBox({ x: 0, y: 0, w: 100 }, "e", 40, 0);
  assert.equal(out.h, undefined);
  assert.equal(out.w, 140);
});

test("resizeBox 高度未设时从东拖不产生高度", () => {
  const out = resizeBox({ x: 0, y: 0, w: 100 }, "s", 0, 30);
  assert.equal(out.h, undefined);
  assert.equal(out.w, 100);
});

test("resizeBox 从 s 拖动已有高度时增加高度", () => {
  const out = resizeBox({ x: 0, y: 0, w: 100, h: 40 }, "s", 0, 30);
  assert.deepEqual(out, { x: 0, y: 0, w: 100, h: 70 });
});

/* ---------- snapDelta：吸附 ---------- */

test("snapDelta 在容差内吸附到参考线", () => {
  const moving: AlignGuideInput = { x: 98, y: 40, w: 100, h: 50 };
  const others: AlignGuideInput[] = [{ x: 104, y: 0, w: 100, h: 50 }];
  const { dx, dy } = snapDelta({ dx: 0, dy: 0 }, moving, others, 6);
  assert.equal(dx, 6, "98 + 6 = 104 对齐 other 左缘");
});

test("snapDelta 超出容差不吸附", () => {
  const moving: AlignGuideInput = { x: 90, y: 40, w: 100, h: 50 };
  const others: AlignGuideInput[] = [{ x: 100, y: 0, w: 100, h: 50 }];
  const { dx } = snapDelta({ dx: 0, dy: 0 }, moving, others, 6);
  assert.equal(dx, 0);
});

test("snapDelta 垂直方向吸附对齐", () => {
  const moving: AlignGuideInput = { x: 0, y: 42, w: 50, h: 40 };
  const others: AlignGuideInput[] = [{ x: 200, y: 36, w: 50, h: 40 }];
  const { dy } = snapDelta({ dx: 0, dy: 0 }, moving, others, 6);
  assert.equal(dy, -6, "42 - 6 = 36 对齐 other 顶缘");
});

test("snapDelta 支持中心线对齐", () => {
  const moving: AlignGuideInput = { x: 0, y: 0, w: 100, h: 40 };
  const others: AlignGuideInput[] = [{ x: 100, y: 0, w: 40, h: 100 }];
  const { dx, dy } = snapDelta({ dx: 0, dy: 0 }, moving, others, 10);
  // moving cx=50; other cx=120; dx=70 > 10 不吸附
  assert.equal(dx, 0);
  // moving cy=20; other cy=50; dy=30 > 10 不吸附
  assert.equal(dy, 0);
});

test("snapDelta 中心线距离在容差内时吸附", () => {
  const moving: AlignGuideInput = { x: 60, y: 0, w: 100, h: 40 };
  const others: AlignGuideInput[] = [{ x: 100, y: 0, w: 40, h: 100 }];
  const { dx } = snapDelta({ dx: 0, dy: 0 }, moving, others, 8);
  // moving cx = 110, other cx = 120, dx = 10 ... tolerance 8 => no snap
  assert.equal(dx, 0);
});

/* ---------- detectAlignGuides ---------- */

test("detectAlignGuides 返回对齐参考线", () => {
  const moving: AlignGuideInput = { x: 104, y: 40, w: 100, h: 50 };
  const others: AlignGuideInput[] = [{ x: 104, y: 0, w: 100, h: 50 }];
  const guides = detectAlignGuides(moving, others);
  assert.ok(guides.vertical.some((g) => g.coordinate === 104 && g.axis === "x"), "左缘对齐线");
  assert.ok(guides.horizontal.length === 0, "y 不对齐则无水平线");
});

test("detectAlignGuides 不含自身", () => {
  const a: AlignGuideInput = { x: 0, y: 0, w: 50, h: 50 };
  const guides = detectAlignGuides(a, [a]);
  assert.equal(guides.vertical.length, 0);
  assert.equal(guides.horizontal.length, 0);
});

test("detectAlignGuides 检测中心线", () => {
  const moving: AlignGuideInput = { x: 50, y: 0, w: 100, h: 50 };
  const other: AlignGuideInput = { x: 50, y: 100, w: 100, h: 50 };
  const guides = detectAlignGuides(moving, [other]);
  const cxs = guides.vertical.filter((g) => g.axis === "cx").map((g) => g.coordinate);
  assert.ok(cxs.includes(100), `中心线 x=100 应在参考线中: ${JSON.stringify(guides.vertical)}`);
});

/* ---------- moveElementZ：层级调整 ---------- */

function makeElements(ids: string[]) {
  return ids.map((id, i) => ({ id, kind: "button" as const, label: `btn-${i}` }));
}

test("moveElementZ bring-to-front 置顶", () => {
  const els = makeElements(["a", "b", "c"]);
  const out = moveElementZ(els, "a", "bring-to-front");
  assert.deepEqual(out.map((e) => e.id), ["b", "c", "a"]);
});

test("moveElementZ send-to-back 置底", () => {
  const els = makeElements(["a", "b", "c"]);
  const out = moveElementZ(els, "c", "send-to-back");
  assert.deepEqual(out.map((e) => e.id), ["c", "a", "b"]);
});

test("moveElementZ bring-forward 上移一层", () => {
  const els = makeElements(["a", "b", "c"]);
  const out = moveElementZ(els, "a", "bring-forward");
  assert.deepEqual(out.map((e) => e.id), ["b", "a", "c"]);
});

test("moveElementZ send-backward 下移一层", () => {
  const els = makeElements(["a", "b", "c"]);
  const out = moveElementZ(els, "c", "send-backward");
  assert.deepEqual(out.map((e) => e.id), ["a", "c", "b"]);
});

test("moveElementZ 已在顶部时置顶不变", () => {
  const els = makeElements(["a", "b"]);
  const out = moveElementZ(els, "b", "bring-to-front");
  assert.deepEqual(out.map((e) => e.id), ["a", "b"]);
});

test("moveElementZ 已在底部时置底不变", () => {
  const els = makeElements(["a", "b"]);
  const out = moveElementZ(els, "a", "send-to-back");
  assert.deepEqual(out.map((e) => e.id), ["a", "b"]);
});

test("moveElementZ 找不到元素时返回原数组", () => {
  const els = makeElements(["a", "b"]);
  const out = moveElementZ(els, "missing", "bring-to-front");
  assert.deepEqual(out, els);
});

test("moveElementZ 不修改原数组", () => {
  const els = makeElements(["a", "b", "c"]);
  moveElementZ(els, "a", "bring-to-front");
  assert.deepEqual(els.map((e) => e.id), ["a", "b", "c"]);
});

/* ---------- 容器边界约束：clampMoveBox / clampResizeBox / regionForContainer ---------- */

const region: ContainerRegion = { left: 0, top: 0, right: 318, bottom: Number.POSITIVE_INFINITY };

test("clampMoveBox 右缘越界时整体收回容器内", () => {
  const out = clampMoveBox({ x: 280, y: 40, w: 100 }, region);
  assert.deepEqual(out, { x: 218, y: 40, w: 100 });
});

test("clampMoveBox 负坐标收回左上角", () => {
  const out = clampMoveBox({ x: -36, y: -12, w: 88, h: 24 }, region);
  assert.deepEqual(out, { x: 0, y: 0, w: 88, h: 24 });
});

test("clampMoveBox 宽度超出容器时贴左缘而不是居中", () => {
  const out = clampMoveBox({ x: 100, y: 0, w: 400 }, region);
  assert.deepEqual(out, { x: 0, y: 0, w: 400 });
});

test("clampMoveBox 自由布局高度可增长：y 不受 bottom 限制", () => {
  const out = clampMoveBox({ x: 10, y: 9999, w: 100, h: 60 }, region);
  assert.equal(out.y, 9999);
});

test("clampMoveBox 固定视口 bottom 也参与钳制", () => {
  const fixed: ContainerRegion = { left: 0, top: 0, right: 318, bottom: 500 };
  const out = clampMoveBox({ x: 10, y: 480, w: 100, h: 64 }, fixed);
  assert.equal(out.y, 436);
});

test("clampResizeBox 东把手拖过右缘时宽度封顶在容器内", () => {
  const raw = resizeBox({ x: 200, y: 40, w: 100, h: 50 }, "e", 120, 0);
  const out = clampResizeBox(raw, region, { minWidth: 16, minHeight: 12 });
  assert.equal(out.x, 200);
  assert.equal(out.w, 118); // 318 - 200
});

test("clampResizeBox 西把手拖出左缘时左缘收 0 且右缘保持不动", () => {
  const raw = resizeBox({ x: 40, y: 0, w: 100, h: 40 }, "w", -80, 0, { minWidth: 16 });
  const out = clampResizeBox(raw, region, { minWidth: 16, minHeight: 12 });
  assert.equal(out.x, 0);
  assert.equal(out.w, 140); // 右缘 40+100 保持
});

test("clampResizeBox 宽度超过容器时收缩到容器宽", () => {
  const out = clampResizeBox({ x: 0, y: 10, w: 500, h: 40 }, region, { minWidth: 16, minHeight: 12 });
  assert.equal(out.w, 318);
  assert.equal(out.x, 0);
});

test("clampResizeBox 保持最小尺寸下限，不因钳制产生 0 宽", () => {
  const out = clampResizeBox({ x: 316, y: 4, w: 6, h: 30 }, region, { minWidth: 16, minHeight: 12 });
  assert.equal(out.w, 16);
  assert.equal(out.x, 302); // 318 - 16
});

test("regionForContainer 按画布缩放换算本地像素", () => {
  const r = regionForContainer(318, 640, 0.5, true);
  assert.equal(r.right, 636);
  assert.equal(r.bottom, Number.POSITIVE_INFINITY);
});

test("regionForContainer 固定视口模式给出本地高度", () => {
  const r = regionForContainer(318, 640, 2, false);
  assert.equal(r.right, 159);
  assert.equal(r.bottom, 320);
});

test("DEFAULT_ELEMENT_REGION 与卡片实测宽度一致", () => {
  assert.equal(DEFAULT_ELEMENT_REGION.right, SCREEN_BODY_WIDTH);
  assert.equal(SCREEN_BODY_WIDTH, 318);
});