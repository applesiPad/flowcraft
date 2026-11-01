import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTemplateBundle,
  cloneTemplateForInsert,
  filterTemplates,
  mergeTemplates,
  normalizeTemplate,
  parseTemplateBundle,
  templateCategory,
  validateTemplate,
} from "../src/flow/templateMarket.ts";
import type { ScreenTemplate } from "../src/flow/types.ts";

const loginTemplate: ScreenTemplate = {
  id: "tpl-login",
  name: "手机号登录",
  icon: "🔐",
  data: {
    title: "账号登录",
    subtitle: "欢迎回来",
    elements: [
      { id: "phone", kind: "input", label: "手机号", placeholder: "请输入手机号" },
      { id: "submit", kind: "button", label: "登录", tone: "primary", hotspot: true },
    ],
  },
};

const listTemplate: ScreenTemplate = {
  id: "tpl-list",
  name: "项目列表",
  icon: "🗂️",
  data: {
    title: "工作台",
    elements: [
      { id: "search", kind: "search", placeholder: "搜索项目" },
      { id: "row", kind: "list-item", label: "点单小程序", sublabel: "12 个界面" },
    ],
  },
};

const detailTemplate: ScreenTemplate = {
  id: "tpl-detail",
  name: "订单详情",
  icon: "🧩",
  data: {
    title: "订单信息",
    elements: [{ id: "card", kind: "card", label: "订单号 20261031-0042" }],
  },
};

const settingsTemplate: ScreenTemplate = {
  id: "tpl-settings",
  name: "偏好设置",
  icon: "⚙️",
  data: {
    title: "设置",
    elements: [
      { id: "notify", kind: "toggle", label: "消息通知" },
      { id: "logout", kind: "button", label: "退出登录" },
    ],
  },
};

const payTemplate: ScreenTemplate = {
  id: "tpl-pay",
  name: "收银台",
  icon: "💳",
  data: {
    title: "确认支付",
    elements: [
      { id: "amount", kind: "text", label: "¥ 128.00" },
      { id: "pay", kind: "button", label: "立即支付", tone: "primary" },
    ],
  },
};

test("validateTemplate 接受合法模板并拒绝结构不完整的值", () => {
  assert.equal(validateTemplate(loginTemplate), true);
  assert.equal(validateTemplate({ ...loginTemplate, name: "  " }), false);
  assert.equal(validateTemplate({ ...loginTemplate, icon: 42 }), false);
  assert.equal(validateTemplate({ ...loginTemplate, data: { title: "缺少 elements" } }), false);
  assert.equal(
    validateTemplate({ ...loginTemplate, data: { title: "登录", elements: [{ id: "x", kind: "unknown" }] } }),
    false,
  );
  assert.equal(validateTemplate(null), false);
  assert.equal(validateTemplate("not a template"), false);
});

test("normalizeTemplate 深拷贝数据且不保留非法可选字段", () => {
  const source: ScreenTemplate = {
    ...loginTemplate,
    id: "  tpl-login  ",
    data: {
      ...loginTemplate.data,
      theme: "dark",
      elements: loginTemplate.data.elements.map((element, index) =>
        index === 0 ? { ...element, action: "输入手机号" } : { ...element },
      ),
    },
  };

  const normalized = normalizeTemplate(source);
  assert.ok(normalized);

  assert.deepEqual(normalized, {
    id: "tpl-login",
    name: "手机号登录",
    icon: "🔐",
    data: {
      title: "账号登录",
      subtitle: "欢迎回来",
      theme: "dark",
      elements: [
        { id: "phone", kind: "input", label: "手机号", placeholder: "请输入手机号", action: "输入手机号" },
        { id: "submit", kind: "button", label: "登录", tone: "primary", hotspot: true },
      ],
    },
  });
  assert.notEqual(normalized.data, source.data);
  assert.notEqual(normalized.data.elements, source.data.elements);
  assert.notEqual(normalized.data.elements[0], source.data.elements[0]);

  const withoutId = normalizeTemplate({ ...loginTemplate, id: "   " });
  assert.ok(withoutId);
  assert.equal(Object.hasOwn(withoutId, "id"), false);
});

test("filterTemplates 支持名称和界面内容搜索，并可按分类筛选", () => {
  const templates = [loginTemplate, listTemplate, detailTemplate, settingsTemplate, payTemplate];

  assert.deepEqual(filterTemplates(templates, "手机号").map((tpl) => tpl.id), ["tpl-login"]);
  assert.deepEqual(filterTemplates(templates, "搜索项目").map((tpl) => tpl.id), ["tpl-list"]);
  assert.deepEqual(filterTemplates(templates, "订单号").map((tpl) => tpl.id), ["tpl-detail"]);
  assert.deepEqual(filterTemplates(templates, "").length, 5);
  assert.deepEqual(filterTemplates(templates, "登录", "设置").map((tpl) => tpl.id), ["tpl-settings"]);
  assert.deepEqual(filterTemplates(templates, "", "登录").map((tpl) => tpl.id), ["tpl-login"]);
});

test("templateCategory 根据标题和内容推断常见分类", () => {
  assert.equal(templateCategory(loginTemplate), "登录");
  assert.equal(templateCategory(listTemplate), "列表");
  assert.equal(templateCategory(detailTemplate), "详情");
  assert.equal(templateCategory(settingsTemplate), "设置");
  assert.equal(templateCategory(payTemplate), "支付");
  assert.equal(
    templateCategory({ name: "空白页", icon: "□", data: { title: "空白", elements: [] } }),
    "其他",
  );
});

test("mergeTemplates 按 id 去重，并为同名模板生成不冲突名称", () => {
  const existing: ScreenTemplate[] = [loginTemplate, { ...loginTemplate, id: "tpl-copy" }];
  const incoming: ScreenTemplate[] = [
    { ...loginTemplate, name: "新版登录", icon: "✨" },
    { ...loginTemplate, id: "tpl-copy", name: "重复副本", icon: "🔁" },
    { ...listTemplate, name: "新版登录", icon: "🗂️" },
    { ...detailTemplate, id: "tpl-new" },
  ];

  const merged = mergeTemplates(existing, incoming);

  assert.deepEqual(merged.map((tpl) => tpl.id), ["tpl-login", "tpl-copy", "tpl-list", "tpl-new"]);
  assert.equal(merged.find((tpl) => tpl.id === "tpl-login")?.name, "新版登录");
  assert.equal(merged.find((tpl) => tpl.id === "tpl-copy")?.name, "重复副本");
  assert.equal(merged.filter((tpl) => tpl.name === "新版登录").length, 1);
  assert.equal(merged.filter((tpl) => tpl.name === "新版登录 (2)").length, 1);
  assert.equal(merged.filter((tpl) => tpl.name === "订单详情").length, 1);
});

test("mergeTemplates 会规范化无 id 模板并过滤非法项", () => {
  const existing: ScreenTemplate[] = [{ ...loginTemplate, id: undefined }];
  const invalid = { name: "坏模板", data: { title: "坏", elements: [] } } as unknown as ScreenTemplate;

  const merged = mergeTemplates(existing, [invalid, { ...loginTemplate, id: undefined, name: "第二个登录" }]);

  assert.equal(merged.length, 2);
  assert.ok(merged.every((tpl) => typeof tpl.id === "string" && tpl.id.length > 0));
  assert.notEqual(merged[0].id, merged[1].id);
  assert.equal(merged[1].name, "第二个登录");
});

test("buildTemplateBundle 和 parseTemplateBundle 可往返序列化", () => {
  const exportedAt = new Date("2026-10-31T08:00:00.000Z");
  const bundle = buildTemplateBundle([loginTemplate, listTemplate], exportedAt);
  const parsed = parseTemplateBundle(JSON.stringify(bundle));

  assert.equal(bundle.version, 1);
  assert.equal(bundle.exportedAt, exportedAt.toISOString());
  assert.equal(bundle.templates.length, 2);
  assert.deepEqual(parsed, bundle);
});

test("parseTemplateBundle 对非法 JSON 和非 bundle 数据返回 null", () => {
  assert.equal(parseTemplateBundle("{"), null);
  assert.equal(parseTemplateBundle("null"), null);
  assert.equal(parseTemplateBundle("[]"), null);
  assert.equal(parseTemplateBundle(JSON.stringify({ version: 1, templates: "bad" })), null);
});

test("parseTemplateBundle 过滤非法模板并接受旧版模板数组", () => {
  const invalid = { name: "坏模板", data: { title: "坏", elements: [] } };
  const bundle = parseTemplateBundle(
    JSON.stringify({
      version: 99,
      exportedAt: "not-a-date",
      templates: [loginTemplate, invalid, { ...listTemplate, icon: 123 }],
    }),
  );

  assert.ok(bundle);
  assert.equal(bundle.version, 1);
  assert.equal(typeof bundle.exportedAt, "string");
  assert.deepEqual(bundle.templates.map((tpl) => tpl.id), ["tpl-login"]);

  const legacy = parseTemplateBundle(JSON.stringify([detailTemplate, invalid]));
  assert.ok(legacy);
  assert.deepEqual(legacy.templates.map((tpl) => tpl.id), ["tpl-detail"]);
});

test("cloneTemplateForInsert 生成可独立修改的界面数据", () => {
  const first = cloneTemplateForInsert(loginTemplate);
  const second = cloneTemplateForInsert(loginTemplate);

  assert.deepEqual(first, loginTemplate.data);
  assert.notEqual(first, loginTemplate.data);
  assert.notEqual(first.elements, loginTemplate.data.elements);
  assert.notEqual(first.elements[0], loginTemplate.data.elements[0]);
  assert.notEqual(first.elements, second.elements);
  assert.notEqual(first.elements[0], second.elements[0]);

  first.elements[0].label = "邮箱";
  first.elements.push({ id: "extra", kind: "text", label: "新增" });
  assert.equal(loginTemplate.data.elements[0].label, "手机号");
  assert.equal(loginTemplate.data.elements.length, 2);
});





