import type { EdgeLabelRect, EdgeLabelSize } from "./edgeLabel.ts";
import { estimateEdgeLabelSize } from "./edgeLabel.ts";
import type { NodeGeometry } from "./edgeRouting.ts";

/**
 * 画布每帧会为每条挂载中的边重算 lane / 标签尺寸 / 节点几何；
 * 边数 E、节点数 N 时这是 O(E×N) 的开销，拖拽 200 节点图会明显掉帧。
 *
 * 这里把与“单条边”无关的量提升到 zustand state 对象粒度：
 * zustand 每次 setState 都会产生新的 state 对象，而同一帧内所有边订阅的是
 * 同一个对象，因此 WeakMap 记忆可让整张图每帧只算一次（O(N + E log E)），
 * 之后所有边共享同一份数组/映射实例。
 */

type SnapshotNode = {
  id: string;
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
  internals?: { positionAbsolute?: { x: number; y: number } };
  data?: Record<string, unknown> | null;
};

type SnapshotEdge = {
  id: string;
  target?: string | null;
  targetHandle?: string | null;
  data?: Record<string, unknown> | null;
};

/**
 * 只声明派生缓存需要的字段，避免依赖 @xyflow 内部导出的完整状态类型。
 * nodeLookup 用方法语法的窄视图匹配 @xyflow 的 ReadableMap（它没有 Symbol.iterator）。
 */
type NodeMapView = {
  get(key: string): SnapshotNode | undefined;
  forEach(callback: (value: SnapshotNode, key: string) => void): void;
};

export type EdgeFlowStateSnapshot = {
  edges: readonly SnapshotEdge[];
  nodeLookup: NodeMapView;
  transform: readonly [number, number, number];
  width: number;
  height: number;
};

/** 同一 target + targetHandle 的全部入线：按 id 稳定排序后的 lane 顺序与标签尺寸。 */
export type EdgeLaneGroup = {
  /** 排序后的边 id；indexOf 即 laneIndex，未命中为 -1。 */
  ids: readonly string[];
  /** 与 ids 同序的估算尺寸，供 placeEdgeLabelGroup 整组选边。 */
  sizes: readonly EdgeLabelSize[];
};

export type DerivedEdgeFlowState = {
  zoom: number;
  /** 全部节点几何，store 更新时只重建一次；路由与避障共用同一实例。 */
  nodeGeometries: readonly NodeGeometry[];
  /** key = target + 分隔符 + targetHandle；空 target 不入表。 */
  laneGroups: Map<string, EdgeLaneGroup>;
  /** 可见区域矩形（流程图坐标），标签越界换边时使用。 */
  viewport: EdgeLabelRect;
  /** 按 target id 记忆“除该节点外的全部矩形”，避免每条边各自 filter+map。 */
  avoidRects(excludeNodeId: string | null | undefined): readonly EdgeLabelRect[];
};

const EMPTY_LANE_GROUP: EdgeLaneGroup = { ids: [], sizes: [] };
const LANE_KEY_SEPARATOR = "\u241F";
const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_NODE_HEIGHT = 160;
/** 与 viewport 计算里一致的屏幕内边距，避免标签贴住画布边缘。 */
const VIEWPORT_PADDING = 12;

function laneGroupKey(target: string, targetHandle: string | null | undefined): string {
  return `${target}${LANE_KEY_SEPARATOR}${targetHandle ?? ""}`;
}

function resolveZoom(scale: number): number {
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function nodeTitle(node: SnapshotNode | undefined): string {
  const title = node?.data?.title;
  return typeof title === "string" && title.trim() ? title.trim() : "";
}

function buildNodeGeometries(nodeLookup: NodeMapView): NodeGeometry[] {
  const geometries: NodeGeometry[] = [];
  nodeLookup.forEach((node) => {
    const x = node.internals?.positionAbsolute?.x ?? node.position.x;
    const y = node.internals?.positionAbsolute?.y ?? node.position.y;
    geometries.push({
      id: node.id,
      x,
      y,
      width: node.measured?.width ?? DEFAULT_NODE_WIDTH,
      height: node.measured?.height ?? DEFAULT_NODE_HEIGHT,
    });
  });
  return geometries;
}

/**
 * 与旧版逐条边的 peerInfo 等价：同一 target/targetHandle 的边按 id localeCompare 排序，
 * 尺寸用 estimateEdgeLabelSize(label, "→ " + targetTitle, zoom) 估算。
 */
function buildLaneGroups(
  edges: readonly SnapshotEdge[],
  nodeLookup: NodeMapView,
  zoom: number,
): Map<string, EdgeLaneGroup> {
  const groups = new Map<string, { ids: string[]; labels: string[] }>();
  for (const edge of edges) {
    if (!edge.target) continue;
    const key = laneGroupKey(edge.target, edge.targetHandle);
    let group = groups.get(key);
    if (!group) {
      group = { ids: [], labels: [] };
      groups.set(key, group);
    }
    group.ids.push(edge.id);
    group.labels.push(String(edge.data?.label ?? ""));
  }

  const laneGroups = new Map<string, EdgeLaneGroup>();
  for (const [key, group] of groups) {
    const order = group.ids.map((_id, index) => index).sort((a, b) => group.ids[a].localeCompare(group.ids[b]));
    const target = key.slice(0, key.indexOf(LANE_KEY_SEPARATOR));
    const destinationName = nodeTitle(nodeLookup.get(target));
    const destination = destinationName ? `→ ${destinationName}` : "→";
    laneGroups.set(key, {
      ids: order.map((index) => group.ids[index]),
      sizes: order.map((index) => estimateEdgeLabelSize(group.labels[index], destination, zoom)),
    });
  }
  return laneGroups;
}

function buildViewport(state: EdgeFlowStateSnapshot): EdgeLabelRect {
  const [tx, ty, scale] = state.transform;
  const safeScale = resolveZoom(scale);
  return {
    left: -tx / safeScale + VIEWPORT_PADDING / safeScale,
    top: -ty / safeScale + VIEWPORT_PADDING / safeScale,
    right: (state.width - tx) / safeScale - VIEWPORT_PADDING / safeScale,
    bottom: (state.height - ty) / safeScale - VIEWPORT_PADDING / safeScale,
  };
}

function buildDerivedState(state: EdgeFlowStateSnapshot): DerivedEdgeFlowState {
  const zoom = resolveZoom(state.transform[2]);
  const nodeGeometries = buildNodeGeometries(state.nodeLookup);
  const rectByNode: EdgeLabelRect[] = nodeGeometries.map((node) => ({
    left: node.x,
    top: node.y,
    right: node.x + node.width,
    bottom: node.y + node.height,
  }));
  const rectsCache = new Map<string, readonly EdgeLabelRect[]>();
  const allRects = rectByNode.slice();

  return {
    zoom,
    nodeGeometries,
    laneGroups: buildLaneGroups(state.edges, state.nodeLookup, zoom),
    viewport: buildViewport(state),
    avoidRects(excludeNodeId) {
      if (!excludeNodeId) return allRects;
      const cached = rectsCache.get(excludeNodeId);
      if (cached) return cached;
      const rects = rectByNode.filter((_, index) => nodeGeometries[index]?.id !== excludeNodeId);
      rectsCache.set(excludeNodeId, rects);
      return rects;
    },
  };
}

/**
 * 派生缓存：以 zustand state 对象为键。zustand 每次 setState 都产生新的 state 对象，
 * 同一帧内所有边因此共享同一份派生结果；节点被内部原地改写时总伴随 setState，
 * 缓存会随新 state 对象重建，不会读到过期几何。
 */
const derivedCache = new WeakMap<EdgeFlowStateSnapshot, DerivedEdgeFlowState>();

export function deriveEdgeFlowState(state: EdgeFlowStateSnapshot): DerivedEdgeFlowState {
  const cached = derivedCache.get(state);
  if (cached) return cached;
  const derived = buildDerivedState(state);
  derivedCache.set(state, derived);
  return derived;
}

/** useStore 选择器：返回本帧共享的派生状态。 */
export function selectDerivedEdgeFlowState(state: EdgeFlowStateSnapshot): DerivedEdgeFlowState {
  return deriveEdgeFlowState(state);
}

/** 取某条边的 lane 组；无 target 时返回空组，与旧版逐边计算结果一致。 */
export function laneGroupForEdge(
  derived: DerivedEdgeFlowState,
  target: string | null | undefined,
  targetHandle: string | null | undefined,
): EdgeLaneGroup {
  if (!target) return EMPTY_LANE_GROUP;
  return derived.laneGroups.get(laneGroupKey(target, targetHandle)) ?? EMPTY_LANE_GROUP;
}

/** lane 序号：不在组内（例如边刚被删除）时回退为 0，与 edgeLaneIndex 一致。 */
export function laneIndexOfEdge(group: EdgeLaneGroup, edgeId: string): number {
  const index = group.ids.indexOf(edgeId);
  return index < 0 ? 0 : index;
}
