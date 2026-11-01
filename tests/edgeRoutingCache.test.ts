import assert from "node:assert/strict";
import test from "node:test";
import type { NodeGeometry, Point } from "../src/flow/edgeRouting.ts";
import { createEdgeRouteCache, type EdgeRouteInput } from "../src/flow/edgeRoutingCache.ts";

const FROM: Point = { x: 0, y: 50 };
const TO: Point = { x: 240, y: 50 };

function makeInput(overrides: Partial<EdgeRouteInput> = {}): EdgeRouteInput {
  return {
    from: FROM,
    to: TO,
    sourceId: "source",
    targetId: "target",
    nodeGeometries: [],
    excludeNodeIds: [],
    margin: 22,
    ...overrides,
  };
}

function makeBlocker(overrides: Partial<NodeGeometry> = {}): NodeGeometry {
  return {
    id: "blocker",
    x: 90,
    y: 20,
    width: 60,
    height: 60,
    ...overrides,
  };
}

test("首次路由是 miss", () => {
  const cache = createEdgeRouteCache();

  const path = cache.route(makeInput());

  assert.deepEqual(path, [FROM, TO]);
  assert.equal(cache.size, 1);
  assert.equal(cache.maxSize, 512);
  assert.deepEqual(cache.stats(), {
    hits: 0,
    misses: 1,
    evictions: 0,
  });
});

test("结构相同的输入命中缓存", () => {
  const cache = createEdgeRouteCache();

  const firstPath = cache.route(makeInput());
  const secondPath = cache.route(makeInput());

  assert.deepEqual(secondPath, firstPath);
  assert.equal(cache.size, 1);
  assert.deepEqual(cache.stats(), {
    hits: 1,
    misses: 1,
    evictions: 0,
  });
});

test("节点移动或尺寸变化时失效", () => {
  const cache = createEdgeRouteCache();

  const blockedPath = cache.route(makeInput({ nodeGeometries: [makeBlocker()] }));
  assert.ok(blockedPath.length > 2, "初始障碍应产生绕行路径");

  const movedPath = cache.route(makeInput({ nodeGeometries: [makeBlocker({ y: 200 })] }));
  assert.deepEqual(movedPath, [FROM, TO], "节点移走后应重新计算为直线");

  const resizedPath = cache.route(makeInput({ nodeGeometries: [makeBlocker({ width: 5 })] }));
  assert.ok(resizedPath.length > 2, "尺寸变化后仍应重新检测碰撞");

  assert.deepEqual(cache.stats(), {
    hits: 0,
    misses: 3,
    evictions: 0,
  });
});

test("端点坐标变化时失效", () => {
  const cache = createEdgeRouteCache();

  cache.route(makeInput());
  cache.route(makeInput({ from: { x: 0, y: 40 }, to: { x: 240, y: 60 } }));

  assert.equal(cache.size, 2);
  assert.deepEqual(cache.stats(), {
    hits: 0,
    misses: 2,
    evictions: 0,
  });
});

test("不同 source 或 target 使用不同缓存键", () => {
  const cache = createEdgeRouteCache();

  cache.route(makeInput({ sourceId: "source-a", targetId: "target-a" }));
  cache.route(makeInput({ sourceId: "source-b", targetId: "target-a" }));
  cache.route(makeInput({ sourceId: "source-b", targetId: "target-b" }));

  assert.equal(cache.size, 3);
  assert.deepEqual(cache.stats(), {
    hits: 0,
    misses: 3,
    evictions: 0,
  });
});

test("margin 与排除节点 id 参与缓存键", () => {
  const cache = createEdgeRouteCache();
  const nodeGeometries = [makeBlocker({ y: 70, height: 40 })];

  const blockedPath = cache.route(makeInput({ nodeGeometries, margin: 22 }));
  assert.ok(blockedPath.length > 2, "安全边距应让节点挡住直线");

  const noMarginPath = cache.route(makeInput({ nodeGeometries, margin: 0 }));
  assert.deepEqual(noMarginPath, [FROM, TO], "边距变化后应重新计算");

  const excludedPath = cache.route(makeInput({ nodeGeometries, margin: 22, excludeNodeIds: ["blocker"] }));
  assert.deepEqual(excludedPath, [FROM, TO], "排除节点变化后应重新计算");

  assert.deepEqual(cache.stats(), {
    hits: 0,
    misses: 3,
    evictions: 0,
  });
});

test("达到上限时淘汰最久未使用的条目，命中会刷新 LRU 顺序", () => {
  const cache = createEdgeRouteCache({ maxSize: 2 });
  const inputA = makeInput({ sourceId: "a" });
  const inputB = makeInput({ sourceId: "b" });
  const inputC = makeInput({ sourceId: "c" });

  cache.route(inputA);
  cache.route(inputB);
  cache.route(makeInput({ sourceId: "a" }));
  cache.route(inputC);

  assert.equal(cache.size, 2);
  assert.equal(cache.maxSize, 2);
  assert.deepEqual(cache.stats(), {
    hits: 1,
    misses: 3,
    evictions: 1,
  });

  cache.route(makeInput({ sourceId: "a" }));
  cache.route(makeInput({ sourceId: "b" }));

  assert.deepEqual(cache.stats(), {
    hits: 2,
    misses: 4,
    evictions: 2,
  });
});

test("stats 返回统计快照，clear 清空条目并重置统计", () => {
  const cache = createEdgeRouteCache({ maxSize: 1 });
  const inputA = makeInput({ sourceId: "a" });
  const inputB = makeInput({ sourceId: "b" });

  cache.route(inputA);
  cache.route(makeInput({ sourceId: "a" }));
  cache.route(inputB);

  const snapshot = cache.stats();
  assert.deepEqual(snapshot, {
    hits: 1,
    misses: 2,
    evictions: 1,
  });

  cache.clear();

  assert.equal(cache.size, 0);
  assert.deepEqual(cache.stats(), {
    hits: 0,
    misses: 0,
    evictions: 0,
  });
  assert.equal(snapshot.hits, 1, "已返回的 stats 对象不应被后续操作修改");
});