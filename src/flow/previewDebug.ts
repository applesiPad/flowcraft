/**
 * 原型预览的调试数据：变量表整理、走查轨迹格式化。
 *
 * 「走查轨迹」是实际走过的界面序列（含重复访问），与面包屑（可回退的栈）不同：
 * 回退不抹掉轨迹，重新开始才清空——PM 演示/自测时关心的是真实路径。
 *
 * 纯函数、无 DOM 依赖，Node 测试可直接 import。
 */
import type { Node } from "@xyflow/react";
import type { ScreenData } from "./types.ts";
import { namedInputs } from "./prototypeLogic.ts";

/** 轨迹里的一步：落在哪张界面、经由哪条连线（起点 via=null） */
export type TrailStep = {
  screenId: string;
  title: string;
  /** 连线文案，如「点击「登录」」；起点为 null */
  via: string | null;
};

/** 变量表里的一行：变量名 → 当前值 → 值来自哪张界面（最后一次写入的界面） */
export type DebugVar = {
  name: string;
  value: string;
  source: string;
};

/** 变量名 → 界面标题：预览里收集到的每个变量都能定位到来源输入框 */
export function varSourceMap(nodes: Node[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const node of nodes) {
    if (node.type !== "screen") continue;
    const title = (node.data as unknown as ScreenData).title || node.id;
    for (const el of namedInputs(node.data as unknown as ScreenData)) {
      if (el.name) out[el.name] = title;
    }
  }
  return out;
}

/** 变量表 → 调试面板行：按变量名排序，值未定义显示为空串 */
export function debugVarEntries(vars: Record<string, string>, sources: Record<string, string>): DebugVar[] {
  return Object.keys(vars)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, value: vars[name] ?? "", source: sources[name] ?? "未知界面" }));
}

/** 轨迹 → 可复制的一句话：「登录 →[点击「登录」]→ 工作台 →[点击「去支付」]→ 支付成功」 */
export function formatTrail(steps: TrailStep[]): string {
  if (!steps.length) return "";
  const parts: string[] = [steps[0].title || steps[0].screenId];
  for (let i = 1; i < steps.length; i++) {
    parts.push(`→[${steps[i].via ?? "?"}]→`);
    parts.push(steps[i].title || steps[i].screenId);
  }
  return parts.join(" ");
}
