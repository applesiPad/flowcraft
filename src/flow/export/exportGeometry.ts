import type { Node } from "@xyflow/react";

export type NodeSize = { width: number; height: number };

const FALLBACK_SIZES: Record<string, NodeSize> = {
  screen: { width: 320, height: 650 },
  decision: { width: 190, height: 96 },
  action: { width: 230, height: 74 },
  note: { width: 250, height: 150 },
};

/** 读取已测量尺寸；尚未测量的节点使用按类型给出的保守尺寸。 */
export function resolveNodeSize(node: Node): NodeSize {
  const measured = node.measured;
  const width = measured?.width ?? node.width ?? node.style?.width;
  const height = measured?.height ?? node.height ?? node.style?.height;
  return {
    width: typeof width === "number" && Number.isFinite(width) && width > 0
      ? width
      : FALLBACK_SIZES[node.type ?? ""]?.width ?? 220,
    height: typeof height === "number" && Number.isFinite(height) && height > 0
      ? height
      : FALLBACK_SIZES[node.type ?? ""]?.height ?? 120,
  };
}

/** 计算包含全部节点的画布包围盒，留出固定外扩空间。 */
export function getExportBounds(nodes: Node[], padding = 64) {
  if (!nodes.length) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    const size = resolveNodeSize(node);
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + size.width);
    maxY = Math.max(maxY, node.position.y + size.height);
  }

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

/** 导出时把节点尺寸补进副本，避免 React Flow 尚未测量导致裁切。 */
export function prepareNodesForExport(nodes: Node[]): Node[] {
  return nodes.map((node) => {
    const size = resolveNodeSize(node);
    return {
      ...node,
      width: size.width,
      height: size.height,
      style: { ...node.style, width: size.width },
    };
  });
}
