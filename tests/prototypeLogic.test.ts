import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edge, Node } from "@xyflow/react";
import {
  evaluateCondition,
  firstValidationError,
  normalizeCondition,
  pickDecisionHandle,
  resolveFlowTarget,
  validateInputValue,
} from "../src/flow/prototypeLogic.ts";
import type { ScreenData } from "../src/flow/types.ts";

test("normalizeCondition: 非法输入返回 null", () => {
  assert.equal(normalizeCondition(null), null);
  assert.equal(normalizeCondition("x"), null);
  assert.equal(normalizeCondition({}), null);
  assert.equal(normalizeCondition({ variable: "  " }), null);
  assert.deepEqual(normalizeCondition({ variable: " phone " }), { variable: "phone", op: "==", value: "" });
  assert.deepEqual(normalizeCondition({ variable: "amount", op: ">", value: 100 }), {
    variable: "amount",
    op: ">",
    value: "",
  });
});

test("evaluateCondition: 数值比较优先于字符串比较", () => {
  const vars = { amount: "128", empty: "" };
  assert.equal(evaluateCondition({ variable: "amount", op: ">", value: "100" }, vars), true);
  assert.equal(evaluateCondition({ variable: "amount", op: ">", value: "1000" }, vars), false);
  // "9" > "128" 按字符串比较为假、按数值比较为真 —— 必须走数值
  assert.equal(evaluateCondition({ variable: "amount", op: ">", value: "9" }, vars), true);
  assert.equal(evaluateCondition({ variable: "amount", op: "==", value: "128" }, vars), true);
  assert.equal(evaluateCondition({ variable: "amount", op: "!=", value: "128" }, vars), false);
  assert.equal(evaluateCondition({ variable: "amount", op: "<=", value: "128" }, vars), true);
  assert.equal(evaluateCondition({ variable: "amount", op: ">=", value: "128" }, vars), true);
});

test("evaluateCondition: 字符串回退与非数值", () => {
  const vars = { level: "vip" };
  assert.equal(evaluateCondition({ variable: "level", op: "==", value: "vip" }, vars), true);
  assert.equal(evaluateCondition({ variable: "level", op: "!=", value: "svip" }, vars), true);
  // 缺失变量按空字符串
  assert.equal(evaluateCondition({ variable: "missing", op: "==", value: "" }, vars), true);
  assert.equal(evaluateCondition({ variable: "missing", op: "==", value: "x" }, vars), false);
});

test("evaluateCondition: empty / notEmpty", () => {
  const vars = { phone: "  ", code: "123" };
  assert.equal(evaluateCondition({ variable: "phone", op: "empty" }, vars), true);
  assert.equal(evaluateCondition({ variable: "phone", op: "notEmpty" }, vars), false);
  assert.equal(evaluateCondition({ variable: "code", op: "notEmpty" }, vars), true);
  assert.equal(evaluateCondition({ variable: "gone", op: "empty" }, vars), true);
});

test("pickDecisionHandle: 无条件默认走是，有条件按求值", () => {
  assert.equal(pickDecisionHandle({ title: "d" }, {}), "yes");
  assert.equal(
    pickDecisionHandle({ title: "d", condition: { variable: "phone", op: "notEmpty" } }, { phone: "13800000000" }),
    "yes",
  );
  assert.equal(pickDecisionHandle({ title: "d", condition: { variable: "phone", op: "notEmpty" } }, {}), "no");
  // 非法条件等价于无条件
  assert.equal(pickDecisionHandle({ title: "d", condition: { variable: "", op: "==" } as never }, {}), "yes");
});

/** 合成图：n-in → d-cond (yes→n-a / no→n-b) → a-out → n-c */
function fixture(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    { id: "n-in", type: "screen", position: { x: 0, y: 0 }, data: { title: "入口" } },
    { id: "d-cond", type: "decision", position: { x: 0, y: 0 }, data: { title: "已登录?", condition: { variable: "phone", op: "notEmpty" } } },
    { id: "a-do", type: "action", position: { x: 0, y: 0 }, data: { title: "动作" } },
    { id: "n-a", type: "screen", position: { x: 0, y: 0 }, data: { title: "界面A" } },
    { id: "n-b", type: "screen", position: { x: 0, y: 0 }, data: { title: "界面B" } },
    { id: "n-c", type: "screen", position: { x: 0, y: 0 }, data: { title: "界面C" } },
    { id: "d-loop", type: "decision", position: { x: 0, y: 0 }, data: { title: "自环" } },
  ];
  const edges: Edge[] = [
    { id: "e1", source: "n-in", sourceHandle: "go", target: "d-cond", targetHandle: "in" },
    { id: "e2", source: "d-cond", sourceHandle: "yes", target: "n-a", targetHandle: "in" },
    { id: "e3", source: "d-cond", sourceHandle: "no", target: "a-do", targetHandle: "in" },
    { id: "e4", source: "a-do", sourceHandle: "out", target: "n-b", targetHandle: "in" },
    { id: "e5", source: "n-a", sourceHandle: "next", target: "n-c", targetHandle: "in" },
    { id: "e6", source: "d-loop", sourceHandle: "yes", target: "d-loop", targetHandle: "in" },
  ];
  return { nodes, edges };
}

test("resolveFlowTarget: 条件成立走是分支，不成立穿透动作节点", () => {
  const { nodes, edges } = fixture();
  assert.equal(resolveFlowTarget("d-cond", nodes, edges, { phone: "13800000000" }), "n-a");
  assert.equal(resolveFlowTarget("d-cond", nodes, edges, {}), "n-b");
  assert.equal(resolveFlowTarget("n-a", nodes, edges, {}), "n-a");
});

test("resolveFlowTarget: 缺出口 / 未知节点 / 死环返回 null", () => {
  const { nodes, edges } = fixture();
  assert.equal(resolveFlowTarget("n-x", nodes, edges, {}), null);
  assert.equal(resolveFlowTarget("d-loop", nodes, edges, {}), null);
  const broken = nodes.filter((n) => n.id !== "d-cond");
  assert.equal(resolveFlowTarget("d-cond", broken, edges, {}), null);
});

test("validateInputValue: 所有规则都要求非空，phone 校验 11 位", () => {
  assert.equal(validateInputValue(undefined, "", "手机号"), null);
  assert.equal(validateInputValue("required", "", "手机号"), "请填写「手机号」");
  assert.equal(validateInputValue("phone", "", "手机号"), "请填写「手机号」");
  assert.equal(validateInputValue("phone", "123", "手机号"), "「手机号」需要 11 位手机号");
  assert.equal(validateInputValue("phone", "13800000000", "手机号"), null);
  assert.equal(validateInputValue("number", "12a", "金额"), "「金额」需要填写数字");
  assert.equal(validateInputValue("number", " 42 ", "金额"), null);
  assert.equal(validateInputValue("required", " x ", "手机号"), null);
});

test("firstValidationError: 只看有变量名的 input，按元素顺序报第一条", () => {
  const screen = {
    title: "登录",
    elements: [
      { id: "e-code", kind: "input", label: "验证码", name: "code" },
      { id: "e-btn", kind: "button", label: "登录" },
      { id: "e-phone", kind: "input", label: "手机号", name: "phone", validation: "phone" },
      { id: "e-noval", kind: "input", label: "备注", validation: "required" },
    ],
  } as unknown as ScreenData;
  assert.deepEqual(firstValidationError(screen, {}), { elId: "e-phone", message: "请填写「手机号」" });
  assert.deepEqual(firstValidationError(screen, { "e-phone": "123" }), { elId: "e-phone", message: "「手机号」需要 11 位手机号" });
  assert.equal(firstValidationError(screen, { "e-phone": "13800000000" }), null);
});
