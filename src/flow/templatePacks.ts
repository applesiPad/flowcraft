/**
 * 内置行业模板包（本地优先，不依赖任何远程服务）。
 *
 * 每个包是一份「一整条业务链路」的静态描述：界面节点复用 `sample.ts` 的内置模板，
 * 判断/动作节点与连线由包数据声明。Palette 负责展示缩略图与「插入整套」入口，
 * App 负责把包实例化成画布节点/边（走正常的历史快照，可撤销）。
 *
 * 该文件刻意只依赖类型与 sample.ts（纯数据），可被 Node 测试直接 import。
 */
import type { Edge, Node } from "@xyflow/react";
import type { ScreenData, ScreenElement, ScreenTemplate } from "./types.ts";
import { screenTemplates } from "./sample.ts";

/** 名义尺寸：只用于缩略图与「插入到视口中心」时的包围盒计算，实际节点尺寸由内容决定。 */
export const PACK_NODE_SIZE: Record<PackNodeKind, { w: number; h: number }> = {
  screen: { w: 320, h: 520 },
  decision: { w: 240, h: 110 },
  action: { w: 240, h: 96 },
};

export type PackNodeKind = "screen" | "decision" | "action";

export type PackNodeSpec = {
  key: string;
  kind: PackNodeKind;
  /** kind=screen 时引用 screenTemplates 的键 */
  templateKey?: string;
  title: string;
  subtitle?: string;
  /** decision 节点的「是/否」出口文案 */
  yes?: string;
  no?: string;
  x: number;
  y: number;
};

export type PackEdgeSpec = {
  from: string;
  fromHandle: string;
  to: string;
  label: string;
};

export type ScreenPack = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  nodes: PackNodeSpec[];
  edges: PackEdgeSpec[];
};

export const screenPacks: ScreenPack[] = [
  {
    id: "pack-ecommerce",
    name: "电商下单主链路",
    description: "商品列表 → 详情 → 登录判断 → 结算 → 支付结果，含超时回退与订单闭环。",
    tags: ["电商", "支付", "回退分支"],
    nodes: [
      { key: "s-list", kind: "screen", templateKey: "home", title: "商品列表", x: 0, y: 0 },
      { key: "s-detail", kind: "screen", templateKey: "detail", title: "商品详情", x: 620, y: 0 },
      { key: "d-login", kind: "decision", title: "已登录？", yes: "是", no: "否", x: 1240, y: 10 },
      { key: "s-login", kind: "screen", templateKey: "login", title: "账号登录", x: 1240, y: 640 },
      { key: "s-cart", kind: "screen", templateKey: "pay", title: "购物车结算", x: 1860, y: 0 },
      { key: "d-pay", kind: "decision", title: "支付成功？", yes: "是", no: "否", x: 2480, y: 10 },
      { key: "a-timeout", kind: "action", title: "支付超时", subtitle: "关闭订单并提示重新下单", x: 2480, y: 640 },
      { key: "s-success", kind: "screen", templateKey: "success", title: "支付成功", x: 3100, y: -40 },
      { key: "s-orders", kind: "screen", templateKey: "home", title: "我的订单", x: 3100, y: 640 },
    ],
    edges: [
      { from: "s-list", fromHandle: "row1", to: "s-detail", label: "点击商品" },
      { from: "s-detail", fromHandle: "publish", to: "d-login", label: "去结算" },
      { from: "d-login", fromHandle: "yes", to: "s-cart", label: "已登录" },
      { from: "d-login", fromHandle: "no", to: "s-login", label: "去登录" },
      { from: "s-login", fromHandle: "submit", to: "s-cart", label: "登录成功" },
      { from: "s-cart", fromHandle: "pay", to: "d-pay", label: "提交支付" },
      { from: "d-pay", fromHandle: "yes", to: "s-success", label: "支付成功" },
      { from: "d-pay", fromHandle: "no", to: "a-timeout", label: "支付超时" },
      { from: "a-timeout", fromHandle: "out", to: "s-cart", label: "重新支付" },
      { from: "s-success", fromHandle: "back", to: "s-orders", label: "查看订单" },
    ],
  },
  {
    id: "pack-foodorder",
    name: "外卖点单闭环",
    description: "门店菜单 → 菜品 → 购物车 → 起送价判断 → 收银 → 完成与再来一单，含凑单回路。",
    tags: ["本地生活", "购物车", "凑单回路"],
    nodes: [
      { key: "s-menu", kind: "screen", templateKey: "home", title: "门店菜单", x: 0, y: 0 },
      { key: "s-item", kind: "screen", templateKey: "detail", title: "菜品详情", x: 620, y: 0 },
      { key: "s-cart", kind: "screen", templateKey: "pay", title: "订单确认", x: 1240, y: 0 },
      { key: "d-min", kind: "decision", title: "达起送价？", yes: "是", no: "否", x: 1860, y: 10 },
      { key: "s-add", kind: "screen", templateKey: "detail", title: "加购推荐", x: 2480, y: -40 },
      { key: "a-fee", kind: "action", title: "配送费重算", subtitle: "起送变化时提示差额", x: 1860, y: 640 },
      { key: "s-pay", kind: "screen", templateKey: "pay", title: "收银台", x: 2480, y: 640 },
      { key: "s-done", kind: "screen", templateKey: "success", title: "下单完成", x: 3100, y: 640 },
      { key: "s-track", kind: "screen", templateKey: "home", title: "订单追踪", x: 3100, y: 1280 },
    ],
    edges: [
      { from: "s-menu", fromHandle: "row1", to: "s-item", label: "看菜品" },
      { from: "s-item", fromHandle: "publish", to: "s-cart", label: "加入购物车" },
      { from: "s-cart", fromHandle: "pay", to: "d-min", label: "去结算" },
      { from: "d-min", fromHandle: "no", to: "s-add", label: "去凑单" },
      { from: "s-add", fromHandle: "card", to: "s-cart", label: "加购并返回" },
      { from: "d-min", fromHandle: "yes", to: "a-fee", label: "重算配送费" },
      { from: "a-fee", fromHandle: "out", to: "s-pay", label: "进入收银台" },
      { from: "s-pay", fromHandle: "pay", to: "s-done", label: "支付完成" },
      { from: "s-done", fromHandle: "back", to: "s-track", label: "查看配送" },
      { from: "s-track", fromHandle: "row2", to: "s-menu", label: "再来一单" },
    ],
  },
  {
    id: "pack-hr",
    name: "员工入职流程",
    description: "候选人登录 → 入职任务 → 资料审核（可退回补件）→ 合同签署 → 账号开通与引导。",
    tags: ["HR", "审批", "退回补件"],
    nodes: [
      { key: "s-login", kind: "screen", templateKey: "login", title: "候选人登录", x: 0, y: 0 },
      { key: "s-tasks", kind: "screen", templateKey: "home", title: "入职任务", x: 620, y: 0 },
      { key: "s-form", kind: "screen", templateKey: "detail", title: "资料填写", x: 1240, y: 0 },
      { key: "d-check", kind: "decision", title: "资料完整？", yes: "是", no: "否", x: 1860, y: 10 },
      { key: "a-remind", kind: "action", title: "发送补件提醒", subtitle: "短信 + 邮件通知候选人", x: 2480, y: -40 },
      { key: "s-offer", kind: "screen", templateKey: "success", title: "合同签署完成", x: 2480, y: 640 },
      { key: "s-account", kind: "screen", templateKey: "settings", title: "账号开通", x: 3100, y: 640 },
      { key: "s-welcome", kind: "screen", templateKey: "home", title: "入职引导", x: 3720, y: 640 },
    ],
    edges: [
      { from: "s-login", fromHandle: "submit", to: "s-tasks", label: "登录" },
      { from: "s-tasks", fromHandle: "row1", to: "s-form", label: "填写资料" },
      { from: "s-form", fromHandle: "publish", to: "d-check", label: "提交审核" },
      { from: "d-check", fromHandle: "no", to: "a-remind", label: "退回补件" },
      { from: "a-remind", fromHandle: "out", to: "s-form", label: "重新填写" },
      { from: "d-check", fromHandle: "yes", to: "s-offer", label: "生成合同" },
      { from: "s-offer", fromHandle: "back", to: "s-account", label: "开通账号" },
      { from: "s-account", fromHandle: "logout", to: "s-welcome", label: "进入引导" },
    ],
  },
];

/** 包内出现过的内置模板键（保持声明顺序，去重，最多取 6 个用于缩略图）。 */
export function packTemplateKeys(pack: ScreenPack): string[] {
  const seen: string[] = [];
  for (const node of pack.nodes) {
    if (node.kind === "screen" && node.templateKey && !seen.includes(node.templateKey)) {
      seen.push(node.templateKey);
    }
  }
  return seen;
}

/** 缩略图用：把包内各界面元素合成一个「内容摘要」列表（同名元素去重、上限 6 行）。 */
export function packScreenElements(pack: ScreenPack): ScreenElement[] {
  const out: ScreenElement[] = [];
  const seen = new Set<string>();
  for (const key of packTemplateKeys(pack)) {
    for (const el of screenTemplates[key]?.data.elements ?? []) {
      const dedupe = `${el.kind}:${el.label ?? el.placeholder ?? el.id}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push(el);
      if (out.length >= 6) return out;
    }
  }
  return out;
}

/** 搜索/分类用的「合成模板」视图：包本身不是 ScreenTemplate，但可复用 filterTemplates。 */
export function packAsTemplate(pack: ScreenPack): ScreenTemplate {
  return {
    id: pack.id,
    name: pack.name,
    icon: "📦",
    data: {
      title: pack.name,
      subtitle: pack.description,
      elements: packScreenElements(pack).map((el) => ({ ...el, hotspot: false })),
    } satisfies ScreenData,
  };
}

export type PackMetrics = {
  screens: number;
  decisions: number;
  actions: number;
  edgeCount: number;
  hotspots: number;
};

export function packMetrics(pack: ScreenPack): PackMetrics {
  const screens = pack.nodes.filter((n) => n.kind === "screen").length;
  const hotspots = pack.edges.length;
  return {
    screens,
    decisions: pack.nodes.filter((n) => n.kind === "decision").length,
    actions: pack.nodes.filter((n) => n.kind === "action").length,
    edgeCount: pack.edges.length,
    hotspots,
  };
}

/** 静态自检：返回问题列表（空数组 = 合法）。供单测与开发期兜底。 */
export function validateScreenPack(pack: ScreenPack): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const node of pack.nodes) {
    if (!node.key || keys.has(node.key)) problems.push(`节点 key 重复或为空：${node.key}`);
    keys.add(node.key);
    if (node.kind === "screen" && !screenTemplates[node.templateKey ?? ""]) {
      problems.push(`界面节点 ${node.key} 引用了不存在的模板：${node.templateKey}`);
    }
    if (node.kind === "decision" && (node.yes === undefined || node.no === undefined)) {
      problems.push(`判断节点 ${node.key} 缺少是/否文案`);
    }
  }
  for (const edge of pack.edges) {
    if (!keys.has(edge.from)) problems.push(`连线 ${edge.from}→${edge.to}：起点不存在`);
    if (!keys.has(edge.to)) problems.push(`连线 ${edge.from}→${edge.to}：终点不存在`);
    if (!edge.label.trim()) problems.push(`连线 ${edge.from}→${edge.to} 缺少标签`);
    const from = pack.nodes.find((n) => n.key === edge.from);
    if (from?.kind === "screen" && !packScreenHandles(from).includes(edge.fromHandle)) {
      problems.push(`界面 ${edge.from} 没有热点 ${edge.fromHandle}`);
    }
    if (from?.kind === "decision" && edge.fromHandle !== "yes" && edge.fromHandle !== "no") {
      problems.push(`判断节点出口只能是 yes/no：${edge.from}`);
    }
    if (from?.kind === "action" && edge.fromHandle !== "out") {
      problems.push(`动作节点出口只能是 out：${edge.from}`);
    }
  }
  return problems;
}

function packScreenHandles(node: PackNodeSpec): string[] {
  const template = screenTemplates[node.templateKey ?? ""];
  return (template?.data.elements ?? []).filter((el) => el.hotspot).map((el) => el.id);
}

export type PackGraph = { nodes: Node[]; edges: Edge[]; idByKey: Record<string, string> };

/**
 * 实例化为画布节点/边。`newId(kind)` 由调用方提供 id 工厂（前缀 n/d/a/note），
 * `base` 为包原点平移到画布上的锚点。连线与 sample.ts 同构：界面入口固定为 "in"。
 */
export function buildPackGraph(pack: ScreenPack, base: { x: number; y: number }, newId: (prefix: string) => string): PackGraph {
  const idByKey: Record<string, string> = {};
  const nodes: Node[] = pack.nodes.map((spec) => {
    const id = newId(spec.kind === "screen" ? "n" : spec.kind === "decision" ? "d" : "a");
    idByKey[spec.key] = id;
    const position = { x: base.x + spec.x, y: base.y + spec.y };
    if (spec.kind === "screen") {
      const template = screenTemplates[spec.templateKey ?? ""];
      // 深拷贝：插入后的编辑不能反过来污染内置模板
      const data: ScreenData = JSON.parse(JSON.stringify(template.data)) as ScreenData;
      data.title = spec.title;
      return {
        id,
        type: "screen",
        position,
        data: data as unknown as Record<string, unknown>,
        style: { width: 320 },
      } satisfies Node;
    }
    if (spec.kind === "decision") {
      return {
        id,
        type: "decision",
        position,
        data: { title: spec.title, yes: spec.yes, no: spec.no } as unknown as Record<string, unknown>,
      } satisfies Node;
    }
    return {
      id,
      type: "action",
      position,
      data: { title: spec.title, subtitle: spec.subtitle ?? "" } as unknown as Record<string, unknown>,
    } satisfies Node;
  });
  const edges: Edge[] = pack.edges.map((spec) => ({
    id: newId("e"),
    source: idByKey[spec.from],
    sourceHandle: spec.fromHandle,
    target: idByKey[spec.to],
    targetHandle: "in",
    type: "flow",
    data: { label: spec.label },
  }));
  return { nodes, edges, idByKey };
}

/** 包围盒（名义尺寸），用于「点击插入 = 居中」。 */
export function packBounds(pack: ScreenPack): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of pack.nodes) {
    const size = PACK_NODE_SIZE[node.kind];
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + size.w);
    maxY = Math.max(maxY, node.y + size.h);
  }
  return { minX, minY, maxX, maxY };
}
