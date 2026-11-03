import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseEdgeLabelAnchor,
  edgeLabelCardStyle,
  estimateEdgeLabelSize,
  edgeLabelScale,
  edgeLaneIndex,
  createArrowMarker,
  arrowHeadPoints,
  placeEdgeLabelGroup,
  pointOnPolyline,
  polylineLength,
  type EdgeLabelPoint,
} from "../src/flow/edgeLabel.ts";

const path: EdgeLabelPoint[] = [
  { x: 0, y: 40 },
  { x: 60, y: 40 },
  { x: 60, y: 220 },
  { x: 260, y: 220 },
  { x: 260, y: 80 },
  { x: 320, y: 80 },
];

test("pointOnPolyline 按真实长度插值", () => {
  assert.deepEqual(pointOnPolyline(path, 0.5), { x: 140, y: 220 });
});

test("标签锚点位于路径后段，而不是整条绕行线的中点", () => {
  const anchor = chooseEdgeLabelAnchor(path, { target: { x: 320, y: 80 } });
  const ratio = anchor.distance / polylineLength(path);

  assert.ok(ratio > 0.65, `标签应位于路径后段，实际比例 ${ratio}`);
  assert.ok(anchor.point.x > 240, "标签应明显靠近目标一侧");
});

test("回边标签靠近目标入口而不是底部通道中点", () => {
  const backEdge: EdgeLabelPoint[] = [
    { x: 900, y: 440 },
    { x: 920, y: 440 },
    { x: 920, y: 720 },
    { x: 120, y: 720 },
    { x: 120, y: 210 },
    { x: 140, y: 210 },
  ];
  const anchor = chooseEdgeLabelAnchor(backEdge, { target: { x: 140, y: 210 } });

  assert.ok(anchor.point.y < 720, `标签不应停在底部回边通道，实际 y=${anchor.point.y}`);
  assert.ok(anchor.point.y > 210, `标签应位于目标入口前的竖直入线，实际 y=${anchor.point.y}`);
  assert.ok(anchor.point.x < 180, `标签应靠近目标左侧入口，实际 x=${anchor.point.x}`);
});

test("同一目标入口附近的标签会沿路径错开", () => {
  const first = chooseEdgeLabelAnchor(path, { target: { x: 320, y: 80 }, laneOffset: 0 });
  const second = chooseEdgeLabelAnchor(path, { target: { x: 320, y: 80 }, laneOffset: 1 });
  const third = chooseEdgeLabelAnchor(path, { target: { x: 320, y: 80 }, laneOffset: 2 });

  assert.ok(second.distance < first.distance, "第二个标签应沿路径后退");
  assert.ok(third.distance < second.distance, "第三个标签应继续沿路径后退");
  assert.ok(second.distance < first.distance, "后续标签应沿入线向后错开");
});

test("短路径仍返回路径上的有效锚点", () => {
  const short: EdgeLabelPoint[] = [{ x: 10, y: 10 }, { x: 50, y: 10 }];
  const anchor = chooseEdgeLabelAnchor(short, { target: { x: 50, y: 10 } });

  assert.ok(anchor.point.x >= 10 && anchor.point.x <= 50);
  assert.equal(anchor.point.y, 10);
});
test("同一目标、同一入口按稳定 id 分配 lane", () => {
  const edges = [
    { id: "e10", target: "home", targetHandle: "in" },
    { id: "e2", target: "home", targetHandle: "in" },
    { id: "e5", target: "home", targetHandle: "in" },
    { id: "e6", target: "detail", targetHandle: "in" },
  ];
  assert.equal(edgeLaneIndex(edges, "e10", "home", "in"), 0);
  assert.equal(edgeLaneIndex(edges, "e2", "home", "in"), 1);
  assert.equal(edgeLaneIndex(edges, "e5", "home", "in"), 2);
  assert.equal(edgeLaneIndex(edges, "e6", "detail", "in"), 0);
});

test("标签在缩小画布时反向放大，但保留可读上限", () => {
  assert.equal(edgeLabelScale(1), 1);
  assert.equal(edgeLabelScale(0.5), 2);
  assert.equal(edgeLabelScale(0.1), 3.2);
  assert.equal(edgeLabelScale(0), 1);
});

test("同一目标的多条入线标签在卡片左侧按 lane 均匀展开", () => {
  const first = placeEdgeLabelGroup({ x: 900, y: 300 }, { x: 1000, y: 320 }, "left", 0, 3, 1);
  const second = placeEdgeLabelGroup({ x: 900, y: 350 }, { x: 1000, y: 320 }, "left", 1, 3, 1);
  const third = placeEdgeLabelGroup({ x: 900, y: 380 }, { x: 1000, y: 320 }, "left", 2, 3, 1);

  assert.ok(first.y < second.y && second.y < third.y, "标签应稳定地按 lane 从上到下排列");
  assert.equal(second.y, 320, "lane 1 卡片应回到同目标统一列，锚点归属由 edgePoint 表达");
  assert.ok(first.lineX < 1000 && third.lineX < 1000);
  assert.equal(second.x, second.lineX, "边缘锚点应同时作为引导线起点");
});

test("标签列按屏幕尺寸反向换算，缩小画布时不会挤在一起", () => {
  const atOne = placeEdgeLabelGroup({ x: 900, y: 300 }, { x: 1000, y: 320 }, "left", 1, 3, 1);
  const zoomedOut = placeEdgeLabelGroup({ x: 330, y: 110 }, { x: 400, y: 120 }, "left", 2, 3, 0.25);
  assert.ok(zoomedOut.y - 120 > atOne.y - 320, "屏幕缩小后流程坐标中的 lane 间距应增大");
});

test("estimateEdgeLabelSize 的估算宽度不小于长标签的实际渲染宽度", () => {
  // e7「点击「发布流程」→ 确认支付」DOM 实测约 182px（zoom=0.5 时 364 流程坐标）。
  // 旧系数（action*8 + dest*7）只给到 288 流程坐标，屏幕宽 144px，导致碰撞检测漏判、压住上游节点。
  const size = estimateEdgeLabelSize("点击「发布流程」", "→ 确认支付", 0.5);
  assert.ok(size.width >= 364, `估算宽度应覆盖实际渲染宽度，实际 ${size.width}`);
});
test("estimateEdgeLabelSize reserves a readable two-part label", () => {
  const size = estimateEdgeLabelSize("点击项目卡片", "→ 项目详情", 1);
  assert.ok(size.width >= 110, `width should fit both parts, got ${size.width}`);
  assert.ok(size.width <= 260, `width should stay bounded, got ${size.width}`);
  assert.ok(size.height > 20, `height should include vertical padding, got ${size.height}`);
});

test("left-side cards grow away from the target instead of covering it", () => {
  const placement = placeEdgeLabelGroup(
    { x: 500, y: 300 },
    { x: 1000, y: 300 },
    "left",
    0,
    1,
    1,
    { size: { width: 180, height: 28 }, targetRect: { left: 760, top: 150, right: 1100, bottom: 450 } },
  );
  assert.ok(placement.x <= 750, `card anchor ${placement.x} should stop before target safe edge 750`);
  assert.equal(placement.side, "left");
  assert.equal(placement.cardAlign, "right-center");
});

test("the whole peer group keeps clear of the target card", () => {
  const target = { x: 1000, y: 320 };
  const targetRect = { left: 820, top: 180, right: 1000, bottom: 450 };
  const placements = [0, 1, 2].map((lane) => placeEdgeLabelGroup(
    { x: 500, y: 300 + lane * 30 },
    target,
    "left",
    lane,
    3,
    1,
    { size: { width: 150, height: 28 }, targetRect },
  ));
  for (const placement of placements) {
    assert.ok(placement.x <= 808, `card anchor should sit left of target safe edge, got ${placement.x}`);
    assert.equal(placement.cardAlign, "right-center");
  }
  assert.ok(placements[0].y < placements[1].y && placements[1].y < placements[2].y);
});

test("leader line starts at the card edge on the target-facing side", () => {
  const placement = placeEdgeLabelGroup(
    { x: 500, y: 300 },
    { x: 1000, y: 300 },
    "left",
    0,
    1,
    1,
    { size: { width: 180, height: 28 }, targetRect: { left: 820, top: 180, right: 1000, bottom: 450 } },
  );
  assert.equal(placement.lineX, placement.x);
  assert.equal(placement.lineY, placement.y);
  assert.ok(placement.x <= 808);
});

test("top-side cards grow upward and use vertical card alignment", () => {
  const placement = placeEdgeLabelGroup(
    { x: 1000, y: 700 },
    { x: 1000, y: 900 },
    "top",
    0,
    1,
    1,
    { size: { width: 160, height: 28 }, targetRect: { left: 850, top: 700, right: 1150, bottom: 1000 } },
  );
  assert.equal(placement.side, "top");
  assert.ok(placement.y <= 688, `card anchor should sit above target, got ${placement.y}`);
  assert.equal(placement.cardAlign, "bottom-center");
  assert.equal(edgeLabelCardStyle(1, placement.side).transformOrigin, "center bottom");
});






test("左侧超出可视区域时，整组标签换到上方且仍从卡片边缘出发", () => {
  const placement = placeEdgeLabelGroup(
    { x: 500, y: 700 },
    { x: 680, y: 900 },
    "left",
    0,
    1,
    1,
    {
      size: { width: 180, height: 28 },
      targetRect: { left: 680, top: 700, right: 1000, bottom: 1000 },
      viewport: { left: 20, top: 40, right: 1200, bottom: 800 },
      preferredSides: ["left", "top", "bottom"],
    },
  );
  assert.equal(placement.side, "top");
  assert.equal(placement.cardAlign, "bottom-center");
  assert.ok(placement.y <= 688, `card bottom should stay above target, got ${placement.y}`);
  assert.ok(placement.y - 28 >= 50, `card should remain inside viewport, got ${placement.y}`);
});

test("上方多条入线标签沿纵向分层，不横向挤成一排", () => {
  const options = {
    size: { width: 150, height: 28 },
    targetRect: { left: 850, top: 700, right: 1150, bottom: 1000 },
    viewport: { left: 20, top: 40, right: 1400, bottom: 980 },
    preferredSides: ["top"] as const,
  };
  const first = placeEdgeLabelGroup({ x: 900, y: 650 }, { x: 1000, y: 900 }, "top", 0, 2, 1, options);
  const second = placeEdgeLabelGroup({ x: 900, y: 650 }, { x: 1000, y: 900 }, "top", 1, 2, 1, options);
  assert.equal(first.side, "top");
  assert.equal(second.side, "top");
  assert.ok(second.y < first.y, "lane 1 should sit farther above lane 0");
  assert.ok(first.y - second.y >= 34, "stacked cards should leave a gap");
});

test("同一目标的整组标签统一换边，避免只切换部分 lane", () => {
  const peerSizes = Array.from({ length: 3 }, () => ({ width: 160, height: 28 }));
  const placements = peerSizes.map((size, lane) => placeEdgeLabelGroup(
    { x: 500, y: 300 + lane * 30 },
    { x: 500, y: 420 },
    "left",
    lane,
    3,
    1,
    {
      size,
      peerSizes,
      targetRect: { left: 500, top: 260, right: 820, bottom: 650 },
      viewport: { left: 62, top: 60, right: 900, bottom: 760 },
      preferredSides: ["left", "top"],
    },
  ));

  assert.deepEqual(placements.map((placement) => placement.side), ["left", "left", "left"]);
});

test("标签列避开其他节点后，不会被目标旁边的备注遮挡", () => {
  const placement = placeEdgeLabelGroup(
    { x: 500, y: 300 },
    { x: 1000, y: 300 },
    "left",
    0,
    1,
    1,
    {
      size: { width: 180, height: 28 },
      targetRect: { left: 760, top: 150, right: 1100, bottom: 450 },
      viewport: { left: 10, top: 10, right: 1300, bottom: 800 },
      preferredSides: ["left", "top", "bottom", "right"],
      avoidRects: [{ left: 600, top: 260, right: 760, bottom: 340 }],
    },
  );

  assert.notEqual(placement.side, "left");
  assert.ok(placement.y < 150 || placement.y > 450, "cards must not cover the avoid rectangle");
});
test("所有方向都无法完整容纳时，选择溢出与遮挡最少的候选侧", () => {
  const placement = placeEdgeLabelGroup(
    { x: 130, y: 300 },
    { x: 130, y: 300 },
    "left",
    0,
    1,
    1,
    {
      size: { width: 180, height: 28 },
      targetRect: { left: 40, top: 250, right: 220, bottom: 350 },
      viewport: { left: 0, top: 0, right: 200, bottom: 600 },
    },
  );

  assert.equal(placement.side, "top", "上方只溢出 30px，应优于左侧的 128px 溢出");
});

test("首选方向不可行时，会从其余方向中寻找完整可用的标签侧", () => {
  const placement = placeEdgeLabelGroup(
    { x: 600, y: 830 },
    { x: 600, y: 830 },
    "bottom",
    0,
    1,
    1,
    {
      size: { width: 180, height: 28 },
      targetRect: { left: 450, top: 760, right: 750, bottom: 900 },
      viewport: { left: 0, top: 0, right: 1200, bottom: 920 },
      preferredSides: ["bottom"],
    },
  );

  assert.notEqual(placement.side, "bottom");
});
test("左右侧标签卡片统一堆叠不重叠，但各自保留独立边锚点", () => {
  const options = {
    size: { width: 160, height: 28 },
    targetRect: { left: 1000, top: 200, right: 1320, bottom: 460 },
    preferredSides: ["left"] as const,
  };
  const first = placeEdgeLabelGroup({ x: 880, y: 260 }, { x: 1000, y: 320 }, "left", 0, 2, 1, options);
  const second = placeEdgeLabelGroup({ x: 880, y: 410 }, { x: 1000, y: 320 }, "left", 1, 2, 1, options);

  assert.ok(second.y - first.y >= 28, `多入线卡片应按 lane 分开避免重叠，实际差距 ${second.y - first.y}`);
  assert.deepEqual(first.edgePoint, { x: 880, y: 260 }, "第一条标签必须保留自己的边锚点");
  assert.deepEqual(second.edgePoint, { x: 880, y: 410 }, "第二条标签必须保留自己的边锚点");
});

test("上下侧标签卡片统一堆叠不重叠，但各自保留独立边锚点", () => {
  const options = {
    size: { width: 160, height: 28 },
    targetRect: { left: 850, top: 700, right: 1150, bottom: 1000 },
    viewport: { left: 20, top: 40, right: 1400, bottom: 1150 },
    preferredSides: ["top"] as const,
  };
  const first = placeEdgeLabelGroup({ x: 880, y: 650 }, { x: 1000, y: 900 }, "top", 0, 2, 1, options);
  const second = placeEdgeLabelGroup({ x: 1130, y: 650 }, { x: 1000, y: 900 }, "top", 1, 2, 1, options);

  assert.ok(first.y - second.y >= 34, `上方多行卡片应按 lane 堆叠，实际差距 ${first.y - second.y}`);
  assert.deepEqual(first.edgePoint, { x: 880, y: 650 }, "第一条标签必须保留自己的边锚点");
  assert.deepEqual(second.edgePoint, { x: 1130, y: 650 }, "第二条标签必须保留自己的边锚点");
});

test("arrowHeadPoints produces a clear triangle pointing from start to end", () => {
  const points = arrowHeadPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 6);
  const nums = points.split(" ").map((pair) => pair.split(",").map(Number));
  assert.equal(nums.length, 3);
  assert.deepEqual(nums[0], [10, 0], "tip should be exactly on the destination point");
  assert.ok(nums[1][0] < 10, "base should sit behind the tip");
  assert.ok(Math.abs(nums[1][1]) > 0, "triangle should have perpendicular width");
});

test("arrowHeadPoints points along the final leader segment regardless of direction", () => {
  const vertical = arrowHeadPoints({ x: 40, y: 10 }, { x: 40, y: 50 }, 8);
  const nums = vertical.split(" ").map((pair) => pair.split(",").map(Number));
  assert.deepEqual(nums[0], [40, 50]);
  assert.ok(nums[1][1] < 50, "vertical arrow base should sit above the tip");
});

test("arrowHeadPoints handles a zero-length line without emitting garbage", () => {
  assert.equal(arrowHeadPoints({ x: 10, y: 10 }, { x: 10, y: 10 }, 6), "");
});

test("createArrowMarker returns a valid marker config with correct dimensions", () => {
  const marker = createArrowMarker("test-arrow", "#ff0000");
  assert.equal(marker.id, "test-arrow");
  assert.equal(marker.markerWidth, 6.5);
  assert.equal(marker.markerHeight, 4.5);
  assert.equal(marker.refX, 6.5);
  assert.equal(marker.refY, 2.25);
  assert.equal(marker.orient, "auto");
  assert.equal(marker.color, "#ff0000");
  // path should be a triangle: M0,0 L6.5,2.25 L0,4.5 Z
  assert.equal(marker.path, "M0,0 L6.5,2.25 L0,4.5 Z");
});

test("createArrowMarker scales for zoom compensation", () => {
  // zoom 0.5 → scale 2：尺寸翻倍，屏幕上保持恒定
  const scaled = createArrowMarker("s", "#fff", 2);
  assert.equal(scaled.markerWidth, 13);
  assert.equal(scaled.markerHeight, 9);
  assert.equal(scaled.refX, 13);
  assert.equal(scaled.refY, 4.5);
  // 非法 scale 安全回退 1
  const bad = createArrowMarker("b", "#fff", NaN);
  assert.equal(bad.markerWidth, 6.5);
});

test("createArrowMarker generates unique ids for different colors", () => {
  const marker1 = createArrowMarker("arrow-ff0000", "#ff0000");
  const marker2 = createArrowMarker("arrow-00ff00", "#00ff00");
  assert.notEqual(marker1.id, marker2.id);
});