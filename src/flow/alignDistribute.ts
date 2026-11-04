/**
 * §8-5 多选对齐 / 等距分布（纯几何，无 DOM，Node 测试可直跑）。
 *
 * 与 Figma 语义一致：
 * - 对齐：以选中集合的包围盒为参照（不是画布），每轴取 min/max/center；
 * - 等距分布：排序后要求 ≥3 个对象；首尾不动，中间对象移到等距槽位
 *   （等距 = 相邻间隙相等，对象自身宽度保留）；
 * - 全部输出「坐标补丁」，由调用方一次性 setNodes（一条撤销记录）。
 */

export type AlignBox = { id: string; x: number; y: number; w: number; h: number };

export type AlignMode =
  | "left"
  | "hcenter"
  | "right"
  | "top"
  | "vcenter"
  | "bottom";
export type DistributeMode = "hdist" | "vdist";

export type AlignAction = AlignMode | DistributeMode;

/** 对齐/分布后每个对象的新坐标（未涉及轴保持原值，由调用方合并） */
export type MovePatch = { id: string; x: number; y: number };

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** 对齐：返回坐标补丁（无变化的对象不出现在结果里） */
export function alignBoxes(boxes: readonly AlignBox[], mode: AlignMode): MovePatch[] {
  if (boxes.length < 2) return [];
  const minX = Math.min(...boxes.map((b) => b.x));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

  return boxes
    .map((b) => {
      let x = b.x;
      let y = b.y;
      switch (mode) {
        case "left":
          x = minX;
          break;
        case "right":
          x = maxX - b.w;
          break;
        case "hcenter":
          x = cx - b.w / 2;
          break;
        case "top":
          y = minY;
          break;
        case "bottom":
          y = maxY - b.h;
          break;
        case "vcenter":
          y = cy - b.h / 2;
          break;
      }
      return { id: b.id, x: Math.round(x), y: Math.round(y) };
    })
    .filter((p, i) => {
      const b = boxes[i]!;
      return !near(p.x, b.x) || !near(p.y, b.y);
    });
}

/**
 * 等距分布：<3 个对象无意义返回 []；其余按轴排序，首尾贴边不动，
 * 中间对象落在「等间隙」槽位（间隙 = (总跨度 - 总宽) / (n - 1)）。
 */
export function distributeBoxes(boxes: readonly AlignBox[], mode: DistributeMode): MovePatch[] {
  if (boxes.length < 3) return [];
  const horiz = mode === "hdist";
  const sorted = [...boxes].sort((a, b) => (horiz ? a.x - b.x : a.y - b.y));
  const sizes = sorted.map((b) => (horiz ? b.w : b.h));
  const totalSize = sum(sizes);
  const span = horiz ? sorted[sorted.length - 1]!.x + sorted[sorted.length - 1]!.w - sorted[0]!.x : sorted[sorted.length - 1]!.y + sorted[sorted.length - 1]!.h - sorted[0]!.y;
  const gap = (span - totalSize) / (sorted.length - 1);

  const patches: MovePatch[] = [];
  let cursor = horiz ? sorted[0]!.x : sorted[0]!.y;
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i]!;
    const target = Math.round(cursor);
    if (horiz) {
      if (Math.abs(target - b.x) >= 0.01) patches.push({ id: b.id, x: target, y: b.y });
    } else if (Math.abs(target - b.y) >= 0.01) {
      patches.push({ id: b.id, x: b.x, y: target });
    }
    cursor += (horiz ? b.w : b.h) + gap;
  }
  return patches;
}

export function applyAlignAction(boxes: readonly AlignBox[], action: AlignAction): MovePatch[] {
  if (action === "hdist" || action === "vdist") return distributeBoxes(boxes, action);
  return alignBoxes(boxes, action);
}
