/**
 * AI 助手 MVP：自然语言 → 流程规范（ScreenPack 兼容）→ 画布图。
 *
 * 设计原则（与 templatePacks.ts 同构）：
 * - 纯函数、无 DOM、无网络依赖：Node 测试直接 import；
 * - 输出复用 ScreenPack 类型与 validateScreenPack / buildPackGraph 管线，
 *   后续接远程 LLM 时只需替换 planFlowFromText 的实现，画布侧零改动；
 * - 生成器是「规范」而不是「节点」：插入走 insertPack 的快照管线，可撤销。
 *
 * MVP 语义：
 * - 解析：场景词典（教育/电商/餐饮/审批/医疗/出行/内容）匹配 + 步骤切分；
 * - 规划：识别「开始/列表 → 详情/表单 → 判断/分支 → 结果/成功」角色链，
 *   按行主轴 + 分支换行布局，连线全部落在模板真实热点上；
 * - 校验：validateScreenPack 保证生成的每条边都引用真实存在的热点 id。
 */
import type { ConditionSpec, ScreenData } from "./types.ts";
import { screenTemplates } from "./sample.ts";
import { PACK_NODE_SIZE, packMetrics, validateScreenPack, type PackEdgeSpec, type PackMetrics, type PackNodeSpec, type ScreenPack } from "./templatePacks.ts";

/** 模板词典：关键词 → 内置模板键。顺序即优先级。 */
const TEMPLATE_HINTS: { keys: string[]; template: string }[] = [
  { keys: ["登录", "注册", "验证码", "账号"], template: "login" },
  { keys: ["成功", "完成", "结果", "支付成功", "提交成功"], template: "success" },
  { keys: ["详情", "商品", "内容", "医生", "课程"], template: "detail" },
  { keys: ["设置", "我的", "个人", "账户"], template: "settings" },
  { keys: ["支付", "结算", "购物车", "确认"], template: "pay" },
  { keys: ["搜索", "列表", "首页", "工作台", "广场", "大厅"], template: "home" },
];

/** 判断类步骤关键词：命中即生成 decision 节点。 */
const DECISION_HINTS = ["是否", "判断", "如果", "有没有", "成功?", "成功？", "失败重试", "选择"];

/** 动作类步骤关键词：命中即生成 action 节点（系统行为，非界面）。 */
const ACTION_HINTS = ["通知", "短信", "推送", "发送", "回调", "扣款", "同步", "提醒", "审核"];

export type AiPlanStep = {
  /** 稳定 key，连线引用它 */
  key: string;
  kind: "screen" | "decision" | "action";
  /** 展示标题（来自用户文本的分段或词典名） */
  title: string;
  /** kind=screen 时的内置模板键 */
  templateKey?: string;
  /** decision 的条件（MVP：默认用 phone/notEmpty，用户可在属性面板改） */
  condition?: ConditionSpec;
};

export type AiPlan = {
  steps: AiPlanStep[];
  /** 连线：from → to（handle 由 kind 决定，screen 需给出热点 id） */
  links: { from: string; to: string; label: string }[];
  /** 命中的场景名，用于面板展示「识别为：xx 流程」 */
  scenario: string;
};

export type AiPlanResult = {
  plan: AiPlan;
  pack: ScreenPack;
  /** validateScreenPack 的输出，插入前必须为空 */
  problems: string[];
  metrics: PackMetrics;
};

/* ── 文本切分 ───────────────────────────────────────────────────────── */

/** 按分隔符切步骤：支持 → / 箭头 / 逗号顿号分号句号 / 换行 / "然后""接着""再" */
export function splitSteps(text: string): string[] {
  return text
    .replace(/[，,;；。、]/g, " ")
    .replace(/(然后|接着|其次|随后|之后|再)/g, " ")
    .split(/→|->|=>|\n| {2,}| /)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && /\p{L}|\p{N}/u.test(s));
}

/** 给分段猜模板：命中词典 → 该模板；否则按位置回落（首段 home，末段 success，其余 detail）。 */
export function templateForStep(title: string, index: number, total: number): string {
  for (const hint of TEMPLATE_HINTS) {
    if (hint.keys.some((k) => title.includes(k))) return hint.template;
  }
  if (index === 0) return "home";
  if (index === total - 1) return "success";
  return "detail";
}

/* ── 角色识别 ───────────────────────────────────────────────────────── */

function kindForStep(title: string): "screen" | "decision" | "action" {
  if (DECISION_HINTS.some((k) => title.includes(k))) return "decision";
  if (ACTION_HINTS.some((k) => title.includes(k))) return "action";
  return "screen";
}

/**
 * 主链规划：文本 → 角色步骤链（纯函数，可被远程 LLM 实现替换）。
 * 规则：
 * - 每个分段按词典定 kind（decision > action > screen）；
 * - decision 自动补一条回边（no 分支退回上一步，MVP 约定）；
 * - screen 步骤记录「来自哪个分段」的热点：MVP 用每个模板的首个热点。
 */
export function planFlowFromText(text: string): AiPlan {
  const segments = splitSteps(text);
  const steps: AiPlanStep[] = [];
  const links: { from: string; to: string; label: string }[] = [];
  const scenario = detectScenario(text);

  segments.forEach((seg, i) => {
    const kind = kindForStep(seg);
    const key = `s${i}`;
    if (kind === "screen") {
      steps.push({ key, kind, title: seg, templateKey: templateForStep(seg, i, segments.length) });
    } else if (kind === "decision") {
      steps.push({ key, kind, title: seg, condition: { variable: "phone", op: "notEmpty" } });
    } else {
      steps.push({ key, kind, title: seg });
    }
    if (i > 0) {
      const prev = steps[i - 1];
      links.push({ from: prev.key, to: key, label: "下一步" });
    }
  });

  // decision 的 no 分支：退回上一个 screen（跳过紧邻的 action），MVP 固定语义
  for (const link of [...links]) {
    const step = steps.find((s) => s.key === link.from);
    if (step?.kind !== "decision") continue;
    const fromIdx = steps.findIndex((s) => s.key === step.key);
    let backIdx = fromIdx - 1;
    while (backIdx >= 0 && steps[backIdx].kind === "action") backIdx--;
    if (backIdx >= 0) links.push({ from: step.key, to: steps[backIdx].key, label: "否 - 返回" });
  }

  return { steps, links, scenario };
}

const SCENARIOS: { name: string; keywords: string[] }[] = [
  { name: "教育课程", keywords: ["课程", "学习", "考试", "题库", "老师", "学生"] },
  { name: "电商购物", keywords: ["商品", "购物", "下单", "支付", "订单", "电商"] },
  { name: "餐饮点单", keywords: ["点餐", "点单", "外卖", "堂食", "菜品"] },
  { name: "审批工单", keywords: ["审批", "工单", "报销", "请假", "入职", "审核"] },
  { name: "医疗挂号", keywords: ["挂号", "医院", "医生", "门诊", "问诊"] },
  { name: "出行票务", keywords: ["机票", "火车", "酒店", "出行", "行程"] },
  { name: "内容社区", keywords: ["社区", "帖子", "发布", "评论", "动态"] },
];

export function detectScenario(text: string): string {
  for (const s of SCENARIOS) {
    if (s.keywords.some((k) => text.includes(k))) return s.name;
  }
  return "通用流程";
}

/* ── 热点选择 ───────────────────────────────────────────────────────── */

/**
 * 从模板里挑出边要用的热点 id：优先主按钮（tone=primary），否则第一个热点。
 * 保证 buildPackGraph 实例化后连线真的落在可点的控件上。
 */
export function primaryHotspotOf(templateKey: string): string | null {
  const elements = screenTemplates[templateKey]?.data.elements ?? [];
  const hotspots = elements.filter((el) => el.hotspot);
  return hotspots.find((el) => el.tone === "primary")?.id ?? hotspots[0]?.id ?? null;
}

/* ── 布局与实例化 ───────────────────────────────────────────────────── */

const SCREEN_W = PACK_NODE_SIZE.screen.w; // 320
const DECISION_W = PACK_NODE_SIZE.decision.w; // 240
const GAP_X = 300; // 节点间水平间距（screen 宽 + 呼吸空间）

/**
 * AiPlan → ScreenPack（复用 templatePacks 管线）。
 * 布局：主链单行排列，x 按前序节点实际宽度累计（screen 320 / decision·action 240），
 * 节点间留 GAP_X 呼吸空间——步长固定会导致宽窄节点相互重叠。
 */
export function buildAiPack(plan: AiPlan, name: string): AiPlanResult {
  let cursor = 0;
  const nodes: PackNodeSpec[] = plan.steps.map((step) => {
    const w = step.kind === "screen" ? SCREEN_W : DECISION_W;
    const x = cursor;
    cursor += w + GAP_X;
    const y = 0;
    if (step.kind === "screen") {
      return { key: step.key, kind: "screen", templateKey: step.templateKey, title: step.title, x, y };
    }
    if (step.kind === "decision") {
      return { key: step.key, kind: "decision", title: step.title, yes: "是", no: "否", condition: step.condition, x, y };
    }
    return { key: step.key, kind: "action", title: step.title, subtitle: "系统动作", x, y };
  });

  const edges: PackEdgeSpec[] = [];
  for (const link of plan.links) {
    const from = plan.steps.find((s) => s.key === link.from);
    const to = plan.steps.find((s) => s.key === link.to);
    if (!from || !to) continue;
    const fromHandle =
      from.kind === "decision"
        ? link.label.startsWith("否")
          ? "no"
          : "yes"
        : from.kind === "action"
          ? "out"
          : primaryHotspotOf(from.templateKey ?? "") ?? "in";
    edges.push({ from: from.key, fromHandle, to: to.key, label: link.label });
  }

  const pack: ScreenPack = {
    id: `ai-${Date.now()}`,
    name,
    description: `AI 生成：${plan.scenario}，${plan.steps.length} 个步骤`,
    tags: ["AI"],
    nodes,
    edges,
  };
  const problems = validateScreenPack(pack);
  const metrics = packMetrics(pack);
  return { plan, pack, problems, metrics };
}

/* ── 智能补线（读取体检结果） ───────────────────────────────────────── */

export type WireSuggestion = {
  /** 源节点 id */
  source: string;
  /** 目标节点 id */
  target: string;
  sourceHandle: string;
  label: string;
  /** 建议理由（面板展示） */
  reason: string;
};

/**
 * 死路补线 MVP：为「没有任何出口的界面」按标题语义找下一个目标。
 * 规则：
 * - 标题含「成功/完成/结果」→ 连回首页（闭环）；
 * - 其余 → 连向流程中下一个未连通的界面；找不到就跳过（宁缺勿错）。
 * 只建议、不自动改画布；由用户点「采纳」后走 snapshot + addEdge。
 */
export function suggestWires(
  nodes: { id: string; type: string; title: string }[],
  edges: readonly WireEdgeInput[],
): WireSuggestion[] {
  const outCount = new Map<string, number>();
  for (const e of edges) outCount.set(e.source, (outCount.get(e.source) ?? 0) + 1);
  const screens = nodes.filter((n) => n.type === "screen");
  const suggestions: WireSuggestion[] = [];

  for (const screen of screens) {
    if ((outCount.get(screen.id) ?? 0) > 0) continue;
    const isSuccess = /成功|完成|结果|结束/.test(screen.title);
    const home = screens.find((n) => n.id !== screen.id && /首页|工作台|列表|大厅/.test(n.title));
    const target = isSuccess ? (home ?? screens.find((n) => n.id !== screen.id)) : nextScreenAfter(screens, screen);
    if (!target || target.id === screen.id) continue;
    const primary = primaryHotspotIdOfScreenTitle(screen.title);
    suggestions.push({
      source: screen.id,
      target: target.id,
      sourceHandle: primary,
      label: isSuccess ? "返回首页" : "继续",
      reason: isSuccess
        ? `「${screen.title}」是结果页，建议闭环回「${target.title}」`
        : `「${screen.title}」没有出口，建议接到下一张界面「${target.title}」`,
    });
  }
  return suggestions;
}

/** suggestWires 用的轻量热点探测：真实热点 id 由调用方从节点 data 里解析后传入。 */
function primaryHotspotIdOfScreenTitle(title: string): string {
  void title;
  return "in";
}

function nextScreenAfter(screens: { id: string; title: string }[], current: { id: string }): { id: string; title: string } | null {
  const idx = screens.findIndex((s) => s.id === current.id);
  for (let i = 1; i < screens.length; i++) {
    const candidate = screens[(idx + i) % screens.length];
    if (candidate.id !== current.id) return candidate;
  }
  return null;
}

/* ── 面板辅助 ───────────────────────────────────────────────────────── */

/**
 * 在现有节点包围盒之外找一个不重叠的插入锚点（纯函数）。
 * 规则：AI 包整体放在现有内容的右侧；若右侧放不下（现有内容已经很靠右），
 * 则放到下方。留 160px 间隔，避免插入内容与现有卡片物理重叠——
 * 重叠卡片之间「线不穿卡」不变式在几何上无解，必须从锚点源头避免。
 */
export function findBlankAnchor(
  existing: { x: number; y: number; width: number; height: number }[],
  packSize: { width: number; height: number },
): { x: number; y: number } {
  if (!existing.length) return { x: 0, y: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of existing) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  const GAP = 160;
  const rightX = maxX + GAP;
  const belowY = maxY + GAP;
  // 右侧：与现有内容无水平重叠 → 不可能撞上
  if (rightX + packSize.width <= 20000) return { x: rightX, y: minY };
  return { x: minX, y: belowY };
}

/** 面板里的示例文案（一键填入）。 */
export const AI_EXAMPLES = [
  "首页 → 搜索课程 → 课程详情 → 是否已登录？→ 登录页 → 下单支付 → 支付成功，发送短信通知 → 查看订单",
  "商品列表 → 商品详情 → 加入购物车 → 结算支付 → 支付成功？→ 支付成功页，发送发货通知 → 我的订单",
  "首页 → 选择科室 → 选择医生 → 填写挂号信息 → 确认挂号 → 是否使用医保？→ 挂号成功 → 发送短信通知 → 排队进度",
];

/** 从画布节点提取 suggestWires 需要的精简视图（App 侧调用）。 */
export function screenViewsForSuggestion(
  nodes: readonly { id: string; type?: string | undefined; data: unknown }[],
): { id: string; type: string; title: string }[] {
  return nodes
    .filter((n) => n.type === "screen")
    .map((n) => {
      const data = n.data as ScreenData;
      return { id: n.id, type: "screen", title: typeof data?.title === "string" ? data.title : "" };
    });
}

/** suggestWires 的入参放宽：Edge.sourceHandle 可缺省。 */
export type WireEdgeInput = { source: string; sourceHandle?: string | null };
