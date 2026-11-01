import assert from "node:assert/strict";
import test from "node:test";
import {
  createAnnotation,
  deleteAnnotation,
  getAnnotationStats,
  getAnnotationsByTarget,
  parseAnnotations,
  serializeAnnotations,
  sortAnnotationsByTime,
  updateAnnotation,
  validateAnnotation,
} from "../src/flow/annotations.ts";
import type { Annotation } from "../src/flow/annotations.ts";

const T1 = "2026-10-31T01:00:00.000Z";
const T2 = "2026-10-31T02:00:00.000Z";
const T3 = "2026-10-31T03:00:00.000Z";

function makeAnnotation(id: string, overrides: Partial<Annotation> = {}): Annotation {
  return {
    id,
    targetType: "node",
    targetId: "node-1",
    content: `content-${id}`,
    color: "yellow",
    createdAt: T1,
    updatedAt: T1,
    ...overrides,
  };
}

test("createAnnotation 生成完整批注并使用默认值", () => {
  const annotation = createAnnotation({
    id: "annotation-1",
    targetType: "node",
    targetId: "node-1",
    content: "需要补充空状态",
    author: "Alice",
    createdAt: T1,
  });

  assert.deepEqual(annotation, {
    id: "annotation-1",
    targetType: "node",
    targetId: "node-1",
    content: "需要补充空状态",
    color: "yellow",
    author: "Alice",
    createdAt: T1,
    updatedAt: T1,
  });
});

test("validateAnnotation 拒绝空内容、非法颜色和倒序时间", () => {
  const valid = makeAnnotation("valid");

  assert.equal(validateAnnotation(valid), true);
  assert.equal(validateAnnotation({ ...valid, content: "   " }), false);
  assert.equal(validateAnnotation({ ...valid, color: "purple" }), false);
  assert.equal(validateAnnotation({ ...valid, updatedAt: "2026-10-30T23:00:00.000Z" }), false);
});

test("updateAnnotation 不可变地修改内容并刷新 updatedAt", () => {
  const original = makeAnnotation("annotation-1", { author: "Alice" });
  const annotations = [original];

  const next = updateAnnotation(
    annotations,
    "annotation-1",
    { content: "改为检查加载态", color: "green" },
    new Date(T2),
  );

  assert.notEqual(next, annotations);
  assert.equal(original.content, "content-annotation-1");
  assert.equal(original.color, "yellow");
  assert.deepEqual(next[0], {
    ...original,
    content: "改为检查加载态",
    color: "green",
    updatedAt: T2,
  });
});

test("deleteAnnotation 只删除匹配 id 的批注", () => {
  const first = makeAnnotation("annotation-1");
  const second = makeAnnotation("annotation-2", { targetType: "edge", targetId: "edge-1" });
  const annotations = [first, second];

  const remaining = deleteAnnotation(annotations, "annotation-1");

  assert.deepEqual(remaining, [second]);
  assert.equal(annotations.length, 2);
});

test("serializeAnnotations 与 parseAnnotations 可往返有效批注", () => {
  const annotations = [
    makeAnnotation("annotation-1"),
    makeAnnotation("annotation-2", { color: "blue", createdAt: T2, updatedAt: T2 }),
  ];

  const encoded = serializeAnnotations(annotations);

  assert.deepEqual(JSON.parse(encoded), annotations);
  assert.deepEqual(parseAnnotations(encoded), annotations);
});

test("parseAnnotations 对非法 JSON、非法项和旧数据安全处理", () => {
  const valid = makeAnnotation("valid");
  const legacy = {
    id: "legacy",
    targetType: "edge",
    targetId: "edge-1",
    content: "旧版本批注",
    createdAt: T1,
  };

  assert.deepEqual(parseAnnotations("{not-json"), []);
  assert.deepEqual(parseAnnotations(JSON.stringify({ annotations: [valid, { id: "" }] })), [valid]);
  assert.deepEqual(parseAnnotations(JSON.stringify([valid, { id: "" }, legacy])), [
    valid,
    {
      ...legacy,
      color: "yellow",
      updatedAt: T1,
    },
  ]);
});

test("getAnnotationsByTarget 按目标过滤并按创建时间升序排列", () => {
  const later = makeAnnotation("later", { createdAt: T2, updatedAt: T2 });
  const edge = makeAnnotation("edge", {
    targetType: "edge",
    targetId: "node-1",
    createdAt: T3,
    updatedAt: T3,
  });
  const earlier = makeAnnotation("earlier");
  const otherTarget = makeAnnotation("other", { targetId: "node-2" });

  const result = getAnnotationsByTarget([later, edge, earlier, otherTarget], "node", "node-1");

  assert.deepEqual(result.map((annotation) => annotation.id), ["earlier", "later"]);
});

test("sortAnnotationsByTime 不修改输入并可降序排列", () => {
  const earlier = makeAnnotation("earlier");
  const later = makeAnnotation("later", { createdAt: T2, updatedAt: T3 });
  const annotations = [later, earlier];

  const sorted = sortAnnotationsByTime(annotations, "desc");

  assert.deepEqual(sorted.map((annotation) => annotation.id), ["later", "earlier"]);
  assert.deepEqual(annotations.map((annotation) => annotation.id), ["later", "earlier"]);
});

test("getAnnotationStats 汇总目标类型、颜色、作者与最近更新时间", () => {
  const first = makeAnnotation("annotation-1", { author: "Alice", color: "blue" });
  const second = makeAnnotation("annotation-2", { author: "Alice", createdAt: T2, updatedAt: T2 });
  const third = makeAnnotation("annotation-3", {
    targetType: "edge",
    targetId: "edge-1",
    color: "red",
    author: "Bob",
    createdAt: T3,
    updatedAt: T3,
  });

  assert.deepEqual(getAnnotationStats([first, second, third]), {
    total: 3,
    byTargetType: { node: 2, edge: 1 },
    byColor: { yellow: 1, blue: 1, green: 0, red: 1 },
    authorCount: 2,
    latestUpdatedAt: T3,
  });
});
