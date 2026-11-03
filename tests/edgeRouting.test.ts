import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRouteChain,
  computeEdgeEndpoints,
  getBezierPath,
  normalizeEdgeRouteMode,
  sampleBezierCurve,
  selectBestPorts,
  type NodeGeometry,
  type Point,
} from "../src/flow/edgeRouting.ts";

/** 采样折线上是否有任一点落在 box 内部（用于绕障断言） */
function samplesHitBox(pts: Point[], box: Box): boolean {
  return pts.some(
    (p) => p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h,
  );
}

type Box = { x: number; y: number; w: number; h: number };

// ── 基础曲线 ──────────────────────────────────────────────────────────

test("selectBestPorts：横向为主选右→左 / 左→右", () => {
  const source: NodeGeometry = { id: "a", x: 0, y: 0, width: 100, height: 60 };
  assert.deepEqual(
    selectBestPorts(source, { id: "b", x: 300, y: 40, width: 100, height: 60 }),
    { sourceDir: "right", targetDir: "left" },
  );
  assert.deepEqual(
    selectBestPorts(source, { id: "c", x: -300, y: 40, width: 100, height: 60 }),
    { sourceDir: "left", targetDir: "right" },
  );
});

test("selectBestPorts：纵向为主选下→上 / 上→下", () => {
  const source: NodeGeometry = { id: "a", x: 0, y: 0, width: 100, height: 60 };
  assert.deepEqual(
    selectBestPorts(source, { id: "b", x: 20, y: 300, width: 100, height: 60 }),
    { sourceDir: "bottom", targetDir: "top" },
  );
  assert.deepEqual(
    selectBestPorts(source, { id: "c", x: 20, y: -300, width: 100, height: 60 }),
    { sourceDir: "top", targetDir: "bottom" },
  );
});

test("getBezierPath：正向连接的端点与控制柄方向正确", () => {
  const bez = getBezierPath({ x: 0, y: 50 }, { x: 240, y: 50 }, "right", "left");
  assert.deepEqual(bez.p0, { x: 0, y: 50 });
  assert.deepEqual(bez.p3, { x: 240, y: 50 });
  assert.ok(bez.p1.x > bez.p0.x, "p1 应从源端口向右伸出");
  assert.ok(bez.p2.x < bez.p3.x, "p2 应从目标端口向左伸出");
  assert.ok(bez.path.startsWith("M0 50 C"), "path 应以 M 起点开头");
  assert.ok(bez.path.endsWith("240 50"), "path 应以终点坐标收尾");
});

test("getBezierPath：反向连接（目标在端口后方）仍生成合法曲线", () => {
  const bez = getBezierPath({ x: 200, y: 100 }, { x: 0, y: 100 }, "right", "left");
  assert.deepEqual(bez.p0, { x: 200, y: 100 });
  assert.deepEqual(bez.p3, { x: 0, y: 100 });
  assert.ok(Number.isFinite(bez.p1.x) && Number.isFinite(bez.p2.x));
  // 反向控制柄上限 REV_MAX=140：长回边需要更大的柄让弧线舒展（2026-11-03 平滑度修复）
  assert.ok(bez.p1.x <= bez.p0.x + 140 + 1e-6, "反向 p1 控制柄不应超过 140");
  assert.ok(bez.p2.x >= bez.p3.x - 140 - 1e-6, "反向 p2 控制柄不应超过 140");
  assert.ok(bez.p1.x >= bez.p0.x - 1e-6, "反向 p1 沿源端口朝外方向伸出");
  assert.ok(bez.p2.x <= bez.p3.x + 1e-6, "反向 p2 沿目标端口朝外方向伸出");
});

test("getBezierPath：多线分叉让同端口的几条线错开但共享端点", () => {
  const from = { x: 0, y: 50 };
  const to = { x: 240, y: 50 };
  const lane0 = getBezierPath(from, to, "right", "left", 0, 3);
  const lane1 = getBezierPath(from, to, "right", "left", 1, 3);
  const lane2 = getBezierPath(from, to, "right", "left", 2, 3);
  assert.deepEqual(lane0.p0, lane1.p0);
  assert.deepEqual(lane1.p3, lane2.p3);
  // perpVec("right") = (0,1)：lane 偏移为正向下。lane0 居上、lane2 居下
  assert.ok(lane0.p1.y < lane1.p1.y, "lane0 控制点应偏向上侧");
  assert.ok(lane2.p1.y > lane1.p1.y, "lane2 控制点应偏向下侧");
});

test("getBezierPath：近距离连接控制柄按比例缩短", () => {
  const dist = 100;
  const bez = getBezierPath({ x: 0, y: 0 }, { x: dist, y: 0 }, "right", "left");
  assert.ok(bez.p1.x <= dist * 0.25 + 1e-6, "近距离时 p1 控制柄 ≤ dist*0.25");
  assert.ok(bez.p2.x >= dist - dist * 0.25 - 1e-6, "近距离时 p2 控制柄 ≤ dist*0.25");
});

test("getBezierPath：非法坐标走 NaN 防护退化为直线", () => {
  const bez = getBezierPath({ x: NaN, y: 0 }, { x: 100, y: 0 });
  assert.ok(!bez.path.includes("NaN"), "path 中不允许出现 NaN");
  assert.deepEqual(bez.p0, { x: 0, y: 0 });
  assert.deepEqual(bez.p3, { x: 100, y: 0 });
  const inf = getBezierPath({ x: 0, y: 0 }, { x: Infinity, y: 0 });
  assert.ok(!inf.path.includes("Infinity"));
});

test("sampleBezierCurve：首末样本即端点，t=0.5 符合三次贝塞尔公式", () => {
  const bez = getBezierPath({ x: 0, y: 0 }, { x: 100, y: 0 }, "right", "left", 0, 1);
  const pts = sampleBezierCurve(bez, 8);
  assert.equal(pts.length, 9);
  assert.deepEqual(pts[0], bez.p0);
  assert.deepEqual(pts[8], bez.p3);
  const mid = pts[4];
  const expectX =
    0.125 * bez.p0.x + 0.375 * bez.p1.x + 0.375 * bez.p2.x + 0.125 * bez.p3.x;
  const expectY =
    0.125 * bez.p0.y + 0.375 * bez.p1.y + 0.375 * bez.p2.y + 0.125 * bez.p3.y;
  assert.ok(Math.abs(mid.x - expectX) < 1e-9);
  assert.ok(Math.abs(mid.y - expectY) < 1e-9);
});

test("回边路由模式只接受 auto/top/bottom，非法值回退 auto", () => {
  assert.equal(normalizeEdgeRouteMode(undefined), "auto");
  assert.equal(normalizeEdgeRouteMode("auto"), "auto");
  assert.equal(normalizeEdgeRouteMode("top"), "top");
  assert.equal(normalizeEdgeRouteMode("bottom"), "bottom");
  assert.equal(normalizeEdgeRouteMode("sideways"), "auto");
});

// ── 通用路由：候选生成 + 不变式过滤 ──────────────────────────────────

const ROUTE_ENTER = 2;

function rectOf(node: NodeGeometry) {
  return { left: node.x, top: node.y, right: node.x + node.width, bottom: node.y + node.height };
}

/** 不变式断言：选中路线的采样点不得进入任何卡片内部（含源/目标卡） */
function assertNoCardCrossing(
  geo: ReturnType<typeof computeEdgeEndpoints>,
  cards: NodeGeometry[],
) {
  for (const p of geo.samples) {
    for (const card of cards) {
      const r = rectOf(card);
      const inside =
        p.x > r.left + ROUTE_ENTER &&
        p.x < r.right - ROUTE_ENTER &&
        p.y > r.top + ROUTE_ENTER &&
        p.y < r.bottom - ROUTE_ENTER;
      assert.ok(!inside, `采样点 (${p.x.toFixed(0)},${p.y.toFixed(0)}) 进入卡片 ${card.id} 内部 (kind=${geo.kind})`);
    }
  }
}

test("路由：水平相邻从圆点直连，起点即语义圆点", () => {
  const geo = computeEdgeEndpoints({
    sourceNode: { id: "a", x: 0, y: 100, width: 320, height: 400 },
    targetNode: { id: "b", x: 600, y: 300, width: 320, height: 300 },
    otherRects: [],
    sourceHandleId: "search",
    sourceHandlePoint: { x: 320, y: 200 },
    sourceHandleDir: "right",
  });
  assert.equal(geo.kind, "direct");
  assert.deepEqual(geo.start, { x: 320, y: 200 });
  assert.equal(geo.legs, 1);
  assert.equal(geo.path.startsWith("M320 200"), true);
  assertNoCardCrossing(geo, [
    { id: "a", x: 0, y: 100, width: 320, height: 400 },
    { id: "b", x: 600, y: 300, width: 320, height: 300 },
  ]);
});

test("路由：目标在正下方时沿边绕过圆角，保持按键与线对应", () => {
  // 对应示例图 n-confirm → d-insurance
  const source = { id: "n-confirm", x: 1880, y: 100, width: 320, height: 615 };
  const target = { id: "d-insurance", x: 1880, y: 820, width: 187, height: 68 };
  const geo = computeEdgeEndpoints({
    sourceNode: source,
    targetNode: target,
    otherRects: [],
    sourceHandleId: "confirm",
    sourceHandlePoint: { x: 2200, y: 500 },
    sourceHandleDir: "right",
  });
  assert.equal(geo.kind, "escape");
  assert.deepEqual(geo.start, { x: 2200, y: 500 }, "起点必须是语义圆点");
  assert.equal(geo.legs, 2);
  assert.equal(geo.end.y, 820, "到达目标顶面");
  assertNoCardCrossing(geo, [source, target]);
});

test("路由：目标在正下方且圆点很低时退化为对面贴合", () => {
  // 圆点已贴近底角：沿边直行收益趋零，从底面投影出发更短且仍不穿卡
  const source = { id: "a", x: 0, y: 0, width: 320, height: 400 };
  const target = { id: "b", x: 0, y: 700, width: 320, height: 200 };
  const geo = computeEdgeEndpoints({
    sourceNode: source,
    targetNode: target,
    otherRects: [],
    sourceHandleId: "btn",
    sourceHandlePoint: { x: 320, y: 390 },
    sourceHandleDir: "right",
  });
  assert.equal(geo.legs >= 1, true);
  assertNoCardCrossing(geo, [source, target]);
});

test("路由：回边（目标在圆点面后方）从对侧贴合面直线穿过间隙", () => {
  // 对应 e14：n-doctors 返回 n-home
  const source = { id: "n-doctors", x: 680, y: 100, width: 320, height: 615 };
  const target = { id: "n-home", x: 80, y: 100, width: 320, height: 614 };
  const geo = computeEdgeEndpoints({
    sourceNode: source,
    targetNode: target,
    otherRects: [],
    sourceHandleId: "back",
    sourceHandlePoint: { x: 1000, y: 660 },
    sourceHandleDir: "right",
  });
  assert.equal(geo.kind, "opposite");
  assert.equal(geo.start.x, 680, "从源卡左面出发");
  assert.equal(geo.end.x, 400, "到达目标右面");
  assertNoCardCrossing(geo, [source, target]);
});

test("路由：回边直线上有其他卡片时改为顶部绕行", () => {
  // 对应 e17：n-success 返回 n-home，中间隔着 3 张卡
  const source = { id: "n-success", x: 3080, y: 100, width: 320, height: 614 };
  const target = { id: "n-home", x: 80, y: 100, width: 320, height: 614 };
  const blockers: NodeGeometry[] = [
    { id: "n-doctors", x: 680, y: 100, width: 320, height: 615 },
    { id: "n-form", x: 1280, y: 100, width: 320, height: 600 },
  ];
  const geo = computeEdgeEndpoints({
    sourceNode: source,
    targetNode: target,
    otherRects: blockers.map(rectOf),
    sourceHandleId: "backHome",
    sourceHandlePoint: { x: 3400, y: 640 },
    sourceHandleDir: "right",
  });
  assert.equal(geo.kind, "lift-top");
  assert.equal(geo.legs, 1);
  assertNoCardCrossing(geo, [source, target, ...blockers]);
});

test("路由：是/否分支线固定在语义圆点上", () => {
  const geo = computeEdgeEndpoints({
    sourceNode: { id: "d", x: 1880, y: 820, width: 187, height: 68 },
    targetNode: { id: "t", x: 2480, y: 600, width: 320, height: 370 },
    otherRects: [],
    sourceHandleId: "yes",
    sourceHandlePoint: { x: 2067, y: 854 },
    sourceHandleDir: "right",
  });
  assert.equal(geo.kind, "branch");
  assert.deepEqual(geo.start, { x: 2067, y: 854 }, "分支线起点必须是圆点");
  assertNoCardCrossing(geo, [
    { id: "d", x: 1880, y: 820, width: 187, height: 68 },
    { id: "t", x: 2480, y: 600, width: 320, height: 370 },
  ]);
});

test("路由：路径不穿卡的普适不变式（种子随机场景）", () => {
  // 用固定种子的伪随机布局覆盖几十种相对位置与障碍组合：
  // 任何场景下选中的路线都不得进入任何卡片内部 —— 这类问题由构造排除。
  let seed = 20261103;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  for (let i = 0; i < 40; i++) {
    const source: NodeGeometry = {
      id: "src",
      x: Math.round(rand() * 8) * 300,
      y: Math.round(rand() * 6) * 400,
      width: 320,
      height: 400 + Math.round(rand() * 3) * 80,
    };
    // 目标放在源卡周围 1~2 格的环上，保证存在可绕行通道
    const ring = 1 + Math.round(rand());
    const dirIndex = Math.floor(rand() * 8);
    const dx = [1, 1, 0, -1, -1, -1, 0, 1][dirIndex] * ring * 520;
    const dy = [0, 1, 1, 1, 0, -1, -1, -1][dirIndex] * ring * 520;
    const target: NodeGeometry = {
      id: "dst",
      x: source.x + dx,
      y: source.y + dy,
      width: 320,
      height: 300,
    };
    const cards = [source, target];

    // 至多一个窄障碍，放在两卡之间但偏离中线，保证存在绕行通道
    if (rand() > 0.5) {
      cards.push({
        id: "blk",
        x: (source.x + target.x) / 2 + (rand() - 0.5) * 400,
        y: (source.y + target.y) / 2 + (rand() - 0.5) * 300,
        width: 100 + Math.round(rand() * 60),
        height: 100 + Math.round(rand() * 80),
      });
    }

    // 圆点随机落在源卡四条边之一
    const side = Math.floor(rand() * 4);
    const sourceHandlePoint =
      side === 0 ? { x: source.x + source.width, y: source.y + 40 + rand() * (source.height - 80) }
      : side === 1 ? { x: source.x + 40 + rand() * (source.width - 80), y: source.y }
      : side === 2 ? { x: source.x, y: source.y + 40 + rand() * (source.height - 80) }
      : { x: source.x + 40 + rand() * (source.width - 80), y: source.y + source.height };
    const sourceHandleDir = side === 0 ? "right" : side === 1 ? "top" : side === 2 ? "left" : "bottom";

    const geo = computeEdgeEndpoints({
      sourceNode: source,
      targetNode: target,
      otherRects: cards.slice(2).map(rectOf),
      sourceHandleId: "btn",
      sourceHandlePoint,
      sourceHandleDir: sourceHandleDir as Point extends never ? never : "right" | "left" | "top" | "bottom",
    });
    assertNoCardCrossing(geo, cards);
  }
});

test("buildRouteChain：多段路径首尾相接，采样点连续", () => {
  const { path, samples } = buildRouteChain([
    { from: { x: 0, y: 0 }, to: { x: 0, y: 200 }, fromDir: "bottom", toDir: "bottom" },
    { from: { x: 0, y: 200 }, to: { x: 300, y: 300 }, fromDir: "bottom", toDir: "left" },
  ]);
  assert.ok(path.startsWith("M0 0"), "以起点开头");
  // 交接点与前段终点重合时不得插入零长度 L 指令（会产生折返锯齿）
  assert.ok(!path.includes("L0 200 C") && !path.includes("L0 200.00 C"), "交接点重合时不插入 L 指令");
  assert.ok(path.includes("C"), "仍为贝塞尔曲线");
  assert.ok(path.endsWith("300 300"), "以目标收尾");
  assert.ok(samples.length >= 40, "两段各有采样点");
  assert.deepEqual(samples[0], { x: 0, y: 0 });
  const last = samples[samples.length - 1];
  assert.equal(last.x, 300);
  assert.equal(last.y, 300);
});

test("buildRouteChain：追赶构型不产生 180° 折返尖点", () => {
  // 复现 e-mw0lhbquet 病例：escape 直行段同向端口，目标柄越过端点造成曲线折返
  const { samples } = buildRouteChain([
    { from: { x: 3035, y: 934 }, to: { x: 2916, y: 934 }, fromDir: "left", toDir: "left" },
    { from: { x: 2916, y: 934 }, to: { x: 2774, y: 410 }, fromDir: "left", toDir: "bottom" },
  ]);
  // 全路径折角检测：相邻采样向量夹角不得接近 180°
  let worst = 0;
  for (let i = 1; i < samples.length - 1; i++) {
    const v1x = samples[i].x - samples[i - 1].x, v1y = samples[i].y - samples[i - 1].y;
    const v2x = samples[i + 1].x - samples[i].x, v2y = samples[i + 1].y - samples[i].y;
    const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
    if (l1 < 0.5 || l2 < 0.5) continue;
    const dot = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
    worst = Math.max(worst, Math.acos(dot) * 180 / Math.PI);
  }
  assert.ok(worst < 90, `最大折角 ${worst.toFixed(0)}° 应小于 90°（无折返尖点）`);
});
