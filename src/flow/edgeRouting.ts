/**
 * 边路由算法：让连线绕开画布上的节点。
 *
 * 处理流程：
 * 1. 先用带安全边距的 AABB 检测直线是否穿过其它节点；
 * 2. 无碰撞时保留 React Flow 的平滑路由；
 * 3. 有碰撞时在节点边界组成的压缩网格上跑 A*，生成正交折线；
 * 4. 折线交给 edges.tsx 做圆角渲染。
 */

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

/** 节点的位置和尺寸信息（从 React Flow store 中提取） */
export type NodeGeometry = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Direction = 0 | 1 | 2; // 0 = 尚未移动，1 = 水平，2 = 垂直
type GridEdge = { to: number; direction: Direction; distance: number };
type QueueEntry = { state: number; score: number; cost: number };

const DEFAULT_MARGIN = 22;
const GEOMETRY_EPSILON = 0.01;
const TURN_PENALTY = 18;
const BALANCED_BACK_EDGE_MAX_HORIZONTAL_GAP = 80;
const BALANCED_BACK_EDGE_MAX_VERTICAL_GAP = 240;
const BALANCED_BACK_EDGE_MAX_LENGTH_RATIO = 1.75;
const HORIZONTAL: Direction = 1;
const VERTICAL: Direction = 2;

/** 从几何信息计算包围盒（含安全边距） */
export function getNodeBox(geom: NodeGeometry, margin = DEFAULT_MARGIN): Box {
  return {
    x: geom.x - margin,
    y: geom.y - margin,
    w: geom.width + margin * 2,
    h: geom.height + margin * 2,
  };
}

/** 线段是否与矩形相交 —— 参数化射线/AABB 检测 */
export function lineIntersectsBox(p1: Point, p2: Point, box: Box): boolean {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  let tMin = 0;
  let tMax = 1;

  if (Math.abs(dx) > GEOMETRY_EPSILON) {
    const t1 = (box.x - p1.x) / dx;
    const t2 = (box.x + box.w - p1.x) / dx;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    if (tMin > tMax) return false;
  } else if (p1.x < box.x || p1.x > box.x + box.w) {
    return false;
  }

  if (Math.abs(dy) > GEOMETRY_EPSILON) {
    const t1 = (box.y - p1.y) / dy;
    const t2 = (box.y + box.h - p1.y) / dy;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    if (tMin > tMax) return false;
  } else if (p1.y < box.y || p1.y > box.y + box.h) {
    return false;
  }

  return tMin <= tMax;
}

function shrinkBox(box: Box): Box {
  return {
    x: box.x + GEOMETRY_EPSILON,
    y: box.y + GEOMETRY_EPSILON,
    w: Math.max(0, box.w - GEOMETRY_EPSILON * 2),
    h: Math.max(0, box.h - GEOMETRY_EPSILON * 2),
  };
}

/** 判断一段水平/垂直线是否穿过矩形内部；贴在边界上不算穿过 */
function segmentCrossesInterior(a: Point, b: Point, box: Box): boolean {
  const inner = shrinkBox(box);
  if (inner.w <= 0 || inner.h <= 0) return false;
  return lineIntersectsBox(a, b, inner);
}

function pointIsInsideBox(point: Point, box: Box): boolean {
  return (
    point.x > box.x + GEOMETRY_EPSILON &&
    point.x < box.x + box.w - GEOMETRY_EPSILON &&
    point.y > box.y + GEOMETRY_EPSILON &&
    point.y < box.y + box.h - GEOMETRY_EPSILON
  );
}

function segmentIsClear(a: Point, b: Point, boxes: Box[]): boolean {
  return !boxes.some((box) => segmentCrossesInterior(a, b, box));
}

function uniqueSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const result: number[] = [];
  for (const value of sorted) {
    const last = result[result.length - 1];
    if (last === undefined || Math.abs(value - last) > GEOMETRY_EPSILON) result.push(value);
  }
  return result;
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) <= GEOMETRY_EPSILON && Math.abs(a.y - b.y) <= GEOMETRY_EPSILON;
}

function simplifyPath(points: Point[]): Point[] {
  const deduped: Point[] = [];
  for (const point of points) {
    if (!deduped.length || !samePoint(deduped[deduped.length - 1], point)) deduped.push(point);
  }

  const result: Point[] = [];
  for (const point of deduped) {
    while (result.length >= 2) {
      const a = result[result.length - 2];
      const b = result[result.length - 1];
      const sameX = Math.abs(a.x - b.x) <= GEOMETRY_EPSILON && Math.abs(b.x - point.x) <= GEOMETRY_EPSILON;
      const sameY = Math.abs(a.y - b.y) <= GEOMETRY_EPSILON && Math.abs(b.y - point.y) <= GEOMETRY_EPSILON;
      if (!sameX && !sameY) break;
      result.pop();
    }
    result.push(point);
  }
  return result;
}

/** 检测哪些节点会被直线路径穿过 */
export function detectCollisions(
  from: Point,
  to: Point,
  nodeGeometries: readonly NodeGeometry[],
  excludeNodeIds: readonly string[] = [],
  margin = DEFAULT_MARGIN,
): NodeGeometry[] {
  const excluded = new Set(excludeNodeIds);
  return nodeGeometries.filter(
    (geom) => !excluded.has(geom.id) && lineIntersectsBox(from, to, getNodeBox(geom, margin)),
  );
}

class MinHeap {
  private values: QueueEntry[] = [];

  get size(): number {
    return this.values.length;
  }

  push(value: QueueEntry): void {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent].score < value.score) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = value;
  }

  pop(): QueueEntry | undefined {
    const root = this.values[0];
    const tail = this.values.pop();
    if (!root || !tail || !this.values.length) return root;

    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.values.length) break;
      const child =
        right < this.values.length && this.values[right].score < this.values[left].score ? right : left;
      if (this.values[child].score >= tail.score) break;
      this.values[index] = this.values[child];
      index = child;
    }
    this.values[index] = tail;
    return root;
  }
}

function findNearestIndex(values: number[], target: number): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < values.length; i += 1) {
    const distance = Math.abs(values[i] - target);
    if (distance < bestDistance) {
      bestIndex = i;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

/**
 * 在压缩后的正交网格上寻找最短路径。
 * 候选 X/Y 坐标由起点、终点和所有障碍边界组成，因此不会漏掉绕角路径。
 */
function findOrthogonalRoute(from: Point, to: Point, boxes: Box[]): Point[] | null {
  if (samePoint(from, to)) return [from, to];

  const xs = uniqueSorted([from.x, to.x, ...boxes.flatMap((box) => [box.x, box.x + box.w])]);
  const ys = uniqueSorted([from.y, to.y, ...boxes.flatMap((box) => [box.y, box.y + box.h])]);
  const fromX = findNearestIndex(xs, from.x);
  const fromY = findNearestIndex(ys, from.y);
  const toX = findNearestIndex(xs, to.x);
  const toY = findNearestIndex(ys, to.y);

  const points: Point[] = [];
  const matrix: Array<Array<number | undefined>> = Array.from({ length: xs.length }, () =>
    Array<number | undefined>(ys.length),
  );

  for (let xi = 0; xi < xs.length; xi += 1) {
    for (let yi = 0; yi < ys.length; yi += 1) {
      const point = { x: xs[xi], y: ys[yi] };
      const isEndpoint = (xi === fromX && yi === fromY) || (xi === toX && yi === toY);
      if (!isEndpoint && boxes.some((box) => pointIsInsideBox(point, box))) continue;
      const index = points.length;
      points.push(point);
      matrix[xi][yi] = index;
    }
  }

  const startIndex = matrix[fromX][fromY];
  const goalIndex = matrix[toX][toY];
  if (startIndex === undefined || goalIndex === undefined) return null;

  const adjacency: GridEdge[][] = Array.from({ length: points.length }, () => []);

  const connect = (first: number | undefined, second: number | undefined, direction: Direction) => {
    if (first === undefined || second === undefined) return;
    const a = points[first];
    const b = points[second];
    if (!segmentIsClear(a, b, boxes)) return;
    const distance = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    adjacency[first].push({ to: second, direction, distance });
    adjacency[second].push({ to: first, direction, distance });
  };

  for (let xi = 0; xi < xs.length; xi += 1) {
    for (let yi = 0; yi < ys.length - 1; yi += 1) {
      connect(matrix[xi][yi], matrix[xi][yi + 1], VERTICAL);
    }
  }
  for (let yi = 0; yi < ys.length; yi += 1) {
    for (let xi = 0; xi < xs.length - 1; xi += 1) {
      connect(matrix[xi][yi], matrix[xi + 1][yi], HORIZONTAL);
    }
  }

  const stateCount = points.length * 3;
  const startState = startIndex * 3;
  const costs = new Float64Array(stateCount);
  costs.fill(Number.POSITIVE_INFINITY);
  const parents = new Int32Array(stateCount);
  parents.fill(-1);
  const closed = new Uint8Array(stateCount);
  const queue = new MinHeap();
  const heuristic = (point: Point) => Math.abs(point.x - to.x) + Math.abs(point.y - to.y);

  costs[startState] = 0;
  queue.push({ state: startState, score: heuristic(from), cost: 0 });

  let finalState = -1;
  while (queue.size) {
    const current = queue.pop();
    if (!current || closed[current.state]) continue;
    closed[current.state] = 1;

    const nodeIndex = Math.floor(current.state / 3);
    if (nodeIndex === goalIndex) {
      finalState = current.state;
      break;
    }

    const previousDirection = (current.state % 3) as Direction;
    for (const edge of adjacency[nodeIndex]) {
      const turnCost = previousDirection !== 0 && previousDirection !== edge.direction ? TURN_PENALTY : 0;
      const nextCost = current.cost + edge.distance + turnCost;
      const nextState = edge.to * 3 + edge.direction;
      if (nextCost + GEOMETRY_EPSILON >= costs[nextState]) continue;
      costs[nextState] = nextCost;
      parents[nextState] = current.state;
      queue.push({ state: nextState, score: nextCost + heuristic(points[edge.to]), cost: nextCost });
    }
  }

  if (finalState < 0) return null;

  const reversed: Point[] = [];
  let state = finalState;
  while (state >= 0) {
    const point = points[Math.floor(state / 3)];
    reversed.push({ x: point.x, y: point.y });
    state = parents[state];
  }
  reversed.reverse();
  return simplifyPath(reversed);
}

function pathLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  }
  return length;
}

/** 找不到正交路径时的保守兜底：围绕所有障碍的并集外框绕行 */
function findOuterDetour(from: Point, to: Point, boxes: Box[]): Point[] | null {
  if (!boxes.length) return [from, to];
  const left = Math.min(...boxes.map((box) => box.x)) - 24;
  const right = Math.max(...boxes.map((box) => box.x + box.w)) + 24;
  const top = Math.min(...boxes.map((box) => box.y)) - 24;
  const bottom = Math.max(...boxes.map((box) => box.y + box.h)) + 24;

  const candidates: Point[][] = [
    [from, { x: from.x, y: top }, { x: to.x, y: top }, to],
    [from, { x: from.x, y: bottom }, { x: to.x, y: bottom }, to],
    [from, { x: left, y: from.y }, { x: left, y: to.y }, to],
    [from, { x: right, y: from.y }, { x: right, y: to.y }, to],
  ];

  return (
    candidates
      .map(simplifyPath)
      .filter((candidate) =>
        candidate.every((point, index) => index === 0 || segmentIsClear(candidate[index - 1], point, boxes)),
      )
      .sort((a, b) => pathLength(a) - pathLength(b))[0] ?? null
  );
}

export type EdgeRouteMode = "auto" | "top" | "bottom";

/** 连线路由模式：auto 使用最短避障；top/bottom 是用户手动整理时的固定通道。 */
export function normalizeEdgeRouteMode(value: unknown): EdgeRouteMode {
  return value === "top" || value === "bottom" ? value : "auto";
}

function nearestNodeByEdge(point: Point, nodes: readonly NodeGeometry[], pickEdge: (geom: NodeGeometry) => number): NodeGeometry {
  let best = nodes[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    const distance = Math.abs(pickEdge(node) - point.x) + Math.abs(node.y + node.height / 2 - point.y);
    if (distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * 生成回边的手动通道。与旧版“全局最底部”不同，通道只贴着源/目标节点的上缘或下缘，
 * 并在外侧遇阻时逐级避让，保证用户手动整理时有可预测、可复现的操作空间。
 */
export function createBackEdgeLanePath(
  from: Point,
  to: Point,
  side: Extract<EdgeRouteMode, "top" | "bottom">,
  nodeGeometries: readonly NodeGeometry[],
  laneIndex = 0,
  margin = DEFAULT_MARGIN,
): Point[] {
  if (!nodeGeometries.length) return [from, to];

  // from 在源节点右侧，to 在目标节点左侧；用最近的右缘/左缘识别两个端点节点。
  const source = nearestNodeByEdge(from, nodeGeometries, (geom) => geom.x + geom.width);
  const target = nearestNodeByEdge(to, nodeGeometries, (geom) => geom.x);
  const obstacles = nodeGeometries.filter((node) => node.id !== source.id && node.id !== target.id);
  const boxes = obstacles.map((node) => getNodeBox(node, margin));
  const off = 20;
  const sourceTop = source.y;
  const targetTop = target.y;
  const sourceBottom = source.y + source.height;
  const targetBottom = target.y + target.height;
  const laneSpacing = 24 + laneIndex * 20;
  let fallback: Point[] = [from, to];

  for (let attempt = 0; attempt < 9; attempt += 1) {
    const outwardGap = 34 + attempt * 24 + laneSpacing;
    const laneY =
      side === "top"
        ? Math.min(sourceTop, targetTop) - outwardGap
        : Math.max(sourceBottom, targetBottom) + outwardGap;
    const candidate: Point[] = [
      from,
      { x: from.x + off, y: from.y },
      { x: from.x + off, y: laneY },
      { x: to.x - off, y: laneY },
      { x: to.x - off, y: to.y },
      to,
    ];
    const simplified = simplifyPath(candidate);
    fallback = simplified;
    const clear = simplified.every(
      (point, index) => index === 0 || segmentIsClear(simplified[index - 1], point, boxes),
    );
    if (clear) return simplified;
  }

  return fallback;
}
/**
 * 自动回边的平衡策略：
 * - 远距离回退继续用 A* 最短避障，避免旧版“绕到全局底部”的超长线；
 * - 同列/近列且上下相邻的短闭环改走局部下通道，把小回路和主流程分开，
 *   避免每条短线都从主流程中间穿过。
 */
export function createBalancedBackEdgePath(
  from: Point,
  to: Point,
  nodeGeometries: readonly NodeGeometry[],
  laneIndex = 0,
  margin = DEFAULT_MARGIN,
): Point[] | null {
  if (!nodeGeometries.length) return null;

  const source = nearestNodeByEdge(from, nodeGeometries, (geom) => geom.x + geom.width);
  const target = nearestNodeByEdge(to, nodeGeometries, (geom) => geom.x);
  if (!source || !target || source.id === target.id) return null;

  const horizontalGap =
    source.x > target.x + target.width
      ? source.x - (target.x + target.width)
      : target.x > source.x + source.width
        ? target.x - (source.x + source.width)
        : 0;
  const verticalGap =
    source.y > target.y + target.height
      ? source.y - (target.y + target.height)
      : target.y > source.y + source.height
        ? target.y - (source.y + source.height)
        : 0;

  if (
    horizontalGap > BALANCED_BACK_EDGE_MAX_HORIZONTAL_GAP ||
    verticalGap > BALANCED_BACK_EDGE_MAX_VERTICAL_GAP
  ) {
    return null;
  }

  const lane = createBackEdgeLanePath(from, to, "bottom", nodeGeometries, laneIndex, margin);
  const manhattan = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  if (!manhattan || pathLength(lane) > manhattan * BALANCED_BACK_EDGE_MAX_LENGTH_RATIO) return null;

  return lane;
}

/** 计算绕过节点的正交折线 */
export function routeAroundNodes(
  from: Point,
  to: Point,
  collisionNodes: readonly NodeGeometry[],
  margin = DEFAULT_MARGIN,
): Point[] {
  if (collisionNodes.length === 0) return [from, to];
  const boxes = collisionNodes.map((node) => getNodeBox(node, margin));
  return findOrthogonalRoute(from, to, boxes) ?? findOuterDetour(from, to, boxes) ?? [from, to];
}

/**
 * ComfyUI 风格贝塞尔曲线：水平出口 + 自然弯曲。
 * 控制点偏移量根据距离动态调整，使曲线流畅自然。
 */
export function bezierCurvePath(from: Point, to: Point): string {
  const dx = Math.abs(to.x - from.x);
  // 控制点偏移量：短距离用较小值，长距离按比例增大
  const offset = Math.max(60, Math.min(dx * 0.4, 300));
  const cp1x = from.x + offset;
  const cp1y = from.y;
  const cp2x = to.x - offset;
  const cp2y = to.y;
  return `M${from.x},${from.y} C${cp1x},${cp1y} ${cp2x},${cp2y} ${to.x},${to.y}`;
}

/**
 * 完整路由：检测所有障碍，并对穿过节点的直线生成避障路径。
 * 返回值长度为 2 表示无需绕行，edges.tsx 可继续使用自带平滑路由。
 */
export function smartEdgeRoute(
  from: Point,
  to: Point,
  nodeGeometries: readonly NodeGeometry[],
  excludeNodeIds: readonly string[],
  margin = DEFAULT_MARGIN,
): Point[] {
  const collisions = detectCollisions(from, to, nodeGeometries, excludeNodeIds, margin);
  if (!collisions.length) return [from, to];

  const excluded = new Set(excludeNodeIds);
  const obstacles = nodeGeometries.filter((geom) => !excluded.has(geom.id));
  const boxes = obstacles.map((node) => getNodeBox(node, margin));
  return findOrthogonalRoute(from, to, boxes) ?? findOuterDetour(from, to, boxes) ?? [from, to];
}




