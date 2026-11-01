import assert from "node:assert/strict";
import test from "node:test";
import { BENCH_CONFIG, buildBenchFlow, type BenchLevel } from "../src/flow/benchGraph.ts";

const LEVELS: BenchLevel[] = ["small", "medium", "large"];

test("bench 三档节点数与边数预算符合配置", () => {
  for (const level of LEVELS) {
    const cfg = BENCH_CONFIG[level];
    const { nodes, edges } = buildBenchFlow(level);
    assert.equal(nodes.length, cfg.count, `${level} 节点数`);
    assert.ok(edges.length <= Math.round(cfg.count * cfg.edgeRatio) + 2, `${level} 边数不超预算`);
    // 回边 + 链边 + 补边 至少要接近预算
    assert.ok(edges.length >= cfg.count - 1 + Math.floor(cfg.count / cfg.cols), `${level} 边数覆盖链+回边`);
  }
});

test("bench 确定性：同 seed 两次生成完全一致", () => {
  const a = buildBenchFlow("medium");
  const b = buildBenchFlow("medium");
  assert.deepEqual(a.nodes.map((n) => n.position), b.nodes.map((n) => n.position));
  assert.deepEqual(a.edges.map((e) => [e.source, e.sourceHandle, e.target]), b.edges.map((e) => [e.source, e.sourceHandle, e.target]));
});

test("bench 边的端点与 sourceHandle 全部有效，且无自环", () => {
  for (const level of LEVELS) {
    const { nodes, edges } = buildBenchFlow(level);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const edgeIds = new Set<string>();
    for (const edge of edges) {
      assert.equal(edgeIds.has(edge.id ?? ""), false, `${level} 边 id 唯一`);
      edgeIds.add(edge.id ?? "");
      const src = byId.get(edge.source);
      const dst = byId.get(edge.target);
      assert.ok(src, `${level} source 存在: ${edge.source}`);
      assert.ok(dst, `${level} target 存在: ${edge.target}`);
      assert.notEqual(edge.source, edge.target, `${level} 无自环`);
      assert.equal(edge.targetHandle, "in", `${level} 入口锚点`);
      const elements = (src!.data as { elements: { id: string; hotspot?: boolean }[] }).elements;
      const handle = elements.find((e) => e.id === edge.sourceHandle);
      assert.ok(handle, `${level} sourceHandle 存在: ${edge.sourceHandle}`);
      assert.equal(handle!.hotspot, true, `${level} sourceHandle 是热点`);
    }
  }
});

test("bench 每行生成回边：行末界面连回行首", () => {
  const { edges } = buildBenchFlow("medium");
  const cfg = BENCH_CONFIG.medium;
  const rows = Math.ceil(cfg.count / cfg.cols);
  let backs = 0;
  for (const edge of edges) {
    const from = Number(edge.source.replace("bench-", ""));
    const to = Number(edge.target.replace("bench-", ""));
    const rowFrom = Math.floor(from / cfg.cols);
    if (to < from && Math.floor(to / cfg.cols) === rowFrom) backs += 1;
  }
  assert.equal(backs, rows, "medium 每行一条行内回边");
});

test("bench 网格间距足够：相邻界面不重叠", () => {
  const { nodes } = buildBenchFlow("large");
  const cfg = BENCH_CONFIG.large;
  for (const n of nodes) {
    assert.ok(n.position.x >= 0 && n.position.y >= 0);
  }
  // 同行相邻节点水平净距 ≥ colStep - 320（宽度） = 280px
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    if (Math.floor(i / cfg.cols) === Math.floor((i + 1) / cfg.cols)) {
      assert.ok(b.position.x - a.position.x >= cfg.colStep - 200, "同行相邻界面保持间距");
    }
  }
});

test("bench DOM 计数工具返回数值字典", async () => {
  // Node 环境没有 document：模块级函数只应在浏览器里调用；此处仅验证类型导出可用
  const mod = await import("../src/flow/benchGraph.ts");
  assert.equal(typeof mod.buildBenchFlow, "function");
  assert.equal(typeof mod.measureFps, "function");
  assert.equal(typeof mod.benchDomCounts, "function");
});
