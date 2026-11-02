/**
 * 页内 QA 探针：把每轮 Ego 回归需要的确定性断言数据一次性收集成 JSON。
 *
 * 过去的回归脚本每轮都在重写「读 DOM 计数 / 算边几何校验和」这段代码；
 * 探针把它固化成 `window.__fcQA.collect()`，脚本侧只剩断言（scripts/ego-smoke.mjs）。
 *
 * DOM 相关部分全部容错（无 DOM / 未挂载返回 null 或 0），Node 侧不崩。
 */
import type { Edge, Node } from "@xyflow/react";
import { scanFlowHealth } from "./flowHealth.ts";
import type { DecisionData, ScreenData } from "./types.ts";

export type QaProbeInput = { nodes: Node[]; edges: Edge[] };

export type QaSnapshot = {
  counts: {
    nodes: number;
    edges: number;
    screens: number;
    decisions: number;
    actions: number;
    notes: number;
    hotspots: number;
    inputVars: string[];
  };
  /** 常驻 DOM 计数（可视区裁剪开启时 < counts.nodes，属预期） */
  dom: { nodes: number; edges: number; handles: number } | null;
  /** 边几何摘要：主路径 d 的总长与 FNV-1a 32 位哈希（与历史 round 的 pathHash 口径一致） */
  edgeGeometry: { pathCount: number; totalLength: number; pathHash: number } | null;
  healthIssues: { id: string; kind: string }[];
  /** 判断节点条件一览（检查条件变量来源时的断言输入） */
  decisions: { id: string; title: string; variable: string | null }[];
};

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function collectQaSnapshot({ nodes, edges }: QaProbeInput): QaSnapshot {
  let screens = 0;
  let decisionsCount = 0;
  let actions = 0;
  let notes = 0;
  let hotspots = 0;
  const inputVars = new Set<string>();
  for (const node of nodes) {
    if (node.type === "screen") {
      screens++;
      const data = node.data as unknown as ScreenData;
      for (const el of data.elements ?? []) {
        if (el.hotspot) hotspots++;
        if (el.kind === "input" && el.name) inputVars.add(el.name);
      }
    } else if (node.type === "decision") {
      decisionsCount++;
    } else if (node.type === "action") {
      actions++;
    } else if (node.type === "note") {
      notes++;
    }
  }

  const dom =
    typeof document === "undefined"
      ? null
      : {
          nodes: document.querySelectorAll(".react-flow__node").length,
          edges: document.querySelectorAll(".react-flow__edge").length,
          handles: document.querySelectorAll(".react-flow__handle").length,
        };

  let edgeGeometry: QaSnapshot["edgeGeometry"] = null;
  if (typeof document !== "undefined") {
    const paths = Array.from(document.querySelectorAll<SVGPathElement>(".react-flow__edge path.react-flow__edge-path"));
    if (paths.length) {
      let totalLength = 0;
      const dParts: string[] = [];
      for (const path of paths) {
        dParts.push(path.getAttribute("d") ?? "");
        try {
          totalLength += path.getTotalLength();
        } catch {
          /* 未挂载的 path 会抛错，跳过 */
        }
      }
      edgeGeometry = {
        pathCount: paths.length,
        totalLength: Math.round(totalLength * 100) / 100,
        pathHash: fnv1a(dParts.join("|")),
      };
    }
  }

  const decisionRows = nodes
    .filter((n) => n.type === "decision")
    .map((n) => {
      const cond = (n.data as unknown as DecisionData).condition;
      return {
        id: n.id,
        title: String((n.data as { title?: unknown })?.title ?? n.id),
        variable: cond && typeof cond.variable === "string" ? cond.variable : null,
      };
    });

  return {
    counts: {
      nodes: nodes.length,
      edges: edges.length,
      screens,
      decisions: decisionsCount,
      actions,
      notes,
      hotspots,
      inputVars: [...inputVars].sort(),
    },
    dom,
    edgeGeometry,
    healthIssues: scanFlowHealth(nodes, edges).map((i) => ({ id: i.id, kind: i.kind })),
    decisions: decisionRows,
  };
}

export type QaProbe = {
  collect: () => QaSnapshot;
  version: number;
};

/** 在应用里安装 `window.__fcQA`；重复安装覆盖旧探针（HMR / 画布切换都安全）。 */
export function installQaProbe(getInput: () => QaProbeInput): void {
  const probe: QaProbe = {
    version: 1,
    collect: () => collectQaSnapshot(getInput()),
  };
  window.__fcQA = probe;
}

declare global {
  interface Window {
    __fcQA?: QaProbe;
  }
}
