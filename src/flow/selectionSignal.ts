/**
 * 全局选中信号：给每条边一个 O(1) 的「选中了谁」查询。
 *
 * 选中状态只存在 React Flow 的 store 里，逐条边订阅 nodeLookup 再查 .selected
 * 会在每次 store 变化（含拖拽的每一帧）对所有边做 O(节点数) 的扫描。这里用
 * useOnSelectionChange（只在选中真正变化时回调一次）把选中的节点 / 边 id 发布到
 * 这个模块级小仓库，各边通过 useSyncExternalStore 订阅 version —— 拖拽零开销，
 * 选中变化时全部边各重渲染一次（淡化 / 光晕就是要在这一刻全体变脸）。
 */

type SelectionState = {
  nodes: ReadonlySet<string>;
  edges: ReadonlySet<string>;
  version: number;
};

const state: SelectionState = {
  nodes: new Set(),
  edges: new Set(),
  version: 0,
};

const listeners = new Set<() => void>();

function sameIds(prev: ReadonlySet<string>, next: readonly string[]): boolean {
  if (prev.size !== next.length) return false;
  return next.every((id) => prev.has(id));
}

/** 选中变化时发布（SelectionWatcher 调用；内容没变就免打扰）。 */
export function publishSelection(nodeIds: readonly string[], edgeIds: readonly string[]): void {
  if (sameIds(state.nodes, nodeIds) && sameIds(state.edges, edgeIds)) return;
  state.nodes = new Set(nodeIds);
  state.edges = new Set(edgeIds);
  state.version += 1;
  for (const listener of listeners) listener();
}

export function subscribeSelection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** useSyncExternalStore 的快照：version 变了才重渲染。 */
export function selectionVersion(): number {
  return state.version;
}

/** 画布上此刻有没有选中任何东西（节点或边）。 */
export function selectionActive(): boolean {
  return state.nodes.size > 0 || state.edges.size > 0;
}

/** 某个节点是否在选中集合里。 */
export function selectionHasNode(id: string): boolean {
  return state.nodes.has(id);
}
