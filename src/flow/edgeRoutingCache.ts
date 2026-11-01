import { smartEdgeRoute, type NodeGeometry, type Point } from "./edgeRouting.ts";

/** 默认缓存上限，避免大画布持续累积路由结果。 */
export const DEFAULT_EDGE_ROUTE_CACHE_SIZE = 2048;

export type EdgeRouteInput = {
  from: Point;
  to: Point;
  sourceId: string;
  targetId: string;
  /** 共享的只读节点几何：大图中所有边复用同一数组实例，键计算按实例记忆。 */
  nodeGeometries: readonly NodeGeometry[];
  excludeNodeIds: readonly string[];
  margin?: number;
};

export type EdgeRouteCacheOptions = {
  /** 最多保留的路由条数，必须是正整数。 */
  maxSize?: number;
};

export type EdgeRouteCacheStats = {
  hits: number;
  misses: number;
  evictions: number;
};

export type EdgeRouteCache = {
  readonly size: number;
  readonly maxSize: number;
  route(input: EdgeRouteInput): Point[];
  clear(): void;
  stats(): EdgeRouteCacheStats;
};

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function compareNodeGeometries(a: NodeGeometry, b: NodeGeometry): number {
  return (
    compareStrings(a.id, b.id) ||
    a.x - b.x ||
    a.y - b.y ||
    a.width - b.width ||
    a.height - b.height
  );
}

/**
 * 节点几何片段的排序+编码结果按数组实例记忆。
 * 大图里所有边共用同一份几何数组，因此 O(N log N) 的准备工作每次 store 更新只做一次，
 * 而不是每条边每帧各做一次；数组是只读的，实例不变即内容不变。
 */
const geometryStampCache = new WeakMap<readonly NodeGeometry[], string>();

function geometryStamp(nodeGeometries: readonly NodeGeometry[]): string {
  const cached = geometryStampCache.get(nodeGeometries);
  if (cached !== undefined) return cached;
  const stamp = JSON.stringify(
    [...nodeGeometries]
      .sort(compareNodeGeometries)
      .map(({ id, x, y, width, height }) => [id, x, y, width, height]),
  );
  geometryStampCache.set(nodeGeometries, stamp);
  return stamp;
}

/**
 * 生成稳定路由键。节点数组和排除 id 的顺序不影响语义，因此先规范化排序；
 * JSON 编码避免 id 中出现分隔符时产生键碰撞。
 */
export function createEdgeRouteCacheKey(input: EdgeRouteInput): string {
  const excludeNodeIds = [...new Set(input.excludeNodeIds)].sort(compareStrings);

  return [
    '"edge-route-v1"',
    input.from.x,
    input.from.y,
    input.to.x,
    input.to.y,
    JSON.stringify(input.sourceId),
    JSON.stringify(input.targetId),
    input.margin,
    JSON.stringify(excludeNodeIds),
    geometryStamp(input.nodeGeometries),
  ].join(",");
}

function clonePath(path: Point[]): Point[] {
  return path.map(({ x, y }) => ({ x, y }));
}

function resolveMaxSize(maxSize: number | undefined): number {
  const resolved = maxSize ?? DEFAULT_EDGE_ROUTE_CACHE_SIZE;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new RangeError("edge route cache maxSize must be a positive integer");
  }
  return resolved;
}

/** 创建有界 LRU 边路由缓存。 */
export function createEdgeRouteCache(options: EdgeRouteCacheOptions = {}): EdgeRouteCache {
  const maxSize = resolveMaxSize(options.maxSize);
  const entries = new Map<string, Point[]>();
  let hits = 0;
  let misses = 0;
  let evictions = 0;

  return {
    get size() {
      return entries.size;
    },
    get maxSize() {
      return maxSize;
    },
    route(input) {
      const key = createEdgeRouteCacheKey(input);
      const cached = entries.get(key);

      if (cached !== undefined) {
        hits += 1;
        // Map 保持插入顺序；删除再写入即可把命中项移动到 LRU 尾部。
        entries.delete(key);
        entries.set(key, cached);
        return clonePath(cached);
      }

      misses += 1;
      const path = smartEdgeRoute(
        input.from,
        input.to,
        input.nodeGeometries,
        input.excludeNodeIds,
        input.margin,
      );
      entries.set(key, path);

      if (entries.size > maxSize) {
        const oldest = entries.keys().next();
        if (!oldest.done) {
          entries.delete(oldest.value);
          evictions += 1;
        }
      }

      return clonePath(path);
    },
    clear() {
      entries.clear();
      hits = 0;
      misses = 0;
      evictions = 0;
    },
    stats() {
      return { hits, misses, evictions };
    },
  };
}

/** 供无状态调用方复用的进程内默认缓存。 */
export const defaultEdgeRouteCache = createEdgeRouteCache();

/** 便捷入口；需要独立统计或不同上限时传入 createEdgeRouteCache 创建的实例。 */
export function routeWithCache(
  input: EdgeRouteInput,
  cache: EdgeRouteCache = defaultEdgeRouteCache,
): Point[] {
  return cache.route(input);
}