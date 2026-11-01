import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPackGraph,
  packAsTemplate,
  packBounds,
  packMetrics,
  packScreenElements,
  packTemplateKeys,
  screenPacks,
  validateScreenPack,
} from "../src/flow/templatePacks.ts";
import { packThumbnailSvg, screenThumbnailSvg } from "../src/flow/templateThumbnails.ts";
import { screenTemplates } from "../src/flow/sample.ts";

test("内置行业模板包：数量与 id 唯一", () => {
  assert.ok(screenPacks.length >= 3, "至少 3 个行业包");
  const ids = screenPacks.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "包 id 不重复");
  for (const pack of screenPacks) {
    assert.ok(pack.name.trim().length > 0);
    assert.ok(pack.description.trim().length > 0);
    assert.ok(pack.tags.length >= 2, `${pack.id} 至少 2 个标签`);
  }
});

test("每个包静态自检通过（引用模板存在、出口合法、标签非空）", () => {
  for (const pack of screenPacks) {
    assert.deepEqual(validateScreenPack(pack), [], `${pack.id} 应无问题`);
  }
});

test("自检能抓出坏包：模板不存在 / 重复 key / 出口非法 / 标签为空", () => {
  const broken = {
    id: "pack-broken",
    name: "坏包",
    description: "用于测试校验",
    tags: ["测试"],
    nodes: [
      { key: "s", kind: "screen" as const, templateKey: "nope", title: "A", x: 0, y: 0 },
      { key: "s", kind: "screen" as const, templateKey: "login", title: "重复 key", x: 400, y: 0 },
      { key: "d", kind: "decision" as const, title: "缺文案", x: 800, y: 0 },
    ],
    edges: [
      { from: "missing", fromHandle: "out", to: "s", label: "起点不存在" },
      { from: "s", fromHandle: "ghost", to: "d", label: "界面没有这个热点" },
      { from: "d", fromHandle: "right", to: "s", label: "判断出口非法" },
      { from: "d", fromHandle: "yes", to: "s", label: "  " },
    ],
  };
  const problems = validateScreenPack(broken);
  assert.ok(problems.some((p) => p.includes("不存在的模板")), "模板不存在");
  assert.ok(problems.some((p) => p.includes("key 重复")), "重复 key");
  assert.ok(problems.some((p) => p.includes("缺少是/否")), "判断缺文案");
  assert.ok(problems.some((p) => p.includes("起点不存在")), "未知起点");
  assert.ok(problems.some((p) => p.includes("没有热点 ghost")), "界面热点不存在");
  assert.ok(problems.some((p) => p.includes("只能是 yes/no")), "判断出口非法");
  assert.ok(problems.some((p) => p.includes("缺少标签")), "空标签");
});

test("packTemplateKeys 保序去重且都存在于内置模板", () => {
  for (const pack of screenPacks) {
    const keys = packTemplateKeys(pack);
    assert.equal(new Set(keys).size, keys.length, `${pack.id} 模板键应去重`);
    for (const key of keys) assert.ok(screenTemplates[key], `${key} 应是内置模板`);
    const screenCount = pack.nodes.filter((n) => n.kind === "screen").length;
    assert.ok(keys.length <= screenCount, "模板键不多于界面节点");
  }
});

test("packScreenElements 最多 6 行、按 kind:label 去重", () => {
  for (const pack of screenPacks) {
    const els = packScreenElements(pack);
    assert.ok(els.length > 0 && els.length <= 6, `${pack.id} 摘要行数 1..6`);
    const dedupe = els.map((e) => `${e.kind}:${e.label ?? e.placeholder ?? e.id}`);
    assert.equal(new Set(dedupe).size, dedupe.length, "摘要行去重");
  }
});

test("packAsTemplate 摘要元素非热点、id 与包一致", () => {
  for (const pack of screenPacks) {
    const tpl = packAsTemplate(pack);
    assert.equal(tpl.id, pack.id);
    assert.ok(tpl.data.elements.length > 0);
    assert.ok(tpl.data.elements.every((e) => !e.hotspot), "包摘要不是热点");
  }
});

test("packMetrics 与包数据一致（边数 = 连线数）", () => {
  for (const pack of screenPacks) {
    const m = packMetrics(pack);
    assert.equal(m.edgeCount, pack.edges.length);
    assert.equal(m.hotspots, pack.edges.length);
    assert.equal(m.screens, pack.nodes.filter((n) => n.kind === "screen").length);
    assert.equal(
      m.decisions + m.actions + m.screens,
      pack.nodes.length,
      `${pack.id} 节点分类应穷尽`,
    );
    assert.ok(m.screens >= 4 && m.edgeCount >= 6, `${pack.id} 应是一条完整链路`);
  }
});

test("buildPackGraph：id 映射、入口固定 in、type 与坐标平移", () => {
  const pack = screenPacks[0];
  let n = 0;
  const newId = (prefix: string) => `${prefix}-${n++}`;
  const base = { x: 1000, y: 500 };
  const { nodes, edges, idByKey } = buildPackGraph(pack, base, newId);

  assert.equal(nodes.length, pack.nodes.length);
  assert.equal(edges.length, pack.edges.length);
  assert.equal(new Set(nodes.map((x) => x.id)).size, nodes.length, "节点 id 唯一");
  for (const spec of pack.nodes) {
    const node = nodes.find((x) => x.id === idByKey[spec.key]);
    assert.ok(node, `${spec.key} 应有对应节点`);
    assert.equal(node.type, spec.kind);
    assert.equal(node.position.x, base.x + spec.x);
    assert.equal(node.position.y, base.y + spec.y);
  }
  for (const edge of edges) {
    assert.ok(edge.id.startsWith("e-"), "边 id 用 e- 前缀");
    assert.equal(edge.targetHandle, "in", "界面入口固定 in");
    assert.equal(edge.type, "flow");
    assert.ok(edge.source !== edge.target, "不做自环");
    const label = (edge.data as { label?: string }).label;
    assert.ok(label && label.trim().length > 0, "边必须有标签");
  }
  // 界面节点 data 来自模板（title 被包标题覆盖）
  const first = pack.nodes.find((x) => x.kind === "screen")!;
  const node = nodes.find((x) => x.id === idByKey[first.key])!;
  const data = node.data as unknown as { title: string; elements: unknown[] };
  assert.equal(data.title, first.title);
  assert.deepEqual(data.elements, screenTemplates[first.templateKey ?? ""].data.elements);
});

test("buildPackGraph 两次调用产生不同 id（可重复插入、互不冲突）", () => {
  let counter = 0;
  const newId = (p: string) => `${p}-${counter++}`;
  const a = buildPackGraph(screenPacks[0], { x: 0, y: 0 }, newId);
  const b = buildPackGraph(screenPacks[0], { x: 0, y: 0 }, newId);
  assert.ok(a.idByKey["s-list"] !== b.idByKey["s-list"]);
  assert.equal(a.edges[0].source, a.idByKey[screenPacks[0].edges[0].from]);
});

test("packBounds 覆盖所有节点原点，供居中插入使用", () => {
  for (const pack of screenPacks) {
    const bounds = packBounds(pack);
    assert.ok(Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY));
    assert.ok(bounds.maxX > bounds.minX && bounds.maxY > bounds.minY);
    for (const node of pack.nodes) {
      assert.ok(node.x >= bounds.minX && node.x <= bounds.maxX);
      assert.ok(node.y >= bounds.minY && node.y <= bounds.maxY);
    }
  }
});

test("packThumbnailSvg：自包含 SVG、含全部界面卡、反向边虚线", () => {
  for (const pack of screenPacks) {
    const svg = packThumbnailSvg(pack);
    assert.ok(svg.startsWith("<svg"), "以 svg 根元素开始");
    assert.ok(svg.endsWith("</svg>"));
    assert.ok(svg.includes('viewBox="0 0 240 120"'));
    assert.ok(svg.includes("<defs>"), "含箭头 marker");
    assert.equal(svg.split("<svg").length - 1, 1, "只有一层 svg");
    const screens = pack.nodes.filter((nn) => nn.kind === "screen").length;
    const decisions = pack.nodes.filter((nn) => nn.kind === "decision").length;
    const paths = (svg.match(/<path/g) ?? []).length;
    assert.ok(paths >= pack.edges.length + decisions, "每条边和菱形都有 path");
    assert.ok(svg.includes("stroke-dasharray"), `${pack.id} 应有回退虚线边`);
    assert.ok(svg.includes(`aria-label="${pack.name} 缩略图"`));
    const cards = (svg.match(/fill="#ffffff"/g) ?? []).length;
    assert.equal(cards, screens, "界面卡数量与节点一致");
  }
});

test("packThumbnailSvg 对特殊字符做转义", () => {
  const risky = {
    id: "pack-risk",
    name: 'A & B <"C">',
    description: "x",
    tags: ["t"],
    nodes: [
      { key: "s1", kind: "screen" as const, templateKey: "login", title: "登录", x: 0, y: 0 },
      { key: "s2", kind: "screen" as const, templateKey: "pay", title: "支付", x: 400, y: 0 },
    ],
    edges: [{ from: "s1", fromHandle: "submit", to: "s2", label: "去支付" }],
  };
  const svg = packThumbnailSvg(risky);
  assert.ok(!svg.includes('aria-label="A & B'), "原始 & 必须转义");
  assert.ok(svg.includes("&amp;"), "& 转义为 &amp;");
  assert.ok(svg.includes("&lt;"), "< 转义为 &lt;");
  assert.ok(svg.includes("&quot;"), "引号转义为 &quot;");
});

test("screenThumbnailSvg：内置模板单卡缩略图", () => {
  for (const [key, template] of Object.entries(screenTemplates)) {
    const svg = screenThumbnailSvg(template);
    assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"), key);
    assert.ok(svg.includes('viewBox="0 0 240 120"'), key);
    assert.ok(svg.includes(`aria-label="${template.name} 缩略图"`), `${key} 应有标题`);
    assert.ok(!svg.includes("<defs>"), "单卡无连线，不需要 marker");
    const hotspotRows = template.data.elements.filter((e) => e.hotspot).length;
    const drawnRows = (svg.match(/<rect|<circle|<line/g) ?? []).length;
    assert.ok(drawnRows >= 2 + Math.min(6, hotspotRows), `${key} 应画出标题条与元素行`);
  }
});
