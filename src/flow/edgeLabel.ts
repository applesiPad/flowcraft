export type EdgeLabelPoint = { x: number; y: number };
export type EdgeLabelSegment = "horizontal" | "vertical" | "diagonal";

/**
 * §8-4 stretch 连线标签原地编辑：提交净化（纯函数，Node 测试可直跑）。
 * trim（折叠连续空白）后为空视为放弃（回退原标题）；与原标题相同返回 null（跳过提交）；
 * 超长截断到 40 字符——连线标签是短触发文案，Inspector 输入框同样受此约束的体验预期。
 */
export function sanitizeEdgeLabelInput(raw: string, current: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!t || t === current) return null;
  return t;
}

export type EdgeLabelAnchor = {
  point: EdgeLabelPoint;
  distance: number;
  ratio: number;
  segment: EdgeLabelSegment;
};

type ChooseOptions = {
  target: EdgeLabelPoint;
  /** 同一目标有多条入线时，逐条沿路径后退，避免标签重叠 */
  laneOffset?: number;
  /** 标签中心与目标入口之间的期望距离（流程图坐标） */
  targetLead?: number;
};

function segmentLength(a: EdgeLabelPoint, b: EdgeLabelPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function polylineLength(points: EdgeLabelPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += segmentLength(points[i - 1], points[i]);
  return total;
}

/** 折线上按真实长度取点，避免点数分布不均时标签跳位 */
export function pointOnPolyline(points: EdgeLabelPoint[], ratio: number): EdgeLabelPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  const total = polylineLength(points);
  if (total <= Number.EPSILON) return points[0];

  let remaining = Math.min(1, Math.max(0, ratio)) * total;
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const length = segmentLength(from, to);
    if (remaining <= length || i === points.length - 1) {
      const amount = length <= Number.EPSILON ? 0 : Math.min(1, remaining / length);
      return {
        x: from.x + (to.x - from.x) * amount,
        y: from.y + (to.y - from.y) * amount,
      };
    }
    remaining -= length;
  }
  return points[points.length - 1];
}

function segmentAtDistance(points: EdgeLabelPoint[], distance: number): EdgeLabelSegment {
  let remaining = Math.max(0, distance);
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const length = segmentLength(from, to);
    if (remaining <= length) {
      const dx = Math.abs(to.x - from.x);
      const dy = Math.abs(to.y - from.y);
      if (dx <= 0.5) return "vertical";
      if (dy <= 0.5) return "horizontal";
      return "diagonal";
    }
    remaining -= length;
  }
  const from = points[Math.max(0, points.length - 2)] ?? points[0];
  const to = points[points.length - 1] ?? from;
  if (Math.abs(to.x - from.x) <= 0.5) return "vertical";
  if (Math.abs(to.y - from.y) <= 0.5) return "horizontal";
  return "diagonal";
}

/**
 * 标签放在路径后段、目标入口之前，而不是整条线的长度中点。
 *
 * 选取顺序：
 * 1. 优先贴着目标的最后一段线；
 * 2. 该段足够长时直接落在这里；太短则向外段后退；
 * 3. laneOffset 让同一目标的多个入线依次后退，减少堆叠。
 */
export function chooseEdgeLabelAnchor(points: EdgeLabelPoint[], options: ChooseOptions): EdgeLabelAnchor {
  const total = polylineLength(points);
  if (points.length < 2 || total <= Number.EPSILON) {
    return { point: points[0] ?? { x: 0, y: 0 }, distance: 0, ratio: 0, segment: "diagonal" };
  }

  const laneOffset = Math.max(0, Math.trunc(options.laneOffset ?? 0));
  const targetLead = Math.max(24, options.targetLead ?? 72);
  const minPillHalfLength = 26;
  const offset = laneOffset * 28;

  const segments: { start: number; end: number; length: number; segment: EdgeLabelSegment }[] = [];
  let traveled = 0;
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const length = segmentLength(from, to);
    if (length > 0) {
      const dx = Math.abs(to.x - from.x);
      const dy = Math.abs(to.y - from.y);
      segments.push({
        start: traveled,
        end: traveled + length,
        length,
        segment: dx <= 0.5 ? "vertical" : dy <= 0.5 ? "horizontal" : "diagonal",
      });
    }
    traveled += length;
  }

  // 先锁定目标入口前的直线段，而不是只看整条路径的百分比。
  // 回边/避障路径可能在目标右侧还有很长的入口线，百分比会把标签甩回通道中部。
  const last = segments[segments.length - 1];
  const idealDistance = Math.max(0, total - targetLead - offset);
  let distance = idealDistance;
  let segment = segmentAtDistance(points, idealDistance);

  // 末段通常就是进入目标入口的那一小截。优先锁在这一段上，
  // 但要允许 laneOffset 沿这条入线继续后退，而不是把多入线标签挤在同一个点。
  // 若末段是直入目标的水平入口，而它前面紧邻一段竖直入线，
  // 标签应优先落在竖直入线上；否则会贴在目标左侧卡片边缘，看起来像指错。
  const perpendicular = last
    ? segments
        .slice(0, -1)
        .reverse()
        .find((item) => item.segment !== "diagonal" && item.segment !== last.segment)
    : undefined;
  const entrySegment = last
    ? last.segment === "horizontal" && last.length <= minPillHalfLength * 2 && perpendicular && perpendicular.length >= minPillHalfLength
      ? perpendicular
      : last
    : undefined;

  if (entrySegment) {
    const minDistance = entrySegment.start + Math.min(minPillHalfLength, entrySegment.length / 2);
    const maxDistance = entrySegment.end - Math.min(10, entrySegment.length / 2);
    const laneShift = laneOffset * Math.min(44, Math.max(18, entrySegment.length * 0.35));
    distance = Math.max(minDistance, Math.min(maxDistance, idealDistance - laneShift));
    segment = entrySegment.segment;
  } else {
    // 末段是斜线时，退到前一个足够长的直线段，仍尽量接近目标。
    const fallback = [...segments]
      .reverse()
      .find((item) => item.end <= idealDistance && item.length >= minPillHalfLength * 2 && item.segment !== "diagonal");
    if (fallback) {
      const margin = Math.min(minPillHalfLength, fallback.length / 2);
      const laneShift = laneOffset * Math.min(40, Math.max(16, fallback.length * 0.25));
      distance = Math.max(fallback.start + margin, Math.min(fallback.end - 10, idealDistance - laneShift));
      segment = fallback.segment;
    }
  }

  // 末段足够长时也要给同一目标的后续入线留出纵向/横向错位。
  if (laneOffset > 0) {
    distance -= laneOffset * 34;
    distance = Math.max(0, distance);
  }

  if (!Number.isFinite(distance)) distance = total * 0.75;
  distance = Math.max(0, Math.min(total, distance));
  return {
    point: pointOnPolyline(points, distance / total),
    distance,
    ratio: distance / total,
    segment,
  };
}
export type EdgeLabelPeer = { id: string; target?: string | null; targetHandle?: string | null };
export type EdgeLabelSide = "left" | "right" | "top" | "bottom";
export type EdgeLabelAlign = "right-center" | "left-center" | "bottom-center" | "top-center";
export type EdgeLabelSize = { width: number; height: number };
export type EdgeLabelRect = { left: number; top: number; right: number; bottom: number };
export type EdgeLabelPlacement = {
  /** 卡片靠目标一侧的边缘锚点；卡片从这个边缘向外展开。 */
  x: number;
  y: number;
  /** 引导线起点，与卡片靠目标一侧的边缘重合。 */
  lineX: number;
  lineY: number;
  /** 本条边自己的路径锚点：引导线终点与锚点圆点画在这里，表达“标签属于这条线”。 */
  edgePoint: EdgeLabelPoint;
  side: EdgeLabelSide;
  cardAlign: EdgeLabelAlign;
};

export type PlaceEdgeLabelOptions = {
  size?: EdgeLabelSize;
  targetRect?: EdgeLabelRect;
  /** 同一目标的所有标签尺寸；整组一起选边，避免只有部分 lane 跳边。允许共享只读数组。 */
  peerSizes?: readonly EdgeLabelSize[];
  /** 同组整体向外退让的屏幕距离，用于避开覆盖目标的路径。 */
  outwardGap?: number;
  /** 画布内可见区域（流程图坐标）；标签列超出时优先换到另一侧。 */
  viewport?: EdgeLabelRect;
  /** 用于判断标签朝向的候选侧，按优先级排列。 */
  preferredSides?: EdgeLabelSide[];
  /** 其他节点的真实矩形；候选侧的整组标签不得压在它们上面。允许共享只读数组。 */
  avoidRects?: readonly EdgeLabelRect[];
};

const DEFAULT_LABEL_SIZE: EdgeLabelSize = { width: 160, height: 28 };

/**
 * 标签是两段式内容，DOM 宽度随文本变化；这里用保守估算做碰撞检测，
 * 避免等首帧测量后才发现压住卡片。最终屏幕宽度仍受 max-width 约束。
 */
export function estimateEdgeLabelSize(action: string, destination: string, zoom: number): EdgeLabelSize {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const textUnits = [...action].length * 11 + [...destination].length * 9 + 22;
  const width = Math.max(108, Math.min(260, textUnits + 38));
  return { width: Math.max(96, width / safeZoom), height: 28 / safeZoom };
}

/**
 * 同一目标的多个入线标签在卡片外侧排成一列。
 * x/y 是卡片靠目标一侧的边缘，而不是中心；卡片按 side 向外展开，
 * 所以文字再长也不会朝目标卡片里面长。引导线从卡片边缘出发落到入口。
 */
export function placeEdgeLabelGroup(
  point: EdgeLabelPoint,
  target: EdgeLabelPoint,
  targetPosition: EdgeLabelSide,
  lane: number,
  peers: number,
  zoom: number,
  options: PlaceEdgeLabelOptions = {},
): EdgeLabelPlacement {
  // point 只用于 edges.tsx 的引导线终点与锚点圆点；卡片位置统一堆叠避免重叠。
  void point;
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const size = options.size ?? DEFAULT_LABEL_SIZE;
  const cardHeight = Math.max(20, size.height);
  const laneGap = Math.max(34 / safeZoom, cardHeight + 7 / safeZoom);
  const targetGap = Math.max(12 / safeZoom, options.outwardGap ?? 18 / safeZoom);
  const laneCount = Math.max(1, Math.trunc(peers));
  const peerSizes = options.peerSizes?.length ? options.peerSizes : [size];
  const centered = lane - Math.max(0, laneCount - 1) / 2;
  const laneOffset = centered * laneGap;
  const targetLeft = options.targetRect?.left ?? target.x - targetGap;
  const targetRight = options.targetRect?.right ?? target.x + targetGap;
  const targetTop = options.targetRect?.top ?? target.y - targetGap;
  const targetBottom = options.targetRect?.bottom ?? target.y + targetGap;
  const viewport = options.viewport;
  const margin = 10 / safeZoom;


  /** 用整组标签的并集做碰撞判断，避免某一条 lane 单独换边后显得没有归属。 */
  const groupRect = (side: EdgeLabelSide): EdgeLabelRect => {
    const sizes = peerSizes.length === laneCount ? peerSizes : Array.from({ length: laneCount }, () => size);
    const maxWidth = Math.max(...sizes.map((item) => item.width));
    const firstHeight = Math.max(20, sizes[0]?.height ?? cardHeight);
    const totalHeight = laneGap * (laneCount - 1) + firstHeight;
    if (side === "left" || side === "right") {
      const x = side === "left" ? targetLeft - targetGap - maxWidth : targetRight + targetGap;
      return { left: x, top: target.y - totalHeight / 2, right: x + maxWidth, bottom: target.y + totalHeight / 2 };
    }
    const y = side === "top" ? targetTop - targetGap - laneGap * laneCount : targetBottom + targetGap;
    return {
      left: target.x - maxWidth / 2,
      top: y,
      right: target.x + maxWidth / 2,
      bottom: y + laneGap * laneCount,
    };
  };

  /** 一个候选侧的实际代价：越界面积 + 压住节点的面积。 */
  const overflowArea = (rect: EdgeLabelRect): number => {
    if (!viewport) return 0;
    const width = Math.max(0, rect.right - rect.left);
    const height = Math.max(0, rect.bottom - rect.top);
    const safeWidth = Math.max(0, Math.min(rect.right, viewport.right - margin) - Math.max(rect.left, viewport.left + margin));
    const safeHeight = Math.max(0, Math.min(rect.bottom, viewport.bottom - margin) - Math.max(rect.top, viewport.top + margin));
    return Math.max(0, width * height - safeWidth * safeHeight);
  };

  const occlusionArea = (rect: EdgeLabelRect): number => {
    let area = 0;
    for (const avoid of options.avoidRects ?? []) {
      const width = Math.max(0, Math.min(rect.right, avoid.right) - Math.max(rect.left, avoid.left));
      const height = Math.max(0, Math.min(rect.bottom, avoid.bottom) - Math.max(rect.top, avoid.top));
      area += width * height;
    }
    return area;
  };

  const score = (side: EdgeLabelSide, order: number): number => {
    const rect = groupRect(side);
    // 完全可行的候选先按用户偏好顺序选；没有完全可行项时，先避免遮挡，
    // 再比较越界面积，最后用候选顺序做稳定兜底。
    const overlap = occlusionArea(rect);
    const overflow = overflowArea(rect);
    return overlap * 1_000_000 + overflow + order * 0.001;
  };

  const preferredSides: EdgeLabelSide[] = options.preferredSides?.length
    ? options.preferredSides
    : [targetPosition, targetPosition === "left" ? "top" : targetPosition === "right" ? "bottom" : "left", targetPosition === "left" ? "bottom" : "right"];
  const allSides: EdgeLabelSide[] = ["left", "right", "top", "bottom"];
  const candidates = [...preferredSides, ...allSides.filter((candidate) => !preferredSides.includes(candidate))];
  const viable = candidates.find((candidate) => {
    const rect = groupRect(candidate);
    return overflowArea(rect) === 0 && occlusionArea(rect) === 0;
  });
  const side = viable ?? candidates.reduce((best, candidate, index) => {
    const bestIndex = candidates.indexOf(best);
    return score(candidate, index) < score(best, bestIndex) ? candidate : best;
  });

  if (side === "left" || side === "right") {
    // 卡片统一贴在目标同侧的边缘并按 lane 堆叠，保证多入线标签互不重叠；
    // 每条边自己的锚点由 edges.tsx 用 path point 单独画出引导线终点与圆点表达。
    const preferred = side === "left" ? targetLeft - targetGap : targetRight + targetGap;
    return {
      x: preferred,
      y: target.y + laneOffset,
      lineX: preferred,
      lineY: target.y + laneOffset,
      edgePoint: point,
      side,
      cardAlign: side === "left" ? "right-center" : "left-center",
    };
  }

  // 上方/下方是多行标签：lane 必须沿远离目标的方向堆叠，不能横着排。
  const baseY = side === "top" ? targetTop - targetGap : targetBottom + targetGap;
  const stackOffset = side === "top" ? -lane : lane;
  const preferred = baseY + stackOffset * laneGap;
  return {
    x: target.x,
    y: preferred,
    lineX: target.x,
    lineY: preferred,
    edgePoint: point,
    side,
    cardAlign: side === "top" ? "bottom-center" : "top-center",
  };
}
/** 同一目标/入口的多条边按稳定 id 排序，得到不随渲染顺序变化的 lane。 */
export type EdgeLabelLaneRef = {
  id: string;
  target?: string | null;
  targetHandle?: string | null;
};

export function edgeLaneIndex(
  edges: readonly EdgeLabelLaneRef[],
  edgeId: string,
  target: string | null | undefined,
  targetHandle: string | null | undefined,
): number {
  if (!target) return 0;
  const peers = edges
    .filter((edge) => edge.target === target && (edge.targetHandle ?? null) === (targetHandle ?? null))
    .map((edge) => edge.id)
    .sort((a, b) => a.localeCompare(b));
  const index = peers.indexOf(edgeId);
  return index < 0 ? 0 : index;
}

/** fit view 时字号会随画布缩小；标签反向缩放以保持屏幕可读。 */
export const MAX_EDGE_LABEL_SCALE = 3.2;

export function edgeLabelScale(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.max(1, Math.min(MAX_EDGE_LABEL_SCALE, 1 / zoom));
}

/** 零尺寸绝对锚点：标签不再参与普通文档流，也不会互相挤偏。 */
export function edgeLabelAnchorStyle(point: EdgeLabelPoint) {
  return {
    position: "absolute" as const,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    transform: `translate(${point.x}px, ${point.y}px)`,
    pointerEvents: "none" as const,
  };
}

/**
 * 卡片以靠目标一侧的边缘为锚点向外展开，并按 zoom 反向缩放。
 * transform-origin 必须与展开方向一致，否则缩放后边缘会再次侵入目标。
 */
export function edgeLabelCardStyle(zoom: number, side: EdgeLabelSide = "left") {
  const translation =
    side === "left" ? "translate(-100%, -50%)" :
    side === "right" ? "translate(0, -50%)" :
    side === "top" ? "translate(-50%, -100%)" :
    "translate(-50%, 0)";
  const origin = side === "left" ? "right center" : side === "right" ? "left center" : side === "top" ? "center bottom" : "center top";
  return {
    position: "absolute" as const,
    left: 0,
    top: 0,
    transform: `${translation} scale(${edgeLabelScale(zoom)})`,
    transformOrigin: origin,
  };
}


export type EdgeArrowPolygon = string;

/**
 * 生成一个从 start 指向 end 的实心三角形箭头（SVG polygon points）。
 * 主要用于两条视觉引导线：主连线的终点箭头、标签引导线落到边锚点的小箭头。
 * size 是箭头长度，箭头宽度约为长度的一半，保证长线和缩放下仍能看清方向。
 */
export function arrowHeadPoints(start: EdgeLabelPoint, end: EdgeLabelPoint, size: number): string {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= Number.EPSILON) return "";
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const safeSize = Math.max(0, size);
  const halfWidth = safeSize / 2;
  const baseX = end.x - ux * safeSize;
  const baseY = end.y - uy * safeSize;
  const leftX = baseX + px * halfWidth;
  const leftY = baseY + py * halfWidth;
  const rightX = baseX - px * halfWidth;
  const rightY = baseY - py * halfWidth;
  return `${end.x},${end.y} ${leftX},${leftY} ${rightX},${rightY}`;
}

/**
 * 生成 SVG marker 元素配置，用于 path 的 marker-end 属性。
 * 箭头为三角形，基准长 8px、宽 6px；scale 用于画布缩放补偿——
 * markerUnits="userSpaceOnUse" 下 marker 随画布缩放，fit view 时会缩小到不可见，
 * 调用方传入 1/zoom 让箭头在屏幕上保持恒定大小（与 non-scaling-stroke 的线宽同思路）。
 *
 * @param id - marker 的唯一标识符，用于 url(#id) 引用
 * @param color - 箭头填充颜色
 * @param scale - 尺寸缩放系数（默认 1 = 原始 8×6）
 */
export function createArrowMarker(
  id: string,
  color: string,
  scale = 1,
): {
  id: string;
  markerWidth: number;
  markerHeight: number;
  refX: number;
  refY: number;
  orient: "auto";
  path: string;
  color: string;
} {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const round2 = (v: number) => Math.round(v * 100) / 100;
  // 基准 6.5×4.5：与 2px 线宽成比例，补偿后大而不拙
  const ARROW_LENGTH = round2(6.5 * safeScale);
  const ARROW_WIDTH = round2(4.5 * safeScale);
  const halfWidth = round2(ARROW_WIDTH / 2);
  // 三角形 path：尖端在右侧中心
  const path = `M0,0 L${ARROW_LENGTH},${halfWidth} L0,${ARROW_WIDTH} Z`;
  return {
    id,
    markerWidth: ARROW_LENGTH,
    markerHeight: ARROW_WIDTH,
    refX: ARROW_LENGTH, // 尖端 x 坐标
    refY: halfWidth, // 尖端 y 坐标（垂直居中）
    orient: "auto",
    path,
    color,
  };
}
