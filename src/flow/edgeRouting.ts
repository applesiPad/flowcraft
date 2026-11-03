/**
 * 无限画布连线系统 — 贝塞尔曲线路径算法
 *
 * 核心功能：
 *   1. 智能端口选择：根据节点相对位置自动选择最优端口方向组合
 *   2. 通用路由：候选路线生成 + 「线不穿卡」不变式过滤 + 距离打分（见文件末尾）
 *   3. NaN 防护：处理非法坐标输入
 *
 * 四种连接情况：
 *   A - 正常连接（正向）：目标在源端口朝外方向的前方 → 标准 S 曲线
 *   B - 上下错位连接：端口面对面但有较大偏移 → 同 A 公式，S 曲线自动适应
 *   C - 反向连接：目标在源端口朝外方向的后方 → 小控制柄 + 适度弧线
 *   D - 多线分叉：lane 偏移叠加到上述情况的 perpVec 方向
 */

export type Point = { x: number; y: number };
export type NodeGeometry = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PortDirection = "left" | "right" | "top" | "bottom";

// ── 常量 ──────────────────────────────────────────────────────────────

/** 正向连接控制柄强度 */
const FWD_RATIO = 0.32;
/** 正向控制柄最小长度 */
const FWD_MIN = 40;
/** 正向控制柄最大长度 */
const FWD_MAX = 120;

/** 反向连接控制柄强度 */
const REV_RATIO = 0.22;
/** 反向控制柄最小长度 */
const REV_MIN = 24;
/** 反向控制柄最大长度 */
const REV_MAX = 140;

/** 反向弧线幅度 = handle * 此系数 */
const REV_ARC_RATIO = 0.55;
/** 反向弧线最小值 */
const REV_ARC_MIN = 18;
/** 反向弧线最大值 */
const REV_ARC_MAX = 80;

/** 多线分叉间距 */
const LANE_SPACING = 24;

/** 控制柄上限占距离比例（防过冲） */
const HANDLE_CAP = 0.4;

/** 反向连接弧线方向判定阈值 */
const PERP_ALIGN_THRESHOLD = 10;

/** 碰撞检测安全间距 */
/** 近距离连接阈值 */
const CLOSE_DISTANCE_THRESHOLD = 200;

/** 近距离连接控制柄比例 */
const CLOSE_HANDLE_RATIO = 0.25;

// ── 工具函数 ──────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 端口朝外单位向量：right→(1,0), left→(-1,0), top→(0,-1), bottom→(0,1) */
function dirVec(dir: PortDirection): Point {
  switch (dir) {
    case "right":  return { x: 1, y: 0 };
    case "left":   return { x: -1, y: 0 };
    case "top":    return { x: 0, y: -1 };
    case "bottom": return { x: 0, y: 1 };
  }
}

/**
 * 端口法线垂直向量（用于弧线偏移和多线分叉）。
 * right→(0,1), left→(0,-1), top→(1,0), bottom→(-1,0)
 */
function perpVec(dir: PortDirection): Point {
  switch (dir) {
    case "right":  return { x: 0, y: 1 };
    case "left":   return { x: 0, y: -1 };
    case "top":    return { x: 1, y: 0 };
    case "bottom": return { x: -1, y: 0 };
  }
}

/** 检查坐标值是否合法（非 NaN / Infinity） */
function isValidPoint(p: Point): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

// ── 核心类型 ──────────────────────────────────────────────────────────

export interface BezierPathResult {
  path: string;
  p0: Point;
  p1: Point;
  p2: Point;
  p3: Point;
}

// ── NaN 防护：退化直线 ────────────────────────────────────────────────

function degenerateLine(source: Point, target: Point): BezierPathResult {
  const p0 = { x: source.x, y: source.y };
  const p3 = { x: target.x, y: target.y };
  return {
    path: `M${p0.x} ${p0.y} L${p3.x} ${p3.y}`,
    p0,
    p1: p0,
    p2: p3,
    p3,
  };
}

// ── 智能端口选择 ──────────────────────────────────────────────────────

/**
 * 根据源节点和目标节点的相对位置，自动选择最优的端口方向组合。
 *
 * 判断逻辑：
 *   - 计算两节点中心点的 dx, dy
 *   - absDx > absDy（横向为主）：
 *       dx > 0 → source right, target left
 *       dx < 0 → source left, target right
 *   - absDy > absDx（纵向为主）：
 *       dy > 0 → source bottom, target top
 *       dy < 0 → source top, target bottom
 *   - 距离很近（dist < 200）时同样适用上述逻辑（面对面端口天然最短）
 */
export function selectBestPorts(
  sourceNode: NodeGeometry,
  targetNode: NodeGeometry,
): { sourceDir: PortDirection; targetDir: PortDirection } {
  const scx = sourceNode.x + sourceNode.width / 2;
  const scy = sourceNode.y + sourceNode.height / 2;
  const tcx = targetNode.x + targetNode.width / 2;
  const tcy = targetNode.y + targetNode.height / 2;

  const dx = tcx - scx;
  const dy = tcy - scy;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // 横向为主（含 absDx === absDy 的平局情况默认横向）
  if (absDx >= absDy) {
    return dx >= 0
      ? { sourceDir: "right", targetDir: "left" }
      : { sourceDir: "left", targetDir: "right" };
  }

  // 纵向为主
  return dy >= 0
    ? { sourceDir: "bottom", targetDir: "top" }
    : { sourceDir: "top", targetDir: "bottom" };
}

// ── 核心算法 ──────────────────────────────────────────────────────────

/**
 * 计算两个端口之间的三阶贝塞尔曲线路径。
 *
 * 分类逻辑：
 *   - 坐标不合法       → NaN 防护：退化直线 + console.warn
 *   - dist < 1          → 自连接：退化直线
 *   - distAlong > 0     → 情况 A/B（正向）：标准 S 曲线
 *   - distAlong <= 0    → 情况 C（反向）：小控制柄 + 弧线
 *   - 情况 D（多线分叉）：lane 偏移叠加到上述所有情况的 perpVec 方向
 *   - dist < 200        → 近距离连接：控制柄缩短到 dist * 0.25
 */
export function getBezierPath(
  source: Point,
  target: Point,
  sourceDir: PortDirection = "right",
  targetDir: PortDirection = "left",
  laneIndex = 0,
  totalLanes = 1,
): BezierPathResult {
  // ── NaN 防护 ────────────────────────────────────────────────────────
  if (!isValidPoint(source) || !isValidPoint(target)) {
    console.warn(
      "[edgeRouting] getBezierPath received invalid point:",
      { source, target, sourceDir, targetDir },
    );
    return degenerateLine(
      isValidPoint(source) ? source : { x: 0, y: 0 },
      isValidPoint(target) ? target : { x: 0, y: 0 },
    );
  }

  const p0 = { x: source.x, y: source.y };
  const p3 = { x: target.x, y: target.y };

  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  const dist = Math.hypot(dx, dy);

  // ── 自连接：起终点几乎重合 → 退化直线 ─────────────────────────────
  if (dist < 1) {
    return {
      path: `M${p0.x} ${p0.y} L${p3.x} ${p3.y}`,
      p0,
      p1: p0,
      p2: p3,
      p3,
    };
  }

  // 源端口朝外方向 & 法线方向
  const sd = dirVec(sourceDir);
  const sp = perpVec(sourceDir);
  // 目标端口朝外方向 & 法线方向
  const td = dirVec(targetDir);
  const tp = perpVec(targetDir);

  // ── 判断正向 / 反向 ───────────────────────────────────────────────
  const distAlong = dx * sd.x + dy * sd.y;
  const isForward = distAlong > 0;

  // ── 多线分叉偏移（情况 D） ─────────────────────────────────────────
  const laneCenter = (totalLanes - 1) / 2;
  const laneOff = laneIndex - laneCenter;
  const laneShift = laneOff * LANE_SPACING;

  let p1: Point;
  let p2: Point;

  if (isForward) {
    // ═══════════════════════════════════════════════════════════════
    // 情况 A / B：正向连接
    // ═══════════════════════════════════════════════════════════════

    let handle = clamp(dist * FWD_RATIO, FWD_MIN, FWD_MAX);
    handle = Math.min(handle, dist * HANDLE_CAP);

    // 近距离连接：缩短控制柄
    if (dist < CLOSE_DISTANCE_THRESHOLD) {
      handle = Math.min(handle, dist * CLOSE_HANDLE_RATIO);
    }

    p1 = {
      x: p0.x + sd.x * handle + sp.x * laneShift,
      y: p0.y + sd.y * handle + sp.y * laneShift,
    };
    // 追赶构型：目标端口朝向与行进方向同向（如绕行直行段的 fromDir==toDir），
    // 目标柄若照常外伸会越过端点造成 180° 折返尖点；改为向后收，曲线平滑进港。
    const chase = dx * td.x + dy * td.y > 0;
    p2 = {
      x: p3.x + (chase ? -1 : 1) * td.x * handle + tp.x * laneShift,
      y: p3.y + (chase ? -1 : 1) * td.y * handle + tp.y * laneShift,
    };
  } else {
    // ═══════════════════════════════════════════════════════════════
    // 情况 C：反向连接
    // ═══════════════════════════════════════════════════════════════

    let handle = clamp(dist * REV_RATIO, REV_MIN, REV_MAX);

    // 近距离连接：缩短控制柄
    if (dist < CLOSE_DISTANCE_THRESHOLD) {
      handle = Math.min(handle, dist * CLOSE_HANDLE_RATIO);
    }

    const perpDist = dx * sp.x + dy * sp.y;

    let arcSign: number;
    if (Math.abs(perpDist) >= PERP_ALIGN_THRESHOLD) {
      arcSign = Math.sign(perpDist);
    } else {
      arcSign = laneOff >= 0 ? 1 : -1;
    }

    const arcAmount = clamp(handle * REV_ARC_RATIO, REV_ARC_MIN, REV_ARC_MAX);
    const totalArc = arcSign * arcAmount + laneShift;

    p1 = {
      x: p0.x + sd.x * handle + sp.x * totalArc,
      y: p0.y + sd.y * handle + sp.y * totalArc,
    };
    p2 = {
      x: p3.x + td.x * handle + tp.x * totalArc,
      y: p3.y + td.y * handle + tp.y * totalArc,
    };
  }

  const path = `M${p0.x} ${p0.y} C${p1.x} ${p1.y},${p2.x} ${p2.y},${p3.x} ${p3.y}`;
  return { path, p0, p1, p2, p3 };
}

// ── 贝塞尔曲线采样 ────────────────────────────────────────────────────

/**
 * 对三阶贝塞尔曲线进行等距采样（参数空间均匀 t）。
 */
export function sampleBezierCurve(
  bez: BezierPathResult,
  samples = 24,
): Point[] {
  const { p0, p1, p2, p3 } = bez;
  const pts: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;
    pts.push({
      x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
      y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
    });
  }
  return pts;
}

// ── 向后兼容接口 ──────────────────────────────────────────────────────

export type EdgeRouteMode = "auto" | "top" | "bottom";

export function normalizeEdgeRouteMode(value: unknown): EdgeRouteMode {
  return value === "top" || value === "bottom" ? value : "auto";
}

// ── 通用路由：候选生成 + 不变式过滤 + 距离打分 ──────────────────────
//
// 设计目标（普适化）：不再为每种卡片相对位置写特例规则，而是——
//   1. 生成一组候选路线（直连 / 沿边绕角 / 对面贴合 / 顶部绕行 / 底部绕行）；
//   2. 对每条候选做不变式校验：采样点不得进入任何卡片内部（含源/目标卡自身），
//      即「线永远不穿过卡片」由构造保证，而不是靠逐案修补；
//   3. 合格候选按 路径长度 + 段数 + 脱离语义圆点惩罚 打分，取最优。
// 新的几何场景自动落在这套机制内，无需再补 if 分支。

/** 贴合面内缩距离：端点不顶到卡片圆角。 */
const FACE_PAD = 16;
/** 沿边绕角直行段越过圆角的距离，也是绕行路线与卡片的净距。 */
const ROUTE_CLEARANCE = 24;
/** 不变式判定：采样点侵入卡片边缘超过该深度才算「穿卡」。 */
const ROUTE_ENTER = 2;
/** 每段曲线的采样数（不变式校验与标签定位共用）。 */
const ROUTE_SAMPLES = 64;
/** 候选起点的语义圆点脱离惩罚：优先选从圆点出发的等长路线。 */
const DETACHED_PENALTY = 400;
/** 每多一段曲线的惩罚：同长度时优先直连。 */
const LEG_PENALTY = 12;
/** 这些 source handle 承载分支语义（是/否），端点固定在圆点上，不参与候选竞争。 */
const BRANCH_HANDLE_IDS = new Set(["yes", "no"]);

export type RouteLeg = {
  from: Point;
  to: Point;
  fromDir: PortDirection;
  toDir: PortDirection;
  /** true：渲染为直线段（保底绕行用，采样无盲区）。 */
  straight?: boolean;
};

export type EdgeRouteKind =
  | "direct"
  | "escape"
  | "opposite"
  | "lift-top"
  | "lift-bottom"
  | "lift-left"
  | "lift-right"
  | "detour-top"
  | "detour-bottom"
  | "branch";

export type EdgeRouteGeometry = {
  /** 完整多段路径（可能含多个 C 段），供 BaseEdge / animateMotion 使用。 */
  path: string;
  /** 全路径等距采样点：标签定位与不变式校验共用。 */
  samples: Point[];
  /** 语义圆点位置（起点圆圈画在这里）。 */
  start: Point;
  /** 目标锚点。 */
  end: Point;
  /** 到达面方向（标签避让用）。 */
  targetDir: PortDirection;
  legs: number;
  kind: EdgeRouteKind;
};

type FaceBox = { x: number; y: number; width: number; height: number };
type AxisRect = { left: number; top: number; right: number; bottom: number };

function faceClamp(v: number, lo: number, hi: number): number {
  if (lo >= hi) return (lo + hi) / 2;
  return clamp(v, lo, hi);
}

function rectCenter(box: FaceBox): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** 在 box 的 dir 面上取锚点：沿面方向投影 project 的坐标，另一轴贴面。 */
function faceAnchor(box: FaceBox, dir: PortDirection, project: Point): Point {
  switch (dir) {
    case "left":
      return { x: box.x, y: faceClamp(project.y, box.y + FACE_PAD, box.y + box.height - FACE_PAD) };
    case "right":
      return { x: box.x + box.width, y: faceClamp(project.y, box.y + FACE_PAD, box.y + box.height - FACE_PAD) };
    case "top":
      return { x: faceClamp(project.x, box.x + FACE_PAD, box.x + box.width - FACE_PAD), y: box.y };
    case "bottom":
      return { x: faceClamp(project.x, box.x + FACE_PAD, box.x + box.width - FACE_PAD), y: box.y + box.height };
  }
}

/** 与 dir 垂直的两个方向（沿卡片边缘）。 */
function perpendicularsOf(dir: PortDirection): [PortDirection, PortDirection] {
  return dir === "left" || dir === "right" ? ["top", "bottom"] : ["left", "right"];
}

/**
 * 沿边绕角的直行终点：从圆点沿卡片边缘方向推进到刚好越过卡片圆角的位置，
 * 之后的曲线段不会再切进卡片内部。
 */
function escapeWaypoint(dot: Point, box: FaceBox, exitDir: PortDirection): Point {
  switch (exitDir) {
    case "bottom": return { x: dot.x, y: box.y + box.height + ROUTE_CLEARANCE };
    case "top":    return { x: dot.x, y: box.y - ROUTE_CLEARANCE };
    case "right":  return { x: box.x + box.width + ROUTE_CLEARANCE, y: dot.y };
    case "left":   return { x: box.x - ROUTE_CLEARANCE, y: dot.y };
  }
}

function rectsIntersect(a: AxisRect, b: AxisRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** point 在 box 的哪一面外：按主导轴取朝向 point 的贴合面。 */
function faceTowards(point: Point, box: FaceBox): PortDirection {
  const c = rectCenter(box);
  const dx = point.x - c.x;
  const dy = point.y - c.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

/** 把一段段路线拼成完整路径与采样点；lane 偏移只作用于最后一段。 */
export function buildRouteChain(
  legs: readonly RouteLeg[],
  laneIndex = 0,
  totalLanes = 1,
): { path: string; samples: Point[] } {
  let path = "";
  const samples: Point[] = [];
  legs.forEach((leg, index) => {
    const isLast = index === legs.length - 1;
    // 跳过零长度连接段：交接点重合时 L 指令只会产生锯齿
    const zeroLength =
      index > 0 && Math.hypot(leg.from.x - legs[index - 1].to.x, leg.from.y - legs[index - 1].to.y) < 0.5;
    if (leg.straight) {
      const seg = `L${leg.to.x} ${leg.to.y}`;
      path = index === 0 ? `M${leg.from.x} ${leg.from.y} ${seg}` : `${path} L${leg.from.x} ${leg.from.y} ${seg}`;
      const count = 16;
      const legSamples: Point[] = [];
      for (let i = 0; i <= count; i++) {
        legSamples.push({
          x: leg.from.x + ((leg.to.x - leg.from.x) * i) / count,
          y: leg.from.y + ((leg.to.y - leg.from.y) * i) / count,
        });
      }
      samples.push(...(index === 0 ? legSamples : legSamples.slice(1)));
      return;
    }
    const bez = getBezierPath(
      leg.from,
      leg.to,
      leg.fromDir,
      leg.toDir,
      isLast && !zeroLength ? laneIndex : 0,
      isLast ? totalLanes : 1,
    );
    if (index === 0) {
      path = bez.path;
    } else if (zeroLength) {
      // 交接点与前段终点重合：直接续接曲线，不再插入 L 指令
      path += ` ${bez.path.slice(bez.path.indexOf("C"))}`;
    } else {
      path += ` L${leg.from.x} ${leg.from.y} ${bez.path.slice(bez.path.indexOf("C"))}`;
    }
    const legSamples = sampleBezierCurve(bez, ROUTE_SAMPLES);
    if (index === 0) samples.push(...legSamples);
    else samples.push(...legSamples.slice(1));
  });
  return { path, samples };
}

type RouteCandidate = {
  legs: RouteLeg[];
  kind: EdgeRouteKind;
  /** true：起点不在语义圆点上（对面贴合 / 绕行路线）。 */
  detached: boolean;
};

function generateCandidates(params: {
  sourceNode: NodeGeometry;
  targetNode: NodeGeometry;
  dot: Point;
  dotDir: PortDirection;
  targetAnchor: Point;
  baseTargetDir: PortDirection;
  oppositeSourceDir: PortDirection | null;
  spanBlockers: readonly NodeGeometry[];
}): RouteCandidate[] {
  const { sourceNode, targetNode, dot, dotDir, targetAnchor, baseTargetDir, oppositeSourceDir, spanBlockers } = params;
  const candidates: RouteCandidate[] = [];

  // 直连：圆点朝外 + 两个沿边方向
  candidates.push({
    legs: [{ from: dot, to: targetAnchor, fromDir: dotDir, toDir: baseTargetDir }],
    kind: "direct",
    detached: false,
  });
  for (const perp of perpendicularsOf(dotDir)) {
    candidates.push({
      legs: [{ from: dot, to: targetAnchor, fromDir: perp, toDir: baseTargetDir }],
      kind: "direct",
      detached: false,
    });
  }

  // 沿边绕角：两个沿边方向各一条（先直行越过圆角，再曲线进入目标）
  for (const perp of perpendicularsOf(dotDir)) {
    const wp = escapeWaypoint(dot, sourceNode, perp);
    candidates.push({
      legs: [
        { from: dot, to: wp, fromDir: perp, toDir: perp },
        { from: wp, to: targetAnchor, fromDir: perp, toDir: baseTargetDir },
      ],
      kind: "escape",
      detached: false,
    });
  }

  // 对面贴合（回边）：从两卡中心关系决定的源面投影出发，直线穿过间隙
  if (oppositeSourceDir && oppositeSourceDir !== dotDir) {
    const s = faceAnchor(sourceNode, oppositeSourceDir, dot);
    candidates.push({
      legs: [{ from: s, to: targetAnchor, fromDir: oppositeSourceDir, toDir: baseTargetDir }],
      kind: "opposite",
      detached: true,
    });
  }

  // 四面绕行：两端都改到对应面，整条线从卡片的该侧越过。
  // 上下覆盖水平回边，左右覆盖上下堆叠的退化布局。
  for (const side of ["top", "bottom", "left", "right"] as const) {
    const s = faceAnchor(sourceNode, side, rectCenter(targetNode));
    const t = faceAnchor(targetNode, side, rectCenter(sourceNode));
    candidates.push({
      legs: [{ from: s, to: t, fromDir: side, toDir: side }],
      kind: `lift-${side}` as EdgeRouteKind,
      detached: true,
    });
  }

  // 保底绕行（净空线肘形路线）：沿源卡边缘直行到全部相关卡片之上/之下的
  // 净空线，横移到目标锚点上方，再垂直进目标面。直线段构造上不穿卡，
  // 为密集布局下「其他候选全部无效」提供保证。
  for (const side of ["top", "bottom"] as const) {
    const spanCards = [sourceNode, targetNode, ...spanBlockers];
    const laneY =
      side === "top"
        ? Math.min(...spanCards.map((c) => c.y)) - ROUTE_CLEARANCE
        : Math.max(...spanCards.map((c) => c.y + c.height)) + ROUTE_CLEARANCE;
    const anchor = faceAnchor(targetNode, side, rectCenter(sourceNode));
    const legs: RouteLeg[] = [];
    const verticalFace = dotDir === "left" || dotDir === "right";
    if (verticalFace) {
      legs.push({
        from: dot,
        to: { x: dot.x, y: laneY },
        fromDir: laneY < dot.y ? "top" : "bottom",
        toDir: laneY < dot.y ? "top" : "bottom",
        straight: true,
      });
    } else {
      // 水平面上的圆点：先沿边横移到卡片外侧再纵向行进
      const sideX = anchor.x >= dot.x ? sourceNode.x + sourceNode.width + ROUTE_CLEARANCE : sourceNode.x - ROUTE_CLEARANCE;
      legs.push(
        {
          from: dot,
          to: { x: sideX, y: dot.y },
          fromDir: sideX > dot.x ? "right" : "left",
          toDir: sideX > dot.x ? "right" : "left",
          straight: true,
        },
        {
          from: { x: sideX, y: dot.y },
          to: { x: sideX, y: laneY },
          fromDir: laneY < dot.y ? "top" : "bottom",
          toDir: laneY < dot.y ? "top" : "bottom",
          straight: true,
        },
      );
    }
    legs.push(
      {
        from: legs[legs.length - 1].to,
        to: { x: anchor.x, y: laneY },
        fromDir: anchor.x > legs[legs.length - 1].to.x ? "right" : "left",
        toDir: anchor.x > legs[legs.length - 1].to.x ? "right" : "left",
        straight: true,
      },
      {
        from: { x: anchor.x, y: laneY },
        to: anchor,
        fromDir: side === "top" ? "bottom" : "top",
        toDir: side,
      },
    );
    candidates.push({ legs, kind: `detour-${side}` as EdgeRouteKind, detached: true });
  }

  return candidates;
}

function polylineLength(samples: readonly Point[]): number {
  let length = 0;
  for (let i = 1; i < samples.length; i++) {
    length += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
  }
  return length;
}

/**
 * 计算一条边的渲染路线（纯函数，edges.tsx 每帧调用）。
 *
 * params 见 generateCandidates / 本节头注释。分支来源（是/否）不参与候选竞争：
 * 端点固定在语义圆点上，方向为圆点朝外方向，目标面按相对位置选择。
 */
export function computeEdgeEndpoints(params: {
  sourceNode: NodeGeometry;
  targetNode: NodeGeometry;
  /** 参与不变式校验的其他卡片矩形（流程坐标）。 */
  otherRects: readonly AxisRect[];
  sourceHandleId?: string | null;
  sourceHandlePoint: Point;
  sourceHandleDir: PortDirection;
}): EdgeRouteGeometry {
  const { sourceNode, targetNode, otherRects, sourceHandleId, sourceHandlePoint, sourceHandleDir } = params;
  const dot = { x: sourceHandlePoint.x, y: sourceHandlePoint.y };

  // 目标面与锚点：按两卡中心关系独立判断（不被起点选择带偏）
  const ports = selectBestPorts(sourceNode, targetNode);
  const baseTargetDir = ports.targetDir;
  const targetAnchor = faceAnchor(targetNode, baseTargetDir, dot);

  if (BRANCH_HANDLE_IDS.has(sourceHandleId ?? "")) {
    // 是/否分支：语义优先 —— 只允许从语义圆点出发的候选（直连 + 沿边绕角），
    // 同样接受「线不穿卡」不变式校验；全部无效时退回直连。
    const targetDir = faceTowards(dot, targetNode);
    const end = faceAnchor(targetNode, targetDir, dot);
    const guards: AxisRect[] = [
      { left: sourceNode.x, top: sourceNode.y, right: sourceNode.x + sourceNode.width, bottom: sourceNode.y + sourceNode.height },
      { left: targetNode.x, top: targetNode.y, right: targetNode.x + targetNode.width, bottom: targetNode.y + targetNode.height },
      ...otherRects.filter((rect) =>
        rectsIntersect(rect, {
          left: Math.min(dot.x, end.x) - ROUTE_CLEARANCE * 2,
          right: Math.max(dot.x, end.x) + ROUTE_CLEARANCE * 2,
          top: Math.min(dot.y, end.y) - ROUTE_CLEARANCE * 2,
          bottom: Math.max(dot.y, end.y) + ROUTE_CLEARANCE * 2,
        }),
      ),
    ];
    const branchCandidates: RouteLeg[][] = [
      [{ from: dot, to: end, fromDir: sourceHandleDir, toDir: targetDir }],
    ];
    for (const perp of perpendicularsOf(sourceHandleDir)) {
      const wp = escapeWaypoint(dot, sourceNode, perp);
      branchCandidates.push([
        { from: dot, to: wp, fromDir: perp, toDir: perp },
        { from: wp, to: end, fromDir: perp, toDir: targetDir },
      ]);
    }
    let chosen: { legs: RouteLeg[]; path: string; samples: Point[] } | null = null;
    for (const legs of branchCandidates) {
      const { path, samples } = buildRouteChain(legs);
      const valid = !guards.some((rect) => {
        const left = rect.left + ROUTE_ENTER;
        const right = rect.right - ROUTE_ENTER;
        const top = rect.top + ROUTE_ENTER;
        const bottom = rect.bottom - ROUTE_ENTER;
        return left < right && top < bottom && samples.some((p) => p.x > left && p.x < right && p.y > top && p.y < bottom);
      });
      if (valid) {
        chosen = { legs, path, samples };
        break;
      }
    }
    const result = chosen ?? (() => {
      const { path, samples } = buildRouteChain(branchCandidates[0]);
      return { path, samples };
    })();
    return { path: result.path, samples: result.samples, start: dot, end, targetDir, legs: chosen ? chosen.legs.length : 1, kind: "branch" };
  }

  // 障碍预过滤：只保留与候选路线外包围盒相交的卡片，避免逐采样全量比对
  const span: AxisRect = {
    left: Math.min(dot.x, targetAnchor.x, sourceNode.x, targetNode.x) - ROUTE_CLEARANCE * 2,
    right: Math.max(dot.x, targetAnchor.x, sourceNode.x + sourceNode.width, targetNode.x + targetNode.width) + ROUTE_CLEARANCE * 2,
    top: Math.min(dot.y, targetAnchor.y, sourceNode.y, targetNode.y) - ROUTE_CLEARANCE * 2,
    bottom: Math.max(dot.y, targetAnchor.y, sourceNode.y + sourceNode.height, targetNode.y + targetNode.height) + ROUTE_CLEARANCE * 2,
  };
  const blockers = otherRects.filter((rect) => rectsIntersect(rect, span));
  const guards: AxisRect[] = [
    { left: sourceNode.x, top: sourceNode.y, right: sourceNode.x + sourceNode.width, bottom: sourceNode.y + sourceNode.height },
    { left: targetNode.x, top: targetNode.y, right: targetNode.x + targetNode.width, bottom: targetNode.y + targetNode.height },
    ...blockers,
  ];

  const candidates = generateCandidates({
    sourceNode,
    targetNode,
    dot,
    dotDir: sourceHandleDir,
    targetAnchor,
    baseTargetDir,
    oppositeSourceDir: ports.sourceDir,
    spanBlockers: blockers.map((rect, index) => ({
      id: `blk-${index}`,
      x: rect.left,
      y: rect.top,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
    })),
  });

  let best: { candidate: RouteCandidate; path: string; samples: Point[]; score: number } | null = null;
  // 全部候选都无效时的回退：优先选「穿卡最浅」的，其次才是短路径
  let bestInvalid: { candidate: RouteCandidate; path: string; samples: Point[]; score: number; depth: number } | null = null;
  for (const candidate of candidates) {
    const { path, samples } = buildRouteChain(candidate.legs);
    const score =
      polylineLength(samples) + candidate.legs.length * LEG_PENALTY + (candidate.detached ? DETACHED_PENALTY : 0);
    // 不变式：任一采样点侵入任一卡片内部即淘汰（含源/目标卡自身）
    let valid = true;
    let worstDepth = 0;
    for (const rect of guards) {
      for (const p of samples) {
        const depth = Math.min(p.x - rect.left, rect.right - p.x, p.y - rect.top, rect.bottom - p.y);
        if (depth > worstDepth) worstDepth = depth;
        if (depth > ROUTE_ENTER) {
          valid = false;
        }
      }
    }
    if (valid) {
      if (!best || score < best.score) best = { candidate, path, samples, score };
    } else if (!bestInvalid || worstDepth < bestInvalid.depth || (worstDepth === bestInvalid.depth && score < bestInvalid.score)) {
      bestInvalid = { candidate, path, samples, score, depth: worstDepth };
    }
  }

  const chosen = best ?? bestInvalid;
  if (!chosen) {
    const { path, samples } = buildRouteChain([
      { from: dot, to: targetAnchor, fromDir: sourceHandleDir, toDir: baseTargetDir },
    ]);
    return { path, samples, start: dot, end: targetAnchor, targetDir: baseTargetDir, legs: 1, kind: "direct" };
  }
  return {
    path: chosen.path,
    samples: chosen.samples,
    start: chosen.candidate.legs[0].from,
    end: targetAnchor,
    targetDir: baseTargetDir,
    legs: chosen.candidate.legs.length,
    kind: chosen.candidate.kind,
  };
}
