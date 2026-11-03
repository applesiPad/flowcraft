/**
 * AI 助手 MVP 测试：文本解析 / 流程规划 / 打包校验 / 实例化 / 补线建议。
 * 全部纯函数，无 DOM 依赖。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  splitSteps,
  templateForStep,
  planFlowFromText,
  detectScenario,
  buildAiPack,
  primaryHotspotOf,
  suggestWires,
  findBlankAnchor,
  AI_EXAMPLES,
} from "../src/flow/aiFlow.ts";
import { buildPackGraph, validateScreenPack, type ScreenPack } from "../src/flow/templatePacks.ts";
import { screenTemplates } from "../src/flow/sample.ts";

test("AI 切分：箭头/顿号/换行/然后 都能拆成步骤", () => {
  assert.deepEqual(splitSteps("首页 → 商品详情 → 支付"), ["首页", "商品详情", "支付"]);
  assert.deepEqual(splitSteps("首页、搜索、详情页"), ["首页", "搜索", "详情页"]);
  assert.deepEqual(splitSteps("首页\n然后 选择商品\n接着 支付"), ["首页", "选择商品", "支付"]);
  assert.deepEqual(splitSteps("首页 -> 登录 => 支付"), ["首页", "登录", "支付"]);
  // 过短的碎片（单字符）会被过滤
  assert.deepEqual(splitSteps("首页 → 的 → 支付"), ["首页", "支付"]);
});

test("AI 模板匹配：词典优先，位置回落", () => {
  assert.equal(templateForStep("登录页", 0, 3), "login");
  assert.equal(templateForStep("支付页", 1, 3), "pay");
  assert.equal(templateForStep("随便写的东西", 0, 3), "home");
  assert.equal(templateForStep("随便写的东西", 2, 3), "success");
  assert.equal(templateForStep("随便写的东西", 1, 3), "detail");
});

test("AI 场景识别", () => {
  assert.equal(detectScenario("课程学习流程"), "教育课程");
  assert.equal(detectScenario("外卖点单"), "餐饮点单");
  assert.equal(detectScenario("随便什么东西"), "通用流程");
});

test("AI 规划：主链顺序连线，decision 自动补 no-回边", () => {
  const plan = planFlowFromText("首页 → 商品详情 → 是否已登录？→ 支付成功");
  assert.equal(plan.steps.length, 4);
  assert.equal(plan.steps[0].kind, "screen");
  assert.equal(plan.steps[2].kind, "decision");
  // 主链 3 条 + decision 的 no 回边 1 条
  assert.equal(plan.links.length, 4);
  const back = plan.links.find((l) => l.label.startsWith("否"));
  assert.ok(back, "应有 no 回边");
  assert.equal(back.from, plan.steps[2].key);
  assert.equal(back.to, plan.steps[1].key, "no 分支退回上一个 screen");
});

test("AI 规划：action 步骤（通知/发送）识别为动作节点", () => {
  const plan = planFlowFromText("首页 → 下单 → 发送短信通知 → 完成");
  const action = plan.steps.find((s) => s.kind === "action");
  assert.ok(action, "发送短信通知应为 action");
  assert.ok(action.title.includes("短信"));
});

test("AI 规划：decision 后紧跟 action 时，no 回边跳过 action 落到 screen", () => {
  const plan = planFlowFromText("填表 → 是否通过？→ 发送提醒 → 首页");
  const decision = plan.steps.find((s) => s.kind === "decision");
  assert.ok(decision);
  const back = plan.links.find((l) => l.from === decision!.key && l.label.startsWith("否"));
  assert.ok(back);
  const target = plan.steps.find((s) => s.key === back!.to);
  assert.equal(target?.kind, "screen", "回边应跳过 action 指向 screen");
});

test("AI 打包：生成的 ScreenPack 通过 validateScreenPack 校验（热点真实存在）", () => {
  for (const example of AI_EXAMPLES) {
    const plan = planFlowFromText(example);
    const result = buildAiPack(plan, "测试流程");
    assert.deepEqual(result.problems, [], `示例「${example}」生成结果应零校验问题：${result.problems.join("; ")}`);
    assert.ok(result.metrics.screens >= 2, "至少两个界面");
  }
});

test("AI 打包：连线 handle 落在真实热点上（primary 优先）", () => {
  const plan = planFlowFromText("首页 → 商品详情 → 支付成功");
  const result = buildAiPack(plan, "测试");
  for (const edge of result.pack.edges) {
    const from = result.pack.nodes.find((n) => n.key === edge.from);
    if (from?.kind !== "screen") continue;
    const elements = screenTemplates[from.templateKey ?? ""].data.elements;
    const hotspotIds = elements.filter((el) => el.hotspot).map((el) => el.id);
    assert.ok(hotspotIds.includes(edge.fromHandle), `edge.fromHandle ${edge.fromHandle} 应是 ${from.key} 的热点`);
  }
});

test("AI primaryHotspotOf：优先主按钮，模板无热点时返回 null", () => {
  assert.equal(primaryHotspotOf("login"), "submit");
  assert.equal(primaryHotspotOf("success"), "back");
  assert.ok(primaryHotspotOf("home") === "row1" || primaryHotspotOf("home") !== null);
});

test("AI 打包 → buildPackGraph 实例化：节点/边齐全且可再校验", () => {
  const plan = planFlowFromText(AI_EXAMPLES[0]);
  const { pack } = buildAiPack(plan, "教育流程");
  let counter = 0;
  const graph = buildPackGraph(pack, { x: 100, y: 100 }, (prefix) => `${prefix}-test-${counter++}`);
  assert.equal(graph.nodes.length, plan.steps.length);
  assert.equal(graph.edges.length, plan.links.length);
  for (const node of graph.nodes) {
    assert.ok(node.id.startsWith("n-") || node.id.startsWith("d-") || node.id.startsWith("a-"));
    assert.ok(node.position.x >= 100);
  }
  // 实例化后的画布边：target handle 都是 in，type=flow
  for (const edge of graph.edges) {
    assert.equal(edge.type, "flow");
    assert.equal(edge.targetHandle, "in");
  }
});

test("AI 打包：id 唯一性与 pack id 可区分于手工包", () => {
  const plan = planFlowFromText("首页 → 支付");
  const { pack } = buildAiPack(plan, "唯一性");
  assert.ok(pack.id.startsWith("ai-"));
  assert.ok(pack.tags.includes("AI"));
  const keys = new Set(pack.nodes.map((n) => n.key));
  assert.equal(keys.size, pack.nodes.length);
  assert.deepEqual(validateScreenPack(pack), []);
});

test("AI 打包：未知 key 的连线被丢弃（防御性）", () => {
  const plan = planFlowFromText("首页 → 支付");
  plan.links.push({ from: "ghost", to: "s0", label: "幽灵" });
  const { pack } = buildAiPack(plan, "防御");
  assert.ok(!pack.edges.some((e) => e.from === "ghost"));
});

test("AI 打包：不同宽度节点累计布局互不重叠（含 action 240 宽）", () => {
  const plan = planFlowFromText("首页 → 提交订单 → 发送短信通知 → 支付成功");
  const { pack } = buildAiPack(plan, "布局");
  const sorted = [...pack.nodes].sort((a, b) => a.x - b.x);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const prevW = prev.kind === "screen" ? 320 : 240;
    assert.ok(
      sorted[i].x >= prev.x + prevW,
      `节点 ${sorted[i].key}(x=${sorted[i].x}) 不应与 ${prev.key}(x=${prev.x}+${prevW}) 重叠`,
    );
  }
});

test("AI 补线：死路界面给出建议，结果页闭环回首页", () => {
  const nodes = [
    { id: "n1", type: "screen", title: "工作台" },
    { id: "n2", type: "screen", title: "详情" },
    { id: "n3", type: "screen", title: "支付成功" },
  ];
  const edges = [{ source: "n1", sourceHandle: "row1" }];
  const suggestions = suggestWires(nodes, edges);
  // n2、n3 都是死路；n3 是结果页应闭环回 n1（首页）
  const forN3 = suggestions.find((s) => s.source === "n3");
  assert.ok(forN3);
  assert.equal(forN3.target, "n1", "结果页应闭环回首页");
  assert.equal(forN3.label, "返回首页");
  const forN2 = suggestions.find((s) => s.source === "n2");
  assert.ok(forN2, "死路详情页应有建议");
  assert.equal(forN2.target, "n3", "详情页应接到下一张界面");
});

test("AI 补线：有出口的界面不产生建议", () => {
  const nodes = [
    { id: "n1", type: "screen", title: "首页" },
    { id: "n2", type: "screen", title: "详情" },
  ];
  const edges = [
    { source: "n1", sourceHandle: "row1" },
    { source: "n2", sourceHandle: "back" },
  ];
  assert.deepEqual(suggestWires(nodes, edges), []);
});

test("AI 补线：单一界面不给自己连线", () => {
  const suggestions = suggestWires([{ id: "only", type: "screen", title: "成功页" }], []);
  assert.deepEqual(suggestions, []);
});

test("AI 计划容错：空文本 / 纯分隔符 → 空计划", () => {
  assert.deepEqual(planFlowFromText("").steps, []);
  const plan = planFlowFromText("→ → 、、");
  assert.equal(plan.steps.length, 0);
  const { pack } = buildAiPack(plan, "空");
  assert.equal(pack.nodes.length, 0);
});

test("AI 类型守卫：ScreenPack 结构与手工包同构（可进同一插入管线）", () => {
  const plan = planFlowFromText("首页 → 支付成功");
  const { pack }: { pack: ScreenPack } = buildAiPack(plan, "同构");
  assert.ok(Array.isArray(pack.nodes) && Array.isArray(pack.edges));
  assert.ok(pack.nodes.every((n) => typeof n.x === "number" && typeof n.y === "number"));
});

test("AI 空白锚点：画布为空时落在原点", () => {
  assert.deepEqual(findBlankAnchor([], { width: 500, height: 200 }), { x: 0, y: 0 });
});

test("AI 空白锚点：现有内容右侧有空间 → 放右侧并留间隔", () => {
  const anchor = findBlankAnchor([{ x: 0, y: 0, width: 1000, height: 800 }], { width: 3000, height: 300 });
  assert.equal(anchor.x, 1160, " maxX 1000 + GAP 160");
  assert.equal(anchor.y, 0, "与现有内容顶对齐");
  // 不重叠
  assert.ok(anchor.x >= 1000 + 160);
});

test("AI 空白锚点：右侧超限时放下方", () => {
  const anchor = findBlankAnchor(
    [{ x: 18000, y: 0, width: 3000, height: 500 }],
    { width: 4000, height: 300 },
  );
  assert.equal(anchor.y, 660, "maxY 500 + GAP 160");
  assert.ok(anchor.x + 4000 <= 22000, "x 仍在现有内容范围内（下方布局）");
});

test("AI 空白锚点：多节点取包围盒", () => {
  const anchor = findBlankAnchor(
    [
      { x: 100, y: 100, width: 320, height: 500 },
      { x: 700, y: 300, width: 240, height: 100 },
    ],
    { width: 2000, height: 400 },
  );
  assert.equal(anchor.x, 700 + 240 + 160, "取整个包围盒右缘");
  assert.equal(anchor.y, 100, "取整个包围盒顶缘");
});
