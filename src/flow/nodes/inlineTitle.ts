/**
 * §8-4 节点标题原地编辑：提交净化（纯函数，Node 测试可直跑；UI 组件在同目录 InlineTitle.tsx）。
 */

/** 提交净化：trim（折叠连续空白）后为空视为放弃（回退原标题）；与原标题相同返回 null（跳过提交）。 */
export function sanitizeTitleInput(raw: string, current: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t || t === current) return null;
  return t;
}
