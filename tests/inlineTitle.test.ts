import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeTitleInput } from "../src/flow/inlineTitle.ts";

test("标题净化：正常文案 trim 后提交", () => {
  assert.equal(sanitizeTitleInput("  购物车  ", "旧标题"), "购物车");
});

test("标题净化：连续空白折叠为单空格", () => {
  assert.equal(sanitizeTitleInput("首页  →   登录", "旧标题"), "首页 → 登录");
});

test("标题净化：纯空白/空串视为放弃（回退原标题）", () => {
  assert.equal(sanitizeTitleInput("", "旧标题"), null);
  assert.equal(sanitizeTitleInput("   ", "旧标题"), null);
  assert.equal(sanitizeTitleInput("　", "旧标题"), null);
});

test("标题净化：与原标题相同返回 null（跳过提交，不产生撤销记录）", () => {
  assert.equal(sanitizeTitleInput("旧标题", "旧标题"), null);
  assert.equal(sanitizeTitleInput(" 旧标题 ", "旧标题"), null);
});

test("标题净化：全角空格只被 trim、内部保留", () => {
  assert.equal(sanitizeTitleInput("　支付成功　", "旧"), "支付成功");
  // 全角空格不在 \s 折叠范围（JS \s 含 \u3000，内部全角空格同样折叠）
  assert.equal(sanitizeTitleInput("支付　成功", "旧"), "支付 成功");
});
