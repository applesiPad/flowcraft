import assert from "node:assert/strict";
import test from "node:test";
import { initialEdges, initialNodes } from "../src/flow/sample.ts";

test("电商示例的每条连线都指向实际存在的节点", () => {
  const ids = new Set(initialNodes.map((node) => node.id));
  const dangling = initialEdges
    .filter((edge) => !ids.has(edge.source) || !ids.has(edge.target))
    .map((edge) => ({ id: edge.id, source: edge.source, target: edge.target }));
  assert.deepEqual(dangling, []);
});

test("示例包含完整的主路径与分支闭环", () => {
  assert.equal(initialNodes.length, 13);
  assert.equal(initialEdges.length, 17);
  assert.deepEqual(initialNodes.slice(0, 2).map((node) => node.id), ["n-home", "n-doctors"]);
  assert.equal(initialEdges.find((edge) => edge.id === "e1")?.source, "n-home");
  // 医保/自费两条分支都汇合到挂号成功，排队判断回环到排队页
  assert.equal(initialEdges.find((edge) => edge.id === "e8")?.target, "n-success");
  assert.equal(initialEdges.find((edge) => edge.id === "e13")?.target, "n-queue");
});

test("示例保持横向主路径与下方分支分区", () => {
  const byId = new Map(initialNodes.map((node) => [node.id, node]));
  const main = ["n-home", "n-doctors", "n-form", "n-confirm", "n-success", "n-queue"].map((id) => byId.get(id));
  assert.deepEqual(main.map((node) => node?.position.y), [100, 100, 100, 100, 100, 100]);
  assert.deepEqual(main.map((node) => node?.position.x), [80, 680, 1280, 1880, 3080, 3680]);
  // 判断 / 动作节点与备注都在主路径下方
  assert.equal(byId.get("d-insurance")?.position.y, 820);
  assert.equal(byId.get("d-queue-status")?.position.y, 820);
  assert.equal(byId.get("a-send-sms")?.position.y, 820);
  assert.equal(byId.get("note-insurance")?.position.y, 1300);
});