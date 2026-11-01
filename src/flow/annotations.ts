export const ANNOTATION_TARGET_TYPES = ["node", "edge"] as const;
export const ANNOTATION_COLORS = ["yellow", "blue", "green", "red"] as const;

export type AnnotationTargetType = (typeof ANNOTATION_TARGET_TYPES)[number];
export type AnnotationColor = (typeof ANNOTATION_COLORS)[number];

/** 绑定到节点或连线上的独立批注数据，不依赖 React Flow 或 DOM。 */
export type Annotation = {
  id: string;
  targetType: AnnotationTargetType;
  targetId: string;
  content: string;
  color: AnnotationColor;
  author?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateAnnotationInput = {
  id?: string;
  targetType: AnnotationTargetType;
  targetId: string;
  content: string;
  color?: AnnotationColor;
  author?: string;
  createdAt?: string | number | Date;
};

export type UpdateAnnotationPatch = {
  targetType?: AnnotationTargetType;
  targetId?: string;
  content?: string;
  color?: AnnotationColor;
  /** 传 null 可移除作者。 */
  author?: string | null;
};

export type AnnotationSortDirection = "asc" | "desc";

export type AnnotationStats = {
  total: number;
  byTargetType: Record<AnnotationTargetType, number>;
  byColor: Record<AnnotationColor, number>;
  authorCount: number;
  latestUpdatedAt: string | null;
};

let annotationIdSequence = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTargetType(value: unknown): value is AnnotationTargetType {
  return value === "node" || value === "edge";
}

function isAnnotationColor(value: unknown): value is AnnotationColor {
  return typeof value === "string" && (ANNOTATION_COLORS as readonly string[]).includes(value);
}

function timestampToMs(value: unknown): number | null {
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function normalizeTimestamp(value: unknown): string | null {
  const ms = timestampToMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function createAnnotationId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `annotation-${uuid}`;
  annotationIdSequence += 1;
  return `annotation-${Date.now().toString(36)}-${annotationIdSequence.toString(36)}`;
}

/** 创建批注；缺省颜色为黄色，updatedAt 默认与 createdAt 相同。 */
export function createAnnotation(input: CreateAnnotationInput): Annotation {
  const createdAt = input.createdAt === undefined
    ? new Date().toISOString()
    : normalizeTimestamp(input.createdAt);
  if (!createdAt) throw new TypeError("Annotation createdAt is invalid");

  const id = normalizeText(input.id) || createAnnotationId();
  const targetId = normalizeText(input.targetId);
  const content = normalizeText(input.content);
  const author = normalizeText(input.author);
  const annotation: Annotation = {
    id,
    targetType: input.targetType,
    targetId,
    content,
    color: input.color ?? "yellow",
    ...(author ? { author } : {}),
    createdAt,
    updatedAt: createdAt,
  };

  if (!validateAnnotation(annotation)) throw new TypeError("Annotation data is invalid");
  return annotation;
}

/** 运行时校验，供反序列化与集成层在信任数据前使用。 */
export function validateAnnotation(value: unknown): value is Annotation {
  if (!isRecord(value)) return false;
  if (!normalizeText(value.id) || !normalizeText(value.targetId) || !normalizeText(value.content)) return false;
  if (!isTargetType(value.targetType) || !isAnnotationColor(value.color)) return false;
  if (value.author !== undefined && typeof value.author !== "string") return false;
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") return false;

  const createdAt = timestampToMs(value.createdAt);
  const updatedAt = timestampToMs(value.updatedAt);
  return createdAt !== null && updatedAt !== null && updatedAt >= createdAt;
}

/** 更新匹配 id 的批注；未命中或补丁无效时原样返回输入数组。 */
export function updateAnnotation(
  annotations: Annotation[],
  id: string,
  patch: UpdateAnnotationPatch,
  now: string | number | Date = new Date(),
): Annotation[] {
  const current = annotations.find((annotation) => annotation.id === id);
  if (!current) return annotations;

  const requestedUpdatedAt = normalizeTimestamp(now);
  if (!requestedUpdatedAt) return annotations;

  const currentUpdatedAt = timestampToMs(current.updatedAt);
  const updatedAt = currentUpdatedAt !== null && timestampToMs(requestedUpdatedAt)! < currentUpdatedAt
    ? current.updatedAt
    : requestedUpdatedAt;
  const author = patch.author === null
    ? undefined
    : patch.author === undefined
      ? current.author
      : normalizeText(patch.author);

  const next: Annotation = {
    id: current.id,
    targetType: patch.targetType ?? current.targetType,
    targetId: patch.targetId === undefined ? current.targetId : normalizeText(patch.targetId),
    content: patch.content === undefined ? current.content : normalizeText(patch.content),
    color: patch.color ?? current.color,
    ...(author ? { author } : {}),
    createdAt: current.createdAt,
    updatedAt,
  };

  if (!validateAnnotation(next)) return annotations;
  return annotations.map((annotation) => annotation.id === id ? next : annotation);
}

/** 删除匹配 id 的批注，不修改原数组。 */
export function deleteAnnotation(annotations: Annotation[], id: string): Annotation[] {
  const next = annotations.filter((annotation) => annotation.id !== id);
  return next.length === annotations.length ? annotations : next;
}

/** 序列化为可写入 localStorage 或导出 JSON 的字符串。 */
export function serializeAnnotations(annotations: Annotation[]): string {
  return JSON.stringify(annotations);
}

function normalizeLegacyAnnotation(value: unknown): Annotation | null {
  if (!isRecord(value)) return null;

  const createdAt = normalizeTimestamp(value.createdAt);
  if (!createdAt) return null;

  const updatedAt = normalizeTimestamp(value.updatedAt) ?? createdAt;
  const author = normalizeText(value.author);
  const annotation: Annotation = {
    id: normalizeText(value.id),
    targetType: value.targetType as AnnotationTargetType,
    targetId: normalizeText(value.targetId),
    content: normalizeText(value.content),
    color: isAnnotationColor(value.color) ? value.color : "yellow",
    ...(author ? { author } : {}),
    createdAt,
    updatedAt,
  };

  return validateAnnotation(annotation) ? annotation : null;
}

/**
 * 安全解析批注。支持数组、`{ annotations: [...] }` 与单个旧版对象；
 * 非法 JSON、未知结构和非法项会被忽略。
 */
export function parseAnnotations(input: unknown): Annotation[] {
  let parsed = input;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input) as unknown;
    } catch {
      return [];
    }
  }

  const items = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.annotations)
      ? parsed.annotations
      : [parsed];

  const annotations: Annotation[] = [];
  for (const item of items) {
    const annotation = normalizeLegacyAnnotation(item);
    if (annotation) annotations.push(annotation);
  }
  return annotations;
}

/** 按目标过滤批注，默认按创建时间升序返回。 */
export function getAnnotationsByTarget(
  annotations: Annotation[],
  targetType: AnnotationTargetType,
  targetId: string,
): Annotation[] {
  return sortAnnotationsByTime(
    annotations.filter(
      (annotation) => annotation.targetType === targetType && annotation.targetId === targetId,
    ),
  );
}

/** 按创建时间排序；时间相同则用更新时间、id 保证结果稳定，且不修改输入。 */
export function sortAnnotationsByTime(
  annotations: Annotation[],
  direction: AnnotationSortDirection = "asc",
): Annotation[] {
  const factor = direction === "desc" ? -1 : 1;
  return annotations.slice().sort((a, b) => {
    const createdDiff = timestampToMs(a.createdAt)! - timestampToMs(b.createdAt)!;
    if (createdDiff !== 0) return createdDiff * factor;
    const updatedDiff = timestampToMs(a.updatedAt)! - timestampToMs(b.updatedAt)!;
    if (updatedDiff !== 0) return updatedDiff * factor;
    return a.id.localeCompare(b.id) * factor;
  });
}

/** 汇总批注数量、目标类型、颜色、作者与最近更新时间。 */
export function getAnnotationStats(annotations: Annotation[]): AnnotationStats {
  const byTargetType: Record<AnnotationTargetType, number> = { node: 0, edge: 0 };
  const byColor: Record<AnnotationColor, number> = { yellow: 0, blue: 0, green: 0, red: 0 };
  const authors = new Set<string>();
  let latestUpdatedAt: string | null = null;

  for (const annotation of annotations) {
    byTargetType[annotation.targetType] += 1;
    byColor[annotation.color] += 1;
    const author = normalizeText(annotation.author);
    if (author) authors.add(author);
    if (
      latestUpdatedAt === null
      || (timestampToMs(annotation.updatedAt) ?? 0) > (timestampToMs(latestUpdatedAt) ?? 0)
    ) {
      latestUpdatedAt = annotation.updatedAt;
    }
  }

  return {
    total: annotations.length,
    byTargetType,
    byColor,
    authorCount: authors.size,
    latestUpdatedAt,
  };
}
