import type { Edge, Node } from "@xyflow/react";

type Identified = { id: string };

export type FlowHistoryChange<T> = {
  id: string;
  undoValue?: T;
  redoValue?: T;
};

export type FlowHistoryEntry = {
  key?: string;
  nodes: FlowHistoryChange<Node>[];
  edges: FlowHistoryChange<Edge>[];
};

export type FlowHistoryDirection = "undo" | "redo";

function diffCollection<T extends Identified>(before: T[], after: T[]): FlowHistoryChange<T>[] {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterById = new Map(after.map((item) => [item.id, item]));
  const changes: FlowHistoryChange<T>[] = [];

  for (const item of before) {
    const next = afterById.get(item.id);
    if (!next) {
      changes.push({ id: item.id, undoValue: item, redoValue: undefined });
    } else if (next !== item) {
      changes.push({ id: item.id, undoValue: item, redoValue: next });
    }
  }

  for (const item of after) {
    if (!beforeById.has(item.id)) {
      changes.push({ id: item.id, undoValue: undefined, redoValue: item });
    }
  }

  return changes;
}

/** 只记录发生变化的节点 / 边；未变化对象继续通过引用共享，避免整图深拷贝。 */
export function diffFlowHistory(
  beforeNodes: Node[],
  beforeEdges: Edge[],
  afterNodes: Node[],
  afterEdges: Edge[],
  key?: string,
): FlowHistoryEntry | null {
  const nodes = diffCollection(beforeNodes, afterNodes);
  const edges = diffCollection(beforeEdges, afterEdges);
  if (!nodes.length && !edges.length) return null;
  return { key, nodes, edges };
}

function applyCollection<T extends Identified>(items: T[], changes: FlowHistoryChange<T>[], direction: FlowHistoryDirection): T[] {
  if (!changes.length) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const change of changes) {
    const value = direction === "undo" ? change.undoValue : change.redoValue;
    if (value === undefined) byId.delete(change.id);
    else byId.set(change.id, value);
  }
  return [...byId.values()];
}

export function applyFlowHistory(
  entry: FlowHistoryEntry,
  direction: FlowHistoryDirection,
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: applyCollection(nodes, entry.nodes, direction),
    edges: applyCollection(edges, entry.edges, direction),
  };
}

function refreshCollection<T extends Identified>(
  changes: FlowHistoryChange<T>[],
  direction: FlowHistoryDirection,
  items: T[],
): FlowHistoryChange<T>[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return changes.map((change) => ({
    ...change,
    [direction === "undo" ? "undoValue" : "redoValue"]: byId.get(change.id),
  }));
}

/** 撤销 / 重做前，把当前真实状态写回反向侧，保证连续输入和连续拖拽能回到最终状态。 */
export function refreshFlowHistoryEntry(
  entry: FlowHistoryEntry,
  direction: "undoValue" | "redoValue",
  nodes: Node[],
  edges: Edge[],
): FlowHistoryEntry {
  const side: FlowHistoryDirection = direction === "undoValue" ? "undo" : "redo";
  return {
    key: entry.key,
    nodes: refreshCollection(entry.nodes, side, nodes),
    edges: refreshCollection(entry.edges, side, edges),
  };
}

export function countFlowHistoryRecords(entries: FlowHistoryEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.nodes.length + entry.edges.length, 0);
}

/** 双上限：限制条目数，也限制变更记录总量；单条过大的操作仍保留，保证可撤销。 */
export function trimFlowHistory(entries: FlowHistoryEntry[], maxEntries = 160, maxRecords = 2400): FlowHistoryEntry[] {
  const next = entries.slice(-maxEntries);
  let records = countFlowHistoryRecords(next);
  while (next.length > 1 && records > maxRecords) {
    records -= next[0].nodes.length + next[0].edges.length;
    next.shift();
  }
  return next;
}
