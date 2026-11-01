import type { Node } from "@xyflow/react";
import type { NoteAnchor, NoteAnchorSide } from "./types";

export type NoteTargetGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const DEFAULT_NOTE_GAP = 24;
const LEGACY_PAYMENT_NOTE_ID = "note-1";
const LEGACY_PAYMENT_TARGET_ID = "n-pay";
const LEGACY_PAYMENT_GAP = 28;

export function noteAnchorFor(data: { anchor?: NoteAnchor }): {
  nodeId: string | null;
  side: NoteAnchorSide;
  gap: number;
} {
  const nodeId = typeof data.anchor?.nodeId === "string" && data.anchor.nodeId.trim()
    ? data.anchor.nodeId
    : null;
  const side = data.anchor?.side === "bottom" ? "bottom" : "right";
  const gap = typeof data.anchor?.gap === "number" && Number.isFinite(data.anchor.gap)
    ? Math.max(0, data.anchor.gap)
    : DEFAULT_NOTE_GAP;
  return { nodeId, side, gap };
}

/** 备注坐标只由目标几何与放置方向决定，目标移动后可直接重新计算。 */
export function anchorNotePosition(
  target: NoteTargetGeometry | null,
  side: NoteAnchorSide = "right",
  gap = DEFAULT_NOTE_GAP,
): { x: number; y: number } | null {
  if (!target) return null;
  if (![target.x, target.y, target.width, target.height].every(Number.isFinite)) return null;
  if (target.width <= 0 || target.height <= 0) return null;
  const safeGap = Math.max(0, Number.isFinite(gap) ? gap : DEFAULT_NOTE_GAP);
  return side === "bottom"
    ? { x: target.x, y: target.y + target.height + safeGap }
    : { x: target.x + target.width + safeGap, y: target.y + 20 };
}

function nodeSize(node: Node): { width: number; height: number } | null {
  const width = node.measured?.width ?? node.width ?? node.style?.width;
  const height = node.measured?.height ?? node.height ?? node.style?.height;
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) return null;
  if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) return null;
  return { width, height };
}

/** 只迁移已知的旧内置示例，不擅自给用户自己创建的备注补关联。 */
export function migrateLegacyNoteAnchors(nodes: Node[]): Node[] {
  const note = nodes.find((item) => item.id === LEGACY_PAYMENT_NOTE_ID && item.type === "note");
  if (!note) return nodes;
  const data = note.data as Record<string, unknown>;
  if (data.anchor !== undefined) return nodes;
  if (!nodes.some((item) => item.id === LEGACY_PAYMENT_TARGET_ID && item.type === "screen")) return nodes;
  return nodes.map((item) => item.id === note.id
    ? {
        ...item,
        data: {
          ...item.data,
          anchor: { nodeId: LEGACY_PAYMENT_TARGET_ID, side: "bottom", gap: LEGACY_PAYMENT_GAP },
        },
      }
    : item);
}

/** 关联备注的坐标由目标推导，并禁用自由拖动；无关联备注保持原样。 */
export function layoutAnchoredNotes(nodes: Node[]): Node[] {
  const targetById = new Map<string, Node>();
  nodes.forEach((item) => {
    if (item.type === "screen") targetById.set(item.id, item);
  });

  return nodes.map((item) => {
    if (item.type !== "note") return item;
    const anchor = noteAnchorFor(item.data as { anchor?: NoteAnchor });
    if (!anchor.nodeId) return item;
    const target = targetById.get(anchor.nodeId);
    const size = target ? nodeSize(target) : null;
    const position = target && size
      ? anchorNotePosition(
          { x: target.position.x, y: target.position.y, width: size.width, height: size.height },
          anchor.side,
          anchor.gap,
        )
      : null;
    if (!position) return item;
    return { ...item, position, draggable: false, selectable: true };
  });
}

/** 删除界面时连带删除锚定在它上面的备注；无主备注不会被误删。 */
export function cascadeDeleteNode(nodes: Node[], nodeId: string): Node[] {
  return nodes.filter((item) => {
    if (item.id === nodeId) return false;
    if (item.type !== "note") return true;
    const anchor = noteAnchorFor(item.data as { anchor?: NoteAnchor });
    return anchor.nodeId !== nodeId;
  });
}