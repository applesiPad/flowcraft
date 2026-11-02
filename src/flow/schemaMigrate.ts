/**
 * JSON 导入的 schema 版本检查、迁移链与逐项校验。
 *
 * - 导出端始终写 `CURRENT_SCHEMA_VERSION`；导入端可能遇到旧版本（缺字段、旧结构）、
 *   未来版本（无法识别的结构）或损坏文件。
 * - 迁移是显式的函数链：每个版本一步，永远从旧版本单向升级到当前版本，
 *   每一步把「做了什么」转成可读文案，导入后面板直接展示。
 * - 校验输出逐条 ImportIssue（level + 定位 + 人话），不再是一句笼统报错。
 *
 * 纯函数、无 DOM 依赖，Node 测试可直接 import。
 */
import type { Edge, Node } from "@xyflow/react";
import { parseAnnotations, type Annotation } from "./annotations.ts";
import { normalizeCondition } from "./prototypeLogic.ts";
import type { InputValidation, ScreenData } from "./types.ts";

/** 当前导出/导入的 schema 版本。每次数据结构变更 +1，并在 MIGRATIONS 里补一步迁移。 */
export const CURRENT_SCHEMA_VERSION = 3;

const KNOWN_NODE_TYPES = new Set(["screen", "decision", "action", "note"]);
const KNOWN_VALIDATIONS = new Set<InputValidation>(["required", "phone", "number"]);

export type ImportIssueLevel = "error" | "warning";

export type ImportIssue = {
  id: string;
  level: ImportIssueLevel;
  /** 人话定位：文件级 / 第 N 个节点 / 连线「标签」… */
  path: string;
  message: string;
};

export type ImportResult = {
  /** false = 文件无法导入（不是 JSON / 没有 nodes / 版本比当前应用更新） */
  ok: boolean;
  nodes: Node[];
  edges: Edge[];
  annotations: Annotation[];
  issues: ImportIssue[];
  /** 每步迁移一条可读文案，如「v1 → v2：补齐批注数组」 */
  migrations: string[];
  /** 文件声明的版本；null = 未声明（按无批注的 v1 处理） */
  declaredVersion: number | null;
};

function issue(level: ImportIssueLevel, path: string, message: string): ImportIssue {
  return { id: `${level}:${path}:${message}`, level, path, message };
}

function inferVersion(raw: unknown): number | null {
  const version = (raw as { version?: unknown })?.version;
  if (typeof version === "number" && Number.isFinite(version)) return Math.floor(version);
  return null;
}

/** 元素规范化（v3 语义）：变量名 trim，非法校验规则剔除并告警。返回 null 表示元素本身不合法。 */
function normalizeElement(raw: unknown, path: string, issues: ImportIssue[]): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    issues.push(issue("warning", path, "元素不是对象，已跳过"));
    return null;
  }
  const el = { ...(raw as Record<string, unknown>) };
  if (typeof el.name === "string") {
    const name = el.name.trim();
    if (name !== el.name) {
      el.name = name;
      issues.push(issue("warning", path, `变量名「${el.name}」首尾空格已去除`));
    }
    if (!name) delete el.name;
  }
  if (el.validation !== undefined && el.validation !== null && !KNOWN_VALIDATIONS.has(el.validation as InputValidation)) {
    issues.push(issue("warning", path, `未知校验规则「${String(el.validation)}」已移除（该输入框将不做校验）`));
    delete el.validation;
  }
  return el;
}

function normalizeScreenData(nodeId: string, data: unknown, issues: ImportIssue[]): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const d = { ...(data as Record<string, unknown>) };
  if (Array.isArray(d.elements)) {
    const kept: Record<string, unknown>[] = [];
    d.elements.forEach((el: unknown, i: number) => {
      const normalized = normalizeElement(el, `节点 ${nodeId} 的第 ${i + 1} 个元素`, issues);
      if (normalized) kept.push(normalized);
    });
    d.elements = kept;
  }
  return d;
}

/** 判断/动作节点条件规范化：非法条件清空并告警（运行时按默认「是」分支处理）。 */
function normalizeDecisionData(nodeId: string, data: unknown, issues: ImportIssue[]): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const d = { ...(data as Record<string, unknown>) };
  if (d.condition !== undefined && d.condition !== null) {
    const normalized = normalizeCondition(d.condition);
    if (!normalized) {
      issues.push(issue("warning", `节点 ${nodeId}`, "条件不完整已清空，原型走查时该判断按默认「是」分支"));
      d.condition = null;
    } else {
      d.condition = normalized;
    }
  }
  return d;
}

function migrateNodes(rawNodes: unknown[], issues: ImportIssue[]): Node[] {
  const nodes: Node[] = [];
  const seen = new Set<string>();
  rawNodes.forEach((raw, index) => {
    const path = `第 ${index + 1} 个节点`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issues.push(issue("warning", path, "不是对象，已跳过"));
      return;
    }
    const node = { ...(raw as Node) };
    if (typeof node.id !== "string" || !node.id.trim()) {
      issues.push(issue("error", path, `缺少 id，已跳过（原值：${JSON.stringify(node.id ?? null)}）`));
      return;
    }
    if (seen.has(node.id)) {
      issues.push(issue("error", path, `id「${node.id}」重复，后者已跳过`));
      return;
    }
    seen.add(node.id);
    if (node.type && !KNOWN_NODE_TYPES.has(node.type)) {
      issues.push(issue("warning", path, `未知节点类型「${node.type}」，画布上将不渲染（数据保留）`));
    }
    if (node.type === "screen") {
      node.data = normalizeScreenData(node.id, node.data, issues) as unknown as Node["data"];
    }
    if (node.type === "decision") {
      node.data = normalizeDecisionData(node.id, node.data, issues) as unknown as Node["data"];
    }
    nodes.push(node);
  });
  return nodes;
}

function migrateEdges(rawEdges: unknown, nodes: Node[], issues: ImportIssue[]): Edge[] {
  if (!Array.isArray(rawEdges)) return [];
  const ids = new Set(nodes.map((n) => n.id));
  const edges: Edge[] = [];
  rawEdges.forEach((raw, index) => {
    const path = `第 ${index + 1} 条连线`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issues.push(issue("warning", path, "不是对象，已跳过"));
      return;
    }
    const edge = { ...(raw as Edge) };
    if (typeof edge.id !== "string" || !edge.id.trim()) {
      issues.push(issue("warning", path, "缺少 id，已跳过"));
      return;
    }
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      const missing = !ids.has(edge.source) ? edge.source : edge.target;
      issues.push(issue("warning", path, `端点「${missing}」在节点里不存在，这条连线已丢弃`));
      return;
    }
    edges.push(edge);
  });
  return edges;
}

function migrateAnnotations(raw: unknown, nodes: Node[], edges: Edge[], issues: ImportIssue[]): Annotation[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    issues.push(issue("warning", "批注", "批注数据不是数组，已整体忽略"));
    return [];
  }
  const parsed = parseAnnotations(raw);
  if (parsed.length < raw.length) {
    issues.push(issue("warning", "批注", `${raw.length - parsed.length} 条批注字段不完整，已忽略`));
  }
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edgeIds = new Set(edges.map((e) => e.id));
  const kept = parsed.filter((a) => (a.targetType === "node" ? nodeIds.has(a.targetId) : edgeIds.has(a.targetId)));
  if (kept.length < parsed.length) {
    issues.push(issue("warning", "批注", `${parsed.length - kept.length} 条批注指向的界面/连线已不存在，已忽略`));
  }
  return kept;
}

/**
 * 解析导入的流程 JSON：检查版本 → 逐版本迁移 → 逐项校验。
 * 结构能修复就修复（降级 + 告警），只有整份文件不可读或版本过新才 ok=false。
 */
export function parseFlowFile(raw: string): ImportResult {
  const issues: ImportIssue[] = [];
  const migrations: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "未知解析错误";
    issues.push(issue("error", "文件", `不是合法的 JSON：${detail}`));
    return emptyResult(false, issues, migrations, null);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    issues.push(issue("error", "文件", "顶层不是 JSON 对象，不是 FlowCraft 流程文件"));
    return emptyResult(false, issues, migrations, null);
  }
  if (!Array.isArray((parsed as { nodes?: unknown }).nodes)) {
    issues.push(issue("error", "文件", "缺少 nodes 数组，不是 FlowCraft 流程文件"));
    return emptyResult(false, issues, migrations, null);
  }

  const declaredVersion = inferVersion(parsed);
  // 未声明版本：有 annotations 数组按 v2 处理，否则按 v1
  const fromVersion = declaredVersion ?? (Array.isArray((parsed as { annotations?: unknown }).annotations) ? 2 : 1);
  if (declaredVersion !== null && declaredVersion > CURRENT_SCHEMA_VERSION) {
    issues.push(
      issue(
        "error",
        "文件",
        `文件版本 v${declaredVersion} 比当前应用（v${CURRENT_SCHEMA_VERSION}）更新，请先升级 FlowCraft 再导入`,
      ),
    );
    return emptyResult(false, issues, migrations, declaredVersion);
  }

  const source = parsed as { nodes: unknown[]; edges?: unknown; annotations?: unknown };
  if (fromVersion < 2) {
    migrations.push(`v${fromVersion} → v2：补齐批注数组（旧版流程不带批注）`);
  }
  if (fromVersion < 3) {
    migrations.push(`v2 → v3：规范化元素变量名 / 校验规则与判断条件（非法值降级并逐条提示）`);
  }

  const nodes = migrateNodes(source.nodes, issues);
  const edges = migrateEdges(source.edges, nodes, issues);
  const annotations = fromVersion >= 2 ? migrateAnnotations(source.annotations, nodes, edges, issues) : [];
  if (!nodes.length) {
    issues.push(issue("error", "文件", "没有可用节点：所有节点都缺少 id 或不是对象"));
    return emptyResult(false, issues, migrations, declaredVersion);
  }

  return { ok: true, nodes, edges, annotations, issues, migrations, declaredVersion };
}

function emptyResult(ok: boolean, issues: ImportIssue[], migrations: string[], declaredVersion: number | null): ImportResult {
  return { ok, nodes: [], edges: [], annotations: [], issues, migrations, declaredVersion };
}

/** 导入结果的一行摘要（toast 用） */
export function summarizeImport(result: ImportResult): string {
  if (!result.ok) {
    const first = result.issues.find((i) => i.level === "error");
    return first ? `导入失败：${first.message}` : "导入失败：文件结构不合法";
  }
  const warnings = result.issues.filter((i) => i.level === "warning").length;
  const base = `已导入 ${result.nodes.length} 个节点 / ${result.edges.length} 条连线 / ${result.annotations.length} 条批注`;
  return warnings ? `${base}，${warnings} 条提示待确认` : base;
}

/** 屏幕数据在导入侧的最小类型收窄（App 里复用，避免 as 链散落） */
export function screenDataOf(node: Node): ScreenData | undefined {
  if (node.type !== "screen") return undefined;
  return node.data as unknown as ScreenData;
}
