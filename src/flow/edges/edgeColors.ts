/**
 * 连线/热点共享色板 —— ComfyUI 风格语义配色。
 *
 * 设计约束（与 edges.tsx / nodes.tsx 共用，单一来源）：
 * - 圆点颜色 = 线颜色 = 箭头颜色，一眼可循（ComfyUI 的核心可读性特征）；
 * - 类别间色相间距 ≥ 30°，浅色主题下仍保持对比度；
 * - 同 id 恒色（语义匹配优先，未匹配按稳定哈希散列）。
 */

/** 判断节点的语义出口：是 / 否 */
export const BRANCH_COLORS = {
  yes: "#22c55e", // 绿 —— 成功/继续
  no: "#ef4444",  // 红 —— 失败/退回
} as const;

/** 普通界面热点的类别色板 */
export const FLOW_PALETTE = [
  "#6366f1", // 靛蓝 —— 主操作（提交/支付/发布）
  "#f59e0b", // 琥珀 —— 返回/回退类
  "#06b6d4", // 青   —— 列表/导航类
  "#ec4899", // 品红 —— 收藏/关注类
  "#8b5cf6", // 紫   —— 辅助动作
  "#10b981", // 翠绿 —— 确认/完成类
  "#f97316", // 橙   —— 强调操作
  "#14b8a6", // 水鸭 —— 分享/成员类
] as const;

/** 语义关键词 → 类别色索引 */
const HANDLE_SEMANTIC: { keys: string[]; paletteIndex: number }[] = [
  { keys: ["submit", "pay", "publish", "confirm"], paletteIndex: 0 }, // 主操作 → 靛蓝
  { keys: ["back", "cancel", "logout"], paletteIndex: 1 },            // 返回/取消 → 琥珀
  { keys: ["search", "row", "tab", "banner"], paletteIndex: 2 },      // 列表/导航 → 青
  { keys: ["fav", "collect", "like", "follow"], paletteIndex: 3 },    // 收藏/关注 → 品红
  { keys: ["member", "share", "invite"], paletteIndex: 7 },           // 成员/分享 → 水鸭
  { keys: ["send", "view", "refresh"], paletteIndex: 4 },             // 辅助动作 → 紫
];

/** 按 handle id 解析连线颜色：语义匹配优先，否则哈希散列到色板，保证同 id 恒色。 */
export function handleColorOf(handleId: string | null | undefined): string {
  const id = handleId ?? "";
  if (id === "yes") return BRANCH_COLORS.yes;
  if (id === "no") return BRANCH_COLORS.no;
  if (id === "out") return "#94a3b8"; // 动作节点出口：中性石板色（系统行为）
  for (const rule of HANDLE_SEMANTIC) {
    if (rule.keys.some((k) => id.includes(k))) return FLOW_PALETTE[rule.paletteIndex];
  }
  // 未匹配：稳定哈希散列到色板，避免所有未知 handle 挤成同色
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return FLOW_PALETTE[Math.abs(hash) % FLOW_PALETTE.length];
}
