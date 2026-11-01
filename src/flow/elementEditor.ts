import type { ElementBox } from "./types";

/** 可拖拽的方位角：四角 + 四边 */
export type ResizeHandlePos = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/**
 * 界面卡片内容区（界面本地 px，坐标原点 = .fc-body 定位盒左上角）。
 * `.fc-screen` 是 `overflow: hidden`，越界元素与缩放把手会被裁掉且无法再操作，
 * 因此拖拽/缩放都要把盒子收进这个区域。
 * 自由布局的页面高度随内容增长，所以调用方可以把 bottom 设为 Infinity，
 * 只约束横向与顶部；固定视口（如导出/预览）才给出有限 bottom。
 */
export type ContainerRegion = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** 手机界面卡片内容区宽度：320px 卡片 - 左右 1px 边框 */
export const SCREEN_BODY_WIDTH = 318;

/** 无法实测容器时的默认内容区（界面本地 px；自由布局高度随内容增长，bottom 不封顶） */
export const DEFAULT_ELEMENT_REGION: ContainerRegion = {
  left: 0,
  top: 0,
  right: SCREEN_BODY_WIDTH,
  bottom: Number.POSITIVE_INFINITY,
};

/** 由卡片实测尺寸得到内容区（本地像素 = 屏幕像素 / 画布缩放） */
export function regionForContainer(widthPx: number, heightPx: number, zoom = 1, growableHeight = true): ContainerRegion {
  const z = zoom > 0 ? zoom : 1;
  return {
    left: 0,
    top: 0,
    right: Math.round((widthPx > 0 ? widthPx : SCREEN_BODY_WIDTH) / z),
    bottom: growableHeight ? Number.POSITIVE_INFINITY : Math.round(heightPx / z),
  };
}

/** 尽力把盒子收进区域：宽度放得下就完整包含，放不下就贴左缘（调用方已限制最大宽度） */
function clampAxis(pos: number, size: number, start: number, end: number): number {
  if (size >= end - start) return start;
  return Math.min(Math.max(pos, start), end - size);
}

/**
 * 拖动：尺寸不变，位置收进容器。
 * 容器装不下该宽度时贴左缘，保证至少不会出现「左右都看不见」。
 */
export function clampMoveBox(box: ElementBox, region: ContainerRegion): ElementBox {
  const out: ElementBox = {
    x: Math.round(clampAxis(box.x, box.w, region.left, region.right)),
    y: Math.round(clampAxis(box.y, box.h ?? 64, region.top, region.bottom)),
    w: box.w,
  };
  if (box.h !== undefined) out.h = box.h;
  return out;
}

/**
 * 缩放：在 resizeBox 的结果上再收进容器，禁止把边/角拉出可视区。
 * 语义是「边界停止」：被拖的一侧钳在容器缘线上，对侧边缘保持不动；
 * 剩余空间不足最小尺寸时，优先移动对侧而不是压缩到 0。
 */
export function clampResizeBox(next: ElementBox, region: ContainerRegion, opts: ResizeOptions = {}): ElementBox {
  const minW = opts.minWidth ?? DEFAULT_MIN_W;
  const minH = opts.minHeight ?? DEFAULT_MIN_H;

  let left = Math.max(next.x, region.left);
  let right = Math.min(next.x + next.w, region.right);
  if (right - left < minW) {
    if (next.x <= region.left) right = Math.min(region.left + minW, region.right);
    else left = Math.max(right - minW, region.left);
  }
  const w = Math.round(Math.max(minW, right - left));

  const hasH = next.h !== undefined;
  let top = next.y;
  let bottom = next.y + (next.h ?? 64);
  if (hasH) {
    top = Math.max(next.y, region.top);
    bottom = Math.min(next.y + (next.h as number), region.bottom);
    if (bottom - top < minH) {
      if (next.y <= region.top) bottom = region.top + minH;
      else top = Math.max(bottom - minH, region.top);
    }
  } else {
    top = Math.max(next.y, region.top);
  }

  const out: ElementBox = { x: Math.round(left), y: Math.round(top), w };
  if (hasH) out.h = Math.round(bottom - top);
  return out;
}

export type ResizeOptions = {
  minWidth?: number;
  minHeight?: number;
};

/** 对齐参考线检测输入：只需位置 + 尺寸 */
export type AlignGuideInput = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** 一条对齐参考线 */
export type AlignGuide = {
  coordinate: number;
  /** x=元素缘线，cx=移动框中心线 */
  axis: "x" | "cx";
};

export type AlignGuideSet = {
  vertical: AlignGuide[];
  horizontal: AlignGuide[];
};

export type SnapResult = {
  dx: number;
  dy: number;
  snappedX: boolean;
  snappedY: boolean;
};

const DEFAULT_MIN_W = 12;
const DEFAULT_MIN_H = 8;

/**
 * 按方位角拖拽缩放一个盒子。
 * dx / dy 是屏幕拖动增量换算到界面本地像素后的值。
 * 返回新对象，不修改原对象。
 */
export function resizeBox(
  box: ElementBox,
  handle: ResizeHandlePos,
  dx: number,
  dy: number,
  opts: ResizeOptions = {},
): ElementBox {
  const minW = opts.minWidth ?? DEFAULT_MIN_W;
  const minH = opts.minHeight ?? DEFAULT_MIN_H;
  const touchesW = handle.includes("w");
  const touchesE = handle.includes("e");
  const touchesN = handle.includes("n");
  const touchesS = handle.includes("s");

  let x = box.x;
  let y = box.y;
  let w = box.w;
  const hasH = box.h !== undefined;
  let h = box.h;

  if (touchesW) {
    // 新左缘 = 原左缘 + dx；不超过原右缘 - minW（保证宽度不小于 minW）
    const maxNewX = box.x + box.w - minW;
    const newX = Math.min(box.x + dx, maxNewX);
    // 最小不可小于原左缘的负方向延伸——盒可自由向左扩
    x = newX;
    w = box.x + box.w - x;
  } else if (touchesE) {
    w = Math.max(minW, box.w + dx);
  }

  if (hasH && touchesN) {
    const maxNewY = box.y + (box.h ?? 0) - minH;
    const newY = Math.min(box.y + dy, maxNewY);
    y = newY;
    h = box.y + (box.h ?? 0) - y;
  } else if (hasH && touchesS) {
    h = Math.max(minH, (box.h ?? 0) + dy);
  }

  const out: ElementBox = { x: Math.round(x), y: Math.round(y), w: Math.round(w) };
  if (hasH) out.h = Math.round(h as number);
  return out;
}

/**
 * 把拖拽增量吸附到最近的参考线（左右缘/中心、上下缘/中心）。
 * moving 是拖动**后**的盒子（含 delta），超容差不吸附。
 */
export function snapDelta(
  delta: { dx: number; dy: number },
  moving: AlignGuideInput,
  others: readonly AlignGuideInput[],
  tolerance = 6,
): SnapResult {
  let { dx, dy } = delta;
  let snappedX = false;
  let snappedY = false;

  // 候选目标：其它元素的左缘/右缘/中心 x、上缘/下缘/中心 y
  const targetXs: number[] = [];
  const targetYs: number[] = [];
  for (const o of others) {
    if (o === moving) continue;
    targetXs.push(o.x, o.x + o.w, o.x + o.w / 2);
    targetYs.push(o.y, o.y + o.h, o.y + o.h / 2);
  }

  const movingEdgesX = [moving.x, moving.x + moving.w, moving.x + moving.w / 2];
  const movingEdgesY = [moving.y, moving.y + moving.h, moving.y + moving.h / 2];

  let bestX: number | null = null;
  let bestXD = tolerance + 1;
  for (const tx of targetXs) {
    for (const mx of movingEdgesX) {
      const d = tx - mx;
      if (Math.abs(d) <= tolerance && Math.abs(d) < Math.abs(bestXD)) {
        bestXD = d;
        bestX = tx;
      }
    }
  }
  if (bestX !== null) {
    dx += bestXD;
    snappedX = true;
  }

  let bestY: number | null = null;
  let bestYD = tolerance + 1;
  for (const ty of targetYs) {
    for (const my of movingEdgesY) {
      const d = ty - my;
      if (Math.abs(d) <= tolerance && Math.abs(d) < Math.abs(bestYD)) {
        bestYD = d;
        bestY = ty;
      }
    }
  }
  if (bestY !== null) {
    dy += bestYD;
    snappedY = true;
  }

  return { dx, dy, snappedX, snappedY };
}

/**
 * 检测移动框与其它元素之间的对齐参考线（坐标精确相等视为对齐）。
 * 返回的参考线坐标为界面本地 px。
 */
export function detectAlignGuides(
  moving: AlignGuideInput,
  others: readonly AlignGuideInput[],
): AlignGuideSet {
  const vertical: AlignGuide[] = [];
  const horizontal: AlignGuide[] = [];

  const mcx = moving.x + moving.w / 2;
  const mcy = moving.y + moving.h / 2;

  for (const o of others) {
    if (o === moving) continue;
    const ocx = o.x + o.w / 2;
    const ocy = o.y + o.h / 2;
    if (near(o.x, moving.x) || near(o.x + o.w, moving.x + moving.w) || near(ocx, mcx)) {
      if (near(o.x, moving.x)) vertical.push({ coordinate: o.x, axis: "x" });
      if (near(o.x + o.w, moving.x + moving.w)) vertical.push({ coordinate: o.x + o.w, axis: "x" });
      if (near(ocx, mcx)) vertical.push({ coordinate: ocx, axis: "cx" });
    }
    if (near(o.y, moving.y) || near(o.y + o.h, moving.y + moving.h) || near(ocy, mcy)) {
      if (near(o.y, moving.y)) horizontal.push({ coordinate: o.y, axis: "x" });
      if (near(o.y + o.h, moving.y + moving.h)) horizontal.push({ coordinate: o.y + o.h, axis: "x" });
      if (near(ocy, mcy)) horizontal.push({ coordinate: ocy, axis: "cx" });
    }
  }

  return { vertical, horizontal };
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}
/** 层级调整动作：置顶 / 置底 / 上移一层 / 下移一层 */
export type ZOrderAction = "bring-to-front" | "send-to-back" | "bring-forward" | "send-backward";

/**
 * 按 DOM 渲染顺序调整元素层级（数组末尾渲染在最上层）。
 * 返回新数组，不修改原数组。找不到元素时返回原数组。
 */
export function moveElementZ<T extends { id: string }>(
  elements: readonly T[],
  elId: string,
  action: ZOrderAction,
): T[] {
  const idx = elements.findIndex((e) => e.id === elId);
  if (idx < 0) return [...elements];
  const out = [...elements];
  const [item] = out.splice(idx, 1);
  switch (action) {
    case "bring-to-front":
      out.push(item);
      break;
    case "send-to-back":
      out.unshift(item);
      break;
    case "bring-forward":
      out.splice(Math.min(out.length, idx + 1), 0, item);
      break;
    case "send-backward":
      out.splice(Math.max(0, idx - 1), 0, item);
      break;
  }
  return out;
}
