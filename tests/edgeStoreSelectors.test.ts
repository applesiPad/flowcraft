import assert from "node:assert/strict";
import test from "node:test";
import { edgeLaneIndex, estimateEdgeLabelSize } from "../src/flow/edgeLabel.ts";
import type { NodeGeometry, Point } from "../src/flow/edgeRouting.ts";
import {
  deriveEdgeFlowState,
  laneGroupForEdge,
  laneIndexOfEdge,
  type EdgeFlowStateSnapshot,
} from "../src/flow/edgeStoreSelectors.ts";

type EdgeSeed = {
  id: string;
  target?: string | null;
  targetHandle?: string | null;
  label?: string;
};

type NodeSeed = {
  id: string;
  title?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

function makeState(
  nodeSeeds: NodeSeed[],
  edgeSeeds: EdgeSeed[],
  transform: [number, number, number] = [0, 0, 1],
): EdgeFlowStateSnapshot {
  const nodeLookup = new Map(
    nodeSeeds.map((node) => [
      node.id,
      {
        id: node.id,
        position: { x: node.x ?? 0, y: node.y ?? 0 },
        measured: { width: node.width, height: node.height },
        internals: { positionAbsolute: { x: node.x ?? 0, y: node.y ?? 0 } },
        data: { title: node.title },
      },
    ]),
  );
  const edges = edgeSeeds.map((edge) => ({
    id: edge.id,
    target: edge.target ?? null,
    targetHandle: edge.targetHandle ?? null,
    data: { label: edge.label },
  }));

  return {
    edges,
    nodeLookup,
    transform,
    width: 1200,
    height: 800,
  };
}

const ZOOM = 0.5;

test("lane 分组与逐边扫描的 edgeLaneIndex 结果一致", () => {
  const state = makeState(
    [{ id: "a", title: "首页" }, { id: "b", title: "详情" }],
    [
      { id: "e-3", target: "a", targetHandle: "t-top" },
      { id: "e-1", target: "a", targetHandle: "t-top" },
      { id: "e-2", target: "a", targetHandle: "t-bottom" },
      { id: "e-4", target: "b" },
      { id: "e-5", target: null },
    ],
  );
  const derived = deriveEdgeFlowState(state);
  const refs = state.edges.map((edge) => ({
    id: edge.id,
    target: edge.target,
    targetHandle: edge.targetHandle ?? null,
  }));

  for (const edge of refs) {
    const group = laneGroupForEdge(derived, edge.target, edge.targetHandle);
    assert.equal(
      laneIndexOfEdge(group, edge.id),
      edgeLaneIndex(refs, edge.id, edge.target, edge.targetHandle),
      `边 ${edge.id} 的 lane 应与逐边扫描一致`,
    );
  }

  // 同 target 但不同 handle 必须分属不同 lane 组
  assert.equal(laneIndexOfEdge(laneGroupForEdge(derived, "a", "t-top"), "e-1"), 0);
  assert.equal(laneIndexOfEdge(laneGroupForEdge(derived, "a", "t-top"), "e-3"), 1);
  assert.equal(laneIndexOfEdge(laneGroupForEdge(derived, "a", "t-bottom"), "e-2"), 0);
});

test("无 target 或组内查不到时回退为空组与 lane 0", () => {
  const derived = deriveEdgeFlowState(makeState([{ id: "a", title: "首页" }], [{ id: "e-1", target: "a" }]));

  assert.deepEqual(laneGroupForEdge(derived, null, null), { ids: [], sizes: [] });
  assert.equal(laneIndexOfEdge(laneGroupForEdge(derived, "a", null), "missing-edge"), 0);
  assert.equal(laneIndexOfEdge(laneGroupForEdge(derived, "ghost", null), "e-1"), 0);
});

test("peerSizes 与旧版逐边估算的标签尺寸一致", () => {
  const state = makeState(
    [{ id: "a", title: "购物车" }],
    [{ id: "e-1", target: "a", label: "领券" }, { id: "e-2", target: "a", label: "去结算并填写地址" }],
    [0, 0, ZOOM],
  );
  const group = laneGroupForEdge(deriveEdgeFlowState(state), "a", null);

  assert.deepEqual(group.ids, ["e-1", "e-2"]);
  assert.deepEqual(group.sizes, [
    estimateEdgeLabelSize("领券", "→ 购物车", ZOOM),
    estimateEdgeLabelSize("去结算并填写地址", "→ 购物车", ZOOM),
  ]);
});

test("目标节点没有标题时方向文案退化为单个箭头", () => {
  const state = makeState([{ id: "a", title: "   " }], [{ id: "e-1", target: "a", label: "提交" }], [0, 0, 2]);
  const group = laneGroupForEdge(deriveEdgeFlowState(state), "a", null);

  assert.deepEqual(group.sizes, [estimateEdgeLabelSize("提交", "→", 2)]);
});

test("节点几何取绝对定位与测量尺寸，缺省时回退 280×160", () => {
  const nodeLookup = new Map<string, never>([
    [
      "n1",
      {
        id: "n1",
        position: { x: 10, y: 20 },
        measured: { width: 320, height: 180 },
        internals: { positionAbsolute: { x: 100, y: 200 } },
      },
    ],
    ["n2", { id: "n2", position: { x: 5, y: 6 } }],
  ] as never);
  const derived = deriveEdgeFlowState({
    edges: [],
    nodeLookup,
    transform: [0, 0, 1],
    width: 800,
    height: 600,
  } as unknown as EdgeFlowStateSnapshot);

  assert.deepEqual(derived.nodeGeometries, [
    { id: "n1", x: 100, y: 200, width: 320, height: 180 },
    { id: "n2", x: 5, y: 6, width: 280, height: 160 },
  ]);
});

test("viewport 与旧版逐边公式一致，非法缩放回退为 1", () => {
  const derived = deriveEdgeFlowState(makeState([], [], [-200, -100, 2]));
  assert.deepEqual(derived.viewport, {
    left: 200 / 2 + 12 / 2,
    top: 100 / 2 + 12 / 2,
    right: (1200 + 200) / 2 - 12 / 2,
    bottom: (800 + 100) / 2 - 12 / 2,
  });

  const brokenZoom = deriveEdgeFlowState(makeState([], [], [0, 0, Number.NaN]));
  assert.equal(brokenZoom.zoom, 1);
  assert.deepEqual(brokenZoom.viewport, deriveEdgeFlowState(makeState([], [], [0, 0, 1])).viewport);
});

test("avoidRects 排除目标节点并按 id 记忆复用同一数组", () => {
  const derived = deriveEdgeFlowState(
    makeState([
      { id: "a", x: 0, y: 0, width: 100, height: 50 },
      { id: "b", x: 200, y: 0, width: 100, height: 50 },
    ], []),
  );
  const withoutA = derived.avoidRects("a");
  assert.equal(withoutA.length, 1);
  assert.deepEqual(withoutA[0], { left: 200, top: 0, right: 300, bottom: 50 });
  assert.equal(derived.avoidRects("a"), withoutA, "同一 target 应命中记忆");
  assert.equal(derived.avoidRects(null), derived.avoidRects(null), "无 target 时返回同一份全量矩形");
  assert.equal(derived.avoidRects(undefined).length, 2);
});

test("同一 state 对象命中缓存，新的 state 对象重新派生", () => {
  const state = makeState([{ id: "a", title: "首页" }], [{ id: "e-1", target: "a", label: "进入" }]);
  const first = deriveEdgeFlowState(state);
  assert.equal(deriveEdgeFlowState(state), first, "同一 store 对象必须复用派生结果");

  const moved: EdgeFlowStateSnapshot = {
    ...state,
    nodeLookup: new Map([
      [
        "a",
        {
          id: "a",
          position: { x: 400, y: 400 },
          measured: { width: 300, height: 200 },
          internals: { positionAbsolute: { x: 400, y: 400 } },
          data: { title: "首页" },
        },
      ],
    ]),
  };
  const second = deriveEdgeFlowState(moved);
  assert.notEqual(second, first);
  assert.deepEqual(second.nodeGeometries, [{ id: "a", x: 400, y: 400, width: 300, height: 200 }]);
});

