import type {
  ElementKind,
  ScreenData,
  ScreenElement,
  ScreenTemplate,
} from "./types.ts";

export type TemplateCategory = "登录" | "列表" | "详情" | "设置" | "支付" | "其他";

export type TemplateBundle = {
  version: 1;
  exportedAt: string;
  templates: ScreenTemplate[];
};

const ELEMENT_KINDS = new Set<ElementKind>([
  "logo",
  "input",
  "button",
  "list-item",
  "card",
  "search",
  "tabbar",
  "text",
  "toggle",
  "banner",
  "chip",
  "avatar",
  "divider",
]);

const TEMPLATE_CATEGORIES: TemplateCategory[] = ["登录", "列表", "详情", "设置", "支付", "其他"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === "string";

const isOptionalBoolean = (value: unknown): value is boolean | undefined =>
  value === undefined || typeof value === "boolean";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function isValidBox(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.w)) {
    return false;
  }
  if (value.w <= 0) return false;
  return value.h === undefined || (isFiniteNumber(value.h) && value.h > 0);
}

function isValidElement(value: unknown): value is ScreenElement {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id) || typeof value.kind !== "string" || !ELEMENT_KINDS.has(value.kind as ElementKind)) {
    return false;
  }
  if (
    !isOptionalString(value.label) ||
    !isOptionalString(value.sublabel) ||
    !isOptionalString(value.placeholder) ||
    !isOptionalString(value.icon) ||
    !isOptionalString(value.action)
  ) {
    return false;
  }
  if (value.tone !== undefined && value.tone !== "primary" && value.tone !== "ghost" && value.tone !== "danger") {
    return false;
  }
  if (!isOptionalBoolean(value.hotspot)) return false;
  return value.box === undefined || isValidBox(value.box);
}

export function validateTemplate(value: unknown): value is ScreenTemplate {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.name) || !isNonEmptyString(value.icon) || !isOptionalString(value.id)) {
    return false;
  }
  if (!isRecord(value.data)) return false;

  const data = value.data;
  if (!isNonEmptyString(data.title) || !Array.isArray(data.elements)) return false;
  if (data.subtitle !== undefined && typeof data.subtitle !== "string") return false;
  if (data.platform !== undefined && data.platform !== "mobile") return false;
  if (data.theme !== undefined && data.theme !== "light" && data.theme !== "dark") return false;
  if (data.layout !== undefined && data.layout !== "stack" && data.layout !== "free") return false;
  return data.elements.every(isValidElement);
}

function cleanElement(value: ScreenElement): ScreenElement {
  const element: ScreenElement = { id: value.id.trim(), kind: value.kind };
  if (value.label !== undefined) element.label = value.label;
  if (value.sublabel !== undefined) element.sublabel = value.sublabel;
  if (value.placeholder !== undefined) element.placeholder = value.placeholder;
  if (value.tone !== undefined) element.tone = value.tone;
  if (value.icon !== undefined) element.icon = value.icon;
  if (value.hotspot !== undefined) element.hotspot = value.hotspot;
  if (value.action !== undefined) element.action = value.action;
  if (value.box !== undefined) {
    element.box = { x: value.box.x, y: value.box.y, w: value.box.w };
    if (value.box.h !== undefined) element.box.h = value.box.h;
  }
  return element;
}

function cleanData(value: ScreenData): ScreenData {
  const data: ScreenData = {
    title: value.title.trim(),
    elements: value.elements.map(cleanElement),
  };
  if (value.subtitle !== undefined) data.subtitle = value.subtitle;
  if (value.platform !== undefined) data.platform = value.platform;
  if (value.theme !== undefined) data.theme = value.theme;
  if (value.layout !== undefined) data.layout = value.layout;
  return data;
}

/** 校验并深拷贝模板；非法输入返回 null。 */
export function normalizeTemplate(value: unknown): ScreenTemplate | null {
  if (!validateTemplate(value)) return null;

  const template: ScreenTemplate = {
    name: value.name.trim(),
    icon: value.icon ?? "★",
    data: cleanData(value.data),
  };
  const id = typeof value.id === "string" ? value.id.trim() : undefined;
  if (id) template.id = id;
  return template;
}

function searchableText(template: ScreenTemplate): string {
  const elementText = template.data.elements.flatMap((element) => [
    element.label,
    element.sublabel,
    element.placeholder,
    element.action,
  ]);
  return [
    template.name,
    template.data.title,
    template.data.subtitle,
    templateCategory(template),
    ...elementText,
  ]
    .filter((part): part is string => typeof part === "string")
    .join("\n")
    .toLocaleLowerCase("zh-CN");
}

export function filterTemplates(
  templates: readonly ScreenTemplate[],
  query: string,
  category?: TemplateCategory | string,
): ScreenTemplate[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const normalizedCategory = category?.trim();

  return templates.filter((template) => {
    if (!validateTemplate(template)) return false;
    if (normalizedCategory && normalizedCategory !== "全部" && normalizedCategory !== "其他" && templateCategory(template) !== normalizedCategory) {
      return false;
    }
    return normalizedQuery.length === 0 || searchableText(template).includes(normalizedQuery);
  });
}

const CATEGORY_PATTERNS: ReadonlyArray<readonly [TemplateCategory, RegExp]> = [
  ["登录", /登录|登陆|注册|sign\s*in|log\s*in|auth/i],
  ["列表", /列表|清单|目录|工作台|首页|list|feed/i],
  ["详情", /详情|信息|订单|detail|profile/i],
  ["设置", /设置|偏好|账户|账号|setting|preference/i],
  ["支付", /支付|付款|收银|结算|订单金额|pay|checkout/i],
];

/** 根据模板名称、界面标题和元素文案推断简单分类。 */
export function templateCategory(template: ScreenTemplate): TemplateCategory {
  const headline = [template.name, template.data.title, template.data.subtitle]
    .filter((part): part is string => typeof part === "string")
    .join("\n");
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(headline)) return category;
  }

  const content = template.data.elements
    .flatMap((element) => [element.label, element.sublabel, element.placeholder, element.action])
    .filter((part): part is string => typeof part === "string")
    .join("\n");
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(content)) return category;
  }
  return "其他";
}

export function getTemplateCategories(templates: readonly ScreenTemplate[]): TemplateCategory[] {
  const present = new Set(templates.filter(validateTemplate).map(templateCategory));
  return TEMPLATE_CATEGORIES.filter((category) => present.has(category));
}

let templateSequence = 0;

function createTemplateId(): string {
  templateSequence += 1;
  return `tpl-${Date.now().toString(36)}-${templateSequence.toString(36)}`;
}

function nextAvailableName(baseName: string, usedNames: Set<string>): string {
  if (!usedNames.has(baseName)) return baseName;
  let suffix = 2;
  while (usedNames.has(`${baseName} (${suffix})`)) suffix += 1;
  return `${baseName} (${suffix})`;
}

/**
 * 合并模板市场数据：同 id 由 incoming 覆盖，不同 id 的同名模板自动追加 (2)、(3)…
 * 返回规范化后的深拷贝，不修改任一输入数组。
 */
export function mergeTemplates(
  existing: readonly unknown[],
  incoming: readonly unknown[],
): ScreenTemplate[] {
  const merged = new Map<string, ScreenTemplate>();

  const accept = (raw: unknown) => {
    const template = normalizeTemplate(raw);
    if (!template) return;
    const id = template.id ?? createTemplateId();
    merged.delete(id);
    merged.set(id, { ...template, id });
  };

  for (const template of existing) accept(template);
  for (const template of incoming) accept(template);

  const usedNames = new Set<string>();
  for (const [id, template] of merged) {
    const uniqueName = nextAvailableName(template.name, usedNames);
    usedNames.add(uniqueName);
    merged.set(id, { ...template, name: uniqueName });
  }

  return [...merged.values()];
}

export function buildTemplateBundle(
  templates: readonly ScreenTemplate[],
  exportedAt: Date = new Date(),
): TemplateBundle {
  const normalized = mergeTemplates([], templates);
  return {
    version: 1,
    exportedAt: exportedAt.toISOString(),
    templates: normalized,
  };
}

function isTemplateBundle(value: unknown): value is Record<string, unknown> & { templates: unknown[] } {
  return isRecord(value) && Array.isArray(value.templates);
}

/**
 * 安全解析模板 bundle。兼容旧版直接导出的模板数组；
 * JSON 损坏或整体结构非法返回 null，非法模板条目会被过滤。
 */
export function parseTemplateBundle(text: string): TemplateBundle | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }

  if (Array.isArray(parsed)) {
    const templates = mergeTemplates([], parsed);
    return templates.length > 0 ? buildTemplateBundle(templates) : null;
  }

  if (!isTemplateBundle(parsed)) return null;
  const templates = mergeTemplates([], parsed.templates);
  if (templates.length === 0) return null;

  const exportedAt =
    typeof parsed.exportedAt === "string" && Number.isFinite(Date.parse(parsed.exportedAt))
      ? parsed.exportedAt
      : new Date().toISOString();
  return { version: 1, exportedAt, templates };
}

/** 为插入新界面创建完全独立的数据副本，避免编辑时污染市场模板。 */
export function cloneTemplateForInsert(template: ScreenTemplate): ScreenData {
  const normalized = normalizeTemplate(template);
  if (!normalized) {
    throw new TypeError("Invalid screen template");
  }
  return normalized.data;
}

