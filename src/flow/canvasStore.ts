/**
 * 多画布存储：画布列表 / 活动画布 / 每画布数据的 localStorage 模型。
 *
 * 存储策略（迁移安全优先）：
 * - `flowcraft.flow.v1` 与 `flowcraft.annotations.v1` 仍然保存「当前活动画布」的数据，
 *   旧版本存档、自动保存逻辑、JSON 导入导出全部保持原样。
 * - 画布元数据存 `flowcraft.canvases.v1`，活动 id 存 `flowcraft.canvas.active.v1`，
 *   非活动画布的数据存 `flowcraft.canvas.data.<id>.v1`。
 * - 切换画布 = 归档当前数据到 data.<旧id> + 读入目标画布数据。
 * - 首次使用：无列表时把 legacy flow.v1 的现有内容登记为第一个画布（数据原地保留，零拷贝迁移）。
 *
 * 所有函数接受 Storage 接口（localStorage），Node 测试可直接用内存实现。
 */
import type { Annotation } from "./annotations.ts";
import type { Edge, Node } from "@xyflow/react";

export type CanvasMeta = { id: string; name: string; createdAt: number; updatedAt: number };

export type CanvasFlow = { nodes: Node[]; edges: Edge[]; annotations: Annotation[] };

export const CANVAS_LIST_KEY = "flowcraft.canvases.v1";
export const CANVAS_ACTIVE_KEY = "flowcraft.canvas.active.v1";
export const CANVAS_DATA_PREFIX = "flowcraft.canvas.data.";
/** 画布数量上限：防止 localStorage 被无限占满 */
export const MAX_CANVASES = 20;
/** 单画布快照上限（版本快照与画布共用同一护栏） */
export const MAX_CANVAS_NAME = 40;

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function readJson<T>(storage: StorageLike, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readCanvasList(storage: StorageLike): CanvasMeta[] {
  const raw = readJson<CanvasMeta[]>(storage, CANVAS_LIST_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter((c) => c && typeof c.id === "string" && typeof c.name === "string");
}

export function writeCanvasList(storage: StorageLike, list: CanvasMeta[]): void {
  storage.setItem(CANVAS_LIST_KEY, JSON.stringify(list));
}

export function readActiveCanvasId(storage: StorageLike): string | null {
  const id = storage.getItem(CANVAS_ACTIVE_KEY);
  return id && id.trim() ? id : null;
}

export function writeActiveCanvasId(storage: StorageLike, id: string): void {
  storage.setItem(CANVAS_ACTIVE_KEY, id);
}

export function readCanvasData(storage: StorageLike, id: string): CanvasFlow | null {
  const raw = readJson<CanvasFlow>(storage, CANVAS_DATA_PREFIX + id);
  if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null;
  return { nodes: raw.nodes, edges: raw.edges, annotations: Array.isArray(raw.annotations) ? raw.annotations : [] };
}

export function writeCanvasData(storage: StorageLike, id: string, flow: CanvasFlow): void {
  storage.setItem(CANVAS_DATA_PREFIX + id, JSON.stringify({ nodes: flow.nodes, edges: flow.edges, annotations: flow.annotations }));
}

export function removeCanvasData(storage: StorageLike, id: string): void {
  storage.removeItem(CANVAS_DATA_PREFIX + id);
}

export function sanitizeCanvasName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_CANVAS_NAME);
}

/** 列表内不重名：「画布 2」「画布 3」…或「xxx 副本」「xxx 副本 2」 */
export function uniqueCanvasName(list: CanvasMeta[], base: string): string {
  const names = new Set(list.map((c) => c.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

export function newCanvasMeta(name: string, id: string, now = Date.now()): CanvasMeta {
  return { id, name, createdAt: now, updatedAt: now };
}

/**
 * 启动时的登记/迁移入口：
 * - 已有列表 → 只校正 activeId（列表为空则取第一个）。
 * - 无列表 → legacy flow.v1 有节点则登记为「默认画布」（数据原地保留，仍由 flow.v1 承载）；
 *   否则登记一个空「默认画布」。返回初始 activeId。
 */
export function ensureCanvases(
  storage: StorageLike,
  legacyFlow: CanvasFlow | null,
  makeId: () => string,
  now = Date.now(),
): { list: CanvasMeta[]; activeId: string } {
  let list = readCanvasList(storage);
  if (list.length) {
    const stored = readActiveCanvasId(storage);
    const activeId = stored && list.some((c) => c.id === stored) ? stored : list[0].id;
    return { list, activeId };
  }
  const hasLegacy = Boolean(legacyFlow && legacyFlow.nodes.length);
  const meta = newCanvasMeta(hasLegacy ? "默认画布" : uniqueCanvasName([], "默认画布"), makeId(), now);
  list = [meta];
  writeCanvasList(storage, list);
  writeActiveCanvasId(storage, meta.id);
  return { list, activeId: meta.id };
}
