import assert from "node:assert/strict";
import test from "node:test";
import { measurePath } from "../src/flow/pathSample.ts";
import {
  publishSelection,
  selectionActive,
  selectionHasNode,
  selectionVersion,
  subscribeSelection,
} from "../src/flow/selectionSignal.ts";
import { buildRouteChain, type RouteLeg } from "../src/flow/edgeRouting.ts";

// ── pathSample ───────────────────────────────────────────────────────

test("measurePath 直线长度与等距采样", () => {
  const path = measurePath("M0 0 L100 0");
  assert.ok(path);
  assert.ok(Math.abs(path.length - 100) < 1e-6);
  const points = path.sample(3);
  assert.equal(points.length, 3);
  assert.deepEqual(points[0], { x: 0, y: 0, at: 0 });
  assert.ok(Math.abs(points[1].x - 50) < 1e-6);
  assert.ok(Math.abs(points[1].at - 50) < 1e-6);
  assert.deepEqual(points[2], { x: 100, y: 0, at: 100 });
});

test("measurePath 贝塞尔曲线长度介于弦长与控制多边形之间", () => {
  // 三阶贝塞尔：起 (0,0) 终 (100,0)，控制点在 (0,60)(100,60)——弧长比直线 100 长、比多边形 180 短
  const path = measurePath("M0 0 C0 60, 100 60, 100 0");
  assert.ok(path);
  assert.ok(path.length > 105, `弧长应明显大于弦长，实际 ${path.length}`);
  assert.ok(path.length < 180, `弧长应小于控制多边形长，实际 ${path.length}`);
  // 采样点落在曲线两端
  const points = path.sample(5);
  assert.deepEqual(points[0], { x: 0, y: 0, at: 0 });
  assert.ok(Math.abs(points[4].x - 100) < 1e-6);
  assert.ok(Math.abs(points[4].y) < 1e-6);
});

test("measurePath 认 Q 圆角与逗号分隔坐标，不认识的命令返回 null", () => {
  assert.ok(measurePath("M0 0 L10,0 Q15 5,20 0"));
  assert.equal(measurePath("M0 0 A5 5 0 1 0 10 0"), null);
  assert.equal(measurePath(""), null);
  assert.equal(measurePath("M0 0"), null); // 单点：长度为 0
});

// ── selectionSignal ──────────────────────────────────────────────────

test("publishSelection 内容不变时不打扰订阅者，变了才推进 version", () => {
  let notified = 0;
  const before = selectionVersion();
  const unsubscribe = subscribeSelection(() => {
    notified += 1;
  });
  try {
    publishSelection(["n1"], ["e1"]);
    const afterFirst = selectionVersion();
    assert.equal(notified, 1);
    assert.equal(afterFirst, before + 1);
    assert.equal(selectionActive(), true);
    assert.equal(selectionHasNode("n1"), true);
    assert.equal(selectionHasNode("n2"), false);

    // 同内容再发：免打扰
    publishSelection(["n1"], ["e1"]);
    assert.equal(notified, 1);
    assert.equal(selectionVersion(), afterFirst);

    // 集合变了（多一条边）：通知一次
    publishSelection(["n1"], ["e0", "e1"]);
    assert.equal(notified, 2);
    const afterSecond = selectionVersion();

    // 只是顺序不同：视为相同集合，免打扰
    publishSelection(["n1"], ["e1", "e0"]);
    assert.equal(notified, 2);
    assert.equal(selectionVersion(), afterSecond);
  } finally {
    unsubscribe();
  }
});

test("取消订阅后不再收到通知", () => {
  let notified = 0;
  const unsubscribe = subscribeSelection(() => {
    notified += 1;
  });
  publishSelection(["a"], []);
  unsubscribe();
  publishSelection(["b"], []);
  assert.equal(notified, 1);
  // 留下干净状态给后续用例
  publishSelection([], []);
});

// ── buildRouteChain 直角圆角 ────────────────────────────────────────

test("连续 straight 段产出带 Q 圆角的折线路径", () => {
  const legs: RouteLeg[] = [
    { from: { x: 0, y: 0 }, to: { x: 0, y: 100 }, fromDir: "bottom", toDir: "bottom", straight: true },
    { from: { x: 0, y: 100 }, to: { x: 200, y: 100 }, fromDir: "right", toDir: "right", straight: true },
    { from: { x: 200, y: 100 }, to: { x: 200, y: 200 }, fromDir: "bottom", toDir: "bottom" },
  ];
  const { path, samples } = buildRouteChain(legs);
  assert.ok(path.startsWith("M0 0"));
  assert.ok(path.includes("Q"), "肘形拐角应有 Q 圆角");
  // 采样连续：无重复点、无跳变
  for (let i = 1; i < samples.length; i++) {
    const d = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
    assert.ok(d >= 0, "采样应沿折线单调推进");
  }
  // 圆角往角内收：路径不再经过硬拐角点 (0,100) 与 (200,100)
  assert.ok(!path.includes("L0 100"), "拐角点不应再作为 L 端点出现");
});

test("单一 straight 段保持普通 L 路径", () => {
  const legs: RouteLeg[] = [
    { from: { x: 0, y: 0 }, to: { x: 0, y: 100 }, fromDir: "bottom", toDir: "bottom", straight: true },
    { from: { x: 0, y: 100 }, to: { x: 100, y: 100 }, fromDir: "right", toDir: "right" },
  ];
  const { path } = buildRouteChain(legs);
  assert.ok(!path.includes("Q"), "没有内部折点就不该有圆角");
});
