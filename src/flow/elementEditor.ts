import type { ElementBox } from "./types";

/** 可拖拽的方位角：四角 + 四边 */
export type ResizeHandlePos = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

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
