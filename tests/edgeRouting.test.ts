import assert from "node:assert/strict";
import test from "node:test";
import { createBackEdgeLanePath, createBalancedBackEdgePath, normalizeEdgeRouteMode, smartEdgeRoute, type Box, type NodeGeometry, type Point } from "../src/flow/edgeRouting.ts";

function crossesInterior(a: Point, b: Point, box: Box): boolean {
  const epsilon = 0.01;
  const left = box.x + epsilon;
  const right = box.x + box.w - epsilon;
  const top = box.y + epsilon;
  const bottom = box.y + box.h - epsilon;
  if (Math.abs(a.y - b.y) < epsilon) {
    const y = a.y;
    return y > top && y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right;
  }
  if (Math.abs(a.x - b.x) < epsilon) {
    const x = a.x;
    return x > left && x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom;
  }
  return true;
}

function assertClearOrthogonalPath(path: Point[], obstacles: NodeGeometry[]) {
  assert.ok(path.length >= 2, "路径至少包含起点和终点");
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    assert.ok(
      Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01,
      `第 ${i} 段必须是水平或垂直线段: ${JSON.stringify([a, b])}`,
    );
    for (const obstacle of obstacles) {
      assert.equal(
        crossesInterior(a, b, { x: obstacle.x, y: obstacle.y, w: obstacle.width, h: obstacle.height }),
        false,
        `第 ${i} 段穿过了节点 ${obstacle.id}`,
      );
    }
  }
}

test("没有障碍时保持原始直线", () => {
  const from = { x: 0, y: 50 };
  const to = { x: 240, y: 50 };
  const path = smartEdgeRoute(from, to, [], []);
  assert.deepEqual(path, [from, to]);
});

test("单个节点挡住直线时绕行且不穿过节点", () => {
  const from = { x: 0, y: 50 };
  const to = { x: 240, y: 50 };
  const obstacles: NodeGeometry[] = [{ id: "middle", x: 90, y: 20, width: 60, height: 60 }];

  const path = smartEdgeRoute(from, to, obstacles, []);

  assert.ok(path.length > 2, "存在障碍时应产生绕行路径");
  assert.deepEqual(path[0], from);
  assert.deepEqual(path[path.length - 1], to);
  assertClearOrthogonalPath(path, obstacles);
});

test("连续多个节点挡住路线时仍能找到无碰撞路径", () => {
  const from = { x: 0, y: 80 };
  const to = { x: 480, y: 80 };
  const obstacles: NodeGeometry[] = [
    { id: "first", x: 90, y: 40, width: 80, height: 80 },
    { id: "second", x: 230, y: 30, width: 90, height: 100 },
    { id: "third", x: 360, y: 50, width: 40, height: 60 },
  ];

  const path = smartEdgeRoute(from, to, obstacles, []);

  assert.ok(path.length > 2, "多个障碍时应产生绕行路径");
  assert.deepEqual(path[0], from);
  assert.deepEqual(path[path.length - 1], to);
  assertClearOrthogonalPath(path, obstacles);
});



test("回边路由模式只接受 auto/top/bottom，非法值回退 auto", () => {
  assert.equal(normalizeEdgeRouteMode(undefined), "auto");
  assert.equal(normalizeEdgeRouteMode("auto"), "auto");
  assert.equal(normalizeEdgeRouteMode("top"), "top");
  assert.equal(normalizeEdgeRouteMode("bottom"), "bottom");
  assert.equal(normalizeEdgeRouteMode("sideways"), "auto");
});

test("上通道回边贴着节点上缘生成更短的可操作路径", () => {
  const source: NodeGeometry = { id: "source", x: 300, y: 120, width: 200, height: 120 };
  const target: NodeGeometry = { id: "target", x: 0, y: 300, width: 200, height: 120 };
  const from = { x: 500, y: 180 };
  const to = { x: 0, y: 360 };
  const path = createBackEdgeLanePath(from, to, "top", [source, target], 0);

  assert.deepEqual(path[0], from);
  assert.deepEqual(path[path.length - 1], to);
  assert.ok(path.some((point) => point.y < source.y - 20), "上通道应位于节点上缘之外");
  for (let i = 1; i < path.length; i += 1) {
    assert.ok(
      Math.abs(path[i].x - path[i - 1].x) < 0.01 || Math.abs(path[i].y - path[i - 1].y) < 0.01,
      `上通道第 ${i} 段必须是正交线段`,
    );
  }
});

test("下通道回边在手动模式下保持节点下缘之外", () => {
  const source: NodeGeometry = { id: "source", x: 300, y: 120, width: 200, height: 120 };
  const target: NodeGeometry = { id: "target", x: 0, y: 300, width: 200, height: 120 };
  const obstacle: NodeGeometry = { id: "obstacle", x: 180, y: 190, width: 140, height: 60 };
  const from = { x: 500, y: 180 };
  const to = { x: 0, y: 360 };
  const path = createBackEdgeLanePath(
    from,
    to,
    "bottom",
    [source, target, obstacle],
    0,
  );

  const laneY = path.find((point) => Math.abs(point.x - (to.x - 20)) < 0.01)?.y ?? Math.max(...path.map((point) => point.y));
  assert.ok(laneY > Math.max(source.y + source.height, target.y + target.height), "下通道应位于两个端点节点下缘之外");
  assert.ok(path.every((point, index) => index === 0 || Math.abs(point.x - path[index - 1].x) < 0.01 || Math.abs(point.y - path[index - 1].y) < 0.01));
});



test("自动回边为近距离上下闭环选择局部下通道", () => {
  const source: NodeGeometry = { id: "source", x: 680, y: 180, width: 320, height: 540 };
  const target: NodeGeometry = { id: "target", x: 680, y: 820, width: 190, height: 68 };
  const nodes = [source, target];
  const from = { x: 1000, y: 613 };
  const to = { x: 676, y: 854 };
  const path = createBalancedBackEdgePath(from, to, nodes, 0);

  assert.ok(path, "近距离闭环应返回局部通道");
  assert.deepEqual(path[0], from);
  assert.deepEqual(path[path.length - 1], to);
  const laneY = Math.max(...path.map((point) => point.y));
  assert.ok(laneY !== undefined && laneY > target.y + target.height, "通道应贴着闭环下缘");
  assert.ok(laneY < 1000, "近距离闭环不应被推到全局底部");
});

test("自动回边对远距离回退保持最短避障路线", () => {
  const source: NodeGeometry = { id: "source", x: 1880, y: 500, width: 210, height: 61 };
  const target: NodeGeometry = { id: "target", x: 1280, y: 180, width: 320, height: 433 };
  const nodes = [source, target];
  const from = { x: 2093, y: 530 };
  const to = { x: 1275, y: 396 };

  assert.equal(createBalancedBackEdgePath(from, to, nodes, 0), null);
});
