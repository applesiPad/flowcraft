/**
 * 版本快照与对比：每画布一份快照列表（localStorage），以及两份流程的结构化 diff。
 *
 * - 快照：`flowcraft.snapshots.<canvasId>.v1`，最多 MAX_SNAPSHOTS 条（新进旧出）。
 * - diff：按节点/元素/连线 id 对齐，输出「新增/删除界面、改名、连线增删、界面内改动」，
 *   全部转成可读文案，UI 直接渲染。
 *
 * 纯函数、无 DOM 依赖，Node 测试可直接 import。
 */
import type { Edge, Node } from "@xyflow/react";
import type { CanvasFlow } from "./canvasStore.ts";
import { MAX_CANVAS_NAME } from "./canvasStore.ts";
import type { Annotation } from "./annotations.ts";
import type { ScreenData } from "./types.ts";

export type FlowSnapshot = {
  id: string;
  name: string;
  createdAt: number;
  /** true = 系统 自动拍摄（切换画布前 / 恢复前），false = 用户手动 */
  auto: boolean;
  data: CanvasFlow;
};

export const SNAPSHOT_PREFIX = "flowcraft.snapshots.";
export const MAX_SNAPSHOTS = 30;

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readSnapshots(storage: StorageLike, canvasId: string): FlowSnapshot[] {
  try {
    const raw = storage.getItem(SNAPSHOT_PREFIX + canvasId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FlowSnapshot[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => s && typeof s.id === "string" && s.data && Array.isArray(s.data.nodes));
  } catch {
    return [];
  }
}

export function writeSnapshots(storage: StorageLike, canvasId: string, list: FlowSnapshot[]): void {
  storage.setItem(SNAPSHOT_PREFIX + canvasId, JSON.stringify(list.slice(0, MAX_SNAPSHOTS)));
}

/** 新快照插到最前并裁剪到上限，返回裁剪时被挤出的快照（供 UI 提示，可为空） */
export function addSnapshot(storage: StorageLike, canvasId: string, snapshot: FlowSnapshot): FlowSnapshot[] {
  const list = [snapshot, ...readSnapshots(storage, canvasId)].slice(0, MAX_SNAPSHOTS);
  writeSnapshots(storage, canvasId, list);
  return list;
}

export function removeSnapshot(storage: StorageLike, canvasId: string, id: string): FlowSnapshot[] {
  const list = readSnapshots(storage, canvasId).filter((s) => s.id !== id);
  writeSnapshots(storage, canvasId, list);
  return list;
}

/** 重命名快照（时间线视图里的「改成业务可读的名字」）。空名视为取消。 */
export function renameSnapshot(storage: StorageLike, canvasId: string, id: string, rawName: string): FlowSnapshot[] {
  const name = rawName.replace(/\s+/g, " ").trim().slice(0, MAX_CANVAS_NAME);
  if (!name) return readSnapshots(storage, canvasId);
  const list = readSnapshots(storage, canvasId).map((s) => (s.id === id ? { ...s, name } : s));
  writeSnapshots(storage, canvasId, list);
  return list;
}

export type SnapshotDayGroup = { day: string; items: FlowSnapshot[] };

/** 按自然日分组（新→旧）：今天 / 昨天 / M月D日。列表内同样按时间倒序。 */
export function groupSnapshotsByDay(list: FlowSnapshot[], now = Date.now()): SnapshotDayGroup[] {
  const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
  const keyOf = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  const labelOf = (ms: number) => {
    const d = new Date(ms);
    const nowD = new Date(now);
    if (keyOf(ms) === keyOf(now)) return "今天";
    const yesterday = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate() - 1);
    if (d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate()) {
      return "昨天";
    }
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };
  const groups: SnapshotDayGroup[] = [];
  for (const snap of sorted) {
    const label = labelOf(snap.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === label) last.items.push(snap);
    else groups.push({ day: label, items: [snap] });
  }
  return groups;
}

/** 自动快照命名：同秒内多条也不会重名（带序号由调用方保证，这里只给默认名） */
export function autoSnapshotName(now = Date.now()): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `自动 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---------------- diff ----------------

export type ScreenContentChange = {
  nodeId: string;
  title: string;
  changes: string[];
};

export type FlowDiff = {
  screensAdded: string[];
  screensRemoved: string[];
  screensRenamed: { from: string; to: string }[];
  edgesAdded: string[];
  edgesRemoved: string[];
  contentChanged: ScreenContentChange[];
  annotationsChanged: number;
  /** true = 两份流程完全一致 */
  identical: boolean;
};

function titleOf(node: Node): string {
  return String((node.data as { title?: unknown })?.title ?? node.id);
}

function elementSignature(data: ScreenData): Map<string, string> {
  const map = new Map<string, string>();
  for (const el of data.elements ?? []) {
    const parts = [
      el.kind,
      el.label ?? el.placeholder ?? "",
      el.sublabel ?? "",
      el.hotspot ? "热点" : "",
      el.name ? `变量:${el.name}` : "",
      el.validation ? `校验:${el.validation}` : "",
    ].filter(Boolean);
    map.set(el.id, parts.join(" / "));
  }
  return map;
}

function describeEdge(nodes: Node[], edge: Edge): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const src = byId.get(edge.source);
  const dst = byId.get(edge.target);
  const label = (edge.data as { label?: string } | undefined)?.label ?? "";
  const handleSuffix = edge.sourceHandle && edge.sourceHandle !== "in" ? `·${edge.sourceHandle}` : "";
  return `${label ? `「${label}」` : ""}${src ? titleOf(src) : "?"}${handleSuffix} → ${dst ? titleOf(dst) : "?"}`;
}

export function diffFlows(base: CanvasFlow, target: CanvasFlow): FlowDiff {
  const baseNodes = new Map(base.nodes.map((n) => [n.id, n]));
  const targetNodes = new Map(target.nodes.map((n) => [n.id, n]));

  const screensAdded: string[] = [];
  const screensRemoved: string[] = [];
  const screensRenamed: { from: string; to: string }[] = [];
  const contentChanged: ScreenContentChange[] = [];

  for (const [id, node] of targetNodes) {
    const prev = baseNodes.get(id);
    if (!prev) {
      if (node.type === "screen") screensAdded.push(titleOf(node));
      continue;
    }
    if (node.type === "screen") {
      const before = titleOf(prev);
      const after = titleOf(node);
      const changes: string[] = [];
      if (before !== after) screensRenamed.push({ from: before, to: after });
      const a = elementSignature(prev.data as unknown as ScreenData);
      const b = elementSignature(node.data as unknown as ScreenData);
      const added = [...b.keys()].filter((k) => !a.has(k));
      const removed = [...a.keys()].filter((k) => !b.has(k));
      if (added.length) changes.push(`新增元素 ${added.length} 个`);
      if (removed.length) changes.push(`删除元素 ${removed.length} 个`);
      const edited = [...b.keys()].filter((k) => a.has(k) && a.get(k) !== b.get(k));
      if (edited.length) changes.push(`修改元素 ${edited.length} 个`);
      const aDecision = (prev.data as { condition?: unknown }).condition;
      const bDecision = (node.data as { condition?: unknown }).condition;
      if (JSON.stringify(aDecision ?? null) !== JSON.stringify(bDecision ?? null)) changes.push("条件已修改");
      if (changes.length) contentChanged.push({ nodeId: id, title: after, changes });
    }
    if (node.type === "decision") {
      const a = JSON.stringify((prev.data as { condition?: unknown }).condition ?? null);
      const b = JSON.stringify((node.data as { condition?: unknown }).condition ?? null);
      if (a !== b || titleOf(prev) !== titleOf(node)) {
        contentChanged.push({ nodeId: id, title: titleOf(node), changes: ["判断文案或条件已修改"] });
      }
    }
  }
  for (const [id, node] of baseNodes) {
    if (!targetNodes.has(id) && node.type === "screen") screensRemoved.push(titleOf(node));
  }

  const baseEdges = new Map(base.edges.map((e) => [e.id, e]));
  const targetEdges = new Map(target.edges.map((e) => [e.id, e]));
  const edgesAdded: string[] = [];
  const edgesRemoved: string[] = [];
  for (const [id, e] of targetEdges) {
    if (!baseEdges.has(id)) edgesAdded.push(describeEdge(target.nodes, e));
  }
  for (const [id, e] of baseEdges) {
    if (!targetEdges.has(id)) edgesRemoved.push(describeEdge(base.nodes, e));
  }

  const countAnnotations = (list: Annotation[]) => new Map(list.map((a) => [a.id, `${a.targetType}:${a.targetId}:${a.content}:${a.color}`]));
  const aAnn = countAnnotations(base.annotations ?? []);
  const bAnn = countAnnotations(target.annotations ?? []);
  let annotationsChanged = 0;
  for (const [id] of bAnn) if (!aAnn.has(id) || aAnn.get(id) !== bAnn.get(id)) annotationsChanged++;
  for (const [id] of aAnn) if (!bAnn.has(id)) annotationsChanged++;

  const identical =
    !screensAdded.length &&
    !screensRemoved.length &&
    !screensRenamed.length &&
    !edgesAdded.length &&
    !edgesRemoved.length &&
    !contentChanged.length &&
    annotationsChanged === 0;

  return { screensAdded, screensRemoved, screensRenamed, edgesAdded, edgesRemoved, contentChanged, annotationsChanged, identical };
}
