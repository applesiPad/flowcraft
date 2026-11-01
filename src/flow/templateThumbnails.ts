/**
 * 模板预览缩略图：把内置模板 / 行业模板包投影成一段自包含 SVG。
 *
 * 纯函数、无 DOM 依赖，Node 测试可直接断言字符串；Palette 通过
 * `dangerouslySetInnerHTML` 渲染。输入全部来自本地静态数据（内置模板与包定义），
 * 用户自定义模板不渲染缩略图（只有名称/图标），避免把外部字符串写进 SVG。
 *
 * 界面小卡内部按元素 kind 画迷你 UI（按钮/输入框/列表行/开关/头像…），
 * 不点开也能认出这张界面长什么样、这条链路怎么走。
 */
import type { ScreenElement, ScreenTemplate } from "./types.ts";
import { screenTemplates } from "./sample.ts";
import { PACK_NODE_SIZE, packBounds, type PackNodeSpec, type ScreenPack } from "./templatePacks.ts";

export const THUMB_W = 240;
export const THUMB_H = 120;

/** 内置模板界面的名义尺寸（与 Palette 里界面节点宽度一致）。 */
const SCREEN_W = PACK_NODE_SIZE.screen.w;
const SCREEN_H = PACK_NODE_SIZE.screen.h;

const COLORS = {
  canvas: "#f4f6fa",
  screenFill: "#ffffff",
  screenStroke: "#c9ced8",
  screenTitle: "#e9edf4",
  decisionFill: "#fdf3d7",
  decisionStroke: "#e6b94c",
  actionFill: "#e6f2ec",
  actionStroke: "#5aa17f",
  edge: "#8a93a5",
  rowUi: "#e7ebf2",
  primaryUi: "#2f6fed",
  textUi: "#aab3c2",
} as const;

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
  );

const n = (value: number) => value.toFixed(1);

/**
 * 一张界面小卡：白色圆角 + 标题条 + 迷你元素行。
 * `s` 为该卡的缩放系数（名义 320×520 → 实际 w×h）。
 */
function screenCard(elements: ScreenElement[], x: number, y: number, w: number, h: number, s: number): string {
  const parts: string[] = [
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(Math.min(3, w * 0.09))}" fill="${COLORS.screenFill}" stroke="${COLORS.screenStroke}" stroke-width="0.9"/>`,
    `<rect x="${n(x + 3 * s)}" y="${n(y + 3 * s)}" width="${n(w * 0.5)}" height="${n(Math.max(2, 4.5 * s))}" rx="1" fill="${COLORS.screenTitle}"/>`,
  ];
  const rowH = Math.max(2, 7 * s);
  const gap = 2.2 * s;
  const rx = x + 3 * s;
  const rw = w - 6 * s;
  let ry = y + 11 * s;
  for (const el of elements.slice(0, 6)) {
    if (ry + rowH > y + h - 3 * s) break;
    switch (el.kind) {
      case "button": {
        const fill = el.tone === "primary" ? COLORS.primaryUi : COLORS.screenTitle;
        parts.push(`<rect x="${n(rx)}" y="${n(ry)}" width="${n(rw * 0.62)}" height="${n(rowH)}" rx="${n(rowH / 2)}" fill="${fill}"/>`);
        break;
      }
      case "input":
      case "search":
        parts.push(`<rect x="${n(rx)}" y="${n(ry)}" width="${n(rw)}" height="${n(rowH)}" rx="${n(1.5 * s)}" fill="none" stroke="${COLORS.textUi}" stroke-width="0.8"/>`);
        break;
      case "toggle":
        parts.push(
          `<rect x="${n(rx)}" y="${n(ry + rowH * 0.2)}" width="${n(rw * 0.5)}" height="${n(rowH * 0.6)}" rx="${n(rowH * 0.3)}" fill="${COLORS.rowUi}"/>`,
          `<circle cx="${n(rx + rw * 0.5 - rowH * 0.3)}" cy="${n(ry + rowH / 2)}" r="${n(rowH * 0.22)}" fill="${COLORS.primaryUi}"/>`,
        );
        break;
      case "logo":
        parts.push(
          `<circle cx="${n(rx + rowH / 2)}" cy="${n(ry + rowH / 2)}" r="${n(rowH * 0.45)}" fill="${COLORS.primaryUi}"/>`,
          `<rect x="${n(rx + rowH + 2)}" y="${n(ry + rowH * 0.25)}" width="${n(rw * 0.4)}" height="${n(rowH * 0.5)}" rx="1" fill="${COLORS.textUi}"/>`,
        );
        break;
      case "divider":
        parts.push(`<line x1="${n(rx)}" y1="${n(ry + rowH / 2)}" x2="${n(rx + rw)}" y2="${n(ry + rowH / 2)}" stroke="${COLORS.rowUi}" stroke-width="0.8"/>`);
        break;
      default:
        // 列表行 / 卡片 / 文本 / 头像：方块 + 细线
        parts.push(
          `<rect x="${n(rx)}" y="${n(ry)}" width="${n(rowH * 0.9)}" height="${n(rowH)}" rx="${n(1.5 * s)}" fill="${COLORS.rowUi}"/>`,
          `<rect x="${n(rx + rowH * 1.2)}" y="${n(ry + rowH * 0.25)}" width="${n(rw * 0.68)}" height="${n(rowH * 0.5)}" rx="1" fill="${COLORS.rowUi}"/>`,
        );
        break;
    }
    ry += rowH + gap;
  }
  return parts.join("");
}

function svgOpen(label: string): string {
  return `<svg viewBox="0 0 ${THUMB_W} ${THUMB_H}" role="img" aria-label="${esc(label)} 缩略图" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`;
}

const SVG_CLOSE = "</svg>";

const SVG_DEFS =
  `<defs><marker id="fc-thumb-arrow" viewBox="0 0 6 6" refX="5.4" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 6 3 L 0 6 z" fill="${COLORS.edge}"/></marker></defs>`;

/** 单个内置模板的缩略图：一张居中界面卡（viewBox 240×120）。 */
export function screenThumbnailSvg(template: ScreenTemplate, label = template.name): string {
  const h = THUMB_H - 12;
  const s = h / SCREEN_H;
  const w = SCREEN_W * s;
  const x = (THUMB_W - w) / 2;
  return [
    svgOpen(label),
    `<rect x="0" y="0" width="${THUMB_W}" height="${THUMB_H}" rx="8" fill="${COLORS.canvas}"/>`,
    screenCard(template.data.elements, x, 6, w, h, s),
    SVG_CLOSE,
  ].join("");
}

function decisionDiamond(node: PackNodeSpec, s: number, dx: number, dy: number): string {
  const size = PACK_NODE_SIZE.decision;
  const x = node.x * s + dx;
  const y = node.y * s + dy;
  const w = size.w * s;
  const h = size.h * s;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return `<path d="M ${n(cx)} ${n(y)} L ${n(x + w)} ${n(cy)} L ${n(cx)} ${n(y + h)} L ${n(x)} ${n(cy)} Z" fill="${COLORS.decisionFill}" stroke="${COLORS.decisionStroke}" stroke-width="0.9"/>`;
}

function actionPill(node: PackNodeSpec, s: number, dx: number, dy: number): string {
  const size = PACK_NODE_SIZE.action;
  const x = node.x * s + dx;
  const y = node.y * s + dy;
  const w = size.w * s;
  const h = size.h * s;
  return [
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(h / 2)}" fill="${COLORS.actionFill}" stroke="${COLORS.actionStroke}" stroke-width="0.9"/>`,
    `<circle cx="${n(x + h * 0.42)}" cy="${n(y + h / 2)}" r="${n(h * 0.16)}" fill="${COLORS.actionStroke}"/>`,
    `<rect x="${n(x + h * 0.7)}" y="${n(y + h * 0.34)}" width="${n(w * 0.5)}" height="${n(h * 0.3)}" rx="1" fill="${COLORS.textUi}"/>`,
  ].join("");
}

function sourceAnchor(node: PackNodeSpec, handle: string) {
  const size = PACK_NODE_SIZE[node.kind];
  if (node.kind === "decision") {
    // yes 走右侧，no 走底部（与画布上的 handle 位置一致）
    return handle === "no"
      ? { x: node.x + size.w / 2, y: node.y + size.h }
      : { x: node.x + size.w, y: node.y + size.h / 2 };
  }
  return { x: node.x + size.w, y: node.y + size.h / 2 };
}

function targetAnchor(node: PackNodeSpec) {
  const size = PACK_NODE_SIZE[node.kind];
  return { x: node.x, y: node.y + size.h / 2 };
}

/** 模板包的缩略图：整条链路的节点 + 连线（回退边用虚线下沉）。 */
export function packThumbnailSvg(pack: ScreenPack): string {
  const bounds = packBounds(pack);
  const gw = bounds.maxX - bounds.minX;
  const gh = bounds.maxY - bounds.minY;
  const pad = 8;
  const s = Math.min((THUMB_W - pad * 2) / gw, (THUMB_H - pad * 2) / gh);
  const dx = pad + ((THUMB_W - pad * 2) - gw * s) / 2 - bounds.minX * s;
  const dy = pad + ((THUMB_H - pad * 2) - gh * s) / 2 - bounds.minY * s;

  const byKey = new Map(pack.nodes.map((node) => [node.key, node]));
  const parts: string[] = [svgOpen(pack.name), `<rect x="0" y="0" width="${THUMB_W}" height="${THUMB_H}" rx="8" fill="${COLORS.canvas}"/>`, SVG_DEFS];

  // 连线先画，节点覆盖其上
  for (const edge of pack.edges) {
    const from = byKey.get(edge.from);
    const to = byKey.get(edge.to);
    if (!from || !to) continue;
    const a = sourceAnchor(from, edge.fromHandle);
    const b = targetAnchor(to);
    const ax = a.x * s + dx;
    const ay = a.y * s + dy;
    const bx = b.x * s + dx;
    const by = b.y * s + dy;
    const back = bx < ax; // 回到左侧 => 回退/闭环边
    const dip = back ? 12 : Math.max(0, (by - ay) * 0.15);
    const path = back
      ? `M ${n(ax)} ${n(ay)} C ${n(ax + 18)} ${n(ay + dip)}, ${n(bx - 18)} ${n(by + dip)}, ${n(bx)} ${n(by)}`
      : `M ${n(ax)} ${n(ay)} C ${n((ax + bx) / 2)} ${n(ay)}, ${n((ax + bx) / 2)} ${n(by)}, ${n(bx)} ${n(by)}`;
    parts.push(
      `<path d="${path}" fill="none" stroke="${COLORS.edge}" stroke-width="0.9"${back ? ' stroke-dasharray="3 2"' : ""} marker-end="url(#fc-thumb-arrow)"/>`,
    );
  }

  for (const node of pack.nodes) {
    if (node.kind === "decision") {
      parts.push(decisionDiamond(node, s, dx, dy));
      continue;
    }
    if (node.kind === "action") {
      parts.push(actionPill(node, s, dx, dy));
      continue;
    }
    const x = node.x * s + dx;
    const y = node.y * s + dy;
    const w = PACK_NODE_SIZE.screen.w * s;
    const h = PACK_NODE_SIZE.screen.h * s;
    const template = screenTemplateFor(node);
    parts.push(screenCard(template?.data.elements ?? [], x, y, w, h, s));
  }

  parts.push(SVG_CLOSE);
  return parts.join("");
}

function screenTemplateFor(node: PackNodeSpec): ScreenTemplate | undefined {
  return screenTemplates[node.templateKey ?? ""];
}
