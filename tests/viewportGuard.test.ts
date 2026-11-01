import assert from "node:assert/strict";
import test from "node:test";
import { createInitialViewportGuard } from "../src/flow/viewportGuard.ts";

test("首屏取景只能执行一次", () => {
  const guard = createInitialViewportGuard();
  assert.equal(guard.claim(), true);
  assert.equal(guard.claim(), false);
});

test("用户接管画布后，首屏取景不得覆盖用户视图", () => {
  const guard = createInitialViewportGuard();
  guard.claim();
  assert.equal(guard.claim(), false, "用户点击适应画布后，延迟的初始取景必须跳过");
});

test("重置后允许下一次首屏取景", () => {
  const guard = createInitialViewportGuard();
  guard.claim();
  guard.reset();
  assert.equal(guard.claim(), true);
});