/**
 * 流程健康检查：一键扫描画布上的常见流程缺陷（只读，不修改画布）。
 *
 * 拓扑级：
 * - deadEnd 死路界面：没有任何出口连线的界面（若它本来就是流程终点，可忽略）。
 * - orphan 孤立界面：既没有入口也没有出口的界面（通常是忘了接线的草稿）。
 * - unwiredPrimary 未接线主按钮：主按钮（tone=primary）没有对应出口连线——
 *   用户最常点它，也是评审时最扎眼的断链。
 * - decisionIncomplete 判断分支不全：判断节点缺「是」或「否」出口，原型走查会默认走「是」。
 *
 * 数据级（2026-11-02 二期）：
 * - condVarUnknown 条件变量无来源：判断条件里的变量名在全图没有任何输入框使用——
 *   预览/导出原型时该变量永远是空值，条件结果固定，演示时最容易翻车。
 * - unnamedScreen 界面未命名：界面标题为空（评审报告、走查面包屑里显示不出来）。
 *
 * 纯函数、无 DOM 依赖，Node 测试可直接 import。
 */
import type { Edge, Node } from "@xyflow/react";
import type { DecisionData, ScreenData } from "./types.ts";
import { normalizeCondition } from "./prototypeLogic.ts";

export type HealthIssueKind =
  | "deadEnd"
  | "orphan"
  | "unwiredPrimary"
  | "decisionIncomplete"
  | "condVarUnknown"
  | "unnamedScreen";

export type HealthIssue = {
  /** 稳定 key：kind:nodeId[:elId] */
  id: string;
  kind: HealthIssueKind;
  nodeId: string;
  /** 节点标题（界面标题 / 判断文案） */
  title: string;
  detail: string;
  /** unwiredPrimary 时指向具体元素，用于定位 */
  elId?: string;
};

export const HEALTH_KIND_LABEL: Record<HealthIssueKind, string> = {
  deadEnd: "死路界面",
  orphan: "孤立界面",
  unwiredPrimary: "未接线主按钮",
  decisionIncomplete: "判断分支不全",
  condVarUnknown: "条件变量无来源",
  unnamedScreen: "界面未命名",
};

export const HEALTH_KIND_ORDER: HealthIssueKind[] = [
  "unwiredPrimary",
  "decisionIncomplete",
  "condVarUnknown",
  "deadEnd",
  "orphan",
  "unnamedScreen",
];

function titleOf(node: Node): string {
  return String((node.data as { title?: unknown })?.title ?? node.id);
}

/**
 * 画布级死路提示（§8-1）：每个界面节点的「出口健康」摘要，供节点渲染橙描边 + 角标。
 * - unwiredPrimary：主按钮（tone=primary）没有出口连线的数量（与 scanFlowHealth 同语义）；
 * - hasOut：该节点是否至少有一条出口连线（自环算出口）。
 * 判断节点不在此列——分支缺失由选中上下文条与体检报告负责，避免画布告警噪音。
 * 纯函数、无 DOM 依赖，Node 测试可直接 import。
 */
export type DeadHint = { unwiredPrimary: number; hasOut: boolean };

export function computeDeadHints(nodes: Node[], edges: Edge[]): Map<string, DeadHint> {
  const outSources = new Set(edges.map((e) => e.source));
  const hints = new Map<string, DeadHint>();
  for (const node of nodes) {
    if (node.type !== "screen") continue;
    const data = node.data as unknown as ScreenData;
    const unwiredPrimary = (data.elements ?? []).filter(
      (el) => el.kind === "button" && el.tone === "primary" &&
        !edges.some((e) => e.source === node.id && e.sourceHandle === el.id),
    ).length;
    const hasOut = outSources.has(node.id);
    hints.set(node.id, { unwiredPrimary, hasOut });
  }
  return hints;
}

export function scanFlowHealth(nodes: Node[], edges: Edge[]): HealthIssue[] {
  const screens = nodes.filter((n) => n.type === "screen");
  const decisions = nodes.filter((n) => n.type === "decision");
  const outByNode = new Map<string, Edge[]>();
  const inCount = new Map<string, number>();
  for (const e of edges) {
    if (e.source === e.target) {
      // 自环也算一条出口/入口
    }
    outByNode.set(e.source, [...(outByNode.get(e.source) ?? []), e]);
    inCount.set(e.target, (inCount.get(e.target) ?? 0) + 1);
  }

  const issues: HealthIssue[] = [];

  for (const node of screens) {
    const title = titleOf(node);
    const outs = (outByNode.get(node.id) ?? []).length;
    const ins = inCount.get(node.id) ?? 0;
    if (outs === 0 && ins === 0) {
      issues.push({ id: `orphan:${node.id}`, kind: "orphan", nodeId: node.id, title, detail: "既没有入口也没有出口，通常是一张还没接线的草稿界面" });
      continue;
    }
    if (outs === 0) {
      issues.push({
        id: `deadEnd:${node.id}`,
        kind: "deadEnd",
        nodeId: node.id,
        title,
        detail: "没有任何出口连线，走到这里的用户会卡住（若此界面是流程终点，可忽略）",
      });
      continue;
    }
    const data = node.data as unknown as ScreenData;
    for (const el of data.elements ?? []) {
      if (el.kind !== "button" || el.tone !== "primary") continue;
      const wired = edges.some((e) => e.source === node.id && e.sourceHandle === el.id);
      if (!wired) {
        issues.push({
          id: `unwiredPrimary:${node.id}:${el.id}`,
          kind: "unwiredPrimary",
          nodeId: node.id,
          elId: el.id,
          title,
          detail: `主按钮「${el.label ?? el.id}」没有出口连线，原型走查会在此中断`,
        });
      }
    }
  }

  for (const node of decisions) {
    const outs = outByNode.get(node.id) ?? [];
    const hasYes = outs.some((e) => e.sourceHandle === "yes");
    const hasNo = outs.some((e) => e.sourceHandle === "no");
    if (hasYes && hasNo) continue;
    const data = node.data as unknown as DecisionData;
    const missing = [!hasYes ? data.yes ?? "是" : null, !hasNo ? data.no ?? "否" : null].filter(Boolean).join("、");
    issues.push({
      id: `decisionIncomplete:${node.id}`,
      kind: "decisionIncomplete",
      nodeId: node.id,
      title: titleOf(node),
      detail: `缺少「${missing}」出口；原型走查时缺失的分支会按默认「是」处理`,
    });
  }

  // 条件变量对账：判断条件里的变量必须来自某个界面的输入框（el.name），否则永远是空值
  const collectableVars = new Set<string>();
  for (const node of screens) {
    const data = node.data as unknown as ScreenData;
    for (const el of data.elements ?? []) {
      if (el.kind === "input" && el.name) collectableVars.add(el.name.trim());
    }
  }
  for (const node of decisions) {
    const cond = normalizeCondition((node.data as unknown as DecisionData).condition);
    if (!cond || collectableVars.has(cond.variable)) continue;
    issues.push({
      id: `condVarUnknown:${node.id}`,
      kind: "condVarUnknown",
      nodeId: node.id,
      title: titleOf(node),
      detail: `条件变量「${cond.variable}」没有对应的输入框变量名，原型里这个条件永远按空值求值；请检查变量名拼写，或给某个输入框配上这个变量名`,
    });
  }

  // 命名一致性：空标题的界面在报告和面包屑里显示不出来
  for (const node of screens) {
    const data = node.data as unknown as ScreenData;
    const title = typeof data.title === "string" ? data.title.trim() : "";
    if (title) continue;
    issues.push({
      id: `unnamedScreen:${node.id}`,
      kind: "unnamedScreen",
      nodeId: node.id,
      title: node.id,
      detail: "界面还没有命名，评审报告和走查面包屑里会显示成空白；请在属性面板里填写标题",
    });
  }

  return HEALTH_KIND_ORDER.flatMap((kind) => issues.filter((i) => i.kind === kind));
}
