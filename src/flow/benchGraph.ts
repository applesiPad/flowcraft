/**
 * 性能基线（benchmark）合成图与页内测量工具。
 *
 * 用途：通过 `?bench=small|medium|large` 打开一次性压测画布（不读写 localStorage、
 * 不进产品文档），生成规则网格 + 链式前进边 + 每行回边 + 随机跨节点的合成流程，
 * 用来回答「100+ 节点是否需要启用可视区裁剪（onlyRenderVisibleElements）」。
 *
 * 该文件刻意保持自包含（只有 type-only 依赖），因此可被 Node 测试直接 import。
 */
import type { Edge, Node } from "@xyflow/react";
import type { ScreenData, ScreenElement } from "./types";

export type BenchLevel = "small" | "medium" | "large";

export type BenchConfig = {
  count: number;
  cols: number;
  colStep: number;
  rowStep: number;
  edgeRatio: number;
};

/** 三档预算：30 / 100 / 200 个界面节点；边数 ≈ count × edgeRatio。 */
export const BENCH_CONFIG: Record<BenchLevel, BenchConfig> = {
  small: { count: 30, cols: 6, colStep: 600, rowStep: 640, edgeRatio: 1.3 },
  medium: { count: 100, cols: 10, colStep: 600, rowStep: 640, edgeRatio: 1.3 },
  large: { count: 200, cols: 10, colStep: 600, rowStep: 640, edgeRatio: 1.2 },
};

/** URL 参数解析：仅接受 small / medium / large，其他返回 null。 */
export function parseBenchLevel(value: string | null | undefined): BenchLevel | null {
  return value === "small" || value === "medium" || value === "large" ? value : null;
}

const el = (
  id: string,
  kind: ScreenElement["kind"],
  props: Partial<ScreenElement> = {},
): ScreenElement => ({ id, kind, ...props });

/** 3 套预设界面（与产品模板同元素体系），决定每个节点的热点数量与 DOM 密度。 */
const PRESETS: ScreenElement[][] = [
  [
    el("search", "search", { placeholder: "搜索项目、模板或成员", hotspot: true, action: "搜索" }),
    el("banner", "banner", { label: "压测横幅", sublabel: "查看说明 →", hotspot: true, action: "查看说明" }),
    el("row1", "list-item", { icon: "phone", label: "列表项 A", sublabel: "12 个界面", hotspot: true, action: "打开 A" }),
    el("row2", "list-item", { icon: "receipt", label: "列表项 B", sublabel: "8 个界面", hotspot: true, action: "打开 B" }),
    el("row3", "list-item", { icon: "headset", label: "列表项 C", sublabel: "草稿", hotspot: true, action: "打开 C" }),
    el("tabbar", "tabbar", { hotspot: true, action: "切换 Tab" }),
    el("back", "button", { label: "返回", tone: "ghost", hotspot: true, action: "返回" }),
  ],
  [
    el("logo", "logo", { label: "FlowCraft", sublabel: "性能基线", icon: "sparkle" }),
    el("phone", "input", { label: "手机号", placeholder: "请输入手机号", hotspot: true, action: "输入手机号" }),
    el("code", "input", { label: "验证码", placeholder: "6 位验证码", hotspot: true, action: "输入验证码" }),
    el("send", "button", { label: "获取验证码", tone: "ghost", hotspot: true, action: "获取验证码" }),
    el("submit", "button", { label: "提交", tone: "primary", hotspot: true, action: "提交" }),
    el("tip", "text", { label: "压测合成界面，仅用于性能基线。" }),
    el("back", "button", { label: "返回", tone: "ghost", hotspot: true, action: "返回" }),
  ],
  [
    el("card", "card", { label: "订单卡", sublabel: "最后更新 2 小时前", icon: "image", hotspot: true, action: "查看订单" }),
    el("member", "list-item", { icon: "users", label: "协作成员", sublabel: "3 人", hotspot: true, action: "管理成员" }),
    el("pay", "button", { label: "立即支付", tone: "primary", hotspot: true, action: "支付" }),
    el("cancel", "button", { label: "取消", tone: "ghost", hotspot: true, action: "取消" }),
    el("back", "button", { label: "返回", tone: "ghost", hotspot: true, action: "返回" }),
  ],
];

/** 每个预设的主出口（链式边使用）。 */
const PRIMARY_OUT = ["row1", "submit", "pay"];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type BenchFlow = { nodes: Node[]; edges: Edge[] };

/**
 * 生成确定性合成图：固定 seed（默认 20261101）下两次调用结果完全一致。
 * 边构成：行内链（i→i+1）+ 每行首尾回边（行末→行首，逼出 A* 与回边平衡）
 * + 随机前向跨节点边（1~3 列跨度），补足到 count×edgeRatio。
 */
export function buildBenchFlow(level: BenchLevel, seed = 20261101): BenchFlow {
  const cfg = BENCH_CONFIG[level];
  const rand = mulberry32(seed);
  const nodes: Node[] = [];
  for (let i = 0; i < cfg.count; i++) {
    const col = i % cfg.cols;
    const row = Math.floor(i / cfg.cols);
    const presetIndex = i % PRESETS.length;
    const jitterX = Math.round(rand() * 80);
    const jitterY = Math.round(rand() * 80);
    const data: ScreenData = {
      title: `界面 ${i + 1}`,
      elements: PRESETS[presetIndex].map((element) => ({ ...element })),
    };
    nodes.push({
      id: `bench-${i}`,
      type: "screen",
      position: { x: col * cfg.colStep + jitterX, y: row * cfg.rowStep + jitterY },
      data: data as unknown as Record<string, unknown>,
      style: { width: 320 },
    });
  }

  const edges: Edge[] = [];
  const used = new Set<string>();
  const hotspotIds = (index: number) =>
    PRESETS[index % PRESETS.length].filter((e) => e.hotspot).map((e) => e.id);

  const pushEdge = (from: number, to: number, handle: string) => {
    if (from === to || from < 0 || to < 0 || from >= cfg.count || to >= cfg.count) return false;
    const key = `${from}->${to}`;
    if (used.has(key)) return false;
    used.add(key);
    edges.push({
      id: `bench-e${edges.length}`,
      source: `bench-${from}`,
      sourceHandle: handle,
      target: `bench-${to}`,
      targetHandle: "in",
      type: "flow",
      data: { label: `跳转 ${from + 1}→${to + 1}` },
    });
    return true;
  };

  // 1) 行内链
  for (let i = 0; i + 1 < cfg.count; i++) {
    pushEdge(i, i + 1, PRIMARY_OUT[i % PRESETS.length]);
  }
  // 2) 每行回边：行末 → 行首
  for (let row = 0; row * cfg.cols < cfg.count; row++) {
    const start = row * cfg.cols;
    const end = Math.min(start + cfg.cols, cfg.count) - 1;
    if (end > start) pushEdge(end, start, "back");
  }
  // 3) 随机前向跨节点边补足到预算
  const target = Math.round(cfg.count * cfg.edgeRatio);
  let attempts = 0;
  while (edges.length < target && attempts < 2000) {
    attempts += 1;
    const from = Math.floor(rand() * cfg.count);
    const span = 2 + Math.floor(rand() * 2); // 跨 2~3 列
    const to = Math.min(from + span, cfg.count - 1);
    const handles = hotspotIds(from);
    pushEdge(from, to, handles[Math.floor(rand() * handles.length)]);
  }

  return { nodes, edges };
}

/* ---------- 页内测量工具（只在 bench 模式使用） ---------- */

export type FpsSample = {
  fps: number;
  worstSecondFps: number;
  maxFrameGapMs: number;
};

export type BenchRuntime = {
  level: BenchLevel;
  cull: boolean;
  nodeCount: number;
  edgeCount: number;
  /** React 提交完成（首帧数据就绪）performance.now() */
  mountedAt: number;
  /** fitView 应用并稳定后的 performance.now()；0 表示尚未完成 */
  fitDoneAt: number;
  /** 与 Date.now() 对齐的外挂时间戳，方便外部脚本轮询 */
  mountEpoch: number;
  fps: FpsSample | null;
  /** 最近一次 fps 写入时刻（Date.now），外部脚本轮询判断采样完成 */
  fpsAt: number;
  /** 采样标签：idle / pan / drag / zoom */
  fpsLabel: string;
  /** 页内 rAF 采样（供 Ego 脚本 await 调用） */
  measureFps?: (seconds?: number) => Promise<FpsSample>;
  /** fire-and-forget 采样：结果写入 window.__fcBench.fps + fpsAt + fpsLabel，便于与外部交互动作并发 */
  startFps?: (seconds: number, label: string) => void;
  /** 当前 DOM 计数（供 Ego 脚本读取） */
  domCounts?: () => Record<string, number>;
  /** 标记 fitView 稳定时刻，返回更新后的状态 */
  markFit?: () => number;
};

declare global {
  interface Window {
    __fcBench?: BenchRuntime;
  }
}

/** 采样一段时间内的 rAF 帧率：总体 fps + 最差 1 秒滚动窗口 + 最大帧间隔。 */
export async function measureFps(seconds = 2): Promise<FpsSample> {
  const marks: number[] = [];
  await new Promise<void>((resolve) => {
    let raf = 0;
    const tick = (t: number) => {
      marks.push(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.setTimeout(() => {
      cancelAnimationFrame(raf);
      resolve();
    }, Math.round(seconds * 1000));
  });
  if (marks.length < 2) return { fps: 0, worstSecondFps: 0, maxFrameGapMs: 0 };
  const spanTotal = marks[marks.length - 1] - marks[0];
  const fps = spanTotal > 0 ? ((marks.length - 1) / spanTotal) * 1000 : 0;
  let maxGap = 0;
  for (let i = 1; i < marks.length; i++) maxGap = Math.max(maxGap, marks[i] - marks[i - 1]);
  let worst = Infinity;
  let start = 0;
  for (let end = 0; end < marks.length; end++) {
    while (marks[end] - marks[start] > 1000) start += 1;
    const windowSpan = marks[end] - marks[start];
    if (windowSpan >= 800) {
      worst = Math.min(worst, ((end - start + 1) / windowSpan) * 1000);
    }
  }
  const round1 = (v: number) => Math.round(v * 10) / 10;
  return {
    fps: round1(fps),
    worstSecondFps: round1(worst === Infinity ? fps : worst),
    maxFrameGapMs: round1(maxGap),
  };
}

/** 当前 DOM 计数快照：节点 / 连线 / handle / 边标签等。 */
export function benchDomCounts(): Record<string, number> {
  const count = (selector: string) => document.querySelectorAll(selector).length;
  return {
    nodes: count(".react-flow__node"),
    edges: count(".react-flow__edge"),
    edgePaths: count(".react-flow__edge-path"),
    handles: count(".react-flow__handle"),
    nodeDom: count(".fc-screen"),
    labels: count(".fc-edge-label-card"),
    hotspots: count(".fc-hotspot-pin"),
  };
}
