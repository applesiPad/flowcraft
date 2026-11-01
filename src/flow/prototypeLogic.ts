/**
 * 原型逻辑共享模块：条件求值、输入校验、跳转目标解析。
 *
 * `Preview.tsx`（应用内预览）与 `exportHtml.ts`（导出播放器）共用同一套语义，
 * 保证「画布上点的」与「客户点到的」行为一致。纯函数、无 DOM 依赖，Node 测试可直接 import。
 */
import type { Edge, Node } from "@xyflow/react";
import type { ConditionSpec, DecisionData, InputValidation, ScreenData, ScreenElement } from "./types.ts";

export const CONDITION_OPS: { value: ConditionSpec["op"]; label: string }[] = [
  { value: "==", label: "等于" },
  { value: "!=", label: "不等于" },
  { value: ">", label: "大于" },
  { value: ">=", label: "大于等于" },
  { value: "<", label: "小于" },
  { value: "<=", label: "小于等于" },
  { value: "notEmpty", label: "非空" },
  { value: "empty", label: "为空" },
];

export const VALIDATION_OPTIONS: { value: InputValidation; label: string }[] = [
  { value: "required", label: "必填" },
  { value: "phone", label: "手机号" },
  { value: "number", label: "数字" },
];

/** 容错解析：非法/空条件返回 null（= 判断节点走默认「是」分支）。 */
export function normalizeCondition(raw: unknown): ConditionSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<ConditionSpec>;
  if (typeof c.variable !== "string" || !c.variable.trim()) return null;
  const op = c.op ?? "==";
  return { variable: c.variable.trim(), op, value: typeof c.value === "string" ? c.value : "" };
}

function asNumber(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * 评估一个条件。变量缺失按空字符串处理；两边都能解析为数字时按数值比较，否则按字符串比较。
 * 与导出播放器内的 JS 移植版必须保持逐值一致（tests/prototypeLogic.test.ts 固定语义）。
 */
export function evaluateCondition(cond: ConditionSpec, vars: Record<string, string>): boolean {
  const actual = vars[cond.variable] ?? "";
  const expected = cond.value ?? "";
  if (cond.op === "empty") return actual.trim() === "";
  if (cond.op === "notEmpty") return actual.trim() !== "";
  const a = asNumber(actual);
  const b = asNumber(expected);
  if (a !== null && b !== null) {
    switch (cond.op) {
      case "==": return a === b;
      case "!=": return a !== b;
      case ">": return a > b;
      case ">=": return a >= b;
      case "<": return a < b;
      case "<=": return a <= b;
    }
  }
  switch (cond.op) {
    case "==": return actual === expected;
    case "!=": return actual !== expected;
    case ">": return actual > expected;
    case ">=": return actual >= expected;
    case "<": return actual < expected;
    case "<=": return actual <= expected;
    default: return false;
  }
}

/** 判断节点选分支：配置了条件按求值结果走是/否，没配置走默认「是」。 */
export function pickDecisionHandle(data: DecisionData, vars: Record<string, string>): "yes" | "no" {
  const cond = normalizeCondition(data.condition);
  if (!cond) return "yes";
  return evaluateCondition(cond, vars) ? "yes" : "no";
}

/**
 * 从任意节点出发穿透「判断 / 动作」节点，落到真正的界面节点。
 * 判断节点用 `vars` 评估条件选分支；动作节点走第一条出口。
 * 返回 null 表示 32 步内没有落到界面（环 / 断链）。
 */
export function resolveFlowTarget(startId: string, nodes: Node[], edges: Edge[], vars: Record<string, string>): string | null {
  let target = startId;
  let guard = 0;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  while (guard++ < 32) {
    const node = byId.get(target);
    if (!node) return null;
    if (node.type === "screen") return target;
    const outs = edges.filter((e) => e.source === target);
    if (!outs.length) return null;
    if (node.type === "decision") {
      const want = pickDecisionHandle(node.data as unknown as DecisionData, vars);
      target = (outs.find((e) => e.sourceHandle === want) ?? outs[0]).target;
    } else {
      target = outs[0].target;
    }
  }
  return null;
}

/** 校验输入值。返回错误提示文案；null = 通过。所有规则都要求非空。 */
export function validateInputValue(rule: InputValidation | undefined, value: string, label: string): string | null {
  if (!rule) return null;
  const v = value.trim();
  const name = label || "该输入框";
  if (!v) return `请填写「${name}」`;
  if (rule === "phone" && !/^1\d{10}$/.test(v)) return `「${name}」需要 11 位手机号`;
  if (rule === "number" && !Number.isFinite(Number(v))) return `「${name}」需要填写数字`;
  return null;
}

/** 一条待校验输入的扁平描述，供预览与导出播放器共用。 */
export type ValidationSpec = { id: string; variable: string; rule: InputValidation; label: string };

/**
 * 收集一张界面上带变量名输入框的校验规则，按当前值返回第一条错误（含出错元素 id，用于描红）。
 * `values` 以元素 id 为 key（DOM 里的实际输入值）。
 */
export function firstValidationError(screen: ScreenData | undefined, values: Record<string, string>): { elId: string; message: string } | null {
  if (!screen) return null;
  for (const el of screen.elements ?? []) {
    if (el.kind !== "input" || !el.validation || !el.name) continue;
    const message = validateInputValue(el.validation, values[el.id] ?? "", el.label ?? el.placeholder ?? "");
    if (message) return { elId: el.id, message };
  }
  return null;
}

/** 收集一张界面上「有变量名的输入元素」列表（预览渲染与导出播放器共用）。 */
export function namedInputs(screen: ScreenData | undefined): ScreenElement[] {
  if (!screen) return [];
  return (screen.elements ?? []).filter((el) => el.kind === "input" && Boolean(el.name));
}
