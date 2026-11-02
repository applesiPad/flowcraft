import assert from "node:assert/strict";
import { test } from "node:test";
import type { Node } from "@xyflow/react";
import { debugVarEntries, formatTrail, varSourceMap, type TrailStep } from "../src/flow/previewDebug.ts";

const screenNode = (id: string, title: string, elements: Record<string, unknown>[]): Node => ({
  id,
  type: "screen",
  position: { x: 0, y: 0 },
  data: { title, elements },
});

test("变量来源表：变量名 → 界面标题（只有带变量名的输入框参与）", () => {
  const nodes = [
    screenNode("a", "登录", [
      { id: "e1", kind: "input", name: "phone", label: "手机号" },
      { id: "e2", kind: "input", label: "没有变量名" },
      { id: "e3", kind: "button", tone: "primary", label: "登录" },
    ]),
    screenNode("b", "验证码", [{ id: "e4", kind: "input", name: "code", label: "验证码" }]),
    { id: "d", type: "decision", position: { x: 0, y: 0 }, data: { title: "判断" } },
  ];
  const map = varSourceMap(nodes);
  assert.deepEqual(map, { phone: "登录", code: "验证码" });
});

test("变量表面板行：按变量名排序，值与来源对齐", () => {
  const rows = debugVarEntries({ code: "888888", phone: "13800000000" }, { phone: "登录", code: "验证码" });
  assert.deepEqual(
    rows.map((r) => r.name),
    ["code", "phone"],
  );
  assert.equal(rows[0].value, "888888");
  assert.equal(rows[0].source, "验证码");
  // 来源缺失兜底
  const orphan = debugVarEntries({ ghost: "" }, {});
  assert.equal(orphan[0].source, "未知界面");
  assert.equal(orphan[0].value, "");
});

test("走查轨迹格式化：起点 + 每步经由文案", () => {
  const steps: TrailStep[] = [
    { screenId: "a", title: "登录", via: null },
    { screenId: "b", title: "工作台", via: "点击「登录」" },
    { screenId: "c", title: "支付成功", via: "点击「去支付」（是）" },
  ];
  assert.equal(formatTrail(steps), "登录 →[点击「登录」]→ 工作台 →[点击「去支付」（是）]→ 支付成功");
  assert.equal(formatTrail([]), "");
  // 缺失 via 的兜底与空标题回退到 id
  const fallback = formatTrail([
    { screenId: "x1", title: "", via: null },
    { screenId: "x2", title: "", via: null },
  ]);
  assert.equal(fallback, "x1 →[?]→ x2");
});
